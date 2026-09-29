"""Safety guards for external LLM calls.

The Lite/demo path must fail closed when an external provider is not explicitly
enabled.  The daily counter is intentionally conservative: a request reserves
one slot before it is sent because a provider may bill a request that later
returns an error.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse


LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "ollama", "host.docker.internal"}
UTC = timezone.utc


class ExternalLLMDisabled(RuntimeError):
    """Raised when an external provider is configured without explicit opt-in."""


class ExternalLLMHostRejected(RuntimeError):
    """Raised when an external endpoint is not on the configured allowlist."""


class ExternalLLMInsecureEndpoint(RuntimeError):
    """Raised when an external endpoint does not use HTTPS."""


class ExternalLLMDailyLimitReached(RuntimeError):
    """Raised when the deployment-wide daily request limit is exhausted."""


def _hostname(base_url: str) -> str:
    parsed = urlparse((base_url or "").strip())
    return (parsed.hostname or "").lower().rstrip(".")


def is_external_base_url(base_url: str) -> bool:
    """Return whether the endpoint is outside the local Docker/runtime network."""

    return _hostname(base_url) not in LOCAL_HOSTS


def _host_is_allowed(host: str, allowed_hosts: set[str]) -> bool:
    """Match exact hosts, or a single tenant label under an explicit *.suffix."""

    for entry in allowed_hosts:
        pattern = entry.strip().lower().rstrip(".")
        if pattern.startswith("*."):
            suffix = pattern[2:]
            marker = f".{suffix}"
            if host.endswith(marker):
                tenant = host[: -len(marker)]
                if tenant and "." not in tenant:
                    return True
        elif host == pattern:
            return True
    return False


def validate_external_provider(
    base_url: str,
    *,
    enabled: bool,
    allowed_hosts: set[str],
) -> None:
    """Fail closed for external endpoints unless explicitly allowed."""

    if not is_external_base_url(base_url):
        return
    if not enabled:
        raise ExternalLLMDisabled(
            "external LLM is disabled; set LLM_EXTERNAL_ENABLED=true explicitly"
        )
    if urlparse((base_url or "").strip()).scheme.lower() != "https":
        raise ExternalLLMInsecureEndpoint("external LLM endpoint must use HTTPS")
    host = _hostname(base_url)
    if not host or not _host_is_allowed(host, allowed_hosts):
        raise ExternalLLMHostRejected(
            f"external LLM host is not allowlisted: {host or 'missing'}"
        )


def reserve_daily_slot(redis_client, *, limit: int, namespace: str = "llm") -> bool:
    """Atomically reserve one external request slot for the current UTC day.

    A non-positive limit disables the external route.  Redis failures are not
    converted into permission to spend: the caller receives the original
    Redis error and the worker fails closed.
    """

    if limit <= 0:
        return False

    now = datetime.now(UTC)
    key = f"{namespace}:external_calls:{now.date().isoformat()}"
    count = int(redis_client.incr(key))
    if count == 1:
        seconds_until_reset = int(
            (datetime.combine(now.date() + timedelta(days=1), datetime.min.time(), tzinfo=UTC) - now).total_seconds()
        )
        redis_client.expire(key, max(seconds_until_reset, 60))
    if count > limit:
        redis_client.decr(key)
        return False
    return True
