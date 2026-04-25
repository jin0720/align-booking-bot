// src/lineHandler.js - LINE Webhookイベントのルーティング
const { handleBookingFlow } = require('./bookingFlow');

/**
 * LINE Webhookイベント1件を処理する
 * @param {object} event  LINE SDK のイベントオブジェクト
 * @param {object} client LINE Messaging API クライアント
 */
async function handleEvent(event, client) {
  // テキストメッセージ以外は無視
  if (event.type !== 'message' || event.message.type !== 'text') return null;

  const userId     = event.source.userId;
  const text       = event.message.text.trim();
  const replyToken = event.replyToken;

  console.log(`📩 [${userId}] 受信: "${text}" (長さ: ${text.length})`);
  
  try {
    const messages = await handleBookingFlow(userId, text, client);

    if (messages && messages.length > 0) {
      await client.replyMessage({
        replyToken,
        messages: messages.slice(0, 5), // LINE は1回のreplyで最大5件まで
      });
    }
  } catch (err) {
    console.error(`[handleEvent] エラー (userId: ${userId}):`, err);
    // エラー時はユーザーに一般エラーメッセージを返す
    try {
      await client.replyMessage({
        replyToken,
        messages: [{
          type: 'text',
          text: '申し訳ありません、エラーが発生しました。\nしばらくしてから再度お試しいただくか、お電話にてご連絡ください。',
        }],
      });
    } catch (_) { /* replyTokenが期限切れの場合など */ }
  }
}

module.exports = { handleEvent };
