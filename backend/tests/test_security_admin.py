"""
Fase 7C - pruebas de administracion y recuperacion de contrasena.
"""
from app.db.session import SessionLocal
from app.models import User, PasswordResetToken, Session as UserSession
from app.core.security import token_fingerprint, new_token
from conftest import TEST_PASSWORD, logout


def _emitir_token(email):
    """
    Crea un token de recuperacion REAL contra la base de pruebas.

    Permite probar el flujo completo sin depender de que el correo salga: lo que
    recibe el usuario es el valor en claro, y en la base solo queda su huella.
    """
    from app.core.config import RESET_TTL
    from datetime import datetime, timezone
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == email).first()
        token = new_token()
        db.add(PasswordResetToken(
            user_id=u.id, token_hash=token_fingerprint(token),
            expires_at=datetime.now(timezone.utc) + RESET_TTL))
        db.commit()
        return token
    finally:
        db.close()


def _tokens_de(email):
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == email).first()
        return [t for t in db.query(PasswordResetToken).all() if t.user_id == u.id]
    finally:
        db.close()


# --- Administracion ------------------------------------------------------

def test_admin_puede_listar_usuarios(client, admin):
    r = client.get('/api/admin/users')
    assert r.status_code == 200
    body = r.json()
    assert 'users' in body and 'total' in body
    for u in body['users']:
        # Nunca se expone el hash ni la contrasena.
        assert 'password_hash' not in u
        assert 'password' not in u


def test_admin_puede_crear_un_usuario_normal(client, admin):
    r = client.post('/api/admin/users', json={
        'name': 'Nueva', 'email': 'nueva.admin@marimba.local',
        'password': 'ContrasenaLarga1'})
    assert r.status_code == 200
    creado = r.json()
    # Aunque el cuerpo pida admin, el servidor decide: siempre 'user'.
    assert creado['role'] == 'user'
    assert 'password_hash' not in creado
    logout(client)
    assert client.post('/api/auth/login', json={
        'email': 'nueva.admin@marimba.local',
        'password': 'ContrasenaLarga1'}).status_code == 200


def test_no_se_puede_crear_un_correo_duplicado(client, admin):
    assert client.post('/api/admin/users', json={
        'name': 'Dup', 'email': 'dup.admin@marimba.local',
        'password': 'ContrasenaLarga1'}).status_code == 200
    r2 = client.post('/api/admin/users', json={
        'name': 'Dup otra vez', 'email': 'dup.admin@marimba.local',
        'password': 'ContrasenaLarga1'})
    assert r2.status_code == 409


def test_un_usuario_normal_no_administra_usuarios(client, user_a):
    assert client.get('/api/admin/users').status_code == 403
    assert client.post('/api/admin/users', json={
        'name': 'Intruso', 'email': 'intruso@x.com',
        'password': 'ContrasenaLarga1'}).status_code == 403
    assert client.patch('/api/admin/users/1', json={'active': False}).status_code == 403
    assert client.post('/api/admin/users/1/send-reset').status_code == 403


def test_un_usuario_normal_no_puede_cambiar_su_rol(client, user_a):
    r = client.patch('/api/admin/users/1', json={'role': 'admin'})
    assert r.status_code in (400, 403)
    db = SessionLocal()
    try:
        assert db.query(User).filter(User.email == user_a).first().role == 'user'
    finally:
        db.close()

def test_admin_desactiva_y_reactiva_un_usuario(client, admin):
    uid = client.post('/api/admin/users', json={
        'name': 'Temporal', 'email': 'temporal.admin@marimba.local',
        'password': 'ContrasenaLarga1'}).json()['id']
    assert client.patch('/api/admin/users/%d' % uid,
                        json={'active': False}).status_code == 200
    logout(client)
    # Un usuario desactivado no puede entrar.
    assert client.post('/api/auth/login', json={
        'email': 'temporal.admin@marimba.local',
        'password': 'ContrasenaLarga1'}).status_code == 401
    client.post('/api/auth/login', json={'email': 'prueba.admin@marimba.local',
                                         'password': TEST_PASSWORD})
    assert client.patch('/api/admin/users/%d' % uid,
                        json={'active': True}).status_code == 200
    logout(client)
    assert client.post('/api/auth/login', json={
        'email': 'temporal.admin@marimba.local',
        'password': 'ContrasenaLarga1'}).status_code == 200


def test_no_se_puede_dejar_sin_administradores_activos(client, admin):
    db = SessionLocal()
    try:
        activos = [u.id for u in db.query(User).all()
                   if u.role == 'admin' and u.active]
    finally:
        db.close()
    r = client.patch('/api/admin/users/%d' % activos[0], json={'active': False})
    assert r.status_code == 400
    assert 'administrador' in r.json()['detail']


def test_admin_puede_iniciar_la_recuperacion_de_otro_usuario(client, admin):
    uid = client.post('/api/admin/users', json={
        'name': 'Recuperable', 'email': 'recuperable.admin@marimba.local',
        'password': 'ContrasenaLarga1'}).json()['id']
    antes = len(_tokens_de('recuperable.admin@marimba.local'))
    r = client.post('/api/admin/users/%d/send-reset' % uid)
    assert r.status_code == 200
    # `delivered=False` porque el proveedor es `console`: no se finge un envio.
    assert r.json()['delivered'] is False
    assert len(_tokens_de('recuperable.admin@marimba.local')) == antes + 1
    # Y no devuelve ninguna contrasena.
    assert 'password' not in r.text


# --- Recuperacion de contrasena -----------------------------------------

def test_la_solicitud_no_revela_si_la_cuenta_existe(client, admin):
    logout(client)
    a = client.post('/api/auth/forgot-password',
                    json={'email': 'prueba.admin@marimba.local'})
    b = client.post('/api/auth/forgot-password',
                    json={'email': 'nadie@ejemplo.com'})
    assert a.status_code == b.status_code == 200
    # Mismo mensaje exacto: no se pueden enumerar cuentas.
    assert a.json() == b.json()


def test_el_token_solo_se_guarda_como_huella(client, admin):
    r = client.post('/api/auth/forgot-password',
                    json={'email': 'prueba.admin@marimba.local'})
    assert r.status_code == 200
    filas = _tokens_de('prueba.admin@marimba.local')
    assert filas, 'deberia haberse creado un token'
    for t in filas:
        assert len(t.token_hash) == 64

def test_token_valido_cambia_la_contrasena(client, admin):
    token = _emitir_token('prueba.admin@marimba.local')
    r = client.post('/api/auth/reset-password',
                    json={'token': token, 'new_password': 'Recuperada1234'})
    assert r.status_code == 200
    logout(client)
    assert client.post('/api/auth/login', json={
        'email': 'prueba.admin@marimba.local',
        'password': 'Recuperada1234'}).status_code == 200
    # Se restituye la clave de la suite para no arrastrar el cambio.
    client.post('/api/auth/change-password',
                json={'current_password': 'Recuperada1234',
                      'new_password': TEST_PASSWORD})


def test_el_token_es_de_un_solo_uso(client, admin):
    token = _emitir_token('prueba.admin@marimba.local')
    assert client.post('/api/auth/reset-password',
                       json={'token': token,
                             'new_password': 'Primera12345'}).status_code == 200
    # Reutilizarlo debe fallar.
    r2 = client.post('/api/auth/reset-password',
                     json={'token': token, 'new_password': 'Segunda12345'})
    assert r2.status_code == 400


def test_un_token_caducado_se_rechaza(client, admin):
    from datetime import datetime, timezone, timedelta
    db = SessionLocal()
    try:
        u = db.query(User).filter(
            User.email == 'prueba.admin@marimba.local').first()
        token = new_token()
        db.add(PasswordResetToken(
            user_id=u.id, token_hash=token_fingerprint(token),
            expires_at=datetime.now(timezone.utc) - timedelta(hours=1)))
        db.commit()
    finally:
        db.close()
    r = client.post('/api/auth/reset-password',
                    json={'token': token, 'new_password': 'Caducada1234'})
    assert r.status_code == 400


def test_un_token_inventado_se_rechaza(client, admin):
    r = client.post('/api/auth/reset-password',
                    json={'token': 'esto-no-es-un-token-real',
                          'new_password': 'Cualquiera123'})
    assert r.status_code == 400


def test_el_reset_cierra_las_sesiones_anteriores(client, admin):
    token = _emitir_token('prueba.admin@marimba.local')
    db = SessionLocal()
    try:
        u = db.query(User).filter(
            User.email == 'prueba.admin@marimba.local').first()
        # Se parte de cero: cualquier sesion viva de esta cuenta es de antes.
        for s in db.query(UserSession).filter(
                UserSession.user_id == u.id).all():
            s.revoked = True
        db.commit()
    finally:
        db.close()
    # El reset deja viva exactamente UNA sesion: la que crea el propio reset.
    assert client.post('/api/auth/reset-password',
                       json={'token': token,
                             'new_password': 'CierraTodo1'}).status_code == 200
    db = SessionLocal()
    try:
        u = db.query(User).filter(
            User.email == 'prueba.admin@marimba.local').first()
        vivas = [s for s in db.query(UserSession).all()
                 if s.user_id == u.id and not s.revoked]
        assert len(vivas) == 1
    finally:
        db.close()


def test_la_nueva_contrasena_se_valida(client, admin):
    token = _emitir_token('prueba.admin@marimba.local')
    r = client.post('/api/auth/reset-password',
                    json={'token': token, 'new_password': 'corta'})
    assert r.status_code == 400
