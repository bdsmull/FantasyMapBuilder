/**
 * Which focused elements keep the editor's keyboard shortcuts to themselves.
 */

/** Inputs nothing is typed into: they keep focus after a click, but have no use for the shortcuts' keys. */
const _NOT_TYPED = new Set(['checkbox', 'radio', 'range', 'file', 'button']);

/**
 * Whether a key pressed on `target` should not be taken as a shortcut: it's a place to
 * type, or an input in a dialog (a shortcut there would act on the map behind it).
 */
export function keepsKeys(target: EventTarget | null): boolean {
  const el = target as Partial<HTMLInputElement> | null;
  if (!el?.tagName) return false;
  if (el.tagName === 'TEXTAREA' || el.isContentEditable) return true;
  if (el.tagName !== 'INPUT') return false;
  return !_NOT_TYPED.has(el.type ?? 'text') || !!el.closest?.('.dialog');
}
