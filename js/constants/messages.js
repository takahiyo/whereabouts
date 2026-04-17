/**
 * js/constants/messages.js - UI 文言・エラーメッセージ定数 (SSOT)
 */

const AUTH_MESSAGES = Object.freeze({
  ERROR: {
    EMAIL_ALREADY_IN_USE: "このメールアドレスは既に登録されています",
    WEAK_PASSWORD: "パスワードが短すぎます",
    INVALID_PASSWORD_FORMAT: "パスワードは大小英字、数字、記号の内2種類以上を含む12文字以上で入力してください",
    INVALID_EMAIL: "正しいメールアドレスを入力してください",
    SYSTEM_ERROR: "システムエラーが発生しました",
    NOT_FOUND: "拠点名またはパスワードが正しくありません",
    UNAUTHORIZED: "ログインに失敗しました。認証情報を確認してください",
    CONFIG_INCOMPLETE: "Firebaseの設定（API Key）が未完了です。js/firebase-config.js を確認してください。",
    AUTH_FAILED: "ログインに失敗しました。IDまたはパスワードが正しくありません。",
    SESSION_LOCKED: "別のセッションがアクティブです。再ログインするには一度ログアウトしてください。",
  },
  INFO: {
    VERIFY_EMAIL_SENT: "確認メールを送信しました",
    CREATE_OFFICE_SUCCESS: "ユーザー登録が完了しました！拠点の基本設定を行ってください",
  },
  UI: {
    BTN_REGISTER: "登録",
    BTN_DONE: "完了してログイン画面へ",
    PASSWORD_REQUIREMENT: "大小英字、数字、記号の内2種類以上を含む12文字以上",
  }
});
