// 型の定義（JSDoc）。エディタの補完用で、実行時には何もしない。

/**
 * @typedef {Object} LayerStyle
 * @property {string} attribute 色分けに使う属性名。"" なら単色
 * @property {'auto'|'numeric'|'category'} classify 値の扱い方。auto は値を見て自動判定
 * @property {string} color 単色表示のときの色
 * @property {string} palette 数値で色分けするときのカラーパレット名（chroma.js / ColorBrewer）
 * @property {Object<string, Object<string, string>>} categoryColors 属性名 → 値 → 色。ユーザーが変更した色だけ入る
 * @property {string} label 地物の上に表示する属性名。"" なら表示しない
 */

/**
 * @typedef {Object} LayerState
 * @property {number} id
 * @property {string} name
 * @property {boolean} visible
 * @property {GeoJSONFeatureCollection} data
 * @property {string[]} attributes 全地物に現れる属性名の一覧
 * @property {LayerStyle} style
 */

/**
 * @typedef {Object} AppState
 * @property {string} basemap 背景地図の key
 * @property {LayerState[]} layers 先頭ほど上に描画される
 */

/**
 * @typedef {Object} GeoJSONFeatureCollection
 * @property {'FeatureCollection'} type
 * @property {GeoJSONFeature[]} features
 */

/**
 * @typedef {Object} GeoJSONFeature
 * @property {'Feature'} type
 * @property {Object|null} geometry
 * @property {Object<string, any>} properties
 */

export {};
