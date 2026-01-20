const CONFIG = {
    remoteEndpoint: "https://whereabouts-dev.taka-hiyo.workers.dev",
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
// Initialize Firebase (Compat版) - Firestore前提で安全に初期化
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

    // Firestore を初期化
    const db = firebase.firestore();

    // ✅ Firestoreキャッシュ設定の最適化
    // 新しいSDK(v9以降のcompat)ではFirestoreSettings.cacheを使用することが推奨されています。
    try {
        if (firebase.firestore.persistentLocalCache) {
            // モダンな設定方法 (警告対策)
            db.settings({
                cache: firebase.firestore.persistentLocalCache({
                    tabManager: firebase.firestore.persistentMultipleTabManager()
                })
            });
        } else {
            // 古い設定方法 (フォールバック)
            db.enablePersistence({ synchronizeTabs: true })
                .catch((err) => {
                    if (err.code === 'failed-precondition') {
                         console.warn("Firestore persistence: Multiple tabs open, persistence can only be enabled in one tab at a a time.");
                    } else if (err.code === 'unimplemented') {
                         console.warn("Firestore persistence: Browser doesn't support persistence.");
                    }
                });
        }
    } catch (e) {
        // 設定に失敗してもアプリ自体は動くようにする
        console.warn("Firestore settings check failed, proceeding with defaults:", e);
        // 念のため旧方式を試行
        db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
    }

    return true;
}


// 即座に初期化を試み、失敗したらロード完了を待って再試行
if (!initFirebase()) {
    window.addEventListener('load', () => {
        initFirebase();
    }, { once: true });
}
