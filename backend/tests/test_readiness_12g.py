from sqlalchemy.exc import OperationalError

from app.api import routes


def test_health_es_liveness_y_ready_consulta_la_base(client):
    assert client.get('/api/health').json() == {'status': 'ok'}
    assert client.get('/api/ready').json() == {'status': 'ready'}


def test_ready_devuelve_503_si_la_base_no_esta_disponible(client, monkeypatch):
    def falla():
        raise OperationalError('select 1', {}, RuntimeError('offline'))

    monkeypatch.setattr(routes.engine, 'connect', falla)
    respuesta = client.get('/api/ready')
    assert respuesta.status_code == 503
    assert 'offline' not in respuesta.text


def test_respuestas_incluyen_headers_de_seguridad_basicos(client):
    respuesta = client.get('/api/health')
    assert respuesta.headers['x-content-type-options'] == 'nosniff'
    assert respuesta.headers['x-frame-options'] == 'DENY'
    assert respuesta.headers['referrer-policy'] == 'strict-origin-when-cross-origin'
