"""Fixed-window rate limiter. Uses Redis when reachable, in-process memory otherwise."""
import threading
import time

from fastapi import HTTPException, Request, status

from app.core.config import settings

try:
    import redis

    _redis = redis.Redis.from_url(settings.redis_url, socket_connect_timeout=0.3)
    _redis.ping()
except Exception:  # noqa: BLE001 - Redis is optional
    _redis = None

_mem: dict[str, tuple[int, float]] = {}
_lock = threading.Lock()


def _hit(key: str, limit: int, window: int) -> bool:
    if settings.environment == "test" and not key.startswith("test:"):
        return True
    if _redis is not None:
        try:
            pipe = _redis.pipeline()
            pipe.incr(key)
            pipe.expire(key, window, nx=True)
            count, _ = pipe.execute()
            return int(count) <= limit
        except Exception:  # noqa: BLE001
            pass
    now = time.time()
    with _lock:
        count, start = _mem.get(key, (0, now))
        if now - start > window:
            count, start = 0, now
        count += 1
        _mem[key] = (count, start)
        return count <= limit


def rate_limit(bucket: str, limit: int):
    def dependency(request: Request) -> None:
        ident = request.client.host if request.client else "unknown"
        key = f"rl:{bucket}:{ident}"
        if not _hit(key, limit, settings.rate_limit_window_seconds):
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Слишком много запросов. Попробуйте позже.")

    return dependency


def check_limit(key: str, limit: int) -> None:
    if not _hit(key, limit, settings.rate_limit_window_seconds):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Слишком много запросов. Попробуйте позже.")
