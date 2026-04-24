# LINE自動予約ボット — Align サロン セットアップガイド

---

## 📋 必要なもの（事前準備）

| 必要なもの | 取得場所 | 費用 |
|-----------|---------|------|
| LINE公式アカウント | 作成済み ✅ | 無料 |
| LINE Developersアカウント | https://developers.line.biz/ | 無料 |
| Google アカウント | 作成済みのはず | 無料 |
| Render.com アカウント | https://render.com/ | 無料 |

---

## 🔧 STEP 1: LINE Messaging API を有効化する

1. https://developers.line.biz/ にログイン
2. 「プロバイダー」を作成（サロン名など）
3. 「新しいチャンネルを作成」→「Messaging API」を選択
4. 公式LINEアカウントと紐付け
5. **「チャンネルアクセストークン（長期）」を発行** → メモしておく
6. **「チャンネルシークレット」** → メモしておく

> ⚠️ 「応答メッセージ」と「あいさつメッセージ」は **オフ** にしてください  
> (LINE公式アカウントマネージャー → 応答設定 → すべてオフ)

---

## 🔧 STEP 2: Google Sheets & APIを設定する

### 2-1. スプレッドシートを作成する

1. https://sheets.google.com/ で新規スプレッドシートを作成
2. シート名を「予約一覧」に変更（下のタブをダブルクリック）
3. URLの `/spreadsheets/d/【ここ】/edit` をメモする（Spreadsheet ID）

### 2-2. Google Cloud でAPIを有効化する

1. https://console.cloud.google.com/ にアクセス
2. 新規プロジェクトを作成（例: `align-booking`）
3. 左メニュー「APIとサービス」→「ライブラリ」→「Google Sheets API」を検索 → **有効化**

### 2-3. サービスアカウントを作成する

1. 「APIとサービス」→「認証情報」→「認証情報を作成」→「サービスアカウント」
2. 名前を入力（例: `align-bot`）して「作成して続行」
3. ロールは「編集者」を選択 → 完了
4. 作成されたサービスアカウントをクリック
5. 「キー」タブ → 「キーを追加」→「新しいキーを作成」→「JSON」
6. JSONファイルがダウンロードされる → **大切に保管**

### 2-4. スプレッドシートをサービスアカウントと共有する

1. ダウンロードしたJSONの中の `client_email` の値をコピー  
   （例: `align-bot@align-booking.iam.gserviceaccount.com`）
2. スプレッドシートを開く → 「共有」ボタン
3. そのメールアドレスを入力して「編集者」権限で共有

---

## 🔧 STEP 3: Render.com にデプロイする

1. https://render.com/ でGitHubアカウントでログイン
2. 「New +」→「Web Service」
3. このフォルダ (`line-booking-server`) をGitHubリポジトリにプッシュして接続
   ```bash
   cd /Users/jin/HP/new-salon/line-booking-server
   git init
   git add .
   git commit -m "Initial commit"
   # GitHubで新規リポジトリを作成してpush
   ```
4. Render の設定:
   - **Root Directory**: `./` (line-booking-server を単独でリポジトリにした場合)
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Node Version**: 18以上

5. 「Environment Variables（環境変数）」に以下を追加:

| キー | 値 |
|-----|---|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developersで取得したトークン |
| `LINE_CHANNEL_SECRET` | LINE Developersで取得したシークレット |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | JSONファイルの中身を**全部**1行で貼り付け |
| `GOOGLE_SPREADSHEET_ID` | スプレッドシートのID |
| `OWNER_LINE_USER_ID` | オーナーのLINE User ID（後で設定可） |

6. 「Create Web Service」でデプロイ → URLをメモ  
   例: `https://align-booking-bot.onrender.com`

---

## 🔧 STEP 4: LINE DevelopersにWebhook URLを設定する

1. LINE Developers の Messaging API チャンネル設定を開く
2. 「Webhook URL」に以下を入力:  
   `https://align-booking-bot.onrender.com/webhook`
3. 「検証」ボタンを押して「成功」が出ればOK ✅
4. 「Webhookの利用」を **オン** にする

---

## 🔧 STEP 5: オーナーのLINE User IDを取得する

1. でLINE公式アカウントを**友達追加**（オーナー自身が）
2. LINEで「自分のID教えて」と送信
3. ボットが `Uxxxxxxxxx...` というIDを返信する
4. そのIDをRenderの環境変数 `OWNER_LINE_USER_ID` に設定

---

## ✅ 動作確認

以下の流れをLINEで手動テストしてください:

```
あなた: 「予約」
ボット: ウェルカムメッセージ + メニュー選択ボタン

あなた: 「オイルマッサージ」ボタンを押す
ボット: コース選択ボタン（70分/100分/130分/160分）

あなた: 「100分」ボタンを押す
ボット: 日付選択（クイックリプライ）

あなた: 日付を選択（または「5/15」と入力）
ボット: 空き時間の一覧テキスト

あなた: 「14:30」と入力
ボット: 「お名前を入力してください」

あなた: 「田中 太郎」と入力
ボット: 予約内容確認メッセージ

あなた: 「予約する」ボタンを押す
ボット: 🎉 予約完了メッセージ
オーナー: 🔔 新規予約通知メッセージ
Google Sheets: 予約データが自動で書き込まれる
```

---

## 📊 Google Sheetsで予約を確認する

スプレッドシートの「予約一覧」シートに以下の列が自動で作成されます:

| 日付 | 開始時間 | 終了時間 | メニュー | 時間（分） | お名前 | LINE UserID | 予約日時 | ステータス |
|------|---------|---------|--------|---------|-------|-------------|---------|----------|

**「確定」状態のデータが自動ブロックの基準になります。**  
キャンセルの場合は「ステータス」列を「キャンセル」に手動変更してください（空き枠として復活します）。

---

## 💡 よくある質問

**Q: Renderの無料プランだとサーバーが落ちる？**  
A: 15分以上アクセスがないと一時停止します。起動に約30秒かかりますが、その間のWebhookは失われます。  
頻繁に予約が入る場合は月$7の有料プランを検討してください。

**Q: LINEの月200通制限は？**  
A: 予約1件あたり約5〜8往復のメッセージを使います。月25〜40件の予約が無料の上限目安です。  
それ以上の場合はLINEのライトプラン（月5,000円〜）にアップグレードを。

**Q: キャンセル対応は？**  
A: 現時点ではボットは予約のみ対応。キャンセルはLINEでの手動連絡 → Sheetsのステータスを「キャンセル」に変更するフローです。
