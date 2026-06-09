// src/sheetsService.js - Google Sheets & Calendar 予約データ管理
const { google } = require('googleapis');
const config = require('./config');
const { timeToMinutes, minutesToTime } = require('./utils');

let _auth = null;
let _sheets = null;
let _calendar = null;

/** Google Auth クライアントを返す */
async function getAuth() {
  if (_auth) return _auth;
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  _auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ],
  });
  return _auth;
}

/** Google Sheets クライアント */
async function getSheets() {
  if (_sheets) return _sheets;
  const auth = await getAuth();
  _sheets = google.sheets({ version: 'v4', auth });
  return _sheets;
}

/** Google Calendar クライアント */
async function getCalendar() {
  if (_calendar) return _calendar;
  const auth = await getAuth();
  _calendar = google.calendar({ version: 'v3', auth });
  return _calendar;
}

/** Googleカレンダーから予定を取得 */
async function getCalendarEvents(dateStr) {
  if (!config.CALENDAR_ID) {
    console.log('⚠️ CALENDAR_ID が設定されていません。スキップします。');
    return [];
  }
  console.log(`🔍 カレンダー確認中: ${dateStr}`);
  try {
    const calendar = await getCalendar();
    const timeMin = `${dateStr}T00:00:00+09:00`;
    const timeMax = `${dateStr}T23:59:59+09:00`;

    const res = await calendar.events.list({
      calendarId: config.CALENDAR_ID,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      timeZone: 'Asia/Tokyo',
      maxResults: 100, // 多すぎると重くなるため制限
    }, {
      timeout: 10000, // 10秒でタイムアウト
    });

    const events = res.data.items || [];
    console.log(`✅ [getCalendarEvents] ${dateStr} のカレンダーから ${events.length} 件取得しました。`);

    if (dateStr === '2026-04-30') {
      // 4/30の問題調査のため、生データをログ出力
      console.log('📝 [DEBUG 4/30] Raw Events:', JSON.stringify(events.map(e => ({
        summary: e.summary,
        start: e.start,
        end: e.end,
        status: e.status
      }))));
    }

    return events.map(e => {
      try {
        let start, end;
        if (e.start.dateTime) {
          const startDate = new Date(e.start.dateTime);
          const endDate   = new Date(e.end.dateTime);
          
          if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            console.warn(`⚠️ [getCalendarEvents] 無効な日時イベントをスキップ: ${e.summary}`);
            return null;
          }

          const getJSTTime = (date) => {
            const parts = new Intl.DateTimeFormat('ja-JP', {
              timeZone: 'Asia/Tokyo',
              hour: 'numeric', minute: 'numeric', hour12: false
            }).formatToParts(date);
            let h = 0, m = 0;
            for (const part of parts) {
              if (part.type === 'hour') h = parseInt(part.value);
              if (part.type === 'minute') m = parseInt(part.value);
            }
            return h * 60 + m;
          };

          start = getJSTTime(startDate);
          end   = getJSTTime(endDate);
        } else if (e.start.date) {
          // 終日予定
          start = 0;
          end   = 1440;
        } else {
          return null;
        }
        
        return { start, end, summary: e.summary };
      } catch (err) {
        console.error(`⚠️ [getCalendarEvents] イベント処理中にエラー (スキップ):`, err.message);
        return null;
      }
    }).filter(e => e !== null);
  } catch (err) {
    console.error(`❌ [getCalendarEvents] カレンダー取得失敗 (${dateStr}):`, err.message);
    // 権限エラーやネットワークエラーでも空のリストを返して処理は止めない
    return [];
  }
}

/** シートにヘッダー行作成 */
async function ensureHeaders() {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.SPREADSHEET_ID,
    range: `${config.SHEET_NAME}!A1:J1`,
  });
  const headerRow = res.data.values?.[0] || [];
  if (!headerRow[0]) {
    // 新規シート: 全ヘッダーを書き込む
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.SPREADSHEET_ID,
      range: `${config.SHEET_NAME}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['日付', '開始時間', '終了時間', 'メニュー', '時間（分）', 'お名前', 'LINE UserID', '予約日時', 'ステータス', '料金']],
      },
    });
  } else if (!headerRow[9]) {
    // 既存シートにJ1（料金）だけ追加
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.SPREADSHEET_ID,
      range: `${config.SHEET_NAME}!J1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['料金']],
      },
    });
  }
}

/** 指定日の既存予約を取得 */
async function getReservationsForDate(dateStr) {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.SPREADSHEET_ID,
    range: `${config.SHEET_NAME}!A:I`,
  });
  const rows = res.data.values || [];
  return rows.slice(1).filter(row => row[0] === dateStr && row[8] === '確定');
}

/** "10:00" / "24:00" / "24:00:00"(Sheets秒付き) を分換算整数に変換。無効値は null */
function parseSettingTime(str) {
  if (!str || typeof str !== 'string') return null;
  // Sheets は時刻セルを "HH:MM:SS" で返すことがあるため秒部分を除去
  const normalized = str.trim().replace(/^(\d{1,2}:\d{2}):\d{2}$/, '$1');
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const min = parseInt(match[2]);
  if (min < 0 || min >= 60) return null;
  return parseInt(match[1]) * 60 + min;
}

/** 営業設定シートから指定日の設定を取得（日付一致→デフォルト行→ハードコード値の順） */
async function getDaySettings(dateStr) {
  const DEFAULTS = {
    businessStart:     config.BUSINESS_START,
    businessEnd:       config.BUSINESS_END,
    lastStartOverride: null,
    leadTime:          60,
  };
  try {
    const sheets = await getSheets();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.SPREADSHEET_ID,
      range: `${config.SETTINGS_SHEET_NAME}!A:E`,
    });
    const rows = (res.data.values || []).slice(1);

    // Sheets が日付セルを "2026/6/3" 等に変換する場合を正規化
    const normalizeKey = (k) => {
      const m = k.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
      return m ? `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}` : k;
    };

    let dateRow = null;
    let defaultRow = null;
    for (const row of rows) {
      const key = normalizeKey((row[0] || '').trim());
      if (key === dateStr) { dateRow = row; break; }
      if (key === 'デフォルト' || key === 'default' || key === '') defaultRow = row;
    }

    const src = dateRow || defaultRow;
    if (!src) return DEFAULTS;

    return {
      businessStart:     parseSettingTime(src[1]) ?? DEFAULTS.businessStart,
      businessEnd:       parseSettingTime(src[2]) ?? DEFAULTS.businessEnd,
      lastStartOverride: parseSettingTime(src[3] || '') ?? null,
      leadTime:          parseInt(src[4]) || DEFAULTS.leadTime,
    };
  } catch (err) {
    console.error('⚠️ [getDaySettings] 設定取得失敗、デフォルト値を使用:', err.message);
    return DEFAULTS;
  }
}

/** 空き時間を取得 */
async function getAvailableSlots(dateStr, duration) {
  const { businessStart, businessEnd, lastStartOverride, leadTime } = await getDaySettings(dateStr);
  const SLOT_INTERVAL = config.SLOT_INTERVAL;
  
  // 空き時間の判定はGoogleカレンダーを唯一のソースとする
  // (スプレッドシートはログ・記録用とし、カレンダーから削除すれば予約可能になるようにする)
  const calEvents = await getCalendarEvents(dateStr);

  const now = new Date();
  
  // JST基準での現在時刻・日付を取得
  const jstParts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: 'numeric', minute: 'numeric', hour12: false
  }).formatToParts(now);

  let y, m, d, hh, mm;
  for (const p of jstParts) {
    if (p.type === 'year') y = p.value;
    if (p.type === 'month') m = p.value;
    if (p.type === 'day') d = p.value;
    if (p.type === 'hour') hh = parseInt(p.value);
    if (p.type === 'minute') mm = parseInt(p.value);
  }
  
  const todayStr = `${y}-${m}-${d}`;
  const nowMinutes = (dateStr === todayStr) ? (hh * 60 + mm + leadTime) : 0;

  let lastStart;
  if (lastStartOverride !== null) {
    lastStart = lastStartOverride;
  } else {
    const rawLastStart = businessEnd - duration;
    lastStart = Math.ceil(rawLastStart / SLOT_INTERVAL) * SLOT_INTERVAL;
  }
  const available = [];

  for (let t = businessStart; t <= lastStart; t += SLOT_INTERVAL) {
    if (t < nowMinutes) continue;
    const slotEnd = t + duration;
    let isAvailable = true;

    // Googleカレンダー側の予約チェック
    for (const event of calEvents) {
      if (t < event.end && slotEnd > event.start) {
        isAvailable = false;
        break;
      }
    }

    if (isAvailable) available.push(minutesToTime(t));
    if (t > 24*60) {
      console.error('⛔️ 無限ループ防止: tが24時間を超えました');
      break;
    }
  }
  console.log(`📊 [getAvailableSlots] 結果: ${available.length} 件の空きスロット (${dateStr}, ${duration}分)`);
  return available;
}

/** 予約を保存 */
async function saveBooking({ date, time, menu, duration, name, userId }) {
  await ensureHeaders();
  const sheets = await getSheets();
  const startMinutes = timeToMinutes(time);
  const endMinutes   = startMinutes + parseInt(duration);

  // 深夜またぎ対応: start/end ともに 1440分(24:00)以上は翌日換算
  // toISOString() は UTC 日付を返すため JST がズレる → ローカル日付演算で計算
  const shiftDay = (dateStr) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const next = new Date(y, m - 1, d + 1);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
  };

  const calStartDateStr = startMinutes >= 1440 ? shiftDay(date) : date;
  const calStartTime    = startMinutes >= 1440 ? minutesToTime(startMinutes - 1440) : time;

  let calEndDateStr, calEndMinutes, endTimeDisplay;
  if (endMinutes >= 1440) {
    calEndDateStr   = shiftDay(date);
    calEndMinutes   = endMinutes - 1440;
    endTimeDisplay  = `翌${minutesToTime(calEndMinutes)}`;
  } else {
    calEndDateStr   = date;
    calEndMinutes   = endMinutes;
    endTimeDisplay  = minutesToTime(endMinutes);
  }

  const menuName   = config.MENUS[menu] || menu;
  const now        = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  const price      = config.PRICES[parseInt(duration)]?.discounted ?? '';

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.SPREADSHEET_ID,
    range: `${config.SHEET_NAME}!A:J`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[date, time, endTimeDisplay, menuName, duration, name, userId, now, '確定', price]],
    },
  });

  // Googleカレンダーに自動追加
  try {
    const calendar = await getCalendar();
    await calendar.events.insert({
      calendarId: config.CALENDAR_ID,
      requestBody: {
        summary: `【LINE予約】${name}様 (${menuName})`,
        description: `LINEからの予約です。\nお名前: ${name}様\n時間: ${duration}分`,
        start: { dateTime: `${calStartDateStr}T${calStartTime}:00+09:00`, timeZone: 'Asia/Tokyo' },
        end:   { dateTime: `${calEndDateStr}T${minutesToTime(calEndMinutes)}:00+09:00`, timeZone: 'Asia/Tokyo' },
      },
    });
  } catch (err) {
    console.error('⚠️ カレンダー追加失敗:', err.message);
  }

  return endTimeDisplay;
}

/** ユーザーの未来の予約を取得 */
async function getUserReservations(userId) {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.SPREADSHEET_ID,
    range: `${config.SHEET_NAME}!A:I`,
  });
  const rows = res.data.values || [];
  // 現在時刻 (JST)
  const now = new Date();
  const jstNowStr = now.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  const jstNow = new Date(jstNowStr);
  
  return rows.slice(1).map((row, index) => {
    if (!row || row.length < 9) return null;
    return {
      rowIndex: index + 2,
      date: row[0],
      time: row[1],
      endTime: row[2],
      menu: row[3],
      duration: row[4],
      name: row[5],
      userId: String(row[6]).trim(),
      status: row[8],
    };
  }).filter(r => {
    if (!r) return false;
    if (r.userId !== String(userId).trim() || r.status !== '確定') return false;

    // 過去の予約を除外
    try {
      const [y, m, d] = r.date.split('-').map(Number);
      const [hh, mm] = r.time.split(':').map(Number);
      const resDate = new Date(y, m - 1, d, hh, mm);
      // 開始時間から1時間たったものは非表示にする（あるいは厳密に現在時刻以降）
      // ここでは厳密に「現在時刻よりも開始時間が後」のものだけを表示
      return resDate >= jstNow;
    } catch (e) {
      return false; // 日付形式エラーなどは除外
    }
  });
}

/** 予約をキャンセル */
async function cancelBooking({ rowIndex, date, time, name }) {
  const sheets = await getSheets();
  
  // 1. スプレッドシートのステータスを更新
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.SPREADSHEET_ID,
    range: `${config.SHEET_NAME}!I${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [['キャンセル']],
    },
  });

  // 2. Googleカレンダーから削除
  try {
    const calendar = await getCalendar();
    // 当日全体を検索（1秒窓やqパラメータは不安定なため、getCalendarEventsと同じ方式）
    const timeMin = `${date}T00:00:00+09:00`;
    const timeMax = `${date}T23:59:59+09:00`;

    const res = await calendar.events.list({
      calendarId: config.CALENDAR_ID,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = res.data.items || [];
    console.log(`🔍 [cancelBooking] ${date} のカレンダーイベント ${events.length} 件を検索中 (対象: ${time} ${name}様)`);
    events.forEach(e => {
      console.log(`  - summary: "${e.summary}" start: "${e.start?.dateTime || e.start?.date}"`);
    });

    // Google CalendarはUTC(Z)で返すことがあるのでJSTに変換して比較
    const toJSTStr = (dt) => {
      const d = new Date(dt);
      return d.toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }).replace(' ', 'T').substring(0, 16);
    };
    // HH:MM:SS 形式の場合は HH:MM に正規化（toJSTStr は16文字返すため）
    const normalizedTime = time.substring(0, 5);
    const expectedStart = `${date}T${normalizedTime}`;
    const targetEvent = events.find(e =>
      e.summary && e.summary.includes(name) &&
      e.start && e.start.dateTime &&
      toJSTStr(e.start.dateTime) === expectedStart
    );

    if (targetEvent) {
      await calendar.events.delete({
        calendarId: config.CALENDAR_ID,
        eventId: targetEvent.id,
      });
      console.log(`✅ カレンダーイベント削除完了: "${targetEvent.summary}" (${targetEvent.id})`);
    } else {
      console.warn(`⚠️ キャンセル対象のカレンダーイベントが見つかりませんでした。expectedStart="${expectedStart}", name="${name}"`);
    }
  } catch (err) {
    console.error('⚠️ カレンダー削除失敗:', err.message);
  }
}

/** シートID（gid）を取得 */
async function getSheetId() {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.get({
    spreadsheetId: config.SPREADSHEET_ID,
  });
  const sheet = res.data.sheets.find(
    s => s.properties.title === config.SHEET_NAME
  );
  if (!sheet) throw new Error(`シート "${config.SHEET_NAME}" が見つかりません`);
  return sheet.properties.sheetId;
}

/** キャンセル済み予約行をスプレッドシートから削除 */
async function deleteCancelledRows() {
  try {
    const sheets = await getSheets();
    const sheetId = await getSheetId();

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.SPREADSHEET_ID,
      range: `${config.SHEET_NAME}!A:I`,
    });
    const rows = res.data.values || [];

    const cancelledIndices = [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i]?.[8] === 'キャンセル') cancelledIndices.push(i);
    }
    if (cancelledIndices.length === 0) {
      console.log('🗑️ 削除対象のキャンセル済み予約はありません');
      return;
    }

    cancelledIndices.sort((a, b) => b - a);

    const requests = cancelledIndices.map(rowIndex => ({
      deleteDimension: {
        range: {
          sheetId,
          dimension: 'ROWS',
          startIndex: rowIndex,
          endIndex: rowIndex + 1,
        },
      },
    }));

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: config.SPREADSHEET_ID,
      requestBody: { requests },
    });
    console.log(`🗑️ キャンセル済み予約 ${cancelledIndices.length} 件を削除しました`);
  } catch (err) {
    console.error('❌ [deleteCancelledRows] 失敗:', err.message);
  }
}

/** 既存予約のJ列（料金）が空の行に料金を遡及設定 */
async function backfillPrices() {
  try {
    const sheets = await getSheets();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.SPREADSHEET_ID,
      range: `${config.SHEET_NAME}!A:J`,
    });
    const rows = res.data.values || [];

    const updates = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const duration = parseInt(row[4]);
      const price = row[9];
      if ((price == null || price === '') && config.PRICES[duration]?.discounted != null) {
        updates.push({
          range: `${config.SHEET_NAME}!J${i + 1}`,
          values: [[config.PRICES[duration].discounted]],
        });
      }
    }
    if (updates.length === 0) {
      console.log('💰 バックフィル対象なし（全行設定済み）');
      return;
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: config.SPREADSHEET_ID,
      requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
    });
    console.log(`💰 料金バックフィル完了: ${updates.length} 件更新`);
  } catch (err) {
    console.error('❌ [backfillPrices] 失敗:', err.message);
  }
}

/** 「目標設定シート」がなければ作成してヘッダーを追加 */
async function ensureGoalSheet() {
  try {
    const sheets = await getSheets();
    const GOAL_SHEET = '目標設定シート';

    const res = await sheets.spreadsheets.get({
      spreadsheetId: config.SPREADSHEET_ID,
    });
    const exists = res.data.sheets.some(
      s => s.properties.title === GOAL_SHEET
    );

    if (!exists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: config.SPREADSHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: GOAL_SHEET } } }],
        },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: config.SPREADSHEET_ID,
        range: `${GOAL_SHEET}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['月', '月間目標金額']] },
      });
      console.log('✅ 目標設定シートを作成しました');
    }
  } catch (err) {
    console.error('❌ [ensureGoalSheet] 失敗:', err.message);
  }
}

// 同一スロットへの同時予約を直列化するキュー
const slotQueues = new Map();

function withSlotQueue(key, fn) {
  const prev = slotQueues.get(key) ?? Promise.resolve();
  const current = prev.then(() => fn());
  const silent = current.catch(() => {});
  slotQueues.set(key, silent);
  silent.then(() => {
    if (slotQueues.get(key) === silent) slotQueues.delete(key);
  });
  return current;
}

// 空き確認→保存をアトミックに実行。埋まっている場合は err.code === 'SLOT_TAKEN' をスロー。
async function saveBookingIfAvailable({ date, time, menu, duration, name, userId }) {
  const slotKey = `${date}_${time}`;
  return withSlotQueue(slotKey, async () => {
    const availableSlots = await getAvailableSlots(date, parseInt(duration));
    if (!availableSlots.includes(time)) {
      const err = new Error('この時間はすでに埋まってしまいました。別の時間をお選びください。');
      err.code = 'SLOT_TAKEN';
      err.availableSlots = availableSlots;
      throw err;
    }
    return saveBooking({ date, time, menu, duration, name, userId });
  });
}

// ────────────────────────────────────────────────────────────────
// トレーニング予約専用シート操作
// ────────────────────────────────────────────────────────────────

/** トレーニングシートにヘッダー行作成（なければ） */
async function ensureTrainingHeaders() {
  const sheets = await getSheets();
  const spreadsheetMeta = await sheets.spreadsheets.get({
    spreadsheetId: config.SPREADSHEET_ID,
  });
  const sheetExists = spreadsheetMeta.data.sheets.some(
    s => s.properties.title === config.TRAINING_SHEET_NAME
  );
  if (!sheetExists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: config.SPREADSHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: config.TRAINING_SHEET_NAME } } }],
      },
    });
  }
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.SPREADSHEET_ID,
    range: `${config.TRAINING_SHEET_NAME}!A1:L1`,
  });
  if (!res.data.values?.[0]?.[0]) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.SPREADSHEET_ID,
      range: `${config.TRAINING_SHEET_NAME}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['日付', '開始時間', '終了時間', 'メニュー', '時間（分）', 'お名前', 'LINE UserID', '予約日時', 'ステータス', '料金', '目標', 'ジム']],
      },
    });
  }
}

/** トレーニング仮予約を保存（ステータス: 仮予約）。rowIndex を返す */
async function saveTrainingBooking({ date, time, menu, duration, name, userId, goals = [] }) {
  await ensureTrainingHeaders();
  const sheets = await getSheets();
  const endMinutes = timeToMinutes(time) + parseInt(duration);
  const endTime    = minutesToTime(endMinutes);
  const menuName   = config.TRAINING_MENUS[menu] || menu;
  const now        = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  const price      = config.TRAINING_PRICES[parseInt(duration)]?.discounted ?? '';
  const goalsStr   = goals.join('、');

  const appendRes = await sheets.spreadsheets.values.append({
    spreadsheetId: config.SPREADSHEET_ID,
    range: `${config.TRAINING_SHEET_NAME}!A:K`,
    valueInputOption: 'USER_ENTERED',
    includeValuesInResponse: true,
    requestBody: {
      values: [[date, time, endTime, menuName, duration, name, userId, now, '仮予約', price, goalsStr]],
    },
  });

  // 追加された行番号を取得
  const updatedRange = appendRes.data.updates?.updatedRange || '';
  const match = updatedRange.match(/(\d+)$/);
  const rowIndex = match ? parseInt(match[1]) : null;

  return { endTime, rowIndex };
}

/** トレーニング予約確定時にL列へジム名を記録 */
async function updateTrainingGym(rowIndex, gymName) {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.SPREADSHEET_ID,
    range: `${config.TRAINING_SHEET_NAME}!L${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[gymName]] },
  });
}

/** トレーニング予約のステータスを更新 */
async function updateTrainingBookingStatus(rowIndex, status) {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.SPREADSHEET_ID,
    range: `${config.TRAINING_SHEET_NAME}!I${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[status]] },
  });
}

/** トレーニング予約1件を取得（rowIndex は Sheets の実際の行番号） */
async function getTrainingBookingByRow(rowIndex) {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.SPREADSHEET_ID,
    range: `${config.TRAINING_SHEET_NAME}!A${rowIndex}:K${rowIndex}`,
  });
  const row = res.data.values?.[0];
  if (!row) return null;
  return {
    rowIndex,
    date:     row[0],
    time:     row[1],
    endTime:  row[2],
    menu:     row[3],
    duration: row[4],
    name:     row[5],
    userId:   row[6],
    status:   row[8],
    price:    row[9],
    goals:    row[10],
  };
}

/** トレーニング予約確定時にGoogleカレンダーへイベントを追加 */
async function createTrainingCalendarEvent({ date, time, endTime, name, duration }) {
  try {
    const calendar = await getCalendar();
    await calendar.events.insert({
      calendarId: config.CALENDAR_ID,
      requestBody: {
        summary: `【トレーニング予約】${name}様`,
        description: `パーソナルトレーニング ${duration}分`,
        start: { dateTime: `${date}T${time}:00+09:00`, timeZone: 'Asia/Tokyo' },
        end:   { dateTime: `${date}T${endTime}:00+09:00`, timeZone: 'Asia/Tokyo' },
      },
    });
  } catch (err) {
    console.error('⚠️ トレーニングカレンダー追加失敗:', err.message);
  }
}

/** ユーザーのトレーニング予約一覧を取得（仮予約・確定のみ、未来分） */
async function getUserTrainingReservations(userId) {
  const sheets = await getSheets();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.SPREADSHEET_ID,
      range: `${config.TRAINING_SHEET_NAME}!A:K`,
    });
    const rows = res.data.values || [];
    const now = new Date();

    return rows.slice(1).map((row, index) => {
      if (!row || row.length < 9) return null;
      return {
        rowIndex: index + 2,
        date:     row[0],
        time:     row[1],
        endTime:  row[2],
        menu:     row[3],
        duration: row[4],
        name:     row[5],
        userId:   String(row[6]).trim(),
        status:   row[8],
        goals:    row[10] || '',
      };
    }).filter(r => {
      if (!r) return false;
      if (r.userId !== String(userId).trim()) return false;
      if (!['仮予約', '確定'].includes(r.status)) return false;
      try {
        const [y, m, d] = r.date.split('-').map(Number);
        const [hh, mm] = r.time.split(':').map(Number);
        return new Date(y, m - 1, d, hh, mm) >= now;
      } catch { return false; }
    });
  } catch (err) {
    console.error('❌ [getUserTrainingReservations] 失敗:', err.message);
    return [];
  }
}

/** 月次売上レポートを生成（yearMonth: "2026-05" 形式） */
async function getMonthlySalesReport(yearMonth) {
  const sheets = await getSheets();
  const calendar = await getCalendar();

  // マッサージ予約シート
  const massageRes = await sheets.spreadsheets.values.get({
    spreadsheetId: config.SPREADSHEET_ID,
    range: `${config.SHEET_NAME}!A:J`,
  });
  const massageRows = (massageRes.data.values || []).slice(1);
  const massageBookings = massageRows
    .filter(r => r[0]?.startsWith(yearMonth) && r[8] === '確定')
    .map(r => ({
      date: r[0], time: r[1], endTime: r[2],
      menu: r[3], duration: r[4], name: r[5],
      status: r[8], price: parseInt(r[9]) || 0,
    }));

  // トレーニング予約シート
  let trainingBookings = [];
  try {
    const trainingRes = await sheets.spreadsheets.values.get({
      spreadsheetId: config.SPREADSHEET_ID,
      range: `${config.TRAINING_SHEET_NAME}!A:J`,
    });
    trainingBookings = (trainingRes.data.values || []).slice(1)
      .filter(r => r[0]?.startsWith(yearMonth) && r[8] === '確定')
      .map(r => ({
        date: r[0], time: r[1], endTime: r[2],
        menu: r[3], duration: r[4], name: r[5],
        status: r[8], price: parseInt(r[9]) || 0,
      }));
  } catch (_) {}

  // Googleカレンダー
  const [y, m] = yearMonth.split('-');
  const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
  const calRes = await calendar.events.list({
    calendarId: config.CALENDAR_ID,
    timeMin: `${yearMonth}-01T00:00:00+09:00`,
    timeMax: `${yearMonth}-${String(lastDay).padStart(2,'0')}T23:59:59+09:00`,
    singleEvents: true,
    orderBy: 'startTime',
    timeZone: 'Asia/Tokyo',
    maxResults: 500,
  });
  const calEvents = (calRes.data.items || []).filter(e => e.status !== 'cancelled' && e.start?.dateTime);

  const toJSTStr = (dt) => {
    const d = new Date(dt);
    return d.toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }).replace(' ', 'T').substring(0, 16);
  };

  const sheetKeys = new Set(
    [...massageBookings, ...trainingBookings].map(b => `${b.date}_${b.time}`)
  );

  const calendarOnly = calEvents
    .map(e => {
      const jst = toJSTStr(e.start.dateTime);
      return { date: jst.substring(0,10), time: jst.substring(11,16), summary: e.summary };
    })
    .filter(e => !sheetKeys.has(`${e.date}_${e.time}`));

  return { massageBookings, trainingBookings, calendarOnly };
}

module.exports = {
  getAvailableSlots, saveBooking, saveBookingIfAvailable, ensureHeaders,
  getUserReservations, cancelBooking, deleteCancelledRows, backfillPrices, ensureGoalSheet,
  saveTrainingBooking, updateTrainingBookingStatus, updateTrainingGym, createTrainingCalendarEvent,
  getTrainingBookingByRow, getUserTrainingReservations, getMonthlySalesReport,
  getDaySettings,
};
