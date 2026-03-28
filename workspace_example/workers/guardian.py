"""
Guardian — 巡邏修復 worker

掃描附近 node，若發現 infected 就前往修復。

部署需求：
  - shield: 1x Shield（從 inventory 選）
  - sensor: 感應器小工具（自動提供，提供 travel_to 尋路）
"""
import time
from netcrawl import WorkerClass, SensorGadget
from netcrawl.items.equipment import Shield


class Guardian(WorkerClass):
    shield = Shield()
    sensor = SensorGadget()
    class_name = "Guardian"
    class_id = "guardian"

    def on_startup(self):
        self.repairs = 0
        self.info("Guardian 上線，開始巡邏...")

    def on_loop(self):
        nodes = self.scan()
        infected = [n for n in nodes if n.get("type") == "infected"]

        if infected:
            target = infected[0]
            self.warn(f"偵測到感染節點：{target['id']}")
            self.sensor.travel_to(target["id"])  # A* 自動尋路
            ok = self.repair(target["id"])
            if ok:
                self.repairs += 1
                self.info(f"修復完成 {target['id']}（累計 {self.repairs} 次）")
            self.sensor.travel_to("hub")
        else:
            self.info("網路正常，待命中...")
            time.sleep(5)
