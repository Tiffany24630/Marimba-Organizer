"""
Fase 9G - caducidad OPCIONAL de enlaces publicos.
Semantica: None = sin caducidad (9E intacto); futuro = 200;
pasado/ahora (<= now) = 404 indistinguible del inexistente.
Determinista: se manipula la fila en base para simular el tiempo.
"""
from datetime import datetime, timedelta, timezone
from app.db.session import SessionLocal
from app.models import PublicCompositionLink
from app.core.security import token_fingerprint
from conftest import logout
from test_enlace_publico_9e import (_base, _colaborar, _como, _crear, OWNER,
                                    EDITOR, READER, AJENO)


def _futuro(horas=48):
    return (datetime.now(timezone.utc)
            + timedelta(hours=horas)).isoformat()


def _vencer_en_base(cid, cuando):
    db = SessionLocal()
    try:
        link = (db.query(PublicCompositionLink)
                .filter(PublicCompositionLink.composition_id == cid).first())
        assert link is not None
        link.expires_at = cuando
        db.commit()
    finally:
        db.close()


def test_9g_crear_sin_caducidad_sigue_funcionando(client):
    _como(client, OWNER)
    _, cid = _base('9g sin cad')
    r = client.post(f'/api/compositions/{cid}/public-link', json={})
    assert r.status_code == 200, r.text
    assert r.json()['expires_at'] is None
    logout(client)
    assert client.get(
        f'/api/public/compositions/{r.json()["token"]}').status_code == 200


def test_9g_crear_con_caducidad_futura_la_persiste(client):
    _como(client, OWNER)
    _, cid = _base('9g futura')
    r = client.post(f'/api/compositions/{cid}/public-link',
                    json={'expires_at': _futuro()})
    assert r.status_code == 200, r.text
    assert r.json()['expires_at'] is not None
    logout(client)
    assert client.get(
        f'/api/public/compositions/{r.json()["token"]}').status_code == 200

def test_9g_fecha_pasada_se_rechaza(client):
    _como(client, OWNER)
    _, cid = _base('9g pasada')
    pasado = (datetime.now(timezone.utc)
              - timedelta(hours=1)).isoformat()
    r = client.post(f'/api/compositions/{cid}/public-link',
                    json={'expires_at': pasado})
    assert r.status_code == 422, r.text


def test_9g_fecha_invalida_se_rechaza(client):
    _como(client, OWNER)
    _, cid = _base('9g invalida')
    r = client.post(f'/api/compositions/{cid}/public-link',
                    json={'expires_at': 'manana-a-mediodia'})
    assert r.status_code == 422, r.text


def test_9g_formato_sin_zona_se_acepta_como_utc(client):
    _como(client, OWNER)
    _, cid = _base('9g naive')
    naive = (datetime.now(timezone.utc)
             + timedelta(hours=5)).strftime('%Y-%m-%dT%H:%M:%S')
    r = client.post(f'/api/compositions/{cid}/public-link',
                    json={'expires_at': naive})
    assert r.status_code == 200, r.text
    assert r.json()['expires_at'] is not None


def test_9g_expirado_responde_404_indistinguible(client):
    _como(client, OWNER)
    _, cid = _base('9g expira')
    token = _crear(client, cid)
    _vencer_en_base(cid, datetime.now(timezone.utc) - timedelta(seconds=5))
    logout(client)
    expirado = client.get(f'/api/public/compositions/{token}')
    inexistente = client.get('/api/public/compositions/9g-no-existe-jamas')
    assert expirado.status_code == 404
    assert expirado.json() == inexistente.json()
    assert 'expir' not in str(expirado.json()).lower()


def test_9g_frontera_ahora_mismo_cuenta_como_expirado(client):
    _como(client, OWNER)
    _, cid = _base('9g frontera')
    token = _crear(client, cid)
    _vencer_en_base(cid, datetime.now(timezone.utc))
    logout(client)
    assert client.get(f'/api/public/compositions/{token}').status_code == 404


def test_9g_expirado_no_revela_nada_interno(client):
    _como(client, OWNER)
    _, cid = _base('9g sin fuga')
    token = _crear(client, cid)
    _vencer_en_base(cid, datetime.now(timezone.utc) - timedelta(seconds=5))
    logout(client)
    texto = str(client.get(
        f'/api/public/compositions/{token}').json()).lower()
    for prohibido in ('expir', 'revok', 'token', 'composition_id',
                      'project_id', 'owner', 'version'):
        assert prohibido not in texto, prohibido


def test_9g_estado_marca_expirado_solo_al_propietario(client):
    _como(client, OWNER)
    _, cid = _base('9g estado')
    _crear(client, cid)
    _vencer_en_base(cid, datetime.now(timezone.utc) - timedelta(seconds=5))
    r = client.get(f'/api/compositions/{cid}/public-link')
    assert r.status_code == 200, r.text
    assert r.json()['active'] is False
    assert r.json()['expired'] is True


def test_9g_editor_y_lector_no_configuran_caducidad(client):
    _como(client, OWNER)
    pid, cid = _base('9g permisos')
    _colaborar(pid, EDITOR, 'editor')
    _colaborar(pid, READER, 'reader')
    for quien in (EDITOR, READER, AJENO):
        _como(client, quien)
        r = client.post(f'/api/compositions/{cid}/public-link',
                        json={'expires_at': _futuro()})
        assert r.status_code == 404, (quien, r.text)
    logout(client)
    r = client.post(f'/api/compositions/{cid}/public-link',
                    json={'expires_at': _futuro()})
    assert r.status_code in (401, 403, 404), r.text


def test_9g_revocar_y_recrear_permite_nueva_caducidad(client):
    _como(client, OWNER)
    _, cid = _base('9g recrea')
    viejo = _crear(client, cid)
    assert client.delete(
        f'/api/compositions/{cid}/public-link').status_code == 200
    r = client.post(f'/api/compositions/{cid}/public-link',
                    json={'expires_at': _futuro(72)})
    assert r.status_code == 200, r.text
    assert r.json()['token'] != viejo
    assert r.json()['expires_at'] is not None
    logout(client)
    assert client.get(
        f'/api/public/compositions/{viejo}').status_code == 404
    assert client.get(
        f'/api/public/compositions/{r.json()["token"]}').status_code == 200


def test_9g_expiracion_de_A_no_afecta_a_B(client):
    _como(client, OWNER)
    _, cid_a = _base('9g A')
    _, cid_b = _base('9g B')
    tok_a = _crear(client, cid_a)
    tok_b = _crear(client, cid_b)
    _vencer_en_base(cid_a, datetime.now(timezone.utc) - timedelta(seconds=5))
    logout(client)
    assert client.get(f'/api/public/compositions/{tok_a}').status_code == 404
    assert client.get(f'/api/public/compositions/{tok_b}').status_code == 200


def test_9g_enlaces_9e_existentes_siguen_sin_caducidad(client):
    _como(client, OWNER)
    _, cid = _base('9g legacy')
    token = _crear(client, cid)
    db = SessionLocal()
    try:
        link = (db.query(PublicCompositionLink)
                .filter(PublicCompositionLink.token_hash
                        == token_fingerprint(token)).first())
        assert link is not None and link.expires_at is None
    finally:
        db.close()
    logout(client)
    assert client.get(
        f'/api/public/compositions/{token}').status_code == 200


def test_9g_respuesta_publica_sigue_sin_ids_internos(client):
    _como(client, OWNER)
    _, cid = _base('9g contrato')
    r = client.post(f'/api/compositions/{cid}/public-link',
                    json={'expires_at': _futuro()})
    assert r.status_code == 200, r.text
    logout(client)
    cuerpo = client.get(
        f'/api/public/compositions/{r.json()["token"]}').json()
    assert set(cuerpo) == {'name', 'width', 'height', 'data',
                           'song_name', 'project_name'}