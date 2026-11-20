import React from 'react';
import { useMapStore } from '../store/mapStore';
import { useViewStore } from '../store/viewStore';
import { useWorldSetStore } from '../store/worldSetStore';
import type { UnitSystem } from '../data/mapScales';
import { resolveMetersPerUnit } from '../data/mapScales';
import { formatHeight, parseHeightToCm } from '../utils/heightGrid';
import { sampleAreaM2, seaEnabled } from '../utils/water';
import { newWaterCm } from '../tools/waterMode';
import { ValueField } from './SpotHeightControls';
import { useWaterView } from './useWaterView';

/** An area in m², in the map's units. */
export function formatArea(m2: number, units: UnitSystem): string {
  const fmt = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: v < 10 ? 1 : 0 });
  if (units === 'imperial') {
    const acres = m2 / 4046.86;
    return acres >= 640 ? `${fmt(acres / 640)} sq mi` : `${fmt(acres)} acres`;
  }
  return m2 >= 1e6 ? `${fmt(m2 / 1e6)} km²` : m2 >= 1e4 ? `${fmt(m2 / 1e4)} ha` : `${fmt(m2)} m²`;
}

/**
 * Water mode of the Height tool: the surface height for new lakes and seas, and
 * editing of the selected one (each edit is one undo step).
 */
export const WaterControls: React.FC<{ units: UnitSystem }> = ({ units }) => {
  const store = useMapStore();
  const { mapData, setHeightBrush, updateWaterBody, deleteWaterBody } = store;
  const selectedId = useViewStore((s) => s.selectedWaterId);
  const setSelected = useViewStore((s) => s.setSelectedWaterId);
  const defaultUnits = useWorldSetStore((s) => s.activeWorldSet?.units);
  const { bodies, water } = useWaterView();
  if (!mapData) return null;
  const unit = units === 'imperial' ? 'ft' : 'm';
  const heightText = (cm: number) => formatHeight(cm, units).replace(/ (m|ft)$/, '').replace(/,/g, '');
  const parseHeight = (t: string) => parseHeightToCm(t, units);
  const mpu = resolveMetersPerUnit(mapData, defaultUnits);
  const area = (samples: number) => (mpu ? `about ${formatArea(samples * sampleAreaM2(mpu), units)}` : `${samples.toLocaleString('en-US')} cells`);
  const index = bodies.findIndex((b) => b.id === selectedId);
  const selected = index >= 0 ? bodies[index] : null;
  const fill = selected && water ? water.fills[index] : null;

  return (
    <div className="water-controls">
      <div style={{ color: '#888', marginBottom: 4 }}>
        Click in a basin to add a lake at the surface height below; it fills everything connected that's lower.
        Click a lake to edit it, drag it to move it. Right-click picks the height under the pointer.
      </div>
      <label style={{ display: 'block', marginBottom: 6 }}>
        New water: surface ({unit}){' '}
        <ValueField value={newWaterCm(store)} format={heightText} parse={parseHeight} commit="change"
          title="Surface height for new lakes and seas" onChange={(v) => setHeightBrush({ waterCm: v })} />
      </label>

      {selected ? (
        <div style={{ borderTop: '1px solid #333', paddingTop: 4 }}>
          <div style={{ color: '#aaa', marginBottom: 4 }}>Selected water</div>
          <label style={{ display: 'block', marginBottom: 4 }}>
            Name{' '}
            <ValueField value={selected.name} format={(s) => s} parse={(t) => t.trim()} commit="blur" width={110}
              title="e.g. Lake Varra" onChange={(n) => updateWaterBody(selected.id, { name: n })} />
          </label>
          <label style={{ display: 'block', marginBottom: 4 }}>
            Surface ({unit}){' '}
            <ValueField value={selected.cm} format={heightText} parse={parseHeight} commit="blur"
              title="The water's surface height (Enter to apply)" onChange={(v) => updateWaterBody(selected.id, { cm: v })} />
          </label>
          {fill && (
            <div style={{ color: fill.dry || fill.reachesEdge ? '#fbbf24' : '#aaa', marginBottom: 4 }}>
              {fill.dry
                ? '⚠ Dry: the ground here is above this surface. Raise the surface, or move the lake into a basin.'
                : <>
                    Covers {area(fill.samples)}, up to {formatHeight(fill.maxDepthCm, units)} deep.
                    {fill.reachesEdge && <> ⚠ It reaches the map's edge, so it would spill beyond this map.</>}
                  </>}
            </div>
          )}
          <button className="btn-danger" style={{ fontSize: 11 }} onClick={() => { deleteWaterBody(selected.id); setSelected(null); }}>
            Delete water
          </button>
        </div>
      ) : (
        <div style={{ color: '#888' }}>
          {bodies.length} lake{bodies.length === 1 ? '' : 's'} or sea{bodies.length === 1 ? '' : 's'} placed.{' '}
          {seaEnabled(mapData)
            ? (water && water.seaSamples > 0 ? `The sea (below 0 ${unit}, from the map's edge) covers ${area(water.seaSamples)}.` : 'No ground below sea level reaches the map\'s edge.')
            : 'The automatic sea is off for this map.'}
        </div>
      )}
    </div>
  );
};
