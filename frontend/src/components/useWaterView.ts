import { useMemo } from 'react';
import { useMapStore } from '../store/mapStore';
import { useWorldSetStore } from '../store/worldSetStore';
import { resolveLineClasses } from '../data/lineClasses';
import { resolveMetersPerUnit } from '../data/mapScales';
import { readLines } from '../utils/lines';
import { computeWater, readWaterBodies, seaEnabled } from '../utils/water';
import type { WaterBody, WaterMap } from '../utils/water';
import { computeFlow, defaultStreamSamples } from '../utils/flow';
import type { FlowMap } from '../utils/flow';
import { carveRivers, waterLines } from '../utils/carve';

export interface WaterView {
  bodies: WaterBody[];
  /** Lakes and the sea on the open map (null without elevation). */
  water: WaterMap | null;
  /** Streams and hollows, when the Flow view is on. Drawn rivers count as carved in. */
  flow: FlowMap | null;
  streamSamples: number;
}

/**
 * Water for the open map, from its own heights (#8 phase 4). Recomputed when the heights
 * are committed (a stroke's end, undo, …), or the water bodies, sea setting or rivers change.
 */
export function useWaterView(): WaterView {
  const mapData = useMapStore((s) => s.mapData);
  const mapName = useMapStore((s) => s.mapName);
  const mapWorldSet = useMapStore((s) => s.mapWorldSet);
  const heights = useMapStore((s) => s.heights);
  const heightsRev = useMapStore((s) => s.heightsRev);
  const view = useMapStore((s) => s.elevationView);
  const activeWorldSet = useWorldSetStore((s) => s.activeWorldSet);
  const activeName = useWorldSetStore((s) => s.activeWorldSetName);
  const layers = mapData?.layers;
  const properties = mapData?.properties;
  const lineClasses = mapWorldSet === activeName ? activeWorldSet?.lineClasses : undefined;
  const units = activeWorldSet?.units;

  const bodies = useMemo(() => (mapData ? readWaterBodies(mapData) : []), [layers]); // eslint-disable-line react-hooks/exhaustive-deps
  const water = useMemo(() => {
    const map = useMapStore.getState().mapData;
    if (!map || !heights) return null;
    return computeWater(map, heights, bodies, seaEnabled(map));
  }, [heights, heightsRev, bodies, properties, mapName]); // eslint-disable-line react-hooks/exhaustive-deps
  const flow = useMemo(() => {
    const map = useMapStore.getState().mapData;
    if (!view.flow || !map || !heights || !water) return null;
    const classes = resolveLineClasses(lineClasses);
    const carved = carveRivers(map, heights, waterLines(readLines(map), classes), classes, resolveMetersPerUnit(map, units) ?? null, { keepHandSet: false });
    return computeFlow(map, heights.cols, heights.rows, carved.cm, water);
  }, [view.flow, water, layers, lineClasses, units]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    bodies,
    water,
    flow,
    streamSamples: view.streamSamples ?? (heights ? defaultStreamSamples(heights.cols, heights.rows) : 12),
  };
}
