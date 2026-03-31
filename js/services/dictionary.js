/**
 * js/services/dictionary.js
 * 外字置換およびふりがな処理を行う共通サービス
 */
(function (global) {
  'use strict';

  let gaijiMap = new Map();
  let furiganaMap = new Map();

  /**
   * 辞書データを初期化・更新する
   * @param {Object} dictionaries - { gaiji: [{key, value}], furigana: [{key, value}] }
   */
  function init(dictionaries) {
    gaijiMap.clear();
    furiganaMap.clear();

    if (dictionaries && Array.isArray(dictionaries.gaiji)) {
      dictionaries.gaiji.forEach(item => {
        if (item.key && item.value != null) {
          gaijiMap.set(item.key, item.value);
        }
      });
    }

    if (dictionaries && Array.isArray(dictionaries.furigana)) {
      dictionaries.furigana.forEach(item => {
        if (item.key && item.value != null) {
          furiganaMap.set(item.key, item.value);
        }
      });
    }
  }

  /**
   * 文字列内の外字を置換する
   * @param {string} text 
   * @returns {string}
   */
  function applyGaiji(text) {
    if (!text || gaijiMap.size === 0) return text;
    let result = text;
    for (const [key, value] of gaijiMap.entries()) {
      // 複数の出現箇所がある場合に対応
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escapedKey, 'g'), value);
    }
    return result;
  }

  /**
   * 文字列に対応するふりがなを取得する
   * @param {string} text 
   * @returns {string}
   */
  function getFurigana(text) {
    if (!text) return '';
    return furiganaMap.get(text) || '';
  }

  /**
   * 外字置換を適用した「表示用氏名」を作成する
   * @param {string} name 
   * @returns {string}
   */
  function formatName(name) {
    return applyGaiji(name);
  }

  // グローバルに公開
  global.DictionaryService = {
    init,
    applyGaiji,
    getFurigana,
    formatName
  };

})(window);
