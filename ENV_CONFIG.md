# LibreKAi - Environment Configuration

## 環境変数設定

### .env と Web設定の使い分け

LibreKAiでは、設定を2つの方法で管理します：

#### 1. .env ファイル（必須・緊急復旧用）
サーバー起動に**必要最低限の設定**のみを記載します。
Web設定を誤ってサイトにアクセスできなくなった場合でも、この設定で復旧できます。

**必須項目:**
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`: PostgreSQL接続情報
- `SESSION_SECRET`: セッション暗号化キー（32文字以上のランダム文字列）
- `SITE_URL`: サイトの公開URL（例: https://ai.example.com）
- `ADMIN_USERNAME`: 管理者ユーザー名

**オプション項目:**
- `NODE_ENV`: development / production
- `PORT`: サーバーポート（デフォルト: 3008）
- `CORS_ORIGIN`: CORS設定（フォールバック用）
- `WEBHOOK_TOKEN`: Webhook機能用
- `VOICEVOX_URL`, `PYTHON_PATH`: ローカル開発用

#### 2. Web設定（推奨・運用中の変更可能）
Webインターフェース（/settings）から管理できる設定項目：
- `DISCOURSE_URL`, `DISCOURSE_SECRET`: Discourse認証プラグイン用
- `POINTS_API_KEY`: ポイントシステムプラグイン用
- `SHORT_URL_API_KEY`, `SHORT_URL_BASE_URL`: 短縮URL機能用
- `CSP_ALLOWED_IMG_DOMAINS`: Content Security Policy設定
- その他のプラグイン設定

**なぜこの分離が重要か:**
- Web設定を誤ってもデータベースに直接アクセスして復旧可能
- 機密性の高いDB接続情報とセッション鍵は.envで保護
- 運用中の設定変更はサーバー再起動不要

### トークン生成方法

安全なランダムトークンを生成するには：

```bash
# SESSION_SECRET（32文字以上）
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# または
openssl rand -hex 32
```

## 初期セットアップ

### 1. .env ファイルの作成

```bash
# .env.example をコピー
cp .env.example .env

# 必須項目を編集
nano .env
```

**.env の例:**
```bash
# Database (PostgreSQL)
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=postgres
DB_PASS=your-secure-password-here
DB_NAME=librekai

# Security
SESSION_SECRET=your-32-plus-char-random-secret-here

# Site Configuration
SITE_URL=https://ai.example.com
ADMIN_USERNAME=admin

# Application
NODE_ENV=production
PORT=3008
```

### 2. データベースの作成

```bash
# PostgreSQLに接続
psql -U postgres

# データベースを作成
CREATE DATABASE librekai;
\q
```

### 3. サーバーの起動

```bash
# 依存関係のインストール
npm install

# サーバー起動
npm start
```

初回起動時にデータベーステーブルが自動作成されます。

## Web設定の使い方

サーバー起動後、`/settings` ページにアクセスして追加設定を行います：

1. 管理者ユーザーでログイン
2. `/settings` にアクセス
3. 必要な設定項目を追加・更新

例：
- `SHORT_URL_BASE_URL`: `https://your-shorturl-service.com`
- `CSP_ALLOWED_IMG_DOMAINS`: `https://cdn.example.com,https://images.example.com`

## セキュリティ設定

### CORS
- 開発環境: デフォルトで `*`（全てのオリジンを許可）
- 本番環境: Web設定で `CORS_ORIGIN` を具体的なドメインに設定してください

### CSP (Content Security Policy)
画像の読み込みを許可するドメインを追加する場合：
```
Web設定 → CSP_ALLOWED_IMG_DOMAINS → "https://cdn.example.com,https://images.example.com"
```

## トラブルシューティング

### Web設定を誤ってアクセスできなくなった場合

1. データベースに直接接続：
```bash
psql -h 127.0.0.1 -U postgres -d librekai
```

2. 設定を修正：
```sql
-- CORS設定を確認・修正
SELECT * FROM settings WHERE key = 'CORS_ORIGIN';
UPDATE settings SET value = 'https://your-domain.com' WHERE key = 'CORS_ORIGIN';

-- または問題のある設定を削除
DELETE FROM settings WHERE key = 'CORS_ORIGIN';
```

3. サーバーを再起動

.envの `SITE_URL` と `ADMIN_USERNAME` がフォールバックとして機能します。

## 注意事項

⚠️ **重要**: 
- `.env` ファイルは絶対にGitリポジトリにコミットしないでください
- 本番環境では必ず強力な `SESSION_SECRET` を設定してください
- データベースパスワードは複雑なものを使用してください

⚠️ **バックアップ**: 
- PostgreSQLデータベースの定期的なバックアップを推奨します
```bash
pg_dump -h 127.0.0.1 -U postgres librekai > backup_$(date +%Y%m%d).sql
```
