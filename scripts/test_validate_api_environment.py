import unittest

from validate_api_environment import validate_api_environment


VALID_PRODUCTION_ENV = {
    "APP_ENV": "production",
    "REQUIRE_AUTH": "true",
    "SESSION_SECRET": "a-unique-session-secret-with-more-than-32-chars",
    "ADMIN_EMAIL": "admin@example.com",
    "ADMIN_PASSWORD": "unique-admin-password-2026",
    "CORS_ORIGINS": "https://demo.example.com",
}


class ValidateApiEnvironmentTests(unittest.TestCase):
    def test_development_is_not_blocked(self):
        validate_api_environment({"APP_ENV": "development"})
        validate_api_environment({"APP_ENV": "test"})

    def test_production_valid_configuration_passes(self):
        validate_api_environment(dict(VALID_PRODUCTION_ENV))

    def test_production_allows_bootstrap_credentials_to_be_removed_together(self):
        env = dict(VALID_PRODUCTION_ENV)
        env.pop("ADMIN_EMAIL")
        env.pop("ADMIN_PASSWORD")
        validate_api_environment(env)

    def test_production_rejects_partial_bootstrap_credentials(self):
        env = dict(VALID_PRODUCTION_ENV)
        env.pop("ADMIN_PASSWORD")
        with self.assertRaisesRegex(RuntimeError, "configured together"):
            validate_api_environment(env)

    def test_pilot_env_is_rejected_because_cookie_would_not_be_secure(self):
        with self.assertRaisesRegex(RuntimeError, "Secure session cookies"):
            validate_api_environment({"APP_ENV": "pilot"})

    def test_production_requires_authentication(self):
        env = dict(VALID_PRODUCTION_ENV, REQUIRE_AUTH="false")
        with self.assertRaisesRegex(RuntimeError, "REQUIRE_AUTH"):
            validate_api_environment(env)

    def test_production_rejects_weak_session_secret(self):
        env = dict(VALID_PRODUCTION_ENV, SESSION_SECRET="dev-session-secret-change-me")
        with self.assertRaisesRegex(RuntimeError, "SESSION_SECRET"):
            validate_api_environment(env)

    def test_production_rejects_example_admin_password(self):
        env = dict(VALID_PRODUCTION_ENV, ADMIN_PASSWORD="admin-password-change-me")
        with self.assertRaisesRegex(RuntimeError, "ADMIN_PASSWORD"):
            validate_api_environment(env)

    def test_production_rejects_wildcard_or_http_cors(self):
        with self.assertRaisesRegex(RuntimeError, "explicit trusted origins"):
            validate_api_environment(dict(VALID_PRODUCTION_ENV, CORS_ORIGINS="*"))
        with self.assertRaisesRegex(RuntimeError, "https://"):
            validate_api_environment(dict(VALID_PRODUCTION_ENV, CORS_ORIGINS="http://demo.example.com"))


if __name__ == "__main__":
    unittest.main()
