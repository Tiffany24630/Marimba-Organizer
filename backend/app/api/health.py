from fastapi import APIRouter
from sqlalchemy import text

from app.db.session import engine

router = APIRouter()


@router.get('/health')
def health() -> dict[str, str]:
    """Health check used by Render; it verifies the database connection."""
    with engine.connect() as connection:
        connection.execute(text('SELECT 1'))
    return {'status': 'ok'}
