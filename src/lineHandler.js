// src/lineHandler.js - LINE Webhookイベントのルーティング
const { handleBookingFlow } = require('./bookingFlow');

// ユーザーごとのメッセージ処理キュー（並行処理による競合を防ぐ）
const userQueues = new Map();

/**
 * LINE Webhookイベント1件を処理する
 * @param {object} event  LINE SDK のイベントオブジェクト
 * @param {object} client LINE Messaging API クライアント
 */
async function handleEvent(event, client) {
  let userId, text, replyToken;

  if (event.type === 'message' && event.message.type === 'text') {
    userId     = event.source.userId;
    text       = event.message.text.trim();
    replyToken = event.replyToken;
    console.log(`📩 [${userId}] 受信: "${text}" (長さ: ${text.length})`);
  } else if (event.type === 'postback' && event.postback.data === 'action=select_date') {
    userId     = event.source.userId;
    text       = `日付:${event.postback.params.date}`;
    replyToken = event.replyToken;
    console.log(`📅 [${userId}] 日付選択: ${event.postback.params.date}`);
  } else {
    return null;
  }

  // 同一ユーザーのメッセージを直列処理する（前のメッセージ処理が終わるまで待つ）
  const prev = userQueues.get(userId) ?? Promise.resolve();
  const task = prev.then(() => _processMessage(userId, text, replyToken, client));
  userQueues.set(userId, task.catch(() => {})); // エラーで後続がブロックされないよう catch
  return task;
}

async function _processMessage(userId, text, replyToken, client) {
  let messages;

  try {
    messages = await handleBookingFlow(userId, text, client);
  } catch (err) {
    console.error(`❌ [${userId}] handleBookingFlow エラー:`, err.message);
    messages = [{ type: 'text', text: '処理中にエラーが発生しました。しばらくしてから再度お試しください。' }];
  }

  if (!messages || messages.length === 0) {
    console.log(`ℹ️ [${userId}] 返信なし`);
    return;
  }

  const toSend = messages.slice(0, 5);

  // まず replyMessage を試みる（replyToken が有効な場合）
  try {
    console.log(`📤 [${userId}] 返信送信中 (replyMessage)`);
    await client.replyMessage({ replyToken, messages: toSend });
    console.log(`✅ [${userId}] 返信送信完了`);
  } catch (replyErr) {
    // replyToken 期限切れ（コールドスタート等）の場合は pushMessage にフォールバック
    console.warn(`⚠️ [${userId}] replyMessage 失敗 (${replyErr.message}) → pushMessage にフォールバック`);
    try {
      await client.pushMessage({ to: userId, messages: toSend });
      console.log(`✅ [${userId}] pushMessage 送信完了`);
    } catch (pushErr) {
      console.error(`❌ [${userId}] pushMessage も失敗:`, pushErr.message);
    }
  }
}

module.exports = { handleEvent };
