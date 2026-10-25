// 状態（store）を Leaflet の地図に反映する。
// 全レイヤで 1 枚の canvas を共有し、bringToFront で重なり順を付ける
// （レイヤごとに canvas を分けると、上の canvas が下のレイヤのクリックを奪ってしまう）。

import * as L from 'leaflet';
import { BASEMAPS } from './basemaps.js';
import { buildStyler } from './styling.js';
import { formatValue, getValue } from './features.js';
import * as store from './store.js';

/** @typedef {import('./types.js').AppState} AppState */
/** @typedef {import('./types.js').LayerState} LayerState */
/** @typedef {import('./types.js').LayerStyle} LayerStyle */

/**
 * @typedef {Object} LayerView
 * @property {L.GeoJSON} group
 * @property {LayerStyle|null} style 最後に適用したスタイル
 * @property {LayerState} layer 最後に反映したレイヤの状態
 * @property {L.LayerGroup} labels ラベル（L.Tooltip）を入れる
 * @property {Map<L.Layer, L.LatLng>} anchors 地物ごとのラベル位置（計算結果の再利用）
 * @property {string} labelKey 最後にラベルを描いたときの設定
 */

// 画面内のラベルがこれより多いときは表示しない（文字だらけで読めず、動作も重くなるため）
const MAX_LABELS = 300;

/**
 * @param {HTMLElement} element
 */
export function createMapView(element) {
    const renderer = L.canvas();
    const map = L.map(element, {
        center: [44, 142.5],
        zoom: 7,
        renderer,
    });

    // ---- 背景地図 ----

    /** @type {Map<string, L.TileLayer>} */
    const basemapLayers = new Map();
    /** @type {Object<string, L.TileLayer>} */
    const baseControlItems = {};
    for (const def of BASEMAPS) {
        const tile = L.tileLayer(def.url, def.options);
        basemapLayers.set(def.key, tile);
        baseControlItems[def.label] = tile;
    }

    L.control.layers(baseControlItems, undefined, { position: 'topright', collapsed: true }).addTo(map);
    L.control.scale({ position: 'bottomright', imperial: false }).addTo(map);

    map.on('baselayerchange', e => {
        for (const [key, tile] of basemapLayers) {
            if (tile === e.layer) store.setBasemap(key);
        }
    });

    /** @param {string} key */
    function showBasemap(key) {
        const target = basemapLayers.get(key);
        if (!target || map.hasLayer(target)) return;
        basemapLayers.forEach(tile => map.removeLayer(tile));
        map.addLayer(target);
    }

    // ---- データレイヤ ----

    /** @type {Map<number, LayerView>} */
    const views = new Map();

    // 最後に適用した重なり順（表示中のレイヤIDを上から並べたもの）
    let appliedOrder = '';

    /** @param {LayerState} layer */
    function createView(layer) {
        const group = L.geoJSON(/** @type {any} */ (layer.data), {
            pointToLayer: (_feature, latlng) => L.circleMarker(latlng),
            onEachFeature: (feature, l) => {
                l.bindPopup(() => buildPopup(feature.properties), { maxWidth: 360 });
            },
        });
        return { group, style: null, layer, labels: L.layerGroup().addTo(map), anchors: new Map(), labelKey: '' };
    }

    /**
     * 表示範囲内の地物にラベルを付け直す
     * @param {LayerView} view
     */
    function refreshLabels(view) {
        const { layer, labels } = view;
        labels.clearLayers();
        const attr = layer.style.label;
        if (!attr || !layer.visible) return;

        const bounds = map.getBounds().pad(0.1);
        /** @type {{ pos: L.LatLng, text: string, point: boolean }[]} */
        const items = [];
        view.group.eachLayer(l => {
            const value = getValue(/** @type {any} */ (l).feature, attr);
            if (value === null) return;
            const pos = anchorOf(view, l);
            if (bounds.contains(pos)) {
                items.push({ pos, text: formatValue(value), point: l instanceof L.CircleMarker });
            }
        });
        if (items.length > MAX_LABELS) return;

        for (const { pos, text, point } of items) {
            const content = document.createElement('span');
            content.textContent = text;
            labels.addLayer(L.tooltip({
                permanent: true,
                interactive: false,
                className: 'map-label',
                direction: point ? 'right' : 'center',
                offset: point ? [4, 0] : [0, 0],
            }).setLatLng(pos).setContent(content));
        }
    }

    /**
     * ラベルを置く位置。点はその位置、線とポリゴンは中心
     * @param {LayerView} view
     * @param {L.Layer} l
     */
    function anchorOf(view, l) {
        let pos = view.anchors.get(l);
        if (!pos) {
            if (l instanceof L.CircleMarker) {
                pos = l.getLatLng();
            } else {
                const path = /** @type {L.Polyline} */ (l);
                try {
                    pos = path.getCenter();
                } catch {
                    pos = path.getBounds().getCenter();
                }
            }
            view.anchors.set(l, pos);
        }
        return pos;
    }

    map.on('moveend', () => views.forEach(refreshLabels));

    /**
     * @param {AppState} state
     * @param {AppState} prev
     */
    function render(state, prev) {
        if (state.basemap !== prev.basemap) showBasemap(state.basemap);

        // 削除されたレイヤ
        const ids = new Set(state.layers.map(l => l.id));
        for (const [id, view] of views) {
            if (!ids.has(id)) {
                map.removeLayer(view.group);
                map.removeLayer(view.labels);
                views.delete(id);
            }
        }

        for (const layer of state.layers) {
            let view = views.get(layer.id);
            if (!view) {
                view = createView(layer);
                views.set(layer.id, view);
            }

            if (view.style !== layer.style) {
                applyStyle(view.group, layer);
                view.style = layer.style;
            }

            const shown = map.hasLayer(view.group);
            if (layer.visible && !shown) map.addLayer(view.group);
            if (!layer.visible && shown) map.removeLayer(view.group);

            view.layer = layer;
            const labelKey = `${layer.visible}|${layer.style.label}`;
            if (labelKey !== view.labelKey) {
                refreshLabels(view);
                view.labelKey = labelKey;
            }
        }

        // 再表示したレイヤは一番上に描かれてしまうので、順序が変わったら下から積み直す
        const visible = state.layers.filter(l => l.visible);
        const order = visible.map(l => l.id).join(',');
        if (order !== appliedOrder) {
            for (const layer of [...visible].reverse()) {
                views.get(layer.id)?.group.bringToFront();
            }
            appliedOrder = order;
        }
    }

    store.subscribe(render);
    showBasemap(store.getState().basemap);

    return {
        map,

        /** @param {number} id */
        zoomToLayer(id) {
            const view = views.get(id);
            if (!view) return;
            const bounds = view.group.getBounds();
            if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20], maxZoom: 17 });
        },
    };
}

/**
 * @param {L.GeoJSON} group
 * @param {LayerState} layer
 */
function applyStyle(group, layer) {
    const styler = buildStyler(layer);
    group.eachLayer(l => {
        const path = /** @type {L.Path & { feature: any }} */ (l);
        path.setStyle(pathOptions(path, styler.colorOf(path.feature)));
    });
}

/**
 * ジオメトリの種類に合わせた描画オプション
 * @param {L.Layer} l
 * @param {string} color
 * @returns {L.CircleMarkerOptions}
 */
function pathOptions(l, color) {
    if (l instanceof L.CircleMarker) {
        return { radius: 5, color: '#ffffff', weight: 1, fillColor: color, fillOpacity: 0.9 };
    }
    if (l instanceof L.Polygon) {
        return { color, weight: 1, opacity: 1, fillColor: color, fillOpacity: 0.6 };
    }
    // ライン
    return { color, weight: 2.5, opacity: 0.9 };
}

/**
 * 属性一覧のポップアップ。値は textContent で入れる（HTML として解釈させない）
 * @param {Object<string, any>} properties
 */
function buildPopup(properties) {
    const keys = Object.keys(properties || {});
    if (keys.length === 0) {
        const p = document.createElement('div');
        p.textContent = '属性がありません';
        return p;
    }

    const table = document.createElement('table');
    table.className = 'popup-table';
    for (const key of keys) {
        const tr = table.insertRow();
        const th = document.createElement('th');
        th.textContent = key;
        const td = document.createElement('td');
        td.textContent = formatValue(properties[key]);
        tr.append(th, td);
    }
    return table;
}
