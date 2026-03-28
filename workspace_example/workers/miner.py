"""
Miner — 基本採礦 worker

挖礦流程：
  move to ore node → mine() → collect() → move to hub → deposit()

部署需求：
  - pickaxe: 1x Pickaxe（從 inventory 選）
  - to_mine:  Hub → 礦場節點 的路徑
  - to_hub:   礦場節點 → Hub 的路徑
"""
from netcrawl import WorkerClass, Route
from netcrawl.items.equipment import Pickaxe


class Miner(WorkerClass):
    pickaxe = Pickaxe()
    to_mine = Route("Hub → 礦場")
    to_hub  = Route("礦場 → Hub")

    def on_startup(self):
        self.trips = 0
        self.info("Miner 上線！")

    def on_loop(self):
        # 前往礦場
        self.move_through(self.to_mine)

        # 挖掘並撿起掉落物
        mine_result = self.pickaxe.mine()
        if not mine_result.get("ok"):
            reason = mine_result.get("reason", "unknown")
            if reason == "node_depleted":
                self.warn("礦場耗盡，等待恢復...")
                import time; time.sleep(10)
                return
            self.warn(f"mine() 失敗: {reason}")
            return

        collect_result = self.collect()
        if not collect_result.get("ok"):
            self.warn(f"collect() 失敗: {collect_result.get('reason')}")
            return

        drop = collect_result.get("item", {})
        self.info(f"撿到 {drop.get('amount')}x {drop.get('type')}")

        # 回 Hub
        self.move_through(self.to_hub)

        # 交出去
        self.deposit()

        self.trips += 1
        if self.trips % 5 == 0:
            self.info(f"已完成 {self.trips} 趟")
