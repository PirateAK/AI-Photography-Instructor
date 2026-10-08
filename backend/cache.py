"""Thread-safe in-memory LRU cache with TTL (cost control for AI calls)."""
from __future__ import annotations

import hashlib
import threading
import time
from collections import OrderedDict


def make_key(*parts: str) -> str:
    return hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()


class MemoryCache:
    def __init__(self, maxsize: int = 128, ttl: float = 3600.0):
        self._maxsize = maxsize
        self._ttl = ttl
        self._store: OrderedDict[str, tuple[float, object]] = OrderedDict()
        self._lock = threading.Lock()
        self.hits = 0
        self.misses = 0

    def get(self, key: str):
        now = time.monotonic()
        with self._lock:
            item = self._store.get(key)
            if item is None:
                self.misses += 1
                return None
            stored_at, value = item
            if now - stored_at > self._ttl:
                del self._store[key]
                self.misses += 1
                return None
            self._store.move_to_end(key)
            self.hits += 1
            return value

    def put(self, key: str, value) -> None:
        with self._lock:
            self._store[key] = (time.monotonic(), value)
            self._store.move_to_end(key)
            while len(self._store) > self._maxsize:
                self._store.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()
