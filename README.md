# LibreKAi

**An Open-Source AI Chat Interface**

LibreKAi is a self-hostable AI chat application designed to work seamlessly with local LLMs such as llama.cpp.
日本語の説明は下にあります。

## ⚠️ Disclaimer

This application is currently **under development** and may contain bugs or other issues.
It is **not recommended** for use in production environments at this stage.

If you are kind enough to help fix these issues, I would be more than happy to receive your Pull Requests!

## ✨ Features

  - 🔌 **Plugin System**: Flexibly extend functionality with authentication, point systems, and more.
  - 🗄️ **PostgreSQL-Based Configuration**: Manage settings directly through the web interface.
  - 🔒 **Security-Focused**: Equipped with Helmet, CORS, and CSP out of the box.
  - 🚀 **Self-Hosted**: Maintain complete control over your data on your own server.
  - 🌐 **Local LLM Support**: Integrates with llama.cpp and other OpenAI-compatible APIs.

## 📋 Requirements

  - **Node.js** 18 or higher
  - **PostgreSQL** 12 or higher
  - **llama.cpp** (or any other OpenAI-compatible LLM server)

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/Kaisan10/LibreKAi.git
cd LibreKAi
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Create a PostgreSQL Database

```bash
psql -U postgres
CREATE DATABASE librekai;
q
```

### 4. Configure Environment Variables

```bash
cp .env.example .env
nano .env
```

Please edit the following required fields:

  - `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`: PostgreSQL connection details.
  - `SESSION_SECRET`: A random string of at least 32 characters.
  - `SITE_URL`: Your site's URL (e.g., `https://ai.example.com`).
  - `ADMIN_USERNAME`: Administrator username.

### 5. Start the Server

```bash
npm start
```

The server will be running at `http://localhost:3008`.

### 6. Start the LLM Server (Separate Terminal)

```bash
# For llama.cpp
./scripts/start-llama.sh
```

Alternatively, start your preferred LLM server.

### 7. Additional Web Configuration

Access `http://localhost:3008/settings` in your browser to finalize additional configurations as needed.

## 📖 Documentation

  - **[ENV_CONFIG.md](https://www.google.com/search?q=ENV_CONFIG.md)**: Detailed environment variables and settings.
  - **[guide.md](guide.md)**: Administrator Guide.
  - **[docs/plugin-policy.md](https://www.google.com/search?q=docs/plugin-policy.md)**: Plugin Development Guide.

## ⚙️ Configuration

LibreKAi manages settings in two ways:

### .env File (Required/Minimum)

Essential settings required to boot the application:

  - Database connection details
  - Session secret
  - Site URL
  - Administrator username

### Web Settings (Recommended/Operational)

Settings manageable via the `/settings` page:

  - External API integrations (Discourse, point systems, etc.)
  - URL shortener settings
  - Security policies (CORS, CSP)

For more details, see [ENV_CONFIG.md](https://www.google.com/search?q=ENV_CONFIG.md).

## 🔌 Plugins

You can extend LibreKAi's functionality using plugins.

### Plugin Development

Simply place a JavaScript file in `lib/plugins/` and it will be loaded automatically.
Available plugin types:

  - **auth**: Authentication providers (e.g., Discourse SSO, Google OAuth, etc.)
  - **points**: Point system integrations

For more details, see [docs/plugin-policy.md](https://www.google.com/search?q=docs/plugin-policy.md).

## 🛠️ Development

```bash
# Start in development mode
NODE_ENV=development npm start
```

## 📝 License

GNU Affero General Public License v3.0 (AGPL-3.0) - see the [LICENSE](https://www.google.com/search?q=LICENSE) file for details.

Key AGPL-3.0 requirements:

  - You must disclose the source code of any modified versions when providing the service over a network.
  - Any modified versions must be released under the same license.

## 🤝 Contributing

Pull Requests are welcome!

## 🙏 Acknowledgments

Dedicated to all the wonderful open-source projects.

## 📧 Support

If you encounter any issues, please report them via [Issues](https://www.google.com/search?q=https://github.com/Kaisan10/LibreKAi/issues) or on the [Forum](https://forum.bac0n.f5.si/).

## 💡 Motivation

I have always been supported by open-source projects throughout my journey. I created this project as a small way to give back to the community.

-----

Made with ❤️ by the LibreKAi community

-----

# LibreKAi (日本語)

**オープンソースのAIチャットインターフェース**

LibreKAiは、llama.cppなどのローカルLLMと連携して動作する、セルフホスト可能なAIチャットアプリケーションです。

## ⚠️ 注意点

このアプリはまだ開発中でバグや、様々な問題があります。
本番環境で使うことはあまりお勧めしません。

もし、この問題を直してくれる優しい人がいればプルリクエストを送信してくれると嬉しいです。

## ✨ 特徴

- 🔌 **プラグインシステム**: 認証、ポイントシステムなどを柔軟に拡張
- 🗄️ **PostgreSQLベースの設定管理**: Webインターフェースから設定を変更可能
- 🔒 **セキュリティ重視**: Helmet、CORS、CSPを標準装備
- 🚀 **セルフホスト**: 自分のサーバーで完全にコントロール可能
- 🌐 **ローカルLLM対応**: llama.cppなどのOpenAI互換APIと連携

## 📋 必要要件

- **Node.js** 18以上
- **PostgreSQL** 12以上
- **llama.cpp**（または他のOpenAI互換LLMサーバー）

## 🚀 クイックスタート

### 1. リポジトリをクローン

```bash
git clone https://github.com/Kaisan10/LibreKAi.git
cd LibreKAi
```

### 2. 依存関係をインストール

```bash
npm install
```

### 3. PostgreSQLデータベースを作成

```bash
psql -U postgres
CREATE DATABASE librekai;
q
```

### 4. 環境変数を設定

```bash
cp .env.example .env
nano .env
```

必須項目を編集してください：
- `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`: PostgreSQL接続情報
- `SESSION_SECRET`: ランダムな32文字以上の文字列
- `SITE_URL`: サイトのURL（例: `https://ai.example.com`）
- `ADMIN_USERNAME`: 管理者ユーザー名

### 5. サーバーを起動

```bash
npm start
```

サーバーは `http://localhost:3008` で起動します。

### 6. LLMサーバーを起動（別ターミナル）

```bash
# llama.cppの場合
./scripts/start-llama.sh
```

または、お好みのLLMサーバーを起動してください。

### 7. Webインターフェースで追加設定

ブラウザで `http://localhost:3008/settings` にアクセスし、必要に応じて追加設定を行います。

## 📖 ドキュメント

- **[ENV_CONFIG.md](ENV_CONFIG.md)**: 環境変数と設定の詳細
- **[guide.md](guide.md)**: 管理者ガイド
- **[docs/plugin-policy.md](docs/plugin-policy.md)**: プラグイン開発ガイド

## ⚙️ 設定

LibreKAiは2つの方法で設定を管理します：

### .env ファイル（必須・最低限）
起動に必要な最低限の設定：
- データベース接続情報
- セッションシークレット
- サイトURL
- 管理者ユーザー名

### Web設定（推奨・運用時）
`/settings` ページから管理できる設定：
- 外部API連携（Discourse、ポイントシステムなど）
- 短縮URL設定
- セキュリティポリシー（CORS、CSP）

詳細は [ENV_CONFIG.md](ENV_CONFIG.md) を参照してください。

## 🔌 プラグイン

LibreKAiはプラグインで機能を拡張できます：

### プラグインの開発
`lib/plugins/` にJavaScriptファイルを配置するだけで自動ロードされます。
プラグインの種類：
- **auth**: 認証プロバイダー（例: Discourse SSO、Google OAuth等）
- **points**: ポイントシステム連携

詳細は [docs/plugin-policy.md](docs/plugin-policy.md) を参照してください。

## 🛠️ 開発

```bash
# 開発モードで起動
NODE_ENV=development npm start
```

## 📝 ライセンス

GNU Affero General Public License v3.0 (AGPL-3.0) - 詳細は [LICENSE](LICENSE) を参照してください。

AGPL-3.0の主な要件：
- ネットワーク越しにサービスを提供する場合も、改変したソースコードを公開する義務があります
- 改変して配布する場合も、同一ライセンスで公開する必要があります

## 🤝 貢献

プルリクエストを歓迎します！

## 🙏 謝辞

素晴らしいオープンソースプロジェクト

## 📧 サポート

問題が発生した場合は、[Issues](https://github.com/Kaisan10/LibreKAi/issues)または[フォーラム](https://forum.bac0n.f5.si/)で報告してください。

## 💡 なぜ作ったのか

私は今までオープンソースのプロジェクトに支えられてきました。
なので少しでも恩返しをしようと、このプロジェクトを作りました。

---

Made with ❤️ by the LibreKAi community
