"""
Scout — 探索 worker

沿著巡邏路線移動，記錄發現的新節點。

部署需求：
  - patrol_route: 巡邏路徑（建議是一個閉環）
"""
import time
from netcrawl import WorkerClass, Route
from netcrawl.mixins.graph import AdvancedGraphGadget


class Scout(WorkerClass, AdvancedGraphGadget):
    patrol_route = Route("巡邏路徑（閉環）")

    def on_startup(self):
        self.discovered = set()
        self.info("Scout 上線！")

    def on_loop(self):
        # explore() 比 scan() 範圍更大（需要 Beacon 道具最大化）
        nodes = self.explore()
        new_nodes = [n for n in nodes if n["id"] not in self.discovered]

        for node in new_nodes:
            self.discovered.add(node["id"])
            self.info(f"發現新節點：{node['id']} (type={node['type']})")

        self.move_through(self.patrol_route)
        time.sleep(1)
