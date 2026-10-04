/**
 * constants.mjs - 管理GUI試作の表示定義と架空データ。
 * 本番の設定・認証・名簿を読み込まない。参照元: app.mjs、model.mjs、試験。
 */
export const UI = Object.freeze({
  all: '', section: 'people', order: { none: '', members: 'members' }
});

export const VALIDATION = Object.freeze({
  extension: /^\d{1,6}$/, mobile: /^\d{10,11}$/, email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
});

export const SECTIONS = Object.freeze([
  { id: 'people', label: 'メンバー・グループ', description: '人と所属、表示順をひとつの場所で管理します。' },
  { id: 'content', label: 'お知らせ・予定', description: 'お知らせと予定、関連する情報をまとめて管理します。', items: ['お知らせ一覧・登録', '予定一覧・カレンダー', '関連お知らせの選択・作成', '休暇の対象・期間'] },
  { id: 'tools', label: 'ツール', description: '業務で使うリンクを整理します。', items: ['リンク一覧・登録', 'リンクの編集・確認', '表示順の変更'] },
  { id: 'board', label: '在席表の設定', description: '在席表に表示する内容と出力を設定します。', items: ['表示項目（列）', '項目自動消去', '印刷・PDF出力'] },
  { id: 'office', label: '拠点・アクセス', description: '対象拠点の情報とアクセス方法を管理します。', items: ['拠点名', '共有パスワード', '権限の説明', '拠点一覧・追加（全体管理者）'] }
]);

export const FIXTURE = Object.freeze({
  groups: [
    { id: 'sample-sales', name: '営業' }, { id: 'sample-product', name: '開発' },
    { id: 'sample-admin', name: '管理' }
  ],
  members: [
    { id: 'sample-1', name: '佐藤 花子', group: 'sample-sales', ext: '201', mobile: '', email: 'hanako@example.invalid', status: '在席', tomorrowPlan: '午前は外出' },
    { id: 'sample-2', name: '鈴木 太郎', group: 'sample-sales', ext: '202', mobile: '', email: 'taro@example.invalid', status: '外出', tomorrowPlan: '' },
    { id: 'sample-3', name: '高橋 葵', group: 'sample-product', ext: '301', mobile: '', email: 'aoi@example.invalid', status: '在席', tomorrowPlan: '' },
    { id: 'sample-4', name: '田中 健', group: 'sample-product', ext: '302', mobile: '', email: '', status: '在席', tomorrowPlan: '' },
    { id: 'sample-5', name: '伊藤 美咲', group: 'sample-product', ext: '303', mobile: '', email: '', status: '休暇', tomorrowPlan: '' },
    { id: 'sample-6', name: '渡辺 悠', group: 'sample-admin', ext: '401', mobile: '', email: '', status: '在席', tomorrowPlan: '' }
  ]
});

export const MEMBER_FIELDS = Object.freeze([
  { key: 'name', label: '氏名', required: true, type: 'text' },
  { key: 'ext', label: '内線', type: 'text' },
  { key: 'mobile', label: '携帯', type: 'tel' },
  { key: 'email', label: 'メール', type: 'email' }
]);
