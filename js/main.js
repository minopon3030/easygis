// アプリの起動。各部品を作ってつなぐ。

import { createMapView } from './mapView.js';
import { createSidebar } from './sidebar.js';
import { planLoad, ACCEPT } from './loaders/index.js';
import { notify } from './notify.js';
import * as store from './store.js';

const MOBILE_QUERY = window.matchMedia('(max-width: 700px)');

const mapView = createMapView(/** @type {HTMLElement} */ (document.getElementById('map')));

createSidebar({
    listEl: /** @type {HTMLElement} */ (document.getElementById('layerList')),
    emptyEl: /** @type {HTMLElement} */ (document.getElementById('emptyMessage')),
    onZoom: id => mapView.zoomToLayer(id),
});

/**
 * ファイルを読み込んでレイヤとして追加する
 * @param {File[]} files
 */
async function importFiles(files) {
    for (const task of planLoad(files)) {
        try {
            const { layers, errors } = await task.run();
            for (const { name, data } of layers) {
                const layer = store.addLayer(name, data);
                mapView.zoomToLayer(layer.id);
            }
            errors.forEach(message => notify(message, 'error'));
        } catch (err) {
            console.error(err);
            notify(err instanceof Error ? err.message : `「${task.label}」を読み込めませんでした`, 'error');
        }
    }
}

// ---- ファイル選択 ----

const fileInput = /** @type {HTMLInputElement} */ (document.getElementById('fileInput'));
fileInput.accept = ACCEPT;
document.getElementById('addFileBtn')?.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
    const files = [...(fileInput.files || [])];
    fileInput.value = '';
    await importFiles(files);
    if (MOBILE_QUERY.matches) document.body.classList.remove('sidebar-open');
});

// ---- ドラッグ＆ドロップ ----

const dropOverlay = /** @type {HTMLElement} */ (document.getElementById('dropOverlay'));
let dragDepth = 0; // 子要素の出入りでも dragenter/leave が来るので数える

/** @param {DragEvent} e */
const hasFiles = e => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');

window.addEventListener('dragenter', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    dropOverlay.hidden = false;
});
window.addEventListener('dragover', e => {
    if (hasFiles(e)) e.preventDefault();
});
window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropOverlay.hidden = true;
});
window.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    dropOverlay.hidden = true;
    importFiles([...(e.dataTransfer?.files || [])]);
});

// ---- ページを離れる前の確認 ----
// レイヤや設定は保存していないので、リロードやブラウザバックで消えてしまう。
// レイヤがあるときだけブラウザ標準の確認ダイアログを出す（文言はブラウザが決める）。

window.addEventListener('beforeunload', e => {
    if (store.getState().layers.length === 0) return;
    e.preventDefault();
    e.returnValue = ''; // 古いブラウザ向け
});

// ---- サイドバーの開閉（PC は折りたたみ、スマホは重ねて表示） ----

document.getElementById('sidebarToggle')?.addEventListener('click', () => {
    if (MOBILE_QUERY.matches) {
        document.body.classList.toggle('sidebar-open');
    } else {
        document.body.classList.toggle('sidebar-collapsed');
        mapView.map.invalidateSize();
    }
});
