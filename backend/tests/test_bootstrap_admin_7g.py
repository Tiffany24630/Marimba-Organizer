"""
Fase 7G - pruebas del mecanismo de creacion del PRIMER administrador.

Se comprueba el EFECTO real (lo que queda en la base de datos y lo que
responde el backend), no solo que el comando devuelva un codigo de exito.
"""

from fastapi.testclient import TestClient

from app.cli import crear_admin, main
from app.core.security import hash_password, verify_password
from app.db.session import SessionLocal
from app.main import app
from app.models import User
from conftest import TEST_PASSWORD

CORREO_ADMIN = 'admin.bootstrap@prueba.local'

# --- Fase 7G: no contaminar el resto de la suite --------------------------
# Estas pruebas crean ADMINISTRADORES reales en la base de pruebas. Si se
# quedan, rompen `test_no_se_puede_dejar_sin_administradores_activos`, que
# cuenta los admins activos y daria por bueno desactivar el ultimo.
#
# Se limpian al terminar CADA prueba de este fichero. El dominio `@prueba.local`
# es exclusivo de estas pruebas: las de 7C usan `@marimba.local`, asi que no se
# toca ninguna cuenta de otra suite.
import pytest


@pytest.fixture(autouse=True)
def _limpia_cuentas_7g():
    yield
    from sqlalchemy import text
    db = SessionLocal()
    try:
        db.execute(text("DELETE FROM users WHERE email LIKE '%@prueba.local'"))
        db.commit()
    except Exception:  # pragma: no cover - defensivo
        db.rollback()
    finally:
        db.close()


def _admin_en_db(email=CORREO_ADMIN):
    db = SessionLocal()
    try:
        return db.query(User).filter(User.email == email).one_or_none()
    finally:
        db.close()


def _crear_usuario(email, role='user'):
    db = SessionLocal()
    try:
        db.add(User(name='Prueba', email=email,
                    password_hash=hash_password(TEST_PASSWORD),
                    role=role, active=True, must_change_password=False))
        db.commit()
    finally:
        db.close()


def test_crea_el_administrador_con_el_rol_correcto():
    codigo, mensaje = crear_admin(CORREO_ADMIN, TEST_PASSWORD)
    assert codigo == 0, mensaje
    u = _admin_en_db()
    assert u is not None, 'no se creo la cuenta'
    assert u.role == 'admin'
    assert u.active is True
    # La contrasena se hashea con el MISMO criterio que el resto de cuentas:
    # nunca se guarda en claro.
    assert u.password_hash != TEST_PASSWORD
    assert verify_password(TEST_PASSWORD, u.password_hash)
    # Y debe cambiarla en el primer acceso.
    assert u.must_change_password is True


def test_no_crea_la_cuenta_a_medias_si_la_clave_es_invalida():
    """Un error de validacion no debe dejar un administrador a medias."""
    codigo, mensaje = crear_admin('admin.invalido@prueba.local', 'corta')
    assert codigo != 0
    assert '10 caracteres' in mensaje
    assert _admin_en_db('admin.invalido@prueba.local') is None
    assert crear_admin('no-es-correo', TEST_PASSWORD)[0] != 0
    assert crear_admin('', TEST_PASSWORD)[0] != 0


def test_es_idempotente_no_duplica_administradores():
    """Ejecutarlo dos veces no debe crear una segunda cuenta."""
    assert crear_admin(CORREO_ADMIN, TEST_PASSWORD)[0] == 0
    codigo, mensaje = crear_admin(CORREO_ADMIN, TEST_PASSWORD)
    assert codigo == 0
    assert 'ya era administradora' in mensaje
    db = SessionLocal()
    try:
        total = db.query(User).filter(
            User.email == CORREO_ADMIN, User.role == 'admin').count()
    finally:
        db.close()
    assert total == 1


def test_no_promueve_una_cuenta_normal_sin_bandera_explicita():
    """Una cuenta existente NO se convierte en admin por accidente."""
def test_el_admin_creado_puede_entrar_y_gestionar_usuarios():
    """De principio a fin: crear -> entrar -> /auth/me -> /admin/users."""
    assert crear_admin(CORREO_ADMIN, TEST_PASSWORD)[0] == 0
    with TestClient(app) as c:
        r = c.post('/api/auth/login',
                   json={'email': CORREO_ADMIN, 'password': TEST_PASSWORD})
        assert r.status_code == 200, r.text
        assert c.cookies.get('marimba_session'), 'no se creo la cookie de sesion'
        csrf = c.cookies.get('marimba_csrf', '')

        yo = c.get('/api/auth/me')
        assert yo.status_code == 200
        assert yo.json()['user']['role'] == 'admin'

        # Y ya puede usar la administracion de usuarios.
        alta = c.post('/api/admin/users',
                      json={'email': 'creado.por.admin@prueba.local',
                            'name': 'Creado', 'password': TEST_PASSWORD},
                      headers={'X-CSRF-Token': csrf})
        assert alta.status_code == 200, alta.text
        assert alta.json()['role'] == 'user'


def test_un_usuario_normal_no_puede_invocar_el_mecanismo():
    """
    El mecanismo NO es una via HTTP. Un usuario autenticado normal tiene acceso
    a la API, pero no a la base de datos, asi que no puede convertirse a si
    mismo en administrador.
    """
    _crear_usuario('intruso@prueba.local')
    with TestClient(app) as c:
        c.post('/api/auth/login',
               json={'email': 'intruso@prueba.local',
                     'password': TEST_PASSWORD})
        csrf = c.cookies.get('marimba_csrf', '')
        # No existe ninguna ruta que sirva para crear administradores.
        for ruta, cuerpo in (
            ('/api/admin/users', {'email': 'nuevo.admin@prueba.local',
                                  'name': 'X', 'password': TEST_PASSWORD,
                                  'role': 'admin'}),
            ('/api/admin/create-admin', {'email': 'nuevo.admin@prueba.local',
                                         'password': TEST_PASSWORD}),
            ('/api/register-admin', {'email': 'nuevo.admin@prueba.local',
                                     'password': TEST_PASSWORD}),
        ):
            r = c.post(ruta, json=cuerpo, headers={'X-CSRF-Token': csrf})
            assert r.status_code in (403, 404), \
                '%s respondio %s: no debe existir una via HTTP' % (
                    ruta, r.status_code)
        assert _admin_en_db('nuevo.admin@prueba.local') is None
        assert _admin_en_db('intruso@prueba.local').role == 'user'


def test_el_mensaje_no_containe_la_contrasena():
    """Ni al exito ni al error la clave puede aparecer en la salida."""
    for clave in (TEST_PASSWORD, 'corta', 'OtraClave7Segura'):
        _codigo, mensaje = crear_admin('admin.secreto@prueba.local', clave)
        assert clave not in (mensaje or ''), \
            'la contrasena aparecio en el mensaje'


def test_la_cookie_segura_se_activa_solo_con_https():
    """
    7G - `Secure` no debe romperse en desarrollo, pero debe activarse en HTTPS.

    No se modifica la logica: ya funciona de forma automatica. Lo que se anade
    es la prueba, que hasta ahora faltaba.
    """
    import importlib
    import app.core.config as cfg

    def recargar(url, secure=None):
        import os
        os.environ['PUBLIC_BASE_URL'] = url
        if secure is None:
            os.environ.pop('SECURE_COOKIES', None)
        else:
            os.environ['SECURE_COOKIES'] = secure
        return importlib.reload(cfg)

    try:
        # Desarrollo en HTTP: sin Secure, para que funcione en localhost.
        s = recargar('http://localhost:5173')
        assert s.settings.secure_cookies is False
        # Produccion en HTTPS: con Secure.
        s = recargar('https://marimba.ejemplo.local')
        assert s.settings.secure_cookies is True
        # Pero se puede forzar explicitamente si hace falta (por ejemplo,
        # un proxy que termina TLS delante).
        s = recargar('https://marimba.ejemplo.local', secure='false')
        assert s.settings.secure_cookies is False
    finally:
        import os
        os.environ.pop('SECURE_COOKIES', None)
        os.environ['PUBLIC_BASE_URL'] = 'http://localhost:5173'
        importlib.reload(cfg)


def test_el_enlace_de_recuperacion_usa_public_base_url():
    """
    7G - el enlace NUNCA debe apuntar a la URL de desarrollo si el despliegue
    es otro. Es el fallo silencioso que rompia los correos de recuperacion.
    """
    from app.services.mailer import build_reset_link
    assert build_reset_link('ABC') == \
        'http://localhost:5173/reset-password?token=ABC'
    # `mailer` hace `from app.core.config import settings`: guarda el OBJETO, no
    # una copia, asi que cambiar el atributo afecta a las dos partes.
    import app.services.mailer as mailer
    original = mailer.settings.public_base_url
    try:
        mailer.settings.public_base_url = 'https://marimba.ejemplo.local/'
        # Con barra final no debe quedar doble barra.
        assert build_reset_link('XYZ') == \
            'https://marimba.ejemplo.local/reset-password?token=XYZ'
    finally:
        mailer.settings.public_base_url = original


def test_smtp_sin_host_no_finge_un_envio():
    """Sin SMTP_HOST no puede haber un envio real."""
    import app.services.mailer as mailer
    original_host = mailer.settings.smtp_host
    original_provider = mailer.settings.mail_provider
    try:
        mailer.settings.smtp_host = ''
        mailer.settings.mail_provider = 'smtp'
        try:
            mailer.send_mail('nadie@ejemplo.local', 'asunto', 'cuerpo')
            assert False, 'debio lanzar MailError'
        except mailer.MailError:
            pass
    finally:
        mailer.settings.smtp_host = original_host
        mailer.settings.mail_provider = original_provider


def test_el_cors_esta_registrado():
    """
    7G - regresion de un defecto real.

    `CORSMiddleware` se importaba pero nunca se añadia a la aplicacion. Las
    pruebas de API no lo detectan (van al mismo proceso), y solo se ve desde un
    navegador: el preflight devolvia 405 y el login terminaba en ERR_FAILED.
    Esta prueba lo fija para que no vuelva a desaparecer.
    """
    from starlette.middleware.cors import CORSMiddleware
    from app.main import app
    assert any(m.cls is CORSMiddleware for m in app.user_middleware), \
        'CORSMiddleware no esta registrado en la aplicacion'


def test_el_preflight_devuelve_las_cabeceras_correctas():
    """El navegador necesita que el preflight responda con las cabeceras CORS."""
    import app.core.config as cfg
    from fastapi.testclient import TestClient
    from app.main import app
    original = cfg.settings.cors_origins
    try:
        cfg.settings.cors_origins = 'http://permitido.ejemplo.local'
        # El middleware ya fue creado con la configuracion del arranque; se
        # comprueba contra la lista que realmente se paso, no contra la
        # variable de entorno (que se lee al importar).
        with TestClient(app) as c:
            r = c.options('/api/projects', headers={
                'Origin': 'http://localhost:5173',
                'Access-Control-Request-Method': 'POST'})
            assert r.status_code == 200, \
                'el preflight debe responderse, no devolver 405'
            assert 'access-control-allow-credentials' in \
                {k.lower() for k in r.headers}, \
                'sin allow-credentials la cookie de sesion no viaja'
    finally:
        cfg.settings.cors_origins = original


def test_la_cli_acepta_password_file(tmp_path, capsys):
    """Via de fichero: la clave no queda en el historial del terminal."""
    fichero = tmp_path / 'clave.txt'
    fichero.write_text(TEST_PASSWORD + '\n', encoding='utf-8')
    codigo = main(['create-admin', '--email', 'admin.file@prueba.local',
                   '--password-file', str(fichero)])
    salida = capsys.readouterr().out
    assert codigo == 0
    assert TEST_PASSWORD not in salida
    u = _admin_en_db('admin.file@prueba.local')
    assert u is not None and u.role == 'admin'


def test_la_api_de_admin_no_puede_crear_administradores():
    """La garantia de fondo: ni el admin puede crear otro admin por HTTP."""
    _crear_usuario('admin.real@prueba.local', role='admin')
    with TestClient(app) as c:
        c.post('/api/auth/login',
               json={'email': 'admin.real@prueba.local',
                     'password': TEST_PASSWORD})
        csrf = c.cookies.get('marimba_csrf', '')
        r = c.post('/api/admin/users',
                   json={'email': 'admin.nuevo@prueba.local', 'name': 'X',
                         'password': TEST_PASSWORD, 'role': 'admin'},
                   headers={'X-CSRF-Token': csrf})
        assert r.status_code == 200
        # Aunque el cuerpo pida 'admin', el servidor lo ignora.
        assert r.json()['role'] == 'user'
    assert _admin_en_db('admin.nuevo@prueba.local').role == 'user'

    _crear_usuario('normal.ya@prueba.local')
    codigo, mensaje = crear_admin('normal.ya@prueba.local', TEST_PASSWORD)
    assert codigo != 0
    assert '--promover' in mensaje
    assert _admin_en_db('normal.ya@prueba.local').role == 'user'


def test_con_promover_convierte_la_cuenta():
    _crear_usuario('otro.normal@prueba.local')
    codigo, _ = crear_admin('otro.normal@prueba.local', TEST_PASSWORD,
                            forzar_promocion=True)
    assert codigo == 0
    u = _admin_en_db('otro.normal@prueba.local')
    assert u.role == 'admin'
    assert verify_password(TEST_PASSWORD, u.password_hash)
