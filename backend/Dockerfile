FROM python:3.13-slim

WORKDIR /app

# Install deps first for better layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY import_stores.py ./import_stores.py

# Create static dirs and non-root user with correct ownership
RUN adduser --disabled-password --gecos '' appuser \
 && mkdir -p /app/static/store-photos \
 && chown -R appuser:appuser /app/static
USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
