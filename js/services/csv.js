/**
 * js/services/csv.js
 * CSV操作に関するユーティリティ関数群
 *
 * 依存: なし (makeNormalizedCSVでSTATUSESを使用する場合は引数推奨、またはグローバルSTATUSESへのフォールバックあり)
 */
(function (global) {
    'use strict';

    /**
     * 文字列が計算式として評価されないようにエスケープ処理を行う
     * @param {string} s
     * @returns {string}
     */
    function csvProtectFormula(s) {
        if (s == null) return '';
        const v = String(s);
        return (/^[=\+\-@\t]/.test(v)) ? "'" + v : v;
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
            return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(',');
    }

    /**
     * CSVテキストをパースして2次元配列を返す
     * @param {string} text
     * @returns {Array<Array<string>>}
     */
    function parseCSV(text) {
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
                else if (c == '\r') { }
                else field += c;
            }
        }
        const endsWithComma = text.length > 0 && text[text.length - 1] === ',';
        if (field !== '' || endsWithComma) pushField();
        if (row.length) pushRow();
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
        rows.push(toCsvRow(['在席管理CSV']));
        rows.push(toCsvRow(['グループ番号', 'グループ名', '表示順', 'id', '氏名', '内線', '携帯番号', 'Email', '業務時間', 'ステータス', '戻り時間', '明日の予定', '備考']));

        // STATUSESへの依存を解決: 引数で渡されるか、グローバルから取得
        const statusList = (Array.isArray(statuses) && statuses.length > 0) ? statuses : (typeof global.STATUSES !== 'undefined' ? global.STATUSES : []);
        const defaultStatus = statusList[0]?.value || '在席';

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
        csvProtectFormula,
        toCsvRow,
        parseCSV,
        makeNormalizedCSV
    };

})(window);
