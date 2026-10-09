"""Fase 9J - rate-limit del acceso publico por token.

Politica: N req / M s por IP de conexion directa (defecto 60/60, configurable
por entorno). Los tests fijan una politica pequena (5 req / 60 s) con
`rate_limit.configurar()` y usan tiempo controlado donde hace falta; la
ventana solo necesita UN desplazamiento corto (1.1 s) en un caso.

Solo `GET /api/public/compositions/{token}` se limita: `public-links`
(autenticado) y crear/revocar del propietario quedan fuera. Dentro del limite
la semantica 9E/9G esta intacta (200/404 uniformes); fuera, 429 uniforme con
`Retry-After` real y sin secretos.
"""
import time

import pytest

from app.core import rate_limit
from conftest import logout
from test_enlace_publico_9e import _base, _como, _crear, OWNER, EDITOR
from test_caducidad_9g import _vencer_en_base
from datetime import datetime, timedelta, timezone

LIMITE = 5


@pytest.fixture(autouse=True)
def _politica_pequena():
    rate_limit.configurar(LIMITE, 60.0)
    rate_limit.reiniciar()
    yield
    rate_limit.configurar(60, 60.0)
    rate_limit.reiniciar()


def _publica(client, token):
    return client.get(f'/api/public/compositions/{token}')


def _token(client, nombre='9j base'):
    _como(client, OWNER)
    _, cid = _base(nombre)
    token = _crear(client, cid)
    logout(client)
    return token, cid


def test_9j_b01_debajo_del_limite_respuesta_normal(client):
    token, _ = _token(client)
    for _ in range(LIMITE - 1):
        r = _publica(client, token)
        assert r.status_code == 200, r.text


def test_9j_b02_limite_exacto_sigue_permitido(client):
    token, _ = _token(client)
    for _ in range(LIMITE):
        assert _publica(client, token).status_code == 200


def test_9j_b03_exceso_responde_429(client):
    token, _ = _token(client)
    for _ in range(LIMITE):
        assert _publica(client, token).status_code == 200
    r = _publica(client, token)
    assert r.status_code == 429, r.text


def test_9j_b04_retry_after_existe_y_es_valido(client):
    token, _ = _token(client)
    for _ in range(LIMITE):
        _publica(client, token)
    r = _publica(client, token)
    assert r.status_code == 429
    espera = r.headers.get('retry-after')
    assert espera is not None, 'debe anunciar Retry-After'
    assert 1 <= int(espera) <= 60, espera


def test_9j_b05_ventana_liberada_vuelve_a_permitir(client):
    rate_limit.configurar(2, 1.0)
    rate_limit.reiniciar()
    token, _ = _token(client)
    assert _publica(client, token).status_code == 200
    assert _publica(client, token).status_code == 200
    assert _publica(client, token).status_code == 429
    time.sleep(1.1)
    assert _publica(client, token).status_code == 200


def test_9j_b06_token_invalido_dentro_del_limite_404(client):
    logout(client)
    assert _publica(client, 'no-existe-9j').status_code == 404


def test_9j_b07_token_revocado_dentro_del_limite_404(client):
    _como(client, OWNER)
    _, cid = _base('9j revocado')
    token = _crear(client, cid)
    assert client.delete(f'/api/compositions/{cid}/public-link').status_code == 200
    logout(client)
    assert _publica(client, token).status_code == 404


def test_9j_b08_token_expirado_dentro_del_limite_404(client):
    _como(client, OWNER)
    _, cid = _base('9j expirado')
    token = _crear(client, cid)
    _vencer_en_base(cid, datetime.now(timezone.utc) - timedelta(seconds=5))
    logout(client)
    assert _publica(client, token).status_code == 404


def test_9j_b09_aislamiento_por_ip(client):
    # TestClient comparte IP (testclient); se comprueba el aislamiento a nivel
    # de unidad del limitador: consumir la cuota de una IP no afecta a otra.
    rate_limit.configurar(1, 60.0)
    rate_limit.reiniciar()
    assert rate_limit.comprobar('10.9j.0.1') == (True, 0.0)
    assert rate_limit.comprobar('10.9j.0.1')[0] is False
    assert rate_limit.comprobar('10.9j.0.2')[0] is True
    assert rate_limit.inspeccionar('10.9j.0.2') == 0


def test_9j_b10_respuesta_429_sin_secretos(client):
    token, _ = _token(client)
    for _ in range(LIMITE):
        _publica(client, token)
    r = _publica(client, token)
    assert r.status_code == 429
    texto = r.text.lower()
    for prohibido in ('token', 'hash', 'user_id', 'composition_id',
                      'project_id', 'password', 'owner_id'):
        assert prohibido not in texto, prohibido


def test_9j_b11_public_links_no_afectado(client):
    token, _ = _token(client, '9j no afectado')
    _como(client, OWNER)
    for _ in range(LIMITE + 3):
        r = client.get('/api/public-links')
        assert r.status_code == 200, r.text
    assert any(x['composition_name'] == 'Composicion publica'
               for x in r.json())


def test_9j_b12_crear_y_revocar_no_afectados(client):
    _como(client, OWNER)
    _, cid = _base('9j intacto')
    for _ in range(LIMITE + 3):
        token = _crear(client, cid)
        assert client.get('/api/public-links').status_code == 200
    assert client.delete(f'/api/compositions/{cid}/public-link').status_code == 200
    logout(client)
    assert _publica(client, token).status_code == 404
