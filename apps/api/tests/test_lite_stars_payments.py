import asyncio
import sys
import time
import unittest
from datetime import UTC, datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from io import BytesIO

from fastapi import UploadFile
from starlette.datastructures import Headers

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

try:
    from sqlalchemy import create_engine, func, select
    from sqlalchemy.orm import sessionmaker

    from app import main
    from app.db import Base, LiteCreditLot, LiteJob, LiteQuotaAllocation, LiteStarsPayment, LiteUser
except ModuleNotFoundError as exc:
    raise unittest.SkipTest(f"API test dependency is not installed: {exc.name}") from exc


class LiteStarsPaymentTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=self.engine)
        self.session_factory = sessionmaker(bind=self.engine)
        self.db = self.session_factory()
        self.user_id = 987654321

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _order(self, product_code):
        return main.create_lite_stars_order(
            main.LiteStarsOrderRequest(telegram_user_id=self.user_id, product_code=product_code),
            self.db,
            _token=None,
        )

    def _confirm(self, order, charge_id, *, recurring=False, first=False, expiration=None):
        return main.confirm_lite_stars_payment(
            main.LiteStarsPaymentRequest(
                invoice_payload=order["invoice_payload"],
                telegram_user_id=self.user_id,
                currency="XTR",
                total_amount=order["stars_amount"],
                telegram_payment_charge_id=charge_id,
                is_recurring=recurring,
                is_first_recurring=first,
                subscription_expiration_date=expiration,
            ),
            self.db,
            _token=None,
        )

    def test_exact_prices_precheckout_and_payment_idempotency(self):
        single = self._order("analysis_1")
        five = self._order("analysis_5")
        monthly = self._order("monthly_10")
        self.assertEqual((single["stars_amount"], single["analyses_count"]), (50, 1))
        self.assertEqual((five["stars_amount"], five["analyses_count"]), (200, 5))
        self.assertEqual((monthly["stars_amount"], monthly["analyses_count"], monthly["subscription_period"]), (350, 10, 2592000))

        valid = main.validate_lite_stars_pre_checkout(
            main.LiteStarsPreCheckoutRequest(
                invoice_payload=five["invoice_payload"],
                telegram_user_id=self.user_id,
                currency="XTR",
                total_amount=200,
            ),
            self.db,
            _token=None,
        )
        invalid = main.validate_lite_stars_pre_checkout(
            main.LiteStarsPreCheckoutRequest(
                invoice_payload=five["invoice_payload"],
                telegram_user_id=self.user_id,
                currency="XTR",
                total_amount=201,
            ),
            self.db,
            _token=None,
        )
        self.assertTrue(valid["ok"])
        self.assertFalse(invalid["ok"])

        result = self._confirm(five, "test-charge-five")
        duplicate = self._confirm(five, "test-charge-five")
        self.assertEqual(result["analyses_granted"], 5)
        self.assertEqual(result["paid_remaining"], 5)
        self.assertTrue(duplicate["duplicate"])
        self.assertEqual(self.db.execute(select(func.count(LiteStarsPayment.id))).scalar_one(), 1)
        self.assertEqual(self.db.execute(select(func.count(LiteCreditLot.id))).scalar_one(), 1)

    def test_separate_purchases_add_paid_credits_to_current_balance(self):
        first = self._order("analysis_1")
        self._confirm(first, "test-charge-repurchase-one")
        second = self._order("analysis_5")
        result = self._confirm(second, "test-charge-repurchase-five")

        self.assertNotEqual(first["invoice_payload"], second["invoice_payload"])
        self.assertEqual(result["paid_remaining"], 6)
        self.assertEqual(self.db.execute(select(func.count(LiteCreditLot.id))).scalar_one(), 2)

    def test_paid_credit_refund_is_once_only(self):
        order = self._order("analysis_1")
        self._confirm(order, "test-charge-single")
        user = self.db.execute(select(LiteUser).where(LiteUser.telegram_user_id == self.user_id)).scalar_one()
        lot = self.db.execute(select(LiteCreditLot)).scalar_one()
        job = LiteJob(
            lite_user_id=user.id,
            telegram_user_id=self.user_id,
            idempotency_key="test-paid-job",
            filename="sample.wav",
            status="analysis_failed",
        )
        self.db.add(job)
        self.db.flush()
        self.db.add(LiteQuotaAllocation(lite_job_id=job.id, source="paid", credit_lot_id=lot.id))
        lot.remaining_count = 0
        self.db.commit()

        self.assertTrue(main._refund_lite_quota(self.db, job, user))
        self.db.commit()
        self.assertFalse(main._refund_lite_quota(self.db, job, user))
        self.db.commit()
        self.assertEqual(main._lite_paid_remaining(self.db, user), 1)

    def test_job_consumes_paid_credit_only_after_free_allowance_is_used(self):
        order = self._order("analysis_1")
        self._confirm(order, "test-charge-job")
        user = self.db.execute(select(LiteUser).where(LiteUser.telegram_user_id == self.user_id)).scalar_one()
        user.analyses_used = user.analyses_limit
        self.db.commit()
        upload = UploadFile(
            file=BytesIO(b"synthetic audio bytes"),
            filename="sample.wav",
            headers=Headers({"content-type": "audio/wav"}),
        )
        with TemporaryDirectory() as temp_dir, patch.object(main, "UPLOAD_DIR", Path(temp_dir)), patch.object(main, "_enqueue_job", return_value=(True, None)):
            result = asyncio.run(main.create_lite_job(
                file=upload,
                telegram_user_id=self.user_id,
                idempotency_key="test-paid-analysis-job",
                duration_seconds=30,
                language="ru",
                db=self.db,
                _token=None,
            ))
        self.assertEqual(result["free_remaining"], 0)
        self.assertEqual(result["paid_remaining"], 0)
        allocation = self.db.execute(select(LiteQuotaAllocation).where(LiteQuotaAllocation.lite_job_id == result["job_id"])).scalar_one()
        self.assertEqual(allocation.source, "paid")

    def test_subscription_credits_stack_then_expire_by_paid_period(self):
        order = self._order("monthly_10")
        first_expiration = int(time.time()) + 30 * 24 * 60 * 60
        second_expiration = first_expiration + 30 * 24 * 60 * 60
        self._confirm(order, "test-charge-monthly-first", recurring=True, first=True, expiration=first_expiration)
        self._confirm(order, "test-charge-monthly-renewal", recurring=True, expiration=second_expiration)
        user = self.db.execute(select(LiteUser).where(LiteUser.telegram_user_id == self.user_id)).scalar_one()
        self.assertEqual(main._lite_paid_remaining(self.db, user), 20)

        canceled = main.update_lite_subscription_event(
            main.LiteSubscriptionEventRequest(
                invoice_payload=order["invoice_payload"],
                telegram_user_id=self.user_id,
                state="canceled",
            ),
            self.db,
            _token=None,
        )
        self.assertEqual(canceled["state"], "canceled")
        subscription_status = main.get_lite_subscription(self.user_id, self.db, _token=None)
        self.assertFalse(subscription_status["active"])
        self.assertEqual(subscription_status["status"], "canceled")

        # Buying again after cancellation adds a new tranche; it does not replace
        # the remaining balance from the previous paid periods.
        repurchase = self._order("monthly_10")
        self.assertNotEqual(repurchase["invoice_payload"], order["invoice_payload"])
        third_expiration = second_expiration + 30 * 24 * 60 * 60
        self._confirm(repurchase, "test-charge-monthly-repurchase", recurring=True, first=True, expiration=third_expiration)
        self.assertEqual(main._lite_paid_remaining(self.db, user), 30)

        # Monthly credits do not roll over: each tranche expires with its own paid period.
        with patch.object(main, "_utcnow", return_value=datetime.fromtimestamp(first_expiration + 1, tz=UTC)):
            self.assertEqual(main._lite_paid_remaining(self.db, user), 20)
        with patch.object(main, "_utcnow", return_value=datetime.fromtimestamp(second_expiration + 1, tz=UTC)):
            self.assertEqual(main._lite_paid_remaining(self.db, user), 10)


if __name__ == "__main__":
    unittest.main()
