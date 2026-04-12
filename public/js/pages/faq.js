// Full FAQ content – kept in this module, not in pages.js.

const contentHtml = `
<div class="legal-container" style="text-align: center; margin: auto; padding-top: 4rem;">
    <img src="/logo2.png" alt="KAi Logo" class="logo-img" style="width: auto; margin-bottom: 0.5rem;">
    <h2 style="font-size: 2rem; margin-bottom: 2.75rem;">よくある質問</h2>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: お問い合わせはできますか？</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: はい、Discord: bacooooon_ または メール: ika977300@gmail.com までお問い合わせできます。</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: ログインするにはどうすればいいですか？</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: かい鯖グループフォーラムのアカウントが必要です。持ってない？作ってください。</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: モデルは選べますか？</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: はい、2つのモデルから選択できます。お好みでどうぞ。</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: ダークモードはありますか？</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: もちろんです。目に優しいダークモード完備してます。</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: 色は変えられますか？</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: はい、ブルー、パープル、グリーン、オレンジから選べます。おしゃれでしょ？</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: 会話履歴は保存されますか？</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: はい、ログインしていて、デフォルトの設定では保存されます。</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: 会話履歴の管理はできますか？</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: はい、名前変更、ピン止め、タグ設定ができます。整理整頓大事。</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: チャットをエクスポートできますか？</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: はい、設定からエクスポートできます。思い出を保存してください。</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: Proプランは無料ですか？</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: かい鯖グループポイントを使って購入できるので...有料かもしれませんね、現実のお金は使わないから無料？わからないっすね☆</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: Proプランの機能は？</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: 人格設定、温度（創造性）調整、サイト埋め込み、OpenAI互換API利用が可能です。すごいでしょ？</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: 自分のサイトに埋め込みできますか？</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: はい、Proプランなら埋め込み可能です。あなたのサイトもAI化しちゃいましょう。</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: APIは使えますか？</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: はい、ProプランならOpenAI互換APIが使えます。開発者さんどうぞ。</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: AIと通話できますか？</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: はい、音声通話機能があります。AIとおしゃべりしてください。</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: 会話の内容を修正できますか？</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: 送信した自分のメッセージを直接クリックすると編集できます。「あ、誤字った！」と思ったらサッと直しましょう。AIも（たぶん）空気を読んで再回答してくれます。</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: 送信ボタンをマウスで押すのが面倒です。</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: Enterキーを叩けばそのまま送信されます。改行したい時は Shift + Enter です。効率化万歳！</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: この神回なチャットを誰かに公開したいです。</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: 画面右上の共有ボタンを使って、リンクを知っている人にだけチャットを見せることができます。ただし、黒歴史（個人情報など）を晒さないように注意してくださいね。公開期間の設定も可能です。</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: AIの人格（システムプロンプト）を上手く設定するには？</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: とにかく簡単に書きましょう。それだけです。</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: 創造性（Temperature）を上げるとどうなりますか？</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: AIが選ぶ言葉の「意外性」が増します。高くするとクリエイティブ（たまに支離滅裂）に、低くすると真面目で堅実な回答になります。気分で変えてみてください。</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: フィードバック（Good/Bad）を送ると何かいいことありますか？</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: 開発者のべーこんが泣いて喜びます。また、集まったデータは次回のAIモデルの学習（強化学習的なやつ）に使われ、KAiがより賢くなる糧になります。</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: 制限が厳しすぎます。</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: 許してください、お金がないんです。GPU買えないんです。</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: バカすぎます</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: はい、バカすぎますが、改善に取り組んでいます。</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: スマホでも使えますか？</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: もちろんです。レスポンシブデザインなので、どこでも使えます。</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: データは安全ですか？</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: はい、暗号化されて送信されます。プライバシーポリシーもご覧ください。</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: AIの名前の由来は？</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: かい鯖グループのAIだからKAi（けーえーあい）です。「かい」じゃないですよ。</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: 画像生成はできますか？</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: まだできません。いつか実装されるといいですね...すべてはべーこんのやる気次第です。</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: もっと賢くなりますか？</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: はい、日々ひっそりと修行（学習）を積んでいます。</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: べーこんって誰ですか？</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: このサービスを作り、常にバグと格闘している開発者です。</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: 中身はどう動いていますか？</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: ggufをllama.cppで動かして、Node.jsと合体してます。</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: なぜ入力制限（200文字）があるんですか？</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: サーバーの Pentium G4600 くんがオーバーヒートして爆発するのを防ぐためです。物理的な平和を守っています。</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: モデルの形式は何ですか？</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: GGUF 形式のQ5_K_Mを使ってます。消しゴムマジックでお手軽に賢さを引き出しています。</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: APIの互換性は？</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: OpenAI 互換のエンドポイントを提供しています。既存のライブラリがそのまま使えるはずですが、たまに機嫌を損ねます。</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: なんですかこのよくある質問は</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: よくない質問です。</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: 人を殺すのは犯罪ですか？</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: 結論 死刑☆</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q: ふざけてますか？</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: はい、ふざけてます。</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q. どうやって暗号化してますか</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: httpsのあれです</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q. データの保管をどうやって暗号化してますか</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: してません</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q. 私たちが「ありがとう」ということでどれぐらい電気代が上がりますか</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: 約0.0005円ですが、ちりつもですよ。</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q. このサービスで収集された情報は第三者へ送信しますか？</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: いいえ、べーこんがAIの改善に使うだけです。送信する場合は許可もらってからにしますよ。</p>

    <hr style="margin: 0 0 2.75rem 0">

    <p style="color: var(--accent-color); margin-bottom: 0.3rem;">Q. どうやって開発してますか？</p>
    <p style="color: var(--text-muted); margin-bottom: 2.75rem;">A: AntigravityとかCursorとか使ってAIで開発してますん！でも手作業のところも結構あるかも？愛情たっぷり！</p>

</div>
`;

export const content = contentHtml;
export const title = 'よくある質問 - KAi';
export const description = 'KAiに関するよくある質問（FAQ）です。使い方や機能、技術的な疑問についてお答えしています。';
export const keywords = 'KAi, よくある質問, FAQ, ヘルプ';
