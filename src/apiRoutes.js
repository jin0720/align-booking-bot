// src/apiRoutes.js - REST API エンドポイント定義
const express = require('express');
const { 
  getAvailableSlots, 
  saveBooking, 
  getUserReservations, 
  cancelBooking 
} = require('./sheetsService');
const config = require('./config');

const router = express.Router();

/**
 * GET /api/menus
 * メニュー一覧を返す
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
 * 指定日の利用可能時間スロットを返す
 * Query: date (YYYY-MM-DD), duration (分数)
 */
router.get('/availability', async (req, res) => {
  try {
    const { date, duration } = req.query;

    if (!date || !duration) {
      return res.status(400).json({ 
        error: '日付 (date) と時間 (duration) が必須です' 
      });
    }

    // 日付フォーマット検証
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
 * 新規予約を作成（楽観的ロック対応）
 * Body: { date, time, menu, duration, name, userId }
 */
router.post('/bookings', async (req, res) => {
  try {
    const { date, time, menu, duration, name, userId } = req.body;

    // バリデーション
    if (!date || !time || !menu || !duration || !name || !userId) {
      return res.status(400).json({ 
        error: '必須フィールドが不足しています' 
      });
    }

    // 楽観的ロック: 確認時に再度スロット確認
    const availableSlots = await getAvailableSlots(date, parseInt(duration));
    if (!availableSlots.includes(time)) {
      return res.status(409).json({ 
        error: 'SLOT_TAKEN',
        message: 'この時間はすでに埋まってしまいました。別の時間をお選びください。',
        availableSlots 
      });
    }

    // 予約を保存
    const endTime = await saveBooking({ date, time, menu, duration, name, userId });

    res.status(201).json({ 
      success: true,
      message: '予約が確定しました',
      booking: { date, time, endTime, menu, duration, name }
    });
  } catch (error) {
    console.error('予約作成エラー:', error);
    res.status(500).json({ error: '予約の作成に失敗しました' });
  }
});

/**
 * GET /api/bookings
 * ユーザーの予約履歴を取得
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
 * 予約をキャンセル
 */
router.delete('/bookings/:rowIndex', async (req, res) => {
  try {
    const { rowIndex } = req.params;
    const { date, time, name } = req.body;

    if (!date || !time || !name) {
      return res.status(400).json({ 
        error: '日付、時間、名前が必須です' 
      });
    }

    await cancelBooking({ rowIndex: parseInt(rowIndex), date, time, name });

    res.json({ 
      success: true,
      message: '予約がキャンセルされました'
    });
  } catch (error) {
    console.error('予約キャンセルエラー:', error);
    res.status(500).json({ error: '予約のキャンセルに失敗しました' });
  }
});

module.exports = router;
