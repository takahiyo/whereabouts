/**
 * js/constants/column-definitions.js - カラム定義マスター (SSOT)
 *
 * 全拠点で使用可能なカラムのマスター定義。
 * 各カラムの表示ラベル、属性、制約を一元管理する。
 *
 * @see SSOT_GUIDE.md
 */

/**
 * カラム定義の一覧
 * @type {ReadonlyArray<Object>}
 */
const COLUMN_DEFINITIONS = Object.freeze([
  {
    key: 'name',
    label: '氏名',
    dbField: 'name',
    type: 'text',
    required: true,
    tableClass: 'name',
    dataLabel: '氏名',
    defaultWidth: 110,
    popupEligible: false,
    cardEligible: true,
    description: 'メンバーの氏名'
  },
  {
    key: 'status',
    label: 'ステータス',
    dbField: 'status',
    type: 'select',
    required: true,
    tableClass: 'status',
    dataLabel: 'ステータス',
    defaultWidth: 134,
    popupEligible: false,
    cardEligible: true,
    description: '現在の在席状況'
  },
  {
    key: 'time',
    label: '戻り時間',
    dbField: 'time',
    type: 'time-select',
    required: false,
    tableClass: 'time',
    dataLabel: '戻り時間',
    defaultWidth: 85,
    popupEligible: false,
    cardEligible: true,
    description: '外出時の帰着予定時刻'
  },
  {
    key: 'workHours',
    label: '業務時間',
    dbField: 'work_hours',
    type: 'candidate',
    required: false,
    tableClass: 'work',
    dataLabel: '業務時間',
    defaultWidth: 107,
    popupEligible: false,
    cardEligible: false,
    description: '当日の勤務シフト時間'
  },
  {
    key: 'tomorrowPlan',
    label: '明日の予定',
    dbField: 'tomorrow_plan',
    type: 'select',
    required: false,
    tableClass: 'tomorrow-plan',
    dataLabel: '明日の予定',
    defaultWidth: 134,
    popupEligible: false,
    cardEligible: false,
    description: '翌営業日の予定'
  },
  {
    key: 'note',
    label: '備考',
    dbField: 'note',
    type: 'candidate',
    required: false,
    tableClass: 'note',
    dataLabel: '備考',
    defaultWidth: 87,
    popupEligible: false,
    cardEligible: true,
    description: '自由記述の補足情報'
  },
  {
    key: 'ext',
    label: '内線',
    dbField: 'ext',
    type: 'display',
    required: false,
    tableClass: 'ext',
    dataLabel: '内線',
    defaultWidth: 70,
    popupEligible: true,
    cardEligible: true,
    description: '社内内線番号'
  },
  {
    key: 'mobile',
    label: '携帯',
    dbField: 'mobile',
    type: 'display',
    required: false,
    tableClass: 'mobile',
    dataLabel: '携帯',
    defaultWidth: 120,
    popupEligible: true,
    cardEligible: true,
    description: '携帯電話番号（通常はポップアップのみ）'
  },
  {
    key: 'email',
    label: 'メール',
    dbField: 'email',
    type: 'display',
    required: false,
    tableClass: 'email',
    dataLabel: 'メール',
    defaultWidth: 200,
    popupEligible: true,
    cardEligible: true,
    description: 'メールアドレス（通常はポップアップのみ）'
  }
]);

/**
 * キーからカラム定義を取得する
 * @param {string} key - カラムキー
 * @returns {Object|null}
 */
function getColumnDefinition(key) {
  return COLUMN_DEFINITIONS.find(d => d.key === key) || null;
}
