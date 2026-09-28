from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text, inspect
from sqlalchemy.exc import OperationalError, SQLAlchemyError
import logging
import time
from app.db.session import Base,engine
from app.models import models
from app.api.routes import router
from app.core.config import settings

app=FastAPI(title='Marimba Organizer API',version='0.1.0')

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

app.add_middleware(CORSMiddleware,allow_origins=[x.strip() for x in settings.cors_origins.split(',')],allow_credentials=True,allow_methods=['*'],allow_headers=['*'])
app.include_router(router,prefix='/api')
@app.get('/')

def root(): return {
    'message':'Marimba Organizer API','docs':'/docs'
}

# Se ejecuta al final: la funcion ya esta definida y la app arranca igual.
_relax_person_name_uniqueness()