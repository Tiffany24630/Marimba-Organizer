FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY tests ./tests
COPY alembic.ini .
COPY alembic ./alembic
COPY start_production.py .
# Render injects PORT (10000 by default). Keep 8000 as the local fallback.
CMD ["python", "start_production.py"]
