"""Network safety helpers for telephony recording downloads."""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse


class UnsafeRecordingUrl(ValueError):
    """Raised when a recording URL can reach a disallowed network target."""


def _normalized_allowed_hosts(raw_hosts: str | None) -> set[str]:
    return {
        host.strip().rstrip(".").lower()
        for host in (raw_hosts or "").split(",")
        if host.strip()
    }


def _is_public_address(address: str) -> bool:
    ip = ipaddress.ip_address(address)
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def validate_recording_url(
    url: str,
    *,
    allowed_hosts: str | None = None,
    allow_private_hosts: bool = False,
) -> str:
    """Validate an HTTP(S) recording URL before every network hop.

    Private/local targets are denied by default to prevent webhook-driven SSRF. A
    private PBX can be enabled only with an explicit hostname allowlist or the
    broader `allow_private_hosts` escape hatch.
    """

    parsed = urlparse(str(url).strip())
    if parsed.scheme.lower() not in {"http", "https"}:
        raise UnsafeRecordingUrl("Recording URL must use http or https")
    if parsed.username is not None or parsed.password is not None:
        raise UnsafeRecordingUrl("Recording URL must not contain embedded credentials")

    hostname = (parsed.hostname or "").rstrip(".").lower()
    if not hostname:
        raise UnsafeRecordingUrl("Recording URL must include a hostname")

    explicit_allowlist = _normalized_allowed_hosts(allowed_hosts)
    if hostname in explicit_allowlist:
        return url

    try:
        addresses = {
            item[4][0]
            for item in socket.getaddrinfo(hostname, parsed.port or (443 if parsed.scheme.lower() == "https" else 80), type=socket.SOCK_STREAM)
        }
    except socket.gaierror as exc:
        raise UnsafeRecordingUrl("Recording URL hostname could not be resolved") from exc

    if not addresses:
        raise UnsafeRecordingUrl("Recording URL hostname resolved to no addresses")
    if allow_private_hosts:
        return url
    if any(not _is_public_address(address) for address in addresses):
        raise UnsafeRecordingUrl("Recording URL resolves to a private or local network address")
    return url
