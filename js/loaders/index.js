// ファイル形式ごとの読み込み処理をまとめる。
// 新しい形式に対応するときは、GeoJSON の FeatureCollection を返す loader を作って LOADERS に足す。

import { geojsonLoader } from './geojson.js';

/** @typedef {import('../types.js').GeoJSONFeatureCollection} GeoJSONFeatureCollection */

/**
 * @typedef {Object} Loader
 * @property {string[]} extensions 対応する拡張子（小文字、ドット付き）
 * @property {(file: File) => Promise<GeoJSONFeatureCollection>} load
 */

/** @type {Loader[]} */
const LOADERS = [geojsonLoader];

/** file input の accept 属性に使う文字列 */
export const ACCEPT = LOADERS.flatMap(l => l.extensions).join(',');

/** @param {string} filename */
function extensionOf(filename) {
    const i = filename.lastIndexOf('.');
    return i >= 0 ? filename.slice(i).toLowerCase() : '';
}

/**
 * ファイルを読み込んでレイヤ名と GeoJSON を返す。
 * 失敗したときはユーザーに見せるメッセージ付きの Error を投げる。
 * @param {File} file
 * @returns {Promise<{ name: string, data: GeoJSONFeatureCollection }>}
 */
export async function loadFile(file) {
    const ext = extensionOf(file.name);
    const loader = LOADERS.find(l => l.extensions.includes(ext));
    if (!loader) {
        throw new Error(`「${file.name}」は対応していない形式です（対応形式: ${ACCEPT}）`);
    }

    const data = await loader.load(file);
    if (data.features.length === 0) {
        throw new Error(`「${file.name}」には地物が含まれていません`);
    }
    if (!looksLikeLonLat(data)) {
        throw new Error(
            `「${file.name}」の座標が緯度経度ではないようです。` +
            'QGIS などで座標系を WGS84（EPSG:4326）に変換してから読み込んでください'
        );
    }

    const name = ext ? file.name.slice(0, -ext.length) : file.name;
    return { name, data };
}

/**
 * 最初に見つかった座標が緯度経度の範囲に入っているかを確かめる。
 * 平面直角座標系などのデータは、このままでは地図に表示できないため。
 * @param {GeoJSONFeatureCollection} data
 */
function looksLikeLonLat(data) {
    for (const f of data.features) {
        const coord = firstCoordinate(f.geometry);
        if (coord) {
            const [x, y] = coord;
            return Math.abs(x) <= 180 && Math.abs(y) <= 90;
        }
    }
    return true;
}

/**
 * @param {any} geometry
 * @returns {number[]|null}
 */
function firstCoordinate(geometry) {
    if (!geometry) return null;
    if (geometry.type === 'GeometryCollection') {
        for (const g of geometry.geometries || []) {
            const c = firstCoordinate(g);
            if (c) return c;
        }
        return null;
    }
    let c = geometry.coordinates;
    while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
    return Array.isArray(c) && typeof c[0] === 'number' ? c : null;
}
