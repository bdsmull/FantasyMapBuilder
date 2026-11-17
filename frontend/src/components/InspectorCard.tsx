import React from 'react';
import { useMapStore } from '../store/mapStore';
import { useWorldSetStore } from '../store/worldSetStore';
import { useViewStore } from '../store/viewStore';
import { useWorldSurfaceStore, surfaceKey } from '../store/worldSurfaceStore';
import { resolveMetersPerUnit, resolveUnits } from '../data/mapScales';
import type { UnitSystem } from '../data/mapScales';
import { formatHeight, heightAt } from '../utils/heightGrid';
import { surfaceAt, pixelToCell } from '../utils/worldSurface';
import { inspectAt } from '../utils/inspect';
import type { Footprint } from '../utils/worldSetUtils';

/** Screen pixels around a point object that count as clicking it. */
const _PICK_RADIUS_PX = 10;
const _METERS_PER_FOOT = 0.3048;

/** A distance in the map's units, switching to km / mi when large. */
function _distance(m: number, units: UnitSystem): string {
  if (units === 'imperial') {
    const ft = m / _METERS_PER_FOOT;
    return ft >= 5280 * 2 ? `${(ft / 5280).toLocaleString('en-US', { maximumFractionDigits: 1 })} mi` : `${Math.round(ft).toLocaleString('en-US')} ft`;
  }
  return m >= 10_000 ? `${(m / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })} km` : `${Math.round(m).toLocaleString('en-US')} m`;
}

const _section: React.CSSProperties = { borderTop: '1px solid #333', padding: '6px 0 2px' };
const _label: React.CSSProperties = { color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' };

interface Props {
  /** Child map footprints on this map, to list the ones covering the inspected cell. */
  footprints: Map<string, Footprint>;
  onOpenMap: (name: string) => void;
}

/** What is at the point the Inspect tool picked: cell, location, elevation, terrain, objects, child maps. */
export const InspectorCard: React.FC<Props> = ({ footprints, onOpenMap }) => {
  const inspected = useViewStore((s) => s.inspected);
  const setInspected = useViewStore((s) => s.setInspected);
  const { mapData, mapName, mapWorldSet, heights, zoom, elevationView } = useMapStore();
  const defaultUnits = useWorldSetStore((s) => s.activeWorldSet?.units);
  const surface = useWorldSurfaceStore();
  if (!mapData || !inspected) return null;

  const info = inspectAt(mapData, inspected.x, inspected.y, _PICK_RADIUS_PX / zoom);
  const units = resolveUnits(mapData, defaultUnits);
  const mpu = resolveMetersPerUnit(mapData, defaultUnits);

  let elevation: { cm: number; source: string; handSet: boolean } | null = null;
  if (heights && info) {
    const children = elevationView.showChildren && surface.key === surfaceKey(mapWorldSet, mapName) ? surface.children : [];
    const here = children.length
      ? surfaceAt(mapData, heights, children, inspected.x, inspected.y, mapName)
      : { cm: heightAt(mapData, heights, inspected.x, inspected.y), source: mapName };
    // Nearest sample: the hex centre, or the closest cell corner
    const si = mapData.orientation === 'hexagonal'
      ? info.row * heights.cols + info.col
      : Math.round(inspected.y / mapData.tileheight) * heights.cols + Math.round(inspected.x / mapData.tilewidth);
    elevation = { ...here, handSet: !!heights.mask[si] };
  }

  const childMaps = info
    ? [...footprints].filter(([, fp]) => info.col >= fp.colMin && info.col <= fp.colMax && info.row >= fp.rowMin && info.row <= fp.rowMax).map(([n]) => n)
    : [];

  return (
    <div className="inspector-card" role="dialog" aria-label="Inspector">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
        <strong style={{ flex: 1 }}>{info ? `Cell ${info.col}, ${info.row}` : 'Off the map'}</strong>
        <button className="inspector-close" title="Close (Esc)" aria-label="Close inspector" onClick={() => setInspected(null)}>×</button>
      </div>

      {info && mpu && (() => {
        const { u, v } = pixelToCell(mapData, inspected.x, inspected.y);
        return (
          <div style={{ color: '#aaa' }} title="Distance from the map's top-left corner">
            {_distance(u * mpu, units)} east, {_distance(v * mpu, units)} south · cells {_distance(mpu, units)}
          </div>
        );
      })()}

      {elevation && (
        <div style={_section}>
          <div style={_label}>Elevation</div>
          {formatHeight(elevation.cm, units)}
          {elevation.source !== mapName && <span style={{ color: '#888' }}> · from {elevation.source}</span>}
          {elevation.handSet && <span style={{ color: '#888' }}> · hand-set</span>}
        </div>
      )}

      {info && (
        <div style={_section}>
          <div style={_label}>Terrain</div>
          {info.tiles.length === 0 && <div style={{ color: '#888' }}>Empty</div>}
          {info.tiles.map((t) => (
            <div key={t.layer + t.gid} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ width: 10, height: 10, flex: '0 0 10px', background: t.color ?? '#555', border: '1px solid #222' }} />
              <span style={{ flex: 1 }}>
                {t.type}
                {t.terrain && <span style={{ color: '#888' }}> · base {formatHeight(t.terrain.baseCm, units)}</span>}
              </span>
              <span style={{ color: '#777', fontSize: 11 }} title={`Tileset: ${t.tileset}`}>
                {t.layer}{t.layerVisible ? '' : ' (hidden)'}
              </span>
            </div>
          ))}
        </div>
      )}

      {info && info.objects.length > 0 && (
        <div style={_section}>
          <div style={_label}>Objects</div>
          {info.objects.map((o) => (
            <div key={`${o.layer}/${o.id}`} style={{ marginBottom: 4 }}>
              <div>
                {o.name || <span style={{ color: '#888' }}>(unnamed)</span>}
                <span style={{ color: '#888' }}> · {o.type ? `${o.type} ` : ''}{o.kind}</span>
                <span style={{ color: '#777', fontSize: 11, float: 'right' }}>{o.layer}</span>
              </div>
              {o.properties.map((p) => (
                <div key={p.name} style={{ color: '#aaa', fontSize: 11, paddingLeft: 8 }}>
                  {p.name}: {String(p.value)}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {childMaps.length > 0 && (
        <div style={_section}>
          <div style={_label}>Child maps here</div>
          {childMaps.map((n) => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ flex: 1 }}>{n}</span>
              <button className="btn-secondary" style={{ fontSize: 11, padding: '1px 8px' }} onClick={() => onOpenMap(n)}>Open</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
