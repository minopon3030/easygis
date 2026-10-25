// GeoPackage（.gpkg）の読み込み。中身は SQLite なので sql.js で開き、
// ジオメトリ（GeoPackage バイナリ = ヘッダ + WKB）は自前で GeoJSON に変換する。
// 座標系が緯度経度でなければ proj4 で WGS84 に変換する。

import { baseNameOf, loadScript } from './util.js';

/** @typedef {import('./index.js').LoadedLayer} LoadedLayer */
/** @typedef {import('../types.js').GeoJSONFeature} GeoJSONFeature */

// sql.js は ES Modules 形式で配布されていないため、import map ではなくここで URL を指定する
const SQL_JS_BASE = 'https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/';

/** @type {Promise<any>|null} */
let sqlPromise = null;

function loadSqlJs() {
    if (!sqlPromise) {
        sqlPromise = loadScript(`${SQL_JS_BASE}sql-wasm.js`).then(() =>
            /** @type {any} */ (window).initSqlJs({ locateFile: (/** @type {string} */ f) => SQL_JS_BASE + f })
        );
    }
    return sqlPromise;
}

/** @type {import('./index.js').Loader} */
export const geopackageLoader = {
    extensions: ['.gpkg'],

    async load(file) {
        const [SQL, { default: proj4 }] = await Promise.all([loadSqlJs(), import('proj4')]);

        let db;
        try {
            db = new SQL.Database(new Uint8Array(await file.arrayBuffer()));
        } catch {
            throw new Error(`「${file.name}」を開けませんでした。ファイルが壊れていないか確認してください`);
        }

        try {
            /** @type {{ table: string, column: string, srsId: number }[]} */
            let tables;
            try {
                tables = queryAll(db,
                    `SELECT c.table_name AS tbl, g.column_name AS col, g.srs_id AS srs
                     FROM gpkg_contents c JOIN gpkg_geometry_columns g ON c.table_name = g.table_name
                     WHERE c.data_type = 'features'`
                ).map(r => ({ table: r.tbl, column: r.col, srsId: r.srs }));
            } catch {
                throw new Error(`「${file.name}」は GeoPackage 形式ではないようです`);
            }
            if (tables.length === 0) {
                throw new Error(`「${file.name}」にはベクターデータのレイヤが含まれていません`);
            }

            return tables.map(({ table, column, srsId }) => {
                const transform = makeTransform(db, srsId, proj4, file.name);
                const features = readFeatures(db, table, column, transform);
                return {
                    name: tables.length === 1 ? baseNameOf(file.name) : table,
                    data: { type: 'FeatureCollection', features },
                };
            });
        } finally {
            db.close();
        }
    },
};

/**
 * @param {any} db
 * @param {string} sql
 * @param {any[]} [params]
 * @returns {Record<string, any>[]}
 */
function queryAll(db, sql, params = []) {
    const stmt = db.prepare(sql);
    try {
        stmt.bind(params);
        const rows = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        return rows;
    } finally {
        stmt.free();
    }
}

/**
 * @param {any} db
 * @param {string} table
 * @param {string} geomColumn
 * @param {((c: number[]) => number[]) | null} transform
 * @returns {GeoJSONFeature[]}
 */
function readFeatures(db, table, geomColumn, transform) {
    const quoted = `"${table.replace(/"/g, '""')}"`;
    return queryAll(db, `SELECT * FROM ${quoted}`).map(row => {
        /** @type {Record<string, any>} */
        const properties = {};
        for (const [key, value] of Object.entries(row)) {
            if (key === geomColumn) continue;
            properties[key] = value instanceof Uint8Array ? '(バイナリ)' : value;
        }
        const blob = row[geomColumn];
        let geometry = blob instanceof Uint8Array ? parseGpkgGeometry(blob) : null;
        if (geometry && transform) geometry = transformGeometry(geometry, transform);
        return { type: 'Feature', geometry, properties };
    });
}

/**
 * 座標系 srsId から WGS84 への変換関数を作る。変換不要なら null
 * @param {any} db
 * @param {number} srsId
 * @param {any} proj4
 * @param {string} filename
 */
function makeTransform(db, srsId, proj4, filename) {
    // 4326: WGS84、0 / -1: 座標系未定義（そのまま使う）
    if (srsId === 4326 || srsId === 0 || srsId === -1) return null;

    const [srs] = queryAll(db,
        'SELECT organization, organization_coordsys_id AS code, definition FROM gpkg_spatial_ref_sys WHERE srs_id = ?',
        [srsId]);
    if (!srs) return null;
    if (String(srs.organization).toUpperCase() === 'EPSG' && srs.code === 4326) return null;

    try {
        const converter = proj4(srs.definition, 'EPSG:4326');
        return (/** @type {number[]} */ c) => converter.forward([c[0], c[1]]);
    } catch (err) {
        console.error(err);
        throw new Error(
            `「${filename}」の座標系（${srs.organization}:${srs.code}）を変換できませんでした。` +
            'QGIS などで WGS84（EPSG:4326）に変換してから読み込んでください'
        );
    }
}

/**
 * @param {any} geometry
 * @param {(c: number[]) => number[]} fn
 * @returns {any}
 */
function transformGeometry(geometry, fn) {
    if (geometry.type === 'GeometryCollection') {
        return { ...geometry, geometries: geometry.geometries.map((/** @type {any} */ g) => transformGeometry(g, fn)) };
    }
    /** @param {any} c @returns {any} */
    const walk = c => (typeof c[0] === 'number' ? fn(c) : c.map(walk));
    return { ...geometry, coordinates: walk(geometry.coordinates) };
}

// ---- GeoPackage バイナリ / WKB の解析 ----

/**
 * GeoPackage のジオメトリ（"GP" ヘッダ + WKB）を GeoJSON ジオメトリにする
 * @param {Uint8Array} bytes
 */
export function parseGpkgGeometry(bytes) {
    if (bytes[0] !== 0x47 || bytes[1] !== 0x50) return null; // "GP"
    const flags = bytes[3];
    const isEmpty = (flags >> 4) & 1;
    if (isEmpty) return null;
    const envelopeSize = [0, 32, 48, 48, 64][(flags >> 1) & 7] ?? 0;
    const offset = 8 + envelopeSize;
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.byteLength - offset);
    return readWkb({ view, pos: 0 });
}

const WKB_TYPES = ['', 'Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon', 'GeometryCollection'];

/**
 * @param {{ view: DataView, pos: number }} r 読み取り位置を持つオブジェクト
 * @returns {any}
 */
function readWkb(r) {
    const little = r.view.getUint8(r.pos) === 1;
    r.pos += 1;
    let type = r.view.getUint32(r.pos, little);
    r.pos += 4;

    // Z / M 付きの判定（ISO 形式: 1000 番台 = Z, 2000 番台 = M, 3000 番台 = ZM。EWKB 形式: 上位ビット）
    let dims = 2;
    if (type & 0x80000000) dims++;
    if (type & 0x40000000) dims++;
    if (type & 0x20000000) r.pos += 4; // SRID 付き EWKB
    type &= 0x0fffffff;
    const iso = Math.floor(type / 1000);
    if (iso === 1 || iso === 2) dims = 3;
    if (iso === 3) dims = 4;
    type %= 1000;

    const u32 = () => {
        const v = r.view.getUint32(r.pos, little);
        r.pos += 4;
        return v;
    };
    const point = () => {
        const x = r.view.getFloat64(r.pos, little);
        const y = r.view.getFloat64(r.pos + 8, little);
        r.pos += 8 * dims; // Z / M は使わない
        return [x, y];
    };
    const points = () => Array.from({ length: u32() }, point);
    const parts = () => Array.from({ length: u32() }, () => readWkb(r));

    const name = WKB_TYPES[type];
    switch (type) {
        case 1: {
            const c = point();
            return Number.isNaN(c[0]) ? null : { type: name, coordinates: c };
        }
        case 2: return { type: name, coordinates: points() };
        case 3: return { type: name, coordinates: Array.from({ length: u32() }, points) };
        case 4:
        case 5:
        case 6: return { type: name, coordinates: parts().filter(g => g).map(g => g.coordinates) };
        case 7: return { type: name, geometries: parts().filter(g => g) };
        default:
            throw new Error('曲線などを含むジオメトリには対応していません');
    }
}
