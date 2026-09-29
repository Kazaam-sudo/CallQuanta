import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    import bot
except ModuleNotFoundError as exc:
    raise unittest.SkipTest(f"Lite bot test dependency is not installed: {exc.name}") from exc


class FakeClient:
    def __init__(self):
        self.messages = []
        self.calls = []

    def send_message(self, chat_id, text, reply_markup=None):
        self.messages.append((chat_id, text, reply_markup))

    def send_invoice(self, chat_id, order):
        self.calls.append(("invoice", chat_id, order))

    def answer_callback_query(self, query_id, text=None):
        self.calls.append(("callback_answer", query_id, text))

    def answer_pre_checkout_query(self, query_id, ok, error_message=None):
        self.calls.append(("precheckout_answer", query_id, ok, error_message))


class LiteStarsBotTests(unittest.TestCase):
    def test_invoice_uses_stars_and_subscription_period(self):
        client = bot.TelegramClient()
        captured = {}
        client.call = lambda method, params, **kwargs: captured.update(method=method, params=params)

        client.send_invoice(99, {
            "title": "10 анализов в месяц",
            "description": "Подписка",
            "invoice_payload": "opaque-test-payload",
            "stars_amount": 350,
            "subscription_period": 2592000,
        })

        self.assertEqual(captured["method"], "sendInvoice")
        self.assertEqual(captured["params"]["currency"], "XTR")
        self.assertEqual(captured["params"]["provider_token"], "")
        self.assertEqual(json.loads(captured["params"]["prices"]), [{"label": "10 анализов в месяц", "amount": 350}])
        self.assertEqual(captured["params"]["subscription_period"], "2592000")

    def test_plan_menu_exposes_approved_prices(self):
        client = FakeClient()
        bot._send_plans_menu(client, 99)
        buttons = [button["text"] for row in client.messages[0][2]["inline_keyboard"] for button in row]
        self.assertEqual(buttons, ["1 анализ — 50 ⭐", "5 анализов — 200 ⭐", "10 анализов / 30 дней — 350 ⭐"])

    def test_checkout_answers_only_after_backend_validation(self):
        client = FakeClient()
        query = {"id": "checkout-1", "from": {"id": 99}, "invoice_payload": "opaque", "currency": "XTR", "total_amount": 200}
        with patch.object(bot, "_api_json", return_value={"ok": True}) as api_call:
            bot._handle_pre_checkout(client, query)
        api_call.assert_called_once()
        self.assertEqual(client.calls, [("precheckout_answer", "checkout-1", True, None)])

    def test_purchase_button_creates_invoice_through_api_order(self):
        client = FakeClient()
        callback = {
            "id": "callback-1",
            "from": {"id": 99},
            "data": "lite:buy:analysis_5",
            "message": {"chat": {"id": 99, "type": "private"}},
        }
        order = {"invoice_payload": "opaque", "title": "5 анализов", "description": "Пакет", "stars_amount": 200}
        with patch.object(bot, "_api_json", return_value=order) as api_call:
            bot._handle_plan_callback(client, callback)
        api_call.assert_called_once_with("POST", "/internal/lite/stars/orders", {"telegram_user_id": 99, "product_code": "analysis_5"})
        self.assertIn(("invoice", 99, order), client.calls)


if __name__ == "__main__":
    unittest.main()
