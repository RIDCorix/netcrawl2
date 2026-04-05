import type { GuideStep } from './types';

// Japanese translations — start with key quests, expand later
export const ja: Record<string, GuideStep[]> = {
  q_setup: [
    { title: 'VSCodeをインストール', content: `NetCrawlのワーカーはPythonスクリプトです。コードエディタが必要です。

[code.visualstudio.com](https://code.visualstudio.com) から **Visual Studio Code** をダウンロードしてインストールしてください。

**Python拡張機能**もインストール：
1. VSCodeを開く
2. \`Ctrl+Shift+X\`（拡張機能）を押す
3. "Python" を検索 → Microsoft Python拡張機能をインストール` },

    { title: 'ワークスペースの設定', content: `**uv**（Pythonパッケージマネージャー）をインストールし、ワークスペースをクローン：

**uv インストール — Windows (PowerShell)：**
\`\`\`powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
\`\`\`

**uv インストール — macOS / Linux：**
\`\`\`bash
curl -LsSf https://astral.sh/uv/install.sh | sh
\`\`\`

**クローンとインストール：**
\`\`\`bash
git clone https://github.com/Starscribers/netcrawl-workspace.git workspace
cd workspace
uv sync
\`\`\`

\`workspace/\` フォルダが作成されます：
- \`main.py\` — エントリーポイント（ワーカーの登録）
- \`workers/\` — ワーカークラスはここに` },

    { title: 'main.py の設定', content: `\`workspace/main.py\` をエディタで開き、**サーバーURL**を更新します。

ツールバー右上の **Connect** ボタン（ターミナルアイコン）をクリックしてURLを取得：

\`\`\`diff
  app = NetCrawl(
-     api_key="sk-local",
-     server="http://localhost:4800",
+     api_key="sk-local",                        # ローカル版はそのまま
+     server="http://localhost:4800",             # ← Connectダイアログから貼り付け
  )
\`\`\`

**クラウド版**の場合は \`api_key\` も置き換えてください。` },

    { title: 'コードサーバーを実行', content: `\`workspace/\` フォルダでPythonコードサーバーを起動：

\`\`\`bash
uv run main.py
\`\`\`

以下が表示されるはずです：
\`\`\`
[NetCrawl] Registered: Miner (id=miner)
[NetCrawl] Code server connected ✓
\`\`\`

**コードサーバーがゲームサーバーに接続されると、このクエストは自動的に完了します！**

🎉 接続成功後、ワーカーのデプロイボタンが有効になります。` },
  ],
};
