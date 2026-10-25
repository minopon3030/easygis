// 選択リストの部品。標準の select では選択肢に色の見本を描けず、
// 見た目もブラウザごとに違うため自作する。

/**
 * @typedef {Object} DropdownOption
 * @property {string} value
 * @property {string} label
 * @property {string[]} [colors] 指定するとラベルの前にグラデーションの見本を表示する
 */

/**
 * @typedef {Object} Dropdown
 * @property {HTMLElement} el
 * @property {(value: string) => void} setValue 表示中の値を変える（onSelect は呼ばない）
 */

/**
 * @param {DropdownOption[]} options
 * @param {(value: string) => void} onSelect ユーザーが選んだときに呼ばれる
 * @returns {Dropdown}
 */
export function createDropdown(options, onSelect) {
    const el = document.createElement('div');
    el.className = 'dropdown';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dropdown-button';
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');

    const menu = document.createElement('div');
    menu.className = 'dropdown-menu';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;

    const items = options.map(option => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'dropdown-option';
        item.setAttribute('role', 'option');
        item.append(...optionContent(option));
        item.addEventListener('click', () => {
            close();
            button.focus();
            onSelect(option.value);
        });
        return item;
    });
    menu.append(...items);
    el.append(button, menu);

    let selectedIndex = 0;

    /** @param {PointerEvent} e */
    const onOutside = e => {
        if (!el.contains(/** @type {Node} */ (e.target))) close();
    };

    function open() {
        menu.hidden = false;
        button.setAttribute('aria-expanded', 'true');
        document.addEventListener('pointerdown', onOutside);
        items[selectedIndex]?.focus();
        items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }

    function close() {
        menu.hidden = true;
        button.setAttribute('aria-expanded', 'false');
        document.removeEventListener('pointerdown', onOutside);
    }

    button.addEventListener('click', () => (menu.hidden ? open() : close()));
    button.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            open();
        }
    });

    // 一覧の中は上下キーで移動、Esc で閉じる
    menu.addEventListener('keydown', e => {
        const current = items.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
        /** @type {number|null} */
        let next = null;
        if (e.key === 'ArrowDown') next = Math.min(current + 1, items.length - 1);
        if (e.key === 'ArrowUp') next = Math.max(current - 1, 0);
        if (e.key === 'Home') next = 0;
        if (e.key === 'End') next = items.length - 1;
        if (next !== null) {
            e.preventDefault();
            items[next].focus();
        }
        if (e.key === 'Escape' || e.key === 'Tab') {
            if (e.key === 'Escape') {
                e.preventDefault();
                button.focus();
            }
            close();
        }
    });

    return {
        el,
        setValue(value) {
            const index = options.findIndex(o => o.value === value);
            selectedIndex = index >= 0 ? index : 0;
            button.replaceChildren(...optionContent(options[selectedIndex]));
            items.forEach((item, i) => item.setAttribute('aria-selected', String(i === selectedIndex)));
        },
    };
}

/**
 * 選択肢の中身（見本 + ラベル）
 * @param {DropdownOption} option
 */
function optionContent(option) {
    const label = document.createElement('span');
    label.className = 'dropdown-label';
    label.textContent = option.label;
    label.title = option.label;
    if (!option.colors) return [label];

    const ramp = document.createElement('span');
    ramp.className = 'dropdown-ramp';
    ramp.style.background = `linear-gradient(to right, ${option.colors.join(', ')})`;
    return [ramp, label];
}
