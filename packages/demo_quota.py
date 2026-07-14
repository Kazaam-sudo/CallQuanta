from __future__ import annotations

import redis


RESERVATION_KEY = "demo:qa:reservations"


def reservation_member(call_id: int) -> str:
    return str(int(call_id))


def reserve_demo_call(
    client: redis.Redis,
    *,
    call_id: int,
    limit: int,
    completed_count: int,
) -> tuple[bool, bool]:
    """Atomically reserve one in-flight demo slot.

    Returns (accepted, already_reserved). Completed reviews are counted from the
    database; Redis contains only in-flight reservations and is removed after a
    terminal success/failure.
    """
    if limit <= 0:
        return True, False
    script = """
    if redis.call('SISMEMBER', KEYS[1], ARGV[1]) == 1 then
      return 2
    end
    local reserved = redis.call('SCARD', KEYS[1])
    if tonumber(ARGV[2]) + reserved >= tonumber(ARGV[3]) then
      return 0
    end
    redis.call('SADD', KEYS[1], ARGV[1])
    return 1
    """
    result = int(
        client.eval(
            script,
            1,
            RESERVATION_KEY,
            reservation_member(call_id),
            int(completed_count),
            int(limit),
        )
    )
    return result in {1, 2}, result == 2


def release_demo_call(client: redis.Redis, call_id: int) -> None:
    client.srem(RESERVATION_KEY, reservation_member(call_id))


def reserved_demo_calls(client: redis.Redis) -> int:
    return int(client.scard(RESERVATION_KEY))
