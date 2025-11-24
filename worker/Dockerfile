FROM python:3.11-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

# Install dependencies from pyproject.toml
COPY pyproject.toml .
RUN pip install --no-cache-dir .

COPY . .

# Production: no --reload flag
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "9000"]
