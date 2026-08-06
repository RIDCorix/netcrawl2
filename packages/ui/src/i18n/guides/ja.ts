import type { GuideStep } from './types';

// Japanese translations — start with key quests, expand later
export const ja: Record<string, GuideStep[]> = {
  q_setup: [
    {
      title: 'Codespaceを開く',
      content: `設定済みの [NetCrawl Codespace](https://codespaces.new/Starscribers/netcrawl-workspace/tree/main?quickstart=1) を開きます。

必要に応じてGitHubにサインインし、Codespaceの支払元を確認して **Create codespace** をクリックします。ローカルへのVS CodeやPythonのインストールは不要です。

> Codespaceからゲームサーバーへインターネット経由で接続できる必要があります。**Connect** ダイアログが \`localhost\` URLを表示する場合は、[ローカルclone手順](https://github.com/Starscribers/netcrawl-workspace#quick-start)を使用してください。Codespaceから自分のPCだけで動くサーバーには接続できません。`,
    },

    {
      title: '自動セットアップを待つ',
      content: `GitHubがブラウザでワークスペースを開き、次を自動設定します：

- Python 3.12、Microsoft Python拡張機能、\`uv\` のインストール
- 固定バージョンの \`.venv\` の作成とinterpreter選択
- 緑のRunボタン／F5用の **NetCrawl: Start Code Server**

post-create setupが完了してから編集してください。失敗した場合はrepository rootで \`uv sync --frozen\` を実行し、それでも失敗する場合は **Codespaces: Rebuild Container** を実行します。不完全な環境のまま続行しないでください。`,
    },

    {
      title: 'main.py の設定',
      content: `Codespaceで \`main.py\` を開き、**サーバーURL**を更新します。

ツールバー右上の **Connect** ボタン（ターミナルアイコン）をクリックしてURLを取得：

\`\`\`diff
  app = NetCrawl(
-     api_key="sk-local",
-     server="http://localhost:4800",
+     api_key="sk-local",                        # ローカル版はそのまま
+     server="http://localhost:4800",             # ← Connectダイアログから貼り付け
  )
\`\`\`

**クラウド版**の場合は \`api_key\` も置き換えてください。`,
    },

    {
      title: 'コードサーバーを実行',
      content: `**Run and Debug** を開き、**NetCrawl: Start Code Server** を選択して緑の再生ボタンをクリックします（またはF5キー）。

以下が表示されるはずです：
\`\`\`
[NetCrawl] Registered: Miner (id=miner)
[NetCrawl] Code server connected ✓
\`\`\`

**コードサーバーがゲームサーバーに接続されると、このクエストは自動的に完了します！**

🎉 接続成功後、ワーカーのデプロイボタンが有効になります。`,
    },
  ],
  q_craft_first: [
    {
      title: 'ベーシックピッケルをクラフト',
      content: `**インベントリ**を開き、**クラフト**タブを選択します。**ベーシックピッケル**を選び、必要な data を確認してクラフトしてください。

初期ピッケルは対象外です。追加のベーシックピッケルをクラフトすると完了します。**マニュアルを開く**から装備 → 移動 → 採掘 → 回収 → 帰還 → 預入の全手順を確認できます。`,
    },
  ],
};
