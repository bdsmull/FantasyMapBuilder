import React, { useState } from 'react';
import { useMapStore } from '../store/mapStore';
import { useWorldSetStore } from '../store/worldSetStore';
import { resolveUnits } from '../data/mapScales';
import { formatHeight, hasHeightsProperty, parseHeightToCm, patchRange } from '../utils/heightGrid';
import { HeightBrushControls } from './HeightBrushControls';
import { useWorldSurfaceStore, surfaceKey } from '../store/worldSurfaceStore';

/**
 * Elevation section of the Layers panel: add or remove the map's elevation and
 * control how the overlay is shown. Heights are saved with the map (Ctrl+S).
 */
export const ElevationPanel: React.FC = () => {
  const { mapData, mapName, mapWorldSet, heights, elevationView, addElevation, removeElevation, setElevationView, selectedTool } = useMapStore();
  const surface = useWorldSurfaceStore();
  const childNames = surface.key === surfaceKey(mapWorldSet, mapName) ? surface.children.map((c) => c.node.name) : [];
  const worldSetUnits = useWorldSetStore((s) => s.activeWorldSet?.units);
  const [adding, setAdding] = useState(false);
  const [startHeight, setStartHeight] = useState('0');
  const [confirmRemove, setConfirmRemove] = useState(false);

  if (!mapData) return null;
  const units = resolveUnits(mapData, worldSetUnits);
  const unitLabel = units === 'imperial' ? 'ft' : 'm';
  const startCm = parseHeightToCm(startHeight, units);

  if (!heights) {
    if (hasHeightsProperty(mapData)) {
      return <div className="elevation-panel"><span className="layer-name" style={{ color: '#888' }}>Loading elevation…</span></div>;
    }
    return (
      <div className="elevation-panel">
        {!adding ? (
          <button className="btn-secondary" onClick={() => setAdding(true)} title="Give this map a height surface">
            Add elevation…
          </button>
        ) : (
          <div>
            <label style={{ display: 'block', marginBottom: 4 }}>
              Starting height ({unitLabel}){' '}
              <input
                type="text"
                value={startHeight}
                onChange={(e) => setStartHeight(e.target.value)}
                style={{ width: 80 }}
              />
            </label>
            <button className="btn-primary" disabled={startCm === null} onClick={() => { addElevation(startCm ?? 0); setAdding(false); }}>
              Add
            </button>{' '}
            <button onClick={() => setAdding(false)}>Cancel</button>
          </div>
        )}
      </div>
    );
  }

  const range = patchRange(heights);
  return (
    <div className="elevation-panel">
      <div className="layer-item" style={{ cursor: 'default' }}>
        <input
          type="checkbox"
          checked={elevationView.visible}
          onChange={(e) => setElevationView({ visible: e.target.checked })}
          title="Toggle elevation overlay"
        />
        <span className="layer-icon">⛰</span>
        <span className="layer-name" title="Saved with the map">
          Elevation
          <span style={{ color: '#888', marginLeft: 6, fontSize: 11 }}>
            {range.min === range.max
              ? formatHeight(range.min, units)
              : `${formatHeight(range.min, units)} – ${formatHeight(range.max, units)}`}
          </span>
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 8px', fontSize: 12 }}>
        <label title="Overlay opacity">
          Opacity{' '}
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(elevationView.opacity * 100)}
            onChange={(e) => setElevationView({ opacity: Number(e.target.value) / 100 })}
            style={{ width: 70, verticalAlign: 'middle' }}
          />
        </label>
        <label title="Shade slopes as if lit from the north-west">
          <input
            type="checkbox"
            checked={elevationView.hillshade}
            onChange={(e) => setElevationView({ hillshade: e.target.checked })}
          />{' '}
          Hillshade
        </label>
      </div>
      {childNames.length > 0 && (
        <div style={{ padding: '2px 8px', fontSize: 12 }}>
          <label title={`Inside their footprints, show the heights of: ${childNames.join(', ')}. This map's own heights are unchanged.`}>
            <input
              type="checkbox"
              checked={elevationView.showChildren}
              onChange={(e) => setElevationView({ showChildren: e.target.checked })}
            />{' '}
            Show child maps ({childNames.length})
          </label>
        </div>
      )}
      {selectedTool === 'height' && <HeightBrushControls units={units} />}
      <div style={{ padding: '2px 8px' }}>
        {!confirmRemove ? (
          <button className="btn-secondary" onClick={() => setConfirmRemove(true)} style={{ fontSize: 11 }}>
            Remove elevation…
          </button>
        ) : (
          <span style={{ fontSize: 12 }}>
            Remove this map's elevation? (Takes effect when you save.){' '}
            <button className="btn-danger" onClick={() => { removeElevation(); setConfirmRemove(false); }}>Remove</button>{' '}
            <button onClick={() => setConfirmRemove(false)}>Cancel</button>
          </span>
        )}
      </div>
    </div>
  );
};
