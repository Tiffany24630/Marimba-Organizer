"""
Fase 7C - autenticacion, recuperacion de contrasena y administracion.

Decisiones:
  - La sesion viaja en cookie HttpOnly + SameSite, con un segundo token
    anti-CSRF. El frontend NO guarda el token de sesion en localStorage.
  - El login nunca revela si el correo existe: mismo mensaje en ambos casos.
  - La recuperacion responde SIEMPRE igual, exista o no la cuenta.
  - La contrasena nunca se devuelve ni se registra, ni a un administrador.
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.config import RESET_TTL, settings
from app.core.security import (hash_password, new_token, password_problem,
                               token_fingerprint, verify_password,
                               needs_rehash)
from app.models import User, PasswordResetToken
from app.api.deps import (SESSION_COOKIE, CSRF_COOKIE, current_user,
                          public_user, issue_session, revoke_session,
                          revoke_user_sessions, normalize_email,
                          require_admin)
from app.services import mailer

log = logging.getLogger(__name__)
router = APIRouter()

# Mensajes unicos: no permiten enumerar cuentas.
_LOGIN_ERROR = 'Correo o contrasena incorrectos.'
_RESET_MSG = ('Si ese correo tiene una cuenta, te hemos enviado un enlace para '
              'restablecer la contrasena.')


def _aware(dt):
    if dt is None:
        return datetime.now(timezone.utc)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _set_session_cookies(resp: Response, token: str, csrf: str, expires) -> None:
    # HttpOnly: el JavaScript de la pagina no puede leer el token de sesion.
    # SameSite=Lax: no se envia en peticiones originadas por otro sitio.
    # `max_age` en segundos, no `expires`: un datetime con zona horaria en
    # `expires` hace que algunos clientes HTTP (incluido el de pruebas) no
    # guarden la cookie, y la sesion pareceria iniciada sin estarlo.
    segundos = max(1, int(settings.session_ttl_minutes * 60))
    resp.set_cookie(SESSION_COOKIE, token, httponly=True,
                    secure=bool(settings.secure_cookies), samesite='lax',
                    max_age=segundos, path='/')
    # El token anti-CSRF SI se lee desde JS: es la defensa contra CSRF y por si
    # solo no sirve para autenticarse.
    resp.set_cookie(CSRF_COOKIE, csrf, httponly=False,
                    secure=bool(settings.secure_cookies), samesite='lax',
                    max_age=segundos, path='/')


def _clear_session_cookies(resp: Response) -> None:
    resp.delete_cookie(SESSION_COOKIE, path='/')
    resp.delete_cookie(CSRF_COOKIE, path='/')


@router.post('/auth/login')
def login(payload: dict, response: Response, request: Request,
          db: Session = Depends(get_db)):
    email = normalize_email(payload.get('email'))
    password = payload.get('password') or ''
    user = db.query(User).filter(User.email == email).first()
    if not user or not user.active or not verify_password(password, user.password_hash):
        # Mismo error para cuenta inexistente, desactivada o clave incorrecta.
        raise HTTPException(401, _LOGIN_ERROR)
    # Si el hash usa parametres antiguos, se moderniza ahora mismo.
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    token, csrf, expires = issue_session(db, user)
    _set_session_cookies(response, token, csrf, expires)
    return {'user': public_user(user), 'csrf_token': csrf}


@router.post('/auth/logout')
def logout(request: Request, response: Response,
           db: Session = Depends(get_db)):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        revoke_session(db, token)
    _clear_session_cookies(response)
    return {'ok': True}


@router.get('/auth/me')
def me(user: User = Depends(current_user)):
    return {'user': public_user(user)}


@router.post('/auth/change-password')
def change_password(payload: dict, request: Request, response: Response,
                    user: User = Depends(current_user),
                    db: Session = Depends(get_db)):
    """
    Cambio de contrasena del usuario autenticado.

    Exige la contrasena ACTUAL: sin ella, cualquiera que explorase el
    navegador podria cambiar la clave de la cuenta. Al cambiarla se revocan
    las demas sesiones abiertas y se renueva la actual.
    """
    current = payload.get('current_password') or ''
    new = payload.get('new_password') or ''
    if not verify_password(current, user.password_hash):
        raise HTTPException(400, 'La contrasena actual no es correcta.')
    problem = password_problem(new)
    if problem:
        raise HTTPException(400, problem)
    user.password_hash = hash_password(new)
    user.must_change_password = False
    db.commit()
    # Se invalidan las demas sesiones y esta se renueva.
    revoke_user_sessions(db, user.id)
    value, csrf, expires = issue_session(db, user)
    _set_session_cookies(response, value, csrf, expires)
    return {'user': public_user(user), 'csrf_token': csrf}


@router.post('/auth/forgot-password')
def forgot_password(payload: dict, db: Session = Depends(get_db)):
    """
    Inicia la recuperacion.

    La respuesta es SIEMPRE la misma: si el correo no existe, el usuario no
    puede enumerar cuentas. El correo solo se manda si el proveedor esta
    configurado de verdad; si no, se avisa al operador, no al solicitante.
    """
    email = normalize_email(payload.get('email'))
    user = db.query(User).filter(User.email == email,
                                 User.active.is_(True)).first()
    if user:
        ahora = datetime.now(timezone.utc)
        # Antiflujo de abuso: si ya hay un enlace vigente, no se genera otro.
        vigente = [t for t in (db.query(PasswordResetToken)
                               .filter(PasswordResetToken.user_id == user.id,
                                       PasswordResetToken.used_at.is_(None))
                               .all()) if _aware(t.expires_at) > ahora]
        if not vigente:
            token = new_token()
            db.add(PasswordResetToken(user_id=user.id,
                                      token_hash=token_fingerprint(token),
                                      expires_at=ahora + RESET_TTL))
            db.commit()
            try:
                if not mailer.send_reset_email(user.email, token):
                    log.warning('Proveedor sin entrega real (%s). Enlace en '
                                'modo consola.', user.email)
            except mailer.MailError:
                # El envio fallo. Al usuario se le responde lo mismo siempre.
                log.error('Fallo el envio del correo de recuperacion.')
    return {'message': _RESET_MSG}


@router.post('/auth/reset-password')
def reset_password(payload: dict, response: Response, db: Session = Depends(get_db)):
    """
    Establece una nueva contrasena validando el token de recuperacion.

    El token es de UN SOLO USO: en cuanto se consume queda marcado y no vuelve
    a servir. Ademas, cambiar la contrasena revoca las sesiones abiertas de esa
    cuenta: si alguien tenia la sesionRobada, pierde el acceso.
    """
    token = payload.get('token') or ''
    new_password = payload.get('new_password') or ''
    problem = password_problem(new_password)
    if problem:
        raise HTTPException(400, problem)
    row = (db.query(PasswordResetToken)
           .filter(PasswordResetToken.token_hash == token_fingerprint(token))
           .first())
    ahora = datetime.now(timezone.utc)
    # Un unico mensaje para token inexistente, ya usado o caducado: no se
    # distingue cual de los tres es, para no dar pistas a quien prueba.
    if not row or row.used_at is not None or _aware(row.expires_at) <= ahora:
        raise HTTPException(400, 'El enlace no es valido o ha caducado.')
    user = db.get(User, row.user_id)
    if not user or not user.active:
        raise HTTPException(400, 'El enlace no es valido o ha caducado.')
    user.password_hash = hash_password(new_password)
    user.must_change_password = False
    # De un solo uso: se invalida para siempre.
    row.used_at = ahora
    db.commit()
    # Cambiar la contrasena cierra las sesiones que hubiera abiertas.
    revoke_user_sessions(db, user.id)
    value, csrf, expires = issue_session(db, user)
    _set_session_cookies(response, value, csrf, expires)
    return {'user': public_user(user), 'csrf_token': csrf}


# --- Administracion ------------------------------------------------------
# Todas exigen `require_admin`, que comprueba el rol EN EL SERVIDOR. Ocultar el
# menu en el frontend no es una medida de seguridad.

def _active_admins(db: Session) -> int:
    return db.query(User).filter(User.role == 'admin',
                                 User.active.is_(True)).count()


@router.get('/admin/users')
def list_users(q: str = '', limit: int = 50, offset: int = 0,
               admin: User = Depends(require_admin),
               db: Session = Depends(get_db)):
    """Listado con busqueda por nombre o correo. Nunca devuelve contrasenas."""
    limit = max(1, min(200, limit))
    offset = max(0, offset)
    users = db.query(User).order_by(User.id).all()
    if q and q.strip():
        t = q.strip().lower()
        users = [u for u in users
                 if t in (u.name or '').lower() or t in (u.email or '').lower()]
    total = len(users)
    return {'users': [public_user(u) for u in users[offset:offset + limit]],
            'total': total, 'limit': limit, 'offset': offset}


@router.post('/admin/users')
def create_user(payload: dict, admin: User = Depends(require_admin),
                db: Session = Depends(get_db)):
    """
    Crea un usuario NORMAL.

    El rol lo decide el servidor: por mucho que el cuerpo envie `role:'admin'`,
    se ignora. Asi un usuario normal (ni siquiera un admin) no puede crear
    administradores por la via de esta ruta.
    """
    email = normalize_email(payload.get('email'))
    name = (payload.get('name') or '').strip()
    password = payload.get('password') or ''
    if not email or '@' not in email or len(email) > 255:
        raise HTTPException(400, 'El correo no es valido.')
    if not name or len(name) > 120:
        raise HTTPException(400, 'El nombre no es valido.')
    problem = password_problem(password)
    if problem:
        raise HTTPException(400, problem)
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(409, 'Ya existe una cuenta con ese correo.')
    u = User(name=name, email=email, password_hash=hash_password(password),
             role='user', active=True, must_change_password=False)
    db.add(u)
    db.commit()
    db.refresh(u)
    return public_user(u)


@router.patch('/admin/users/{uid}')
def update_user(uid: int, payload: dict, admin: User = Depends(require_admin),
                db: Session = Depends(get_db)):
    """Activa, desactiva o renombra. Nunca cambia el rol de nadie."""
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, 'El usuario no existe.')
    if 'role' in payload:
        # Cambio de rol fuera del alcance de esta fase: se rechaza de forma
        # explicita para que quede claro que no es un olvido.
        raise HTTPException(400, 'El rol no se modifica desde aqui.')
    if 'active' in payload:
        activo = bool(payload['active'])
        if not activo and u.role == 'admin' and u.active and _active_admins(db) <= 1:
            raise HTTPException(400, 'No se puede desactivar la ultima cuenta de '
                                     'administrador activa.')
        if not activo:
            # Al desactivar, sus sesiones mueren al instante.
            revoke_user_sessions(db, u.id)
        u.active = activo
    if 'name' in payload:
        n = (payload.get('name') or '').strip()
        if not n or len(n) > 120:
            raise HTTPException(400, 'El nombre no es valido.')
        u.name = n
    db.commit()
    db.refresh(u)
    return public_user(u)


@router.post('/admin/users/{uid}/send-reset')
def admin_send_reset(uid: int, admin: User = Depends(require_admin),
                     db: Session = Depends(get_db)):
    """
    Inicia un proceso NUEVO de recuperacion para un usuario.

    No genera ni devuelve contrasenas: el sistema no puede mostrar contrasenas
    existentes, porque solo guarda hashes.
    """
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, 'El usuario no existe.')
    token = new_token()
    ahora = datetime.now(timezone.utc)
    # Los enlaces anteriores sin usar quedan invalidados.
    for t in (db.query(PasswordResetToken)
              .filter(PasswordResetToken.user_id == u.id,
                      PasswordResetToken.used_at.is_(None)).all()):
        t.used_at = ahora
    db.add(PasswordResetToken(user_id=u.id, token_hash=token_fingerprint(token),
                              expires_at=ahora + RESET_TTL))
    db.commit()
    try:
        enviado = mailer.send_reset_email(u.email, token)
    except mailer.MailError:
        # Operacion interna de administracion: aqui si se informa del fallo.
        raise HTTPException(502, 'No se pudo enviar el correo. Revisa la '
                                 'configuracion del proveedor.')
    return {'ok': True, 'delivered': bool(enviado)}

    ahora = datetime.now(timezone.utc)
    # Un solo mensaje para token inexistente, ya usado o caducado.
    if not row or row.used_at is not None or _aware(row.expires_at) <= ahora:
        raise HTTPException(400, 'El enlace no es valido o ha caducado.')
    user = db.get(User, row.user_id)
    if not user or not user.active:
        raise HTTPException(400, 'El enlace no es valido o ha caducado.')
    user.password_hash = hash_password(payload.get('new_password'))
    user.must_change_password = False
    # De un solo uso: se invalida para siempre.
    row.used_at = ahora
    db.commit()
    # Cambiar la contrasena cierra las sesiones que hubiera abiertas.
    revoke_user_sessions(db, user.id)
    value, csrf, expires = issue_session(db, user)
    _set_session_cookies(response, value, csrf, expires)
    return {'user': public_user(user), 'csrf_token': csrf}

    current = payload.get('current_password') or ''
    new = payload.get('new_password') or ''
    if not verify_password(current, user.password_hash):
        raise HTTPException(400, 'La contrasena actual no es correcta.')
    problem = password_problem(new)
    if problem:
        raise HTTPException(400, problem)
    user.password_hash = hash_password(new)
    user.must_change_password = False
    db.commit()
    # Se invalidan las demas sesiones y esta se renueva.
    revoke_user_sessions(db, user.id)
    value, csrf, expires = issue_session(db, user)
    _set_session_cookies(response, value, csrf, expires)
    return {'user': public_user(user), 'csrf_token': csrf}
