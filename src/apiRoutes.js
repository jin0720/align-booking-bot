// src/apiRoutes.js - REST API エンドポイント定義
const express = require('express');
const {
  getAvailableSlots,
  saveBooking,
  saveBookingIfAvailable,
  getUserReservations,
  cancelBooking,
  saveTrainingBooking,
  updateTrainingBookingStatus,
  getTrainingBookingByRow,
  getUserTrainingReservations,
  getMonthlySalesReport,
} = require('./sheetsService');
const config = require('./config');
const { withOwnerReplyButton, addOwnerReplyButtonToBubble } = require('./contactButtons');
const { minutesToTime, timeToMinutes, formatDateJP } = require('./utils');
const { getUserLang, normalizeLang, t } = require('./i18n');

const router = express.Router();

/** 予約確定通知メッセージ */
function buildBookingConfirmMessage({ date, time, endTime, menu, duration, name }, lang) {
  const T = t(lang);
  const menuName = T.menuNames[menu] || config.MENUS[menu] || menu;
  const price = config.getPrice(menu, parseInt(duration));

  return {
    type: 'text',
    text: T.bookingConfirm({ menuName, duration, price, dateText: T.formatDate(date), time, endTime, name }),
  };
}

/** 予約確定後の場所案内メッセージ＋画像2枚 */
const IMAGE_BASE = 'https://align-booking-bot.onrender.com/static';

function buildLocationMessages(name, time, date, lang) {
  const T = t(lang);
  // 日本時間 (UTC+9) でtoday/tomorrowを計算
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const todayStr = nowJST.toISOString().slice(0, 10);
  const tomorrowJST = new Date(nowJST);
  tomorrowJST.setDate(tomorrowJST.getDate() + 1);
  const tomorrowStr = tomorrowJST.toISOString().slice(0, 10);

  let dayLabel;
  if (date === todayStr)         dayLabel = T.location.today;
  else if (date === tomorrowStr) dayLabel = T.location.tomorrow;
  else {
    const [, m, d] = date.split('-').map(Number);
    dayLabel = T.location.otherDay(m, d);
  }

  const text = T.location.text({ name, dayLabel, time });

  return [
    { type: 'text', text },
    {
      type: 'image',
      originalContentUrl: `${IMAGE_BASE}/entrance-stairs.jpg`,
      previewImageUrl: `${IMAGE_BASE}/entrance-stairs.jpg`,
    },
    {
      type: 'image',
      originalContentUrl: `${IMAGE_BASE}/entrance-door.jpg`,
      previewImageUrl: `${IMAGE_BASE}/entrance-door.jpg`,
    },
  ];
}

/** オーナー通知に添える、お客様の言語の行。英語のお客様のみ表示 (日本語のお客様は従来どおり) */
function ownerLangLine(lang) {
  return lang === 'en' ? '🌐 お客様の言語: English\n' : '';
}

/** オーナー向けキャンセル通知 */
async function notifyOwnerCancellation(client, { date, time, endTime, menu, duration, name, lang }) {
  const ownerId = config.OWNER_LINE_USER_ID;
  if (!ownerId || !client) return;
  const menuName = config.MENUS[menu] || menu || '';
  const dateJP = formatDateJP(date);
  try {
    await client.pushMessage({
      to: ownerId,
      messages: [{
        type: 'text',
        text: (
          `❌ 予約がキャンセルされました。\n\n` +
          `👤 ${name} 様\n` +
          ownerLangLine(lang) +
          (menuName ? `📋 ${menuName}\n` : '') +
          (duration ? `⏱ ${duration}分コース\n` : '') +
          `📅 ${dateJP}\n` +
          `🕐 ${time}${endTime ? `〜${endTime}` : ''}`
        ),
      }],
    });
    console.log('🔔 オーナーへキャンセル通知送信完了');
  } catch (err) {
    console.error('オーナーキャンセル通知失敗:', err.message);
    if (err.rawBody) console.error('  LINE API エラー詳細:', err.rawBody);
  }
}

/** オーナー向け新規予約通知 */
async function notifyOwner(client, { date, time, endTime, menu, duration, name, userId, comment, lang }) {
  const ownerId = config.OWNER_LINE_USER_ID;
  if (!ownerId || !client) return;
  const menuName = config.MENUS[menu] || menu;
  const price = config.getPrice(menu, parseInt(duration));
  const dateJP = formatDateJP(date);

  let lineDisplayName = null;
  if (userId && !userId.startsWith('demo')) {
    try {
      const profile = await client.getProfile(userId);
      lineDisplayName = profile.displayName;
    } catch (e) {
      console.warn('LINE表示名取得失敗:', e.message);
    }
  }

  const nameLine = (lineDisplayName
    ? `👤 ${name} 様\n💬 LINE名: ${lineDisplayName}\n`
    : `👤 ${name} 様\n`) + ownerLangLine(lang);

  try {
    await client.pushMessage({
      to: ownerId,
      messages: [withOwnerReplyButton({
        type: 'text',
        text: (
          `🔔 新規予約が入りました！\n\n` +
          nameLine +
          `📋 ${menuName}\n` +
          `⏱ ${duration}分コース\n` +
          (price ? `💴 ¥${price.discounted.toLocaleString()}\n` : '') +
          `📅 ${dateJP}\n` +
          `🕐 ${time}〜${endTime}` +
          (comment ? `\n\n📝 ご要望:\n${comment}` : '')
        ),
      }, userId)],
    });
    console.log('🔔 オーナーへ通知送信完了');
  } catch (err) {
    console.error('オーナー通知失敗:', err.message);
    if (err.rawBody) console.error('  LINE API エラー詳細:', err.rawBody);
  }
}

/** トレーニング仮予約オーナー通知 Flex */
async function notifyOwnerTraining(client, { rowIndex, date, time, endTime, duration, name, userId, goals, comment, lang }) {
  const ownerId = config.OWNER_LINE_USER_ID;
  if (!ownerId || !client) return;
  const dateJP = formatDateJP(date);
  const goalsText = goals && goals.length > 0
    ? goals.map(g => `・${g}`).join('\n')
    : '（未回答）';

  try {
    await client.pushMessage({
      to: ownerId,
      messages: [{
        type: 'flex',
        altText: `🏋️ トレーニング仮予約: ${name}様 ${dateJP} ${time}〜`,
        contents: addOwnerReplyButtonToBubble({
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#2C5F3F',
            contents: [{
              type: 'text',
              text: '🏋️ トレーニング仮予約が入りました',
              color: '#ffffff',
              weight: 'bold',
              size: 'md',
              wrap: true,
            }],
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              { type: 'text', text: `👤 ${name} 様`, size: 'sm', wrap: true },
              ...(lang === 'en' ? [{ type: 'text', text: '🌐 お客様の言語: English', size: 'sm', wrap: true }] : []),
              { type: 'text', text: `📅 ${dateJP}　${time}〜${endTime}`, size: 'sm', wrap: true },
              { type: 'text', text: `⏱ パーソナルトレーニング ${duration}分`, size: 'sm', wrap: true },
              { type: 'separator', margin: 'md' },
              { type: 'text', text: '🎯 目標', size: 'xs', color: '#888888', margin: 'md' },
              { type: 'text', text: goalsText, size: 'sm', wrap: true },
              ...(comment ? [
                { type: 'text', text: '📝 ご要望', size: 'xs', color: '#888888', margin: 'md' },
                { type: 'text', text: comment, size: 'sm', wrap: true },
              ] : []),
            ],
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              {
                type: 'button',
                action: {
                  type: 'postback',
                  label: '✅ ジム確保完了・予約を確定する',
                  data: `training_confirm:${rowIndex}:${userId}`,
                },
                style: 'primary',
                color: '#2C5F3F',
              },
              {
                type: 'button',
                action: {
                  type: 'postback',
                  label: '⏰ 別の時間を提案する',
                  data: `training_propose:${rowIndex}:${userId}`,
                },
                style: 'secondary',
              },
            ],
          },
        }, userId),
      }],
    });
    console.log('🏋️ オーナーへトレーニング仮予約通知送信完了');
  } catch (err) {
    console.error('トレーニング仮予約通知失敗:', err.message);
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
      const T = t(normalizeLang(req.query.lang));
      const menuName = (id, fallback) => T.menuNames[id] || fallback;
      const localize = (price) => (price && T.lang !== 'ja' ? { ...price, label: T.duration(price.label.replace(/\D/g, '')) } : price);
      const localizePrices = (prices) => Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, localize(v)]));
      const massageMenus = Object.entries(config.MENUS).map(([key, value]) => {
        const priceTable = config.FIRST_TIME_MENU_IDS.has(key) ? config.FIRST_TIME_PRICES : config.PRICES;
        return {
          id: key,
          name: menuName(key, value),
          prices: localizePrices({
            70:  priceTable[70],
            100: priceTable[100],
            130: priceTable[130],
            160: priceTable[160],
          }),
        };
      });
      const trainingMenus = Object.entries(config.TRAINING_MENUS).map(([key, value]) => {
        const priceTable = config.FIRST_TIME_MENU_IDS.has(key) ? config.TRAINING_FIRST_PRICES : config.TRAINING_PRICES;
        const durations = config.TRAINING_MENU_DURATIONS?.[key] || Object.keys(priceTable).map(Number);
        const prices = {};
        durations.forEach(d => { prices[d] = priceTable[d]; });
        return { id: key, name: menuName(key, value), prices: localizePrices(prices) };
      });
      const menusById = new Map([...massageMenus, ...trainingMenus].map(m => [m.id, m]));
      const orderedMenus = config.MENU_DISPLAY_ORDER
        .map(id => menusById.get(id))
        .filter(Boolean);
      res.json(orderedMenus);
    } catch (error) {
      console.error('メニュー取得エラー:', error);
      res.status(500).json({ error: t(normalizeLang(req.query.lang)).api.menusFailed });
    }
  });

  /**
   * GET /api/availability
   * Query: date (YYYY-MM-DD), duration (分数), menu (オプション)
   */
  router.get('/availability', async (req, res) => {
    try {
      const { date, duration, menu = '' } = req.query;
      const A = t(normalizeLang(req.query.lang)).api;

      if (!date || !duration) {
        return res.status(400).json({ error: A.availabilityRequired });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: A.dateFormatInvalid });
      }

      const slots = await getAvailableSlots(date, parseInt(duration), menu);
      res.json({ date, duration, slots });
    } catch (error) {
      console.error('可用枠取得エラー:', error);
      res.status(500).json({ error: t(normalizeLang(req.query.lang)).api.availabilityFailed });
    }
  });

  /**
   * POST /api/bookings
   * Body: { date, time, menu, duration, name, userId, goals?, comment? }
   * comment は note / remarks / request / message でも受け付ける
   */
  router.post('/bookings', async (req, res) => {
    try {
      const { date, time, menu, duration, name, userId, goals } = req.body;
      // お客様の言語: ミニアプリで選ばれた lang があれば優先、なければ LINE の言語設定
      const lang = await getUserLang(lineClient, userId, req.body.lang);
      const T = t(lang);
      const rawComment = [req.body.comment, req.body.note, req.body.remarks, req.body.request, req.body.message]
        .find(v => typeof v === 'string' && v.trim());
      const comment = rawComment ? rawComment.trim().slice(0, 500) : '';

      if (!date || !time || !menu || !duration || !name || !userId) {
        return res.status(400).json({ error: T.api.fieldsMissing });
      }

      // ── トレーニング予約（仮予約フロー） ─────────────────────
      if (config.TRAINING_MENUS[menu]) {
        // 前日22時締切チェック
        const [y, m, d] = date.split('-').map(Number);
        const deadline = new Date(y, m - 1, d - 1);
        deadline.setHours(config.TRAINING_BOOKING_DEADLINE_HOUR, 0, 0, 0);
        const nowJST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));

        if (nowJST >= deadline) {
          return res.status(409).json({
            error: 'DEADLINE_PASSED',
            message: T.api.trainingDeadline(config.TRAINING_BOOKING_DEADLINE_HOUR),
          });
        }

        const { endTime, rowIndex } = await saveTrainingBooking({
          date, time, menu, duration, name, userId, comment,
          goals: Array.isArray(goals) ? goals : [],
        });

        // お客様へ仮予約受付メッセージ
        if (lineClient && userId && !userId.startsWith('demo')) {
          lineClient.pushMessage({
            to: userId,
            messages: [{
              type: 'text',
              text: T.trainingPending({
                dateText: T.formatDate(date),
                time,
                endTime,
                duration,
                deadlineHour: config.TRAINING_BOOKING_DEADLINE_HOUR,
              }),
            }],
          }).catch(err => console.error('トレーニング仮予約通知失敗:', err.message));

          // オーナーへ Flex 通知
          notifyOwnerTraining(lineClient, {
            rowIndex, date, time, endTime, duration, name, userId, comment, lang,
            goals: Array.isArray(goals) ? goals : [],
          });
        }

        return res.status(201).json({
          success: true,
          message: T.api.trainingReceived,
          pending: true,
          booking: { date, time, endTime, menu, duration, name, rowIndex },
        });
      }

      // ── 通常予約（マッサージ・整体） ─────────────────────────
      let endTime;
      try {
        endTime = await saveBookingIfAvailable({ date, time, menu, duration, name, userId, comment });
      } catch (err) {
        if (err.code === 'SLOT_TAKEN') {
          return res.status(409).json({
            error: 'SLOT_TAKEN',
            message: T.api.slotTaken || err.message,
            availableSlots: err.availableSlots,
          });
        }
        throw err;
      }

      console.log(`📬 LINE通知フロー開始 — userId: "${userId}", lineClient: ${lineClient ? 'あり' : 'なし (null)'}`);
      if (!lineClient) {
        console.warn('⚠️ LINE通知スキップ: lineClient が未初期化です（LINE_CHANNEL_ACCESS_TOKEN を確認）');
      } else if (!userId || userId.startsWith('demo')) {
        console.warn(`⚠️ LINE通知スキップ: userId が不正です ("${userId}") — LIFF未初期化の可能性あり`);
      } else {
        console.log(`📤 [${userId}] pushMessage 送信中...`);
        const confirmMsg = buildBookingConfirmMessage({ date, time, endTime, menu, duration, name }, lang);
        lineClient.pushMessage({ to: userId, messages: [confirmMsg] })
          .then(() => console.log(`✅ [${userId}] 予約確認メッセージ送信完了`))
          .catch(err => {
            console.error(`❌ LINE予約確認送信失敗 [${userId}]:`, err.message);
            if (err.rawBody) console.error('  LINE API エラー詳細:', err.rawBody);
            const legacyDetail = err?.originalError?.response?.data ?? err?.response?.data;
            if (legacyDetail) console.error('  LINE API エラー詳細:', JSON.stringify(legacyDetail));
          });

        const locationMsgs = buildLocationMessages(name, time, date, lang);
        lineClient.pushMessage({ to: userId, messages: locationMsgs })
          .then(() => console.log(`✅ [${userId}] 場所案内メッセージ送信完了`))
          .catch(err => console.error(`❌ 場所案内送信失敗 [${userId}]:`, err.message));

        notifyOwner(lineClient, { date, time, endTime, menu, duration, name, userId, comment, lang });
      }

      res.status(201).json({
        success: true,
        message: T.api.bookingConfirmed,
        booking: { date, time, endTime, menu, duration, name },
      });
    } catch (error) {
      console.error('予約作成エラー:', error);
      res.status(500).json({ error: t(normalizeLang(req.body && req.body.lang)).api.bookingFailed });
    }
  });

  /**
   * GET /api/training-bookings
   * Query: userId
   */
  router.get('/training-bookings', async (req, res) => {
    try {
      const { userId } = req.query;
      if (!userId) return res.status(400).json({ error: 'userId が必須です' });
      const bookings = await getUserTrainingReservations(userId);
      res.json({ userId, bookings });
    } catch (error) {
      console.error('トレーニング予約履歴取得エラー:', error);
      res.status(500).json({ error: '取得に失敗しました' });
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
      res.status(500).json({ error: t(normalizeLang(req.query.lang)).api.historyFailed });
    }
  });

  /**
   * DELETE /api/bookings/:rowIndex
   */
  router.delete('/bookings/:rowIndex', async (req, res) => {
    try {
      const { rowIndex } = req.params;
      const { date, time, endTime, menu, duration, name } = req.body;
      const lang = normalizeLang(req.body.lang) || 'ja';
      const A = t(lang).api;

      if (!date || !time || !name) {
        return res.status(400).json({ error: A.cancelFieldsMissing });
      }

      const [cy, cm, cd] = date.split('-').map(Number);
      const cancelDeadline = new Date(cy, cm - 1, cd - 1);
      cancelDeadline.setHours(23, 0, 0, 0);
      if (new Date() >= cancelDeadline) {
        return res.status(400).json({ error: A.cancelDeadlinePassed });
      }

      await cancelBooking({ rowIndex: parseInt(rowIndex), date, time, name });
      res.json({ success: true, message: A.cancelled });

      // オーナーへキャンセル通知（レスポンス後に非同期で送信）
      notifyOwnerCancellation(lineClient, { date, time, endTime, menu, duration, name, lang }).catch(() => {});
    } catch (error) {
      console.error('予約キャンセルエラー:', error);
      res.status(500).json({ error: t(normalizeLang(req.body && req.body.lang)).api.cancelFailed });
    }
  });

  /**
   * GET /api/admin/sales-report
   * Query: month (YYYY-MM), ownerUserId
   */
  router.get('/admin/sales-report', async (req, res) => {
    try {
      const { month } = req.query;
      if (!month || !/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({ error: 'month は YYYY-MM 形式で指定してください' });
      }
      const report = await getMonthlySalesReport(month);
      const massageTotal  = report.massageBookings.reduce((s, b) => s + b.price, 0);
      const trainingTotal = report.trainingBookings.reduce((s, b) => s + b.price, 0);
      res.json({
        month,
        massageBookings:  report.massageBookings,
        trainingBookings: report.trainingBookings,
        calendarOnly:     report.calendarOnly,
        massageTotal,
        trainingTotal,
        grandTotal: massageTotal + trainingTotal,
      });
    } catch (error) {
      console.error('売上レポートエラー:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/log — クライアントからのエラーログ受信
   */
  router.post('/log', (req, res) => {
    console.log('📱 クライアントログ:', JSON.stringify(req.body));
    res.json({ ok: true });
  });

  /**
   * POST /api/admin/send-message
   * Body: { ownerUserId, toUserId, message }
   */
  router.post('/admin/send-message', async (req, res) => {
    const { ownerUserId, toUserId, message } = req.body;
    if (!ownerUserId || ownerUserId !== config.OWNER_LINE_USER_ID) {
      return res.status(403).json({ error: '認証エラー' });
    }
    if (!toUserId || !message) {
      return res.status(400).json({ error: 'toUserId と message が必須です' });
    }
    if (!lineClient) {
      return res.status(500).json({ error: 'LINE クライアント未初期化' });
    }
    try {
      await lineClient.pushMessage({ to: toUserId, messages: [{ type: 'text', text: message }] });
      res.json({ success: true });
    } catch (err) {
      console.error('admin/send-message エラー:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createApiRoutes;
