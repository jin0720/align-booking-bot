// src/contactButtons.js - 予約したお客様との連絡手段を作るボタン付きメッセージ

/** オーナーが押すとお客様へ返信できる postback データの接頭辞 */
const OWNER_REPLY_PREFIX = 'reply_customer:';

/** オーナー通知テキストを「このお客様へ返信」ボタン付き Flex に変換 */
function withOwnerReplyButton(textMessage, customerUserId) {
  if (!customerUserId || customerUserId.startsWith('demo')) return textMessage;
  return {
    type: 'flex',
    altText: textMessage.text.split('\n')[0],
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [{ type: 'text', text: textMessage.text, size: 'sm', wrap: true }],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'button',
          action: { type: 'postback', label: '💬 このお客様へ返信', data: `${OWNER_REPLY_PREFIX}${customerUserId}` },
          style: 'secondary',
        }],
      },
    },
  };
}

/** 既存 Flex bubble の footer にオーナー返信ボタンを追加 */
function addOwnerReplyButtonToBubble(bubble, customerUserId) {
  bubble.footer.contents.push({
    type: 'button',
    action: { type: 'postback', label: '💬 このお客様へ返信', data: `${OWNER_REPLY_PREFIX}${customerUserId}` },
    style: 'secondary',
  });
  return bubble;
}

module.exports = {
  OWNER_REPLY_PREFIX,
  withOwnerReplyButton,
  addOwnerReplyButtonToBubble,
};
