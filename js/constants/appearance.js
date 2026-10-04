/** 外観選択の定義。依存: なし。参照元: services/appearance、board、外観試験。色の正はappearance.css。 */
const APPEARANCE_PRESETS = Object.freeze([
  { id: 'pastel', label: 'パステル', description: '柔らかな青緑と、明るいカード' },
  { id: 'classic', label: 'クラシック', description: '落ち着いた紺と、温かいアイボリー' },
  { id: 'metallic', label: 'メタリック', description: '銀色の面と、端正なスチールブルー' },
  { id: 'forest', label: 'フォレスト', description: '深い緑と、木や葉を思わせる自然な色' },
  { id: 'sakura', label: 'サクラ', description: '淡い桜色と、柔らかな丸みのある面' },
  { id: 'monochrome', label: 'モノクロ', description: '白とグレー、線と文字を活かした簡潔な表示' }
]);
const APPEARANCE_UI = Object.freeze({
  defaultPreset: 'pastel', attribute: 'appearance', groupAccentCount: 6,
  dialog: 'appearanceDialog', open: 'appearanceBtn', close: 'appearanceClose', choices: 'appearanceChoices',
  messages: '[data-appearance-message]',
  radioName: 'appearance-preset', saved: 'このブラウザに保存しました。',
  memoryOnly: '外観を変更しました。このブラウザでは保存できないため、再読込みすると元に戻ります。'
});
