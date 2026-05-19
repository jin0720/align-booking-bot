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
  BUSINESS_START: 10 * 60,   // 10:00 (分換算)
  BUSINESS_END:   23 * 60,   // 23:00 (閉店時刻 = 施術終了の上限)
  SLOT_INTERVAL:  30,         // 30分刻み

  // ─── トレーニングメニュー ──────────────────────────────────
  TRAINING_MENUS: {
    training: 'パーソナルトレーニング',
  },

  // ─── トレーニング料金 ──────────────────────────────────────
  TRAINING_PRICES: {
    60: { original: 10000, discounted: 9000,  label: '60分' },
    90: { original: 13000, discounted: 12000, label: '90分' },
  },

  // ─── トレーニング予約締切（前日この時間まで） ──────────────
  TRAINING_BOOKING_DEADLINE_HOUR: 22,

  // ─── トレーニング専用シート名 ──────────────────────────────
  TRAINING_SHEET_NAME: 'トレーニング予約',

  // ─── レンタルジム情報（確定通知でお客様に送付） ──────────
  GYM_LOCATIONS: [
    {
      name: 'レンタルジムA（要変更）',
      address: '住所・アクセス情報をここに記入',
    },
    {
      name: 'レンタルジムB（要変更）',
      address: '住所・アクセス情報をここに記入',
    },
  ],

  // ─── Google Sheets & Calendar ─────────────────────────────
  SPREADSHEET_ID: process.env.GOOGLE_SPREADSHEET_ID,
  SHEET_NAME: '予約一覧',
  CALENDAR_ID: process.env.GOOGLE_CALENDAR_ID,

  // ─── オーナー情報 ─────────────────────────────────────────
  OWNER_LINE_USER_ID: process.env.OWNER_LINE_USER_ID,

  // ─── LINE ─────────────────────────────────────────────────
  LINE_CHANNEL_ACCESS_TOKEN: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  LINE_CHANNEL_SECRET:      process.env.LINE_CHANNEL_SECRET,
};
