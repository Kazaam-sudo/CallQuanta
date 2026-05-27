FROM python:3.12-slim
WORKDIR /app
COPY apps/api/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/api/app ./app
COPY packages/scorecards ./packages/scorecards
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
