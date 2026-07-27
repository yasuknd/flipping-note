# Flipping Note

個人用の服せどり管理アプリ（GitHub Pages / iPhone Safari想定）。

## できること

- 仕入情報の登録（割引・仕入れ送料込みの実質仕入価格）
- 損益分岐点と推奨販売価格（100円単位切り上げ）の自動計算
- 販売価格は最後に入力（未入力でも保存可能）
- 一覧での在庫・取引中・取引完了の管理
- 売却日ベースの確定利益 / 入金予定 / 合計見込
- 一覧 / 利益のCSV出力

## 開発

```bash
npm install
npm run dev
```

ローカルでは `http://localhost:5173/flipping-note/` で開きます（`base` が `/flipping-note/` のため）。

## GitHub Pages への公開

1. このリポジトリを GitHub に push
2. Settings → Pages → Source を **GitHub Actions** にする
3. `main` へ push すると自動デプロイ

公開URL:

`https://yasuknd.github.io/flipping-note/`

## iPhone での使い方

1. Safari で上記URLを開く
2. 共有 → **ホーム画面に追加**

未ログイン時は端末の `localStorage` に保存されます。Google ログイン後は Firestore に同期され、PC／スマホで同じデータを使えます。

## Google ログイン同期（Firebase）

1. [Firebase Console](https://console.firebase.google.com/) でプロジェクト作成
2. Authentication → Sign-in method → **Google** を有効化
3. Firestore Database を作成（本番モード可）し、リポジトリの `firestore.rules` を反映
4. プロジェクト設定から Web アプリを追加し、設定値を控える
5. Authentication → Settings → Authorized domains に追加:
   - `localhost`
   - `yasuknd.github.io`
6. ローカル用に `.env` を作成（`.env.example` をコピー）

```bash
cp .env.example .env
# 各 VITE_FIREBASE_* を記入
```

7. GitHub リポジトリの Settings → Secrets and variables → Actions に同名の Secrets を登録
8. `main` へ push すると、Secrets を埋め込んでデプロイされます

設定画面の「Googleでログイン」からサインインできます。初回ログイン時、その端末の既存データがあればクラウドへ取り込みます。

## 設定

ヘッダー右上の「設定」から変更できます。

- **アカウント同期** … Google ログイン／ログアウト
- **最低限ほしい利益** … 推奨販売価格の計算に反映
- **販売先登録** … 販売先＋手数料率のセット。商品登録時にプルダウンで選択

## 計算式

- 実質仕入価格 = 仕入価格 − 割引 + 仕入れ送料
- 販売手数料 = 販売価格 × 手数料率
- 利益 = 販売価格 − 手数料 − 販売送料 − 実質仕入価格
- 損益分岐点（利益ゼロ） = (実質仕入価格 + 販売送料) ÷ (1 − 手数料率)
- 推奨販売価格（利益N円以上） = (実質仕入価格 + 販売送料 + N) ÷ (1 − 手数料率) を 100 円単位で切り上げ
