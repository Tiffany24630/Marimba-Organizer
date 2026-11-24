"""Rate limiting por IP para los enlaces publicos.

Memoria sirve para desarrollo y pruebas; produccion debe seleccionar Redis
para que varias instancias compartan el mismo limite. Si Redis falla, se lanza
``RateLimitUnavailable``: no se degrada silenciosamente a memoria local.
"""
from __future__ import annotations

import time
from threading import Lock
from typing import Protocol


class RateLimitUnavailable(RuntimeError):
    """El store distribuido no puede aplicar la politica."""


class RateLimitStore(Protocol):
    def comprobar(self, key: str, limit: int, window_s: float,
                  ahora: float | None = None) -> tuple[bool, float]: ...

    def reiniciar(self) -> None: ...

    def inspeccionar(self, key: str, limit: int,
                     ahora: float | None = None) -> int: ...


class InMemoryRateLimitStore:
    """Store por proceso para desarrollo, tests y prueba aislada."""

    def __init__(self) -> None:
        self._ventanas: dict[str, list[float]] = {}
        self._bloqueo = Lock()

    @staticmethod
    def _podar(ahora: float, marcas: list[float], window_s: float) -> None:
        corte = ahora - window_s
        while marcas and marcas[0] <= corte:
            marcas.pop(0)

    def comprobar(self, key: str, limit: int, window_s: float,
                  ahora: float | None = None) -> tuple[bool, float]:
        ahora = time.monotonic() if ahora is None else ahora
        with self._bloqueo:
            marcas = self._ventanas.setdefault(key, [])
            self._podar(ahora, marcas, window_s)
            if len(marcas) < limit:
                marcas.append(ahora)
                return True, 0.0
            reintento = window_s - (ahora - marcas[0])
            return False, max(reintento, 0.0)

    def reiniciar(self) -> None:
        with self._bloqueo:
            self._ventanas.clear()

    def inspeccionar(self, key: str, limit: int,
                     ahora: float | None = None) -> int:
        with self._bloqueo:
            return max(limit - len(self._ventanas.get(key, [])), 0)


class RedisRateLimitStore:
    """Redis con Lua atomico y ventana deslizante."""

    _SCRIPT = """
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local cutoff = tonumber(ARGV[2])
    local limit = tonumber(ARGV[3])
    local window_ms = tonumber(ARGV[4])
    redis.call('ZREMRANGEBYSCORE', key, 0, cutoff)
    local count = redis.call('ZCARD', key)
    if count < limit then
      local member = ARGV[5] .. '-' .. tostring(count)
      redis.call('ZADD', key, now, member)
      redis.call('PEXPIRE', key, window_ms)
      return {1, 0}
    end
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local retry = window_ms
    if oldest[2] then retry = math.max(1, window_ms - (now - tonumber(oldest[2]))) end
    redis.call('PEXPIRE', key, window_ms)
    return {0, retry}
    """

    def __init__(self, client) -> None:
        self.client = client

    @classmethod
    def from_url(cls, url: str) -> 'RedisRateLimitStore':
        try:
            import redis
        except ImportError as exc:  # pragma: no cover - deployment dependency
            raise RateLimitUnavailable(
                'RATE_LIMIT_STORE=redis requiere el paquete redis') from exc
        try:
            return cls(redis.Redis.from_url(url, decode_responses=True))
        except Exception as exc:  # pragma: no cover - deployment dependency
            raise RateLimitUnavailable('No se pudo configurar Redis') from exc

    def comprobar(self, key: str, limit: int, window_s: float,
                  ahora: float | None = None) -> tuple[bool, float]:
        ahora_ms = int((time.time() if ahora is None else ahora) * 1000)
        window_ms = max(1, int(window_s * 1000))
        try:
            result = self.client.eval(
                self._SCRIPT, 1, key, ahora_ms,
                ahora_ms - window_ms, limit, window_ms,
                f'{ahora_ms}-{id(self)}')
            return bool(int(result[0])), max(float(result[1]) / 1000, 0.0)
        except Exception as exc:
            raise RateLimitUnavailable('Redis no esta disponible') from exc

    def reiniciar(self) -> None:
        return None

    def inspeccionar(self, key: str, limit: int,
                     ahora: float | None = None) -> int:
        raise RateLimitUnavailable('Redis no expone inspeccion local')


_limite = 60
_ventana_s = 60.0
_store: RateLimitStore = InMemoryRateLimitStore()


def configurar(limite: int, ventana_s: float,
               store: RateLimitStore | None = None) -> None:
    global _limite, _ventana_s, _store
    _limite = limite
    _ventana_s = ventana_s
    if store is not None:
        _store = store


def configurar_store(store: RateLimitStore) -> None:
    global _store
    _store = store


def reiniciar() -> None:
    _store.reiniciar()


def comprobar(ip: str, ahora: float | None = None) -> tuple[bool, float]:
    return _store.comprobar(ip, _limite, _ventana_s, ahora)


def inspeccionar(ip: str, ahora: float | None = None) -> int:
    return _store.inspeccionar(ip, _limite, ahora)
