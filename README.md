# SPIトレーナー

SPI（言語・非言語）を、解き方ノート・ドリル・自動復習で練習する個人用のPWAです。
SPIは株式会社リクルートの登録商標です。本アプリは個人が作った非公式の練習アプリで、問題はすべて自作です。

- 費用0円・サーバーなし・AI APIなし。学習記録はブラウザの localStorage に保存します
- 仕様は [SPEC.md](./SPEC.md) を見てください
- 現在は v0.9（1回目の公開）。模試や残りの分野は v1.0 で追加します

## 起動方法

Node.js 20 以上が必要です。PowerShell でプロジェクトのフォルダに移動して実行します。

```powershell
# このセッションだけ Node に PATH を通す（毎回必要）
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

cd C:\Claude\spi-trainer
npm install          # 初回だけ
npm run dev          # 開発サーバー（表示された URL をブラウザで開く）
```

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバーを起動 |
| `npm test` | 自動テスト（問題生成・問題データ・復習・分析・画面の初期表示） |
| `npm run typecheck` | 型の検査 |
| `npm run build` | 型の検査 → 本番ビルド（`dist/`） |
| `npm run preview` | ビルドしたものを確認 |
| `npm run icons` | PWAアイコンを作り直す（`scripts/make-icons.mjs`。`public/` に出力） |

## 構成

```
src/
  types.ts            データの形（Question / Generator / Note / Attempt / ReviewItem）
  data/topics.ts      分野の一覧、今の公開段階（CURRENT_RELEASE）
  generators/         生成問題（数字を変えて自動で作る問題の型）
  content/
    questions/*.json  作成問題（分野ごとに1ファイル）
    notes/*.json      解き方ノート（分野ごとに1ファイル）
    index.ts          上の JSON を自動で読み込む
  lib/
    bank.ts           問題を出す窓口（画面はここだけを使う）
    validate.ts       問題・ノートの検査
    review.ts         復習のルール（純粋関数）
    stats.ts          苦手分析・おすすめ分野（純粋関数）
    storage.ts        学習記録の保存・古い版の変換・バックアップ
    importQuestions.ts 設定画面の「問題の追加」の検査
  state/AppState.tsx  学習記録の状態と保存
  screens/            ホーム・分野・ノート・ドリル・復習・分析・設定
  components/         RichText（分数・改行）、ドリル画面の部品、ノート表示など
  styles/index.css    見た目（色は CSS 変数。OSのダークモードに対応）
public/               アイコン
.github/workflows/    GitHub Pages への自動公開
```

### 学習記録（localStorage）

キーは `spi-trainer:data`。`{ version, settings, attempts, reviews, flags, importedQuestions }` を JSON で持ちます。
読み込むときは `migrate()`（`src/lib/storage.ts`）で形をそろえるので、壊れたデータや古い版でも落ちません。
形を変えるときは `DATA_VERSION` を上げ、`migrate()` に旧版からの変換を足してください。

### 復習のルール

間違えた・ヒントを使った・目安の2倍より時間がかかった問題は、翌日 → 3日後 → 7日後に出ます。
復習で要復習にならなければ次の間隔へ進み、7日後も合格すると卒業です。要復習なら翌日からやり直します。
生成問題は、2回目以降は同じ型で数字を変えた問題が出ます。

## 問題データの追加

### リポジトリに入れる（作成問題・ノート）

- 作成問題: `src/content/questions/<分野ID>.json` に問題の配列を書きます。`key` は `<分野ID>-001` のように3桁連番にします
- 解き方ノート: `src/content/notes/<分野ID>.json` に `Note` を1つ書きます
- 置くだけで自動で読み込まれます。`npm test` で形・重複・正解の書き忘れが検査されます
- 文字列の中では、改行は `\n`、分数は `{{分子/分母}}`（例: `{{3/5}}`）と書きます。画面では縦に積んだ分数で表示されます

### 生成問題の型を足す

`src/generators/<分野>.ts` に、`defineGenerator` で型を足します（見本は `profit.ts`）。
乱数は必ず渡された `rng` から取ります（`Math.random` は使わない）。同じ seed なら同じ問題になることが、復習の前提です。

### アプリの設定画面から足す（コード変更なし）

設定 → 問題の追加 に、問題のJSONを貼り付けるか、ファイルを選びます。

1. 「検査する」で形・正解・key の重複を検査します。エラーは問題ごとに表示され、1問でもエラーがあると1問も取り込みません
2. 通ったら「N問を取り込む」。端末の中に保存されます（`importedQuestions`）
3. 取り込んだ問題は「全部削除」でまとめて消せます。学習記録のバックアップにも含まれます

Claude.ai の返答にある ` ```json ` の囲みはそのまま貼れます。

## 公開手順（GitHub Pages）

1. GitHub に公開リポジトリを作ります（例: `spi-trainer`）。このフォルダの中身を `main` ブランチにプッシュします
2. **初回だけ手動設定**: リポジトリの Settings → Pages → Build and deployment → **Source を「GitHub Actions」** にします
3. `main` にプッシュするたびに、`.github/workflows/deploy.yml` が `npm ci` → `npm test` → `npm run build` → 公開を自動で行います
4. 公開URLは `https://<ユーザー名>.github.io/<リポジトリ名>/` です。スマホの Chrome で開き、メニューの「ホーム画面に追加」でアプリとして使えます

`vite.config.ts` の `base` は相対パス（`./`）にしてあるので、リポジトリ名が変わっても動きます。
画面の切り替えはハッシュ方式（`#/topics` など）です。

### 更新の反映

PWAは自動更新（`registerType: 'autoUpdate'`）です。新しい版を公開すると、次に開いたときに更新されます。表示が古いときは、アプリを一度閉じて開き直してください。

## バージョン

`package.json` の `version` と、`src/lib/version.ts` の `APP_VERSION`（設定画面に表示）を同じ値にそろえてください。
