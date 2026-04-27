// src/bookingFlow.js
// 予約フローの状態機械 (State Machine)
// 各ユーザーの会話状態をメモリ上で管理する

const config  = require('./config');
const { getAvailableSlots, saveBooking, getUserReservations, cancelBooking } = require('./sheetsService');
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
  console.log(`🧹 [${userId}] セッションをクリア`);
  sessions.set(userId, { step: 'idle' });
}

// ────────────────────────────────────────────────────────────────
// キーワード定義
// ────────────────────────────────────────────────────────────────
const TRIGGER_KEYWORDS = ['マッサージ予約', 'マッサージ予約（自動）', 'マッサージ予約(自動)'];
const CANCEL_KEYWORDS  = ['キャンセル', 'やめる', 'やめ', 'cancel', '最初から', 'やり直し', 'リセット'];
const LIST_RESERVATIONS_KEYWORDS = ['予約表示', '予約確認', '予約一覧', '予約の確認・変更・キャンセル', '予約の確認・変更', '変更・キャンセル'];
const CANCEL_RESERVATION_KEYWORDS = ['予約キャンセル', '予約のキャンセル', 'キャンセルしたい'];

function isTriggered(text) {
  return TRIGGER_KEYWORDS.some(k => text === k);
}
function isCancelled(text) {
  return CANCEL_KEYWORDS.some(k => text.toLowerCase().includes(k));
}
function isReservationCancelTriggered(text) {
  return CANCEL_RESERVATION_KEYWORDS.some(k => text.includes(k));
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
      `※前日23時以降のキャンセルは全額を頂戴いたします。`
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

/** オーナーへキャンセル通知送信 */
async function notifyOwnerCancellation(client, reservation) {
  const ownerId = config.OWNER_LINE_USER_ID;
  if (!ownerId) return;

  const dateJP = formatDateJP(reservation.date);

  try {
    await client.pushMessage({
      to: ownerId,
      messages: [{
        type: 'text',
        text: (
          `⚠️ 予約がキャンセルされました。\n\n` +
          `👤 ${reservation.name} 様\n` +
          `📋 ${reservation.menu}\n` +
          `📅 ${dateJP}\n` +
          `🕐 ${reservation.time}〜${reservation.endTime}`
        ),
      }],
    });
    console.log(`🔔 オーナーへキャンセル通知送信完了`);
  } catch (err) {
    console.error('オーナーキャンセル通知送信失敗:', err.message);
  }
}

/** 予約キャンセル確認 Flex */
function buildReservationListMessage(reservations) {
  if (reservations.length === 0) {
    return [{
      type: 'text',
      text: '現在、確定している予約は見つかりませんでした。',
    }];
  }

  const now = new Date();
  
  const bubbles = reservations.map(r => {
    // キャンセル期限チェック (前日23時)
    const [y, m, d] = r.date.split('-').map(Number);
    const deadline = new Date(y, m - 1, d - 1);
    deadline.setHours(23, 0, 0, 0);
    
    const canCancel = now < deadline;
    const dateJP = formatDateJP(r.date);

    return {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '📅 予約内容', weight: 'bold', size: 'md', color: '#ffffff' }
        ],
        backgroundColor: '#8C7A6B'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: `${dateJP} ${r.time}〜`, weight: 'bold', size: 'sm' },
          { type: 'text', text: r.menu, size: 'xs', color: '#666666', margin: 'xs' },
          { type: 'separator', margin: 'md' },
          canCancel ? {
            type: 'button',
            action: { 
              type: 'message', 
              label: 'キャンセルする', 
              text: `キャンセル実行:${r.date}:${r.time}` 
            },
            style: 'secondary',
            height: 'sm',
            color: '#ff4b4b',
            margin: 'md'
          } : {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '※前日23時を過ぎているため、システムからのキャンセルはできません。',
                size: 'xxs',
                color: '#ff0000',
                wrap: true,
                margin: 'sm'
              },
              {
                type: 'button',
                action: { 
                  type: 'uri', 
                  label: 'LINEで相談する', 
                  uri: 'https://line.me/R/oaMessage/@align' // 実際のアカウントIDに合わせて調整が必要な場合あり
                },
                style: 'link',
                height: 'sm'
              }
            ],
            margin: 'md'
          }
        ]
      }
    };
  });

  return [
    {
      type: 'text',
      text: 'ご予約の確認・キャンセルが可能です。\n※日時の変更をご希望の場合は、現在の予約を一度キャンセルし、再度新規でご予約をお願いいたします。'
    },
    {
      type: 'flex',
      altText: '予約一覧',
      contents: {
        type: 'carousel',
        contents: bubbles.slice(0, 10) // 最大10件
      }
    }
  ];
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
  console.log(`🔄 [${userId}] 現在のステップ: ${session.step}, 受信テキスト: "${text}"`);

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

  // ── 予約キャンセル・確認開始トリガー ──────────────────────────────────
  if (isReservationCancelTriggered(text) || LIST_RESERVATIONS_KEYWORDS.some(k => text.includes(k))) {
    try {
      const reservations = await getUserReservations(userId);
      setSession(userId, { step: 'cancel_exec', userReservations: reservations });
      return buildReservationListMessage(reservations);
    } catch (err) {
      console.error('予約一覧取得失敗:', err);
      return [{ type: 'text', text: '予約情報の取得に失敗しました。' }];
    }
  }

  // ── キャンセル処理 (セッションのリセット) ──────────────────────────
  if (session.step !== 'idle' && isCancelled(text)) {
    clearSession(userId);
    return [{
      type: 'text',
      text: '🔄 操作をリセットしました。\n\n「マッサージ予約」と送ると予約を再開できます。',
    }];
  }

  // ── 日付入力の割り込み処理 (どのステップでも日付ボタンが押されたら受け付ける) ───
  if (text.startsWith('日付:')) {
    if (session.step === 'idle') {
      console.warn(`⚠️ [${userId}] セッションが idle 状態で日付が送信されました。再開を試みます。`);
      // セッションが切れているが日付が送られてきた場合、とりあえずメニュー選択に戻るよう促すか、
      // あるいはデフォルト（オイルマッサージ70分など）を想定して進めるのは危険なので、
      // ユーザーに最初からやり直すよう伝える
      return [{
        type: 'text',
        text: 'セッションがタイムアウトしたか、サーバーが再起動した可能性があります。\nお手数ですが「予約」と送って最初からやり直してください。'
      }];
    }
    session.step = 'date_input';
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
      console.log(`🔍 [${userId}] 空き時間を取得中: ${dateStr}, duration: ${session.duration}`);
      const slots = await getAvailableSlots(dateStr, session.duration);
      console.log(`✅ [${userId}] 空き時間取得完了: ${slots.length}件の枠が見つかりました`);
      
      setSession(userId, { step: 'time_select', date: dateStr, availableSlots: slots });

      const menuName = config.MENUS[session.menu] || 'メニュー';
      return [buildTimeFlexMessage(slots, dateStr, menuName, session.duration)];
    } catch (err) {
      console.error(`❌ [${userId}] 空き時間取得エラー:`, err);
      return [{ type: 'text', text: '空き時間の取得中にエラーが発生しました。しばらくしてから再度お試しください。' }];
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

  // ════════════════════════════════════════════════════════════
  // STEP: 予約キャンセル実行
  // ════════════════════════════════════════════════════════════
  if (session.step === 'cancel_exec') {
    const match = text.match(/^キャンセル実行:(\d{4}-\d{2}-\d{2}):(\d{2}:\d{2})$/);
    if (match) {
      const [, date, time] = match;
      const reservation = session.userReservations?.find(r => r.date === date && r.time === time);
      
      if (!reservation) {
        return [{ type: 'text', text: '該当する予約が見つかりませんでした。' }];
      }

      // 再度期限チェック (念のため)
      const now = new Date();
      const [y, m, d] = date.split('-').map(Number);
      const deadline = new Date(y, m - 1, d - 1);
      deadline.setHours(23, 0, 0, 0);

      if (now >= deadline) {
        return [{
          type: 'text',
          text: '申し訳ありませんが、前日23時を過ぎているためキャンセルできません。\n直接LINEでメッセージをお送りください。\nまた、規定のキャンセル料が発生いたしますのでご了承ください。'
        }];
      }

      try {
        await cancelBooking(reservation);
        
        clearSession(userId);
        notifyOwnerCancellation(client, reservation).catch(() => {});

        return [{
          type: 'text',
          text: `✅ 予約のキャンセルが完了しました。\n\n【キャンセル内容】\n📅 ${formatDateJP(date)}\n🕘 ${time}〜\n\nまたのご利用をお待ちしております。`
        }];
      } catch (err) {
        console.error('キャンセル実行失敗:', err);
        return [{ type: 'text', text: 'キャンセル処理中にエラーが発生しました。' }];
      }
    }
    return [{ type: 'text', text: 'キャンセルしたい予約をボタンから選ぶか、「リセット」と送ってください。\n※日時の変更をご希望の場合は、現在の予約を一度キャンセルし、再度ご予約をお願いいたします。' }];
  }

  return null;
}

module.exports = { handleBookingFlow };
