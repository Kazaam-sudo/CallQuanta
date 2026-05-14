"""QA worker entrypoint."""

import signal
import time

running = True


def handle_shutdown(signum, frame):
    global running
    print(f"qa-worker received shutdown signal: {signum}")
    running = False


signal.signal(signal.SIGINT, handle_shutdown)
signal.signal(signal.SIGTERM, handle_shutdown)

print("qa-worker placeholder started. Waiting for future analysis jobs...")

while running:
    time.sleep(5)

print("qa-worker stopped gracefully.")
