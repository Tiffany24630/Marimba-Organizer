from datetime import datetime, timezone
from sqlalchemy import (String, Text, DateTime, ForeignKey, Integer, JSON,
                        UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base

def now(): return datetime.now(timezone.utc)

class User(Base):
    """
    Fase 7C - cuenta de usuario.

    `password_hash` NUNCA se serializa hacia la API: las rutas usan
    `public_user()`, que elige explicitamente los campos.
    """
    __tablename__='users'

    id:Mapped[int]=mapped_column(primary_key=True)
    name:Mapped[str]=mapped_column(String(120))
    # Se guarda ya normalizado en minusculas; el UNIQUE real se crea en la
    # migracion (UNIQUE sobre una columna normalizada).
    email:Mapped[str]=mapped_column(String(255),index=True,unique=True)
    password_hash:Mapped[str]=mapped_column(String(255))
    # 'admin' | 'user'. Un usuario normal NO puede tocar este campo: solo la
    # ruta de administracion lo escribe, y nunca acepta el rol del cuerpo.
    role:Mapped[str]=mapped_column(String(20),default='user')
    active:Mapped[bool]=mapped_column(default=True)
    # Obliga a cambiar la clave en el proximo inicio de sesion. Se usa para la
    # credencial inicial del usuario tecnico de migracion.
    must_change_password:Mapped[bool]=mapped_column(default=False)
    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),default=now)
    updated_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),default=now,onupdate=now)

    projects=relationship('Project',back_populates='owner')


class Session(Base):
    """
    Sesion opaca guardada en el servidor.

    Se guarda unicamente la HUELLA del token, no el token: una filtracion de
    esta tabla no permite suplantar a nadie.
    """
    __tablename__='sessions'

    id:Mapped[int]=mapped_column(primary_key=True)
    user_id:Mapped[int]=mapped_column(ForeignKey('users.id',ondelete='CASCADE'),index=True)
    token_hash:Mapped[str]=mapped_column(String(64),index=True)
    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),default=now)
    expires_at:Mapped[datetime]=mapped_column(DateTime(timezone=True))
    revoked:Mapped[bool]=mapped_column(default=False)


class PasswordResetToken(Base):
    """
    Token de recuperacion de contrasena: un solo uso y con caducidad.

    Al igual que la sesion, solo se guarda la huella SHA-256 del token.
    """
    __tablename__='password_reset_tokens'

    id:Mapped[int]=mapped_column(primary_key=True)
    user_id:Mapped[int]=mapped_column(ForeignKey('users.id',ondelete='CASCADE'),index=True)
    token_hash:Mapped[str]=mapped_column(String(64),index=True)
    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),default=now)
    expires_at:Mapped[datetime]=mapped_column(DateTime(timezone=True))
    used_at:Mapped[datetime|None]=mapped_column(DateTime(timezone=True),nullable=True)


class ProjectCollaborator(Base):
    """
    Fase 7D - colaborador de un proyecto.

    El PROPIETARIO no aparece aqui: su permiso se deduce de `Project.owner_id`.
    Asi no existen dos fuentes de verdad ni filas redundantes.

    `role` esta restringido a 'editor' o 'reader' por validacion en la API (no
    se acepta texto arbitrario). La unicidad de (project_id, user_id) la
    impone la base, no solo el codigo.
    """
    __tablename__='project_collaborators'
    __table_args__=(UniqueConstraint('project_id','user_id',
                                     name='ux_collab_project_user'),)

    id:Mapped[int]=mapped_column(primary_key=True)
    project_id:Mapped[int]=mapped_column(
        ForeignKey('projects.id',ondelete='CASCADE'),index=True)
    user_id:Mapped[int]=mapped_column(
        ForeignKey('users.id',ondelete='CASCADE'),index=True)
    role:Mapped[str]=mapped_column(String(20),default='reader')
    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),default=now)
    updated_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),default=now,onupdate=now)


class AuditLog(Base):
    """
    Fase 7D - registro de acciones persistentes.

    Solo se guardan ACCIONES que modifican datos guardados, no los movimientos
    temporales del lienzo. Nunca se escriben contrasenas, tokens, cookies ni
    hashes: `details` es JSON y se filtra antes de persistirlo.
    """
    __tablename__='audit_log'

    id:Mapped[int]=mapped_column(primary_key=True)
    project_id:Mapped[int|None]=mapped_column(
        ForeignKey('projects.id',ondelete='CASCADE'),nullable=True,index=True)
    # Quien ejecuto la accion: el usuario AUTENTICADO, no el propietario.
    actor_user_id:Mapped[int|None]=mapped_column(
        ForeignKey('users.id',ondelete='SET NULL'),nullable=True,index=True)
    action:Mapped[str]=mapped_column(String(50),index=True)
    entity_type:Mapped[str|None]=mapped_column(String(40))
    entity_id:Mapped[str|None]=mapped_column(String(40))
    details:Mapped[dict|None]=mapped_column(JSON,nullable=True)
    created_at:Mapped[datetime]=mapped_column(
        DateTime(timezone=True),default=now,index=True)


class Project(Base):
    __tablename__='projects'

    id:Mapped[int]=mapped_column(primary_key=True)
    name:Mapped[str]=mapped_column(String(200))
    description:Mapped[str|None]=mapped_column(Text)
    source_filename:Mapped[str|None]=mapped_column(String(255))
    # Fase 7C: propietario. NULL solo es posible durante la migracion o en
    # instalaciones antiguas sin migrar; toda ruta privada exige propietario.
    owner_id:Mapped[int|None]=mapped_column(
        ForeignKey('users.id',ondelete='RESTRICT'),nullable=True,index=True)
    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),default=now)
    updated_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),default=now,onupdate=now)

    owner=relationship('User',back_populates='projects')
    songs=relationship('Song',back_populates='project',cascade='all, delete-orphan')
    compositions=relationship('Composition',back_populates='project',cascade='all, delete-orphan')

class Person(Base):
    __tablename__='people'

    id:Mapped[int]=mapped_column(primary_key=True)
    # UX-4: SIN unique global. La unicidad es POR PROYECTO y se valida en
    # `POST /people` contra las participaciones del proyecto actual. Con
    # `unique=True` en la base, dos proyectos distintos no podían tener a la
    # misma persona (homonimos), por mas que la ruta lo permitiera.
    name:Mapped[str]=mapped_column(String(200),index=True)
    active:Mapped[bool]=mapped_column(default=True)
    # Proyecto al que pertenece la persona. `NULL` = persona del catalogo global
    # (compartida, normalmente creada por la importacion de un Excel). Con esta
    # columna la unicidad POR PROYECTO es real y no depende de que la persona ya
    # tenga una asignacion musical: antes dos altas identicas en el mismo
    # proyecto pasaban el chequeo si nadie estaba asignado todavia.
    project_id:Mapped[int|None]=mapped_column(
        ForeignKey('projects.id',ondelete='CASCADE'),nullable=True,index=True)

class Position(Base):
    __tablename__='positions'
    
    id:Mapped[int]=mapped_column(primary_key=True)
    name:Mapped[str]=mapped_column(String(100),unique=True)

class Song(Base):
    __tablename__='songs'

    id:Mapped[int]=mapped_column(primary_key=True)
    project_id:Mapped[int]=mapped_column(ForeignKey('projects.id',ondelete='CASCADE'))
    name:Mapped[str]=mapped_column(String(200))
    order_index:Mapped[int]=mapped_column(Integer,default=0)

    project=relationship('Project',back_populates='songs')
    assignments=relationship('SongAssignment',back_populates='song',cascade='all, delete-orphan')

class SongAssignment(Base):
    __tablename__='song_assignments'

    id:Mapped[int]=mapped_column(primary_key=True)
    song_id:Mapped[int]=mapped_column(ForeignKey('songs.id',ondelete='CASCADE'))
    person_id:Mapped[int]=mapped_column(ForeignKey('people.id'))
    position_id:Mapped[int]=mapped_column(ForeignKey('positions.id'))
    mark:Mapped[str]=mapped_column(String(20),default='X')

    song=relationship('Song',back_populates='assignments')
    person=relationship('Person')
    position=relationship('Position')

class MarimbaTemplate(Base):
    __tablename__='marimba_templates'
    
    id:Mapped[int]=mapped_column(primary_key=True)
    name:Mapped[str]=mapped_column(String(100),unique=True)
    description:Mapped[str|None]=mapped_column(Text)
    positions:Mapped[list]=mapped_column(JSON,default=list,nullable=False)

class PublicCompositionLink(Base):
    """
    Fase 9E - enlace publico de SOLO LECTURA a una composicion.

    Es una capacidad INDEPENDIENTE del rol `reader`: aqui no hay usuario, ni
    sesion, ni cuentas. Es un token opaco del que solo conoce quien recibe el
    enlace.

    Decisiones de seguridad:

    - Se guarda la HUELLA del token (`token_fingerprint`), no el token. Es la
      misma convencion que ya usan `Session` y `PasswordResetToken`: si esta
      tabla se filtra, NO permite publicar nada, porque el atacante necesitaria
      el token en claro. La URL solo existe mientras se la muestra a quien la
      pidio.
    - El token lo genera `security.new_token()` (`secrets.token_urlsafe(32)`),
      criptografico e impredecible. NUNCA se deriva de `composition_id`: si lo
      fuera, bastaria probar 1, 2, 3... y publicar cualquier composicion.
    - `revoked_at` en vez de un booleano: permite revocar sin borrar y saber
      cuando. Revocar NO destruye la composicion ni su historial de 9C.
    - `CASCADE` desde la composicion: si se borra la composicion, el enlace
      deja de existir por completo y no queda una fila huerfana.
    - `UNIQUE (composition_id)`: hay como mucho UN enlace por composicion. Asi
      no puede haber dos tokens activos para el mismo recurso, que es
      justamente lo que permitiria adivinar si uno se filtra.
    - No se guarda caducidad automatica: no se pidio y anadirla seria una
      decision de producto, no de seguridad.
    - 9G: caducidad OPCIONAL (`expires_at`, UTC, nullable). `None` = sin
      caducidad (comportamiento 9E intacto). `expires_at <= now` = expirado:
      el GET publico responde 404 indistinguible del inexistente/revocado.
      Es fecha absoluta, nunca TTL en texto libre; la validacion es en
      servidor y `expires_at` jamas aparece en la proyeccion publica.
    """
    __tablename__='public_composition_links'
    __table_args__=(UniqueConstraint('composition_id',
                                      name='uq_public_link_composition'),)

    id:Mapped[int]=mapped_column(primary_key=True)
    composition_id:Mapped[int]=mapped_column(
        ForeignKey('compositions.id',ondelete='CASCADE'),index=True)
    # SHA-256 del token. El token en claro jamas se persiste.
    token_hash:Mapped[str]=mapped_column(String(64),index=True)
    created_by_user_id:Mapped[int|None]=mapped_column(
        ForeignKey('users.id',ondelete='SET NULL'),nullable=True,index=True)
    created_at:Mapped[datetime]=mapped_column(
        DateTime(timezone=True),default=now)
    revoked_at:Mapped[datetime|None]=mapped_column(
        DateTime(timezone=True),nullable=True,index=True)
    # 9G: caducidad OPCIONAL en UTC. `None` = sin caducidad (9E intacto).
    expires_at:Mapped[datetime|None]=mapped_column(
        DateTime(timezone=True),nullable=True,index=True)

    composition=relationship('Composition',back_populates='public_links')
    author=relationship('User')


class Composition(Base):
    __tablename__='compositions'

    id:Mapped[int]=mapped_column(primary_key=True)
    project_id:Mapped[int]=mapped_column(ForeignKey('projects.id',ondelete='CASCADE'))
    song_id:Mapped[int|None]=mapped_column(ForeignKey('songs.id',ondelete='SET NULL'),nullable=True)
    name:Mapped[str]=mapped_column(String(200))
    width:Mapped[int]=mapped_column(Integer,default=1600)
    height:Mapped[int]=mapped_column(Integer,default=900)
    data:Mapped[dict]=mapped_column(JSON,default=dict,nullable=False)
    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),default=now)
    updated_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),default=now,onupdate=now)

    project=relationship('Project',back_populates='compositions')
    versions=relationship('CompositionVersion',back_populates='composition',
                          cascade='all, delete-orphan')
    # 9E: CASCADE ORM (igual que `versions`, ver 9C). En SQLite el `ondelete`
    # de la FK no se aplica sin `PRAGMA foreign_keys`, asi que SIN esta
    # relacion el borrado de la composicion dejaria la fila del enlace viva
    # (se comprobo con un test fallido antes de anadirla).
    public_links=relationship('PublicCompositionLink',back_populates='composition',
                              cascade='all, delete-orphan')



class CompositionVersion(Base):
    """
    Fase 9C - version historica e INMUTABLE de una composicion.

    Es deliberadamente distinto del `history`/`future` del store del navegador:
    aquel vive en memoria y se pierde al recargar (evidencia en
    `store/composition.ts`: `setElements` hace `history:[], future:[]`). Este es
    el UNICO sitio donde un estado guardado sobrevive a cerrar la pestana.

    Decisiones:

    - El snapshot es AUTOCONTENIDO: guarda `name`, `width`, `height` y `data`
      (los mismos campos que `Composition`). Guardar solo `data` dejaria la
      restauracion incompleta si el nombre o el tamano hubieran cambiado.
    - Es INMUTABLE: no hay ninguna ruta que la modifique ni la borre. Restaurar
      NO la toca; crea una version nueva con el estado previo (ver `routes.py`).
    - `version_number` es monotono POR COMPOSICION (1, 2, 3...). No se reutiliza
      ningun numero, ni aunque se borre una fila: el borrado no existe como
      operacion de API.
    - La unicidad la impone la BASE (`UNIQUE (composition_id, version_number)`),
      no solo el codigo: dos peticiones simultaneas no pueden sacar el mismo
      numero aunque ambas calculen `max+1`.
    - `created_by_user_id` es `SET NULL`: si un dia se borrara un usuario, la
      version sigue existiendo. No es `CASCADE` a proposito: perder una version
      historica seria peor que perder el nombre de quien la creo.
    """
    __tablename__='composition_versions'
    __table_args__=(UniqueConstraint('composition_id','version_number',
                                     name='uq_composition_versions_number'),)

    id:Mapped[int]=mapped_column(primary_key=True)
    composition_id:Mapped[int]=mapped_column(
        ForeignKey('compositions.id',ondelete='CASCADE'),index=True)
    version_number:Mapped[int]=mapped_column(Integer)
    snapshot:Mapped[dict]=mapped_column(JSON,default=dict,nullable=False)
    created_by_user_id:Mapped[int|None]=mapped_column(
        ForeignKey('users.id',ondelete='SET NULL'),nullable=True,index=True)
    created_at:Mapped[datetime]=mapped_column(
        DateTime(timezone=True),default=now,index=True)

    composition=relationship('Composition',back_populates='versions')
    author=relationship('User')
