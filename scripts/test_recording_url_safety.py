import importlib.util
import socket
import unittest
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).resolve().parents[1] / "workers" / "recording-worker" / "url_safety.py"
SPEC = importlib.util.spec_from_file_location("recording_url_safety", MODULE_PATH)
url_safety = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(url_safety)


class RecordingUrlSafetyTests(unittest.TestCase):
    def test_rejects_non_http_scheme(self):
        with self.assertRaisesRegex(url_safety.UnsafeRecordingUrl, "http or https"):
            url_safety.validate_recording_url("file:///etc/passwd")

    def test_rejects_embedded_credentials(self):
        with self.assertRaisesRegex(url_safety.UnsafeRecordingUrl, "embedded credentials"):
            url_safety.validate_recording_url("https://user:secret@example.com/call.wav")

    @patch.object(socket, "getaddrinfo", return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 80))])
    def test_rejects_loopback_resolution(self, _mock_resolve):
        with self.assertRaisesRegex(url_safety.UnsafeRecordingUrl, "private or local"):
            url_safety.validate_recording_url("http://localhost/call.wav")

    @patch.object(socket, "getaddrinfo", return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.10.0.5", 443))])
    def test_rejects_private_resolution(self, _mock_resolve):
        with self.assertRaisesRegex(url_safety.UnsafeRecordingUrl, "private or local"):
            url_safety.validate_recording_url("https://pbx.example.test/call.wav")

    @patch.object(socket, "getaddrinfo", return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))])
    def test_allows_public_resolution(self, _mock_resolve):
        url = "https://recordings.example.com/call.wav"
        self.assertEqual(url_safety.validate_recording_url(url), url)

    @patch.object(socket, "getaddrinfo")
    def test_explicit_host_allowlist_allows_private_pbx_without_dns_lookup(self, mock_resolve):
        url = "https://pbx.internal.example/call.wav"
        self.assertEqual(
            url_safety.validate_recording_url(url, allowed_hosts="pbx.internal.example"),
            url,
        )
        mock_resolve.assert_not_called()

    @patch.object(socket, "getaddrinfo", side_effect=socket.gaierror("not found"))
    def test_rejects_unresolvable_host(self, _mock_resolve):
        with self.assertRaisesRegex(url_safety.UnsafeRecordingUrl, "could not be resolved"):
            url_safety.validate_recording_url("https://missing.example/call.wav")


if __name__ == "__main__":
    unittest.main()
