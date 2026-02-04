/**
 * js/config.js - アプリケーション設定
 *
 * 環境設定、タイミング設定、カラーパレット設定を管理する。
 * 本ファイルの値は他の定数ファイル（js/constants/）のデフォルト値を上書きできる。
 *
 * 依存: なし（最初に読み込まれる）
 * 参照元: 全JSファイル
 *
 * @see SSOT_GUIDE.md
 */

// ドメインが 'dev' を含むか、localhost の場合は開発環境とみなす
const isDev = window.location.hostname.includes('dev') || window.location.hostname.includes('localhost');

const CONFIG = {
    // 認証/同期のモード設定（D1移行後は worker を使用）
    authMode: 'worker',
    // 環境に応じてエンドポイントを自動切り替え
    remoteEndpoint: isDev 
        ? "https://whereabouts-dev.taka-hiyo.workers.dev" 
        : "https://whereabouts.taka-hiyo.workers.dev",

    remotePollMs: 60000,       // 10秒 -> 60秒へ変更（リクエスト数 1/6）
    nightPollMs: 3600000,      // 夜間時: 1時間 (60分 * 60秒 * 1000)
    configPollMs: 300000,      // 30秒 -> 5分へ変更
    eventSyncIntervalMs: 10 * 60 * 1000, // 5分 -> 10分へ変更
    tokenDefaultTtl: 3600000,
    publicOfficeFallbacks: [],
    printSettings: {
        cellWidth: '30px',
        memberNameWidth: '120px',
        fontSize: '10pt',
        headerHeight: '30px'
    },
    /* === ストレージキー設定 (SSOT) === */
    storageKeys: {
        stateCache: 'whereabouts_state_cache',
        lastSync: 'whereabouts_last_sync'
    },
    /* === カラーパレット設定 (SSOT) === */
    colorPalette: [
        { key: 'none', className: 'vac-color-none', label: 'なし' },
        { key: 'saturday', className: 'vac-color-sat', label: '土曜' },
        { key: 'sunday', className: 'vac-color-sun', label: '日曜' },
        { key: 'holiday', className: 'vac-color-holiday', label: '祝日' },
        { key: 'amber', className: 'vac-color-amber', label: 'サニー' },
        { key: 'mint', className: 'vac-color-mint', label: 'グリーン' },
        { key: 'lavender', className: 'vac-color-lavender', label: 'パープル' },
        { key: 'slate', className: 'vac-color-slate', label: 'グレー' }
    ],
    eventColorLabels: {
        amber: 'サニー',
        blue: 'ブルー',
        green: 'グリーン',
        pink: 'ピンク',
        purple: 'パープル',
        teal: 'ティール',
        gray: 'グレー',
        sunday: '日曜',
        holiday: '祝日',
        slate: 'スレート'
    },
    // パレットキーからイベントカラー名への変換
    paletteToEventColor: {
        none: '',
        saturday: 'blue',
        sunday: 'sunday',
        holiday: 'holiday',
        amber: 'amber',
        mint: 'green',
        lavender: 'purple',
        slate: 'slate'
    },
    // イベントカラー名からパレットキーへの変換
    eventColorToPalette: {
        amber: 'amber',
        blue: 'saturday',
        green: 'mint',
        purple: 'lavender',
        sunday: 'sunday',
        saturday: 'saturday',
        holiday: 'holiday',
        teal: 'mint',
        pink: 'sunday',
        gray: 'slate',
        slate: 'slate'
    }
};
