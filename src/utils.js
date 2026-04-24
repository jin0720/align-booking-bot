// src/utils.js - 日時処理などの共通ユーティリティ

/**
 * "HH:mm" 形式の時刻 → 分（数値）に変換
 * 例: "10:30" → 630
 */
function timeToMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * 分（数値）→ "HH:mm" 形式に変換
 * 例: 630 → "10:30"
 */
function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Dateオブジェクト → "YYYY-MM-DD" 形式 (内部管理用)
 */
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * "YYYY-MM-DD" → "M月D日(曜)" 形式 (表示用)
 * 例: "2026-05-01" → "5月1日(金)"
 */
function formatDateJP(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return `${m}月${d}日(${days[date.getDay()]})`;
}

/**
 * ユーザー入力 → "YYYY-MM-DD" に変換 (パース失敗時は null)
 * 対応形式: "5/10", "5月10日", "明日", "明後日"
 */
function parseDate(input) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const str = input.trim();

  // 明日 / あした
  if (['明日', 'あした'].includes(str)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return formatDate(d);
  }

  // 明後日 / あさって
  if (['明後日', 'あさって'].includes(str)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 2);
    return formatDate(d);
  }

  // "5/10", "5-10", "5月10日"
  const match = str.match(/^(\d{1,2})[\/\-月](\d{1,2})/);
  if (match) {
    const month = parseInt(match[1]);
    const day = parseInt(match[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    let date = new Date(currentYear, month - 1, day);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // 過去日の場合は翌年にする
    if (date < todayStart) {
      date = new Date(currentYear + 1, month - 1, day);
    }
    return formatDate(date);
  }

  return null;
}

/**
 * ユーザー入力の時刻 → "HH:mm" に変換 (パース失敗時は null)
 * 対応形式: "10:30", "10時30分", "10時", "1030"
 */
function parseTime(input) {
  const str = input.trim();

  // "10:30" or "10:00"
  const m1 = str.match(/^(\d{1,2}):(\d{2})$/);
  if (m1) return `${m1[1].padStart(2, '0')}:${m1[2]}`;

  // "10時30分" or "10時30"
  const m2 = str.match(/^(\d{1,2})時(\d{2})分?$/);
  if (m2) return `${m2[1].padStart(2, '0')}:${m2[2]}`;

  // "10時"
  const m3 = str.match(/^(\d{1,2})時$/);
  if (m3) return `${m3[1].padStart(2, '0')}:00`;

  // "1030" (4桁)
  const m4 = str.match(/^(\d{2})(\d{2})$/);
  if (m4) return `${m4[1]}:${m4[2]}`;

  return null;
}

/**
 * 空き時間スロット一覧 → 表示用テキスト (午前/午後/夜 に分類)
 */
function formatSlotsText(slots, dateStr, menuName, duration) {
  if (slots.length === 0) {
    return (
      `😢 ${formatDateJP(dateStr)} は ${duration}分コースの空き時間がありません。\n\n` +
      `別の日付をお試しください。\n（「5/15」のように入力してください）`
    );
  }

  const morning   = slots.filter(s => timeToMinutes(s) < 13 * 60);  // 〜12:59
  const afternoon = slots.filter(s => { const t = timeToMinutes(s); return t >= 13 * 60 && t < 18 * 60; }); // 13〜17:59
  const evening   = slots.filter(s => timeToMinutes(s) >= 18 * 60); // 18〜

  let text = `📅 ${formatDateJP(dateStr)} の空き時間\n┈┈┈┈┈┈┈┈┈┈┈┈┈\n${menuName} / ${duration}分コース\n\n`;

  if (morning.length > 0)   text += `🌅 午前\n  ${morning.join('  ')}\n\n`;
  if (afternoon.length > 0) text += `☀️ 午後\n  ${afternoon.join('  ')}\n\n`;
  if (evening.length > 0)   text += `🌙 夜\n  ${evening.join('  ')}\n\n`;

  text += `ご希望の時間を入力してください\n（例：「14:30」）\n\n「他の日付」と送ると日付を選び直せます`;
  return text;
}

module.exports = {
  timeToMinutes,
  minutesToTime,
  formatDate,
  formatDateJP,
  parseDate,
  parseTime,
  formatSlotsText,
};
