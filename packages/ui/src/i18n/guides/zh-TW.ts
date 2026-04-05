import type { GuideStep } from './types';

export const zhTW: Record<string, GuideStep[]> = {
  q_setup: [
    { title: '安裝 VSCode', content: `NetCrawl 的 Worker 是 Python 腳本，你需要一個程式碼編輯器。

從 [code.visualstudio.com](https://code.visualstudio.com) 下載並安裝 **Visual Studio Code**。

安裝 **Python 擴充套件**：
1. 開啟 VSCode
2. 按 \`Ctrl+Shift+X\`（擴充套件）
3. 搜尋 "Python" → 安裝 Microsoft 的 Python 擴充套件` },

    { title: '設定工作區', content: `安裝 **uv**（Python 套件管理器），然後 clone 工作區：

**安裝 uv — Windows (PowerShell)：**
\`\`\`powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
\`\`\`

**安裝 uv — macOS / Linux：**
\`\`\`bash
curl -LsSf https://astral.sh/uv/install.sh | sh
\`\`\`

**Clone 並安裝：**
\`\`\`bash
git clone https://github.com/Starscribers/netcrawl-workspace.git workspace
cd workspace
uv sync
\`\`\`

這會建立一個 \`workspace/\` 資料夾：
- \`main.py\` — 進入點（註冊你的 Worker）
- \`workers/\` — 你的 Worker 類別放這裡` },

    { title: '設定 main.py', content: `用編輯器開啟 \`workspace/main.py\`，找到 \`NetCrawl(...)\` 的部分，更新 **伺服器 URL**。

點擊右上角工具列的 **Connect** 按鈕（終端機圖示）取得你的伺服器 URL，然後修改：

\`\`\`diff
  app = NetCrawl(
-     api_key="sk-local",
-     server="http://localhost:4800",
+     api_key="sk-local",                        # 本地版保持不變
+     server="http://localhost:4800",             # ← 從 Connect 對話框貼上 URL
  )
\`\`\`

> **如何找到你的 URL：** 點擊工具列上閃爍的 **Connect** 按鈕 → 複製 **Server URL**。

如果你使用的是 **雲端版**，也要替換 \`api_key\`：

\`\`\`diff
  app = NetCrawl(
-     api_key="sk-local",
-     server="http://localhost:4800",
+     api_key="eyJhbG...",                       # ← 從 Connect 對話框取得
+     server="https://netcrawl-server-....app",   # ← 從 Connect 對話框取得
  )
\`\`\`` },

    { title: '執行 Code Server', content: `在 \`workspace/\` 資料夾中啟動你的 Python code server：

\`\`\`bash
uv run main.py
\`\`\`

你應該會看到：
\`\`\`
[NetCrawl] Registered: Miner (id=miner)
[NetCrawl] Code server connected ✓
\`\`\`

**當 code server 連線到遊戲伺服器時，此任務會自動完成！**

🎉 連線成功後，部署 Worker 的按鈕就會啟用。前往下一個任務吧。` },
  ],

  q_method_call: [
    { title: '什麼是方法？', content: `在 Python 中，**方法**是屬於物件的函式。用點號呼叫：

\`\`\`python
self.mine()       # 呼叫挖礦方法
self.collect()    # 呼叫收集方法
self.deposit()    # 呼叫存入方法
\`\`\`
\`\`\`javascript
this.mine();       // 呼叫挖礦方法
this.collect();    // 呼叫收集方法
this.deposit();    // 呼叫存入方法
\`\`\`

每次方法呼叫都是告訴你的 Worker **執行某個動作**。方法是你與遊戲世界互動的方式。` },

    { title: '寫你的第一個 Worker', content: `開啟 \`workspace/workers/miner.py\`（或 \`miner.js\`）並寫入：

\`\`\`python
from netcrawl import WorkerClass, Edge
from netcrawl.items.equipment import Pickaxe

class Miner(WorkerClass):
    class_name = "Miner"
    class_id = "miner"

    pickaxe = Pickaxe()
    edge = Edge("hub ↔ 礦場")

    def on_loop(self):
        self.move(self.edge)           # hub → 礦場
        self.pickaxe.mine_and_collect() # 挖礦 + 撿起
        self.move(self.edge)           # 礦場 → hub
        self.deposit()                 # 轉換為資源
\`\`\`
\`\`\`javascript
import { WorkerClass, Edge, Pickaxe } from '@netcrawl/sdk';

class Miner extends WorkerClass {
    static classId = 'miner';
    static className = 'Miner';
    static fields = {
        pickaxe: new Pickaxe(),
        edge: new Edge('hub ↔ 礦場'),
    };

    onLoop() {
        this.move(this.edge);           // hub → 礦場
        this.pickaxe.mineAndCollect();  // 挖礦 + 撿起
        this.move(this.edge);           // 礦場 → hub
        this.deposit();                 // 轉換為資源
    }
}
\`\`\`

\`Edge\` 是兩個相鄰節點之間的單一連線。部署時在地圖上點選一條邊。\`self.move(edge)\` 可以沿著它來回移動。` },

    { title: '部署並觀察', content: `1. 點擊 **Hub** 節點 → **部署 Worker**
2. 從下拉選單選擇 **Miner**
3. 選擇一條連接到資源節點的**邊**
4. 從背包裝備一把**鎬子**
5. 點擊**部署**

觀察 Worker 日誌 — 你會看到每個方法呼叫依序執行。

**目標：** 挖礦 1 次 + 存入 1 次即可完成此任務。` },
  ],

  q_dot_notation: [
    { title: '讀取屬性', content: `物件有**屬性**，可以用點號讀取：

\`\`\`python
node = self.get_current_node()
print(node.node_type)    # "resource", "hub", "compute"...
print(node.label)        # "Data Mine Alpha"

item = self.collect()
print(item.type)         # "data_fragment" 或 "bad_data"
\`\`\`
\`\`\`javascript
const node = this.getCurrentNode();
console.log(node.nodeType);    // "resource", "hub", "compute"...
console.log(node.label);       // "Data Mine Alpha"

const item = this.collect();
console.log(item.type);        // "data_fragment" 或 "bad_data"
\`\`\`

點號讓你在行動前先**檢查**世界狀態。` },

    { title: '探索地圖', content: `看看地圖 — 有些節點是**鎖定**的（灰色）。點擊鎖定的節點可以看到：
- 它的**類型**（resource、compute、relay...）
- 它的**解鎖費用**（需要多少 data）

要解鎖節點，你需要足夠的資源。在節點詳情面板點擊 **"解鎖"**。

**目標：** 解鎖 1 個節點。選擇 Hub 附近的資源節點方便挖礦。` },
  ],

  q_conditions: [
    { title: 'Bad Data 問題', content: `每個資料礦場都有機會產出 **bad data** — 混在好資料中的損壞數據。

如果你在 Hub 存入 bad data，它會**倒扣**你的 data 資源！

Data Mine Nano 有 **40% 的 bad data 率**（60% 乾淨度）。其他礦場比較乾淨，但都有風險。

你需要學會 \`if\` 陳述式來在存入前**過濾掉 bad data**。` },

    { title: 'if 陳述式', content: `\`if\` 陳述式讓你的程式碼做決定：

\`\`\`python
if condition:
    do_this()
else:
    do_that()
\`\`\`

\`collect()\` 之後，檢查 \`self.holding\` 看你撿到了什麼：
- \`self.holding.type\` — \`"data_fragment"\`（好的）或 \`"bad_data"\`（壞的）
- \`self.discard()\` — 丟棄手持物品，不存入` },

    { title: '帶過濾的聰明礦工', content: `這是一個會過濾 bad data 的礦工：

\`\`\`python
def on_loop(self):
    self.move(self.to_mine)
    self.pickaxe.mine_and_collect()

    # 檢查我們撿到了什麼
    if self.holding and self.holding.type == "bad_data":
        self.discard()          # 丟棄 bad data
        self.info("丟棄了 bad data！")
    else:
        self.move(self.to_hub)
        self.deposit()
        self.info("存入了好資料！")
\`\`\`
\`\`\`javascript
onLoop() {
    this.move(this.toMine);
    this.pickaxe.mineAndCollect();

    // 檢查我們撿到了什麼
    if (this.holding && this.holding.type === 'bad_data') {
        this.discard();          // 丟棄 bad data
        this.info('丟棄了 bad data！');
    } else {
        this.move(this.toHub);
        this.deposit();
        this.info('存入了好資料！');
    }
}
\`\`\`

**目標：**
- 丟棄 **5 個 bad data**
- 總共存入 **300 data**

不過濾的話，bad data 會吃掉你的資源！` },
  ],

  q_operators: [
    { title: '比較運算子', content: `Python 有比較值的運算子：

| 運算子 | 意義 | 範例 |
|--------|------|------|
| \`>\` | 大於 | \`a > 10\` |
| \`<\` | 小於 | \`health < 50\` |
| \`==\` | 等於 | \`status == "infected"\` |
| \`!=\` | 不等於 | \`type != "hub"\` |
| \`>=\` | 大於或等於 | \`count >= 3\` |

這些用在 \`if\` 陳述式中做數值判斷。` },

    { title: '感染防禦', content: `有些節點會被**感染** — 它們會變紅並將感染擴散到鄰居。

你可以寫一個用運算子檢查感染的 Worker：

\`\`\`python
node = self.get_current_node()
if node.is_infected:
    self.repair(node.id)
\`\`\`
\`\`\`javascript
const node = this.getCurrentNode();
if (node.isInfected) {
    this.repair(node.id);
}
\`\`\`

**目標：** 修復 1 個受感染的節點。你可能需要等待感染事件，或探索地圖找到一個。
修復需要 **500 data** — 確保你有足夠的資源！` },
  ],

  q_while_loop: [
    { title: '重複直到完成', content: `\`while\` 迴圈在**條件為真時重複**執行：

\`\`\`python
while there_is_work:
    do_work()
\`\`\`

不像 \`for\` 迴圈（遍歷已知集合），\`while\` 迴圈處理**未知**數量的工作。你事先不知道會迴圈多少次。` },

    { title: '過濾 Bad Data', content: `有些資源節點會產出 **bad_data** 掉落物。你需要把它們過濾掉：

\`\`\`python
def on_loop(self):
    self.move_edge(self.route)
    self.pickaxe.mine()

    # 持續收集直到拿到好資料
    while self.has_dropped_items():
        result = self.collect()
        if result.item.type == "bad_data":
            self.discard()       # 丟棄 bad data
        else:
            break                # 拿到好資料了！

    self.move_edge(self.route)
    self.deposit()
\`\`\`
\`\`\`javascript
onLoop() {
    this.moveEdge(this.route);
    this.pickaxe.mine();

    // 持續收集直到拿到好資料
    while (this.hasDroppedItems()) {
        const result = this.collect();
        if (result.item.type === 'bad_data') {
            this.discard();       // 丟棄 bad data
        } else {
            break;                // 拿到好資料了！
        }
    }

    this.moveEdge(this.route);
    this.deposit();
}
\`\`\`

\`has_dropped_items()\` 檢查節點是否還有掉落物。\`discard()\` 丟棄手持物品。

**目標：** 總共存入 **1,000 data**。while 迴圈幫你更有效率地過濾。` },
  ],

  q_for_loop: [
    { title: '遍歷集合', content: `\`for\` 迴圈會訪問集合中的每個元素：

\`\`\`python
for item in collection:
    process(item)
\`\`\`

不像 \`while\`（重複直到條件不成立），\`for\` 遍歷一組**已知的**東西 — 列表、路徑、掃描結果。` },

    { title: '路徑 Route：多邊路線', content: `之前你用的是 \`Edge\`（單一連線）。\`Route\` 是跨越**多個節點的路徑**。

部署時按順序點擊節點來建立路徑。執行時它會變成邊 ID 的列表：

\`\`\`python
from netcrawl import WorkerClass, Route
from netcrawl.items.equipment import Pickaxe

class LongRangeMiner(WorkerClass):
    class_name = "Long Range Miner"
    class_id = "long_range_miner"

    pickaxe = Pickaxe()
    route = Route("hub → 中繼站 → 深層礦場")

    def on_loop(self):
        # 沿路線前進
        for edge in self.route:
            self.move(edge)

        self.pickaxe.mine_and_collect()

        # 沿路線返回
        for edge in reversed(self.route):
            self.move(edge)

        self.deposit()
\`\`\`
\`\`\`javascript
import { WorkerClass, Route, Pickaxe } from '@netcrawl/sdk';

class LongRangeMiner extends WorkerClass {
    static classId = 'long_range_miner';
    static className = 'Long Range Miner';
    static fields = {
        pickaxe: new Pickaxe(),
        route: new Route('hub → 中繼站 → 深層礦場'),
    };

    onLoop() {
        for (const edge of this.route) {
            this.move(edge);
        }

        this.pickaxe.mineAndCollect();

        for (const edge of [...this.route].reverse()) {
            this.move(edge);
        }

        this.deposit();
    }
}
\`\`\`

\`reversed(self.route)\` 把路徑反轉 — 回程的最佳選擇。` },

    { title: '資料礦場叢集', content: `在地圖的南方，有一個**資料礦場叢集**：一個中繼站被 6 個小型資源節點包圍（容量 1，每 5 秒補充）。

坐在一個節點上毫無意義 — 它會立刻耗盡。你需要用迴圈**依序訪問所有節點**：

\`\`\`python
from netcrawl import WorkerClass, AdvancedSensor, ResourceNode
from netcrawl.items.equipment import Pickaxe

class ClusterMiner(WorkerClass):
    class_name = "Cluster Miner"
    class_id = "cluster_miner"

    pickaxe = Pickaxe()
    sensor = AdvancedSensor()

    def on_loop(self):
        edges = self.sensor.scan()

        for edge in edges:
            if isinstance(edge.target_node, ResourceNode):
                self.move_edge(edge.edge_id)
                self.pickaxe.mine()
                self.collect()
                self.move_edge(edge.edge_id)  # 回到中繼站
                self.deposit()
\`\`\`
\`\`\`javascript
import { WorkerClass, AdvancedSensor, ResourceNode, Pickaxe } from '@netcrawl/sdk';

class ClusterMiner extends WorkerClass {
    static classId = 'cluster_miner';
    static className = 'Cluster Miner';
    static fields = {
        pickaxe: new Pickaxe(),
        sensor: new AdvancedSensor(),
    };

    onLoop() {
        const edges = this.sensor.scan();

        for (const edge of edges) {
            if (edge.targetNode instanceof ResourceNode) {
                this.moveEdge(edge.edgeId);
                this.pickaxe.mine();
                this.collect();
                this.moveEdge(edge.edgeId);  // 回到中繼站
                this.deposit();
            }
        }
    }
}
\`\`\`

**注意：** 叢集中繼站不是 Hub — 你需要先把資料帶回主 Hub。請調整你的程式碼！

**目標：** 總共挖礦 **20 次**。叢集是最快達成目標的方式。` },
  ],
};
