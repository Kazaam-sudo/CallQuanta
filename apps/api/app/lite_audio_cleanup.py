"""Safe filesystem cleanup for Telegram Lite's transient source audio."""

from __future__ import annotations

from pathlib import Path


def delete_lite_audio_file(stored_path: str | Path | None, upload_dir: str | Path) -> None:
    """Delete only Lite-prefixed files located directly under the upload root."""

    if not stored_path:
        return

    audio_path = Path(stored_path)
    upload_root = Path(upload_dir).resolve()
    if not audio_path.name.startswith("lite_") or audio_path.parent.resolve() != upload_root:
        raise ValueError("refusing to delete Telegram Lite audio outside the Lite upload location")
    audio_path.unlink(missing_ok=True)
