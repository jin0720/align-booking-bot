// src/config.js - サロン設定 (ここを変更してカスタマイズ)
require('dotenv').config();

module.exports = {
  // ─── メニュー ───────────────────────────────────────────
  MENUS: {
    oil: 'オイルマッサージ',
    seitai: '整体',
  },

  // ─── 料金（定価・割引後） ────────────────────────────────
  PRICES: {
    70:  { original: 10000, discounted: 9000,  label: '70分' },
    100: { original: 13000, discounted: 12000, label: '100分' },
    130: { original: 16000, discounted: 15000, label: '130分' },
    160: { original: 19000, discounted: 18000, label: '160分' },
  },

  // ─── 営業時間 ────────────────────────────────────────────
  BUSINESS_START:          10 * 60,  // 10:00 (分換算) ── マッサージ
  TRAINING_BUSINESS_START:  6 * 60,  //  6:00 (分換算) ── トレーニング
  BUSINESS_END:            23 * 60,  // 23:00 (閉店時刻 = 施術終了の上限)
  SLOT_INTERVAL:           30,        // 30分刻み

  // ─── トレーニングメニュー ──────────────────────────────────
  TRAINING_MENUS: {
    training: 'パーソナルトレーニング',
    training_early: '早朝パーソナル',
  },

  // ─── トレーニング料金 ──────────────────────────────────────
  TRAINING_PRICES: {
    50: { original: 7000,  discounted: 7000,  label: '50分' },
    60: { original: 10000, discounted: 9000,  label: '60分' },
    90: { original: 13000, discounted: 12000, label: '90分' },
  },

  // ─── トレーニングメニューID→提供時間(分)（/api/menus 組み立て用） ──
  TRAINING_MENU_DURATIONS: {
    training: [60, 90],
    training_early: [50],
  },

  // ─── メニューID別の最終予約開始時刻（分換算・早朝パーソナルは9:30スタートまで） ──
  TRAINING_MENU_LAST_START: {
    training_early: 9 * 60 + 30,
  },

  // ─── トレーニング予約締切（前日この時間まで） ──────────────
  TRAINING_BOOKING_DEADLINE_HOUR: 22,

  // ─── トレーニング専用シート名 ──────────────────────────────
  TRAINING_SHEET_NAME: 'トレーニング予約',

  // ─── レンタルジム情報（確定通知でお客様に送付） ──────────
  GYM_LOCATIONS: [
    {
      label: '① 中野駅北口徒歩1分',
      name: 'シティプラザ中野 205',
      access: '中野駅北口から徒歩1分',
      address: '〒164-0001 東京都中野区中野５丁目３２−１１ シティプラザ中野 205',
    },
    {
      label: '② 中野駅南口徒歩4分',
      name: 'アヤベビル 2F（中野レンタルジム）',
      access: '中野駅南口から徒歩4分',
      address: '〒164-0001 東京都中野区中野３丁目３２−１０ アヤベビル 2F',
    },
    {
      label: '③ 中野坂上A1出口徒歩4分',
      name: 'アクセス淀橋 7D号室',
      access: '中野坂上駅A1出口から徒歩4分',
      address: '〒164-0012 東京都中野区本町１丁目１４−１０ アクセス淀橋 7D号室',
    },
  ],

  // ─── Google Sheets & Calendar ─────────────────────────────
  SPREADSHEET_ID: process.env.GOOGLE_SPREADSHEET_ID,
  SHEET_NAME: '予約一覧',
  SETTINGS_SHEET_NAME: '営業設定',
  CALENDAR_ID: process.env.GOOGLE_CALENDAR_ID,

  // ─── オーナー情報 ─────────────────────────────────────────
  OWNER_LINE_USER_ID: process.env.OWNER_LINE_USER_ID,

  // ─── LINE ─────────────────────────────────────────────────
  LINE_CHANNEL_ACCESS_TOKEN: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  LINE_CHANNEL_SECRET:      process.env.LINE_CHANNEL_SECRET,
};
