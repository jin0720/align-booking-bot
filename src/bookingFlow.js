// src/bookingFlow.js
// 予約フローの状態機械 (State Machine)
// 各ユーザーの会話状態をメモリ上で管理する

const config  = require('./config');
const { getAvailableSlots, saveBooking } = require('./sheetsService');
const {
  timeToMinutes, minutesToTime,
  formatDateJP, parseDate, parseTime, formatSlotsText,
} = require('./utils');

// ────────────────────────────────────────────────────────────────
// セッション管理（ユーザーごとの会話状態）
// ────────────────────────────────────────────────────────────────
const sessions = new Map();

function getSession(userId) {
  if (!sessions.has(userId)) sessions.set(userId, { step: 'idle' });
  return sessions.get(userId);
}
function setSession(userId, data) {
  sessions.set(userId, { ...getSession(userId), ...data });
}
function clearSession(userId) {
  sessions.set(userId, { step: 'idle' });
}

// ────────────────────────────────────────────────────────────────
// キーワード定義
// ────────────────────────────────────────────────────────────────
const TRIGGER_KEYWORDS = ['マッサージ予約', 'マッサージ予約（自動）', 'マッサージ予約(自動)'];
const CANCEL_KEYWORDS  = ['キャンセル', 'やめる', 'やめ', 'cancel', '最初から', 'やり直し', 'リセット'];

function isTriggered(text) {
  return TRIGGER_KEYWORDS.some(k => text === k);
}
function isCancelled(text) {
  return CANCEL_KEYWORDS.some(k => text.toLowerCase().includes(k));
}

// ────────────────────────────────────────────────────────────────
// メッセージビルダー
// ────────────────────────────────────────────────────────────────

/** ウェルカム + メニュー選択 Flex */
function buildWelcomeMessages() {
  return [
    {
      type: 'text',
      text: 'お問い合わせありがとうございます！\n\n｢リセット｣と送るといつでも最初に戻れます。',
    },
    {
      type: 'flex',
      altText: 'メニューを選択してください',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '📋 メニュー選択',
              weight: 'bold',
              size: 'lg',
              color: '#ffffff'
            }
          ],
          backgroundColor: '#8C7A6B'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: 'ご希望のメニューをお選びください',
              size: 'sm',
              color: '#666666'
            },
            {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'button',
                  action: { type: 'message', label: '💆 オイルマッサージ', text: 'メニュー:oil' },
                  style: 'primary',
                  color: '#8C7A6B',
                  margin: 'md'
                },
                {
                  type: 'button',
                  action: { type: 'message', label: '🦴 整体', text: 'メニュー:seitai' },
                  style: 'primary',
                  color: '#8C7A6B',
                  margin: 'md'
                }
              ],
              margin: 'lg'
            }
          ]
        }
      }
    }
  ];
}

/** コース選択 Flex */
function buildDurationMessage(menuName) {
  const durations = Object.entries(config.PRICES).map(([key, price]) => ({
    label: `${price.label} ${price.original.toLocaleString()}→${price.discounted.toLocaleString()}円`,
    value: key
  }));

  const rows = durations.map(d => ({
    type: 'button',
    action: { type: 'message', label: d.label, text: `時間:${d.value}` },
    style: 'primary',
    color: '#8C7A6B',
    height: 'sm',
    margin: 'md'
  }));

  return {
    type: 'flex',
    altText: 'コースを選択してください',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '⏱ コース選択', weight: 'bold', size: 'lg', color: '#ffffff' }
        ],
        backgroundColor: '#8C7A6B'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: `${menuName} を選択中`, size: 'sm', color: '#666666' },
          { type: 'box', layout: 'vertical', contents: rows, margin: 'lg' }
        ]
      }
    }
  };
}

/** 日付選択 Flex Message */
function buildDateMessage() {
  const now = new Date();
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  const dateOptions = [];

  for (let i = 0; i <= 6; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const y  = d.getFullYear();
    const m  = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${dd}`;
    const dayLabel = i === 0 ? '今日' : `${d.getMonth()+1}/${d.getDate()}(${days[d.getDay()]})`;
    dateOptions.push({ label: dayLabel, value: dateStr });
  }

  // 1行に2つボタンを並べる
  const rows = [];
  for (let i = 0; i < dateOptions.length; i += 2) {
    const chunk = dateOptions.slice(i, i + 2);
    rows.push({
      type: 'box',
      layout: 'horizontal',
      contents: chunk.map(d => ({
        type: 'button',
        action: { type: 'message', label: d.label, text: `日付:${d.value}` },
        style: 'primary',
        color: '#8C7A6B',
        height: 'sm',
        margin: 'xs'
      })),
      margin: 'md'
    });
  }

  return {
    type: 'flex',
    altText: '日付を選択してください',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '📅 日付選択', weight: 'bold', size: 'lg', color: '#ffffff' }
        ],
        backgroundColor: '#8C7A6B'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: 'ご希望の日付を選択してください', size: 'sm', color: '#666666' },
          { type: 'box', layout: 'vertical', contents: rows, margin: 'lg' }
        ]
      }
    },
    quickReply: {
      items: dateOptions.map(d => ({
        type: 'action',
        action: { type: 'message', label: d.label, text: `日付:${d.value}` }
      }))
    }
  };
}

/** 予約確認 Flex */
function buildConfirmMessage(session) {
  const menuName = config.MENUS[session.menu];
  const price    = config.PRICES[session.duration];
  const dateJP   = formatDateJP(session.date);
  const endTime  = minutesToTime(timeToMinutes(session.time) + parseInt(session.duration));

  return {
    type: 'flex',
    altText: '予約内容の確認',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '✅ 予約内容の確認', weight: 'bold', size: 'lg', color: '#ffffff' }
        ],
        backgroundColor: '#8C7A6B'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            margin: 'md',
            spacing: 'sm',
            contents: [
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'メニュー', size: 'sm', color: '#aaaaaa', flex: 2 },
                  { type: 'text', text: menuName, size: 'sm', color: '#666666', flex: 4, wrap: true }
                ]
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'コース', size: 'sm', color: '#aaaaaa', flex: 2 },
                  { type: 'text', text: `${session.duration}分`, size: 'sm', color: '#666666', flex: 4 }
                ]
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: '料金', size: 'sm', color: '#aaaaaa', flex: 2 },
                  { 
                    type: 'text', 
                    text: `¥${price.original.toLocaleString()} → ¥${price.discounted.toLocaleString()}\n(オープン記念1,000円OFF)`, 
                    size: 'sm', 
                    color: '#666666', 
                    flex: 4, 
                    weight: 'bold',
                    wrap: true
                  }
                ]
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: '日時', size: 'sm', color: '#aaaaaa', flex: 2 },
                  { type: 'text', text: `${dateJP}\n${session.time}〜${endTime}`, size: 'sm', color: '#666666', flex: 4, wrap: true }
                ]
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'お名前', size: 'sm', color: '#aaaaaa', flex: 2 },
                  { type: 'text', text: `${session.name} 様`, size: 'sm', color: '#666666', flex: 4 }
                ]
              }
            ]
          },
          {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'button',
                action: { type: 'message', label: '✅ 予約を確定する', text: '確認:yes' },
                style: 'primary',
                color: '#8C7A6B'
              },
              {
                type: 'button',
                action: { type: 'message', label: '❌ 最初からやり直す', text: '確認:no' },
                style: 'link',
                color: '#aaaaaa',
                margin: 'sm'
              }
            ],
            margin: 'xl'
          }
        ]
      }
    }
  };
}

/** 予約完了メッセージ */
function buildCompleteMessage(session, endTime) {
  const menuName = config.MENUS[session.menu];
  const price    = config.PRICES[session.duration];
  const dateJP   = formatDateJP(session.date);

  return {
    type: 'text',
    text: (
      `🎉 ご予約が完了しました！\n\n` +
      `【予約内容】\n` +
      `📋 ${menuName}\n` +
      `⏱ ${session.duration}分コース\n` +
      `💴 ¥${price.discounted.toLocaleString()}\n` +
      `📅 ${dateJP}\n` +
      `🕐 ${session.time}〜${endTime}\n` +
      `👤 ${session.name} 様\n\n` +
      `ご来店を心よりお待ちしております✨\n\n` +
      `※サロンの最寄駅は東高円寺(1番出口)から徒歩3分になります。詳細は後ほどご連絡いたしますので少々お待ちください。\n\n` +
      `【キャンセルについて】\n` +
      `前日23時まで：無料\n` +
      `それ以降（当日キャンセル）：全額\n\n` +
      `※前日23時以降のキャンセルは全額を頂戴いたします。\n\n` +
      `キャンセル・変更はこちらのLINEまでお知らせください。`
    ),
  };
}

/** 時間選択 Flex Message */
function buildTimeFlexMessage(slots, dateStr, menuName, duration) {
  if (slots.length === 0) {
    return {
      type: 'text',
      text: `😢 ${formatDateJP(dateStr)} は ${duration}分コースの空き時間がありません。\n別の日付を選択してください。`,
      quickReply: buildDateMessage().quickReply
    };
  }

  const dateJP = formatDateJP(dateStr);
  
  // 1行に3つボタンを並べる
  const rows = [];
  for (let i = 0; i < slots.length; i += 3) {
    const chunk = slots.slice(i, i + 3);
    const contents = chunk.map(time => ({
      type: 'button',
      action: {
        type: 'message',
        label: time,
        text: time
      },
      style: 'primary',
      color: '#8C7A6B', // サロンのブランドカラー
      height: 'sm',
      margin: 'xs'
    }));
    
    // 足りない分はダミーで埋めてスペース調整
    while (contents.length < 3) {
      contents.push({ type: 'spacer' });
    }

    rows.push({
      type: 'box',
      layout: 'horizontal',
      contents: contents,
      margin: 'sm'
    });
  }

  return {
    type: 'flex',
    altText: `${dateJP} の空き時間選択`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '🕘 空き時間選択',
            weight: 'bold',
            size: 'lg',
            color: '#ffffff'
          },
          {
            type: 'text',
            text: `${dateJP} / ${menuName} (${duration}分)`,
            size: 'sm',
            color: '#eeeeee',
            margin: 'xs'
          }
        ],
        backgroundColor: '#8C7A6B'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'ご希望の時間を選択してください',
            size: 'sm',
            color: '#666666',
            margin: 'md',
            wrap: true
          },
          {
            type: 'box',
            layout: 'vertical',
            contents: rows,
            margin: 'lg'
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            action: {
              type: 'message',
              label: '📅 他の日付を選択する',
              text: '他の日付'
            },
            style: 'link',
            color: '#8C7A6B'
          }
        ]
      }
    }
  };
}

/** オーナー向け通知メッセージ */
async function notifyOwner(client, session, endTime) {
  const ownerId = config.OWNER_LINE_USER_ID;
  if (!ownerId) return;

  const menuName = config.MENUS[session.menu];
  const price    = config.PRICES[session.duration];
  const dateJP   = formatDateJP(session.date);

  try {
    await client.pushMessage({
      to: ownerId,
      messages: [{
        type: 'text',
        text: (
          `🔔 新規予約が入りました！\n\n` +
          `👤 ${session.name} 様\n` +
          `📋 ${menuName}\n` +
          `⏱ ${session.duration}分コース\n` +
          `💴 ¥${price.discounted.toLocaleString()}\n` +
          `📅 ${dateJP}\n` +
          `🕐 ${session.time}〜${endTime}`
        ),
      }],
    });
    console.log(`🔔 オーナーへ通知送信完了`);
  } catch (err) {
    console.error('オーナー通知送信失敗:', err.message);
  }
}

// ────────────────────────────────────────────────────────────────
// メインフロー
// ────────────────────────────────────────────────────────────────

/**
 * ユーザーのメッセージを受け取り、返信メッセージの配列を返す
 * @param {string} userId  LINE User ID
 * @param {string} text    受信テキスト
 * @param {object} client  LINE Messaging API クライアント
 * @returns {Array|null}   送信するメッセージ配列 (null = 返信なし)
 */
async function handleBookingFlow(userId, text, client) {
  const session = getSession(userId);

  // ── IDチェック要求 (デバッグ用) ─────────────────────────────
  if (text.includes('自分のID') || text.includes('userid') || text === 'ID') {
    return [{ type: 'text', text: `あなたのLINE User IDは：\n${userId}` }];
  }

  // ── 予約開始トリガー (どこにいても最初から開始できるようにする) ───
  if (isTriggered(text)) {
    clearSession(userId);
    setSession(userId, { step: 'menu_select' });
    return buildWelcomeMessages();
  }

  // ── キャンセル処理 ───────────────────────────────────────────
  if (session.step !== 'idle' && isCancelled(text)) {
    clearSession(userId);
    return [{
      type: 'text',
      text: '🔄 予約をリセットしました。\n\n「マッサージ予約」と送ると最初からやり直せます。',
    }];
  }

  // ════════════════════════════════════════════════════════════
  // STEP: idle (トリガー以外は無視)
  // ════════════════════════════════════════════════════════════
  if (session.step === 'idle') {
    return null;
  }

  // ════════════════════════════════════════════════════════════
  // STEP: メニュー選択
  // ════════════════════════════════════════════════════════════
  if (session.step === 'menu_select') {
    const match = text.match(/^メニュー:(oil|seitai)$/);
    if (match) {
      const menu = match[1];
      setSession(userId, { step: 'duration_select', menu });
      return [buildDurationMessage(config.MENUS[menu])];
    }
    return [{ type: 'text', text: 'ボタンからメニューをお選びください。' }];
  }

  // ════════════════════════════════════════════════════════════
  // STEP: コース（時間）選択
  // ════════════════════════════════════════════════════════════
  if (session.step === 'duration_select') {
    const match = text.match(/^時間:(\d+)$/);
    if (match) {
      const duration = parseInt(match[1]);
      if (config.PRICES[duration]) {
        setSession(userId, { step: 'date_input', duration });
        return [buildDateMessage()];
      }
    }
    return [{ type: 'text', text: 'ボタンからコースをお選びください。' }];
  }

  // ════════════════════════════════════════════════════════════
  // STEP: 日付入力
  // ════════════════════════════════════════════════════════════
  if (session.step === 'date_input') {
    let dateStr = null;

    // クイックリプライからの入力: "日付:YYYY-MM-DD"
    const qrMatch = text.match(/^日付:(\d{4}-\d{2}-\d{2})$/);
    if (qrMatch) {
      dateStr = qrMatch[1];
    } else {
      dateStr = parseDate(text);
    }

    if (!dateStr) {
      return [{
        type: 'text',
        text: '日付の形式が正しくありません。\n「5月15日」や「5/15」のように入力するか、上のボタンから選択してください。',
      }];
    }

    // 過去日チェック
    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [y, m, d] = dateStr.split('-').map(Number);
    const selected  = new Date(y, m - 1, d);
    if (selected < today) {
      return [{ type: 'text', text: '過去の日付は選択できません。本日以降をお選びください。' }];
    }

    // 空き時間を取得
    try {
      const slots = await getAvailableSlots(dateStr, session.duration);
      setSession(userId, { step: 'time_select', date: dateStr, availableSlots: slots });

      const menuName = config.MENUS[session.menu];
      return [buildTimeFlexMessage(slots, dateStr, menuName, session.duration)];
    } catch (err) {
      console.error('空き時間取得エラー:', err);
      return [{ type: 'text', text: 'エラーが発生しました。しばらくしてから再度お試しください。' }];
    }
  }

  // ════════════════════════════════════════════════════════════
  // STEP: 時間帯選択（ユーザーが時刻を入力）
  // ════════════════════════════════════════════════════════════
  if (session.step === 'time_select') {
    // 「他の日付」で日付再選択
    if (text.includes('他の日付') || text.includes('別の日') || text.includes('日付を変')) {
      setSession(userId, { step: 'date_input', availableSlots: undefined, date: undefined });
      return [buildDateMessage()];
    }

    const time = parseTime(text);
    if (!time) {
      return [{ type: 'text', text: '時刻の形式が正しくありません。\n「14:30」のように入力してください。' }];
    }

    if (!session.availableSlots || !session.availableSlots.includes(time)) {
      return [{
        type: 'text',
        text: `「${time}」は空きがないか、無効な時間帯です。\nリストに表示された時間をご入力ください。`,
      }];
    }

    // 名前入力をスキップし、LINEプロフィールから名前を取得して確認へ進む
    let name = 'LINEユーザー';
    try {
      const profile = await client.getProfile(userId);
      if (profile && profile.displayName) {
        name = profile.displayName;
      }
    } catch (err) {
      console.error('LINEプロフィール取得失敗:', err.message);
    }

    setSession(userId, { step: 'confirm', time, name });
    return [buildConfirmMessage({ ...session, time, name })];
  }

  // ════════════════════════════════════════════════════════════
  // STEP: 予約確認
  // ════════════════════════════════════════════════════════════
  if (session.step === 'confirm') {
    if (text === '確認:yes') {
      try {
        const endTime = await saveBooking({
          date:     session.date,
          time:     session.time,
          menu:     session.menu,
          duration: session.duration,
          name:     session.name,
          userId,
        });

        // セッションクリア（確定前に保存）
        const savedSession = { ...session };
        clearSession(userId);

        // オーナー通知（非同期・失敗しても続行）
        notifyOwner(client, savedSession, endTime).catch(() => {});

        return [buildCompleteMessage(savedSession, endTime)];

      } catch (err) {
        console.error('予約保存エラー:', err);
        return [{
          type: 'text',
          text: '申し訳ありません、予約の保存に失敗しました。\nお手数ですが、再度「マッサージ予約」と送ってお試しください。',
        }];
      }
    }

    if (text === '確認:no') {
      clearSession(userId);
      return [{
        type: 'text',
        text: '予約をリセットしました。\n\n「マッサージ予約」と送ると最初からやり直せます。',
      }];
    }

    return [{ type: 'text', text: 'ボタンから選択してください。' }];
  }

  return null;
}

module.exports = { handleBookingFlow };
