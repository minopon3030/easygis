// 読み込み処理で共通に使う小さな関数

/** @param {string} filename */
export function extensionOf(filename) {
    const i = filename.lastIndexOf('.');
    return i >= 0 ? filename.slice(i).toLowerCase() : '';
}

/**
 * フォルダ部分と拡張子を除いた名前
 * @param {string} filename
 */
export function baseNameOf(filename) {
    const name = filename.split('/').pop() || filename;
    const ext = extensionOf(name);
    return ext ? name.slice(0, -ext.length) : name;
}

/**
 * script タグで外部スクリプトを読み込む（ES Modules 形式で配布されていないライブラリ用）
 * @param {string} url
 * @returns {Promise<void>}
 */
export function loadScript(url) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`ライブラリを読み込めませんでした（${url}）。ネットワーク接続を確認してください`));
        document.head.appendChild(script);
    });
}
