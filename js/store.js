// アプリ全体の状態を持ち、変更を購読者（地図・サイドバー）に通知する。
// 状態は直接書き換えず、必ずここの関数を通して新しいオブジェクトに置き換える。
// こうしておくと「何が変わったか」を参照の比較だけで判定できる。

import { DEFAULT_BASEMAP } from './basemaps.js';
import { collectAttributes } from './features.js';

/** @typedef {import('./types.js').AppState} AppState */
/** @typedef {import('./types.js').LayerState} LayerState */
/** @typedef {import('./types.js').LayerStyle} LayerStyle */
/** @typedef {import('./types.js').GeoJSONFeatureCollection} GeoJSONFeatureCollection */
/** @typedef {(state: AppState, prev: AppState) => void} Listener */

// 新しいレイヤに順番に割り当てる単色
const LAYER_COLORS = ['#3388ff', '#e4572e', '#29a36a', '#9b5de5', '#f3a712', '#17a2b8'];

/** @type {AppState} */
let state = {
    basemap: DEFAULT_BASEMAP,
    layers: [],
};

/** @type {Set<Listener>} */
const listeners = new Set();

let nextId = 1;

export function getState() {
    return state;
}

/**
 * @param {Listener} listener
 * @returns {() => void} 購読解除の関数
 */
export function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** @param {AppState} next */
function setState(next) {
    const prev = state;
    state = next;
    listeners.forEach(fn => fn(state, prev));
}

/**
 * @param {number} id
 * @param {(layer: LayerState) => LayerState} fn
 */
function updateLayer(id, fn) {
    setState({
        ...state,
        layers: state.layers.map(l => (l.id === id ? fn(l) : l)),
    });
}

/**
 * 同名のレイヤがあれば「名前 (2)」のように番号を付ける
 * @param {string} name
 */
function uniqueName(name) {
    const names = new Set(state.layers.map(l => l.name));
    if (!names.has(name)) return name;
    let i = 2;
    while (names.has(`${name} (${i})`)) i++;
    return `${name} (${i})`;
}

/**
 * レイヤを一番上に追加する
 * @param {string} name
 * @param {GeoJSONFeatureCollection} data
 * @returns {LayerState}
 */
export function addLayer(name, data) {
    const id = nextId++;
    /** @type {LayerState} */
    const layer = {
        id,
        name: uniqueName(name),
        visible: true,
        data,
        attributes: collectAttributes(data.features),
        style: {
            attribute: '',
            classify: 'auto',
            color: LAYER_COLORS[(id - 1) % LAYER_COLORS.length],
            palette: 'YlOrRd',
            categoryColors: {},
        },
    };
    setState({ ...state, layers: [layer, ...state.layers] });
    return layer;
}

/** @param {number} id */
export function removeLayer(id) {
    setState({ ...state, layers: state.layers.filter(l => l.id !== id) });
}

/**
 * @param {number} id
 * @param {boolean} visible
 */
export function setVisible(id, visible) {
    updateLayer(id, l => ({ ...l, visible }));
}

/**
 * 並び順を変える
 * @param {number[]} ids 上から順のレイヤID
 */
export function reorderLayers(ids) {
    const byId = new Map(state.layers.map(l => [l.id, l]));
    const layers = ids.map(id => byId.get(id)).filter(l => l !== undefined);
    setState({ ...state, layers });
}

/**
 * スタイルの一部を変更する
 * @param {number} id
 * @param {Partial<LayerStyle>} patch
 */
export function setStyle(id, patch) {
    updateLayer(id, l => ({ ...l, style: { ...l.style, ...patch } }));
}

/**
 * カテゴリごとの色を変更する
 * @param {number} id
 * @param {string} attribute
 * @param {string} value
 * @param {string} color
 */
export function setCategoryColor(id, attribute, value, color) {
    updateLayer(id, l => {
        const current = l.style.categoryColors[attribute] || {};
        return {
            ...l,
            style: {
                ...l.style,
                categoryColors: {
                    ...l.style.categoryColors,
                    [attribute]: { ...current, [value]: color },
                },
            },
        };
    });
}

/** @param {string} key */
export function setBasemap(key) {
    if (state.basemap === key) return;
    setState({ ...state, basemap: key });
}
