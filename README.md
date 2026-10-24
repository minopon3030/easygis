# Easy GIS Viewer

GIS に慣れていない人でも、ブラウザだけでベクターデータを閲覧し、簡単な色分け地図を作れるツールです。

## できること

- GeoJSON（`.geojson` / `.json`）の読み込み（ボタン、またはドラッグ＆ドロップ）
- レイヤの表示 ON/OFF・削除・重なり順の変更（カードをドラッグ）
- 属性による色分け
  - 数値: グラデーション（配色を選択可）
  - 文字: 値ごとに色分け（凡例の色をクリックして変更可）
- 地物をクリックして属性を表示
- 背景地図の切替（地理院地図 淡色・標準・写真、OpenStreetMap）

## 動かし方

ES Modules を使っているため、`index.html` をダブルクリックで開くと動きません。
簡易サーバー経由で開いてください（GitHub Pages などに置く場合はそのまま動きます）。

```bash
python3 -m http.server 8000
```

ブラウザで http://localhost:8000/ を開きます。VS Code の Live Server でも構いません。

## サンプルデータ

`samples/` に動作確認用の GeoJSON があります。札幌周辺に配置した**架空のデータ**で、実際の統計や施設とは関係ありません。

| ファイル | 種類 | 主な属性 | 試せること |
| --- | --- | --- | --- |
| `mesh_population.geojson` | ポリゴン 80件 | 人口・世帯数（数値、一部空欄）、土地利用 | 数値のグラデーション、(データなし) の表示 |
| `facilities.geojson` | ポイント 30件 | 名称、種別、定員（公園は空欄）、開設年 | カテゴリの色分け、数値をカテゴリとして扱う |
| `roads.geojson` | ライン 5件 | 路線名、種別、車線数 | ラインの色分け、重なり順の変更 |

## ファイル構成

```
index.html            画面の枠と import map（外部ライブラリのバージョン管理）
css/style.css
js/main.js            起動。各部品を作ってつなぐ、ファイル追加・ドロップ処理
js/store.js           アプリの状態（レイヤ一覧・スタイル設定）と変更通知
js/mapView.js         状態を Leaflet の地図に反映
js/sidebar.js         レイヤ一覧・色分け設定・凡例の UI
js/styling.js         スタイル設定 → 地物の色と凡例の中身を計算
js/features.js        属性値の取り出し・判定などの小さな関数
js/basemaps.js        背景地図の定義
js/loaders/index.js   ファイル形式ごとの読み込み処理の登録
js/loaders/geojson.js GeoJSON の読み込み
js/notify.js          画面下のメッセージ表示
js/types.js           JSDoc の型定義
samples/              動作確認用のサンプルデータ（架空）
legacy/               作り直す前の旧バージョン
```

### データの流れ

1. 操作（ファイル追加、色の変更など）は `store.js` の関数を呼ぶ
2. `store` が状態を新しいオブジェクトに置き換え、購読者に通知する
3. `mapView` と `sidebar` が新しい状態を見て、変わった部分だけ描き直す

### 拡張のしかた

- **新しいファイル形式**: `js/loaders/` に GeoJSON の FeatureCollection を返す loader を作り、`loaders/index.js` の `LOADERS` に追加する
- **新しい色分け方法**: `styling.js` の `buildStyler` に方式を追加し、`sidebar.js` に設定 UI を足す
- **背景地図の追加**: `basemaps.js` の `BASEMAPS` に追加する
