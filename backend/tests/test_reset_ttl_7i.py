"""
Fase 7I - CADUCIDAD del token de recuperacion de contrasena (7H lo dejo
pendiente).

Metodo: se mueve `expires_at` del token en la base de pruebas. Opcion elegida a
proposito:

  - NO se cambia `RESET_TTL` ni ninguna variable compartida: las cuentas del
    entorno E2E usan la configuracion real y no se tocan.
  - NO se esperan minutos reales: la caducidad se demuestra en milisegundos.
  - NO se introduce ninguna abstraccion de reloj en produccion: `auth_routes`
    sigue comparando fechas exactamente igual.
  - La base es `test_marimba.db`, desechable, que `conftest.py` borra al
    arrancar. Nada de esto sale de aqui.

Lo que se demuestra: que `reset_password` RECHAZA el token cuando la fecha ya
paso, y no solo que el valor de configuracion existe.
"""
from datetime import datetime, timedelta, timezone

from app.db.session import SessionLocal
from app.models import PasswordResetToken, User
from app.core.security import new_token, token_fingerprint
from conftest import TEST_PASSWORD, logout, _crear_usuario

NUEVA = 'NuevaClave7I-Larga'
CORREO = 'prueba.ttl@marimba.local'


def _token_con_vida(correo, expires_at):
    """Inserta un token de recuperacion con la caducidad que se le pida."""
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == correo).first()
        token = new_token()
        db.add(PasswordResetToken(
            user_id=u.id, token_hash=token_fingerprint(token),
            expires_at=expires_at))
        db.commit()
        return token
    finally:
        db.close()


def _fila_de(correo, token):
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == correo).first()
        for t in db.query(PasswordResetToken).all():
            if t.user_id == u.id and t.token_hash == token_fingerprint(token):
                return t
        return None
    finally:
        db.close()


def _usar(client, token, contrasena=NUEVA):
    return client.post('/api/auth/reset-password',
                       json={'token': token, 'new_password': contrasena})


def _preparar(client):
    """Crea la cuenta con clave conocida y deja el cliente sin sesion."""
    _crear_usuario(CORREO, 'user')
    logout(client)


def _sirve_contrasena(client, contrasena):
    r = client.post('/api/auth/login',
                    json={'email': CORREO, 'password': contrasena})
    if r.status_code == 200:
        logout(client)
    return r.status_code == 200


# --- Vigencia ------------------------------------------------------------

def test_token_dentro_del_periodo_sigue_sirviendo(client):
    _preparar(client)
    token = _token_con_vida(CORREO, datetime.now(timezone.utc) + timedelta(minutes=5))
    r = _usar(client, token)
    assert r.status_code == 200, r.text
    assert _sirve_contrasena(client, NUEVA)
    assert not _sirve_contrasena(client, TEST_PASSWORD)


# --- Caducidad: el caso que 7H dejo pendiente ---------------------------

def test_token_caducado_se_rechaza_y_no_cambia_la_contrasena(client):
    _preparar(client)
    token = _token_con_vida(CORREO, datetime.now(timezone.utc) - timedelta(seconds=1))
    r = _usar(client, token)
    assert r.status_code == 400, r.text
    assert 'no es valido' in r.json()['detail'].lower()
    # Lo importante: la clave ORIGINAL sigue sirviendo. Si el token caducado
    # llegara a cambiar algo, esto fallaria.
    assert _sirve_contrasena(client, TEST_PASSWORD)
    assert not _sirve_contrasena(client, NUEVA)


def test_token_expirado_no_puede_alterar_la_contrasena_por_otro_camino(client):
    """Un token caducado no sirve ni aunque se reintente muchas veces."""
# --- Un solo uso ---------------------------------------------------------

def test_token_utilizado_dos_veces_se_rechaza(client):
    _preparar(client)
    token = _token_con_vida(CORREO, datetime.now(timezone.utc) + timedelta(minutes=5))
    assert _usar(client, token).status_code == 200
    logout(client)
    # La fila queda marcada como usada para SIEMPRE.
    fila = _fila_de(CORREO, token)
    assert fila is not None and fila.used_at is not None
    # Reutilizarlo no cambia nada, ni siquiera la clave que acaba de fijarse.
    r = _usar(client, token, 'OtraClave7I-Larga')
    assert r.status_code == 400
    assert _sirve_contrasena(client, NUEVA)
    assert not _sirve_contrasena(client, 'OtraClave7I-Larga')


# --- Tokens que nunca fueron validos -----------------------------------

def test_token_inexistente_se_rechaza(client):
    _preparar(client)
    assert _usar(client, 'token-que-nunca-existio-7i').status_code == 400
    assert _sirve_contrasena(client, TEST_PASSWORD)


def test_token_alterado_se_rechaza(client):
    """Cambiar un solo caracter del token lo deja inutilizable."""
    _preparar(client)
    token = _token_con_vida(CORREO, datetime.now(timezone.utc) + timedelta(minutes=5))
    alterado = ('A' if token[0] != 'A' else 'B') + token[1:]
    assert _usar(client, alterado).status_code == 400
    # El token bueno sigue valido: el alterado no lo invalida.
    assert _usar(client, token).status_code == 200


def test_token_vacio_se_rechaza(client):
    _preparar(client)
    assert _usar(client, '').status_code == 400


# --- Filtracion ----------------------------------------------------------

def test_el_token_no_aparece_en_la_respuesta_ni_en_la_base(client, capsys):
    _preparar(client)
    token = _token_con_vida(CORREO, datetime.now(timezone.utc) + timedelta(minutes=5))
    r = _usar(client, token)
    assert r.status_code == 200
    assert token not in r.text
    # En la base solo queda la HUELLA, nunca el valor en claro.
    db = SessionLocal()
    try:
        for t in db.query(PasswordResetToken).all():
            assert t.token_hash != token
            assert len(t.token_hash) == 64
    finally:
        db.close()
    assert token not in capsys.readouterr().out


def test_el_error_por_caducado_no_distingue_del_inexistente(client):
    """El mensaje es el mismo en ambos casos: no revela si el token existio."""
    _preparar(client)
    caducado = _token_con_vida(CORREO, datetime.now(timezone.utc) - timedelta(days=1))
    r_caducado = _usar(client, caducado)
    r_fantasma = _usar(client, 'token-fantasma-7i')
    assert r_caducado.status_code == r_fantasma.status_code == 400
    assert r_caducado.json()['detail'] == r_fantasma.json()['detail']


# --- La recuperacion valida sigue funcionando --------------------------

def test_la_recuperacion_valida_sigue_permitiendo_cambiar_la_clave(client):
    """La caducidad NO ha roto el flujo que 7H dio por bueno."""
    _preparar(client)
    token = _token_con_vida(CORREO, datetime.now(timezone.utc) + timedelta(minutes=5))
    r = _usar(client, token)
    assert r.status_code == 200
    # La respuesta entrega sesion y token anti-CSRF, nunca la contrasena.
    assert 'password' not in r.json()
    assert _sirve_contrasena(client, NUEVA)
    assert not _sirve_contrasena(client, TEST_PASSWORD)
    # El hash guardado cambia y no contiene la clave en claro.
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == CORREO).first()
        assert NUEVA not in u.password_hash
        assert u.password_hash.startswith('pbkdf2_sha256$')
    finally:
        db.close()
    _preparar(client)
    token = _token_con_vida(CORREO, datetime.now(timezone.utc) - timedelta(hours=1))
    for _ in range(3):
        assert _usar(client, token).status_code == 400
    assert _sirve_contrasena(client, TEST_PASSWORD)
    # Y el token sigue SIN usarse: caducado no es lo mismo que consumido.
    fila = _fila_de(CORREO, token)
    assert fila is not None and fila.used_at is None


def test_limite_exacto_de_caducidad(client):
    """En el limite exacto (`expires_at == ahora`) ya se rechaza: `<=`."""
    _preparar(client)
    token = _token_con_vida(CORREO, datetime.now(timezone.utc))
    r = _usar(client, token)
    assert r.status_code == 400, r.text
    assert _sirve_contrasena(client, TEST_PASSWORD)


def test_un_segundo_antes_del_limite_todavia_sirve(client):
    _preparar(client)
    token = _token_con_vida(CORREO, datetime.now(timezone.utc) + timedelta(seconds=1))
    assert _usar(client, token).status_code == 200