// src/index.js - サーバーエントリーポイント
require('dotenv').config();

const express = require('express');
const { middleware, messagingApi } = require('@line/bot-sdk');
const { handleEvent } = require('./lineHandler');
const { ensureHeaders } = require('./sheetsService');
const apiRoutes = require('./apiRoutes');
const { corsMiddleware } = require('./authMiddleware');

// ── LINE クライアント初期化 ──────────────────────────────────
const lineConfig = {
  channelSecret:      process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: lineConfig.channelAccessToken,
});

// ── Expressアプリ設定 ────────────────────────────────────────
const app = express();

// JSON パースミドルウェア
app.use(express.json());

// CORS ミドルウェア
app.use(corsMiddleware);

// ヘルスチェック
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'LINE Booking Bot is running! 🌿' });
});

// REST API ルート（Mini App 用）
app.use('/api', apiRoutes);

// LINE Webhook エンドポイント
app.post(
  '/webhook',
  middleware({ channelSecret: lineConfig.channelSecret }),
  (req, res) => {
    // LINE の仕様: 200 を先に返してからイベント処理
    res.status(200).json({ status: 'ok' });

    const events = req.body.events;
    if (!events || events.length === 0) return; // 疎通確認リクエスト

    Promise.all(events.map(event => handleEvent(event, client)))
      .catch(err => console.error('イベント処理エラー:', err));
  }
);

// ── サーバー起動 ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`🚀 LINE Booking Bot started on port ${PORT}`);

  // Google Sheetsのヘッダー初期化
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_SPREADSHEET_ID) {
    try {
      await ensureHeaders();
      console.log('✅ Google Sheets 接続OK');
    } catch (err) {
      console.error('⚠️  Google Sheets 接続エラー (設定を確認してください):', err.message);
    }
  } else {
    console.warn('⚠️  Google Sheets の環境変数が未設定です (.env を確認)');
  }

  // Render.com 無料プランのスリープ防止（14分ごとに自己ping）
  const SELF_URL = process.env.RENDER_EXTERNAL_URL;
  if (SELF_URL) {
    setInterval(async () => {
      try {
        await fetch(SELF_URL);
        console.log('💓 Keep-alive OK');
      } catch (err) {
        console.error('💓 Keep-alive failed:', err.message);
      }
    }, 14 * 60 * 1000);
    console.log(`💓 Keep-alive 起動 (14分ごとに ${SELF_URL} をping)`);
  }
});
