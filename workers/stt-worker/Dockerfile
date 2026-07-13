FROM python:3.12-slim
WORKDIR /app
COPY workers/stt-worker/requirements.txt ./requirements.txt
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir -r requirements.txt
COPY workers/stt-worker/ ./
COPY scripts/validate_worker_mode.py ./validate_worker_mode.py
CMD ["sh", "-c", "python /app/validate_worker_mode.py stt && exec python worker.py"]
