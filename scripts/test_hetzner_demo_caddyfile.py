"""Regression checks for public Hetzner demo routing."""

from __future__ import annotations

import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
CADDYFILE = REPOSITORY_ROOT / "deploy" / "hetzner-demo" / "Caddyfile"


class HetznerDemoCaddyfileTests(unittest.TestCase):
    def test_health_route_is_a_handle_before_the_web_catch_all(self) -> None:
        contents = CADDYFILE.read_text()

        health_route = "handle /health {\n    reverse_proxy api:8000\n  }"
        web_catch_all = "handle {\n    reverse_proxy web:3000\n  }"

        self.assertIn(health_route, contents)
        self.assertIn(web_catch_all, contents)
        self.assertLess(contents.index(health_route), contents.index(web_catch_all))

    def test_direct_api_paths_are_a_handle_before_the_web_catch_all(self) -> None:
        contents = CADDYFILE.read_text()

        api_route = "handle @apiBackend {\n    reverse_proxy api:8000\n  }"
        web_catch_all = "handle {\n    reverse_proxy web:3000\n  }"

        self.assertIn(api_route, contents)
        self.assertLess(contents.index(api_route), contents.index(web_catch_all))


if __name__ == "__main__":
    unittest.main()
