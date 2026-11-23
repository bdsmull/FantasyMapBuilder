import React, { useState } from 'react';
import { useMapStore } from '../store/mapStore';
import { useViewStore } from '../store/viewStore';
import type { WaterToolMode } from '../store/viewStore';
import { useWorldSetStore } from '../store/worldSetStore';
import { resolveMetersPerUnit, resolveUnits } from '../data/mapScales';
import { resolveLineClasses } from '../data/lineClasses';
import { hasHeightsProperty } from '../utils/heightGrid';
import { seaEnabled } from '../utils/water';
import { carveRivers, waterLines } from '../utils/carve';
import { readLines } from '../utils/lines';
import { WaterControls } from './WaterControls';
import { LineControls } from './LineControls';
import { PanelSection } from './PanelSection';
import { StreamSlider } from './ShowPanel';

const _MODES: { mode: WaterToolMode; label: string; hint: string }[] = [
  { mode: 'lakes', label: 'Lakes & sea', hint: 'Place lakes (a surface height that fills its basin) and set the sea' },
  { mode: 'rivers', label: 'Rivers', hint: 'Draw and edit rivers, streams, brooks and canals' },
];

/** Convert to River and Carve rivers: what the elevation can do for drawn rivers. */
const RiversFromElevation: React.FC = () => {
  const { mapData, mapWorldSet, heights, elevationView, setElevationView, replaceHeights } = useMapStore();
  const { activeWorldSetName, activeWorldSet } = useWorldSetStore();
  const converting = useViewStore((s) => s.convertingStream);
  const setConverting = useViewStore((s) => s.setConvertingStream);
  const streamNote = useViewStore((s) => s.streamNote);
  const setStreamNote = useViewStore((s) => s.setStreamNote);
  const [carveNote, setCarveNote] = useState('');
  if (!mapData) return null;
  if (!heights) {
    return (
      <div style={{ padding: '4px 8px', fontSize: 12, color: '#888' }}>
        With elevation (Height tool) you can also turn the streams rain would make into rivers, and carve rivers into the ground.
      </div>
    );
  }
  const classes = resolveLineClasses(mapWorldSet === activeWorldSetName ? activeWorldSet?.lineClasses : undefined);
  const rivers = waterLines(readLines(mapData), classes);
  return (
    <div style={{ padding: '4px 8px', fontSize: 12 }}>
      {elevationView.flow ? (
        <>
          <button className={converting ? 'btn-primary' : 'btn-secondary'} style={{ fontSize: 11 }}
            title="Turn a stream from the Flow view into a drawn river: click this, then click the stream"
            onClick={() => { setConverting(!converting); setStreamNote(''); }}>
            {converting ? 'Cancel' : 'Convert to River'}
          </button>
          {converting && (
            <div style={{ color: '#888', marginTop: 4 }}>
              Click on a blue Flow stream: it becomes a river from where it begins to where it ends (highlighted as you point). Esc cancels.
            </div>
          )}
          <div style={{ marginLeft: -24 }}><StreamSlider /></div>
        </>
      ) : (
        <div style={{ color: '#888' }}>
          <button className="btn-secondary" style={{ fontSize: 11, marginRight: 4 }}
            title="Show where rain would run and pool (also under Show, in the left panel)"
            onClick={() => setElevationView({ flow: true })}>
            Show Flow
          </button>
          to turn the streams rain would make into rivers.
        </div>
      )}
      {streamNote && <div style={{ color: '#aaa', marginTop: 4 }}>{streamNote}</div>}
      <div style={{ marginTop: 6 }}>
        <button
          className="btn-secondary"
          style={{ fontSize: 11 }}
          disabled={rivers.length === 0}
          title={rivers.length
            ? 'Lower the ground along each drawn river, stream, brook and canal into a channel that falls all the way downstream (depth from its width). Hand-set heights are kept. Undoable.'
            : 'No rivers drawn yet'}
          onClick={() => {
            const { mapData: map, heights: patch } = useMapStore.getState();
            if (!map || !patch) return;
            const result = carveRivers(map, patch, rivers, classes, resolveMetersPerUnit(map, activeWorldSet?.units) ?? null);
            if (result.changed > 0) replaceHeights(result.cm);
            setCarveNote(result.changed > 0
              ? `Carved ${rivers.length} river${rivers.length === 1 ? '' : 's'}: lowered ${result.changed.toLocaleString('en-US')} heights.`
              : 'The rivers are already carved in.');
          }}
        >
          Carve rivers ({rivers.length})
        </button>
        {carveNote && <div style={{ color: '#888', marginTop: 4 }}>{carveNote}</div>}
      </div>
    </div>
  );
};

/**
 * The Water tool's panel (#38): Lakes & sea (needs elevation) or Rivers (drawn
 * waterways, plus Convert to River and Carve rivers when the map has elevation).
 */
export const WaterPanel: React.FC = () => {
  const { mapData, heights, setSea, setTool } = useMapStore();
  const worldSetUnits = useWorldSetStore((s) => s.activeWorldSet?.units);
  const mode = useViewStore((s) => s.waterMode);
  const setMode = useViewStore((s) => s.setWaterMode);
  const setConverting = useViewStore((s) => s.setConvertingStream);
  if (!mapData) return null;
  const units = resolveUnits(mapData, worldSetUnits);
  const unitLabel = units === 'imperial' ? 'ft' : 'm';

  return (
    <div className="water-panel">
      <div className="mode-row">
        {_MODES.map((m) => (
          <button
            key={m.mode}
            className={`tool-btn${mode === m.mode ? ' active' : ''}`}
            title={m.hint}
            onClick={() => { setMode(m.mode); setConverting(false); }}
          >
            {m.label}
          </button>
        ))}
      </div>
      {mode === 'lakes' ? (
        heights ? (
          <>
            <label style={{ display: 'block', padding: '2px 8px 4px', fontSize: 12 }} title="Ground below 0 m that reaches the map's edge is sea. Saved with the map.">
              <input type="checkbox" checked={seaEnabled(mapData)} onChange={(e) => setSea(e.target.checked)} /> Sea below 0 {unitLabel}
            </label>
            <div style={{ padding: '0 8px 4px', fontSize: 12 }}>
              <WaterControls units={units} />
            </div>
          </>
        ) : (
          <div style={{ padding: '4px 8px', fontSize: 12, color: '#888' }}>
            {hasHeightsProperty(mapData) ? 'Loading elevation…' : (
              <>
                Lakes and the sea fill the ground below their surface, so they need elevation.{' '}
                <button className="btn-secondary" style={{ fontSize: 11 }} onClick={() => setTool('height')}>
                  Add elevation (Height tool)
                </button>
              </>
            )}
          </div>
        )
      ) : (
        <>
          <LineControls kind="water" />
          <PanelSection id="water.fromElevation" title="From the elevation">
            <RiversFromElevation />
          </PanelSection>
        </>
      )}
    </div>
  );
};
