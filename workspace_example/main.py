"""
NetCrawl Worker Codebase — Entry Point
=======================================
Copy this folder to workspace/ (gitignored) and start editing.

Usage:
    pip install ../packages/sdk-python   # install the SDK
    python main.py                       # start the code server

The code server will:
  1. Register all worker classes with the game server
  2. Open a persistent channel to receive deploy commands
  3. Fork subprocesses when you deploy workers from the UI
"""
from netcrawl import NetCrawl

from workers.miner import Miner
from workers.guardian import Guardian
from workers.scout import Scout
from workers.handler import Handler

app = NetCrawl(
    api_key="sk-local",             # local 版隨便填，cloud 版換成你的 API key
    server="http://localhost:4800",  # game server 位置
)

app.register(Miner)
app.register(Guardian)
app.register(Scout)
app.register(Handler)

# 新增你的 worker class 就在這裡 register 就好
# from workers.my_custom_worker import MyWorker
# app.register(MyWorker)

if __name__ == "__main__":
    app.run()
