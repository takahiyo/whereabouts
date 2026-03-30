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
  const enabledKeys = typeof getEnabledColumns === 'function' ? getEnabledColumns() : ['name', 'workHours', 'status', 'time', 'tomorrowPlan', 'note'];
  const colWidths = (typeof OFFICE_COLUMN_CONFIG !== 'undefined' && OFFICE_COLUMN_CONFIG && OFFICE_COLUMN_CONFIG.columnWidths) || {};

  // SSOT: COLUMN_DEFINITIONS の defaultWidth をベース幅として使用
  // ハードコーディングの baseWidths は廃止
  let total = 0;
  enabledKeys.forEach(k => {
    const def = typeof getColumnDefinition === 'function' ? getColumnDefinition(k) : null;
    const baseW = (def && def.defaultWidth) || 100;
    const w = colWidths[k];
    
    if (w && (w.min != null || w.max != null)) {
      const minW = (w.min != null && w.min >= 10) ? w.min : 10;
      const maxW = (w.max != null && w.max >= 10) ? w.max : 2000;
      
      let effectiveW = baseW;
      if (effectiveW < minW) effectiveW = minW;
      if (effectiveW > maxW) effectiveW = maxW;
      
      total += effectiveW;
    } else {
      total += baseW;
    }
  });
  // パディングやボーダーの余白分を考慮
  return Math.max(total + 20, 300);
}

function updateCols(){
  const w = getContainerWidth();
  const panelMin = getPanelMinWidth();
  
  // CSS変数 --table-min-width を更新
  board.style.setProperty('--table-min-width', `${panelMin}px`);

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
