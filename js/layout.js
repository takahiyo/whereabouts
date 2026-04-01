/**
 * js/layout.js - レイアウト管理
 *
 * グリッドレイアウトのカラム数計算とリサイズ監視を管理する。
 *
 * 依存: js/constants/ui.js (PANEL_MIN_PX, GAP_PX, MAX_COLS)
 * 参照元: js/board.js
 *
 * @see MODULE_GUIDE.md
 */

function getContainerWidth(){ const elc=board.parentElement||document.body; const r=elc.getBoundingClientRect(); return Math.max(0,Math.round(r.width)); }
function getPanelMinWidth() {
  // 拠点設定に固定の最小幅がある場合はそれを優先 (Phase 8)
  if (typeof OFFICE_COLUMN_CONFIG !== 'undefined' && OFFICE_COLUMN_CONFIG && OFFICE_COLUMN_CONFIG.layoutConfig && OFFICE_COLUMN_CONFIG.layoutConfig.panelMinWidth) {
    return parseInt(OFFICE_COLUMN_CONFIG.layoutConfig.panelMinWidth, 10);
  }

  const enabledKeys = typeof getEnabledColumns === 'function' ? getEnabledColumns() : ['name', 'workHours', 'status', 'time', 'tomorrowPlan', 'note'];
  const colWidths = (typeof OFFICE_COLUMN_CONFIG !== 'undefined' && OFFICE_COLUMN_CONFIG && OFFICE_COLUMN_CONFIG.columnWidths) || {};

  let total = 0;
  enabledKeys.forEach(k => {
    const def = typeof getColumnDefinition === 'function' ? getColumnDefinition(k) : null;
    let minW = def && def.defaultWidth ? def.defaultWidth : 100;

    const w = colWidths[k];
    if (w && w.min != null) {
      minW = w.min;
    }
    total += minW;
  });

  return Math.max(total + 20, 300); // パディング等考慮
}

function updateCols(){
  const w = getContainerWidth();
  const panelMin = getPanelMinWidth();
  
  // 拠点設定のカード表示しきい値 (Phase 8)
  const cardBp = (typeof OFFICE_COLUMN_CONFIG !== 'undefined' && OFFICE_COLUMN_CONFIG && OFFICE_COLUMN_CONFIG.layoutConfig && OFFICE_COLUMN_CONFIG.layoutConfig.cardBreakpoint) || CARD_BREAKPOINT_PX || 760;

  // CSS変数 --table-min-width を更新
  board.style.setProperty('--table-min-width', `${panelMin}px`);

  // カード表示への強制切り替え判定
  if (w < cardBp) {
    board.classList.add('force-cards');
    board.dataset.cols = '1';
    board.style.removeProperty('--cols');
    return;
  }

  let n = Math.floor((w + GAP_PX) / (panelMin + GAP_PX));
  if (n < 2) {
    board.classList.add('force-cards');
    board.dataset.cols = '1';
    board.style.removeProperty('--cols');
    return;
  }
  if (n > MAX_COLS) n = MAX_COLS;
  board.style.setProperty('--cols', String(n));
  board.dataset.cols = String(n);
  board.classList.remove('force-cards');
}
function startGridObserver(){
  if(ro){
    ro.disconnect();
    ro=null;
  }
  window.removeEventListener('resize', updateCols);
  if(typeof ResizeObserver!=='undefined'){
    ro=new ResizeObserver(updateCols);
    ro.observe(board.parentElement||document.body);
  }else{
    window.addEventListener('resize', updateCols, {passive:true});
  }
  updateCols();
}
