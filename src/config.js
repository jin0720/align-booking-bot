// src/config.js - サロン設定 (ここを変更してカスタマイズ)
require('dotenv').config();

// ─── キャンペーン割引（1,000円OFF）終了日時 ───────────────────
// この日時（JST）以降は自動的に discounted === original（通常料金）になる
const CAMPAIGN_END = new Date('2026-08-01T00:00:00+09:00');
const isCampaignActive = (at = new Date()) => at < CAMPAIGN_END;

/** キャンペーン終了後は discounted を original に揃えて返す */
function applyCampaign(prices, at = new Date()) {
  if (isCampaignActive(at)) return prices;
  const result = {};
  for (const [key, price] of Object.entries(prices)) {
    result[key] = { ...price, discounted: price.original };
  }
  return result;
}

// ─── マッサージ/整体の定価（切替日時で自動的に新料金へ） ────────
// 2026-11-15 00:00 (JST) 以降は新料金。手動での切替・再デプロイは不要。
// 予約の料金は予約確定時に スプレッドシートJ列 へ保存されるため、切替前に確定した予約の料金は変わらない。
const PRICE_CHANGE_AT = new Date('2026-11-15T00:00:00+09:00');

const MASSAGE_LIST_PRICES_OLD = { 70: 10000, 100: 13000, 130: 16000, 160: 19000 };
const MASSAGE_LIST_PRICES_NEW = { 70: 10000, 100: 14000, 130: 18000, 160: 22000 };

/** 指定時点の定価表 { 70: 10000, ... } */
function massageListPrices(at = new Date()) {
  return at < PRICE_CHANGE_AT ? MASSAGE_LIST_PRICES_OLD : MASSAGE_LIST_PRICES_NEW;
}

/** 通常料金テーブル（キャンペーン割引は別途 applyCampaign で適用） */
function basePrices(at = new Date()) {
  const result = {};
  for (const [d, original] of Object.entries(massageListPrices(at))) {
    result[d] = { original, discounted: original - 1000, label: `${d}分` };
  }
  return result;
}

/** 初回限定: 定価から1,000円OFF（常設） */
function firstTimePrices(at = new Date()) {
  return basePrices(at);
}

const BASE_TRAINING_PRICES = {
  50: { original: 7000,  discounted: 7000,  label: '50分' },
  80: { original: 10000, discounted: 10000, label: '80分' },
  60: { original: 10000, discounted: 9000,  label: '60分' },
  90: { original: 13000, discounted: 12000, label: '90分' },
};

// ─── 初回限定1,000円OFF（常設・期限なし） ──────────────────────
const BASE_TRAINING_FIRST_PRICES = {
  60: { original: 10000, discounted: 8000,  label: '60分' },
  90: { original: 13000, discounted: 11000, label: '90分' },
};

// ─── メニュー ───────────────────────────────────────────
const MENUS = {
  oil: 'オイルマッサージ',
  seitai: '整体',
  oil_first: '初回オイルマッサージ(1000円OFF)',
  seitai_first: '初回整体(1000円OFF)',
};

// ─── トレーニングメニュー ──────────────────────────────────
const TRAINING_MENUS = {
  training: 'パーソナルトレーニング',
  training_early: '早朝パーソナル(6時〜9時スタート)',
  training_first: '初回パーソナルトレーニング(2000円OFF)',
};

// ─── 初回限定メニューID一覧（FIRST_TIME_PRICES系を使うID） ──
const FIRST_TIME_MENU_IDS = new Set(['oil_first', 'seitai_first', 'training_first']);

/** メニューID・時間(分)から正しい価格テーブルを引く（マッサージ/トレーニング・初回限定を自動判定） */
function getPrice(menuId, duration, at = new Date()) {
  const isTraining = !!TRAINING_MENUS[menuId];
  const isFirstTime = FIRST_TIME_MENU_IDS.has(menuId);
  const table = isFirstTime
    ? (isTraining ? BASE_TRAINING_FIRST_PRICES : firstTimePrices(at))
    : (isTraining ? applyCampaign(BASE_TRAINING_PRICES, at) : applyCampaign(basePrices(at), at));
  return table[duration];
}

module.exports = {
  // ─── メニュー ───────────────────────────────────────────
  MENUS,

  // ─── 料金（定価・割引後） ────────────────────────────────
  // アクセスするたびに現在時刻でキャンペーン判定を行う（要 = getter）
  get PRICES() {
    return applyCampaign(basePrices());
  },

  // ─── 初回限定1,000円OFF料金（期限なし・常設） ──────────────
  get FIRST_TIME_PRICES() {
    return firstTimePrices();
  },
  TRAINING_FIRST_PRICES: BASE_TRAINING_FIRST_PRICES,

  // ─── 初回限定メニューID一覧（FIRST_TIME_PRICES系を使うID） ──
  FIRST_TIME_MENU_IDS,

  // ─── メニューID・時間からその組み合わせの正しい価格を返す ──
  getPrice,
  PRICE_CHANGE_AT,

  // ─── /api/menus のレスポンス表示順 ──────────────────────
  MENU_DISPLAY_ORDER: ['oil', 'seitai', 'training', 'training_early', 'oil_first', 'seitai_first', 'training_first'],

  // ─── 営業時間 ────────────────────────────────────────────
  BUSINESS_START:          10 * 60,  // 10:00 (分換算) ── マッサージ
  TRAINING_BUSINESS_START:  6 * 60,  //  6:00 (分換算) ── トレーニング
  BUSINESS_END:            23 * 60,  // 23:00 (閉店時刻 = 施術終了の上限)
  SLOT_INTERVAL:           30,        // 30分刻み

  // ─── トレーニングメニュー ──────────────────────────────────
  TRAINING_MENUS,

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
