// Shapefile の読み込み（zip にまとめたもの、または .shp と .dbf などを一緒に選んだもの）
// ライブラリは最初に使うときに読み込む。

import { baseNameOf, extensionOf } from './util.js';

/** @typedef {import('./index.js').LoadedLayer} LoadedLayer */

/** .shp と一緒に使う付属ファイル。単独では読み込まない */
export const SHAPEFILE_SIDECARS = ['.dbf', '.prj', '.cpg', '.shx', '.sbn', '.sbx', '.qix', '.qmd'];

/**
 * @typedef {Object} ShapefileParts
 * @property {string} name
 * @property {Uint8Array} shp
 * @property {Uint8Array} [dbf]
 * @property {Uint8Array} [prj]
 * @property {Uint8Array} [cpg]
 */

/** @type {import('./index.js').Loader} */
export const shapefileLoader = {
    extensions: ['.zip', '.shp'],

    async load(file, related) {
        const partsList = extensionOf(file.name) === '.zip'
            ? await partsFromZip(file)
            : [await partsFromFiles(file, related)];

        const { parseShp, parseDbf, combine } = await import('shpjs');

        return partsList.map(parts => {
            const prj = parts.prj ? new TextDecoder().decode(parts.prj) : undefined;
            let geometries;
            try {
                geometries = parseShp(parts.shp, prj);
            } catch (err) {
                console.error(err);
                throw new Error(`「${parts.name}.shp」を読み込めませんでした。ファイルが壊れていないか確認してください`);
            }
            const properties = parts.dbf ? parseDbf(parts.dbf, dbfEncoding(parts)) : undefined;
            const fc = combine([geometries, properties]);
            return {
                name: partsList.length === 1 ? baseNameOf(file.name) : parts.name,
                data: { type: 'FeatureCollection', features: fc.features },
            };
        });
    },
};

/**
 * zip を展開し、含まれる .shp ごとに付属ファイルをまとめる
 * @param {File} file
 * @returns {Promise<ShapefileParts[]>}
 */
async function partsFromZip(file) {
    const { unzipSync } = await import('fflate');
    /** @type {Record<string, Uint8Array>} */
    let entries;
    try {
        entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
    } catch {
        throw new Error(`「${file.name}」を展開できませんでした。zip ファイルが壊れていないか確認してください`);
    }

    /** @type {Map<string, { name: string, files: Map<string, Uint8Array> }>} パス（拡張子なし）ごと */
    const groups = new Map();
    for (const [path, data] of Object.entries(entries)) {
        if (path.includes('__MACOSX/') || path.endsWith('/')) continue;
        const ext = extensionOf(path);
        const key = path.slice(0, path.length - ext.length).toLowerCase();
        if (!groups.has(key)) groups.set(key, { name: baseNameOf(path), files: new Map() });
        groups.get(key)?.files.set(ext, data);
    }

    /** @type {ShapefileParts[]} */
    const list = [];
    for (const { name, files } of groups.values()) {
        const shp = files.get('.shp');
        if (!shp) continue;
        list.push({ name, shp, dbf: files.get('.dbf'), prj: files.get('.prj'), cpg: files.get('.cpg') });
    }
    if (list.length === 0) {
        throw new Error(`「${file.name}」の中に Shapefile（.shp）が見つかりませんでした`);
    }
    return list;
}

/**
 * 一緒に選ばれた同名ファイルから付属ファイルを集める
 * @param {File} shpFile
 * @param {Map<string, File>} related
 * @returns {Promise<ShapefileParts>}
 */
async function partsFromFiles(shpFile, related) {
    /** @param {string} ext */
    const read = async ext => {
        const f = related.get(ext);
        return f ? new Uint8Array(await f.arrayBuffer()) : undefined;
    };
    return {
        name: baseNameOf(shpFile.name),
        shp: new Uint8Array(await shpFile.arrayBuffer()),
        dbf: await read('.dbf'),
        prj: await read('.prj'),
        cpg: await read('.cpg'),
    };
}

/**
 * .dbf（属性）の文字コードを決める。
 * .cpg があればそれに従い、なければ中身から UTF-8 か Shift_JIS かを判定する
 * （日本の Shapefile は .cpg なしの Shift_JIS が多い）。
 * @param {ShapefileParts} parts
 * @returns {string}
 */
function dbfEncoding(parts) {
    if (parts.cpg) {
        const declared = normalizeEncoding(new TextDecoder().decode(parts.cpg));
        if (declared) return declared;
    }

    const dbf = /** @type {Uint8Array} */ (parts.dbf);
    // 29 バイト目の言語ドライバ ID。0x13 は Shift_JIS（コードページ 932）
    if (dbf[29] === 0x13) return 'shift_jis';

    // ヘッダの後ろ（レコード部分）が UTF-8 として正しく読めるか
    const headerLength = dbf[8] | (dbf[9] << 8);
    try {
        new TextDecoder('utf-8', { fatal: true }).decode(dbf.subarray(headerLength));
        return 'utf-8';
    } catch {
        return 'shift_jis';
    }
}

/**
 * .cpg に書かれた文字コード名を TextDecoder が理解できる名前にする。わからなければ null
 * @param {string} name
 */
function normalizeEncoding(name) {
    const n = name.trim().toLowerCase();
    if (/^(utf-?8|65001)$/.test(n)) return 'utf-8';
    if (/932|sjis|shift[-_]?jis/.test(n)) return 'shift_jis';
    if (/^\d+$/.test(n)) return `windows-${n}`;
    try {
        new TextDecoder(n);
        return n;
    } catch {
        return null;
    }
}
