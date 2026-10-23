FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 U2NET_HOME=/models PASSPORT_MODEL_NAME=birefnet-portrait
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && mkdir -p /models && useradd --system --uid 10001 --create-home appuser
COPY app.py .
USER appuser
EXPOSE 8080
CMD ["uvicorn","app:app","--host","0.0.0.0","--port","8080","--no-access-log"]
