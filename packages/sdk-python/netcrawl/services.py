"""
netcrawl/services.py

Service proxies for structure nodes (Cache, etc.)
Obtained via unit.get_service("node-id").
"""


class ServiceNotReachable(Exception):
    """Raised when a service node is out of range or not available."""
    pass


class CacheService:
    """
    Proxy for a Cache Node. Provides key-value get/set within range.

    Usage:
        cache = self.get_service("cache-node-id")
        val = cache.get("my-key")
        cache.set("my-key", 42)
        cache.set("my-key", 42, ttl=30000)  # expires in 30s
    """

    def __init__(self, client, unit_id: str, cache_node_id: str, info: dict):
        self._client = client
        self._unit_id = unit_id
        self._node_id = cache_node_id
        self.range = info.get("range", 1)
        self.capacity = info.get("capacity", 10)
        self.used_slots = info.get("usedSlots", 0)

    def get(self, key: str):
        """
        Get a value from cache. Returns None on cache miss.

        Returns: the cached value, or None if not found / expired.
        """
        result = self._client.action("cache_get", {
            "cacheNodeId": self._node_id,
            "key": key,
        })
        if not result.get("ok"):
            if result.get("reason") == "not_reachable":
                raise ServiceNotReachable(f"Cache '{self._node_id}' is out of range")
            return None
        return result.get("value") if result.get("hit") else None

    def set(self, key: str, value, ttl: int = 0) -> bool:
        """
        Set a value in cache. Returns True if stored, False if cache is full.

        Args:
            key: cache key
            value: any JSON-serializable value
            ttl: time-to-live in ms (0 = no expiry)
        """
        result = self._client.action("cache_set", {
            "cacheNodeId": self._node_id,
            "key": key,
            "value": value,
            "ttl": ttl,
        })
        if not result.get("ok"):
            if result.get("reason") == "not_reachable":
                raise ServiceNotReachable(f"Cache '{self._node_id}' is out of range")
            return False
        return True

    def keys(self) -> list[str]:
        """List all keys currently in the cache."""
        result = self._client.action("cache_keys", {
            "cacheNodeId": self._node_id,
        })
        if not result.get("ok"):
            if result.get("reason") == "not_reachable":
                raise ServiceNotReachable(f"Cache '{self._node_id}' is out of range")
            return []
        return result.get("keys", [])

    def __repr__(self):
        return f"<CacheService node={self._node_id} range={self.range} capacity={self.capacity}>"
