FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY bot.py ./bot.py
COPY assets/start-welcome.png ./assets/start-welcome.png

CMD ["python", "bot.py"]
