/**
 * Assembled world surface (#8 phase 2): child maps' heights shown on their parents.
 *
 * Each map owns its heights; nothing here changes them. A parent *displays* a
 * derived surface: inside a child's footprint, the child's heights averaged over
 * each parent cell; at the child's edge, a band that eases from the child's heights
 * to the parent's own. Children include their own children (computed bottom-up).
 *
 * Positions use "cell space": one unit is one cell of the map, along both axes —
 * the same model the footprint math (computeFootprint) uses. A child's real
 * rectangle (width x height cells of its own size) is centred inside its footprint,
 * which is that rectangle rounded up to whole parent cells.
 *
 * Only Z = 0 children form the ground surface; other levels (floors, caves) don't.
 */

import type { TmjMap } from '../types/tmj';
import type { WorldSetNode } from '../types/worldSet';
import type { HeightPatch, CellRect } from './heightGrid';
import { heightAt, unionRect } from './heightGrid';
import { hexLayout, hexCenter } from '../canvas/hexGeometry';
import { childRect } from './worldSetUtils';

// ---------------------------------------------------------------------------
// Cell space <-> map pixels
// ---------------------------------------------------------------------------

/** Spacing between neighbouring cell centres, and the centre of cell (0, 0), in map pixels. */
function _pitch(map: TmjMap): { px: number; py: number; ox: number; oy: number } {
  if (map.orientation !== 'hexagonal') {
    return { px: map.tilewidth, py: map.tileheight, ox: map.tilewidth / 2, oy: map.tileheight / 2 };
  }
  const layout = hexLayout(map);
  const c00 = hexCenter(layout, 0, 0);
  return {
    px: (hexCenter(layout, 1, 0).x - c00.x) || 1,
    py: (hexCenter(layout, 0, 1).y - c00.y) || 1,
    ox: c00.x,
    oy: c00.y,
  };
}

/** Map pixel -> cell space (cell (c, r) spans [c, c + 1] x [r, r + 1]; hex stagger shows as a half-row shift). */
export function pixelToCell(map: TmjMap, x: number, y: number): { u: number; v: number } {
  const p = _pitch(map);
  return { u: 0.5 + (x - p.ox) / p.px, v: 0.5 + (y - p.oy) / p.py };
}

/** Cell space -> map pixel. */
export function cellToPixel(map: TmjMap, u: number, v: number): { x: number; y: number } {
  const p = _pitch(map);
  return { x: p.ox + (u - 0.5) * p.px, y: p.oy + (v - 0.5) * p.py };
}

// ---------------------------------------------------------------------------
// Placement and blending
// ---------------------------------------------------------------------------

/** Where a child sits on its parent, in parent cell space. */
export interface ChildPlacement {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Child cells per parent cell. */
  scale: number;
  /** Width of the edge blending band, in parent cells. */
  band: number;
}

/**
 * The child's real rectangle (see childRect: centred in its footprint, moved by the
 * optional offset). The blending band is one parent cell, but at most a quarter of
 * the child's narrower side.
 */
export function placeChild(
  childWidth: number, childHeight: number, childMPU: number, parentMPU: number,
  anchor: { col: number; row: number }, offset?: { x: number; y: number } | null,
): ChildPlacement {
  const { left, top, width, height } = childRect(childWidth, childHeight, childMPU, parentMPU, anchor, offset);
  return {
    left, top, width, height,
    scale: parentMPU / childMPU,
    band: Math.min(1, Math.min(width, height) / 4),
  };
}

/** How much the child's heights count at parent cell-space point (u, v): 0 outside, easing to 1 inside the band. */
export function blendWeight(p: ChildPlacement, u: number, v: number): number {
  const d = Math.min(u - p.left, p.left + p.width - u, v - p.top, p.top + p.height - v);
  if (d <= 0) return 0;
  if (p.band <= 0 || d >= p.band) return 1;
  const t = d / p.band;
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// Surface tree
// ---------------------------------------------------------------------------

/** A map with its heights and the children that show on it. */
export interface SurfaceNode {
  name: string;
  map: TmjMap;
  /** The map's own heights. */
  patch: HeightPatch;
  /** Own heights with the children averaged in: what a parent samples. */
  effective: HeightPatch;
  children: PlacedChild[];
}

export interface PlacedChild {
  node: SurfaceNode;
  place: ChildPlacement;
}

/** What buildSurface needs to know about a map: its data, heights (if any) and cell size. */
export interface SurfaceSource {
  map: TmjMap;
  patch: HeightPatch | null;
  mpu: number | undefined;
}

/**
 * Placed Z = 0 children of `name` that have heights and a cell size, each with its own
 * children assembled. `include` can skip a child (e.g. one too small to matter).
 */
export function placedChildren(
  name: string,
  parentMPU: number,
  nodes: WorldSetNode[],
  lookup: (name: string) => SurfaceSource | undefined,
  include: (child: SurfaceSource, place: ChildPlacement) => boolean = () => true,
  seen: Set<string> = new Set([name]),
): PlacedChild[] {
  const result: PlacedChild[] = [];
  for (const n of nodes) {
    if (n.parentMapName !== name || !n.parentAnchor || n.z !== 0 || seen.has(n.mapName)) continue;
    const found = lookup(n.mapName);
    if (!found || !found.patch || !found.mpu) continue;
    const src = { map: found.map, patch: found.patch, mpu: found.mpu };
    const place = placeChild(src.map.width, src.map.height, src.mpu, parentMPU, n.parentAnchor, n.parentOffset);
    if (!include(src, place)) continue;
    const node = buildSurface(n.mapName, src, nodes, lookup, include, new Set([...seen, n.mapName]));
    result.push({ node, place });
  }
  return result;
}

/** Assemble a map's surface: its own heights with its children (recursively) averaged in. */
export function buildSurface(
  name: string,
  src: SurfaceSource & { patch: HeightPatch; mpu: number },
  nodes: WorldSetNode[],
  lookup: (name: string) => SurfaceSource | undefined,
  include?: (child: SurfaceSource, place: ChildPlacement) => boolean,
  seen: Set<string> = new Set([name]),
): SurfaceNode {
  const children = placedChildren(name, src.mpu, nodes, lookup, include, seen);
  const overrides = computeOverrides(src.map, src.patch.cols, src.patch.rows, children);
  return { name, map: src.map, patch: src.patch, effective: applyOverrides(src.patch, overrides), children };
}

// ---------------------------------------------------------------------------
// Point readout
// ---------------------------------------------------------------------------

/** The child (if any) that counts most at cell-space point (u, v). */
function _strongestChild(children: PlacedChild[], u: number, v: number): { child: PlacedChild; w: number } | null {
  let best: { child: PlacedChild; w: number } | null = null;
  for (const child of children) {
    const w = blendWeight(child.place, u, v);
    if (w > 0 && (!best || w > best.w)) best = { child, w };
  }
  return best;
}

/** Child map pixel under parent cell-space point (u, v). */
function _childPixel(child: PlacedChild, u: number, v: number): { x: number; y: number } {
  const { place, node } = child;
  return cellToPixel(node.map, (u - place.left) * place.scale, (v - place.top) * place.scale);
}

/**
 * Height (cm) of the assembled surface at a map pixel, at the finest detail
 * available, and the map it mostly comes from.
 */
export function surfaceAt(
  map: TmjMap, patch: HeightPatch, children: PlacedChild[], x: number, y: number, name: string,
): { cm: number; source: string } {
  const own = heightAt(map, patch, x, y);
  const { u, v } = pixelToCell(map, x, y);
  const hit = _strongestChild(children, u, v);
  if (!hit) return { cm: own, source: name };
  const { node } = hit.child;
  const p = _childPixel(hit.child, u, v);
  const inner = surfaceAt(node.map, node.patch, node.children, p.x, p.y, node.name);
  return { cm: own + (inner.cm - own) * hit.w, source: hit.w >= 0.5 ? inner.source : name };
}

// ---------------------------------------------------------------------------
// Overrides: the samples of a parent that its children change
// ---------------------------------------------------------------------------

/**
 * Display value of sample `index[k]` = own * keep[k] + add[k]. `keep` is the share of
 * the parent cell the children don't cover; `add` is their (blended) average height.
 */
export interface SurfaceOverrides {
  index: Int32Array;
  keep: Float32Array;
  add: Float32Array;
}

/** Most sub-samples per axis when averaging a child over one parent cell. */
const _MAX_SUBSAMPLES = 8;

/** Cell-space position of height sample (col, row): cell corners on square maps, centres on hex. */
export function sampleCell(map: TmjMap, col: number, row: number): { u: number; v: number } {
  if (map.orientation !== 'hexagonal') return { u: col, v: row };
  const c = hexCenter(hexLayout(map), col, row);
  return pixelToCell(map, c.x, c.y);
}

/**
 * For each parent sample whose cell overlaps a child: average the child's surface
 * (with blending) over a one-cell window around the sample.
 */
export function computeOverrides(map: TmjMap, cols: number, rows: number, children: PlacedChild[]): SurfaceOverrides {
  const acc = new Map<number, { keep: number; add: number }>();
  for (const child of children) {
    const { place, node } = child;
    const n = Math.max(1, Math.min(_MAX_SUBSAMPLES, Math.ceil(place.scale - 1e-9)));
    // Samples whose window [s - 0.5, s + 0.5] might touch the child (hex stagger adds half a row)
    const c0 = Math.max(0, Math.floor(place.left - 1.5)), c1 = Math.min(cols - 1, Math.ceil(place.left + place.width + 0.5));
    const r0 = Math.max(0, Math.floor(place.top - 1.5)), r1 = Math.min(rows - 1, Math.ceil(place.top + place.height + 0.5));
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const s = sampleCell(map, col, row);
        if (s.u + 0.5 <= place.left || s.u - 0.5 >= place.left + place.width
          || s.v + 0.5 <= place.top || s.v - 0.5 >= place.top + place.height) continue;
        let sumW = 0, sumC = 0;
        for (let j = 0; j < n; j++) {
          const qv = s.v - 0.5 + (j + 0.5) / n;
          for (let i = 0; i < n; i++) {
            const qu = s.u - 0.5 + (i + 0.5) / n;
            const w = blendWeight(place, qu, qv);
            if (w <= 0) continue;
            const p = _childPixel(child, qu, qv);
            sumW += w;
            sumC += w * heightAt(node.map, node.effective, p.x, p.y);
          }
        }
        if (sumW <= 0) continue;
        const idx = row * cols + col;
        const prev = acc.get(idx) ?? { keep: 1, add: 0 };
        prev.keep -= sumW / (n * n);
        prev.add += sumC / (n * n);
        acc.set(idx, prev);
      }
    }
  }
  const index = new Int32Array(acc.size), keep = new Float32Array(acc.size), add = new Float32Array(acc.size);
  let k = 0;
  for (const [idx, o] of acc) {
    // Overlapping siblings (already warned about) could cover more than the whole cell
    const covered = 1 - o.keep;
    const scale = covered > 1 ? 1 / covered : 1;
    index[k] = idx;
    keep[k] = 1 - covered * scale;
    add[k] = o.add * scale;
    k++;
  }
  return { index, keep, add };
}

const _clampInt32 = (v: number) => Math.max(-2_147_483_648, Math.min(2_147_483_647, Math.round(v)));

/** A new patch: `own` with the overrides applied (the mask is shared). */
export function applyOverrides(own: HeightPatch, ov: SurfaceOverrides): HeightPatch {
  const cm = own.cm.slice();
  for (let k = 0; k < ov.index.length; k++) {
    const i = ov.index[k];
    cm[i] = _clampInt32(own.cm[i] * ov.keep[k] + ov.add[k]);
  }
  return { cols: own.cols, rows: own.rows, cm, mask: own.mask };
}

// ---------------------------------------------------------------------------
// Display patch for the open map (follows live edits)
// ---------------------------------------------------------------------------

interface _Display { ov: SurfaceOverrides; patch: HeightPatch }
const _displays = new WeakMap<HeightPatch, _Display>();

function _inRect(i: number, cols: number, r: CellRect): boolean {
  const col = i % cols, row = (i - col) / cols;
  return col >= r.c0 && col <= r.c1 && row >= r.r0 && row <= r.r1;
}

/**
 * The patch to draw for the open map: its own heights with children averaged in.
 * Painting edits `own` in place and flags what changed; this copies those changes
 * across and hands the flags on, so the overlay still redraws only what changed.
 */
export function displayPatch(own: HeightPatch, ov: SurfaceOverrides | null): HeightPatch {
  if (!ov || ov.index.length === 0) return own;
  let d = _displays.get(own);
  if (!d || d.ov !== ov || d.patch.cm.length !== own.cm.length) {
    d = { ov, patch: applyOverrides(own, ov) };
    _displays.set(own, d);
  } else if (own.fullRefresh) {
    d.patch.cm.set(own.cm);
    for (let k = 0; k < ov.index.length; k++) {
      const i = ov.index[k];
      d.patch.cm[i] = _clampInt32(own.cm[i] * ov.keep[k] + ov.add[k]);
    }
    d.patch.fullRefresh = true;
  } else if (own.dirtyRect) {
    const r = own.dirtyRect;
    for (let row = Math.max(0, r.r0); row <= Math.min(own.rows - 1, r.r1); row++) {
      const a = row * own.cols + Math.max(0, r.c0), b = row * own.cols + Math.min(own.cols - 1, r.c1) + 1;
      d.patch.cm.set(own.cm.subarray(a, b), a);
    }
    for (let k = 0; k < ov.index.length; k++) {
      const i = ov.index[k];
      if (_inRect(i, own.cols, r)) d.patch.cm[i] = _clampInt32(own.cm[i] * ov.keep[k] + ov.add[k]);
    }
    d.patch.dirtyRect = unionRect(d.patch.dirtyRect, r);
  }
  if (own.rangeCheck) d.patch.rangeCheck = true;
  own.fullRefresh = false;
  own.rangeCheck = false;
  own.dirtyRect = null;
  return d.patch;
}
