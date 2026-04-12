# LibreKAi 管理者ガイド

このドキュメントは、LibreKAiサービスの管理者が日常の運用やトラブルシューティング、データの管理を行うためのガイドです。

## 1. サーバー構成
- **Backend**: Node.js (Express) - デフォルトPort 3008
- **AI 推論**: llama.cpp (server mode)
  - デフォルトPort: 8080
- **データベース**: PostgreSQL
- **外部サービス連携** (オプション):
  - **Points API**: ポイントの管理（プラグインで設定）
  - **Short URL**: 短縮URL作成（設定で有効化）
  - **Discourse**: ユーザー認証とアバター取得（プラグインで有効化）

## 2. 環境変数の設定 (.env)
**重要**: .envファイルには**必要最低限の設定のみ**を記載してください。
その他の設定はWebインターフェース（/settings）から管理します。

### .envに必須の項目
| 変数名 | 説明 |
| :--- | :--- |
| `DB_HOST` | PostgreSQLホスト（例: 127.0.0.1） |
| `DB_PORT` | PostgreSQLポート（例: 5432） |
| `DB_USER` | PostgreSQLユーザー名 |
| `DB_PASS` | PostgreSQLパスワード |
| `DB_NAME` | データベース名（例: kai） |
| `SESSION_SECRET` | セッション管理用の暗号化シークレット（32文字以上） |
| `SITE_URL` | サイトURL（緊急復旧用、例: https://ai.example.com） |
| `ADMIN_USERNAME` | 管理者ユーザー名 |

### Web設定で管理する項目
以下の設定は /settings ページから設定してください：
- `DISCOURSE_URL`, `DISCOURSE_SECRET`: Discourse認証プラグイン用
- `POINTS_API_KEY`: ポイントシステムプラグイン用
- `SHORT_URL_API_KEY`, `SHORT_URL_BASE_URL`: 短縮URL機能用
- `CSP_ALLOWED_IMG_DOMAINS`: Content Security Policy設定
- `CORS_ORIGIN`: CORS設定

詳細は [ENV_CONFIG.md](ENV_CONFIG.md) を参照してください。

## 3. データベース管理 (PostgreSQL)
PostgreSQLを使用しているため、`psql`コマンドで直接操作可能です。

```bash
psql -h 127.0.0.1 -U postgres -d kai
```

### 主なテーブル
- `users`: ID, ユーザー名, Pro状態, アカウント作成日など
- `sessions`: 各チャットルームのメタデータ
- `messages`: チャットの全メッセージ内容
- `settings`: システム設定（Web管理画面から編集可能）
- `announcements`: 全体へのお知らせ内容
- `feedback`: ユーザーからの評価（グッド/バッド）

### よく使うSQLコマンド
- **特定のユーザーをProにする**:
  ```sql
  UPDATE users SET is_pro = 1, pro_expiry = '2099-12-31T23:59:59.000Z' WHERE username = '名前';
  ```
- **最近の悪いフィードバック(バッド)を確認**:
  ```sql
  SELECT f.reason, m.content as ai_answer 
  FROM feedback f 
  JOIN messages m ON f.message_id = m.id 
  WHERE f.type = 'down' 
  ORDER BY f.created_at DESC LIMIT 10;
  ```
- **ポイント使用履歴の確認（DB上の記録）**:
  ```sql
  SELECT username, total_spent FROM users ORDER BY total_spent DESC;
  ```

## 4. 管理者用APIの使い方
管理者用エンドポイントを叩く際は、HTTPヘッダーに `Authorization: Bearer [ADMIN_TOKEN]` を含める必要があります。

### お知らせ (Announcements) の更新
お知らせは `data/announcements.json` を編集して再起動するか、APIで個別に登録できます。
```bash
# お知らせの追加/更新
curl -X POST http://localhost:3008/api/announcements/upsert \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"id": "msg-001", "title": "重要", "message": "メンテナンスを行います。"}'
```

### ベストアンサー (Q&A) の管理
特定の質問に対して、AIの回答を固定したり調整したりできます。
- **データ一覧取得**: `GET /api/best-answers`
- **回答の追加/更新**: `POST /api/best-answers/upsert`
- **回答の削除**: `POST /api/best-answers/delete`

### 埋め込みサイト (Embedded Sites) の管理
外部サイトからウィジェットを利用するための設定です。
- **許可ドメインの追加**: `embedded_sites` テーブルの `allowed_origins` (JSON) を更新します。
- **SQLでの強制有効化**:
  ```sql
  UPDATE embedded_sites SET is_active = true WHERE site_url = 'https://example.com';
  ```

### ユーザーAPIキーの管理
Proユーザー向けのOpenAI互換API用のキーです。
- **使用状況の確認**:
  ```sql
  SELECT u.username, a.usage_count, a.last_used_at 
  FROM api_keys a 
  JOIN users u ON a.user_id = u.id;
  ```

## 5. 運用とトラブルシューティング

### AIが応答を停止した場合
1. llama-serverプロセスを再起動してください。
2. `scripts/start-llama.sh` を使用するか、手動でllama-serverを起動します。
3. `server.js` 側でAI APIのポート（デフォルト8080）が正常に接続可能か確認。

### 特定の不適切ワードを制限したい
`server.js` 内の `PROHIBITED_WORDS` 配列に単語を追加します。変更後はNode.jsの再起動が必要です。

### ログの確認
- `logs/YYYY-MM-DD.json`: 日別のリクエスト詳細ログ（質問、回答、IPハッシュ、応答速度など）。
- コンソール出力: エラーログやログイン成功などのリアルタイム通知。

## 6. セキュリティ上の注意
- `.env`ファイルは絶対に外部に漏らさないでください。特に`SESSION_SECRET`とデータベースパスワードは重要です。
- データベースの定期的なバックアップを推奨します。
- `CORS_ORIGIN`を適切に設定し、意図しないドメインからのAPIアクセスを制限してください。
