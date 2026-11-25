"""Preflight estatico del contrato de produccion.

No importa la aplicacion, no abre conexiones y no ejecuta migraciones. Solo
comprueba nombres, formatos y archivos locales; por eso un resultado OK no
implica que PostgreSQL, Redis o SMTP esten disponibles.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlparse


LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
SECRET_WORDS = ("SECRET", "PASSWORD", "TOKEN", "API_KEY", "DSN", "DATABASE", "REDIS", "SMTP")


def _is_local(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return host in LOCAL_HOSTS or host.endswith(".local")


def _origin(url: str) -> str:
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")


def _check_environment() -> list[str]:
    errors: list[str] = []
    required = {
        "APP_ENV": "production",
        "SCHEMA_MANAGED_EXTERNALLY": "true",
        "SECURE_COOKIES": "true",
        "RATE_LIMIT_STORE": "redis",
        "MAIL_PROVIDER": "smtp",
        "VITE_DEPLOY_ENV": "production",
        "VITE_API_URL": "/api",
    }
    for name, expected in required.items():
        if os.environ.get(name, "").strip().lower() != expected:
            errors.append(f"{name} debe ser {expected}")

    db = os.environ.get("DATABASE_URL", "").strip().lower()
    if not db.startswith(("postgresql://", "postgresql+psycopg://")):
        errors.append("DATABASE_URL debe ser PostgreSQL")
    if not os.environ.get("REDIS_URL", "").strip():
        errors.append("REDIS_URL es obligatorio")

    base = os.environ.get("PUBLIC_BASE_URL", "").strip()
    parsed_base = urlparse(base)
    if parsed_base.scheme != "https" or not parsed_base.netloc or _is_local(base):
        errors.append("PUBLIC_BASE_URL debe ser una URL HTTPS externa")

    origins = [item.strip() for item in os.environ.get("CORS_ORIGINS", "").split(",") if item.strip()]
    if not origins:
        errors.append("CORS_ORIGINS debe contener al menos un origen")
    for origin in origins:
        parsed = urlparse(origin)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or _is_local(origin):
            errors.append("CORS_ORIGINS contiene un origen local o invalido")
    if base and origins and _origin(base) not in {_origin(item) for item in origins}:
        errors.append("PUBLIC_BASE_URL no esta incluido en CORS_ORIGINS")

    for name in ("SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "MAIL_FROM"):
        if not os.environ.get(name, "").strip():
            errors.append(f"{name} es obligatorio para SMTP")
    try:
        if int(os.environ.get("SMTP_PORT", "0")) <= 0:
            errors.append("SMTP_PORT debe ser positivo")
    except ValueError:
        errors.append("SMTP_PORT debe ser numerico")

    for name, value in os.environ.items():
        if name.startswith("VITE_") and any(word in name.upper() for word in SECRET_WORDS):
            errors.append(f"{name} no puede ser una variable publica VITE_*")
    return errors


def _check_files(root: Path, dist: Path | None) -> list[str]:
    errors: list[str] = []
    vercel = root / "frontend" / "vercel.json"
    main = root / "backend" / "app" / "main.py"
    dockerfile = root / "backend" / "Dockerfile"
    launcher = root / "backend" / "start_production.py"
    vite = root / "frontend" / "vite.config.ts"
    for path in (vercel, main, dockerfile, launcher, vite):
        if not path.is_file():
            errors.append(f"falta el archivo requerido: {path.relative_to(root)}")
    if vercel.is_file():
        content = vercel.read_text(encoding="utf-8")
        if '"source": "/api/:path*"' not in content or '"destination"' not in content:
            errors.append("el proxy /api de Vercel no esta configurado")
    if vite.is_file() and "VITE_DEPLOY_ENV" not in vite.read_text(encoding="utf-8"):
        errors.append("Vite no declara VITE_DEPLOY_ENV")
    if main.is_file():
        content = main.read_text(encoding="utf-8")
        if "schema_managed_externally" not in content:
            errors.append("no se observa la barrera de DDL de produccion")
    if dockerfile.is_file():
        content = dockerfile.read_text(encoding="utf-8")
        inline_launcher = ("python -m alembic upgrade head" in content and
                           "uvicorn app.main:app" in content)
        if "start_production.py" not in content and not inline_launcher:
            errors.append("Dockerfile no ejecuta migraciones antes de Uvicorn")
    if launcher.is_file():
        content = launcher.read_text(encoding="utf-8")
        if "alembic" not in content or "upgrade" not in content or "execvpe" not in content:
            errors.append("launcher productivo no demuestra Alembic antes de Uvicorn")

    if dist is not None:
        if not dist.is_dir():
            errors.append("el directorio del bundle indicado no existe")
        else:
            for path in dist.rglob("*"):
                if path.is_file() and path.suffix in {".js", ".css", ".html", ".map"}:
                    content = path.read_text(encoding="utf-8", errors="ignore")
                    if re.search(r"https?://(?:localhost|127\\.0\\.0\\.1)(?::|/|$)", content, re.I):
                        errors.append("el bundle contiene una URL localhost")
                    if re.search(r"(?:DATABASE_URL|REDIS_URL|SMTP_PASSWORD|SECRET_KEY|API_KEY)", content, re.I):
                        errors.append("el bundle contiene el nombre de una variable secreta")
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Valida estaticamente el contrato de produccion")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--dist", type=Path, help="bundle local ya construido para inspeccionar")
    args = parser.parse_args(argv)
    root = args.root.resolve()
    dist = args.dist.resolve() if args.dist else None
    errors = _check_environment() + _check_files(root, dist)
    if errors:
        print("PREFLIGHT_CONFIG_INVALID")
        for error in errors:
            print(f"- {error}")
        print("Disponibilidad externa: NO COMPROBADA")
        return 2
    print("PREFLIGHT_CONFIG_VALID")
    print("Configuracion estatica: valida")
    print("Disponibilidad externa: NO COMPROBADA")
    print("Migraciones externas: NO EJECUTADAS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
