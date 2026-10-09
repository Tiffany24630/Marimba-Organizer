from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text, inspect
from sqlalchemy.exc import OperationalError, SQLAlchemyError
import logging
import time
from app.db.session import Base,engine
from app.models import models
from app.api.routes import router
from app.api.auth_routes import router as auth_router
from app.api.collab_routes import router as collab_router
from app.api.public_routes import router as public_router
from app.core.config import settings

log = logging.getLogger(__name__)

app=FastAPI(title='Marimba Organizer API',version='0.1.0')

# --- Fase 7G: CORS realmente registrado ---------------------------------
# El middleware se importaba pero NUNCA se añadia a la aplicacion, asi que
# ninguna peticion del navegador podia cruzar al backend: el preflight OPTIONS
# devolvia 405 y el login terminaba en `ERR_FAILED`. Las pruebas de API no lo
# detectan (TestClient va al mismo proceso, sin CORS de por medio); solo se ve
# desde un navegador de verdad.
#
# `allow_credentials=True` es obligatorio: la sesion viaja en cookie HttpOnly.
# Sin el, el navegador no envia ninguna credencial y el usuario tendria que
# entrar otra vez en cada peticion.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(',')
                   if o.strip()],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
    # Fase 9J: el E2E verifica `Retry-After` del 429 desde el navegador.
    # Sin exponerla, `fetch` la oculta (CORS) aunque el backend la envie.
    expose_headers=['Retry-After'],
)
log.info('CORS habilitado para: %s', settings.cors_origins)

def wait_for_db(retries:int=30,delay:float=2.0)->None:
    for attempt in range(1,retries+1):
        try:
            with engine.connect() as conn:
                conn.execute(text('SELECT 1'))

            return

        except OperationalError:
            if attempt==retries:
                raise
            
            time.sleep(delay)

wait_for_db()
if not settings.schema_managed_externally:
    Base.metadata.create_all(bind=engine)


def _relax_person_name_uniqueness():
    """
    Elimina la constraint global `people.name` de instalaciones ya creadas.

    `create_all()` nunca hace ALTER sobre tablas existentes, asi que una base
    creada antes de UX-4 conserva `people_name_key UNIQUE` y seguiria rechazando
    homonimos aunque el modelo ya no la declare. Es idempotente y no destructiva:
    solo quita el indice unico, nunca borra filas.
    """
    insp = inspect(engine)
    if 'people' not in insp.get_table_names():
        return
    cols = {(c.get('name') or '') for c in insp.get_columns('people')}
    uniq = {(u.get('name') or '') for u in insp.get_unique_constraints('people')}
    uniq |= {(i.get('name') or '') for i in insp.get_indexes('people') if i.get('unique')}
    # Hay algo que hacer si falta la columna nueva o si sigue el indice unico.
    unico_en_name = any('people' in n and 'name' in n for n in uniq) or any(
        i.get('unique') and i.get('column_names') == ['name']
        for i in insp.get_indexes('people'))
    if 'project_id' in cols and not unico_en_name:
        # Esquema ya actualizado: no se toca la tabla.
        return
    try:
        with engine.begin() as conn:
            dialect = engine.dialect.name
            if dialect == 'postgresql':
                conn.execute(text('ALTER TABLE people DROP CONSTRAINT IF EXISTS people_name_key'))
                if 'project_id' not in cols:
                    conn.execute(text('ALTER TABLE people ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE'))
                    conn.execute(text('CREATE INDEX IF NOT EXISTS ix_people_project_id ON people (project_id)'))
            elif dialect == 'sqlite':
                # SQLite no soporta DROP CONSTRAINT: hay que recrear la tabla.
                # Solo se hace si de verdad hay un indice unico sobre `name`;
                # si solo falta la columna, un simple ALTER TABLE alcanza.
                unico_sqlite = any(i.get('unique') and i.get('column_names') == ['name']
                                   for i in insp.get_indexes('people'))
                if unico_sqlite:
                    conn.execute(text('PRAGMA foreign_keys=OFF'))
                    conn.execute(text('DROP TABLE IF EXISTS people__ux4'))
                    conn.execute(text(
                        'CREATE TABLE people__ux4 ('
                        'id INTEGER NOT NULL, name VARCHAR(200) NOT NULL, '
                        'active BOOLEAN NOT NULL, project_id INTEGER, '
                        'PRIMARY KEY (id), '
                        'FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE)'))
                    conn.execute(text('INSERT INTO people__ux4 (id, name, active, project_id) '
                                      'SELECT id, name, active, NULL FROM people'))
                    conn.execute(text('DROP TABLE people'))
                    conn.execute(text('ALTER TABLE people__ux4 RENAME TO people'))
                    conn.execute(text('PRAGMA foreign_keys=ON'))
                if 'project_id' not in cols:
                    conn.execute(text('ALTER TABLE people ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE'))
                conn.execute(text(
                    'CREATE INDEX IF NOT EXISTS ix_people_name ON people (name)'))
                conn.execute(text(
                    'CREATE INDEX IF NOT EXISTS ix_people_project_id ON people (project_id)'))
            else:
                conn.execute(text('ALTER TABLE people DROP INDEX IF EXISTS people_name_key'))
    except SQLAlchemyError:
        # Nunca debe impedir arrancar: se loguea y la app sigue con el esquema actual.
        logging.getLogger(__name__).warning(
            'No se pudo relajar la unicidad de people.name', exc_info=True)

def _migrate_ownership():
    """
    Fase 7C - anade `projects.owner_id` y crea el usuario tecnico de migracion.

    Politicas aplicadas:

    * NUNCA es destructiva: solo anade columnas, crea indices y actualiza
      `owner_id`. No borra ni reescribe filas de proyectos, personas ni
      composiciones. Los ids, nombres y relaciones se conservan intactos.
    * Es IDEMPOTENTE: se puede ejecutar varias veces sin efecto adicional.
    * No inventa un propietario: si no hay contrasena de migracion configurada
      en el entorno, NO crea la cuenta y los proyectos quedan con
      `owner_id` NULL, que ninguna ruta privada acepta. Es preferible a
      inventar un dueño arbitrario.
    * Las plantillas NO se tocan: siguen siendo catalogo global compartido.
    """
    import os
    from app.core.config import settings
    from app.core.security import hash_password

    insp = inspect(engine)
    tables = set(insp.get_table_names())
    dialect = engine.dialect.name
    try:
        with engine.begin() as conn:
            # 1) Columna de propiedad en proyectos (nullable: no rompe filas).
            if 'projects' in tables:
                cols = {(c.get('name') or '') for c in insp.get_columns('projects')}
                if 'owner_id' not in cols:
                    conn.execute(text(
                        'ALTER TABLE projects ADD COLUMN owner_id INTEGER '
                        'REFERENCES users(id) ON DELETE RESTRICT'))
                conn.execute(text(
                    'CREATE INDEX IF NOT EXISTS ix_projects_owner_id '
                    'ON projects (owner_id)'))
            # 2) Unicidad de correo, sobre el valor ya normalizado.
            if 'users' in tables:
                conn.execute(text(
                    'CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email '
                    'ON users (email)'))
            # 3) Copias de seguridad antes de tocar datos (7C.3).
            if 'projects' in tables and 'owner_id' in {
                    (c.get('name') or '') for c in insp.get_columns('projects')}:
                huerfanos = conn.execute(text(
                    'SELECT COUNT(*) FROM projects WHERE owner_id IS NULL'
                )).scalar() or 0
                if huerfanos:
                    # Copia verificable: permite volver atras sin restaurar
                    # un backup completo de la base.
                    conn.execute(text('DROP TABLE IF EXISTS _bak_projects_7c'))
                    conn.execute(text(
                        'CREATE TABLE _bak_projects_7c AS '
                        'SELECT id, name FROM projects WHERE owner_id IS NULL'))
                    log.info('Copia de seguridad de %s proyectos sin dueño: '
                             '_bak_projects_7c', huerfanos)

            # 4) Usuario tecnico NORMAL, solo si hay contrasena en el entorno.
            password = os.environ.get('MIGRATION_USER_PASSWORD', '') or \
                settings.migration_user_password
            if 'users' in tables and password:
                email = settings.migration_user_email.strip().lower()
                uid = conn.execute(
                    text('SELECT id FROM users WHERE email = :e'),
                    {'e': email}).scalar()
                if uid is None:
                    # 7F - el INSERT usa la MISMA conexion y la MISMA
                    # transaccion que el resto de la migracion.
                    #
                    # Antes se abria un `SessionLocal()` aparte. En SQLite no
                    # se notaba, pero en PostgreSQL esa segunda conexion se
                    # quedaba ESPERANDO de forma indefinida: el
                    # `CREATE UNIQUE INDEX` de mas arriba toma un lock
                    # ACCESS EXCLUSIVE sobre `users` y lo retiene hasta el
                    # commit, asi que el INSERT sobre `users` de la otra
                    # conexion nunca podia llegar a ejecutarse. La migracion se
                    # quedaba colgada indefinidamente y los proyectos seguian
                    # sin dueno.
                    #
                    # Se escribe SQL a proposito (y no el ORM) porque las
                    # columnas `created_at` y `updated_at` son NOT NULL: se
                    # rellenan aqui, que es lo que haria el modelo. Y, al
                    # compartir transaccion, o se crea el usuario y se asignan
                    # los proyectos, o no se hace nada.
                    uid = conn.execute(
                        text('INSERT INTO users '
                             '(name, email, password_hash, role, active, '
                             'must_change_password, created_at, updated_at) '
                             'VALUES (:n, :e, :h, :r, true, true, '
                             'CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) '
                             'RETURNING id'),
                        {'n': settings.migration_user_name,
                         'e': email,
                         'h': hash_password(password),
                         'r': 'user'}).scalar()
                    log.info('Usuario tecnico de migracion creado: %s', email)
                # 5) Asignacion de los proyectos historicos a ese usuario.
                if uid is not None:
                    res = conn.execute(text(
                        'UPDATE projects SET owner_id = :u '
                        'WHERE owner_id IS NULL'), {'u': uid})
                    log.info('Proyectos historicos asignados a %s (%s)',
                             email, res.rowcount)
            elif 'users' in tables and not password:
                # Aviso claro: es preferible a inventar un propietario.
                log.warning(
                    'MIGRATION_USER_PASSWORD no esta definida: NO se crea el '
                    'usuario tecnico ni se asignan los proyectos historicos. '
                    'Define esa variable de entorno y reinicia para completar '
                    'la migracion.')
    except SQLAlchemyError:
        log.error('Fallo la migracion de propiedad 7C', exc_info=True)


def _migrate_collaboration():
    """
    Fase 7D - crea `project_collaborators` y `audit_log` si no existen.

    NO toca proyectos ni plantillas: solo anade tablas nuevas e indices. Es
    idempotente (se puede ejecutar mil veces) y nunca destructiva.
    """
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    if not {'projects', 'users'} <= tables:
        return
    try:
        with engine.begin() as conn:
            # Tabla de colaboradores. El UNIQUE (project_id, user_id) lo impone
            # la base, no solo el codigo: evita dobles por carrera.
            conn.execute(text(
                'CREATE TABLE IF NOT EXISTS project_collaborators ('
                'id INTEGER PRIMARY KEY, '
                'project_id INTEGER NOT NULL REFERENCES projects(id) '
                'ON DELETE CASCADE, '
                'user_id INTEGER NOT NULL REFERENCES users(id) '
                'ON DELETE CASCADE, '
                'role VARCHAR(20) NOT NULL DEFAULT \'reader\', '
                # CURRENT_TIMESTAMP es el equivalente SQL del default del modelo:
                # sin el, cualquier INSERT directo fallaria por NOT NULL.
                'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, '
                'updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)'))
            conn.execute(text(
                'CREATE UNIQUE INDEX IF NOT EXISTS ux_collab_project_user '
                'ON project_collaborators (project_id, user_id)'))
            conn.execute(text(
                'CREATE INDEX IF NOT EXISTS ix_collab_user_id '
                'ON project_collaborators (user_id)'))
            # Tabla de auditoria.
            conn.execute(text(
                'CREATE TABLE IF NOT EXISTS audit_log ('
                'id INTEGER PRIMARY KEY, '
                'project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE, '
                'actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, '
                'action VARCHAR(50) NOT NULL, '
                'entity_type VARCHAR(40), entity_id VARCHAR(40), '
                'details JSON, '
                'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)'))
            conn.execute(text(
                'CREATE INDEX IF NOT EXISTS ix_audit_project '
                'ON audit_log (project_id)'))
            conn.execute(text(
                'CREATE INDEX IF NOT EXISTS ix_audit_action ON audit_log (action)'))
    except SQLAlchemyError:
        log.error('Fallo la migracion de colaboracion 7D', exc_info=True)


def _migrate_public_link_expiry():
    """
    Fase 9G - anade `public_composition_links.expires_at` si no existe.

    Idempotente y no destructiva: solo ALTER ADD COLUMN nullable + indice.
    Las filas 9E existentes quedan con `expires_at = NULL` = sin caducidad,
    conservando tokens, hashes y URLs. Nunca toca produccion directamente:
    corre sobre el motor configurado, igual que las migraciones 7C/7D.
    """
    insp = inspect(engine)
    if 'public_composition_links' not in insp.get_table_names():
        return
    try:
        with engine.begin() as conn:
            cols = {(c.get('name') or '')
                    for c in insp.get_columns('public_composition_links')}
            if 'expires_at' not in cols:
                conn.execute(text(
                    'ALTER TABLE public_composition_links '
                    'ADD COLUMN expires_at TIMESTAMP'))
            conn.execute(text(
                'CREATE INDEX IF NOT EXISTS ix_public_link_expires '
                'ON public_composition_links (expires_at)'))
    except SQLAlchemyError:
        log.error('Fallo la migracion de caducidad 9G', exc_info=True)


def _apply_schema_updates():
    """Aplica las migraciones idempotentes pendientes, en orden."""
    _relax_person_name_uniqueness()
    _migrate_ownership()
    _migrate_collaboration()
    _migrate_public_link_expiry()

app.include_router(router,prefix='/api')
# Fase 7C: autenticacion y administracion, en su propio router pero bajo /api.
app.include_router(auth_router,prefix='/api')
# Fase 7D: colaboracion y auditoria de proyectos.
app.include_router(collab_router,prefix='/api')
# 9E: enlace publico de solo lectura. Router aparte a proposito: sus permisos
# NO son los de una ruta privada, y mezclarlos facilitaria abrir por error el
# editor a un visitante sin sesion.
app.include_router(public_router,prefix='/api')


@app.get('/')

def root(): return {
    'message':'Marimba Organizer API','docs':'/docs'
}

# Las instalaciones locales mantienen las migraciones históricas idempotentes.
# En producción, `SCHEMA_MANAGED_EXTERNALLY=true` exige que Alembic haya
# preparado el esquema antes de arrancar y evita cambios de DDL en startup.
if not settings.schema_managed_externally:
    _apply_schema_updates()
