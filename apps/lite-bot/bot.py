"""Small Telegram long-polling adapter for the CallQuanta Lite demo.

The bot is intentionally thin: Telegram owns the chat history, the API owns
the short-lived processing copy and quota, and workers own transcription/QA.
"""

from __future__ import annotations

import logging
import json
import mimetypes
import os
import signal
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

import requests


logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
logger = logging.getLogger("callquanta.lite-bot")

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
BOT_ENABLED = os.environ.get("TELEGRAM_BOT_ENABLED", "false").lower() in {"1", "true", "yes", "on"}
API_BASE_URL = os.environ.get("LITE_API_BASE_URL", "http://api:8000").rstrip("/")
SERVICE_TOKEN = os.environ.get("LITE_SERVICE_TOKEN", "").strip()
MAX_FILE_BYTES = int(os.environ.get("LITE_MAX_UPLOAD_BYTES", str(18 * 1024 * 1024)) or "0")
MAX_DURATION_SECONDS = int(os.environ.get("LITE_MAX_DURATION_SECONDS", "1200") or "0")
POLL_TIMEOUT_SECONDS = int(os.environ.get("LITE_POLL_TIMEOUT_SECONDS", "25") or "25")
DEFAULT_LANGUAGE = os.environ.get("LITE_DEFAULT_LANGUAGE", "ru").strip() or "ru"
SUPPORTED_TELEGRAM_LANGUAGE_CODES = {"en", "ru", "uz", "es", "pt", "de", "fr", "tr", "ar"}
WELCOME_IMAGE_PATH = Path(__file__).resolve().parent / "assets" / "start-welcome.png"
START_MESSAGE = (
    "Привет! Я CallQuanta Lite — бот для оценки качества звонков.\n\n"
    "Отправьте голосовое сообщение или аудиофайл до 20 минут и до 18 МБ. "
    "Я подготовлю оценку по критериям, ключевые выводы и рекомендации.\n\n"
    "Сейчас доступны 3 бесплатных анализа. Попробуйте анализ сейчас!"
)
REPORT_LABELS = {
    "ru": {
        "done": "✅ Анализ готов", "score": "Оценка", "summary": "Краткий вывод",
        "criteria": "Критерии", "findings": "Что улучшить",
        "remaining": "Осталось бесплатных анализов: {count}.",
        "paid_remaining": "Осталось оплаченных анализов: {count}.",
    },
    "en": {
        "done": "✅ Analysis complete", "score": "Score", "summary": "Summary",
        "criteria": "Criteria", "findings": "What to improve",
        "remaining": "Free analyses remaining: {count}.",
        "paid_remaining": "Paid analyses remaining: {count}.",
    },
    "uz": {
        "done": "✅ Tahlil tayyor", "score": "Baho", "summary": "Qisqacha xulosa",
        "criteria": "Mezonlar", "findings": "Nimani yaxshilash kerak",
        "remaining": "Qolgan bepul tahlillar: {count}.",
        "paid_remaining": "Qolgan pullik tahlillar: {count}.",
    },
    "es": {
        "done": "✅ Análisis listo", "score": "Puntuación", "summary": "Resumen",
        "criteria": "Criterios", "findings": "Qué mejorar",
        "remaining": "Análisis gratuitos restantes: {count}.",
        "paid_remaining": "Análisis de pago restantes: {count}.",
    },
    "pt": {
        "done": "✅ Análise concluída", "score": "Pontuação", "summary": "Resumo",
        "criteria": "Critérios", "findings": "O que melhorar",
        "remaining": "Análises gratuitas restantes: {count}.",
        "paid_remaining": "Análises pagas restantes: {count}.",
    },
    "de": {
        "done": "✅ Analyse abgeschlossen", "score": "Bewertung", "summary": "Kurzfazit",
        "criteria": "Kriterien", "findings": "Verbesserungsvorschläge",
        "remaining": "Kostenlose Analysen übrig: {count}.",
        "paid_remaining": "Bezahlte Analysen übrig: {count}.",
    },
    "fr": {
        "done": "✅ Analyse terminée", "score": "Évaluation", "summary": "Résumé",
        "criteria": "Critères", "findings": "Points à améliorer",
        "remaining": "Analyses gratuites restantes : {count}.",
        "paid_remaining": "Analyses payantes restantes : {count}.",
    },
    "tr": {
        "done": "✅ Analiz tamamlandı", "score": "Puan", "summary": "Kısa özet",
        "criteria": "Kriterler", "findings": "Geliştirilmesi gerekenler",
        "remaining": "Kalan ücretsiz analiz: {count}.",
        "paid_remaining": "Kalan ücretli analiz: {count}.",
    },
    "ar": {
        "done": "✅ اكتمل التحليل", "score": "التقييم", "summary": "ملخص",
        "criteria": "المعايير", "findings": "ما الذي يمكن تحسينه",
        "remaining": "التحليلات المجانية المتبقية: {count}.",
        "paid_remaining": "التحليلات المدفوعة المتبقية: {count}.",
    },
}
LIMIT_REACHED_TEXT = os.environ.get("LITE_LIMIT_REACHED_TEXT", "").strip()
TELEGRAM_API = f"https://api.telegram.org/bot{BOT_TOKEN}"
STOP = False


def _clip(value: Any, limit: int = 700) -> str:
    text = str(value or "").strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _safe_filename(value: str | None, fallback: str) -> str:
    name = Path(value or fallback).name
    suffix = Path(name).suffix.lower()
    allowed = {".wav", ".mp3", ".m4a", ".ogg", ".opus", ".flac", ".webm"}
    return name if suffix in allowed else fallback


def _language_for_message(message: dict[str, Any]) -> str:
    """Use the Telegram client's selected UI language when supported."""
    sender = message.get("from") or {}
    language_code = str(sender.get("language_code") or "").strip().lower().replace("_", "-")
    if language_code and language_code.split("-", 1)[0] in SUPPORTED_TELEGRAM_LANGUAGE_CODES:
        return language_code
    return DEFAULT_LANGUAGE


class TelegramClient:
    def call(self, method: str, params: dict[str, Any] | None = None, *, timeout: tuple[int, int] = (10, 40)) -> dict[str, Any]:
        response = requests.post(f"{TELEGRAM_API}/{method}", data=params or {}, timeout=timeout)
        try:
            payload = response.json()
        except ValueError as exc:
            raise RuntimeError(f"Telegram returned invalid JSON ({response.status_code})") from exc
        if not response.ok or not payload.get("ok"):
            raise RuntimeError(f"Telegram API error for {method}: {payload.get('description', response.status_code)}")
        return payload["result"]

    def send_message(self, chat_id: int, text: str, reply_markup: dict[str, Any] | None = None) -> None:
        params: dict[str, Any] = {"chat_id": chat_id, "text": _clip(text, 4000)}
        if reply_markup:
            params["reply_markup"] = json.dumps(reply_markup, ensure_ascii=False)
        self.call("sendMessage", params, timeout=(10, 30))

    def send_invoice(self, chat_id: int, order: dict[str, Any]) -> None:
        params: dict[str, Any] = {
            "chat_id": chat_id,
            "title": order["title"],
            "description": order["description"],
            "payload": order["invoice_payload"],
            "provider_token": "",
            "currency": "XTR",
            "prices": json.dumps([{"label": order["title"], "amount": int(order["stars_amount"])}], ensure_ascii=False),
            "start_parameter": "callquanta-lite",
        }
        if order.get("subscription_period"):
            params["subscription_period"] = str(int(order["subscription_period"]))
        self.call("sendInvoice", params, timeout=(10, 30))

    def answer_pre_checkout_query(self, query_id: str, ok: bool, error_message: str | None = None) -> None:
        params: dict[str, Any] = {"pre_checkout_query_id": query_id, "ok": "true" if ok else "false"}
        if error_message:
            params["error_message"] = _clip(error_message, 200)
        self.call("answerPreCheckoutQuery", params, timeout=(3, 5))

    def answer_callback_query(self, query_id: str, text: str | None = None) -> None:
        params: dict[str, Any] = {"callback_query_id": query_id}
        if text:
            params["text"] = _clip(text, 180)
        self.call("answerCallbackQuery", params, timeout=(5, 10))

    def send_photo(self, chat_id: int, photo_path: Path, caption: str) -> None:
        with photo_path.open("rb") as photo:
            response = requests.post(
                f"{TELEGRAM_API}/sendPhoto",
                data={"chat_id": chat_id, "caption": _clip(caption, 1024)},
                files={"photo": (photo_path.name, photo, "image/png")},
                timeout=(10, 60),
            )
        try:
            payload = response.json()
        except ValueError as exc:
            raise RuntimeError(f"Telegram returned invalid JSON ({response.status_code})") from exc
        if not response.ok or not payload.get("ok"):
            raise RuntimeError(f"Telegram API error for sendPhoto: {payload.get('description', response.status_code)}")

    def get_updates(self, offset: int | None) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "timeout": POLL_TIMEOUT_SECONDS,
            "limit": 20,
            "allowed_updates": '["message","callback_query","pre_checkout_query","subscription"]',
        }
        if offset is not None:
            params["offset"] = offset
        return self.call("getUpdates", params, timeout=(10, POLL_TIMEOUT_SECONDS + 15))

    def get_file_path(self, file_id: str) -> str:
        result = self.call("getFile", {"file_id": file_id}, timeout=(10, 30))
        file_path = result.get("file_path")
        if not file_path:
            raise RuntimeError("Telegram did not return a file path")
        return str(file_path)

    def download_file(self, file_path: str, destination: str) -> int:
        url = f"https://api.telegram.org/file/bot{BOT_TOKEN}/{file_path}"
        total = 0
        with requests.get(url, stream=True, timeout=(10, 120)) as response:
            response.raise_for_status()
            with open(destination, "wb") as handle:
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    if not chunk:
                        continue
                    total += len(chunk)
                    if MAX_FILE_BYTES and total > MAX_FILE_BYTES:
                        raise ValueError("file_too_large")
                    handle.write(chunk)
        return total


def _media_from_message(message: dict[str, Any]) -> dict[str, Any] | None:
    if message.get("voice"):
        media = message["voice"]
        return {
            "file_id": media.get("file_id"),
            "file_unique_id": media.get("file_unique_id"),
            "filename": f"voice_{message.get('message_id', 'audio')}.ogg",
            "content_type": "audio/ogg",
            "duration_seconds": media.get("duration"),
            "file_size": media.get("file_size"),
        }
    if message.get("audio"):
        media = message["audio"]
        filename = _safe_filename(media.get("file_name"), f"audio_{message.get('message_id', 'audio')}.mp3")
        return {
            "file_id": media.get("file_id"),
            "file_unique_id": media.get("file_unique_id"),
            "filename": filename,
            "content_type": media.get("mime_type") or mimetypes.guess_type(filename)[0] or "audio/mpeg",
            "duration_seconds": media.get("duration"),
            "file_size": media.get("file_size"),
        }
    if message.get("document"):
        media = message["document"]
        raw_filename = Path(media.get("file_name") or "").name
        if Path(raw_filename).suffix.lower() not in {".wav", ".mp3", ".m4a", ".ogg", ".opus", ".flac", ".webm"}:
            return None
        filename = _safe_filename(raw_filename, f"audio_{message.get('message_id', 'file')}.ogg")
        return {
            "file_id": media.get("file_id"),
            "file_unique_id": media.get("file_unique_id"),
            "filename": filename,
            "content_type": media.get("mime_type") or mimetypes.guess_type(filename)[0] or "application/octet-stream",
            "duration_seconds": None,
            "file_size": media.get("file_size"),
        }
    return None


def _format_result(payload: dict[str, Any], report_language: str = DEFAULT_LANGUAGE) -> str:
    result = payload.get("result") or {}
    language_code = str(report_language or DEFAULT_LANGUAGE).strip().lower().replace("_", "-").split("-", 1)[0]
    default_code = DEFAULT_LANGUAGE.strip().lower().replace("_", "-").split("-", 1)[0]
    labels = REPORT_LABELS.get(language_code, REPORT_LABELS.get(default_code, REPORT_LABELS["ru"]))
    lines = [labels["done"]]
    score = result.get("score")
    if score is not None:
        lines.append(f"{labels['score']}: {score}")
    summary = _clip(result.get("summary"), 1200)
    if summary:
        lines.extend(["", f"{labels['summary']}:", summary])
    criteria = result.get("criteria") or []
    if criteria:
        lines.extend(["", f"{labels['criteria']}:"])
        for item in criteria[:8]:
            if isinstance(item, dict):
                title = item.get("title") or item.get("name") or item.get("criterion") or "Критерий"
                value = item.get("score") if item.get("score") is not None else item.get("status", "")
                comment = item.get("comment") or item.get("feedback") or item.get("evidence") or ""
                lines.append(f"• {_clip(title, 100)}: {_clip(value, 40)} {_clip(comment, 220)}".strip())
            else:
                lines.append(f"• {_clip(item, 300)}")
    findings = result.get("findings") or []
    visible_findings = []
    for item in findings[:6]:
        if isinstance(item, dict):
            value = item.get("text") or item.get("evidence") or item.get("comment")
        else:
            value = item
        text = _clip(value, 350)
        if text:
            visible_findings.append(text)
    if visible_findings:
        lines.extend(["", f"{labels['findings']}:"])
        for item in visible_findings:
            lines.append(f"• {item}")
    free_remaining = payload.get("free_remaining", payload.get("remaining"))
    paid_remaining = payload.get("paid_remaining")
    quota_lines = []
    if free_remaining is not None and (int(free_remaining) > 0 or paid_remaining in (None, 0)):
        quota_lines.append(labels["remaining"].format(count=free_remaining))
    if paid_remaining is not None and int(paid_remaining) > 0:
        quota_lines.append(labels["paid_remaining"].format(count=paid_remaining))
    if quota_lines:
        lines.extend(["", *quota_lines])
    return _clip("\n".join(lines), 4000)


def _api_headers() -> dict[str, str]:
    return {"X-CallQuanta-Service-Token": SERVICE_TOKEN}


def _api_json(method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    response = requests.request(
        method,
        f"{API_BASE_URL}{path}",
        headers=_api_headers(),
        json=payload,
        timeout=(3, 6),
    )
    try:
        body = response.json()
    except ValueError as exc:
        raise RuntimeError(f"Lite API returned invalid JSON ({response.status_code})") from exc
    if not response.ok or not isinstance(body, dict):
        raise RuntimeError(f"Lite API request failed with status {response.status_code}")
    return body


def _send_plans_menu(client: TelegramClient, chat_id: int) -> None:
    markup = {
        "inline_keyboard": [
            [{"text": "1 анализ — 50 ⭐", "callback_data": "lite:buy:analysis_1"}],
            [{"text": "5 анализов — 200 ⭐", "callback_data": "lite:buy:analysis_5"}],
            [{"text": "10 анализов / 30 дней — 350 ⭐", "callback_data": "lite:buy:monthly_10"}],
        ]
    }
    client.send_message(
        chat_id,
        "Выберите вариант оплаты. Анализы принимаются до 20 минут и 18 МБ.\n\n"
        "Подписка автоматически продлевается каждые 30 дней. Отменить её можно командой /cancel_subscription.",
        reply_markup=markup,
    )


def _process_media(client: TelegramClient, message: dict[str, Any], media: dict[str, Any]) -> None:
    chat_id = int(message["chat"]["id"])
    user_id = int(message["from"]["id"])
    message_id = int(message.get("message_id", 0))
    if media.get("file_size") and MAX_FILE_BYTES and int(media["file_size"]) > MAX_FILE_BYTES:
        client.send_message(chat_id, "Файл слишком большой. В Lite принимаем аудио до 18 МБ.")
        return
    duration = media.get("duration_seconds")
    if duration and MAX_DURATION_SECONDS and int(duration) > MAX_DURATION_SECONDS:
        client.send_message(chat_id, "Аудио слишком длинное. В Lite принимаем записи до 20 минут.")
        return

    client.send_message(chat_id, "Принял аудио. Расшифровываю и готовлю ограниченный анализ…")
    temp_path = ""
    report_language = _language_for_message(message)
    try:
        file_path = client.get_file_path(str(media["file_id"]))
        suffix = Path(media["filename"]).suffix or ".ogg"
        with tempfile.NamedTemporaryFile(prefix="callquanta_lite_", suffix=suffix, delete=False) as temp:
            temp_path = temp.name
        client.download_file(file_path, temp_path)
        data = {
            "telegram_user_id": str(user_id),
            "idempotency_key": f"tg:{user_id}:{message_id}",
            "language": report_language,
        }
        if duration is not None:
            data["duration_seconds"] = str(duration)
        with open(temp_path, "rb") as audio:
            response = requests.post(
                f"{API_BASE_URL}/internal/lite/jobs",
                headers=_api_headers(),
                data=data,
                files={"file": (media["filename"], audio, media["content_type"])},
                timeout=(10, 120),
            )
        try:
            payload = response.json()
        except ValueError:
            payload = {}
        if response.status_code == 429:
            message = "Бесплатный лимит Lite исчерпан."
            if LIMIT_REACHED_TEXT:
                message += "\n\n" + LIMIT_REACHED_TEXT
            client.send_message(chat_id, message)
            _send_plans_menu(client, chat_id)
            return
        if not response.ok:
            detail = payload.get("detail") or "Не удалось принять аудио"
            client.send_message(chat_id, _clip(f"Не удалось принять аудио: {detail}", 1000))
            return
        job_id = int(payload["job_id"])
        remaining = payload.get("remaining")
        free_remaining = payload.get("free_remaining", remaining)
        paid_remaining = int(payload.get("paid_remaining") or 0)
        if free_remaining is not None and int(free_remaining) > 0:
            quota_notice = f"Осталось бесплатных анализов: {free_remaining}."
        elif paid_remaining > 0:
            quota_notice = f"Осталось оплаченных анализов: {paid_remaining}."
        else:
            quota_notice = "Бесплатные анализы закончились."
        client.send_message(chat_id, f"Задание #{job_id} поставлено в очередь. {quota_notice}")
        executor.submit(_poll_job, client, chat_id, user_id, job_id, report_language)
    except ValueError as exc:
        if str(exc) == "file_too_large":
            client.send_message(chat_id, "Файл слишком большой. В Lite принимаем аудио до 18 МБ.")
        else:
            client.send_message(chat_id, "Не удалось скачать аудио из Telegram. Попробуйте отправить его ещё раз.")
    except (requests.RequestException, RuntimeError, KeyError) as exc:
        logger.warning("Lite media processing failed: %s", exc)
        client.send_message(chat_id, "Не удалось обработать аудио. Попробуйте отправить его ещё раз.")
    finally:
        if temp_path:
            try:
                os.unlink(temp_path)
            except FileNotFoundError:
                pass


def _poll_job(client: TelegramClient, chat_id: int, user_id: int, job_id: int, report_language: str = DEFAULT_LANGUAGE) -> None:
    deadline = time.monotonic() + 30 * 60
    while time.monotonic() < deadline and not STOP:
        try:
            response = requests.get(
                f"{API_BASE_URL}/internal/lite/jobs/{job_id}",
                headers=_api_headers(),
                params={"telegram_user_id": user_id},
                timeout=(10, 30),
            )
            payload = response.json()
            if response.status_code == 404:
                client.send_message(chat_id, "Задание не найдено. Отправьте аудио ещё раз.")
                return
            if not response.ok:
                raise RuntimeError(f"Lite API status {response.status_code}")
            status = payload.get("status")
            if payload.get("result") or status == "analyzed":
                client.send_message(chat_id, _format_result(payload, report_language))
                return
            if status in {"analysis_failed", "transcription_failed", "failed"}:
                client.send_message(chat_id, "Не удалось завершить анализ этого аудио. Попробуйте другой файл.")
                return
        except (requests.RequestException, ValueError, RuntimeError) as exc:
            logger.warning("Lite job polling failed for %s: %s", job_id, exc)
        time.sleep(5)
    if not STOP:
        client.send_message(chat_id, "Анализ занимает дольше обычного. Мы продолжим обработку, а результат придёт отдельным сообщением.")


def _handle_plan_callback(client: TelegramClient, callback: dict[str, Any]) -> None:
    query_id = str(callback.get("id") or "")
    sender = callback.get("from") or {}
    telegram_user_id = int(sender.get("id") or 0)
    message = callback.get("message") or {}
    chat = message.get("chat") or {}
    chat_id = int(chat.get("id") or 0)
    product_code = str(callback.get("data") or "")
    product_code = product_code.removeprefix("lite:buy:")
    if chat.get("type") != "private" or not telegram_user_id or product_code not in {"analysis_1", "analysis_5", "monthly_10"}:
        client.answer_callback_query(query_id, "Не удалось открыть этот вариант.")
        return
    try:
        client.answer_callback_query(query_id)
        order = _api_json("POST", "/internal/lite/stars/orders", {
            "telegram_user_id": telegram_user_id,
            "product_code": product_code,
        })
        client.send_invoice(chat_id, order)
    except (requests.RequestException, RuntimeError, KeyError, ValueError):
        logger.exception("Could not create Lite Stars invoice")
        client.send_message(chat_id, "Не удалось открыть оплату. Попробуйте /plans ещё раз чуть позже.")


def _handle_pre_checkout(client: TelegramClient, query: dict[str, Any]) -> None:
    query_id = str(query.get("id") or "")
    sender = query.get("from") or {}
    try:
        response = _api_json("POST", "/internal/lite/stars/pre-checkout", {
            "invoice_payload": str(query.get("invoice_payload") or ""),
            "telegram_user_id": int(sender.get("id") or 0),
            "currency": str(query.get("currency") or ""),
            "total_amount": int(query.get("total_amount") or 0),
        })
        client.answer_pre_checkout_query(
            query_id,
            bool(response.get("ok")),
            None if response.get("ok") else str(response.get("error_message") or "Не удалось проверить оплату."),
        )
    except (requests.RequestException, RuntimeError, ValueError):
        logger.exception("Lite Stars pre-checkout validation failed")
        client.answer_pre_checkout_query(query_id, False, "Не удалось проверить оплату. Попробуйте ещё раз.")


def _handle_successful_payment(client: TelegramClient, message: dict[str, Any]) -> None:
    sender = message.get("from") or {}
    successful_payment = message.get("successful_payment") or {}
    chat_id = int((message.get("chat") or {}).get("id") or 0)
    payment_result = _api_json("POST", "/internal/lite/stars/payments/confirm", {
        "invoice_payload": str(successful_payment.get("invoice_payload") or ""),
        "telegram_user_id": int(sender.get("id") or 0),
        "currency": str(successful_payment.get("currency") or ""),
        "total_amount": int(successful_payment.get("total_amount") or 0),
        "telegram_payment_charge_id": str(successful_payment.get("telegram_payment_charge_id") or ""),
        "is_recurring": bool(successful_payment.get("is_recurring")),
        "is_first_recurring": bool(successful_payment.get("is_first_recurring")),
        "subscription_expiration_date": successful_payment.get("subscription_expiration_date"),
    })
    if payment_result.get("duplicate"):
        client.send_message(chat_id, "Платёж уже учтён. Ваш баланс анализов сохранён.")
        return
    analyses_granted = int(payment_result.get("analyses_granted") or 0)
    free_remaining = int(payment_result.get("free_remaining") or 0)
    paid_remaining = int(payment_result.get("paid_remaining") or 0)
    confirmation = f"Оплата подтверждена — начислено анализов: {analyses_granted}."
    if successful_payment.get("is_recurring"):
        confirmation += " Подписка продлевается каждые 30 дней; отменить можно командой /cancel_subscription."
    confirmation += f"\nБаланс: {paid_remaining} оплаченных анализов. Бесплатных осталось: {free_remaining}."
    client.send_message(chat_id, confirmation)


def _handle_subscription_update(client: TelegramClient, update: dict[str, Any]) -> None:
    sender = update.get("user") or {}
    telegram_user_id = int(sender.get("id") or 0)
    invoice_payload = str(update.get("invoice_payload") or "")
    state = str(update.get("state") or "")
    result = _api_json("POST", "/internal/lite/subscription/event", {
        "invoice_payload": invoice_payload,
        "telegram_user_id": telegram_user_id,
        "state": state,
    })
    if not result.get("ok"):
        raise RuntimeError("Lite subscription update was not saved")
    if telegram_user_id and state == "canceled":
        client.send_message(telegram_user_id, "Автопродление подписки отменено. Доступ к оставшимся анализам сохранится до конца оплаченного периода.")
    elif telegram_user_id and state == "failed":
        client.send_message(telegram_user_id, "Не удалось продлить подписку. Проверьте баланс Telegram Stars; доступные анализы останутся до конца оплаченного периода.")


def _cancel_subscription(client: TelegramClient, chat_id: int, telegram_user_id: int) -> None:
    subscription = _api_json("GET", f"/internal/lite/subscription/{telegram_user_id}")
    if not subscription.get("active") or not subscription.get("latest_charge_id"):
        client.send_message(chat_id, "Активной подписки нет.")
        return
    client.call("editUserStarSubscription", {
        "user_id": telegram_user_id,
        "telegram_payment_charge_id": subscription["latest_charge_id"],
        "is_canceled": "true",
    }, timeout=(5, 10))
    _api_json("POST", "/internal/lite/subscription/cancelled", {
        "invoice_payload": subscription["invoice_payload"],
        "telegram_user_id": telegram_user_id,
        "state": "canceled",
    })
    client.send_message(chat_id, "Автопродление отключено. Оплаченный период и доступные анализы сохраняются до указанной даты.")


def _handle_update(client: TelegramClient, update: dict[str, Any]) -> None:
    if update.get("pre_checkout_query"):
        _handle_pre_checkout(client, update["pre_checkout_query"])
        return
    if update.get("callback_query"):
        _handle_plan_callback(client, update["callback_query"])
        return
    if update.get("subscription"):
        _handle_subscription_update(client, update["subscription"])
        return
    message = update.get("message") or {}
    if message.get("successful_payment"):
        _handle_successful_payment(client, message)
        return
    chat = message.get("chat") or {}
    sender = message.get("from") or {}
    chat_id = chat.get("id")
    user_id = sender.get("id")
    if not chat_id or not user_id:
        return
    if chat.get("type") != "private":
        client.send_message(int(chat_id), "Lite работает в личном чате с ботом. Отправьте аудио в личные сообщения.")
        return

    text = (message.get("text") or "").strip()
    command = text.split()[0].split("@", 1)[0].lower() if text.startswith("/") else ""
    if command == "/start":
        try:
            client.send_photo(int(chat_id), WELCOME_IMAGE_PATH, START_MESSAGE)
        except (OSError, requests.RequestException, RuntimeError):
            logger.warning("Could not send the Lite welcome image; falling back to text")
            client.send_message(int(chat_id), START_MESSAGE)
        return
    if command == "/help":
        client.send_message(int(chat_id), START_MESSAGE)
        return
    if command in {"/plans", "/buy"}:
        _send_plans_menu(client, int(chat_id))
        return
    if command == "/subscription":
        try:
            subscription = _api_json("GET", f"/internal/lite/subscription/{int(user_id)}")
            if subscription.get("active"):
                client.send_message(int(chat_id), f"Подписка активна до {subscription.get('expires_at')}. Отмена: /cancel_subscription")
            else:
                client.send_message(int(chat_id), "Активной подписки нет. Посмотреть варианты: /plans")
        except (requests.RequestException, RuntimeError, ValueError):
            logger.exception("Could not read Lite subscription")
            client.send_message(int(chat_id), "Не удалось проверить подписку. Попробуйте позже.")
        return
    if command == "/cancel_subscription":
        try:
            _cancel_subscription(client, int(chat_id), int(user_id))
        except (requests.RequestException, RuntimeError, ValueError):
            logger.exception("Could not cancel Lite subscription")
            client.send_message(int(chat_id), "Не удалось отменить автопродление сейчас. Попробуйте ещё раз позже.")
        return
    if command == "/paysupport":
        client.send_message(int(chat_id), "По вопросам оплаты напишите автору CallQuanta Lite и приложите сообщение-квитанцию Telegram. Помощь по оплате: /paysupport.")
        return
    if command == "/delete":
        response = requests.delete(
            f"{API_BASE_URL}/internal/lite/users/{int(user_id)}",
            headers=_api_headers(),
            timeout=(10, 30),
        )
        if response.ok:
            client.send_message(int(chat_id), "Данные Lite удалены с сервера. История Telegram-чата сохраняется у Telegram. Бесплатная квота не восстановлена.")
        else:
            client.send_message(int(chat_id), "Не удалось удалить данные сейчас. Попробуйте ещё раз позже.")
        return

    media = _media_from_message(message)
    if media and media.get("file_id"):
        executor.submit(_process_media, client, message, media)
        return
    if text:
        client.send_message(int(chat_id), "Отправьте голосовое сообщение или аудиофайл. Для справки используйте /help.")


def _stop_handler(_signum: int, _frame: Any) -> None:
    global STOP
    STOP = True


def _cleanup_remote() -> None:
    try:
        response = requests.post(
            f"{API_BASE_URL}/internal/lite/cleanup",
            headers=_api_headers(),
            timeout=(10, 30),
        )
        if response.ok:
            payload = response.json()
            if payload.get("deleted_jobs"):
                logger.info("Deleted expired Lite jobs: %s", payload["deleted_jobs"])
        else:
            logger.warning("Lite cleanup returned status %s", response.status_code)
    except (requests.RequestException, ValueError) as exc:
        logger.warning("Lite cleanup failed: %s", exc)


executor = ThreadPoolExecutor(max_workers=4)


def main() -> None:
    if not BOT_ENABLED:
        logger.info("Telegram Lite bot is disabled")
        return
    if not BOT_TOKEN or not SERVICE_TOKEN:
        raise SystemExit("TELEGRAM_BOT_TOKEN and LITE_SERVICE_TOKEN are required when TELEGRAM_BOT_ENABLED=true")
    client = TelegramClient()
    offset: int | None = None
    last_cleanup = 0.0
    logger.info("Telegram Lite bot started with long polling")
    while not STOP:
        if time.monotonic() - last_cleanup >= 3600:
            _cleanup_remote()
            last_cleanup = time.monotonic()
        try:
            updates = client.get_updates(offset)
            for update in updates:
                try:
                    _handle_update(client, update)
                except Exception:
                    logger.exception("Failed to handle Telegram update")
                    time.sleep(2)
                    break
                offset = int(update.get("update_id", 0)) + 1
        except Exception as exc:
            logger.warning("Telegram polling failed: %s", exc)
            time.sleep(5)
    executor.shutdown(wait=False, cancel_futures=True)


signal.signal(signal.SIGTERM, _stop_handler)
signal.signal(signal.SIGINT, _stop_handler)


if __name__ == "__main__":
    main()
