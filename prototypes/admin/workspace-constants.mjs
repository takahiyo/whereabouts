/** 管理領域試作の編集項目と架空データ。参照元: workspace-model/workspace-view。 */
export const WORKSPACES = Object.freeze({
  notices: { section: 'content', label: 'お知らせ', fields: [
    { key: 'title', label: 'タイトル', required: true }, { key: 'content', label: '本文', type: 'textarea' },
    { key: 'visible', label: '表示する', type: 'checkbox' }
  ] },
  events: { section: 'content', label: '予定', fields: [
    { key: 'title', label: 'タイトル', required: true }, { key: 'start', label: '開始日', type: 'date', required: true },
    { key: 'end', label: '終了日', type: 'date', required: true }, { key: 'noticeId', label: '関連お知らせ', type: 'notice' }
  ] },
  tools: { section: 'tools', label: 'ツール', fields: [
    { key: 'title', label: 'タイトル', required: true }, { key: 'url', label: 'URL', required: true },
    { key: 'note', label: '備考', type: 'textarea' }
  ] }
});
export const TOOL_PROTOCOLS = Object.freeze(['https:', 'http:', 'mailto:', 'tel:']);
export const WORKSPACE_SAMPLE = Object.freeze({
  notices: [{ id: 'notice-sample', title: 'サンプル拠点からのお知らせ', content: 'これは操作確認用の架空のお知らせです。', visible: true }],
  events: [{ id: 'event-sample', title: 'サンプル予定', start: '2026-10-12', end: '2026-10-14', noticeId: 'notice-sample' }],
  tools: [{ id: 'tool-sample', title: '業務リンクのサンプル', url: 'https://example.invalid/', note: '実際のサービスには接続していません。' }]
});
