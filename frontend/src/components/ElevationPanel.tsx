import React, { useState, useEffect } from 'react';
import { useMapStore } from '../store/mapStore';
import { useWorldSetStore } from '../store/worldSetStore';
import { resolveUnits } from '../data/mapScales';
import { createPatch, formatHeight, hasHeightsProperty, parseHeightToCm, patchRange } from '../utils/heightGrid';
import { HeightBrushControls } from './HeightBrushControls';
import { useWorldSurfaceStore, surfaceKey } from '../store/worldSurfaceStore';
import { useEdgeFits } from './useEdgeFits';
import { rebasedHeights, rebaseShiftRange } from '../utils/elevationFit';
import { hasTerrainHeights, heightsFromTerrain } from '../utils/terrainHeights';

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
  const [tilt, setTilt] = useState(false);
  const { self: parentFit } = useEdgeFits();
  const replaceHeights = useMapStore((s) => s.replaceHeights);
  const [terrainNote, setTerrainNote] = useState('');
  const [addNote, setAddNote] = useState('');
  useEffect(() => { setTerrainNote(''); setAddNote(''); }, [mapName, heights]);

  if (!mapData) return null;
  const units = resolveUnits(mapData, worldSetUnits);
  const unitLabel = units === 'imperial' ? 'ft' : 'm';
  const startCm = parseHeightToCm(startHeight, units);
  const terrainReady = hasTerrainHeights(mapData);
  const setUpHint = 'Set them under Edit → Manage Tilesets → Heights… ("Suggest values" fills in common types).';
  /** Why heights from terrain set nothing. */
  const terrainProblem = () => (terrainReady
    ? `None of the terrain painted on this map has a base height. ${setUpHint}`
    : `This map's terrain types have no base heights yet. ${setUpHint}`);

  /** Set heights from the painted terrain (one undo step); returns how many samples it set. */
  const fromTerrain = (): number => {
    const { mapData: map, heights: patch } = useMapStore.getState();
    if (!map || !patch) return 0;
    const result = heightsFromTerrain(map, patch);
    if (result.changed > 0) replaceHeights(result.cm);
    return result.changed;
  };

  /** Add elevation starting from the terrain; explains instead when there's nothing to start from. */
  const addFromTerrain = () => {
    if (startCm === null) return;
    const result = heightsFromTerrain(mapData, createPatch(mapData, startCm));
    if (result.changed === 0) { setAddNote(terrainProblem()); return; }
    addElevation(startCm);
    replaceHeights(result.cm);
    setAdding(false);
  };

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
            <button
              className="btn-secondary"
              disabled={startCm === null}
              title="Start from the painted terrain types' base heights; places without one get the starting height"
              onClick={addFromTerrain}
            >
              Add from terrain
            </button>{' '}
            <button onClick={() => { setAdding(false); setAddNote(''); }}>Cancel</button>
            {addNote && <div style={{ color: '#fbbf24', fontSize: 12, marginTop: 4 }}>{addNote}</div>}
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
      {parentFit && (() => {
        const shift = rebaseShiftRange(mapData, heights, parentFit.fit, tilt);
        const fmt = (cm: number) => formatHeight(Math.round(Math.abs(cm)), units);
        const preview = Math.round(shift.min) === Math.round(shift.max)
          ? `${shift.min >= 0 ? 'Raises' : 'Lowers'} the map by ${fmt(shift.min)}`
          : `Moves it by ${shift.min < 0 ? '−' : '+'}${fmt(shift.min)} to ${shift.max < 0 ? '−' : '+'}${fmt(shift.max)} across the map`;
        const nothingToDo = Math.round(shift.min) === 0 && Math.round(shift.max) === 0;
        const note = !nothingToDo ? preview + '.'
          : !parentFit.mismatch ? 'Already fits.'
          : tilt ? "Shifting and tilting can't improve this: the parent's ground isn't even under this map."
          : "Shifting can't improve this; try Tilt to match.";
        return (
          <div className="elevation-fit" style={{ padding: '4px 8px', fontSize: 12, borderTop: '1px solid #333' }}>
            <div style={{ color: parentFit.mismatch ? '#fbbf24' : '#aaa', marginBottom: 4 }} title="Compares this map's edge band with the parent's own heights under it">
              {parentFit.mismatch ? '⚠ ' : ''}Fit to parent: {parentFit.summary}
            </div>
            <label title="Also tilt the map to follow the slope of the parent around it" style={{ marginRight: 8 }}>
              <input type="checkbox" checked={tilt} onChange={(e) => setTilt(e.target.checked)} /> Tilt to match
            </label>
            <button
              className="btn-secondary"
              style={{ fontSize: 11 }}
              disabled={nothingToDo}
              title={`${preview}. Changes this map's heights (undoable); hand-set marks are kept.`}
              onClick={() => replaceHeights(rebasedHeights(mapData, heights, parentFit.fit, tilt))}
            >
              Re-base
            </button>
            <div style={{ color: '#888', marginTop: 2 }}>{note}</div>
          </div>
        );
      })()}
      <div style={{ padding: '2px 8px', fontSize: 12 }}>
        <button
          className="btn-secondary"
          style={{ fontSize: 11 }}
          title="Set heights from the painted terrain types' base heights, smoothed between types. Hand-set heights are kept. Undoable."
          onClick={() => {
            const n = fromTerrain();
            const allHandSet = terrainReady && heightsFromTerrain(mapData, { ...heights, mask: new Uint8Array(heights.mask.length) }).changed > 0;
            setTerrainNote(n > 0 ? `Set ${n.toLocaleString('en-US')} heights from terrain.`
              : allHandSet ? 'All the terrain with base heights is under hand-set heights (Release unprotects them).'
              : terrainProblem());
          }}
        >
          Heights from terrain
        </button>
        {terrainNote && <div style={{ color: '#888', marginTop: 4 }}>{terrainNote}</div>}
      </div>
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
