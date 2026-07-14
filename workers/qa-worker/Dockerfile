FROM python:3.12-slim
WORKDIR /app
COPY workers/qa-worker/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY workers/qa-worker/worker.py workers/qa-worker/release_worker.py workers/qa-worker/db.py workers/qa-worker/transcript_validation.py ./
COPY packages/reliable_queue.py packages/demo_quota.py ./packages/
COPY scripts/validate_worker_mode.py ./validate_worker_mode.py
COPY packages/scorecards/default_sales_qa.yaml /app/packages/scorecards/default_sales_qa.yaml
CMD ["sh", "-c", "python /app/validate_worker_mode.py qa && exec python release_worker.py"]
