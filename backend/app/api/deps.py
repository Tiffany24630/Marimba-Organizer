"""
Fases 7C/7D - autenticacion, autorizacion y control de acceso.

Regla central: TODA ruta privada depende de `require_user` y todo recurso con
identificador se resuelve a traves de una funcion que comprueba el ACCESO, no
la mera existencia del id. Conocer un id ajeno devuelve 404, no 403: asi no se
revela ni siquiera la existencia del recurso.

Fase 7D anade la colaboracion: `get_project_access` es la fuente UNICA de
verdad sobre si un usuario es owner, editor, reader o nada.
"""
import logging
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.config import SESSION_TTL
from app.core.security import new_token, token_fingerprint
from app.models import (User, Session as UserSession, Project, Song,
                        Composition, Person, ProjectCollaborator, AuditLog)

log = logging.getLogger(__name__)

SESSION_COOKIE = 'marimba_session'
CSRF_COOKIE = 'marimba_csrf'

# Metodos que cambian estado: exigen cabecera anti-CSRF ademas de la cookie.
UNSAFE_METHODS = {'POST', 'PUT', 'PATCH', 'DELETE'}


def normalize_email(raw) -> str:
    """Minusculas y sin espacios. Es la clave de unicidad de la cuenta."""
    if not isinstance(raw, str):
        return ''
    return raw.strip().lower()


def public_user(u: User) -> dict:
    """
    Representacion publica de un usuario.

    Se eligen los campos uno a uno a proposito: anadir `password_hash` al
    modelo no puede convertirlo en una fuga por accidente.
    """
    return {'id': u.id, 'name': u.name, 'email': u.email, 'role': u.role,
            'active': bool(u.active),
            'must_change_password': bool(u.must_change_password),
            'created_at': u.created_at.isoformat() if u.created_at else None}


def is_admin(u: User) -> bool:
    return u.role == 'admin' and bool(u.active)


def _unauthorized() -> HTTPException:
    # Mensaje generico: no distingue "no hay cookie" de "cookie caducada".
    return HTTPException(401, 'Sesion no valida o caducada. Inicia sesion de nuevo.')


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """
    Resuelve el usuario de la cookie de sesion.

    Comprueba, en este orden: cookie presente, sesion no revocada, no caducada,
    usuario activo. Cualquier fallo -> 401.
    """
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise _unauthorized()
    sess = (db.query(UserSession)
            .filter(UserSession.token_hash == token_fingerprint(token))
            .first())
    if not sess or sess.revoked:
        raise _unauthorized()
    exp = sess.expires_at
    if exp is not None:
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp <= datetime.now(timezone.utc):
            raise _unauthorized()
    user = db.get(User, sess.user_id)
    # Una cuenta desactivada no puede seguir operando aunque su sesion siga viva.
    if not user or not user.active:
        raise _unauthorized()
    return user


def require_user(user: User = Depends(current_user)) -> User:
    return user


def require_admin(user: User = Depends(current_user)) -> User:
    if not is_admin(user):
        # 403: aqui si es correcto, quien llama ya sabe que existe la seccion.
        raise HTTPException(403, 'Se requiere cuenta de administrador.')
    return user


def check_admin(request: Request, user: User = Depends(current_user)) -> User:
    """
    Administrador + proteccion anti-CSRF, para operaciones de escritura.

    `check_csrf` por si solo no basta: un usuario normal autenticado tambien
    pasaria la comprobacion del token. Aqui se exige rol Y CSRF a la vez.
    """
    check_csrf(request, user)
    if not is_admin(user):
        raise HTTPException(403, 'Se requiere cuenta de administrador.')
    return user


def check_csrf(request: Request, user: User = Depends(current_user)) -> User:
    """
    Proteccion anti-CSRF para peticiones que cambian estado.

    La sesion viaja en cookie, asi que un formulario de otro sitio podria
    disparar un POST. Se exige una cabecera `X-CSRF-Token` que coincida con la
    cookie `marimba_csrf`, que el navegador no expone a otros origenes.
    """
    if request.method.upper() in UNSAFE_METHODS:
        sent = request.headers.get('X-CSRF-Token') or ''
        expected = request.cookies.get(CSRF_COOKIE) or ''
        if not sent or not expected or sent != expected:
            raise HTTPException(403, 'Falta la proteccion anti-CSRF.')
    return user


def issue_session(db: Session, user: User) -> tuple[str, str, datetime]:
    """
    Crea una sesion. Devuelve (token, token_csrf, caducidad).

    El token en claro solo existe aqui: a la base va unicamente su huella
    SHA-256, de modo que una filtracion de esa tabla no permite suplantar.
    """
    token = new_token()
    csrf = new_token()
    expires = datetime.now(timezone.utc) + SESSION_TTL
    db.add(UserSession(user_id=user.id, token_hash=token_fingerprint(token),
                       expires_at=expires))
    db.commit()
    return token, csrf, expires


def revoke_session(db: Session, token: str) -> None:
    sess = (db.query(UserSession)
            .filter(UserSession.token_hash == token_fingerprint(token)).first())
    if sess and not sess.revoked:
        sess.revoked = True
        db.commit()


def revoke_user_sessions(db: Session, user_id: int) -> int:
    """Cierra todas las sesiones del usuario (tras cambiar la contrasena)."""
    n = (db.query(UserSession)
         .filter(UserSession.user_id == user_id,
                 UserSession.revoked.is_(False))
         .update({'revoked': True}))
    db.commit()
    return n


# --- Control de acceso a proyectos (Fase 7D) -----------------------------
#
# Fuente UNICA de verdad: `get_project_access`. Devuelve 'owner', 'editor',
# 'reader' o 'none'. Toda ruta pasa por aqui: no hay comprobaciones de
# propietario dispersas por el codigo.
#
# El propietario se deduce de `Project.owner_id` y NUNCA aparece como
# colaborador, de modo que no puede haber dos verdades en contradiccion.

ACCESS_OWNER='owner'
ACCESS_EDITOR='editor'
ACCESS_READER='reader'
ACCESS_NONE='none'

# Un reader puede consultar; editor y owner tambien.
READ_LEVELS={ACCESS_OWNER,ACCESS_EDITOR,ACCESS_READER}
# Un reader NO escribe. Solo owner y editor.
WRITE_LEVELS={ACCESS_OWNER,ACCESS_EDITOR}
# Solo el propietario: compartir, eliminar, cambiar permisos.
OWNER_LEVELS={ACCESS_OWNER}


def get_project_access(pid,user:User,db:Session)->str:
    """
    Nivel de acceso de `user` sobre el proyecto `pid`.

    No lanza excepciones: responde 'none' si el proyecto no existe o el usuario
    no tiene relacion con el. Quien quiera el recurso usa `readable_project`,
    `writable_project` u `ownable_project`, que si traducen 'none' en 404 para
    no revelar la existencia del proyecto.
    """
    if pid is None:
        return ACCESS_NONE
    p = db.get(Project, pid)
    if p is None:
        return ACCESS_NONE
    if p.owner_id == user.id:
        return ACCESS_OWNER
    row = (db.query(ProjectCollaborator)
           .filter(ProjectCollaborator.project_id == pid,
                   ProjectCollaborator.user_id == user.id).first())
    if row is None:
        return ACCESS_NONE
    return row.role if row.role in (ACCESS_EDITOR, ACCESS_READER) else ACCESS_NONE


def _project_with_level(pid:int,user:User,db:Session,levels:set,msg:str)->Project:
    if get_project_access(pid,user,db) not in levels:
        # 404 y no 403: no se confirma siquiera que el proyecto existe.
        raise HTTPException(404,msg)
    return db.get(Project, pid)


def readable_project(pid:int,user:User,db:Session)->Project:
    """Proyecto que el usuario puede CONSULTAR (owner, editor o reader)."""
    return _project_with_level(pid,user,db,READ_LEVELS,'El proyecto no existe.')


def writable_project(pid:int,user:User,db:Session)->Project:
    """Proyecto que el usuario puede MODIFICAR (owner o editor)."""
    return _project_with_level(pid,user,db,WRITE_LEVELS,'El proyecto no existe.')


def ownable_project(pid:int,user:User,db:Session)->Project:
    """Proyecto que el usuario ADMINISTRA (solo el propietario)."""
    return _project_with_level(pid,user,db,OWNER_LEVELS,'El proyecto no existe.')


def require_write_user(request:Request,user:User=Depends(current_user))->User:
    """Usuario autenticado que ademas puede escribir (CSRF comprobado)."""
    check_csrf(request,user)
    return user


def _song_with_access(song_id:int,user:User,db:Session,levels:set,msg:str)->Song:
    """Resuelve la cancion y verifica acceso a SU proyecto (evita IDOR)."""
    s = db.get(Song, song_id)
    if s is None or get_project_access(s.project_id,user,db) not in levels:
        raise HTTPException(404,msg)
    return s


def _composition_with_access(cid:int,user:User,db:Session,levels:set,
                             msg:str)->Composition:
    """Igual que `_song_with_access`, para composiciones."""
    c = db.get(Composition, cid)
    if c is None or get_project_access(c.project_id,user,db) not in levels:
        raise HTTPException(404,msg)
    return c


# --- Compatibilidad: nombres ya usados por las rutas ----------------------
# `owned_*` pasan a permitir tambien a colaboradores con permiso de escritura.
# Se conservan los nombres para no duplicar logica ni romper rutas existentes.

def owned_project(pid:int,user:User,db:Session)->Project:
    """Permiso de ESCRITURA sobre el proyecto."""
    return writable_project(pid,user,db)


def owner_project(pid:int,user:User,db:Session)->Project:
    """
    7E - el proyecto es SOLO de su propietario.

    `owned_project` significa "escribible", asi que un `editor` tambien lo
    cumple. Eso es correcto para el contenido del proyecto, pero NO para
    operaciones sobre el proyecto en si (borrarlo, o administrar sus
    colaboradores), donde el unico autorizado es el propietario. Esta
    dependencia existe para que esas rutas no dependan de leer bien el nombre
    `owned_*`.
    """
    return _project_with_level(pid,user,db,('owner',),'El proyecto no existe.')


def owned_song(song_id:int,user:User,db:Session)->Song:
    """Cancion de un proyecto que el usuario puede ESCRIBIR."""
    return _song_with_access(song_id,user,db,WRITE_LEVELS,'La cancion no existe.')


def owned_composition(cid:int,user:User,db:Session)->Composition:
    """Composicion de un proyecto que el usuario puede ESCRIBIR."""
    return _composition_with_access(cid,user,db,WRITE_LEVELS,
                                    'La composicion no existe.')


def readable_song(song_id:int,user:User,db:Session)->Song:
    """Cancion que el usuario puede CONSULTAR."""
    return _song_with_access(song_id,user,db,READ_LEVELS,'La cancion no existe.')


def readable_composition(cid:int,user:User,db:Session)->Composition:
    """Composicion que el usuario puede CONSULTAR."""
    return _composition_with_access(cid,user,db,READ_LEVELS,
                                    'La composicion no existe.')


def owned_person(pid:int,user:User,db:Session)->Person:
    """
    Persona de un proyecto que el usuario puede ESCRIBIR, o del catalogo global
    (`project_id` NULL), que por diseno del proyecto es compartido.
    """
    p = (db.query(Person).join(Project, Person.project_id == Project.id)
         .filter(Person.id == pid).first())
    if p is not None:
        if get_project_access(p.project_id,user,db) not in WRITE_LEVELS:
            raise HTTPException(404,'La persona no existe.')
        return p
    p = db.query(Person).filter(Person.id == pid,
                                Person.project_id.is_(None)).first()
    if not p:
        raise HTTPException(404,'La persona no existe.')
    return p


def project_ids_for_user(db:Session,user:User)->dict:
    """
    Mapa {project_id: nivel} de todo lo que el usuario puede consultar.

    Se resuelve con DOS consultas (propios + compartidos), no una por proyecto:
    el dashboard lo llama una vez y se evita el N+1.
    """
    ids={}
    # `db.query(Project.id)` devuelve filas (Row), no enteros: se toma el
    # primer elemento de cada una.
    for fila in db.query(Project.id).filter(
            Project.owner_id==user.id).all():
        ids[fila[0]]=ACCESS_OWNER
    for pid,role in (db.query(ProjectCollaborator.project_id,
                              ProjectCollaborator.role)
                     .join(User, ProjectCollaborator.user_id==User.id)
                     .filter(ProjectCollaborator.user_id==user.id,
                             User.active.is_(True)).all()):
        # Una colaboracion NUNCA pisa la propiedad del usuario.
        if pid not in ids:
            ids[pid]=role
    return ids


# Claves que nunca pueden guardarse en el detalle de auditoria.
_SECRET_KEYS={'password','new_password','current_password','password_hash',
              'token','csrf','cookie','secret','authorization'}


def _sanitize(details):
    """Elimina del detalle cualquier clave que pudiera contener un secreto."""
    if not details:
        return None
    return {k:('***' if str(k).lower() in _SECRET_KEYS else v)
            for k,v in details.items()}


def record_audit(db:Session,user,project_id,action:str,entity_type=None,
                 entity_id=None,details=None) -> None:
    """
    Anota una accion persistente.

    Best-effort con intencion: si la auditoria falla, la operacion principal NO
    se tumba (el usuario no perderia su trabajo por un registro), pero el fallo
    queda en el log del servidor.
    """
    try:
        db.add(AuditLog(project_id=project_id,
                        actor_user_id=(user.id if user else None),
                        action=action,entity_type=entity_type,
                        entity_id=(str(entity_id) if entity_id is not None else None),
                        details=_sanitize(details)))
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        log.exception('No se pudo registrar el evento de auditoria %s', action)



def owned_project_ids(db: Session, user: User) -> list[int]:
    """Ids de proyectos del usuario, para filtrar listados completos."""
    return [r[0] for r in
            db.query(Project.id).filter(Project.owner_id == user.id).all()]

