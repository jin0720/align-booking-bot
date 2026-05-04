// src/authMiddleware.js - LINE 認証ミドルウェア
const crypto = require('crypto');

/**
 * LINE Signature 検証ミドルウェア
 * LINE Webhook からのリクエストか確認する
 */
function verifyLineSignature(req, res, next) {
  const signature = req.headers['x-line-signature'];
  const body = req.rawBody || JSON.stringify(req.body);

  if (!signature) {
    console.warn('⚠️ LINE Signature が検出されません（API テスト時は正常）');
    // API テスト用に署名なしでもスキップ
    return next();
  }

  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const hash = crypto
    .createHmac('sha256', channelSecret)
    .update(typeof body === 'string' ? body : JSON.stringify(body))
    .digest('base64');

  if (hash === signature) {
    console.log('✅ LINE Signature 検証成功');
    return next();
  }

  console.error('❌ LINE Signature 検証失敗');
  return res.status(403).json({ error: '署名検証エラー' });
}

/**
 * CORS ヘッダー許可ミドルウェア
 * Mini App からのクロスオリジンリクエストを許可
 */
function corsMiddleware(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, PUT, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-LINE-Signature');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
}

module.exports = { verifyLineSignature, corsMiddleware };
