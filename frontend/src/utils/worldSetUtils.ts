export interface Footprint {
  colMin: number;
  colMax: number;
  rowMin: number;
  rowMax: number;
}

/**
 * Compute the footprint of a child map on a parent map's grid.
 *
 * Uses floor-center anchoring: the child is centered on `anchor`,
 * with even-dimension asymmetry going bottom-right.
 */
export function computeFootprint(
  childWidth: number,
  childHeight: number,
  childFPU: number,
  parentFPU: number,
  anchor: { col: number; row: number },
): Footprint {
  const fpCols = Math.ceil((childWidth * childFPU) / parentFPU);
  const fpRows = Math.ceil((childHeight * childFPU) / parentFPU);

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
