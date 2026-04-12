# KAi プラグイン完全分離方針

> **重要**: この文書はKAiのプラグインシステムに関する設計方針を定めたものです。
> コントリビューターはこの方針を遵守してください。

---

## 基本方針: プラグインと本体は完全に分離する

KAiは**コアとプラグインを完全に分離**する設計を採用しています。

- プラグインがインストールされていない場合、その機能に関するコードはサーバーに**一切存在しない**
- コア（`server.js`）は特定のプラグインに依存しない
- プラグインは `lib/plugins/` ディレクトリに配置し、起動時に動的にロードされる

---

## ロードの仕組み

```
起動時:
  lib/plugin-manager.js が lib/plugins/ を走査
  └─ *.js を検出したら動的 require()
  └─ meta.type (auth/points) に応じて登録
  └─ 初期化後に Express ルートを登録（プラグイン側で行う）
```

### プラグインがない場合

| プラグイン          | プラグインなし時の挙動                                                       |
| ------------------- | ---------------------------------------------------------------------------- |
| `kai_kaisaba-group` | `/auth/discourse` ルートは**登録されない** ポイントシステムやProプランはなし |

---

## プラグインの種類

| タイプ   | 説明             | 実装例                 |
| -------- | ---------------- | ---------------------- |
| `auth`   | 認証プロバイダー | `kai_kaisaba-group.js` |
| `points` | ポイントシステム | `kai_kaisaba-group.js` |

---

## プラグインが本体に接触できること（pluginContext API）

プラグインには `init(context)` で **`pluginContext`** のみが渡される。
`pluginContext` は以下の**許可リスト型API**に限定されており、DBやfsへの直接アクセスはできない。

### 共通API (全プラグイン)

| API | 説明 |
| --- | ---- |
| `context.getSetting(key)` | アプリ設定値を読み取る（設定画面で管理する値）。書き込み不可。 |
| `context.logger.info/warn/error/verbose` | ログ出力。prefix `[plugin:名前]` が付く。 |
| `context.registerHealthCheck(name, fn)` | ヘルスチェック関数を登録。管理パネルに表示される。 |
| `context.registerNavExtension(item)` | サイドバーにナビリンクを追加。`{ path, label, icon }` を渡す。 |
| `context.registerProHooks({ onGrant, onRevoke })` | Proプラン付与・剥奪時に呼ばれるフックを登録。 |
| `context.hasCapability(type)` | `'auth'` / `'points'` のプラグインが存在するか確認する。 |

### Proプラン管理API (points プラグインのみ)

| API | 説明 |
| --- | ---- |
| `context.findUserById(id)` | ユーザー情報を取得する。 |
| `context.setProExpiry(username, date)` | Pro有効期限を設定する。 |
| `context.setAutoRenew(username, bool)` | 自動更新のON/OFFを設定する。 |
| `context.recordSpending(username, amount)` | ポイント消費を記録する。 |
| `context.triggerProGrant(username)` | Proプラン付与フックを発火する（バッジ付与など）。 |
| `context.triggerProRevoke(username)` | Proプラン剥奪フックを発火する（バッジ削除など）。 |

### 禁止事項

| 禁止 |
| ---- |
| データベース（`db.js`）への直接アクセス |
| ファイルシステムへの直接アクセス（`fs` 等） |
| 他プラグインへのアクセス |
| `process`, `child_process` の使用 |
| `pluginManager` オブジェクトへの直接アクセス |

外部HTTPリクエスト（axios等）は許可する。

---

## プラグインが実装すべき関数

### auth タイプ

```js
function getLoginUrl(returnUrl)     // ログインURLを返す
async function handleCallback(sso, sig) // コールバックを処理してユーザーデータを返す
function registerRoutes(app)        // /auth/* ルートを登録する
function getAllowedAvatarDomains()  // 許可するアバターURLのドメイン一覧
```

### points タイプ

```js
async function checkPoints(username)            // ポイント残高を返す
async function deductPoints(username, amount, reason) // ポイントを消費する
function getProMetadata()           // Proプランのメタデータ（価格等）を返す
function getDeductReasonLabel()     // ポイント消費時の理由文字列
function registerProRoutes(app)     // /api/pro/* ルートを登録する（metadata/subscribe/cancel）
function getProPageHtml()           // Proプランページ用HTMLを返す（任意）
```

---

## 設定値の扱い

- **`.env`**: サーバー起動に必須な秘密情報のみ（DBパスワード、セッションシークレット等）
- **アプリ設定画面（`context.getSetting(key)`）**: プラグインが必要とする設定はすべてここから取得する
  - 例: `DISCOURSE_URL`, `DISCOURSE_SECRET`, `POINTS_API_KEY`, `DISCOURSE_FORUM_API_KEY`, `DISCOURSE_PRO_BADGE_ID`
- ❌ プラグイン固有の設定を `.env` に追加してはいけない

---

## server.js が持つ基盤（本体側）

`server.js` はプラグイン固有の実装を持たない。代わりに以下の**基盤のみ**を持つ。

| 基盤 | 説明 |
| ---- | ---- |
| `pluginManager.registerAuthRoutes(app)` | auth プラグインのルートを登録する |
| `pluginManager.registerProRoutes(app)` | points プラグインの /api/pro/* を登録する |
| `requirePro` ミドルウェア | Pro認証が必要なルートに使う（プラグインなし時は全員Pro扱い） |
| `pluginManager.onProGrant(username)` | Proプラン付与時に内部から呼ぶ（auto-renew等） |
| `pluginManager.onProRevoke(username)` | Proプラン剥奪時に内部から呼ぶ |

---

## プラグインの作り方

`lib/plugins/my-plugin.js` に配置。`meta` オブジェクトと `init(context)` を必ずエクスポートする。

```js
const meta = {
    id: 'my-plugin',
    name: 'My Plugin',
    version: '1.0.0',
    type: ['auth', 'points'], // 'auth' or 'points' or both
    description: '説明',
    requiredSettings: ['MY_API_KEY'],
    settingsSchema: [
        { key: 'MY_API_KEY', label: 'APIキー', type: 'password', required: true }
    ]
};

function init(context) {
    // context.getSetting(key) — 設定値の読み取り
    // context.logger.info/warn/error — ログ出力
    // context.registerProHooks({ onGrant, onRevoke }) — Proフック登録
}

module.exports = { meta, init, /* タイプ別メソッド */ };
```

---

## TODO / 今後の方針

- [ ] プラグインのサンドボックス化（vm2 など）
- [ ] プラグインごとのレート制限設定
- [ ] プラグインストア（公式プラグイン一覧）
