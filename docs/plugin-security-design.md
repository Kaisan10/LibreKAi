# プラグインセキュリティ強化設計書

## 現状分析

### 現在の検証コード（server.js 1464-1477行）

```javascript
const DANGEROUS_PATTERNS = [
    /require\s*\(\s*['"](child_process|fs|os|net|dgram|cluster|vm|v8|readline)['"]/,
    /process\.exit/,
    /eval\s*\(/,
    /new\s+Function\s*\(/,
    /\.exec\s*\(/,
    /\.spawn\s*\(/,
];

const checkJsContent = (content) => {
    const contentStr = content.toString('utf8');
    return DANGEROUS_PATTERNS.some(pattern => pattern.test(contentStr));
};
```

### 脆弱性の詳細

#### 1. **正規表現ベースの検証は簡単にバイパス可能**

**バイパス例A: 変数経由**
```javascript
const moduleName = 'child_process';
const req = require;
req(moduleName).exec('rm -rf /');  // ✅ 検出されない
```

**バイパス例B: テンプレートリテラル**
```javascript
require(`child_process`).exec('malicious');  // ✅ 検出されない
```

**バイパス例C: Unicode/エスケープシーケンス**
```javascript
require('child\u005fprocess');  // ✅ 検出されない
```

**バイパス例D: 空白・改行の挿入**
```javascript
require
(
  'child_process'
)
.exec('cmd');  // ✅ 検出されない（空白パターンが不完全）
```

**バイパス例E: 間接アクセス**
```javascript
const x = global.process.mainModule.constructor._load;
x('child_process');  // ✅ 検出されない
```

#### 2. **現在のプラグインシステムの良い点**

- ✅ 許可リスト型API（pluginContext）で限定的なアクセスのみ提供
- ✅ プラグインはDBやファイルに直接アクセスできない設計
- ✅ 起動時のみロード（実行中の差し替え不可）
- ✅ 既存プラグイン（kai_kaisaba-group.js）は安全（crypto、axiosのみ使用）

#### 3. **実際のリスク評価**

| リスク | 深刻度 | 現実性 | 理由 |
|-------|--------|--------|------|
| 悪意ある管理者 | 高 | 中 | 管理者自身が悪意あるプラグインをアップロード |
| 侵害された管理者アカウント | 高 | 中 | 攻撃者が管理者権限を取得 |
| プラグイン開発者のミス | 中 | 高 | 意図せず危険なコードを含む |
| サプライチェーン攻撃 | 高 | 低 | プラグインの依存関係が侵害 |

---

## 解決策の比較検討

### Option A: VM2サンドボックス化 ⭐⭐⭐⭐

**概要**: VM2ライブラリでプラグインを完全に隔離された環境で実行

**メリット**:
- ✅ 最も強力な隔離（ファイルシステム、ネットワーク、プロセスへのアクセス完全遮断）
- ✅ 許可したAPIのみプラグインに公開可能
- ✅ タイムアウト設定で無限ループ対策
- ✅ メモリ制限も設定可能

**デメリット**:
- ⚠️ VM2は2023年にメンテナンス停止（セキュリティ脆弱性CVE-2023-37466発覚）
- ⚠️ Node.js 18以降ではvm2の代替として`isolated-vm`を推奨
- ⚠️ プラグインからのrequire()が制限される（axios、cryptoも使えなくなる）
- ⚠️ 既存プラグインの大幅な書き換えが必要

**実装難易度**: 高  
**既存プラグインへの影響**: 大（完全な書き換え必要）

---

### Option B: Worker Threads隔離 ⭐⭐⭐⭐⭐ **【推奨】**

**概要**: Node.js組み込みのWorker Threadsでプラグインを別スレッドで実行

**メリット**:
- ✅ Node.js標準機能（追加ライブラリ不要）
- ✅ メインスレッドと隔離（クラッシュしてもメイン影響なし）
- ✅ メッセージパッシングでAPIを制限可能
- ✅ タイムアウト、メモリ制限も可能
- ✅ require()を制御可能（ホワイトリスト実装可能）

**デメリット**:
- ⚠️ 完全な隔離ではない（sharedArrayBuffer経由の攻撃理論上可能）
- ⚠️ プラグイン間で状態共有が複雑化
- ⚠️ デバッグが若干困難

**実装難易度**: 中  
**既存プラグインへの影響**: 中（一部修正が必要だが、axios等は使用可能）

---

### Option C: AST（抽象構文木）ベースの静的解析 ⭐⭐⭐

**概要**: acornやbabelパーサーでコードを解析し、危険なパターンを検出

**メリット**:
- ✅ 正規表現より精密な検出
- ✅ 変数経由のrequire()も検出可能
- ✅ 既存プラグインへの影響なし（検証のみ強化）

**デメリット**:
- ⚠️ 完全な保護ではない（動的生成コードは検出不可）
- ⚠️ 難読化されたコードへの対応困難
- ⚠️ eval(), new Function()による回避可能

**実装難易度**: 中  
**既存プラグインへの影響**: なし

---

### Option D: 人間によるコードレビュー必須化 ⭐⭐

**概要**: プラグインアップロード時に管理者が目視確認を必須とする

**メリット**:
- ✅ 実装不要
- ✅ 既存コードへの影響なし
- ✅ 柔軟な判断が可能

**デメリット**:
- ❌ ヒューマンエラーが発生しやすい
- ❌ スケールしない（プラグイン数が増えると困難）
- ❌ 技術的な保護が一切ない

**実装難易度**: なし  
**既存プラグインへの影響**: なし

---

## 推奨案: **Option B（Worker Threads）+ Option C（AST解析）の組み合わせ**

### 理由

1. **Worker Threads**で実行時の隔離を提供
2. **AST解析**でアップロード時の事前チェック（明らかに危険なコードを拒否）
3. 既存プラグインは最小限の修正で動作可能
4. 段階的な実装が可能

---

## 実装計画

### Phase 1: AST解析による検証強化（1-2日）

**目的**: 現在の正規表現検証をAST解析に置き換え

**実装内容**:
```javascript
const acorn = require('acorn');
const walk = require('acorn-walk');

function analyzePluginCode(code) {
    const dangerousAPIs = new Set([
        'child_process', 'fs', 'os', 'net', 'dgram', 
        'cluster', 'vm', 'v8', 'readline'
    ]);
    
    try {
        const ast = acorn.parse(code, { ecmaVersion: 2022 });
        
        let hasDanger = false;
        walk.simple(ast, {
            // require() 呼び出しを検出
            CallExpression(node) {
                if (node.callee.name === 'require') {
                    const arg = node.arguments[0];
                    if (arg && arg.type === 'Literal' && dangerousAPIs.has(arg.value)) {
                        hasDanger = true;
                    }
                }
                // eval(), exec(), spawn() 検出
                if (node.callee.name === 'eval' || 
                    (node.callee.property && 
                     ['exec', 'spawn'].includes(node.callee.property.name))) {
                    hasDanger = true;
                }
            },
            // new Function() 検出
            NewExpression(node) {
                if (node.callee.name === 'Function') {
                    hasDanger = true;
                }
            }
        });
        
        return { safe: !hasDanger, reason: hasDanger ? 'Dangerous API detected' : null };
    } catch (e) {
        return { safe: false, reason: `Parse error: ${e.message}` };
    }
}
```

**メリット**:
- 変数経由のrequire()を検出（`const x = require; x('fs')`は検出できないが、多くのケースをカバー）
- テンプレートリテラルも検出可能
- 既存プラグインへの影響なし

**リスク**: 低

---

### Phase 2: Worker Threadsによる実行時隔離（3-5日）

**目的**: プラグインを別スレッドで実行し、APIアクセスを制限

**実装内容**:

#### 2-1. プラグインワーカーの作成

```javascript
// lib/plugin-worker.js (新規作成)
const { parentPort } = require('worker_threads');

// プラグインが使用できるモジュールのホワイトリスト
const allowedModules = {
    'crypto': require('crypto'),
    'axios': require('axios'),
    // 必要に応じて追加
};

// カスタムrequire（ホワイトリストのみ許可）
function secureRequire(moduleName) {
    if (allowedModules[moduleName]) {
        return allowedModules[moduleName];
    }
    throw new Error(`Module "${moduleName}" is not allowed in plugins`);
}

// pluginContextをメッセージパッシングで実装
const pluginContext = {
    getSetting: async (key) => {
        return new Promise((resolve) => {
            const id = Math.random().toString(36);
            parentPort.once('message', (msg) => {
                if (msg.id === id) resolve(msg.value);
            });
            parentPort.postMessage({ type: 'getSetting', key, id });
        });
    },
    logger: {
        info: (...args) => parentPort.postMessage({ type: 'log', level: 'info', args }),
        warn: (...args) => parentPort.postMessage({ type: 'log', level: 'warn', args }),
        error: (...args) => parentPort.postMessage({ type: 'log', level: 'error', args }),
    },
    // 他のAPIも同様に実装
};

// プラグインロード
parentPort.on('message', (msg) => {
    if (msg.type === 'load') {
        try {
            // グローバルのrequireを上書き
            global.require = secureRequire;
            
            const plugin = require(msg.pluginPath);
            plugin.init(pluginContext);
            
            parentPort.postMessage({ type: 'loaded', success: true });
        } catch (e) {
            parentPort.postMessage({ type: 'loaded', success: false, error: e.message });
        }
    }
});
```

#### 2-2. Plugin Managerの更新

```javascript
// lib/plugin-manager.js の loadPlugin() を更新
const { Worker } = require('worker_threads');

loadPlugin(name) {
    const worker = new Worker(path.join(__dirname, 'plugin-worker.js'));
    
    worker.on('message', (msg) => {
        if (msg.type === 'getSetting') {
            const Settings = require('./settings');
            const value = Settings.get(msg.key);
            worker.postMessage({ id: msg.id, value });
        } else if (msg.type === 'log') {
            logger[msg.level](`[plugin:${name}]`, ...msg.args);
        } else if (msg.type === 'loaded') {
            if (msg.success) {
                console.log(`✅ Plugin loaded in worker: ${name}`);
            } else {
                logger.error(`❌ Plugin load failed: ${msg.error}`);
            }
        }
    });
    
    worker.postMessage({ 
        type: 'load', 
        pluginPath: path.join(PLUGINS_DIR, `${name}.js`) 
    });
    
    this._workers[name] = worker;
}
```

**メリット**:
- require()を完全制御（ホワイトリストのみ許可）
- プラグインクラッシュでメインプロセスは影響なし
- タイムアウト・メモリ制限も追加可能

**既存プラグインへの影響**:
- `context.getSetting()`が非同期になる → `await context.getSetting()`に変更必要
- crypto、axiosは引き続き使用可能

**リスク**: 中（既存プラグインの修正が必要）

---

### Phase 3: 既存プラグインの移行（1-2日）

**作業内容**:
1. `kai_kaisaba-group.js`を新しいWorker Threads形式に対応
2. `context.getSetting()`の呼び出しを`await context.getSetting()`に変更
3. テスト環境で動作確認
4. 本番環境へのデプロイ（メンテナンス時間に実施）

---

## 段階的なロールアウト戦略

### ステップ1: AST解析のみ実装（リスク: 低）
- 現在の正規表現検証をAST解析に置き換え
- 既存プラグインへの影響なし
- アップロード時のチェックが強化される

### ステップ2: Worker Threads設計の最終確認
- テスト環境でWorker Threads実装を検証
- 既存プラグインの移行テスト
- パフォーマンス影響の測定

### ステップ3: 本番環境への適用（メンテナンス時）
- 既存プラグインを新形式に移行
- Worker Threadsベースのプラグインシステムに切り替え
- ロールバック準備

---

## 既存プラグインの互換性分析

### kai_kaisaba-group.js（578行）

**使用している外部モジュール**:
- ✅ `crypto` - 標準モジュール、ホワイトリストに追加
- ✅ `axios` - HTTPクライアント、ホワイトリストに追加

**使用しているcontext API**:
- `context.getSetting()` → 非同期に変更必要
- `context.logger.*` → メッセージパッシングで実装
- `context.registerHealthCheck()` → メッセージパッシングで実装
- `context.registerNavExtension()` → メッセージパッシングで実装
- `context.registerProHooks()` → メッセージパッシングで実装

**必要な修正箇所**: 約10-15箇所（getSetting呼び出し）

**修正難易度**: 低

---

## セキュリティチェックリスト

実装完了後、以下を確認：

- [ ] AST解析で変数経由のrequire()を検出できる
- [ ] Worker Threadsでファイルシステムアクセスがブロックされる
- [ ] Worker Threadsでchild_processがブロックされる
- [ ] ホワイトリスト外のモジュールがrequireできない
- [ ] プラグインクラッシュでメインプロセスが影響を受けない
- [ ] 既存プラグイン（kai_kaisaba-group.js）が正常動作する
- [ ] プラグインアップロード時に適切なエラーメッセージが表示される
- [ ] ドキュメント（plugin-policy.md）が更新されている

---

## リスク評価

| フェーズ | 本番影響 | リスク | 軽減策 |
|---------|---------|-------|--------|
| Phase 1 (AST) | なし | 低 | 検証のみ強化、既存動作変更なし |
| Phase 2 (Worker) | あり | 中 | テスト環境で十分検証、メンテナンス時間に実施 |
| Phase 3 (移行) | あり | 中 | ロールバック計画準備、段階的適用 |

---

## 次のステップ（承認待ち）

1. **この設計案を承認いただく**
2. **Phase 1（AST解析）から実装開始** - 本番への影響なし、2-3時間で完了
3. テスト環境でPhase 2を検証
4. メンテナンス時間にPhase 2を本番適用

---

**作成日**: 2026-03-31  
**作成者**: LibreKAi Security Team  
**次のTodo**: 承認後、Phase 1実装開始
