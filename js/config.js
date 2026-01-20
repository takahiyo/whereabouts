// ドメインが 'dev' を含むか、localhost の場合は開発環境とみなす
const isDev = window.location.hostname.includes('dev') || window.location.hostname.includes('localhost');

const CONFIG = {
    // 環境に応じてエンドポイントを自動切り替え
    remoteEndpoint: isDev 
        ? "https://whereabouts-dev.taka-hiyo.workers.dev" 
        : "https://whereabouts.taka-hiyo.workers.dev",

    remotePollMs: 60000,       // 10秒 -> 60秒へ変更（リクエスト数 1/6）
    configPollMs: 300000,      // 30秒 -> 5分へ変更
    eventSyncIntervalMs: 10 * 60 * 1000, // 5分 -> 10分へ変更
    tokenDefaultTtl: 3600000,
    publicOfficeFallbacks: [],
    firebaseConfig: {
        apiKey: "AIzaSyA_CKaAyt7aiZ0tXgv-0lHviCVV4y8urBQ",
        authDomain: "whereabouts-f3388.firebaseapp.com",
        projectId: "whereabouts-f3388",
        storageBucket: "whereabouts-f3388.firebasestorage.app",
        messagingSenderId: "578171146712",
        appId: "1:578171146712:web:b36ba48f99eae97f6ba2ad",
        measurementId: "G-SLXCBCX483"
    },
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

// Initialize Firebase (Compat版)
function initFirebase() {
    // SDKが正しく読み込まれているかチェック
    if (typeof firebase === 'undefined') {
        console.error("Firebase SDK not loaded.");
        return false;
    }

    // すでに初期化済みなら何もしない
    if (firebase.apps && firebase.apps.length > 0) {
        return true;
    }

    // 初期化を実行
    firebase.initializeApp(CONFIG.firebaseConfig);

    // Auth を確実に初期化（ログインに必要）
    firebase.auth();

    // ★修正: FirestoreはWorker経由になったため、SDKの初期化自体を行わないようにする
    // これによりクライアントからの直接接続（Listen）が物理的に発生しなくなる
    // const db = firebase.firestore(); 

    return true;
}

// 即座に初期化を試み、失敗したらロード完了を待って再試行
if (!initFirebase()) {
    window.addEventListener('load', () => {
        initFirebase();
    }, { once: true });
}
