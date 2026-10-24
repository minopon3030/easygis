// 背景地図の定義。ここに追加すれば切替メニューに並ぶ。

const GSI_ATTRIBUTION = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">地理院タイル</a>';

/**
 * @typedef {Object} BasemapDef
 * @property {string} key
 * @property {string} label 切替メニューの表示名
 * @property {string} url タイルURLテンプレート
 * @property {Object} options L.tileLayer のオプション
 */

/** @type {BasemapDef[]} */
export const BASEMAPS = [
    {
        key: 'gsi_pale',
        label: '地理院地図 淡色',
        url: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',
        options: { maxNativeZoom: 18, maxZoom: 20, attribution: GSI_ATTRIBUTION },
    },
    {
        key: 'gsi_std',
        label: '地理院地図 標準',
        url: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',
        options: { maxNativeZoom: 18, maxZoom: 20, attribution: GSI_ATTRIBUTION },
    },
    {
        key: 'gsi_photo',
        label: '地理院地図 写真',
        url: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg',
        options: { maxNativeZoom: 18, maxZoom: 20, attribution: GSI_ATTRIBUTION },
    },
    {
        key: 'osm',
        label: 'OpenStreetMap',
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        options: {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
        },
    },
];

export const DEFAULT_BASEMAP = 'gsi_pale';
