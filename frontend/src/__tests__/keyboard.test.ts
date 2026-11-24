import { describe, it, expect } from 'vitest';
import { keepsKeys } from '../utils/keyboard';

/** A stand-in element (tests run without a DOM). */
const el = (tagName: string, type?: string, inDialog = false) =>
  ({ tagName, type, closest: (s: string) => (inDialog && s === '.dialog' ? {} : null) }) as unknown as EventTarget;

describe('keepsKeys', () => {
  it('places to type keep their keys', () => {
    for (const type of ['text', 'number', 'search', 'color', '', undefined]) expect(keepsKeys(el('INPUT', type))).toBe(true);
    expect(keepsKeys(el('TEXTAREA'))).toBe(true);
    expect(keepsKeys({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true);
  });

  it('checkboxes, radio buttons and sliders leave shortcuts working after a click', () => {
    for (const type of ['checkbox', 'radio', 'range', 'file']) expect(keepsKeys(el('INPUT', type))).toBe(false);
  });

  it('inputs in a dialog keep their keys: shortcuts would act on the map behind it', () => {
    for (const type of ['checkbox', 'radio', 'text']) expect(keepsKeys(el('INPUT', type, true))).toBe(true);
  });

  it('anything else does not', () => {
    expect(keepsKeys(el('BODY'))).toBe(false);
    expect(keepsKeys(el('BUTTON', 'button'))).toBe(false);
    expect(keepsKeys(null)).toBe(false);
  });
});
