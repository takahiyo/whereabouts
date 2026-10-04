/**
 * js/services/csv.js
 * CSV操作に関するユーティリティ関数群
 *
 * 依存: なし (makeNormalizedCSVでSTATUSESを使用する場合は引数推奨、またはグローバルSTATUSESへのフォールバックあり)
 */
(function (global) {
    'use strict';

    // 書出しと新GUIの事前検証で同じ列定義を参照する。既存CSVの形式は変更しない。
    const format = Object.freeze({
        title: '在席管理CSV',
        header: Object.freeze(['グループ番号', 'グループ名', '表示順', 'id', '氏名', '内線', '携帯番号', 'Email', '業務時間', 'ステータス', '戻り時間', '明日の予定', '備考']),
        defaultStatus: '在席'
    });

    /**
     * 文字列が計算式として評価されないようにエスケープ処理を行う
     * @param {string} s
     * @returns {string}
     */
    function csvProtectFormula(s) {
        if (s == null) return '';
        const v = String(s);
        return (/^[\t\r\n]|^\s*[=+\-@]/.test(v)) ? "'" + v : v;
    }

    /**
     * 配列をCSVの1行（カンマ区切り文字列）に変換する
     * 必要に応じてダブルクォートで囲み、エスケープする
     * @param {Array<string|number>} arr
     * @returns {string}
     */
    function toCsvRow(arr) {
        return arr.map(v => {
            const s = csvProtectFormula(v);
            return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(',');
    }

    /**
     * CSVテキストをパースして2次元配列を返す
     * @param {string} text
     * @returns {Array<Array<string>>}
     */
    function parseCSV(text) {
        // UTF-8 BOMは先頭のセルに混入させない。
        text = text.replace(/^\uFEFF/, '');
        const out = []; let i = 0, row = [], field = '', inq = false;
        function pushField() { row.push(field); field = ''; }
        function pushRow() { out.push(row); row = []; }
        while (i < text.length) {
            const c = text[i++];
            if (inq) {
                if (c == '"' && text[i] == '"') { field += '"'; i++; }
                else if (c == '"') { inq = false; }
                else field += c;
            } else {
                if (c === ',') { pushField(); }
                else if (c == '"') { inq = true; }
                else if (c == '\n') { pushField(); pushRow(); }
                // CR単独も行区切りとして扱い、CRLFは一度だけ改行する。
                else if (c == '\r') { pushField(); pushRow(); if (text[i] === '\n') i++; }
                else field += c;
            }
        }
        // 最終行は空の引用フィールドや末尾の空列も保持する。
        if (text.length && !/[\r\n]$/.test(text)) { pushField(); pushRow(); }
        return out;
    }

    /**
     * メンバーリスト用CSVデータを生成する
     * @param {Object} cfg - 拠点設定オブジェクト (groups, members を含む)
     * @param {Object} data - メンバーの状態データ
     * @param {Array} statuses - ステータス定義リスト (Optional)
     * @returns {string} CSVテキスト
     */
    function makeNormalizedCSV(cfg, data, statuses = []) {
        const rows = [];
        rows.push(toCsvRow([format.title]));
        rows.push(toCsvRow(format.header));

        // STATUSESへの依存を解決: 引数で渡されるか、グローバルから取得
        const statusList = (Array.isArray(statuses) && statuses.length > 0) ? statuses : (typeof global.STATUSES !== 'undefined' ? global.STATUSES : []);
        const defaultStatus = statusList[0]?.value || format.defaultStatus;

        (cfg.groups || []).forEach((g, gi) => {
            (g.members || []).forEach((m, mi) => {
                const id = m.id || '';
                const rec = (data && data[id]) || {};
                const workHours = rec.workHours || m.workHours || '';
                rows.push(toCsvRow([
                    gi + 1,
                    g.title || '',
                    mi + 1,
                    id,
                    m.name || '',
                    m.ext || '',
                    m.mobile || rec.mobile || '',
                    m.email || rec.email || '',
                    workHours,
                    rec.status || defaultStatus,
                    rec.time || '',
                    rec.tomorrowPlan || m.tomorrowPlan || '',
                    rec.note || ''
                ]));
            });
        });
        return rows.join('\n');
    }

    // グローバルに公開
    global.CsvService = {
        format,
        csvProtectFormula,
        toCsvRow,
        parseCSV,
        makeNormalizedCSV
    };

})(window);
