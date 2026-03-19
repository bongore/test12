# GitHub Pages + Render でライブ配信を使う手順

この構成では、画面本体は GitHub Pages に置き、ライブ配信用のシグナリングサーバーだけを Render で常時動かします。

## 1. Render にシグナリングサーバーを作成する

1. Render にログインする
2. `New +` から `Blueprint` か `Web Service` を選ぶ
3. このリポジトリを接続する
4. `render.yaml` を使うか、手動で次を設定する
   - Runtime: `Node`
   - Build Command: `npm install`
   - Start Command: `npm run live:signal`
5. デプロイ完了後、公開 URL を控える
   - 例: `https://test2-live-signal.onrender.com`

## 2. GitHub Pages 用の本番 WebSocket URL を設定する

Create React App はビルド時に環境変数を埋め込むので、GitHub Pages に上げる前に `REACT_APP_LIVE_SIGNAL_URL` を設定してからビルドします。

PowerShell 例:

```powershell
$env:REACT_APP_LIVE_SIGNAL_URL = "wss://test2-live-signal.onrender.com"
npm run deploy
```

`https://` ではなく `wss://` を使ってください。

## 3. 確認する

1. `https://bongore.github.io/test11/` を開く
2. 先生 / TA 側でライブ配信を開始する
3. 別ブラウザで視聴者として同じページを開く
4. 映像とコメントが共有されることを確認する

## 4. 補足

- GitHub Pages だけでは Node サーバーを動かせないため、ライブ機能は動きません
- このリポジトリの `live-signal-server.js` は `PORT` 環境変数に対応済みです
- ライブ画面は 20 秒ごとに heartbeat を送るため、Render 側で接続中に止まりにくくしています
- 学内ネットワークによっては TURN サーバーが必要になる場合があります

## 5. ローカル確認

```powershell
npm run live:signal
npm start
```

ローカルでは `ws://localhost:3001` が自動で使われます。
