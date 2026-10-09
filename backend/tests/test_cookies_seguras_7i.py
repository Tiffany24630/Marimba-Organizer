"""
Fase 7I - HTTPS y cookies `Secure`: lo que SI se puede verificar en local.

Este entorno no tiene TLS, asi que NO se afirma nada sobre HTTPS real. Lo que
si se comprueba aqui es la LOGICA de despliegue, que es donde se.decide si la
cookie lleva `Secure`:

  - `PUBLIC_BASE_URL` en https  => cookie `Secure` automaticamente;
  - `PUBLIC_BASE_URL` en http   => cookie sin `Secure` (desarrollo);
  - `SECURE_COOKIES` explicito  => manda el, para poder forzar el caso raro de
    unhttps detras de un proxy que termina TLS.

Y que la aplicacion AVISA cuando la configuracion es incoherente, en vez de
arrancar en silencio con cookies desprotegidas.
"""
import importlib
import os

import pytest

from app.core import config as config_mod


def _recargar(monkeypatch, **variables):
    """Recarga `app.core.config` con las variables indicadas."""
    for k, v in variables.items():
        if v is None:
            monkeypatch.delenv(k, raising=False)
        else:
            monkeypatch.setenv(k, v)
    # El `.env` local no debe interferir en estas comprobaciones.
    monkeypatch.setattr(config_mod, 'load_dotenv', lambda *a, **k: None)
    return importlib.reload(config_mod)


@pytest.fixture(autouse=True)
def _restaurar(monkeypatch):
    """Deja `app.core.config` como estaba al terminar cada prueba."""
    yield
    for k in ('PUBLIC_BASE_URL', 'SECURE_COOKIES', 'MAIL_PROVIDER',
              'SMTP_HOST', 'CORS_ORIGINS'):
        monkeypatch.delenv(k, raising=False)
    importlib.reload(config_mod)


def test_https_en_la_url_publica_activa_la_cookie_segura(monkeypatch):
    m = _recargar(monkeypatch, PUBLIC_BASE_URL='https://app.ejemplo.org',
                  SECURE_COOKIES=None)
    assert m.settings.secure_cookies is True
    assert m.settings.public_base_url == 'https://app.ejemplo.org'


def test_http_en_la_url_publica_no_activa_la_cookie_segura(monkeypatch):
    """Desarrollo local: marcar `Secure` dejaria el login sin cookie."""
    m = _recargar(monkeypatch, PUBLIC_BASE_URL='http://localhost:18080',
                  SECURE_COOKIES=None)
    assert m.settings.secure_cookies is False


def test_secure_cookies_explicito_manda_sobre_la_url(monkeypatch):
    """Proxy que termina TLS: https real con la url publica en http."""
    m = _recargar(monkeypatch, PUBLIC_BASE_URL='http://interno:8000',
                  SECURE_COOKIES='true')
    assert m.settings.secure_cookies is True


def test_secure_cookies_falso_sobre_https_se_puede_exponer(monkeypatch, caplog):
    m = _recargar(monkeypatch, PUBLIC_BASE_URL='https://app.ejemplo.org',
                  SECURE_COOKIES='false')
    assert m.settings.secure_cookies is False
    # Y la aplicacion AVISA: no arranca en silencio con cookies desprotegidas.
    assert any('Secure' in r.message or 'Secure' in r.getMessage()
               for r in caplog.records)


def test_el_enlace_de_recuperacion_usa_la_url_publica(monkeypatch):
    """El enlace del correo debe apuntar al despliegue, no a localhost."""
    _recargar(monkeypatch, PUBLIC_BASE_URL='https://app.ejemplo.org/')
    # `mailer` importa el objeto `settings`: se recarga para que use el nuevo.
    importlib.reload(importlib.import_module('app.services.mailer'))
    mailer = importlib.import_module('app.services.mailer')
    enlace = mailer.build_reset_link('ABC')
    assert enlace.startswith('https://app.ejemplo.org/')
    assert 'token=ABC' in enlace


def test_cors_no_autoriza_un_origen_no_configurado(client):
    """Un origen desconocido NO debe recibir permiso.

    `Access-Control-Allow-Origin: *` es incompatible con credenciales, asi que
    el backend tiene que responder con el origen exacto o con nada.
    """
    r = client.options('/api/auth/login', headers={
        'Origin': 'https://atacante.invalido',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
    })
    assert 'access-control-allow-origin' not in {k.lower() for k in r.headers}


def test_cors_responde_con_credenciales_permitidas(client):
    """El preflight de un origen configurado declara credenciales true."""
    from app.core.config import settings
    origen = settings.cors_origins.split(',')[0].strip()
    r = client.options('/api/auth/login', headers={
        'Origin': origen,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
    })
    assert r.status_code == 200
    assert r.headers.get('access-control-allow-origin') == origen
    assert r.headers.get('access-control-allow-credentials') == 'true'
    # Nunca el asterisco: seria inutil con cookies.
    assert r.headers.get('access-control-allow-origin') != '*'