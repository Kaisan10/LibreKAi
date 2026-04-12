# OSS化に向けた改善タスク

このプロジェクトをオープンソースとして公開し、誰でも自分の環境で動かせるようにするための改善計画です。
最終的には **「インストールしてブラウザを開くだけで設定が完了する」** 状態を目指します。

---

## 完了済み ✅

- [x] **個人環境依存（絶対パス）の排除** — `/home/kai` などの個人パスを排除済み
- [x] **設定の完全パネル移行** — `.env` の設定を管理者パネルDBから変更可能
- [x] **CLI（コマンドライン）管理ツールの作成** — 緊急時のターミナル操作ツール

---

## 未完了 ⏳

### 🔴 高優先度

- [x] **かい鯖グループ専用機能のプラグイン化** — Discourse SSO・ポイントシステムをプラグイン形式に実装済み。プラグインがない環境ではローカル認証（メール＋パスワード）で動作。
  - `lib/plugin-manager.js` — プラグインマネージャーコア
  - `lib/plugins/discourse-auth.js` — Discourse SSO プラグイン
  - `lib/plugins/kaibaker-points.js` — 外部ポイントAPI連携
  - `lib/plugins/null-points.js` — ポイントなし（デフォルト）
  - `/auth/local/login`, `/auth/local/register` — ローカル認証エンドポイント

### 🟡 中優先度

- [x] **残留ハードコードURLの除去** — `server.js` 内の `bac0n.f5.si` 直書きを設定値に置き換え済み

- [x] **`.gitignore` の作成** — `node_modules/`, `.env`, `logs/`, `sessions/` 等を除外

- [ ] **初期セットアップウィザードの構築** — 初回起動時にDB設定・管理者アカウント・モデル選択を案内する画面


- [ ] **README.md の整備** — クイックスタート・設定項目・ライセンス表記を含む

- [ ] **ドキュメントの古い記述の修正** — `guide.md`（SQLite前提→PostgreSQL）、`ENV_CONFIG.md`（削除済み`ADMIN_TOKEN`記述）

### 🟢 低優先度

- [ ] **Docker / コンテナ化** — `Dockerfile` + `docker-compose.yml` で一発起動
