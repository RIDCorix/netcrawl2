import type { GuideStep } from './types';

export const zhTW: Record<string, GuideStep[]> = {
  q_setup: [
    {
      title: '開啟 Codespace',
      content: `開啟預先設定好的 [NetCrawl Codespace](https://codespaces.new/Starscribers/netcrawl-workspace/tree/main?quickstart=1)。

依提示登入 GitHub、確認由誰支付 Codespace 費用，然後點擊 **Create codespace**。不需要在電腦安裝 VS Code 或 Python。

> Codespace 必須透過網路連到遊戲伺服器。如果 **Connect** 對話框顯示的是 \`localhost\` URL，請改用[本機 clone 流程](https://github.com/Starscribers/netcrawl-workspace#quick-start)；Codespace 無法連到只在你電腦上執行的伺服器。`,
    },

    {
      title: '等待自動設定',
      content: `GitHub 會在瀏覽器開啟工作區，並自動：

- 安裝 Python 3.12、Microsoft Python 擴充套件與 \`uv\`
- 建立鎖定版本的 \`.venv\` 並選為 interpreter
- 設定綠色 Run 按鈕與 F5 使用的 **NetCrawl: Start Code Server**

請等 post-create setup 完成後再編輯。如果設定失敗，先在 repository root 執行 \`uv sync --frozen\`；仍失敗時執行 **Codespaces: Rebuild Container**，不要在安裝不完整的環境中繼續。`,
    },

    {
      title: '設定 main.py',
      content: `在 Codespace 開啟 \`main.py\`，找到 \`NetCrawl(...)\` 的部分，更新 **伺服器 URL**。

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
\`\`\``,
    },

    {
      title: '執行 Code Server',
      content: `開啟 **Run and Debug**，選擇 **NetCrawl: Start Code Server**，然後點擊綠色播放鍵（或按 F5）。

你應該會看到：
\`\`\`
[NetCrawl] Registered: Miner (id=miner)
[NetCrawl] Code server connected ✓
\`\`\`

請用這個簡化的點擊骨架對照畫面：

\`\`\`text
[VS Code] Explorer → main.py → Run and Debug → NetCrawl: Start Code Server → ▶ / F5
[遊戲]   地圖 → Hub → 部署 Worker → HelloWorker → 部署
\`\`\`

**當 code server 連線到遊戲伺服器時，此任務會自動完成！**

🎉 連線成功後，部署 Worker 的按鈕就會啟用。前往下一個任務吧。`,
    },
  ],

  q_hello_world: [
    {
      title: 'Worker 生命週期',
      content: `每個 Worker 有兩個方法：

- \`on_startup()\` — 啟動時執行**一次**
- \`on_loop()\` — **永遠重複**執行

\`\`\`python
class HelloWorker(WorkerClass):
    class_name = "HelloWorker"
    class_id = "helloworker"

    def on_startup(self):
        self.info("我剛啟動！")    # 執行一次

    def on_loop(self):
        self.info("還在跑...")     # 永遠重複
\`\`\`
\`\`\`javascript
class HelloWorker extends WorkerClass {
    static classId = 'hello';
    static className = 'Hello';

    onStartup() {
        this.info("我剛啟動！");    // 執行一次
    }

    onLoop() {
        this.info("還在跑...");     // 永遠重複
    }
}
\`\`\`

遊戲引擎會先呼叫 \`on_startup()\` 一次，然後不斷呼叫 \`on_loop()\` 直到你停止 Worker。`,
    },

    {
      title: '日誌：info、warn、error',
      content: `Worker 可以發送訊息到 UI：

\`\`\`python
self.info("一切正常！")      # 綠色 — 正常狀態
self.warn("資源不足")        # 黃色 — 需要注意
self.error("無法移動！")     # 紅色 — 出了問題
\`\`\`
\`\`\`javascript
this.info("一切正常！");      // 綠色 — 正常狀態
this.warn("資源不足");        // 黃色 — 需要注意
this.error("無法移動！");     // 紅色 — 出了問題
\`\`\`

這些訊息會顯示在 Worker 的日誌面板和地圖上的對話氣泡。

用 \`info()\` 報告正常狀態，\`warn()\` 報告不嚴重的問題，\`error()\` 報告需要處理的錯誤。`,
    },

    {
      title: '部署你的第一個 Worker',
      content: `\`workers/helloworker.py\` 裡的 \`HelloWorker\` 已由 \`main.py\` 註冊，可以部署：

1. 點擊地圖上的 **Hub** 節點
2. 點擊**部署 Worker**
3. 從下拉選單選擇 **HelloWorker**
4. 依照真正的對話框按下**部署**（不需要路線或裝備！）

觀察 Worker 日誌 — 你會看到 \`"我剛啟動！"\` 出現一次，然後 \`"還在跑..."\` 不斷重複。

**目標：** 部署 1 個 Worker 即可完成此任務。之後你就會學到真正的挖礦方法！`,
    },
  ],

  q_method_call: [
    {
      title: '什麼是方法？',
      content: `在 Python 中，**方法**是屬於物件的函式。用點號呼叫：

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

每次方法呼叫都是告訴你的 Worker **執行某個動作**。方法是你與遊戲世界互動的方式。`,
    },

    {
      title: '寫你的第一個 Worker',
      content: `開啟 \`workspace/workers/miner.py\`（或 \`miner.js\`）並寫入：

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

\`Edge\` 是兩個相鄰節點之間的單一連線。部署時在地圖上點選一條邊。\`self.move(edge)\` 可以沿著它來回移動。`,
    },

    {
      title: '部署並觀察',
      content: `1. 點擊 **Hub** 節點 → **部署 Worker**
2. 從下拉選單選擇 **Miner**
3. 選擇一條連接到資源節點的**邊**
4. 從背包裝備一把**鎬子**
5. 點擊**部署**

觀察 Worker 日誌 — 你會看到每個方法呼叫依序執行。

**目標：** 挖礦 1 次 + 存入 1 次即可完成此任務。`,
    },
  ],

  q_dot_notation: [
    {
      title: '讀取屬性',
      content: `物件有**屬性**，可以用點號讀取：

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

點號讓你在行動前先**檢查**世界狀態。`,
    },

    {
      title: '探索地圖',
      content: `看看地圖 — 有些節點是**鎖定**的（灰色）。點擊鎖定的節點可以看到：
- 它的**類型**（resource、compute、relay...）
- 它的**解鎖費用**（需要多少 data）

要解鎖節點，你需要足夠的資源。在節點詳情面板點擊 **"解鎖"**。

**目標：** 解鎖 1 個節點。選擇 Hub 附近的資源節點方便挖礦。`,
    },
  ],

  q_craft_first: [
    {
      title: '合成基礎十字鎬',
      content: `開啟**背包**並選擇**合成**分頁。選取**基礎十字鎬**、確認所需 data，然後執行合成。

起始十字鎬不計入任務；你必須額外合成一把基礎十字鎬。按下**開啟手冊**可查看裝備 → 移動 → 採礦 → 收集 → 返回 → 存入的完整示範。`,
    },
  ],

  q_conditions: [
    {
      title: 'Bad Data 問題',
      content: `每個資料礦場都有機會產出 **bad data** — 混在好資料中的損壞數據。

如果你在 Hub 存入 bad data，它會**倒扣**你的 data 資源！

Data Mine Nano 有 **40% 的 bad data 率**（60% 乾淨度）。其他礦場比較乾淨，但都有風險。

你需要學會 \`if\` 陳述式來在存入前**過濾掉 bad data**。`,
    },

    {
      title: 'if 陳述式',
      content: `\`if\` 陳述式讓你的程式碼做決定：

\`\`\`python
if condition:
    do_this()
else:
    do_that()
\`\`\`

\`collect()\` 之後，檢查 \`self.holding\` 看你撿到了什麼：
- \`self.holding.type\` — \`"data_fragment"\`（好的）或 \`"bad_data"\`（壞的）
- \`self.discard()\` — 丟棄手持物品，不存入`,
    },

    {
      title: '帶過濾的聰明礦工',
      content: `這是一個會過濾 bad data 的礦工：

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
- 丟棄 **100 個 bad data**
- 總共存入 **1 kB data**

不過濾的話，bad data 會吃掉你的資源！`,
    },
  ],

  q_operators: [
    {
      title: '比較運算子',
      content: `Python 有比較值的運算子：

| 運算子 | 意義 | 範例 |
|--------|------|------|
| \`>\` | 大於 | \`a > 10\` |
| \`<\` | 小於 | \`health < 50\` |
| \`==\` | 等於 | \`status == "infected"\` |
| \`!=\` | 不等於 | \`type != "hub"\` |
| \`>=\` | 大於或等於 | \`count >= 3\` |

這些用在 \`if\` 陳述式中做數值判斷。`,
    },

    {
      title: '感染防禦',
      content: `有些節點會被**感染** — 它們會變紅並將感染擴散到鄰居。

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

**目標：** 往 Hub 東邊前往 **Operator Academy**，依題目指定的運算子解開 **1 個 compute puzzle**。伺服器記錄一次解題後任務即完成。`,
    },
  ],

  q_while_loop: [
    {
      title: '重複直到完成',
      content: `\`while\` 迴圈在**條件為真時重複**執行：

\`\`\`python
while there_is_work:
    do_work()
\`\`\`

不像 \`for\` 迴圈（遍歷已知集合），\`while\` 迴圈處理**未知**數量的工作。你事先不知道會迴圈多少次。`,
    },

    {
      title: '過濾 Bad Data',
      content: `有些資源節點會產出 **bad_data** 掉落物。你需要把它們過濾掉：

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

**目標：** 總共存入 **2 kB data**。while 迴圈幫你更有效率地過濾。`,
    },
  ],

  q_for_loop: [
    {
      title: '路徑與 For 迴圈',
      content: `之前你用的是 \`Edge\` — 兩個相鄰節點之間的單一連線。但如果礦場**很遠**，中間隔著中繼節點呢？

\`Route\` 是**多節點路徑**。部署時按順序點擊節點。執行時它變成可迭代的邊列表：

\`\`\`python
route = Route("hub → 中繼站 → 深層礦場")

# 執行時，self.route 可迭代：
for edge in self.route:
    self.move(edge)       # 一步一步走
\`\`\``,
    },

    {
      title: '建立遠程礦工',
      content: `建立 \`workspace/workers/long_range_miner.py\`：

\`\`\`python
from netcrawl import WorkerClass, Route
from netcrawl.items.equipment import Pickaxe

class LongRangeMiner(WorkerClass):
    class_name = "Long Range Miner"
    class_id = "long_range_miner"

    pickaxe = Pickaxe()
    route = Route("hub → 中繼站 → 深層礦場")

    def on_loop(self):
        # 沿路線前進：hub → 中繼站 → 礦場
        for edge in self.route:
            self.move(edge)

        self.pickaxe.mine_and_collect()

        # 過濾 bad data
        if self.holding and self.holding.type == "bad_data":
            self.discard()
            return

        # 沿路線返回：礦場 → 中繼站 → hub
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
        for (const edge of this.route)
            this.move(edge);

        this.pickaxe.mineAndCollect();

        if (this.holding?.type === 'bad_data') {
            this.discard();
            return;
        }

        for (const edge of [...this.route].reverse())
            this.move(edge);

        this.deposit();
    }
}
\`\`\`

在 \`main.py\` 中註冊，然後用一條路徑部署到遠處的礦場。`,
    },

    {
      title: '部署與測試',
      content: `1. 在 \`main.py\` 註冊 \`LongRangeMiner\`
2. 部署到 **Hub** → 選擇 **Route** → 點擊：**Hub → Data Mine Alpha**
3. 裝備**鎬子**
4. 觀察 log — 你會看到 worker 逐步走過每條邊

重點：
- \`for edge in self.route\` — 沿路徑前進
- \`reversed(self.route)\` — 反向走回去
- \`Route\` 可以是任意長度 — 2 個節點、5 個、10 個都行

**目標：** 用路徑到達更遠、產量更高的礦場，挖礦 **20 次**。`,
    },
  ],

  q_cluster_mining: [
    {
      title: '資料礦場叢集',
      content: `Hub 南方有一個**資料礦場叢集** — 一個中繼節點被多個小型資源節點包圍。

這些節點容量低但補充快。技巧是用 **AdvancedSensor** 掃描附近的邊，找出所有礦場然後逐一訪問。

\`AdvancedSensor\` 是一個 gadget，會掃描相鄰的邊並告訴你每個連接節點的**類型**。`,
    },

    {
      title: '建立叢集礦工',
      content: `建立 \`workspace/workers/cluster_miner.py\`：

\`\`\`python
from netcrawl import WorkerClass, AdvancedSensor, ResourceNode
from netcrawl.items.equipment import Pickaxe

class ClusterMiner(WorkerClass):
    class_name = "Cluster Miner"
    class_id = "cluster_miner"

    pickaxe = Pickaxe()
    sensor = AdvancedSensor()

    def on_loop(self):
        # 掃描當前節點的所有邊
        edges = self.sensor.scan()

        for edge in edges:
            # 只訪問資源節點
            if isinstance(edge.target_node, ResourceNode):
                self.move(edge.edge_id)       # 去礦場
                self.pickaxe.mine_and_collect()
                self.move(edge.edge_id)       # 回中繼站

        # 訪問完所有礦場後，如果手持好資料就記錄
        if self.holding and self.holding.type != "bad_data":
            self.info(f"收集到 {self.holding.type}")
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
                this.move(edge.edgeId);
                this.pickaxe.mineAndCollect();
                this.move(edge.edgeId);
            }
        }

        if (this.holding?.type !== 'bad_data') {
            this.info(\`收集到 \${this.holding?.type}\`);
        }
    }
}
\`\`\`

重點：
- \`AdvancedSensor.scan()\` 回傳帶完整節點類型的邊
- \`isinstance(edge.target_node, ResourceNode)\` 過濾出可挖掘的節點
- 不需要 \`Route\` — sensor 動態探索路徑

**目標：** 總共挖礦 **50 次**。部署到任何靠近礦場叢集的中繼站。`,
    },
  ],
};
