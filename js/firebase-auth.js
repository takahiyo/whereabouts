/**
 * js/firebase-auth.js
 * 
 * Firebase Authentication (Email/Password) と Worker バックエンドを連携させる。
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  sendEmailVerification,
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

/**
 * ユーザー登録 (サインアップ)
 * 1. Firebase Auth でアカウント作成
 * 2. 確認メール送信
 */
export async function signup(email, password) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(userCredential.user);
    return { ok: true, user: userCredential.user };
  } catch (error) {
    console.error('Signup Error:', error);
    return { ok: false, error: error.message };
  }
}

/**
 * ログイン
 */
export async function login(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    if (!user.emailVerified) {
      // [AFTER] 未認証の場合は自動で確認メールを再送する
      await sendEmailVerification(user);
      return { ok: false, error: 'email_not_verified' };
    }

    // Worker 側へアカウント同期 (初回ログイン時など)
    const token = await user.getIdToken();
    const resp = await syncUserWithWorker(token);

    return { ok: true, user, workerResult: resp };
  } catch (error) {
    console.error('Login Error:', error);
    return { ok: false, error: error.message };
  }
}

/**
 * Worker にユーザー情報を登録 (サインアップ後の初アクセス時など)
 */
async function syncUserWithWorker(token) {
  const params = new URLSearchParams();
  params.append('action', 'signup');
  params.append('token', token);

  const endpoint = CONFIG.remoteEndpoint;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  return await resp.json();
}

/**
 * 現在の有効な ID Token を取得
 */
export async function getValidToken() {
  const user = auth.currentUser;
  if (!user) return null;
  return await user.getIdToken(true);
}

/**
 * ログアウト
 */
export async function logout() {
  await signOut(auth);
  // localStorage.clear(); // [FIX] 他拠点の保存データまで消してしまうため、Firebaseのサインアウトのみに留める
  location.reload();
}

/**
 * 認証状態の監視
 */
export function watchAuthState(callback) {
  onAuthStateChanged(auth, (user) => {
    callback(user);
  });
}
