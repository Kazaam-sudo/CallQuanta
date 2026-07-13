FROM python:3.12-slim
WORKDIR /app
COPY apps/api/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/api/app ./app
COPY packages/scorecards ./packages/scorecards
COPY scripts/prestart_api.py ./prestart_api.py
COPY scripts/validate_api_environment.py ./validate_api_environment.py
CMD ["sh", "-c", "python /app/validate_api_environment.py && python /app/prestart_api.py && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
