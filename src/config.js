// src/config.js - サロン設定 (ここを変更してカスタマイズ)
require('dotenv').config();

// ─── キャンペーン割引（1,000円OFF）終了日時 ───────────────────
// この日時（JST）以降は自動的に discounted === original（通常料金）になる
const CAMPAIGN_END = new Date('2026-08-01T00:00:00+09:00');
const isCampaignActive = () => new Date() < CAMPAIGN_END;

/** キャンペーン終了後は discounted を original に揃えて返す */
function applyCampaign(prices) {
  if (isCampaignActive()) return prices;
  const result = {};
  for (const [key, price] of Object.entries(prices)) {
    result[key] = { ...price, discounted: price.original };
  }
  return result;
}

const BASE_PRICES = {
  70:  { original: 10000, discounted: 9000,  label: '70分' },
  100: { original: 13000, discounted: 12000, label: '100分' },
  130: { original: 16000, discounted: 15000, label: '130分' },
  160: { original: 19000, discounted: 18000, label: '160分' },
};

const BASE_TRAINING_PRICES = {
  50: { original: 7000,  discounted: 7000,  label: '50分' },
  80: { original: 10000, discounted: 10000, label: '80分' },
  60: { original: 10000, discounted: 9000,  label: '60分' },
  90: { original: 13000, discounted: 12000, label: '90分' },
};

// ─── 初回限定1,000円OFF（常設・期限なし） ──────────────────────
const BASE_FIRST_TIME_PRICES = {
  70:  { original: 10000, discounted: 9000,  label: '70分' },
  100: { original: 13000, discounted: 12000, label: '100分' },
  130: { original: 16000, discounted: 15000, label: '130分' },
  160: { original: 19000, discounted: 18000, label: '160分' },
};

const BASE_TRAINING_FIRST_PRICES = {
  60: { original: 10000, discounted: 9000,  label: '60分' },
  90: { original: 13000, discounted: 12000, label: '90分' },
};

module.exports = {
  // ─── メニュー ───────────────────────────────────────────
  MENUS: {
    oil: 'オイルマッサージ',
    seitai: '整体',
    oil_first: '初回オイルマッサージ(1000円OFF)',
    seitai_first: '初回整体(1000円OFF)',
  },

  // ─── 料金（定価・割引後） ────────────────────────────────
  // アクセスするたびに現在時刻でキャンペーン判定を行う（要 = getter）
  get PRICES() {
    return applyCampaign(BASE_PRICES);
  },

  // ─── 初回限定1,000円OFF料金（期限なし・常設） ──────────────
  FIRST_TIME_PRICES: BASE_FIRST_TIME_PRICES,
  TRAINING_FIRST_PRICES: BASE_TRAINING_FIRST_PRICES,

  // ─── 初回限定メニューID一覧（FIRST_TIME_PRICES系を使うID） ──
  FIRST_TIME_MENU_IDS: new Set(['oil_first', 'seitai_first', 'training_first']),

  // ─── /api/menus のレスポンス表示順 ──────────────────────
  MENU_DISPLAY_ORDER: ['oil', 'seitai', 'training', 'training_early', 'oil_first', 'seitai_first', 'training_first'],

  // ─── 営業時間 ────────────────────────────────────────────
  BUSINESS_START:          10 * 60,  // 10:00 (分換算) ── マッサージ
  TRAINING_BUSINESS_START:  6 * 60,  //  6:00 (分換算) ── トレーニング
  BUSINESS_END:            23 * 60,  // 23:00 (閉店時刻 = 施術終了の上限)
  SLOT_INTERVAL:           30,        // 30分刻み

  // ─── トレーニングメニュー ──────────────────────────────────
  TRAINING_MENUS: {
    training: 'パーソナルトレーニング',
    training_early: '早朝パーソナル(6時〜9時スタート)',
    training_first: '初回パーソナルトレーニング(1000円OFF)',
  },

  // ─── トレーニング料金 ──────────────────────────────────────
  get TRAINING_PRICES() {
    return applyCampaign(BASE_TRAINING_PRICES);
  },

  // ─── トレーニングメニューID→提供時間(分)（/api/menus 組み立て用） ──
  TRAINING_MENU_DURATIONS: {
    training: [60, 90],
    training_early: [50, 80],
    training_first: [60, 90],
  },

  // ─── メニューID別の最終予約開始時刻（分換算・早朝パーソナルは9:00スタートまで） ──
  TRAINING_MENU_LAST_START: {
    training_early: 9 * 60,
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
