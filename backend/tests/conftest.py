import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
os.environ['DATABASE_URL'] = 'sqlite:///./test_marimba.db'
# Fase 7C: durante las pruebas el correo NUNCA sale de verdad. El proveedor
# `console` es el modo de desarrollo declarado: deja el enlace en el log del
# servidor y devuelve delivered=False. Ninguna prueba afirma que se haya
# enviado un correo real.
os.environ['MAIL_PROVIDER'] = 'console'
# El coste de PBKDF2 se reduce SOLO aqui. En cualquier despliegue real se usa
# el valor por defecto (600.000 iteraciones); esto no cambia el algoritmo ni el
# formato del hash, solo cuantas vueltas se dan al ver la clave de prueba.
os.environ['PBKDF2_ITERATIONS'] = '2000'

_db = BACKEND / 'test_marimba.db'
if _db.exists():
    _db.unlink()

# --- Fase 7C: fixtures de autenticacion ---------------------------------
# Las pruebas existentes siguen comprobando lo que siempre comprobaron, pero
# ahora se ejecutan dentro de una sesion valida. NO se debilita la
# autenticacion para conservarlas: se autentica el cliente.
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db.session import SessionLocal
from app.core.security import hash_password
from app.models import User

# Contrasena SOLO de esta suite de pruebas. No es una credencial real y no se
# usa en ningun entorno desplegado.
TEST_PASSWORD = 'PruebaLocal7Segura'


def _crear_usuario(email, role='user', activo=True):
    """
    Crea el usuario si no existe y RESTAURA su estado conocido.

    Es idempotente a proposito: si una prueba anterior cambio la contrasena o
    desactivo la cuenta, la siguiente vuelve a un punto de partida limpio. Sin
    esto, los tests se contaminarian entre si.
    """
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == email).first()
        nuevo = u is None
        if nuevo:
            u = User(name=email.split('@')[0], email=email,
                     password_hash=hash_password(TEST_PASSWORD),
                     role=role, active=True, must_change_password=False)
            db.add(u)
        else:
            u.password_hash = hash_password(TEST_PASSWORD)
            u.role = role
            u.active = activo
            u.must_change_password = False
        db.commit()
        db.refresh(u)
        return u.id
    finally:
        db.close()


@pytest.fixture(scope='session')
def client():
    return TestClient(app)


def _login(client, email, password=TEST_PASSWORD):
    r = client.post('/api/auth/login', json={'email': email,
                                             'password': password})
    assert r.status_code == 200, r.text
    return r


@pytest.fixture()
def user_a(client):
    """Usuario normal A: dueno de los proyectos que crean sus pruebas."""
    email = 'prueba.a@marimba.local'
    _crear_usuario(email, 'user')
    client._anon = False
    logout(client)
    _login(client, email)
    return email


@pytest.fixture()
def user_b(client):
    """Usuario normal B, independiente de A. Base de las pruebas de aislamiento."""
    email = 'prueba.b@marimba.local'
    _crear_usuario(email, 'user')
    client._anon = False
    logout(client)
    _login(client, email)
    return email


@pytest.fixture()
def admin(client):
    """Administrador, para las pruebas de la seccion de administracion."""
    email = 'prueba.admin@marimba.local'
    _crear_usuario(email, 'admin')
    client._anon = False
    logout(client)
    _login(client, email)
    return email


@pytest.fixture()
def anon(client):
    """
    Cliente SIN sesion, para comprobar que las rutas privadas rechazan.

    Se marca con `_anon` para que el adaptador de la suite no le reinicie la
    sesion automaticamente.
    """
    logout(client)
    client._anon = True
    return client


def logout(client):
    client.post('/api/auth/logout')
    client.cookies.clear()


def head(client):
    """Cabeceras de una peticion mutable, con el token anti-CSRF."""
    return {'X-CSRF-Token': client.cookies.get('marimba_csrf') or ''}


def proyecto_de_prueba(db, nombre='Proyecto de prueba'):
    """
    Crea un proyecto YA CON PROPIETARIO, directamente en la base.

    Desde 7C toda ruta privada exige `owner_id`. Las pruebas que arman el
    escenario directamente con SQLAlchemy (sin pasar por la API) deben crear el
    proyecto con dueno, igual que lo haria el endpoint de alta.
    """
    from app.models import Project
    u = _crear_usuario(_AUTO_USER['email'], _AUTO_USER['role'])
    p = Project(name=nombre, owner_id=u)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


# --- Adaptacion de la suite existente ------------------------------------
# Las pruebas anteriores al multinusuario crean su propio `TestClient(app)` a
# nivel de modulo, es decir AL IMPORTAR el fichero de pruebas, que ocurre
# ANTES de que corra cualquier fixture. Por eso el parche se instala aqui, en
# el propio modulo de conftest (que pytest importa primero), y no dentro de
# una fixture.
#
# Esto NO debilita la autenticacion: el backend sigue exigiendo sesion y token
# de CSRF. Lo que se hace es que el cliente de prueba los aporte, igual que lo
# haria el navegador. Las pruebas del comportamiento NEGATIVO usan `anon`,
# `logout` o `sin_csrf()`.

_csrf_auto = {'on': True}
# El cliente de pruebas entra como ADMINISTRADOR porque parte de la suite
# historica crea y edita PLANTILLAS, que en 7C son catalogo global y su
# escritura queda reservada al administrador. Las pruebas de seguridad inician
# sesion explicitamente con el usuario normal que necesitan.
_AUTO_USER = {'email': 'prueba.admin@marimba.local', 'role': 'admin'}


def sin_csrf():
    """Desactiva la inyeccion de CSRF para comprobar que se rechaza."""
    _csrf_auto['on'] = False


def con_csrf():
    _csrf_auto['on'] = True


import fastapi.testclient as _ftc

_orig_init = _ftc.TestClient.__init__
_orig_request = _ftc.TestClient.request


def _auto_login(self):
    try:
        _crear_usuario(_AUTO_USER['email'], _AUTO_USER['role'])
        self.post('/api/auth/login',
                  json={'email': _AUTO_USER['email'],
                        'password': TEST_PASSWORD})
    except Exception:
        # Si la base aun no esta lista (import temprano), se ignora: la
        # peticion devolvera 401 y la prueba lo indicara con claridad.
        pass


def _init(self, *a, **kw):
    _orig_init(self, *a, **kw)


def _asegurar_sesion(self):
    """
    Inicia sesion una sola vez, de forma perezosa.

    No se puede hacer en `__init__`: los clientes de la suite se crean al
    IMPORTAR los modulos de prueba, y en ese momento la base puede no tener
    tablas. Aqui se intenta en la primera peticion real, y si aun no esta
    lista, la propia peticion falla con 401 y la prueba lo dice claramente.
    """
    if getattr(self, '_auto_ok', False):
        return
    # Si YA hay una cookie de sesion, no se toca: la prueba ha iniciado
    # sesion deliberadamente como un usuario concreto y el autologin no debe
    # sustituirla por el usuario de la suite.
    if self.cookies.get('marimba_session'):
        self._auto_ok = True
        return
    _crear_usuario(_AUTO_USER['email'], _AUTO_USER['role'])
    r = _orig_request(self, 'POST', '/api/auth/login',
                      json={'email': _AUTO_USER['email'],
                            'password': TEST_PASSWORD})
    if r.status_code == 200:
        self._auto_ok = True
    else:
        raise AssertionError(
            'Auto-login fallo (%s): %s' % (r.status_code, r.text[:300]))


def _request(self, method, url, **kw):
    m = str(method).upper()
    es_api = str(url).startswith('/api')
    # La propia peticion de login no se reintenta (seria un bucle).
    if es_api and '/auth/login' not in str(url) and not getattr(self, '_anon', False):
        _asegurar_sesion(self)
    if (_csrf_auto['on'] and m in {'POST', 'PUT', 'PATCH', 'DELETE'} and es_api):
        headers = dict(kw.get('headers') or {})
        if not any(k.lower() == 'x-csrf-token' for k in headers):
            token = self.cookies.get('marimba_csrf')
            if token:
                headers['X-CSRF-Token'] = token
                kw['headers'] = headers
    return _orig_request(self, method, url, **kw)


_ftc.TestClient.__init__ = _init
_ftc.TestClient.request = _request
