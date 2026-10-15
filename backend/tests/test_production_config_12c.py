import os
import subprocess
import sys


def _import_config(**overrides):
    env = os.environ.copy()
    env.update({
        'APP_ENV': 'production',
        'DATABASE_URL': 'postgresql+psycopg://user@db:5432/app',
        'SCHEMA_MANAGED_EXTERNALLY': 'true',
        'CORS_ORIGINS': 'https://frontend.example.test',
        'PUBLIC_BASE_URL': 'https://frontend.example.test',
        'MAIL_PROVIDER': 'smtp',
        'SMTP_HOST': 'smtp.example.test',
        'SMTP_PORT': '587',
        'SMTP_USER': 'smtp-user',
        'SMTP_PASSWORD': 'smtp-placeholder',
        'SMTP_USE_TLS': 'true',
        'MAIL_FROM': 'no-reply@example.test',
        'SECURE_COOKIES': 'true',
        'RATE_LIMIT_STORE': 'redis',
        'REDIS_URL': 'redis://redis:6379/0',
    })
    env.update(overrides)
    return subprocess.run(
        [sys.executable, '-c', 'from app.core.config import settings'],
        cwd=os.path.dirname(os.path.dirname(__file__)),
        env=env,
        capture_output=True,
        text=True,
    )


def test_production_rejects_local_defaults():
    result = _import_config(
        DATABASE_URL='sqlite:///./marimba.db',
        PUBLIC_BASE_URL='http://localhost:8080',
        CORS_ORIGINS='http://localhost:5173',
        MAIL_PROVIDER='console',
        SCHEMA_MANAGED_EXTERNALLY='false',
    )
    assert result.returncode != 0
    assert 'Configuración de producción inválida' in result.stderr
    assert 'sqlite:///./marimba.db' not in result.stderr


def test_production_accepts_external_postgres_and_smtp_config():
    result = _import_config()
    assert result.returncode == 0, result.stderr
