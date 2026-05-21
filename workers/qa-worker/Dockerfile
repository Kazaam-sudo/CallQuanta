FROM python:3.12-slim
WORKDIR /app
COPY workers/qa-worker/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY workers/qa-worker/worker.py workers/qa-worker/db.py ./
COPY packages/scorecards/default_sales_qa.yaml /app/packages/scorecards/default_sales_qa.yaml
CMD ["python", "worker.py"]
