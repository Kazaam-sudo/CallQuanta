"""STT worker entrypoint."""

import signal
import time

running = True


def handle_shutdown(signum, frame):
    global running
    print(f"stt-worker received shutdown signal: {signum}")
    running = False


signal.signal(signal.SIGINT, handle_shutdown)
signal.signal(signal.SIGTERM, handle_shutdown)

print("stt-worker placeholder started. Waiting for future transcription jobs...")

while running:
    time.sleep(5)

print("stt-worker stopped gracefully.")
