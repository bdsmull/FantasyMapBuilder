import React, { useState } from 'react';
import { useMapStore } from '../../store/mapStore';
import type { TmjTileset, TmjProperty } from '../../types/tmj';
import type { UnitSystem } from '../../data/mapScales';
import { parseHeightToCm } from '../../utils/heightGrid';
import {
  TILE_HEIGHT_BASE, TILE_HEIGHT_RELIEF, suggestTerrainHeight, withTerrainHeight,
} from '../../utils/terrainHeights';

const _METERS_PER_FOOT = 0.3048;

/** Meters -> text in the shown units ("" when unset). */
function _toText(m: number | null, units: UnitSystem): string {
  if (m === null) return '';
  const v = units === 'imperial' ? m / _METERS_PER_FOOT : m;
  return String(Math.round(v * 10) / 10);
}

/** Text in the shown units -> meters; null when blank; undefined when invalid. */
function _toMeters(text: string, units: UnitSystem): number | null | undefined {
  if (text.trim() === '') return null;
  const cm = parseHeightToCm(text, units);
  return cm === null ? undefined : cm / 100;
}

function _prop(props: TmjProperty[], name: string): number | null {
  const v = props.find((p) => p.name === name)?.value;
  return typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
}

function _swatch(props: TmjProperty[]): string | undefined {
  const c = (n: string) => _prop(props, n);
  const r = c('color_r'), g = c('color_g'), b = c('color_b');
  return r !== null && g !== null && b !== null ? `rgb(${r},${g},${b})` : undefined;
}

interface Draft { base: string; relief: string }

/**
 * Edit the terrain height settings (base height and relief) of a tileset's tiles.
 * Values are kept in meters in the tileset; shown and typed in the map's units.
 */
export const TerrainHeightsEditor: React.FC<{ tileset: TmjTileset; units: UnitSystem; onDone: () => void }> = ({
  tileset, units, onDone,
}) => {
  const setTileProperties = useMapStore((s) => s.setTileProperties);
  const unit = units === 'imperial' ? 'ft' : 'm';
  const [draft, setDraft] = useState<Record<number, Draft>>(() => Object.fromEntries(tileset.tiles.map((t) => [t.id, {
    base: _toText(_prop(t.properties, TILE_HEIGHT_BASE), units),
    relief: _toText(_prop(t.properties, TILE_HEIGHT_RELIEF), units),
  }])));

  const update = (id: number, change: Partial<Draft>) => setDraft((d) => ({ ...d, [id]: { ...d[id], ...change } }));
  const invalid = (text: string) => _toMeters(text, units) === undefined;
  const anyInvalid = Object.values(draft).some((d) => invalid(d.base) || invalid(d.relief));

  const suggestable = tileset.tiles.filter((t) => draft[t.id]?.base.trim() === '' && suggestTerrainHeight(t.type));
  const suggest = () => setDraft((d) => {
    const next = { ...d };
    for (const t of suggestable) {
      const s = suggestTerrainHeight(t.type)!;
      next[t.id] = { base: _toText(s.baseM, units), relief: next[t.id].relief.trim() === '' ? _toText(s.reliefM, units) : next[t.id].relief };
    }
    return next;
  });

  const apply = () => {
    const changes: Record<number, TmjProperty[]> = {};
    for (const t of tileset.tiles) {
      const d = draft[t.id];
      const base = _toMeters(d.base, units), relief = _toMeters(d.relief, units);
      if (base === undefined || relief === undefined) return;
      const before = [_prop(t.properties, TILE_HEIGHT_BASE), _prop(t.properties, TILE_HEIGHT_RELIEF)];
      const same = (a: number | null, b: number | null) => (a === null ? b === null : b !== null && Math.abs(a - b) < 1e-6);
      if (same(before[0], base) && same(before[1], relief)) continue;
      changes[t.id] = withTerrainHeight(t.properties, base, relief === null ? null : Math.abs(relief));
    }
    if (Object.keys(changes).length > 0) setTileProperties(tileset.firstgid, changes);
    onDone();
  };

  return (
    <div className="terrain-heights" style={{ marginTop: 12, borderTop: '1px solid #333', paddingTop: 8 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Terrain heights: {tileset.name}</div>
      <p style={{ color: '#888', fontSize: 12, margin: '0 0 6px' }}>
        Base: typical ground height. Relief: how much it varies (used by generation).
        Shared by every map in the world set that uses this tileset; saved with the map.
      </p>
      <div style={{ maxHeight: 260, overflowY: 'auto' }}>
        <table className="tileset-table">
          <thead>
            <tr><th></th><th>Type</th><th>Base ({unit})</th><th>Relief ({unit})</th></tr>
          </thead>
          <tbody>
            {tileset.tiles.map((t) => (
              <tr key={t.id}>
                <td>
                  <span style={{ display: 'inline-block', width: 12, height: 12, background: _swatch(t.properties) ?? '#555', border: '1px solid #222' }} />
                </td>
                <td>{t.type}</td>
                <td>
                  <input
                    type="text" value={draft[t.id].base} style={{ width: 70, borderColor: invalid(draft[t.id].base) ? '#c44' : undefined }}
                    placeholder="—" aria-label={`${t.type} base height`}
                    onChange={(e) => update(t.id, { base: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="text" value={draft[t.id].relief} style={{ width: 60, borderColor: invalid(draft[t.id].relief) ? '#c44' : undefined }}
                    placeholder="—" aria-label={`${t.type} relief`}
                    onChange={(e) => update(t.id, { relief: e.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          className="btn-secondary"
          disabled={suggestable.length === 0}
          title={suggestable.length ? `Fill blanks for: ${suggestable.map((t) => t.type).join(', ')}` : 'No blank types with a recognised name'}
          onClick={suggest}
        >
          Suggest values ({suggestable.length})
        </button>
        <span style={{ flex: 1 }} />
        <button className="btn-secondary" onClick={onDone}>Cancel</button>
        <button className="btn-primary" disabled={anyInvalid} onClick={apply}>Apply</button>
      </div>
    </div>
  );
};
