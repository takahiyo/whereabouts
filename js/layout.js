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
function getBoardWidth() {
  // ボード（パネル）の固定幅。これを基準にカード表示しきい値やグリッドの列数を計算する (ユーザー要望: 1つの設定で管理)
  if (typeof OFFICE_COLUMN_CONFIG !== 'undefined' && OFFICE_COLUMN_CONFIG && OFFICE_COLUMN_CONFIG.layoutConfig && OFFICE_COLUMN_CONFIG.layoutConfig.panelMinWidth) {
    const val = parseInt(OFFICE_COLUMN_CONFIG.layoutConfig.panelMinWidth, 10);
    if (!isNaN(val) && val > 0) return val;
  }
  return typeof PANEL_MIN_PX !== 'undefined' ? PANEL_MIN_PX : 760;
}

function getTableMinWidth() {
  // テーブル自体の最小幅。パネル内での横スクロールを判定するために使用
  const enabledKeys = typeof getEnabledColumns === 'function' ? getEnabledColumns() : ['name', 'workHours', 'status', 'time', 'tomorrowPlan', 'note'];
  const colWidths = (typeof OFFICE_COLUMN_CONFIG !== 'undefined' && OFFICE_COLUMN_CONFIG && OFFICE_COLUMN_CONFIG.columnWidths) || {};

  let total = 0;
  enabledKeys.forEach(k => {
    const def = typeof getColumnDefinition === 'function' ? getColumnDefinition(k) : null;
    let minW = def && def.defaultWidth ? Number(def.defaultWidth) : 100;

    const w = colWidths[k];
    if (w && w.min != null) {
      const configMin = Number(w.min);
      if (!isNaN(configMin)) {
        minW = configMin;
      }
    }
    total += minW;
  });

  return Math.max(Number(total) + 20, 300); // パディング等考慮
}

function updateCols(){
  const w = getContainerWidth();
  const boardWidth = getBoardWidth();
  const tableMin = getTableMinWidth();
  
  // ユーザー要望「ボード幅設定は1つ」に基づき、カード表示しきい値もboardWidthと同期。
  // Admin画面の別設定があれば優先。
  let cardBp = boardWidth;
  if (typeof OFFICE_COLUMN_CONFIG !== 'undefined' && OFFICE_COLUMN_CONFIG && OFFICE_COLUMN_CONFIG.layoutConfig && OFFICE_COLUMN_CONFIG.layoutConfig.cardBreakpoint) {
    const val = parseInt(OFFICE_COLUMN_CONFIG.layoutConfig.cardBreakpoint, 10);
    if (!isNaN(val) && val > 0) {
      cardBp = val;
    }
  }

  // CSS変数 --table-min-width と --board-width を更新
  board.style.setProperty('--table-min-width', `${tableMin}px`);
  board.style.setProperty('--board-width', `${boardWidth}px`);

  // カード表示への強制切り替え判定
  if (w < cardBp) {
    board.classList.add('force-cards');
    board.dataset.cols = '1';
    board.style.removeProperty('--cols');
    return;
  }

  let n = Math.floor((w + GAP_PX) / (boardWidth + GAP_PX));
  if (n < 1) n = 1;
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
