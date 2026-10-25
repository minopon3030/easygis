// ファイル形式ごとの読み込み処理をまとめる。
// 新しい形式に対応するときは、LoadedLayer の配列を返す loader を作って LOADERS に足す。

import { geojsonLoader } from './geojson.js';
import { shapefileLoader, SHAPEFILE_SIDECARS } from './shapefile.js';
import { geopackageLoader } from './geopackage.js';
import { extensionOf, baseNameOf } from './util.js';

/** @typedef {import('../types.js').GeoJSONFeatureCollection} GeoJSONFeatureCollection */

/**
 * @typedef {Object} LoadedLayer
 * @property {string} name レイヤ名
 * @property {GeoJSONFeatureCollection} data 緯度経度（WGS84）の GeoJSON
 */

/**
 * @typedef {Object} Loader
 * @property {string[]} extensions 対応する拡張子（小文字、ドット付き）
 * @property {(file: File, related: Map<string, File>) => Promise<LoadedLayer[]>} load
 *   related は同時に選ばれた同名ファイル（拡張子 → File）。Shapefile の .dbf などに使う
 */

/**
 * @typedef {Object} LoadTask
 * @property {string} label 処理対象のファイル名
 * @property {() => Promise<{ layers: LoadedLayer[], errors: string[] }>} run
 */

/** @type {Loader[]} */
const LOADERS = [geojsonLoader, shapefileLoader, geopackageLoader];

/** file input の accept 属性に使う文字列 */
export const ACCEPT = [...LOADERS.flatMap(l => l.extensions), ...SHAPEFILE_SIDECARS].join(',');

/**
 * 選ばれたファイル群を、読み込み単位（タスク）に分ける。
 * Shapefile の .dbf / .prj などは単独では読まず、同名の .shp と一緒に処理する。
 * @param {File[]} files
 * @returns {LoadTask[]}
 */
export function planLoad(files) {
    /** @type {Map<string, Map<string, File>>} ベース名 → 拡張子 → File */
    const groups = new Map();
    for (const file of files) {
        const base = baseNameOf(file.name).toLowerCase();
        if (!groups.has(base)) groups.set(base, new Map());
        groups.get(base)?.set(extensionOf(file.name), file);
    }

    /** @type {LoadTask[]} */
    const tasks = [];
    for (const file of files) {
        const ext = extensionOf(file.name);
        const related = groups.get(baseNameOf(file.name).toLowerCase()) || new Map();

        if (SHAPEFILE_SIDECARS.includes(ext)) {
            // .shp があればそちらで一緒に読む。.shp がない場合は .dbf についてだけ知らせる
            if (!related.has('.shp') && ext === '.dbf') {
                tasks.push(failedTask(file.name,
                    `「${file.name}」だけでは読み込めません。同じ名前の .shp ファイルも一緒に選んでください（zip にまとめたものでも読めます）`));
            }
            continue;
        }

        const loader = LOADERS.find(l => l.extensions.includes(ext));
        if (!loader) {
            tasks.push(failedTask(file.name, `「${file.name}」は対応していない形式です（GeoJSON / Shapefile / GeoPackage に対応）`));
            continue;
        }

        tasks.push({
            label: file.name,
            run: async () => validate(file.name, await loader.load(file, related)),
        });
    }
    return tasks;
}

/**
 * @param {string} label
 * @param {string} message
 * @returns {LoadTask}
 */
function failedTask(label, message) {
    return { label, run: async () => ({ layers: [], errors: [message] }) };
}

/**
 * 地図に表示できないレイヤを除き、理由をメッセージにする
 * @param {string} filename
 * @param {LoadedLayer[]} loaded
 */
function validate(filename, loaded) {
    /** @type {LoadedLayer[]} */
    const layers = [];
    /** @type {string[]} */
    const errors = [];
    const label = (/** @type {LoadedLayer} */ l) => (loaded.length > 1 ? `「${filename}」のレイヤ「${l.name}」` : `「${filename}」`);

    for (const layer of loaded) {
        if (layer.data.features.length === 0) {
            if (loaded.length === 1) errors.push(`${label(layer)}には地物が含まれていません`);
        } else if (!looksLikeLonLat(layer.data)) {
            errors.push(
                `${label(layer)}の座標が緯度経度ではないようです。` +
                '座標系の情報（Shapefile なら .prj ファイル）が含まれているか確認してください'
            );
        } else {
            layers.push(layer);
        }
    }
    return { layers, errors };
}

/**
 * 最初に見つかった座標が緯度経度の範囲に入っているかを確かめる。
 * 座標系の情報がなく変換できなかったデータは、このままでは地図に表示できないため。
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
