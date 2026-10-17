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
