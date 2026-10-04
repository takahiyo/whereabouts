/** 外観選択の定義。依存: なし。参照元: services/appearance、board、外観試験。色の正はappearance.css。 */
const APPEARANCE_PRESETS = Object.freeze([
  { id: 'pastel', label: 'パステル', description: '柔らかな青緑と、明るいカード' },
  { id: 'classic', label: 'クラシック', description: '落ち着いた紺と、温かいアイボリー' },
  { id: 'metallic', label: 'メタリック', description: '銀色の面と、端正なスチールブルー' }
]);
const APPEARANCE_UI = Object.freeze({
  defaultPreset: 'pastel', attribute: 'appearance', groupAccentCount: 6,
  dialog: 'appearanceDialog', open: 'appearanceBtn', close: 'appearanceClose', choices: 'appearanceChoices',
  selects: '[data-appearance-select]', messages: '[data-appearance-message]',
  radioName: 'appearance-preset', saved: 'このブラウザに保存しました。',
  memoryOnly: '外観を変更しました。このブラウザでは保存できないため、再読込みすると元に戻ります。'
});
