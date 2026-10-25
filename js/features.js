// 地物（GeoJSON Feature）の属性を扱う小さな関数群

/** @typedef {import('./types.js').GeoJSONFeature} GeoJSONFeature */

/**
 * 全地物から属性名を出現順に集める
 * @param {GeoJSONFeature[]} features
 * @returns {string[]}
 */
export function collectAttributes(features) {
    const names = new Set();
    for (const f of features) {
        for (const key of Object.keys(f.properties || {})) {
            names.add(key);
        }
    }
    return [...names];
}

/**
 * 属性値を取り出す。空（null / undefined / 空文字）は null を返す
 * @param {GeoJSONFeature} feature
 * @param {string} attr
 */
export function getValue(feature, attr) {
    const v = feature.properties ? feature.properties[attr] : undefined;
    if (v === null || v === undefined) return null;
    if (typeof v === 'number' && Number.isNaN(v)) return null;
    if (v instanceof Date && Number.isNaN(v.getTime())) return null;
    if (typeof v === 'string' && v.trim() === '') return null;
    return v;
}

/**
 * 値を数値として解釈できれば数値を、できなければ null を返す
 * @param {any} v
 * @returns {number|null}
 */
export function toNumber(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

/**
 * 表示用の文字列にする
 * @param {any} v
 */
export function formatValue(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number' && Number.isNaN(v)) return '';
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toLocaleDateString('ja-JP');
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
}

/**
 * 数値を見やすい桁数で表示する
 * @param {number} n
 */
export function formatNumber(n) {
    return n.toLocaleString('ja-JP', { maximumFractionDigits: 2 });
}
