import React, { useState, useEffect, useRef } from 'react';
import { useMapStore } from '../store/mapStore';
import { useWorldSetStore } from '../store/worldSetStore';
import { resolveUnits } from '../data/mapScales';
import { createPatch, formatHeight, hasHeightsProperty, parseHeightToCm, patchRange } from '../utils/heightGrid';
import { HeightBrushControls } from './HeightBrushControls';
import { GenerateControls } from './GenerateControls';
import { useWorldSurfaceStore, surfaceKey } from '../store/worldSurfaceStore';
import { useEdgeFits } from './useEdgeFits';
import { rebasedHeights, rebaseShiftRange } from '../utils/elevationFit';
import { hasTerrainHeights, heightsFromTerrain, terrainGaps, describeTerrainGaps } from '../utils/terrainHeights';
import { readSpots, spotTargets } from '../utils/spotHeights';
import { readContours, contourTargets } from '../utils/contours';
import { fitHeights } from '../utils/surfaceFit';
import { seaEnabled } from '../utils/water';
import { carveRivers, waterLines } from '../utils/carve';
import { defaultStreamSamples } from '../utils/flow';
import { readLines } from '../utils/lines';
import { resolveLineClasses } from '../data/lineClasses';
import { resolveMetersPerUnit } from '../data/mapScales';

/**
 * Elevation section of the Layers panel: add or remove the map's elevation and
 * control how the overlay is shown. Heights are saved with the map (Ctrl+S).
 */
export const ElevationPanel: React.FC = () => {
  const { mapData, mapName, mapWorldSet, heights, elevationView, addElevation, removeElevation, setElevationView, selectedTool, setSea } = useMapStore();
  const surface = useWorldSurfaceStore();
  const childNames = surface.key === surfaceKey(mapWorldSet, mapName) ? surface.children.map((c) => c.node.name) : [];
  const worldSetUnits = useWorldSetStore((s) => s.activeWorldSet?.units);
  const activeWorldSet = useWorldSetStore((s) => s.activeWorldSet);
  const activeWorldSetName = useWorldSetStore((s) => s.activeWorldSetName);
  const [adding, setAdding] = useState(false);
  const [startHeight, setStartHeight] = useState('0');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [tilt, setTilt] = useState(false);
  const { self: parentFit } = useEdgeFits();
  const replaceHeights = useMapStore((s) => s.replaceHeights);
  const [terrainNote, setTerrainNoteOnly] = useState('');
  const [addNote, setAddNote] = useState('');
  // Painted terrain that heights from terrain couldn't set (shown as a warning)
  const [gapNote, setGapNote] = useState('');
  // A gap note to show once the map's new elevation is in place (adding clears the notes)
  const pendingGapNote = useRef<string | null>(null);
  /** A note under the action buttons; a new one replaces any gap warning. */
  const setTerrainNote = (text: string) => { setTerrainNoteOnly(text); setGapNote(''); };
  const [generating, setGenerating] = useState(false);
  const [fitting, setFitting] = useState(false);
  useEffect(() => {
    setTerrainNoteOnly('');
    setAddNote('');
    setGapNote(pendingGapNote.current ?? '');
    pendingGapNote.current = null;
  }, [mapName, heights]);

  if (!mapData) return null;
  const units = resolveUnits(mapData, worldSetUnits);
  const unitLabel = units === 'imperial' ? 'ft' : 'm';
  const startCm = parseHeightToCm(startHeight, units);
  const terrainReady = hasTerrainHeights(mapData);
  const setUpHint = 'Set them under Edit → Manage Tilesets → Heights… ("Suggest values" fills in common types).';
  /** What heights from terrain left at their current height, with where to fix it; '' when nothing. */
  const gapsAfterTerrain = () => {
    const { gaps, emptyCells } = terrainGaps(mapData);
    const note = describeTerrainGaps(gaps, emptyCells);
    return note && gaps.length ? `${note} ${setUpHint}` : note;
  };
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
    pendingGapNote.current = gapsAfterTerrain();
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
      <div style={{ padding: '2px 8px', fontSize: 12, display: 'flex', flexWrap: 'wrap', gap: '2px 10px' }}>
        <label title="Show lakes and the sea, shaded by depth">
          <input type="checkbox" checked={elevationView.water} onChange={(e) => setElevationView({ water: e.target.checked })} /> Water
        </label>
        <label title="Ground below 0 m that reaches the map's edge is sea. Saved with the map.">
          <input type="checkbox" checked={seaEnabled(mapData)} onChange={(e) => setSea(e.target.checked)} /> Sea below 0 {unitLabel}
        </label>
        <label title="Show where rain would run (streams) and pool (hollows), worked out from the heights. Drawn rivers count as channels.">
          <input type="checkbox" checked={elevationView.flow} onChange={(e) => setElevationView({ flow: e.target.checked })} /> Flow
        </label>
      </div>
      {elevationView.flow && (() => {
        const auto = defaultStreamSamples(heights.cols, heights.rows);
        const value = elevationView.streamSamples ?? auto;
        // Slider in log steps: right shows more (smaller) streams
        const max = Math.log2(Math.max(64, heights.cols * heights.rows / 8));
        return (
          <div style={{ padding: '0 8px 2px', fontSize: 12 }}>
            <label title={`A stream shows where at least ${value.toLocaleString('en-US')} cells drain through`}>
              Streams: fewer{' '}
              <input
                type="range" min={1} max={max} step={0.25} value={max + 1 - Math.log2(value)}
                onChange={(e) => setElevationView({ streamSamples: Math.round(2 ** (max + 1 - Number(e.target.value))) })}
                style={{ width: 80, verticalAlign: 'middle' }}
              />{' '}
              more
            </label>
            {elevationView.streamSamples !== null && (
              <button className="btn-secondary" style={{ fontSize: 10, marginLeft: 4, padding: '0 4px' }} onClick={() => setElevationView({ streamSamples: null })}>
                Reset
              </button>
            )}
          </div>
        );
      })()}
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
            const gaps = n > 0 ? gapsAfterTerrain() : '';
            setTerrainNote(n > 0 ? `Set ${n.toLocaleString('en-US')} heights from terrain.`
              : allHandSet ? 'All the terrain with base heights is under hand-set heights (Release unprotects them).'
              : terrainProblem());
            setGapNote(gaps);
          }}
        >
          Heights from terrain
        </button>{' '}
        <button
          className={`btn-secondary${generating ? ' active' : ''}`}
          style={{ fontSize: 11 }}
          title="Add natural-looking detail on top of the current heights"
          onClick={() => setGenerating(!generating)}
        >
          Generate…
        </button>{' '}
        {(() => {
          const spots = readSpots(mapData);
          const contours = readContours(mapData);
          const n = spots.length + contours.length;
          const plural = (k: number, word: string) => `${k} ${word}${k === 1 ? '' : 's'}`;
          const what = [spots.length ? plural(spots.length, 'spot height') : '', contours.length ? plural(contours.length, 'contour') : '']
            .filter(Boolean).join(' and ');
          return (
            <button
              className="btn-secondary"
              style={{ fontSize: 11 }}
              disabled={n === 0 || fitting}
              title={n
                ? 'Bend the surface so it passes through every spot height and follows every contour, keeping its shape. Hand-set heights are kept. Undoable.'
                : 'No spot heights or contours yet: add them with the Height tool in Spot or Contour mode'}
              onClick={() => {
                // Let the button show "Fitting…" before the work (a second or two on a large map)
                setFitting(true);
                setTimeout(() => {
                  setFitting(false);
                  const { mapData: map, heights: patch } = useMapStore.getState();
                  if (!map || !patch) return;
                  const result = fitHeights(map, patch, [...spotTargets(spots), ...contourTargets(map, contours)]);
                  if (result.changed > 0) replaceHeights(result.cm);
                  const miss = result.maxMissCm >= 50
                    ? ` Largest remaining difference ${formatHeight(result.maxMissCm, units)} (hand-set heights, or contours that cross or crowd each other).`
                    : '';
                  setTerrainNote(result.changed > 0
                    ? `Fitted to ${what}.${miss}`
                    : `The surface already matches the ${what}.${miss}`);
                }, 30);
              }}
            >
              {fitting ? 'Fitting…' : <>Fit to spots &amp; contours ({n})</>}
            </button>
          );
        })()}
        {' '}
        {(() => {
          const classes = resolveLineClasses(mapWorldSet === activeWorldSetName ? activeWorldSet?.lineClasses : undefined);
          const rivers = waterLines(readLines(mapData), classes);
          return (
            <button
              className="btn-secondary"
              style={{ fontSize: 11 }}
              disabled={rivers.length === 0}
              title={rivers.length
                ? 'Lower the ground along each drawn river, stream, brook and canal into a channel that falls all the way downstream (depth from its width). Hand-set heights are kept. Undoable.'
                : 'No rivers drawn yet: draw them with the Line tool (River, Stream, Brook or Canal)'}
              onClick={() => {
                const { mapData: map, heights: patch } = useMapStore.getState();
                if (!map || !patch) return;
                const result = carveRivers(map, patch, rivers, classes, resolveMetersPerUnit(map, worldSetUnits) ?? null);
                if (result.changed > 0) replaceHeights(result.cm);
                setTerrainNote(result.changed > 0
                  ? `Carved ${rivers.length} river${rivers.length === 1 ? '' : 's'}: lowered ${result.changed.toLocaleString('en-US')} heights.`
                  : 'The rivers are already carved in.');
              }}
            >
              Carve rivers ({rivers.length})
            </button>
          );
        })()}
        {terrainNote && <div style={{ color: '#888', marginTop: 4 }}>{terrainNote}</div>}
        {gapNote && <div style={{ color: '#fbbf24', marginTop: 4 }}>⚠ {gapNote}</div>}
      </div>
      {generating && <GenerateControls units={units} onClose={() => setGenerating(false)} />}
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
