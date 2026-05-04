// src/apiRoutes.js - REST API エンドポイント定義
const express = require('express');
const {
  getAvailableSlots,
  saveBooking,
  getUserReservations,
  cancelBooking
} = require('./sheetsService');
const config = require('./config');
const { minutesToTime, timeToMinutes, formatDateJP } = require('./utils');

const router = express.Router();

/** 予約確定通知メッセージ */
function buildBookingConfirmMessage({ date, time, endTime, menu, duration, name }) {
  const menuName = config.MENUS[menu] || menu;
  const price = config.PRICES[parseInt(duration)];
  const dateJP = formatDateJP(date);

  return {
    type: 'text',
    text: (
      `🎉 ご予約が確定しました！\n\n` +
      `【予約内容】\n` +
      `📋 ${menuName}\n` +
      `⏱ ${duration}分コース\n` +
      (price ? `💴 ¥${price.discounted.toLocaleString()}\n` : '') +
      `📅 ${dateJP}\n` +
      `🕐 ${time}〜${endTime}\n` +
      `👤 ${name} 様\n\n` +
      `ご来店を心よりお待ちしております✨\n\n` +
      `※サロンの最寄駅は東高円寺(1番出口)から徒歩3分になります。詳細は後ほどご連絡いたしますので少々お待ちください。\n\n` +
      `【キャンセルについて】\n` +
      `前日23時まで：無料\n` +
      `それ以降（当日キャンセル）：全額\n\n` +
      `※前日23時以降のキャンセルは全額を頂戴いたします。`
    ),
  };
}

/** オーナー向け新規予約通知 */
async function notifyOwner(client, { date, time, endTime, menu, duration, name }) {
  const ownerId = config.OWNER_LINE_USER_ID;
  if (!ownerId || !client) return;
  const menuName = config.MENUS[menu] || menu;
  const price = config.PRICES[parseInt(duration)];
  const dateJP = formatDateJP(date);
  try {
    await client.pushMessage({
      to: ownerId,
      messages: [{
        type: 'text',
        text: (
          `🔔 新規予約が入りました！\n\n` +
          `👤 ${name} 様\n` +
          `📋 ${menuName}\n` +
          `⏱ ${duration}分コース\n` +
          (price ? `💴 ¥${price.discounted.toLocaleString()}\n` : '') +
          `📅 ${dateJP}\n` +
          `🕐 ${time}〜${endTime}`
        ),
      }],
    });
    console.log('🔔 オーナーへ通知送信完了');
  } catch (err) {
    console.error('オーナー通知失敗:', err.message);
    if (err.rawBody) console.error('  LINE API エラー詳細:', err.rawBody);
  }
}

/**
 * apiRoutes ファクトリ
 * @param {object} lineClient  LINE Messaging API クライアント
 */
function createApiRoutes(lineClient) {

  /**
   * GET /api/menus
   */
  router.get('/menus', (req, res) => {
    try {
      const menus = Object.entries(config.MENUS).map(([key, value]) => ({
        id: key,
        name: value,
        prices: {
          70:  config.PRICES[70],
          100: config.PRICES[100],
          130: config.PRICES[130],
          160: config.PRICES[160],
        },
      }));
      res.json(menus);
    } catch (error) {
      console.error('メニュー取得エラー:', error);
      res.status(500).json({ error: 'メニュー取得に失敗しました' });
    }
  });

  /**
   * GET /api/availability
   * Query: date (YYYY-MM-DD), duration (分数)
   */
  router.get('/availability', async (req, res) => {
    try {
      const { date, duration } = req.query;

      if (!date || !duration) {
        return res.status(400).json({ error: '日付 (date) と時間 (duration) が必須です' });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: '日付形式が不正です (YYYY-MM-DD)' });
      }

      const slots = await getAvailableSlots(date, parseInt(duration));
      res.json({ date, duration, slots });
    } catch (error) {
      console.error('可用枠取得エラー:', error);
      res.status(500).json({ error: '可用枠の取得に失敗しました' });
    }
  });

  /**
   * POST /api/bookings
   * Body: { date, time, menu, duration, name, userId }
   */
  router.post('/bookings', async (req, res) => {
    try {
      const { date, time, menu, duration, name, userId } = req.body;

      if (!date || !time || !menu || !duration || !name || !userId) {
        return res.status(400).json({ error: '必須フィールドが不足しています' });
      }

      // 楽観的ロック: 空き確認
      const availableSlots = await getAvailableSlots(date, parseInt(duration));
      if (!availableSlots.includes(time)) {
        return res.status(409).json({
          error: 'SLOT_TAKEN',
          message: 'この時間はすでに埋まってしまいました。別の時間をお選びください。',
          availableSlots,
        });
      }

      const endTime = await saveBooking({ date, time, menu, duration, name, userId });

      // LINE確認メッセージをお客様に push 送信
      console.log(`📬 LINE通知フロー開始 — userId: "${userId}", lineClient: ${lineClient ? 'あり' : 'なし (null)'}`);
      if (!lineClient) {
        console.warn('⚠️ LINE通知スキップ: lineClient が未初期化です（LINE_CHANNEL_ACCESS_TOKEN を確認）');
      } else if (!userId || userId.startsWith('demo')) {
        console.warn(`⚠️ LINE通知スキップ: userId が不正です ("${userId}") — LIFF未初期化の可能性あり`);
      } else {
        console.log(`📤 [${userId}] pushMessage 送信中...`);
        const confirmMsg = buildBookingConfirmMessage({ date, time, endTime, menu, duration, name });
        lineClient.pushMessage({ to: userId, messages: [confirmMsg] })
          .then(() => console.log(`✅ [${userId}] 予約確認メッセージ送信完了`))
          .catch(err => {
            console.error(`❌ LINE予約確認送信失敗 [${userId}]:`, err.message);
            // @line/bot-sdk v9 (fetch ベース) のエラー詳細
            if (err.rawBody) console.error('  LINE API エラー詳細:', err.rawBody);
            // @line/bot-sdk v7/v8 (axios ベース) のフォールバック
            const legacyDetail = err?.originalError?.response?.data ?? err?.response?.data;
            if (legacyDetail) console.error('  LINE API エラー詳細:', JSON.stringify(legacyDetail));
          });

        // オーナーにも通知
        notifyOwner(lineClient, { date, time, endTime, menu, duration, name });
      }

      res.status(201).json({
        success: true,
        message: '予約が確定しました',
        booking: { date, time, endTime, menu, duration, name },
      });
    } catch (error) {
      console.error('予約作成エラー:', error);
      res.status(500).json({ error: '予約の作成に失敗しました' });
    }
  });

  /**
   * GET /api/bookings
   * Query: userId
   */
  router.get('/bookings', async (req, res) => {
    try {
      const { userId } = req.query;
      if (!userId) {
        return res.status(400).json({ error: 'userId が必須です' });
      }
      const bookings = await getUserReservations(userId);
      res.json({ userId, bookings });
    } catch (error) {
      console.error('予約履歴取得エラー:', error);
      res.status(500).json({ error: '予約履歴の取得に失敗しました' });
    }
  });

  /**
   * DELETE /api/bookings/:rowIndex
   */
  router.delete('/bookings/:rowIndex', async (req, res) => {
    try {
      const { rowIndex } = req.params;
      const { date, time, name } = req.body;

      if (!date || !time || !name) {
        return res.status(400).json({ error: '日付、時間、名前が必須です' });
      }

      await cancelBooking({ rowIndex: parseInt(rowIndex), date, time, name });
      res.json({ success: true, message: '予約がキャンセルされました' });
    } catch (error) {
      console.error('予約キャンセルエラー:', error);
      res.status(500).json({ error: '予約のキャンセルに失敗しました' });
    }
  });

  return router;
}

module.exports = createApiRoutes;
