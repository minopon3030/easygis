// サイドバーのレイヤ一覧と凡例。状態（store）を表示し、操作は store の関数に渡す。
// カードは レイヤID ごとに使い回し、変わった部分だけ更新する
// （作り直すと、操作中のカラーピッカーが閉じてしまうため）。

import Sortable from 'sortablejs';
import * as store from './store.js';
import { buildStyler, paletteColors, NUMERIC_PALETTES, NO_DATA_COLOR, NO_DATA_LABEL } from './styling.js';
import { formatNumber } from './features.js';
import { createDropdown } from './dropdown.js';

/** @typedef {import('./types.js').AppState} AppState */
/** @typedef {import('./types.js').LayerState} LayerState */
/** @typedef {import('./styling.js').Legend} Legend */
/** @typedef {import('./dropdown.js').Dropdown} Dropdown */

/**
 * @typedef {Object} Card
 * @property {HTMLElement} el
 * @property {LayerState|null} layer 最後に表示したレイヤ
 * @property {HTMLInputElement} visibleInput
 * @property {Dropdown} labelDropdown
 * @property {Dropdown} attributeDropdown
 * @property {HTMLElement} classifyRow
 * @property {Dropdown} classifyDropdown
 * @property {HTMLElement} paletteRow
 * @property {Dropdown} paletteDropdown
 * @property {HTMLElement} legendEl
 * @property {string} legendKey 凡例の構造（色以外）。変わったときだけ凡例を作り直す
 */

/**
 * @param {Object} options
 * @param {HTMLElement} options.listEl
 * @param {HTMLElement} options.emptyEl
 * @param {(id: number) => void} options.onZoom
 */
export function createSidebar({ listEl, emptyEl, onZoom }) {
    /** @type {Map<number, Card>} */
    const cards = new Map();

    Sortable.create(listEl, {
        handle: '.drag-handle',
        animation: 150,
        // ブラウザ標準のドラッグ＆ドロップを使わない（ファイルのドロップ受付と干渉させないため）
        forceFallback: true,
        onEnd: () => {
            const ids = [...listEl.children].map(el => Number(/** @type {HTMLElement} */ (el).dataset.id));
            store.reorderLayers(ids);
        },
    });

    /** @param {AppState} state */
    function render(state) {
        const ids = new Set(state.layers.map(l => l.id));
        for (const [id, card] of cards) {
            if (!ids.has(id)) {
                card.el.remove();
                cards.delete(id);
            }
        }

        state.layers.forEach((layer, index) => {
            let card = cards.get(layer.id);
            if (!card) {
                card = createCard(layer, onZoom);
                cards.set(layer.id, card);
            }
            if (card.layer !== layer) updateCard(card, layer);

            // 並び順が違うときだけ DOM を動かす
            if (listEl.children[index] !== card.el) {
                listEl.insertBefore(card.el, listEl.children[index] || null);
            }
        });

        emptyEl.hidden = state.layers.length > 0;
    }

    store.subscribe(render);
    render(store.getState());
}

/**
 * @param {LayerState} layer
 * @param {(id: number) => void} onZoom
 * @returns {Card}
 */
function createCard(layer, onZoom) {
    const id = layer.id;

    const el = document.createElement('div');
    el.className = 'layer-card';
    el.dataset.id = String(id);

    // ---- 見出し行: ドラッグ / 表示 / 名前 / ズーム / 削除 ----
    const header = document.createElement('div');
    header.className = 'layer-header';

    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '⋮⋮';
    handle.title = 'ドラッグで重なり順を変更';

    const title = document.createElement('label');
    title.className = 'layer-title';
    const visibleInput = document.createElement('input');
    visibleInput.type = 'checkbox';
    visibleInput.addEventListener('change', () => store.setVisible(id, visibleInput.checked));
    const name = document.createElement('span');
    name.className = 'layer-name';
    name.textContent = layer.name;
    name.title = layer.name;
    const count = document.createElement('span');
    count.className = 'layer-count';
    count.textContent = `${layer.data.features.length.toLocaleString()}件`;
    title.append(visibleInput, name, count);

    const zoomBtn = iconButton('⌖', 'このレイヤの範囲を表示', () => onZoom(id));
    const removeBtn = iconButton('×', 'レイヤを削除', () => {
        if (confirm(`「${layer.name}」を削除しますか？`)) store.removeLayer(id);
    });
    removeBtn.classList.add('remove-btn');

    header.append(handle, title, zoomBtn, removeBtn);

    // ---- ラベルと色分けの設定（凡例はその下） ----
    const controls = document.createElement('div');
    controls.className = 'layer-controls';

    const attributeOptions = layer.attributes.map(a => ({ value: a, label: a }));

    const labelDropdown = createDropdown(
        [{ value: '', label: '表示しない' }, ...attributeOptions],
        value => store.setStyle(id, { label: value }),
    );

    const attributeDropdown = createDropdown(
        [{ value: '', label: '色分けなし（単色）' }, ...attributeOptions],
        value => store.setStyle(id, { attribute: value }),
    );

    const classifyDropdown = createDropdown(
        [
            { value: 'auto', label: '数値（グラデーション）' },
            { value: 'category', label: 'カテゴリ（値ごとに色）' },
        ],
        value => store.setStyle(id, { classify: value === 'category' ? 'category' : 'auto' }),
    );

    const paletteDropdown = createDropdown(
        NUMERIC_PALETTES.map(p => ({ value: p.key, label: p.label, colors: paletteColors(p.key) })),
        value => store.setStyle(id, { palette: value }),
    );

    const classifyRow = controlRow('値の扱い', classifyDropdown.el);
    const paletteRow = controlRow('配色', paletteDropdown.el);
    controls.append(
        controlRow('ラベル', labelDropdown.el),
        controlRow('色分け', attributeDropdown.el),
        classifyRow,
        paletteRow,
    );

    const legendEl = document.createElement('div');
    legendEl.className = 'legend';

    el.append(header, controls, legendEl);

    return {
        el, layer: null, visibleInput, labelDropdown, attributeDropdown,
        classifyRow, classifyDropdown, paletteRow, paletteDropdown,
        legendEl, legendKey: '',
    };
}

/**
 * @param {Card} card
 * @param {LayerState} layer
 */
function updateCard(card, layer) {
    const { style } = layer;
    card.layer = layer;
    card.visibleInput.checked = layer.visible;
    card.labelDropdown.setValue(style.label);
    card.attributeDropdown.setValue(style.attribute);
    card.classifyDropdown.setValue(style.classify === 'category' ? 'category' : 'auto');
    card.paletteDropdown.setValue(style.palette);

    const styler = buildStyler(layer);
    card.classifyRow.hidden = !styler.numericAvailable;
    card.paletteRow.hidden = styler.legend.type !== 'numeric';

    const key = legendKey(styler.legend);
    if (key !== card.legendKey) {
        card.legendEl.replaceChildren(...renderLegend(layer, styler.legend));
        card.legendKey = key;
    } else {
        updateLegendColors(card.legendEl, styler.legend);
    }
}

/**
 * 凡例の構造を表す文字列（色は含めない）
 * @param {Legend} legend
 */
function legendKey(legend) {
    switch (legend.type) {
        case 'single': return 'single';
        case 'numeric': return JSON.stringify(['numeric', legend.min, legend.max, legend.colors, legend.hasNoData]);
        case 'category': return JSON.stringify(['category', legend.items.map(i => i.value)]);
        case 'too-many': return `too-many:${legend.count}`;
    }
}

/**
 * @param {LayerState} layer
 * @param {Legend} legend
 * @returns {HTMLElement[]}
 */
function renderLegend(layer, legend) {
    const id = layer.id;
    const setSingleColor = (/** @type {string} */ color) => store.setStyle(id, { color });

    switch (legend.type) {
        case 'single':
            return [legendRow(swatch(legend.color, setSingleColor), 'クリックで色を変更', '')];

        case 'too-many':
            return [
                legendRow(swatch(legend.color, setSingleColor), '', ''),
                note(`値の種類が多すぎるため（${legend.count}種類）色分けできません`),
            ];

        case 'numeric': {
            const wrap = document.createElement('div');
            wrap.className = 'legend-gradient';
            const bar = document.createElement('div');
            bar.className = 'legend-gradient-bar';
            bar.style.background = `linear-gradient(to top, ${legend.colors.join(', ')})`;
            const labels = document.createElement('div');
            labels.className = 'legend-gradient-labels';
            const maxLabel = document.createElement('span');
            maxLabel.textContent = formatNumber(legend.max);
            const minLabel = document.createElement('span');
            minLabel.textContent = formatNumber(legend.min);
            labels.append(maxLabel, minLabel);
            wrap.append(bar, labels);

            const rows = [wrap];
            if (legend.hasNoData) {
                rows.push(legendRow(swatch(NO_DATA_COLOR), NO_DATA_LABEL, ''));
            }
            return rows;
        }

        case 'category': {
            const attr = layer.style.attribute;
            return legend.items.map(item => legendRow(
                swatch(item.color, color => store.setCategoryColor(id, attr, item.value, color)),
                item.value,
                item.value,
            ));
        }
    }
}

/**
 * 凡例を作り直さずに色だけ更新する
 * @param {HTMLElement} legendEl
 * @param {Legend} legend
 */
function updateLegendColors(legendEl, legend) {
    /** @type {string[]} */
    let colors = [];
    if (legend.type === 'single' || legend.type === 'too-many') colors = [legend.color];
    if (legend.type === 'category') colors = legend.items.map(i => i.color);

    const swatches = legendEl.querySelectorAll('.swatch');
    colors.forEach((color, i) => {
        const el = /** @type {HTMLElement|undefined} */ (swatches[i]);
        if (!el) return;
        el.style.background = color;
        const input = el.querySelector('input');
        if (input && input.value !== color) input.value = color;
    });
}

// ---- 小さな部品 ----

/**
 * 色見本。onChange があればクリックで色を選べる
 * @param {string} color
 * @param {(color: string) => void} [onChange]
 */
function swatch(color, onChange) {
    const el = document.createElement('label');
    el.className = 'swatch';
    el.style.background = color;
    if (onChange) {
        el.classList.add('pickable');
        el.title = 'クリックで色を変更';
        const input = document.createElement('input');
        input.type = 'color';
        input.value = color;
        input.addEventListener('input', () => onChange(input.value));
        el.appendChild(input);
    }
    return el;
}

/**
 * @param {HTMLElement} swatchEl
 * @param {string} text
 * @param {string} tooltip
 */
function legendRow(swatchEl, text, tooltip) {
    const row = document.createElement('div');
    row.className = 'legend-row';
    const label = document.createElement('span');
    label.className = 'legend-label';
    label.textContent = text;
    if (tooltip) label.title = tooltip;
    row.append(swatchEl, label);
    return row;
}

/** @param {string} text */
function note(text) {
    const p = document.createElement('div');
    p.className = 'legend-note';
    p.textContent = text;
    return p;
}

/**
 * @param {string} text
 * @param {string} title
 * @param {() => void} onClick
 */
function iconButton(text, title, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-btn';
    btn.textContent = text;
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.addEventListener('click', onClick);
    return btn;
}

/**
 * @param {string} labelText
 * @param {HTMLElement} control
 */
function controlRow(labelText, control) {
    // label で囲むと、一覧のクリックが開閉ボタンにも伝わってしまうので div にする
    const row = document.createElement('div');
    row.className = 'control-row';
    const span = document.createElement('span');
    span.textContent = labelText;
    row.append(span, control);
    return row;
}
