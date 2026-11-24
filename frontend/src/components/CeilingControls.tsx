import React from 'react';
import { useMapStore } from '../store/mapStore';
import { useViewStore } from '../store/viewStore';
import { useWorldSetStore } from '../store/worldSetStore';
import type { UnitSystem } from '../data/mapScales';
import { formatHeight, parseHeightToCm } from '../utils/heightGrid';
import { readCeilings, mapHeadroomCm, mapSlabCm, slabCm, DEFAULT_CEILING_HEADROOM_CM } from '../utils/ceilings';
import { useCeilingContext } from './useCeilings';
import { ValueField } from './SpotHeightControls';

type Optional = number | 'unset';

/**
 * Ceiling mode of the Height tool (#45): the map's own headroom and floor thickness,
 * what lies above this level, settings for new ceiling objects, and editing of the
 * selected one (each object edit is one undo step).
 */
export const CeilingControls: React.FC<{ units: UnitSystem }> = ({ units }) => {
  const { mapData, heightBrush, setHeightBrush, updateCeiling, deleteCeiling, setMapLength } = useMapStore();
  const selectedId = useViewStore((s) => s.selectedCeilingId);
  const selectCeiling = useViewStore((s) => s.selectCeiling);
  const drafting = useViewStore((s) => s.draftLine !== null);
  const worldSlabM = useWorldSetStore((s) => s.activeWorldSet?.floorSlabM);
  const ctx = useCeilingContext();
  if (!mapData) return null;
  const unit = units === 'imperial' ? 'ft' : 'm';
  const areas = readCeilings(mapData);
  const selected = areas.find((a) => a.id === selectedId) ?? null;
  const text = (cm: number) => formatHeight(cm, units).replace(/ (m|ft)$/, '').replace(/,/g, '');
  const positive = (t: string) => { const v = parseHeightToCm(t, units); return v !== null && v > 0 ? v : null; };
  const optional = (min: number) => (t: string): Optional | null => {
    if (t.trim() === '') return 'unset';
    const v = parseHeightToCm(t, units);
    return v !== null && v >= min ? v : null;
  };
  const optionalText = (v: Optional) => (v === 'unset' ? '' : text(v));
  const defaultSlab = slabCm({ ...mapData, properties: [] }, worldSlabM);

  // What's above this level
  const levelNames = [...new Set(ctx.above.map((l) => l.name))];
  const above = levelNames.length
    ? `Below ${levelNames.map((n) => `'${n}'`).join(', ')} (Z ${ctx.above[0].z > 0 ? '+' : ''}${ctx.above[0].z}${ctx.above.some((l) => l.z !== ctx.above[0].z) ? ' and up' : ''})`
    : ctx.ground ? `Under the ground of '${ctx.ground.name}'`
    : ctx.place ? 'Nothing above this level: open sky' : 'Not placed in a world set: only this map\'s own ceilings count';

  return (
    <div className="ceiling-controls">
      <div style={{ color: '#888', marginBottom: 4 }}>
        {drafting
          ? 'Click to add corners. Click the first corner, double-click or press Enter to close the shape. Esc cancels.'
          : 'Click the map to start a ceiling shape; click a shape\'s outline to edit it.'}
      </div>
      <div style={{ color: '#aaa', marginBottom: 4 }} title="Levels share a parent map; the next level up covering a spot is its ceiling">
        Level Z {ctx.z > 0 ? '+' : ''}{ctx.z} · {above}
      </div>
      <label style={{ display: 'block', marginBottom: 4 }}>
        This map's headroom ({unit}){' '}
        <ValueField<Optional> value={mapHeadroomCm(mapData) ?? 'unset'} format={optionalText} parse={optional(1)} commit="blur" width={60}
          title="Ceiling height above the floor wherever no ceiling object or level above sets a lower one. Blank: none (open sky, or the level above)."
          onChange={(v) => setMapLength('headroom', v === 'unset' ? null : v)} />
      </label>
      <label style={{ display: 'block', marginBottom: 6 }}>
        Floor thickness ({unit}){' '}
        <ValueField<Optional> value={mapSlabCm(mapData) ?? 'unset'} format={optionalText} parse={optional(0)} commit="blur" width={60}
          title={`Thickness of this map's floor: the level below's ceiling is this much under it. Blank: the world set's ${formatHeight(defaultSlab, units)}.`}
          onChange={(v) => setMapLength('slab', v === 'unset' ? null : v)} />
        {mapSlabCm(mapData) === null && <span style={{ color: '#888' }}> {formatHeight(defaultSlab, units)}</span>}
      </label>
      <label style={{ display: 'block', marginBottom: 6, borderTop: '1px solid #333', paddingTop: 4 }}>
        New shapes: headroom ({unit}){' '}
        <ValueField value={heightBrush.ceilingHeadroomCm ?? DEFAULT_CEILING_HEADROOM_CM} format={text} parse={positive} commit="change"
          title="Headroom above the floor inside new ceiling shapes"
          onChange={(v) => setHeightBrush({ ceilingHeadroomCm: v })} />
      </label>
      {selected ? (
        <div style={{ borderTop: '1px solid #333', paddingTop: 4 }}>
          <div style={{ color: '#aaa', marginBottom: 4 }}>Selected shape · {selected.points.length} corners</div>
          <label style={{ display: 'block', marginBottom: 4 }}>
            Name{' '}
            <ValueField value={selected.name} format={(s) => s} parse={(t) => t.trim()} commit="blur" width={110}
              title="Optional name" onChange={(n) => updateCeiling(selected.id, { name: n })} />
          </label>
          <label style={{ display: 'block', marginBottom: 4 }}>
            Headroom ({unit}){' '}
            <ValueField value={selected.headroomCm} format={text} parse={positive} commit="blur"
              title="Ceiling height above the floor inside this shape (Enter to apply)"
              onChange={(v) => updateCeiling(selected.id, { headroomCm: v })} />
          </label>
          <div style={{ color: '#888', marginBottom: 4 }}>
            Drag corners to move them; drag a midpoint to add one. Delete removes the selected corner.
          </div>
          <button className="btn-danger" style={{ fontSize: 11 }} onClick={() => { deleteCeiling(selected.id); selectCeiling(null); }}>
            Delete shape
          </button>
        </div>
      ) : (
        <div style={{ color: '#888' }}>{areas.length} ceiling shape{areas.length === 1 ? '' : 's'} on this map.</div>
      )}
      <div style={{ color: '#888', marginTop: 4 }}>
        Inside a shape its headroom replaces the map's; the floor above (or the ground) is always the limit.
      </div>
    </div>
  );
};
