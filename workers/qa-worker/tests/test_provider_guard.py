import importlib.util
from pathlib import Path

import pytest


MODULE_PATH = Path(__file__).resolve().parents[1] / "provider_guard.py"
spec = importlib.util.spec_from_file_location("provider_guard", MODULE_PATH)
guard = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(guard)


class FakeRedis:
    def __init__(self):
        self.values = {}
        self.expirations = {}

    def incr(self, key):
        self.values[key] = int(self.values.get(key, 0)) + 1
        return self.values[key]

    def decr(self, key):
        self.values[key] = int(self.values.get(key, 0)) - 1
        return self.values[key]

    def expire(self, key, seconds):
        self.expirations[key] = seconds
        return True


def test_local_endpoint_does_not_require_external_opt_in():
    guard.validate_external_provider(
        "http://ollama:11434/v1",
        enabled=False,
        allowed_hosts=set(),
    )


def test_external_endpoint_requires_explicit_opt_in():
    with pytest.raises(guard.ExternalLLMDisabled):
        guard.validate_external_provider(
            "https://api.groq.com/openai/v1",
            enabled=False,
            allowed_hosts={"api.groq.com"},
        )


@pytest.mark.parametrize(
    "base_url",
    [
        "https://generativelanguage.googleapis.com/v1beta/openai",
        "https://api.groq.com/openai/v1",
    ],
)
def test_supported_external_provider_hosts_are_allowed_after_opt_in(base_url):
    guard.validate_external_provider(
        base_url,
        enabled=True,
        allowed_hosts={"generativelanguage.googleapis.com", "api.groq.com"},
    )


def test_qwen_singapore_workspace_host_is_allowed_by_scoped_wildcard():
    guard.validate_external_provider(
        "https://1234567890.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
        enabled=True,
        allowed_hosts={"*.ap-southeast-1.maas.aliyuncs.com"},
    )


@pytest.mark.parametrize(
    "base_url",
    [
        "https://ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
        "https://workspace.ap-southeast-1.maas.aliyuncs.com.attacker.invalid/v1",
        "https://nested.workspace.ap-southeast-1.maas.aliyuncs.com/v1",
        "https://1234567890.cn-beijing.maas.aliyuncs.com/v1",
    ],
)
def test_qwen_wildcard_rejects_non_workspace_or_other_region_hosts(base_url):
    with pytest.raises(guard.ExternalLLMHostRejected):
        guard.validate_external_provider(
            base_url,
            enabled=True,
            allowed_hosts={"*.ap-southeast-1.maas.aliyuncs.com"},
        )


def test_external_endpoint_must_be_allowlisted_and_https():
    with pytest.raises(guard.ExternalLLMHostRejected):
        guard.validate_external_provider(
            "https://example.invalid/v1",
            enabled=True,
            allowed_hosts={"api.groq.com"},
        )
    with pytest.raises(guard.ExternalLLMInsecureEndpoint):
        guard.validate_external_provider(
            "http://api.groq.com/openai/v1",
            enabled=True,
            allowed_hosts={"api.groq.com"},
        )


def test_daily_reservation_does_not_exceed_limit():
    client = FakeRedis()
    assert guard.reserve_daily_slot(client, limit=2, namespace="test") is True
    assert guard.reserve_daily_slot(client, limit=2, namespace="test") is True
    assert guard.reserve_daily_slot(client, limit=2, namespace="test") is False
    assert sum(client.values.values()) == 2
