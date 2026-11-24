export interface Footprint {
  colMin: number;
  colMax: number;
  rowMin: number;
  rowMax: number;
}

/** Relative tolerance for treating a cell-count ratio as a whole number. */
const _WHOLE_CELL_TOLERANCE = 1e-9;

/**
 * Math.ceil that ignores floating-point noise: a ratio within tolerance of a
 * whole number (e.g. 31.000000000000004 from unit conversion) is that number.
 */
function _ceilCells(x: number): number {
  const nearest = Math.round(x);
  return Math.abs(x - nearest) <= _WHOLE_CELL_TOLERANCE * Math.max(1, Math.abs(x))
    ? nearest
    : Math.ceil(x);
}

/**
 * Compute the footprint of a child map on a parent map's grid.
 *
 * Uses floor-center anchoring: the child is centered on `anchor`,
 * with even-dimension asymmetry going bottom-right.
 * Cell sizes may be in any unit as long as both use the same one (meters by convention).
 */
export function computeFootprint(
  childWidth: number,
  childHeight: number,
  childUnitSize: number,
  parentUnitSize: number,
  anchor: { col: number; row: number },
): Footprint {
  const fpCols = _ceilCells((childWidth * childUnitSize) / parentUnitSize);
  const fpRows = _ceilCells((childHeight * childUnitSize) / parentUnitSize);

  const colMin = anchor.col - Math.floor(fpCols / 2);
  const colMax = anchor.col + Math.floor((fpCols - 1) / 2);
  const rowMin = anchor.row - Math.floor(fpRows / 2);
  const rowMax = anchor.row + Math.floor((fpRows - 1) / 2);

  return { colMin, colMax, rowMin, rowMax };
}

/** A child's real area on its parent, in parent cell space (cell (c, r) spans [c, c + 1] x [r, r + 1]). */
export interface ChildRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where a child really sits on its parent: its real size (cells x cell size), centred on
 * its rounded-up footprint around the anchor cell, then moved by the optional offset.
 */
export function childRect(
  childWidth: number, childHeight: number, childUnitSize: number, parentUnitSize: number,
  anchor: { col: number; row: number }, offset?: { x: number; y: number } | null,
): ChildRect {
  const fp = computeFootprint(childWidth, childHeight, childUnitSize, parentUnitSize, anchor);
  const width = (childWidth * childUnitSize) / parentUnitSize;
  const height = (childHeight * childUnitSize) / parentUnitSize;
  const cu = (fp.colMin + fp.colMax + 1) / 2 + (offset?.x ?? 0);
  const cv = (fp.rowMin + fp.rowMax + 1) / 2 + (offset?.y ?? 0);
  return { left: cu - width / 2, top: cv - height / 2, width, height };
}

/**
 * Anchor cell and offset that put a child's centre at parent cell-space point (u, v):
 * the anchor is the cell containing the point, the offset the rest.
 */
export function placementAt(
  childWidth: number, childHeight: number, childUnitSize: number, parentUnitSize: number, u: number, v: number,
): { anchor: { col: number; row: number }; offset: { x: number; y: number } | null } {
  const anchor = { col: Math.floor(u), row: Math.floor(v) };
  const base = childRect(childWidth, childHeight, childUnitSize, parentUnitSize, anchor);
  const x = u - (base.left + base.width / 2), y = v - (base.top + base.height / 2);
  const tiny = (n: number) => Math.abs(n) < 1e-9;
  return { anchor, offset: tiny(x) && tiny(y) ? null : { x, y } };
}

export interface RectNode {
  mapName: string;
  z: number;
  rect: ChildRect;
}

/**
 * Pairs of children at the same Z level whose real areas overlap (alphabetical). `turn`: the
 * parent's width in cells when it wraps east-west, so children meet across its seam too.
 */
export function detectRectOverlaps(nodes: RectNode[], turn?: number): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      if (a.z !== b.z) continue;
      const hit = (turn ? [0, -turn, turn] : [0]).some((s) => a.rect.left + s < b.rect.left + b.rect.width && b.rect.left < a.rect.left + s + a.rect.width)
        && a.rect.top < b.rect.top + b.rect.height && b.rect.top < a.rect.top + a.rect.height;
      if (hit) out.push(a.mapName < b.mapName ? [a.mapName, b.mapName] : [b.mapName, a.mapName]);
    }
  }
  return out;
}

export interface FootprintedNode {
  mapName: string;
  z: number;
  footprint: Footprint;
}

/**
 * Find all pairs of nodes at the same Z level whose footprints overlap.
 * Accepts pre-computed footprints to avoid redundant calculation.
 * Returns array of [mapNameA, mapNameB] pairs (alphabetically ordered).
 */
export function detectOverlaps(
  nodes: FootprintedNode[],
): [string, string][] {
  const overlaps: [string, string][] = [];

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];

      // Only check nodes at the same Z level
      if (a.z !== b.z) continue;

      // AABB intersection test
      const intersects =
        a.footprint.colMin <= b.footprint.colMax &&
        a.footprint.colMax >= b.footprint.colMin &&
        a.footprint.rowMin <= b.footprint.rowMax &&
        a.footprint.rowMax >= b.footprint.rowMin;

      if (intersects) {
        // Alphabetical ordering for consistent output
        const pair: [string, string] =
          a.mapName < b.mapName
            ? [a.mapName, b.mapName]
            : [b.mapName, a.mapName];
        overlaps.push(pair);
      }
    }
  }

  return overlaps;
}
