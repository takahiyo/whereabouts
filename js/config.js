// 環境ごとの設定値
// REMOTE_ENDPOINT: APIのエンドポイント
// REMOTE_POLL_MS: 状態更新のポーリング間隔(ms)
// CONFIG_POLL_MS: 設定更新のポーリング間隔(ms)
// TOKEN_DEFAULT_TTL: トークンのデフォルト有効期限(ms)
const REMOTE_ENDPOINT = "https://whereabouts.taka-hiyo.workers.dev"; // ※デプロイ後に確定しますが、通常はこの形式です
const REMOTE_POLL_MS = 10000;
const CONFIG_POLL_MS = 30000;
const TOKEN_DEFAULT_TTL = 3600000;

// publicListOffices が利用できない環境で使用する拠点一覧（id, name）
const PUBLIC_OFFICE_FALLBACKS = [];

// Firebase Configuration (Compat版) - 新プロジェクト設定
const firebaseConfig = {
    apiKey: "AIzaSyA_CKaAyt7aiZ0tXgv-0lHviCVV4y8urBQ",
    authDomain: "whereabouts-f3388.firebaseapp.com",
    projectId: "whereabouts-f3388",
    storageBucket: "whereabouts-f3388.firebasestorage.app",
    messagingSenderId: "578171146712",
    appId: "1:578171146712:web:b36ba48f99eae97f6ba2ad",
    measurementId: "G-SLXCBCX483"
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
    firebase.initializeApp(firebaseConfig);
    return true;
}

// 即座に初期化を試み、失敗したらロード完了を待って再試行
if (!initFirebase()) {
    window.addEventListener('load', () => {
        initFirebase();
    }, { once: true });
}
