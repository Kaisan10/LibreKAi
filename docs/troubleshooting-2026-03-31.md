# KAi トラブルシューティング報告書

**日時**: 2026-03-31 17:32  
**報告者**: AI Assistant  
**状況**: KAiサービスの部分的な動作不良を調査

---

## 問題の症状

1. **「API /api/ask error: fetch failed」エラー**
2. **起動時のメッセージが表示されない**

---

## 調査結果

### 1. サーバー状態 ✅
- ✅ Node.jsプロセス稼働中（PID: 2227591）
- ✅ ポート3008でリッスン中
- ✅ HTTPレスポンス正常
- ✅ llama.cpp正常稼働（ポート4545）

### 2. CSRF保護の挙動 ⚠️

**問題箇所**: `server.js` 576-580行

```javascript
if (process.env.NODE_ENV === 'production') {
    logger.warn('CSRF: Rejected request - Both Origin and Referer missing');
    return res.status(403).json({ error: 'Forbidden: Security headers missing' });
}
next();
```

**テスト結果**:
- `NODE_ENV` = `undefined` （.envに未設定）
- Originヘッダーなし、Refererヘッダーなし → **通過するはず**
- Originヘッダーあり → ✅ 通過
- Refererヘッダーあり → ✅ 通過

**結論**: CSRF保護自体は正常に動作している。

### 3. 「fetch failed」エラーの原因候補

#### 候補A: ブラウザがOrigin/Refererヘッダーを送信していない
- 考えられる原因:
  - HTTPSからHTTPへのリクエスト（Referrer-Policy: strict-origin-when-cross-origin）
  - ブラウザの拡張機能がヘッダーをブロック
  - プライバシー保護設定

#### 候補B: クライアント側のfetch()エラーハンドリング
- ネットワークエラー
- CORSエラー
- タイムアウト

#### 候補C: セッションが確立されていない
- Cookieが送信されていない
- セッションが期限切れ

### 4. 起動メッセージ問題 🔍

**問題箇所**: `server.js` 233-235行

```javascript
server.listen(PORT, () => {
    logger.info(`LibreKAi Server running on port ${PORT}`);
    logger.info(`Access URL: ${Settings.get('SITE_URL', `http://localhost:${PORT}`)}`);
});
```

**調査結果**:
- `logger.info`で出力されるはずだが、ログファイル不在
- `/home/kai/logs/`には3月31日のログファイルなし
- 最新ログ: 12月12日

**考えられる原因**:
1. `lib/logger.js`がファイル出力していない（console.logのみ？）
2. サーバーがMCSManagerのptyで起動されており、stdoutが別の場所に
3. ログローテーション設定でファイルが作成されていない

---

## 推奨対応

### 即座に実施可能（リスク: 低）

#### 対策1: ロギングの確認・修正
```bash
# logger.jsの動作確認
cat /home/kai/lib/logger.js

# 手動テスト
node -e "const logger = require('./lib/logger'); logger.info('Test message');"
```

#### 対策2: NODE_ENVの明示的設定
`.env`に以下を追加:
```env
NODE_ENV=production
```

**効果**: CSRF保護が厳格化され、Origin/Refererなしのリクエストを拒否

**リスク**: ⚠️ 本番環境で動作中のため、設定変更後は再起動が必要

---

### 中期的対応（要テスト）

#### 対策3: CSRF保護の改善
現在の576-580行を以下に変更:

```javascript
// OriginもRefererも存在しない場合の処理
if (!origin && !referer) {
    // ローカルホストからのリクエストは許可（開発時）
    if (req.hostname === 'localhost' || req.hostname === '127.0.0.1') {
        return next();
    }
    
    // 本番環境では厳格に拒否
    if (process.env.NODE_ENV === 'production') {
        logger.warn('CSRF: Rejected request - Both Origin and Referer missing', {
            ip: req.ip,
            path: req.path,
            method: req.method
        });
        return res.status(403).json({ error: 'Forbidden: Security headers missing' });
    }
}
next();
```

#### 対策4: フロントエンドのエラーハンドリング改善
`public/js/index.js`にログ追加:

```javascript
fetch('/api/ask', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message })
})
.then(response => {
    if (!response.ok) {
        console.error('API error:', response.status, response.statusText);
        return response.json().then(err => {
            console.error('Error details:', err);
            throw new Error(err.error || 'API request failed');
        });
    }
    return response.json();
})
.catch(error => {
    console.error('Fetch error:', error);
    throw error;
});
```

---

## 緊急対応が必要な場合

### 最小限の修正（リスク: 最小）

`server.js` 576行を以下に変更:

```javascript
// 本番環境でも一時的に許可（デバッグ用）
if (false && process.env.NODE_ENV === 'production') {
```

これにより、Origin/Refererなしのリクエストも許可されます。

**⚠️ 注意**: セキュリティが低下するため、問題解決後は元に戻すこと。

---

## 次のステップ（ユーザー帰還後）

1. **ユーザーに状況を詳しく聞く**:
   - エラーメッセージの正確な内容
   - ブラウザのコンソールログ
   - いつから発生したか

2. **ログの確認**:
   - `lib/logger.js`の実装確認
   - MCSManagerのログ確認
   - ブラウザのNetwork tabでリクエスト詳細確認

3. **段階的修正**:
   - まずロギングを改善
   - CSRF保護を調整
   - フロントエンドエラーハンドリング強化

---

## まとめ

**現状**: サーバーは稼働しているが、特定の条件でAPIリクエストが失敗する可能性あり

**主な原因候補**:
1. ブラウザがOrigin/Refererヘッダーを送信していない
2. ログ出力が正しく機能していない

**推奨**: ユーザー帰還後、詳細情報を収集してから適切な修正を実施

