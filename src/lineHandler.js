// src/lineHandler.js - LINE Webhookイベントのルーティング
const { handleBookingFlow } = require('./bookingFlow');
const { getUserLang, t } = require('./i18n');

// ユーザーごとのメッセージ処理キュー（並行処理による競合を防ぐ）
const userQueues = new Map();

// postbackデータ → 予約フロー用テキストのマッピング
// LINE コンソールのリッチメニュー設定に合わせて追加・変更してください
const POSTBACK_TEXT_MAP = {
  // 予約確認・変更・キャンセル系（リッチメニューボタン）
  'action=check_reservation':       '予約の確認・変更・キャンセル',
  'action=check_reservations':      '予約の確認・変更・キャンセル',
  'action=reservation_check':       '予約の確認・変更・キャンセル',
  'action=reservation_list':        '予約の確認・変更・キャンセル',
  'action=my_reservations':         '予約の確認・変更・キャンセル',
  'action=cancel_reservation':      '予約の確認・変更・キャンセル',
  // 新規予約系
  'action=new_booking':             'マッサージ予約',
  'action=booking':                 'マッサージ予約',
  'action=start_booking':           'マッサージ予約',
  // トレーニング系
  'action=training':                    'トレーニング相談・体験予約',
  'action=training_inquiry':            'トレーニング相談・体験予約',
  'action=training_consultation':       'トレーニング相談・体験予約',
  'action=training_booking':            'トレーニング相談・体験予約',
  'training_start_consultation':        'トレーニング相談スタート',
};

// 英語表示のボタンは postback で内部コマンドを送る。そのままテキストとして処理する
const PASSTHROUGH_POSTBACK = /^(目標:|✅ 選択完了$|training_wait_reply$)/;

/**
 * LINE Webhookイベント1件を処理する
 */
async function handleEvent(event, client) {
  let userId, text, replyToken;

  if (event.type === 'message' && event.message.type === 'text') {
    userId     = event.source.userId;
    text       = event.message.text.trim();
    replyToken = event.replyToken;
    console.log(`📩 [${userId}] 受信: "${text}" (長さ: ${text.length})`);

  } else if (event.type === 'postback') {
    userId     = event.source.userId;
    replyToken = event.replyToken;
    const data = event.postback.data || '';

    if (data === 'action=select_date') {
      // datetimepicker からの日付選択
      text = `日付:${event.postback.params.date}`;
      console.log(`📅 [${userId}] 日付選択 (postback): ${event.postback.params.date}`);
    } else {
      // その他のpostback: マッピング表で変換
      const mapped = POSTBACK_TEXT_MAP[data];
      if (PASSTHROUGH_POSTBACK.test(data)) {
        // 英語表示のボタンが送る内部コマンド（日本語のユーザー発言と同じ扱い）
        text = data;
      } else if (mapped) {
        text = mapped;
        console.log(`📲 [${userId}] postback → "${data}" → テキスト: "${text}"`);
      } else {
        // 未知のpostback: データをそのままテキストとして handleBookingFlow に渡す
        // → "予約確認" など直接キーワードになっている場合に対応できる
        text = data;
        console.warn(`⚠️ [${userId}] 未知のpostbackデータ: "${data}" — テキストとして処理を試みます`);
      }
    }

  } else {
    return null;
  }

  // 同一ユーザーのメッセージを直列処理する
  const prev = userQueues.get(userId) ?? Promise.resolve();
  const task = prev.then(() => _processMessage(userId, text, replyToken, client));
  userQueues.set(userId, task.catch(() => {}));
  return task;
}

async function _processMessage(userId, text, replyToken, client) {
  if (!client) {
    console.error(`❌ [${userId}] LINE client 未初期化のため返信できません`);
    return;
  }

  let messages;

  try {
    messages = await handleBookingFlow(userId, text, client);
  } catch (err) {
    console.error(`❌ [${userId}] handleBookingFlow エラー:`, err.message);
    messages = [{ type: 'text', text: t(await getUserLang(client, userId)).genericError }];
  }

  if (!messages || messages.length === 0) {
    console.log(`ℹ️ [${userId}] 返信なし`);
    return;
  }

  const toSend = messages.slice(0, 5);

  try {
    console.log(`📤 [${userId}] 返信送信中 (replyMessage)`);
    await client.replyMessage({ replyToken, messages: toSend });
    console.log(`✅ [${userId}] 返信送信完了`);
  } catch (replyErr) {
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
