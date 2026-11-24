/**
 * East–west wrap (#36): a world map whose east edge continues at its west edge, a
 * cylinder. Opt-in per root map, with the `wrapX` property.
 *
 * One turn of the world is `width` cells. Hex maps have no duplicate samples: the column
 * after the last is the first. Square maps store heights at cell corners, so their last
 * column of samples is the same line of the world as the first (its "twin"). It stays in
 * the file, so nothing else that reads heights changes, and always mirrors the first:
 * grid algorithms work on the canonical samples (columns 0 … width − 1) and copy the
 * result to the twin.
 *
 * The poles are not special: the top and bottom rows are the world's edges.
 */

import type { TmjMap, TmjProperty } from '../types/tmj';
import { hexLayout } from '../canvas/hexGeometry';

/** Map property (bool) that turns the wrap on. */
export const WRAP_PROPERTY = 'wrapX';
/** Cells on each side of the seam that ease to meet when a map is made to wrap. */
export const SEAM_BLEND_CELLS = 4;
const _MIN_WIDTH = 4;

/** `a` brought into 0 … n − 1. */
export const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Why this map can't wrap, or null if it can. */
export function wrapProblem(map: TmjMap): string | null {
  if (map.width < _MIN_WIDTH) return `The map must be at least ${_MIN_WIDTH} cells wide.`;
  // Flat-topped hexes shift every other column, so the pattern only meets itself with an even number
  if (map.orientation === 'hexagonal' && (map.staggeraxis ?? 'x') === 'x' && map.width % 2) {
    return 'A flat-topped hex map needs an even number of columns, so the hexes meet at the seam.';
  }
  return null;
}

/** Whether the map wraps east–west (it says so, and can). */
export function wrapsX(map: TmjMap): boolean {
  return (map.properties ?? []).some((p) => p.name === WRAP_PROPERTY && p.value === true) && wrapProblem(map) === null;
}

/** Map properties with the wrap turned on or off. */
export function withWrap(props: TmjProperty[] | undefined, on: boolean): TmjProperty[] {
  const others = (props ?? []).filter((p) => p.name !== WRAP_PROPERTY);
  return on ? [...others, { name: WRAP_PROPERTY, type: 'bool', value: true }] : others;
}

/** Map pixels in one turn of the world. */
export function wrapPeriodPx(map: TmjMap): number {
  if (map.orientation !== 'hexagonal') return map.width * map.tilewidth;
  const layout = hexLayout(map);
  return map.width * (layout.staggerX ? layout.columnWidth : layout.tileWidth + layout.sideLengthX);
}

/** Whether the last column of height samples is the first one again (wrapped square maps). */
export function hasSeamTwin(map: TmjMap): boolean {
  return map.orientation !== 'hexagonal' && wrapsX(map);
}

/** The canonical sample of each sample: itself, or on a wrapped square map the first column for the last. */
export function canonicalSample(map: TmjMap, cols: number): (i: number) => number {
  if (!hasSeamTwin(map)) return (i) => i;
  return (i) => (i % cols === cols - 1 ? i - (cols - 1) : i);
}

/** Copy the first column of samples over its twin, the last (in place). */
export function mirrorSeam(map: TmjMap, values: { [i: number]: number; length: number }, cols: number): void {
  if (!hasSeamTwin(map)) return;
  for (let i = cols - 1; i < values.length; i += cols) values[i] = values[i - (cols - 1)];
}

/** Make the first and last columns of heights equal (their average) and share hand-set marks (in place). */
export function joinSeam(map: TmjMap, cm: Int32Array, mask: Uint8Array | null, cols: number): void {
  if (!hasSeamTwin(map)) return;
  for (let i = 0; i < cm.length; i += cols) {
    const j = i + cols - 1;
    if (cm[i] !== cm[j]) cm[i] = cm[j] = Math.round((cm[i] + cm[j]) / 2);
    if (mask && mask[i] !== mask[j]) mask[i] = mask[j] = 1;
  }
}

/** The biggest difference (cm) between the two sides of the seam. */
export function seamStepCm(cm: ArrayLike<number>, cols: number): number {
  let max = 0;
  for (let i = 0; i < cm.length; i += cols) max = Math.max(max, Math.abs(cm[i] - cm[i + cols - 1]));
  return max;
}

const _smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * Heights whose two sides meet at the seam: each row's first and last samples move to
 * their average (or to the hand-set one, when just one is), and the change eases out over
 * a few cells each side. Other hand-set heights are kept.
 */
export function blendSeam(
  patch: { cols: number; rows: number; cm: Int32Array; mask: Uint8Array }, cells = SEAM_BLEND_CELLS,
): { cm: Int32Array; mask: Uint8Array; changed: number } {
  const { cols, rows } = patch;
  const cm = patch.cm.slice(), mask = patch.mask.slice();
  const band = Math.max(1, Math.min(cells, Math.floor((cols - 1) / 2)));
  for (let row = 0; row < rows; row++) {
    const w = row * cols, e = w + cols - 1;
    const a = patch.cm[w], b = patch.cm[e];
    const meet = patch.mask[w] && !patch.mask[e] ? a : patch.mask[e] && !patch.mask[w] ? b : Math.round((a + b) / 2);
    for (let k = 1; k < band; k++) {
      const s = _smooth(1 - k / band);
      if (!mask[w + k]) cm[w + k] += Math.round((meet - a) * s);
      if (!mask[e - k]) cm[e - k] += Math.round((meet - b) * s);
    }
    cm[w] = meet;
    cm[e] = meet;
    if (mask[w] || mask[e]) mask[w] = mask[e] = 1;
  }
  let changed = 0;
  for (let i = 0; i < cm.length; i++) if (cm[i] !== patch.cm[i]) changed++;
  return { cm, mask, changed };
}
