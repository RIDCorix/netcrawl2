"""
netcrawl/runtime.py

Runtime proxy objects for equipped items.
These are created by the runner when injecting fields into a worker instance.
"""


class RuntimeItem:
    """
    Runtime proxy for equipped items. Wraps the injected item metadata.
    Created by runner.py when a worker class has an ItemField that gets injected
    with a dict from NETCRAWL_INJECTED.
    """

    def __init__(self, metadata: dict):
        self.item_type = metadata.get('itemType', '')
        self.efficiency = metadata.get('efficiency', 1.0)
        self._worker = None  # set after WorkerClass.__init__ by runner

    def mine(self) -> dict:
        """
        Mine the current node using this pickaxe.
        Creates a drop on the node floor. Use worker.collect() to pick it up.

        Returns: { ok: True, drop: { type: 'ore_chunk', amount: 1 } }
        Fails if: not mineable, node depleted, no pickaxe equipped.
        """
        if self._worker is None:
            raise RuntimeError("Item not properly initialized — _worker is None")
        return self._worker._client.action("mine", {})

    def mine_and_collect(self) -> dict:
        """
        Convenience: mine() then collect() in one call.
        Returns the collected item, or error dict.
        """
        result = self.mine()
        if not result.get("ok"):
            return result
        return self._worker.collect()

    def __repr__(self):
        return f"<{self.item_type} efficiency={self.efficiency}>"
