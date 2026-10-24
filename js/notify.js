// 画面下に短いメッセージを表示する

const DURATION_MS = 6000;

/**
 * @param {string} message
 * @param {'info'|'error'} [type]
 */
export function notify(message, type = 'info') {
    const area = document.getElementById('toastArea');
    if (!area) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    area.appendChild(toast);
    setTimeout(() => toast.remove(), DURATION_MS);
}
