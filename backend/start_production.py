"""Arranque productivo: migra y solo despues reemplaza el proceso por Uvicorn."""
from __future__ import annotations

import os
import subprocess
import sys


def main() -> int:
    migration = [sys.executable, '-m', 'alembic', 'upgrade', 'head']
    try:
        result = subprocess.run(migration, check=False)
    except OSError as exc:
        print(f'Alembic no pudo ejecutarse ({type(exc).__name__}); Uvicorn no se iniciara.',
              file=sys.stderr)
        return 1
    if result.returncode != 0:
        print(f'Alembic termino con codigo {result.returncode}; Uvicorn no se iniciara.',
              file=sys.stderr)
        return result.returncode or 1

    port = os.environ.get('PORT', '8000')
    server = [
        'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', port,
    ]
    os.execvpe(server[0], server, os.environ.copy())
    return 0  # pragma: no cover - execvpe no retorna si tiene exito


if __name__ == '__main__':
    raise SystemExit(main())
