from datetime import timedelta
from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import load_dotenv

load_dotenv(dotenv_path=".env")
env = load_dotenv(dotenv_path=".env", override=True)

class Settings(BaseSettings):
    database_url: str = "sqlite:///./marimba.db"
    cors_origins: str = "http://localhost:5173,http://localhost:4173"
    # En producción el esquema debe prepararse con `alembic upgrade head`.
    # Desarrollo y tests conservan create_all para no romper el flujo local.
    schema_managed_externally: bool = False

    # --- Fase 7C: sesiones ---
    # Duracion de la sesion del navegador. Caduca y hay que volver a entrar.
    session_ttl_minutes: int = 720
    # Cookie segura (solo HTTPS). Se activa sola si `public_base_url` es https.
    secure_cookies: bool | None = None
    # Origen publico, usado para construir el enlace de recuperacion.
    public_base_url: str = "http://localhost:5173"

    # --- Fase 7C: correo (recuperacion de contrasena) ---
    # 'console' imprime el enlace por salida estandar: es el modo de desarrollo,
    # identifiedo como tal, y NO simula un envio real. En produccion debe
    # configurarse 'smtp' con las variables de abajo.
    mail_provider: str = "console"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = True
    mail_from: str = "no-reply@marimba.local"

    # --- Fase 7C: recuperacion de contrasena ---
    reset_ttl_minutes: int = 60
    # Ventana de antiguedad maxima de la ultima peticion por IP/correo, para
    # frenar el envio masivo de correos.
    reset_rate_limit_minutes: int = 15

    # --- Fase 9J: rate-limit del acceso publico por token ---
    # Ventana deslizante por IP de conexion directa. 60 req / 60 s por defecto:
    # frena escaneos masivos sin molestar a un visitante legitimo (una sola
    # peticion por apertura del enlace). Sin efecto sobre `public-links`
    # (autenticado) ni sobre operaciones del propietario.
    public_link_rate_limit: int = 60
    public_link_rate_window_s: int = 60

    # --- Fase 7C: usuario tecnico de migracion ---
    # Correo del usuario NORMAL que hereda los proyectos historicos. La
    # contrasena inicial SOLO se lee del entorno: nunca se codifica aqui.
    migration_user_email: str = "migracion@marimba.local"
    migration_user_name: str = "Usuario de migración"
    # Si se define (en el entorno, nunca en el repo), se crea/actualiza ese
    # usuario con esa contrasena. Sin esta variable NO se crea la cuenta.
    #
    # Campo TIPADO a proposito: `BaseSettings` lo lee de `MIGRATION_USER_PASSWORD`
    # y, si no esta definido, vale None. Leer el entorno aqui a mano
    # (`os.environ.get(...)` sin anotacion) no es valido en Pydantic v2 y hacia
    # fallar la importacion de TODO el backend.
    migration_user_password: str | None = None

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()

# Si no se indica explicitamente, la cookie va en modo seguro cuando el sitio
# publico es https. Evita que un despliegue https sirva cookies por http.
if settings.secure_cookies is None:
    settings.secure_cookies = settings.public_base_url.startswith("https://")

# --- Fase 7G: coherencia de la configuracion de despliegue -----------------
# public_base_url decide dos cosas: si la cookie lleva Secure y como se
# construyen los enlaces de recuperacion. Si el despliegue real es HTTPS pero
# la variable sigue apuntando a localhost:5173 (Vite en desarrollo), los
# enlaces de recuperacion NO funcionan y la cookie no viaja segura. Aqui solo
# se AVISA al arrancar: no se rompe el desarrollo local ni se adivina una URL.
import logging as _logging
_log = _logging.getLogger(__name__)

if not settings.public_base_url.startswith(('http://', 'https://')):
    _log.error('PUBLIC_BASE_URL no parece una URL http(s): %r. Los enlaces de '
               'recuperacion serian inservibles.', settings.public_base_url)

if settings.public_base_url.startswith('https://') and not settings.secure_cookies:
    _log.warning('PUBLIC_BASE_URL es https pero SECURE_COOKIES=false: las '
                 'cookies de sesion viajarian sin la marca Secure.')

if (settings.mail_provider or '').lower() == 'smtp':
    if not settings.smtp_host:
        _log.error('MAIL_PROVIDER=smtp pero SMTP_HOST esta vacio: el envio de '
                   'correos fallara. Configura SMTP_HOST o vuelve a console.')
    if 'localhost' in settings.public_base_url:
        _log.error('MAIL_PROVIDER=smtp y PUBLIC_BASE_URL apunta a %s: los '
                   'enlaces se generaran con una URL que no es la del '
                   'despliegue real.', settings.public_base_url)

SESSION_TTL = timedelta(minutes=settings.session_ttl_minutes)
RESET_TTL = timedelta(minutes=settings.reset_ttl_minutes)
