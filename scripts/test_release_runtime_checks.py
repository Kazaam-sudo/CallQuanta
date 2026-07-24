"""Regression coverage for cookie and export assertions in release runtime checks."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("release_runtime_checks.py")
MODULE_SPEC = importlib.util.spec_from_file_location("release_runtime_checks", MODULE_PATH)
assert MODULE_SPEC and MODULE_SPEC.loader
release_runtime_checks = importlib.util.module_from_spec(MODULE_SPEC)
MODULE_SPEC.loader.exec_module(release_runtime_checks)


class ReleaseRuntimeChecksTests(unittest.TestCase):
    def test_xlsx_signature_uses_binary_zip_header(self) -> None:
        self.assertEqual(release_runtime_checks.XLSX_SIGNATURE, b"PK\x03\x04")

    def test_cookie_jar_removes_cookie_expired_by_logout(self) -> None:
        cookie = release_runtime_checks.update_cookie_jar("", "session=token; HttpOnly; Path=/")
        updated = release_runtime_checks.update_cookie_jar(
            cookie,
            "session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Path=/",
        )
        self.assertEqual(updated, "")


if __name__ == "__main__":
    unittest.main()
