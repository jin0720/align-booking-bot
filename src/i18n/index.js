// src/i18n/index.js - お客様向けメッセージの日英切替
// 日本語の文言は従来の実装と同一。オーナー向け通知・シート記録は日本語のまま (このファイルでは扱わない)

const ja = require('./ja');
const en = require('./en');

const CATALOG = { ja, en };
const DEFAULT_LANG = 'ja';

/** 'ja' / 'en' 以外 (undefined 含む) は null を返す。ミニアプリから渡される lang の検証用 */
function normalizeLang(raw) {
  if (typeof raw !== 'string') return null;
  const v = raw.toLowerCase();
  if (v.startsWith('ja')) return 'ja';
  if (v.startsWith('en')) return 'en';
  return null;
}

// LINEプロフィールの言語をキャッシュ (userId → { lang, at })
const PROFILE_LANG_TTL_MS = 6 * 60 * 60 * 1000;
const profileLangCache = new Map();

/**
 * お客様の言語を決める。
 * override (ミニアプリで選ばれた言語) → LINEプロフィールの言語 (日本語以外は英語) → 日本語
 */
async function getUserLang(client, userId, override) {
  const fixed = normalizeLang(override);
  if (fixed) return fixed;
  if (!client || !userId || userId.startsWith('demo')) return DEFAULT_LANG;

  const cached = profileLangCache.get(userId);
  if (cached && Date.now() - cached.at < PROFILE_LANG_TTL_MS) return cached.lang;

  try {
    const profile = await client.getProfile(userId);
    const raw = profile && profile.language;
    if (!raw) return DEFAULT_LANG;
    const lang = raw.toLowerCase().startsWith('ja') ? 'ja' : 'en';
    profileLangCache.set(userId, { lang, at: Date.now() });
    return lang;
  } catch (err) {
    return DEFAULT_LANG;
  }
}

/** 言語ごとの文言セットを返す */
function t(lang) {
  return CATALOG[lang] || CATALOG[DEFAULT_LANG];
}

module.exports = { DEFAULT_LANG, normalizeLang, getUserLang, t };
