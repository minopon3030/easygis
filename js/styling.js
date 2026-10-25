// スタイル設定（LayerStyle）から「地物ごとの色」と「凡例の中身」を計算する。
// 描画（Leaflet や DOM）には触らない。地図と凡例は同じ結果を使うので色がずれない。

import chroma from 'chroma-js';
import { getValue, toNumber, formatValue } from './features.js';

/** @typedef {import('./types.js').LayerState} LayerState */
/** @typedef {import('./types.js').GeoJSONFeature} GeoJSONFeature */

export const NO_DATA_LABEL = '(データなし)';
export const NO_DATA_COLOR = '#c8c8c8';
export const MAX_CATEGORIES = 20;

/** 数値の色分けで選べるパレット（値は chroma.js のパレット名） */
export const NUMERIC_PALETTES = [
    { key: 'YlOrRd', label: '黄→赤' },
    { key: 'Blues', label: '白→青' },
    { key: 'Greens', label: '白→緑' },
    { key: 'Viridis', label: '紫→黄（Viridis）' },
    { key: 'RdYlBu', label: '赤→黄→青' },
];

/**
 * パレットの代表色（凡例や見本の表示用）
 * @param {string} key パレット名
 * @param {number} [count]
 */
export function paletteColors(key, count = 7) {
    return chroma.scale(key).mode('lab').colors(count);
}

/**
 * @typedef {{ type: 'single', color: string }
 *   | { type: 'numeric', min: number, max: number, colors: string[], hasNoData: boolean }
 *   | { type: 'category', items: { value: string, color: string }[] }
 *   | { type: 'too-many', count: number, color: string }} Legend
 */

/**
 * @typedef {Object} Styler
 * @property {(feature: GeoJSONFeature) => string} colorOf 地物の色
 * @property {Legend} legend
 * @property {boolean} numericAvailable 選択中の属性が数値として扱えるか
 */

/**
 * 属性の値を調べる
 * @param {GeoJSONFeature[]} features
 * @param {string} attr
 */
export function analyzeAttribute(features, attr) {
    let numeric = true;
    let hasData = false;
    let hasNoData = false;
    let min = Infinity;
    let max = -Infinity;
    const categories = new Set();

    for (const f of features) {
        const v = getValue(f, attr);
        if (v === null) {
            hasNoData = true;
            continue;
        }
        hasData = true;
        categories.add(formatValue(v));
        const n = toNumber(v);
        if (n === null) {
            numeric = false;
        } else {
            if (n < min) min = n;
            if (n > max) max = n;
        }
    }

    const sorted = [...categories].sort((a, b) => a.localeCompare(b, 'ja', { numeric: true }));
    if (hasNoData) sorted.push(NO_DATA_LABEL);

    return { numeric: hasData && numeric, min, max, hasNoData, categories: sorted };
}

/**
 * @param {LayerState} layer
 * @returns {Styler}
 */
export function buildStyler(layer) {
    const { attribute, classify, color } = layer.style;
    const features = layer.data.features;

    if (!attribute) {
        return { colorOf: () => color, legend: { type: 'single', color }, numericAvailable: false };
    }

    const info = analyzeAttribute(features, attribute);
    const useNumeric = info.numeric && classify !== 'category';

    if (useNumeric) {
        return { ...numericStyler(layer, info), numericAvailable: true };
    }
    return { ...categoryStyler(layer, info.categories), numericAvailable: info.numeric };
}

/**
 * 連続値の色分け
 * @param {LayerState} layer
 * @param {ReturnType<typeof analyzeAttribute>} info
 */
function numericStyler(layer, info) {
    const { attribute, palette } = layer.style;
    const { min, max, hasNoData } = info;
    const scale = chroma.scale(palette).domain([min, max]).mode('lab');

    return {
        colorOf: (/** @type {GeoJSONFeature} */ f) => {
            const n = toNumber(getValue(f, attribute));
            if (n === null) return NO_DATA_COLOR;
            // 全部同じ値のときは真ん中の色にする
            return min === max ? scale((min + max) / 2).hex() : scale(n).hex();
        },
        legend: /** @type {Legend} */ ({
            type: 'numeric',
            min,
            max,
            colors: paletteColors(palette),
            hasNoData,
        }),
    };
}

/**
 * カテゴリごとの色分け
 * @param {LayerState} layer
 * @param {string[]} categories
 */
function categoryStyler(layer, categories) {
    const { attribute, color, categoryColors } = layer.style;

    if (categories.length > MAX_CATEGORIES) {
        return {
            colorOf: () => color,
            legend: /** @type {Legend} */ ({ type: 'too-many', count: categories.length, color }),
        };
    }

    const overrides = categoryColors[attribute] || {};
    const defaults = defaultCategoryColors(categories.filter(c => c !== NO_DATA_LABEL).length);
    /** @type {Map<string, string>} */
    const colorMap = new Map();
    let i = 0;
    for (const cat of categories) {
        const fallback = cat === NO_DATA_LABEL ? NO_DATA_COLOR : defaults[i++];
        colorMap.set(cat, overrides[cat] || fallback);
    }

    return {
        colorOf: (/** @type {GeoJSONFeature} */ f) => {
            const v = getValue(f, attribute);
            return colorMap.get(v === null ? NO_DATA_LABEL : formatValue(v)) || NO_DATA_COLOR;
        },
        legend: /** @type {Legend} */ ({
            type: 'category',
            items: categories.map(value => ({ value, color: /** @type {string} */ (colorMap.get(value)) })),
        }),
    };
}

/** @param {number} n */
function defaultCategoryColors(n) {
    if (n <= 0) return [];
    // 少ないときは見分けやすい定番パレット、多いときは虹色系から等間隔に取る
    if (n <= 8) return chroma.brewer.Set2.slice(0, n);
    return chroma.scale('Spectral').mode('lab').colors(n);
}
