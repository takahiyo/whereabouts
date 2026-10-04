/** 外観だけを端末に保存する。依存: constants/storage、appearance。通信・認証・共有設定を参照しない。 */
(() => {
  let selected = APPEARANCE_UI.defaultPreset;
  const dialog = document.getElementById(APPEARANCE_UI.dialog);
  const presets = new Map(APPEARANCE_PRESETS.map(preset => [preset.id, preset]));

  /** @param {string} preset 候補 @returns {string} 保存値が未知でも有効な外観だけを使う */
  function normalize(preset) { return presets.has(preset) ? preset : APPEARANCE_UI.defaultPreset; }

  /** @param {string} preset 外観 @param {boolean} persist ユーザー操作時だけ保存 @returns {void} DOMを再構築せず色を切り替える */
  function apply(preset, persist = false) {
    selected = normalize(preset);
    document.documentElement.dataset[APPEARANCE_UI.attribute] = selected;
    document.querySelectorAll(APPEARANCE_UI.selects).forEach(select => { select.value = selected; });
    dialog.querySelectorAll('input[type="radio"]').forEach(input => { input.checked = input.value === selected; });
    let message = '';
    if (persist) {
      try { localStorage.setItem(APPEARANCE_STORAGE_KEY, selected); message = APPEARANCE_UI.saved; }
      catch { message = APPEARANCE_UI.memoryOnly; }
    }
    document.querySelectorAll(APPEARANCE_UI.messages).forEach(element => { element.textContent = message; });
  }

  document.querySelectorAll(APPEARANCE_UI.selects).forEach(select => {
    APPEARANCE_PRESETS.forEach(preset => {
      const option = document.createElement('option'); option.value = preset.id; option.textContent = preset.label; select.append(option);
    });
    select.addEventListener('change', () => apply(select.value, true));
  });
  const choices = document.getElementById(APPEARANCE_UI.choices);
  APPEARANCE_PRESETS.forEach(preset => {
    const label = document.createElement('label'); label.className = 'appearance-choice'; label.dataset.preset = preset.id;
    const radio = document.createElement('input'); radio.type = 'radio'; radio.name = APPEARANCE_UI.radioName; radio.value = preset.id;
    const text = document.createElement('span'), title = document.createElement('strong'), description = document.createElement('small');
    title.textContent = preset.label; description.textContent = preset.description; text.append(title, description);
    const preview = document.createElement('span'); preview.className = 'appearance-swatch'; preview.setAttribute('aria-hidden', 'true');
    label.append(radio, text, preview); choices.append(label);
    radio.addEventListener('change', () => { if (radio.checked) apply(radio.value, true); });
  });
  document.getElementById(APPEARANCE_UI.open).addEventListener('click', () => dialog.showModal());
  document.getElementById(APPEARANCE_UI.close).addEventListener('click', () => dialog.close());
  window.addEventListener('storage', event => {
    if (event.key === APPEARANCE_STORAGE_KEY || event.key === null) apply(event.newValue);
  });
  let stored;
  try { stored = localStorage.getItem(APPEARANCE_STORAGE_KEY); } catch { /* 保存制限時も既定外観で利用可能。 */ }
  apply(stored);
  // 折り返す主メニューの実際の高さを使い、グループ移動先がヘッダーに隠れないようにする。
  const header = document.querySelector('body > header');
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => document.documentElement.style.setProperty('--header-height', `${Math.ceil(header.getBoundingClientRect().height)}px`)).observe(header);
  }
})();
