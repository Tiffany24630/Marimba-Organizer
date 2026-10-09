"""Fase 9J - rate-limit del acceso publico por token.

Capa adicional anti-escaneo masivo sobre `GET /api/public/compositions/{token}`.
NO reemplaza la defensa criptografica (token_urlsafe(32) + SHA-256) ni cambia
la semantica 9E/9G: dentro del limite todo sigue igual (200/404 uniformes);
fuera del limite, 429 uniforme sin revelar existencia del recurso.

Diseno (ver FASE_9J_RATE_LIMIT_PUBLIC.md):
- Ventana deslizante en memoria del proceso, por IP de conexion directa
  (`request.client.host`; sin confiar en X-Forwarded-For: no hay cadena de
  proxy confiable configurada).
- Politica por defecto: 60 req / 60 s por IP. Configurable por entorno
  (`PUBLIC_LINK_RATE_LIMIT`, `PUBLIC_LINK_RATE_WINDOW_S`).
- Solo el GET publico por token. `GET /api/public-links` (autenticado) y las
  operaciones del propietario NO se limitan.
- Sin cambio de esquema, sin contadores en tablas de negocio, sin Redis.
- Limitacion documentada: por proceso (uvicorn actual = 1 worker).
"""
import time
from threading import Lock

_limite = 60
_ventana_s = 60.0
_ventanas: dict[str, list[float]] = {}
_bloqueo = Lock()


def configurar(limite: int, ventana_s: float) -> None:
    """Fija la politica (tests/E2E usan valores pequenos y deterministas)."""
    global _limite, _ventana_s
    _limite = limite
    _ventana_s = ventana_s


def reiniciar() -> None:
    """Vacia todos los contadores (aislamiento entre tests)."""
    with _bloqueo:
        _ventanas.clear()


def _podar(ahora: float, marcas: list[float]) -> None:
    corte = ahora - _ventana_s
    while marcas and marcas[0] <= corte:
        marcas.pop(0)


def comprobar(ip: str, ahora: float | None = None) -> tuple[bool, float]:
    """Registra un intento y dice si pasa.

    Devuelve `(permitido, reintento_en_s)`. Con `permitido=False`,
    `reintento_en_s` es el tiempo hasta que la ventana libera un hueco
    (para el header `Retry-After`).
    """
    ahora = time.monotonic() if ahora is None else ahora
    with _bloqueo:
        marcas = _ventanas.setdefault(ip, [])
        _podar(ahora, marcas)
        if len(marcas) < _limite:
            marcas.append(ahora)
            return True, 0.0
        reintento = _ventana_s - (ahora - marcas[0]) if marcas else _ventana_s
        return False, max(reintento, 0.0)


def inspeccionar(ip: str, ahora: float | None = None) -> int:
    """Solicitudes restantes en la ventana (para tests, sin registrar)."""
    ahora = time.monotonic() if ahora is None else ahora
    with _bloqueo:
        marcas = _ventanas.get(ip, [])
        _podar(ahora, marcas)
        return max(_limite - len(marcas), 0)
