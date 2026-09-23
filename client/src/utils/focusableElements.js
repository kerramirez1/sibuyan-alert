/**
 * The focusable-element query every portaled dialog traps Tab with.
 *
 * It lives here instead of inside each dialog because the keyboard walk has to
 * be identical everywhere: a sheet that traps focus with a slightly different
 * selector than the next one silently strands keyboard users on whichever
 * control one of them forgot to include.
 */
export const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

export const getFocusableElements = (container) => {
    if (!container?.querySelectorAll) return [];
    return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR));
};

export default { FOCUSABLE_SELECTOR, getFocusableElements };
