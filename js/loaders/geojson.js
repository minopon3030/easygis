// GeoJSON ファイルの読み込み

/** @typedef {import('../types.js').GeoJSONFeatureCollection} GeoJSONFeatureCollection */
/** @typedef {import('../types.js').GeoJSONFeature} GeoJSONFeature */

const GEOMETRY_TYPES = [
    'Point', 'MultiPoint', 'LineString', 'MultiLineString',
    'Polygon', 'MultiPolygon', 'GeometryCollection',
];

/** @type {import('./index.js').Loader} */
export const geojsonLoader = {
    extensions: ['.geojson', '.json'],

    async load(file) {
        const text = await file.text();
        let json;
        try {
            json = JSON.parse(text);
        } catch {
            throw new Error(`「${file.name}」を読み込めませんでした。ファイルが壊れていないか確認してください`);
        }
        const fc = toFeatureCollection(json);
        if (!fc) {
            throw new Error(`「${file.name}」は GeoJSON 形式ではないようです`);
        }
        return fc;
    },
};

/**
 * FeatureCollection / Feature / ジオメトリ単体のどれでも FeatureCollection にそろえる
 * @param {any} json
 * @returns {GeoJSONFeatureCollection|null}
 */
function toFeatureCollection(json) {
    if (!json || typeof json !== 'object') return null;

    /** @type {any[]} */
    let features;
    if (json.type === 'FeatureCollection' && Array.isArray(json.features)) {
        features = json.features;
    } else if (json.type === 'Feature') {
        features = [json];
    } else if (GEOMETRY_TYPES.includes(json.type)) {
        features = [{ type: 'Feature', geometry: json, properties: {} }];
    } else {
        return null;
    }

    return {
        type: 'FeatureCollection',
        features: features
            .filter(f => f && f.type === 'Feature')
            .map(f => /** @type {GeoJSONFeature} */ ({ ...f, properties: f.properties || {} })),
    };
}
