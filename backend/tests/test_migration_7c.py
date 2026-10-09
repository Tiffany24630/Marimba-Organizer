"""
Fase 7C - prueba de la migracion de propiedad sobre una BASE AISLADA.

Objetivo: demostrar que la migracion es NO DESTRUCTIVA e IDEMPOTENTE antes de
tocar la base real, sin tocar la base real.

Se crea una base SQLite temporal con 65 proyectos y 9 plantillas (simulando el
historico), se ejecuta la migracion real de `main.py` y se comprueba que nada
se pierde y que los 65 proyectos pasan a un usuario NORMAL de prueba.

La contrasena del usuario de migracion se toma del entorno de ESTA prueba,
nunca del codigo ni del repositorio.
"""
import os
import subprocess
import sys
import tempfile
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

EMAIL_MIGRACION = 'historico@marimba.local'


def _ruta_db():
    return Path(tempfile.mkdtemp(prefix='migracion7c_')) / 'migracion_test.db'


def _preparar(dbf: Path, pw: str) -> None:
    """Crea una base con el historico simulado: 65 proyectos y 9 plantillas."""
    script = f'''
import os, sys
sys.path.insert(0, {str(BACKEND)!r})
os.environ['DATABASE_URL'] = 'sqlite:///' + {str(dbf)!r}
os.environ['MAIL_PROVIDER'] = 'console'
os.environ['PBKDF2_ITERATIONS'] = '2000'

import app.db.session as dbs
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
engine = create_engine('sqlite:///' + {str(dbf)!r}, future=True)
dbs.engine = engine
dbs.SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False,
                                future=True)
from app.db.session import Base
import app.models.models
from app.models import (Project, Person, Position, Song, SongAssignment,
                        Composition, MarimbaTemplate)
Base.metadata.create_all(bind=engine)
db = dbs.SessionLocal()
pos = Position(name='Primera'); db.add(pos); db.commit(); db.refresh(pos)
for i in range(65):
    p = Project(name='Historico %d' % (i + 1)); db.add(p)
    db.commit(); db.refresh(p)
    s = Song(project_id=p.id, name='Cancion %d' % (i + 1), order_index=0)
    db.add(s); db.commit(); db.refresh(s)
    pe = Person(name='Persona %d' % (i + 1), project_id=p.id)
    db.add(pe); db.commit(); db.refresh(pe)
    db.add(SongAssignment(song_id=s.id, person_id=pe.id, position_id=pos.id))
    db.add(Composition(project_id=p.id, song_id=s.id, name='Comp %d' % (i + 1),
                       width=1600, height=900, data={{'elements': []}}))
    db.commit()
for i in range(9):
    db.add(MarimbaTemplate(name='Plantilla %d' % (i + 1),
                           description='desc %d' % (i + 1),
                           positions=['Primera', 'Segunda', 'Centro']))
db.commit()
db.close()
print('PREPARADO')
'''
    r = subprocess.run([sys.executable, '-c', script], capture_output=True,
                       text=True)
    assert r.returncode == 0, r.stderr[-2000:]
    assert 'PREPARADO' in r.stdout


def _migrar(dbf: Path, pw: str, usar_pw: bool = True):
    """Ejecuta la migracion REAL de main.py contra la base temporal."""
    pw_literal = repr(pw) if usar_pw else "''"
    script = f'''
import os, sys
sys.path.insert(0, {str(BACKEND)!r})
os.environ['DATABASE_URL'] = 'sqlite:///' + {str(dbf)!r}
os.environ['MAIL_PROVIDER'] = 'console'
os.environ['PBKDF2_ITERATIONS'] = '2000'
os.environ['MIGRATION_USER_PASSWORD'] = {pw_literal}
os.environ['MIGRATION_USER_EMAIL'] = {EMAIL_MIGRACION!r}

import app.db.session as dbs
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
engine = create_engine('sqlite:///' + {str(dbf)!r}, future=True)
dbs.engine = engine
dbs.SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False,
                                future=True)
import app.main as main
main.engine = engine
# Se ejecuta SOLO la migracion de 7C, sin arrancar el servidor.
main._migrate_ownership()
print('MIGRACION OK')
'''
    env = {k: v for k, v in os.environ.items()
           if k != 'MIGRATION_USER_PASSWORD'}
    return subprocess.run([sys.executable, '-c', script], capture_output=True,
                          text=True, env=env)


def _n(dbf: Path, sql: str) -> int:
    from sqlalchemy import create_engine, text
    e = create_engine('sqlite:///' + str(dbf))
    with e.connect() as c:
        return c.execute(text(sql)).scalar()

def test_migracion_asigna_los_65_proyectos_sin_perder_nada():
    dbf = _ruta_db()
    pw = os.environ.get('MIGRATION_USER_PASSWORD') or 'ClaveDeMigracionLocal1'
    _preparar(dbf, pw)
    # Antes de migrar: 65 proyectos y 9 plantillas.
    assert _n(dbf, 'SELECT COUNT(*) FROM projects') == 65
    assert _n(dbf, 'SELECT COUNT(*) FROM marimba_templates') == 9
    assert _n(dbf, 'SELECT COUNT(*) FROM projects WHERE owner_id IS NULL') == 65

    # Se ejecuta DOS veces: debe ser idempotente.
    for _ in (1, 2):
        r = _migrar(dbf, pw)
        assert r.returncode == 0, r.stderr[-2000:]

    # Ningun dato se perdio.
    assert _n(dbf, 'SELECT COUNT(*) FROM projects') == 65
    assert _n(dbf, 'SELECT COUNT(*) FROM songs') == 65
    assert _n(dbf, 'SELECT COUNT(*) FROM compositions') == 65
    assert _n(dbf, 'SELECT COUNT(*) FROM people') == 65
    # Plantillas intactas: ni una mas, ni una menos.
    assert _n(dbf, 'SELECT COUNT(*) FROM marimba_templates') == 9
    assert _n(dbf, "SELECT COUNT(*) FROM marimba_templates "
                   "WHERE name='Plantilla 1' AND description='desc 1'") == 1
    # Los 65 proyectos tienen dueno, y son del MISMO usuario.
    assert _n(dbf, 'SELECT COUNT(*) FROM projects WHERE owner_id IS NULL') == 0
    assert _n(dbf, 'SELECT COUNT(DISTINCT owner_id) FROM projects') == 1
    # Ese usuario es NORMAL, no administrador. Y es el unico: dos
    # ejecuciones no crean dos cuentas.
    assert _n(dbf, "SELECT COUNT(*) FROM users WHERE role='user'") == 1
    assert _n(dbf, "SELECT COUNT(*) FROM users WHERE role='admin'") == 0
    assert _n(dbf, 'SELECT COUNT(*) FROM users') == 1
    # Copia de seguridad para revertir sin restaurar la base entera.
    assert _n(dbf, 'SELECT COUNT(*) FROM _bak_projects_7c') == 65


def test_migracion_no_abre_una_segunda_conexion_durante_la_transaccion():
    """
    7F - regresion del bloqueo en PostgreSQL.

    La migracion abriia un `SessionLocal()` aparte para insertar el usuario,
    mientras la transaccion del `CREATE UNIQUE INDEX` seguia abierta. En
    PostgreSQL esa segunda conexion se quedaba esperando indefinidamente (lock
    ACCESS EXCLUSIVE sobre `users`) y la migracion no terminaba nunca: los 65
    proyectos se quedaban sin dueno. En SQLite no se reproducia.

    Esta prueba comprueba la CAUSA, no el efecto: dentro de `_migrate_
    ownership` no debe haber ninguna apertura de sesion propia. Con ella
    vuelve a aparecer, y el fallo reaparece solo al desplegar.
    """
    import inspect
    import re
    import app.main as main
    src = inspect.getsource(main._migrate_ownership)
    # Se inspecciona SOLO el codigo, sin comentarios ni cadenas: el comentario
    # que explica el defecto nombra `SessionLocal()` a proposito, y una cadena
    # de texto no ejecuta nada.
    codigo = '\n'.join(re.sub(r'#.*$', '', linea)
                       for linea in src.splitlines())
    llamadas = re.findall(r'\bSessionLocal\s*\(', codigo)
    assert not llamadas, (
        'la migracion no debe abrir una sesion aparte: en PostgreSQL se '
        'bloquea contra su propia transaccion')
    # Y el INSERT debe ir por la conexion de la transaccion, no por otra.
    assert 'RETURNING id' in codigo


def test_sin_contrasena_configurada_no_se_inventa_ninguna_cuenta():
    """Sin `MIGRATION_USER_PASSWORD` no se crea usuario ni se asigna dueno."""
    dbf = _ruta_db()
    pw = os.environ.get('MIGRATION_USER_PASSWORD') or 'ClaveDeMigracionLocal1'
    _preparar(dbf, pw)
    _migrar(dbf, pw, usar_pw=False)
    # Ningun usuario creado, ningun dueno inventado, datos intactos.
    assert _n(dbf, 'SELECT COUNT(*) FROM users') == 0
    assert _n(dbf, 'SELECT COUNT(*) FROM projects WHERE owner_id IS NULL') == 65
    assert _n(dbf, 'SELECT COUNT(*) FROM projects') == 65
    assert _n(dbf, 'SELECT COUNT(*) FROM marimba_templates') == 9
def _n(dbf: Path, sql: str) -> int:
    from sqlalchemy import create_engine, text
    e = create_engine('sqlite:///' + str(dbf))
    with e.connect() as c:
        return c.execute(text(sql)).scalar()


def _migrar_7d(dbf: Path):
    """Ejecuta SOLO la migracion de colaboracion contra la base temporal."""
    script = f'''
import os, sys
sys.path.insert(0, {str(BACKEND)!r})
os.environ['DATABASE_URL'] = 'sqlite:///' + {str(dbf)!r}
os.environ['PBKDF2_ITERATIONS'] = '2000'
import app.db.session as dbs
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
engine = create_engine('sqlite:///' + {str(dbf)!r}, future=True)
dbs.engine = engine
dbs.SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False,
                                future=True)
import app.main as main
main.engine = engine
main._migrate_collaboration()
print('OK')
'''
    return subprocess.run([sys.executable, '-c', script], capture_output=True,
                          text=True)


def _n(dbf: Path, sql: str) -> int:
    from sqlalchemy import create_engine, text
    e = create_engine('sqlite:///' + str(dbf))
    with e.connect() as c:
        return c.execute(text(sql)).scalar()


def _migrar_7d(dbf: Path):
    """Ejecuta SOLO la migracion de colaboracion contra la base temporal."""
    script = f'''
import os, sys
sys.path.insert(0, {str(BACKEND)!r})
os.environ['DATABASE_URL'] = 'sqlite:///' + {str(dbf)!r}
os.environ['PBKDF2_ITERATIONS'] = '2000'
import app.db.session as dbs
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
engine = create_engine('sqlite:///' + {str(dbf)!r}, future=True)
dbs.engine = engine
dbs.SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False,
                                future=True)
import app.main as main
main.engine = engine
main._migrate_collaboration()
print('OK')
'''
    return subprocess.run([sys.executable, '-c', script], capture_output=True,
                          text=True)


def test_migracion_de_colaboracion_es_idempotente_y_no_toca_datos():
    """7D: crea las tablas nuevas sin alterar proyectos ni plantillas."""
    dbf = _ruta_db()
    pw = os.environ.get('MIGRATION_USER_PASSWORD') or 'ClaveDeMigracionLocal1'
    _preparar(dbf, pw)
    # `create_all` del ORM ya crea las tablas de 7D en una base NUEVA. Para
    # reproducir el caso real (instalacion existente que no las tiene) se
    # eliminan: es lo que encontrara la migracion en produccion.
    from sqlalchemy import create_engine, text
    e = create_engine('sqlite:///' + str(dbf))
    with e.begin() as c:
        c.execute(text('DROP TABLE IF EXISTS project_collaborators'))
        c.execute(text('DROP TABLE IF EXISTS audit_log'))
    assert _n(dbf, "SELECT COUNT(*) FROM sqlite_master WHERE type='table' "
                   "AND name='project_collaborators'") == 0
    assert _n(dbf, "SELECT COUNT(*) FROM sqlite_master WHERE type='table' "
                   "AND name='audit_log'") == 0

    owners_antes = _n(dbf, 'SELECT COUNT(*) FROM projects WHERE owner_id IS NOT NULL')
    # Se ejecuta DOS veces: la segunda no debe duplicar nada.
    for _ in (1, 2):
        r = _migrar_7d(dbf)
        assert r.returncode == 0, r.stderr[-1500:]

    # Tablas creadas.
    assert _n(dbf, "SELECT COUNT(*) FROM sqlite_master WHERE type='table' "
                   "AND name='project_collaborators'") == 1
    assert _n(dbf, "SELECT COUNT(*) FROM sqlite_master WHERE type='table' "
                   "AND name='audit_log'") == 1
    # Indices sin duplicar.
    assert _n(dbf, "SELECT COUNT(*) FROM sqlite_master WHERE type='index' "
                   "AND name='ux_collab_project_user'") == 1
    assert _n(dbf, "SELECT COUNT(*) FROM sqlite_master WHERE type='index' "
                   "AND name='ix_collab_user_id'") == 1
    assert _n(dbf, "SELECT COUNT(*) FROM sqlite_master WHERE type='index' "
                   "AND name='ix_audit_project'") == 1
    # Datos intactos: mismos conteos que en 7C.
    assert _n(dbf, 'SELECT COUNT(*) FROM projects') == 65
    assert _n(dbf, 'SELECT COUNT(*) FROM marimba_templates') == 9
    assert _n(dbf, 'SELECT COUNT(*) FROM songs') == 65
    assert _n(dbf, 'SELECT COUNT(*) FROM compositions') == 65
    assert _n(dbf, 'SELECT COUNT(*) FROM people') == 65
    # Y los owners NO se han tocado.
    assert _n(dbf, 'SELECT COUNT(*) FROM projects WHERE owner_id IS NOT NULL') \
        == owners_antes
    # Las tablas nuevas empiezan vacias: no se inventa colaboracion.
    assert _n(dbf, 'SELECT COUNT(*) FROM project_collaborators') == 0
    assert _n(dbf, 'SELECT COUNT(*) FROM audit_log') == 0


def test_el_unico_de_proyecto_y_usuario_impide_duplicados():
    """La base, no solo el codigo, impide colaboradores repetidos."""
    dbf = _ruta_db()
    pw = os.environ.get('MIGRATION_USER_PASSWORD') or 'ClaveDeMigracionLocal1'
    _preparar(dbf, pw)
    _migrar_7d(dbf)
    # Se usa el ORM del proyecto: `created_at`/`updated_at` los rellena el
    # modelo, y lo que se quiere poner a prueba es el UNIQUE, no los defaults.
    script = f'''
import os, sys
sys.path.insert(0, {str(BACKEND)!r})
os.environ['DATABASE_URL'] = 'sqlite:///' + {str(dbf)!r}
os.environ['PBKDF2_ITERATIONS'] = '2000'
import app.db.session as dbs
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import IntegrityError
engine = create_engine('sqlite:///' + {str(dbf)!r}, future=True)
dbs.engine = engine
dbs.SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False,
                                future=True)
from app.models import Project, User, ProjectCollaborator
db = dbs.SessionLocal()
pid = db.query(Project.id).order_by(Project.id).first()[0]
u = User(name='Colab', email='colab@x.com', password_hash='x', role='user',
         active=True, must_change_password=False)
db.add(u); db.commit(); db.refresh(u)
db.add(ProjectCollaborator(project_id=pid, user_id=u.id, role='reader'))
db.commit()
fallo = False
try:
    db.add(ProjectCollaborator(project_id=pid, user_id=u.id, role='editor'))
    db.commit()
except IntegrityError:
    fallo = True
    db.rollback()
print('FALLO' if fallo else 'NO_FALLO')
db.close()
'''
    r = subprocess.run([sys.executable, '-c', script], capture_output=True,
                       text=True)
    assert r.returncode == 0, r.stderr[-1500:]
    assert 'FALLO' in r.stdout, 'la base debe rechazar el duplicado'
    assert _n(dbf, 'SELECT COUNT(*) FROM project_collaborators') == 1
