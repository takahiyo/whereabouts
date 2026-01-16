// 環境ごとの設定値
const CONFIG = {
    remoteEndpoint: "https://whereabouts.taka-hiyo.workers.dev", // ※デプロイ後に確定しますが、通常はこの形式です
    remotePollMs: 10000,
    configPollMs: 30000,
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

    // ★追加: オフライン永続化（キャッシュ）を有効にする
    firebase.firestore().enablePersistence({ synchronizeTabs: true })
        .catch((err) => {
            if (err.code == 'failed-precondition') {
                console.warn('複数タブで開かれているため、永続化は1つのタブでのみ有効です');
            } else if (err.code == 'unimplemented') {
                console.warn('このブラウザは永続化をサポートしていません');
            }
        });

    return true;
}

// 即座に初期化を試み、失敗したらロード完了を待って再試行
if (!initFirebase()) {
    window.addEventListener('load', () => {
        initFirebase();
    }, { once: true });
}
