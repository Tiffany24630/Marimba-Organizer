from app.core import rate_limit
from app.core.rate_limit import (InMemoryRateLimitStore, RedisRateLimitStore,
                                  RateLimitUnavailable)


class FakeRedis:
    """Fixture local que ejecuta la semantica del script sobre un store comun."""

    def __init__(self):
        self.entries = {}
        self.calls = 0

    def eval(self, script, keys, key, now, cutoff, limit, window_ms, nonce):
        self.calls += 1
        values = [(score, member) for score, member in self.entries.get(key, [])
                  if score > cutoff]
        if len(values) < int(limit):
            values.append((now, f'{nonce}-{len(values)}'))
            self.entries[key] = values
            return [1, 0]
        retry = max(1, int(window_ms) - (now - min(x[0] for x in values)))
        self.entries[key] = values
        return [0, retry]


def test_dos_stores_en_memoria_son_independientes():
    a, b = InMemoryRateLimitStore(), InMemoryRateLimitStore()
    assert a.comprobar('ip', 1, 60, ahora=100)[0] is True
    assert a.comprobar('ip', 1, 60, ahora=101)[0] is False
    assert b.comprobar('ip', 1, 60, ahora=101)[0] is True


def test_dos_instancias_redis_comparten_el_limite_y_usam_operacion_atomica():
    redis = FakeRedis()
    a, b = RedisRateLimitStore(redis), RedisRateLimitStore(redis)
    assert a.comprobar('ip', 2, 60, ahora=100)[0] is True
    assert b.comprobar('ip', 2, 60, ahora=101)[0] is True
    assert a.comprobar('ip', 2, 60, ahora=102)[0] is False
    assert redis.calls == 3


class FailingStore:
    def comprobar(self, *args, **kwargs):
        raise RateLimitUnavailable('redis no disponible')


def test_redis_indisponible_responde_503_controlado_sin_fallback(client,
                                                                  monkeypatch):
    monkeypatch.setattr(rate_limit, '_store', FailingStore())
    response = client.get('/api/public/compositions/token-de-prueba')
    assert response.status_code == 503
    assert response.headers.get('Retry-After') == '5'
    assert 'redis' not in response.text.lower()
    assert 'traceback' not in response.text.lower()
