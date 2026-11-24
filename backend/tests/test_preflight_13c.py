import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "preflight_production.py"


def _env(**overrides):
    env = os.environ.copy()
    env.update({
        "APP_ENV": "production",
        "SCHEMA_MANAGED_EXTERNALLY": "true",
        "DATABASE_URL": "postgresql+psycopg://user@db:5432/app",
        "SECURE_COOKIES": "true",
        "RATE_LIMIT_STORE": "redis",
        "REDIS_URL": "redis://redis:6379/0",
        "MAIL_PROVIDER": "smtp",
        "SMTP_HOST": "smtp.example.test",
        "SMTP_PORT": "587",
        "SMTP_USER": "smtp-user",
        "SMTP_PASSWORD": "placeholder",
        "MAIL_FROM": "no-reply@example.test",
        "PUBLIC_BASE_URL": "https://frontend.example.test",
        "CORS_ORIGINS": "https://frontend.example.test",
        "VITE_DEPLOY_ENV": "production",
        "VITE_API_URL": "/api",
    })
    env.update(overrides)
    return env


def _run(env, *args):
    return subprocess.run(
        [sys.executable, str(SCRIPT), "--root", str(ROOT), *args],
        cwd=ROOT, env=env, capture_output=True, text=True,
    )


def test_preflight_accepts_static_contract_but_does_not_claim_availability():
    result = _run(_env())
    assert result.returncode == 0
    assert "PREFLIGHT_CONFIG_VALID" in result.stdout
    assert "Disponibilidad externa: NO COMPROBADA" in result.stdout
    assert "smtp-password" not in result.stdout.lower()


def test_preflight_rejects_insecure_configuration_without_values():
    result = _run(_env(
        PUBLIC_BASE_URL="http://localhost:8080",
        CORS_ORIGINS="http://localhost:5173",
        VITE_API_URL="http://localhost:8000/api",
    ))
    assert result.returncode == 2
    assert "PUBLIC_BASE_URL" in result.stdout
    assert "CORS_ORIGINS" in result.stdout
    assert "localhost:8000" not in result.stdout


def test_preflight_rejects_secret_named_vite_variable():
    result = _run(_env(VITE_SMTP_PASSWORD="placeholder"))
    assert result.returncode == 2
    assert "VITE_SMTP_PASSWORD" in result.stdout
