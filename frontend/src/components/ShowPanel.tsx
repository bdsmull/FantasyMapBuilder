import React from 'react';
import { useMapStore } from '../store/mapStore';
import { useWorldSetStore } from '../store/worldSetStore';
import { useViewStore } from '../store/viewStore';
import { useCrossScaleStore } from '../store/crossScaleStore';
import { useWorldSurfaceStore, surfaceKey } from '../store/worldSurfaceStore';
import { resolveUnits } from '../data/mapScales';
import { formatHeight, hasHeightsProperty, patchRange } from '../utils/heightGrid';
import { defaultStreamSamples } from '../utils/flow';
import { shownLines } from '../utils/lines';
import { mapHeadroomCm } from '../utils/ceilings';

/** The Flow view's stream detail: fewer (only big streams) to more. */
export const StreamSlider: React.FC = () => {
  const { heights, elevationView, setElevationView } = useMapStore();
  if (!heights) return null;
  const auto = defaultStreamSamples(heights.cols, heights.rows);
  const value = elevationView.streamSamples ?? auto;
  // Slider in log steps: right shows more (smaller) streams
  const max = Math.log2(Math.max(64, heights.cols * heights.rows / 8));
  return (
    <div style={{ padding: '0 8px 2px 24px', fontSize: 12 }}>
      <label title={`A stream shows where at least ${value.toLocaleString('en-US')} cells drain through`}>
        Streams: fewer{' '}
        <input
          type="range" min={1} max={max} step={0.25} value={max + 1 - Math.log2(value)}
          onChange={(e) => setElevationView({ streamSamples: Math.round(2 ** (max + 1 - Number(e.target.value))) })}
          style={{ width: 70, verticalAlign: 'middle' }}
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
};

/**
 * The left panel's Show section (#38): what's drawn over the map, apart from the
 * tools, so e.g. water stays visible while painting terrain. Nothing here changes the map.
 */
export const ShowPanel: React.FC = () => {
  const { mapData, mapName, mapWorldSet, heights, elevationView, setElevationView } = useMapStore();
  const worldSetUnits = useWorldSetStore((s) => s.activeWorldSet?.units);
  const showLines = useViewStore((s) => s.showLines);
  const setShowLines = useViewStore((s) => s.setShowLines);
  const cross = useCrossScaleStore();
  const surface = useWorldSurfaceStore();
  if (!mapData) return null;
  const childNames = surface.key === surfaceKey(mapWorldSet, mapName) ? surface.children.map((c) => c.node.name) : [];
  const units = resolveUnits(mapData, worldSetUnits);
  const own = shownLines(mapData).length;
  const other = cross.key === surfaceKey(mapWorldSet, mapName) ? cross.ghosts.length : 0;
  const range = heights ? patchRange(heights) : null;
  const headroomOwn = mapHeadroomCm(mapData);

  return (
    <div className="show-panel">
      <label
        className="layer-item roads-rivers-row"
        style={{ cursor: 'default' }}
        title="This map's roads and rivers on shown layers, and faded ones from parent and child maps"
      >
        <input type="checkbox" checked={showLines} onChange={(e) => setShowLines(e.target.checked)} aria-label="Show roads and rivers" />
        <span className="layer-icon">〰</span>
        <span className="layer-name">
          Roads &amp; rivers
          <span style={{ color: '#888', marginLeft: 6, fontSize: 11 }}>
            {own} here{other ? ` · ${other} from other maps` : ''}
          </span>
        </span>
      </label>

      {heights && range ? (
        <>
          <label className="layer-item" style={{ cursor: 'default' }} title="Show the elevation overlay">
            <input type="checkbox" checked={elevationView.visible} onChange={(e) => setElevationView({ visible: e.target.checked })} />
            <span className="layer-icon">⛰</span>
            <span className="layer-name">
              Elevation
              <span style={{ color: '#888', marginLeft: 6, fontSize: 11 }}>
                {range.min === range.max ? formatHeight(range.min, units) : `${formatHeight(range.min, units)} – ${formatHeight(range.max, units)}`}
              </span>
            </span>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px 8px', padding: '2px 8px 2px 24px', fontSize: 12 }}>
            <label title="Overlay opacity">
              Opacity{' '}
              <input
                type="range" min={0} max={100} value={Math.round(elevationView.opacity * 100)}
                onChange={(e) => setElevationView({ opacity: Number(e.target.value) / 100 })}
                style={{ width: 60, verticalAlign: 'middle' }}
              />
            </label>
            <label title="Shade slopes as if lit from the north-west">
              <input type="checkbox" checked={elevationView.hillshade} onChange={(e) => setElevationView({ hillshade: e.target.checked })} /> Hillshade
            </label>
            {childNames.length > 0 && (
              <label title={`Inside their footprints, show the heights of: ${childNames.join(', ')}. This map's own heights are unchanged.`}>
                <input type="checkbox" checked={elevationView.showChildren} onChange={(e) => setElevationView({ showChildren: e.target.checked })} /> Child maps ({childNames.length})
              </label>
            )}
          </div>
          <label className="layer-item" style={{ cursor: 'default' }} title="Show lakes and the sea, shaded by depth">
            <input type="checkbox" checked={elevationView.water} onChange={(e) => setElevationView({ water: e.target.checked })} />
            <span className="layer-icon">≈</span>
            <span className="layer-name">Water</span>
          </label>
          <label
            className="layer-item"
            style={{ cursor: 'default' }}
            title="Show where rain would run (streams) and pool (hollows), worked out from the heights. Drawn rivers count as channels."
          >
            <input type="checkbox" checked={elevationView.flow} onChange={(e) => setElevationView({ flow: e.target.checked })} />
            <span className="layer-icon">↘</span>
            <span className="layer-name">Flow</span>
          </label>
          {elevationView.flow && <StreamSlider />}
          <label
            className="layer-item"
            style={{ cursor: 'default' }}
            title={headroomOwn !== null
              ? `Shade where the headroom isn't this map's own ${formatHeight(headroomOwn, units)}: orange lower (a floor above, a low passage), blue higher (a tall hall)`
              : 'Shade where there is a ceiling (a floor above, the ground, a ceiling shape). Set a headroom for this map in the Height tool\'s Ceiling mode.'}
          >
            <input type="checkbox" checked={elevationView.headroom} onChange={(e) => setElevationView({ headroom: e.target.checked })} />
            <span className="layer-icon">↕</span>
            <span className="layer-name">
              Headroom
              <span style={{ color: '#888', marginLeft: 6, fontSize: 11 }}>
                {headroomOwn !== null ? `differs from ${formatHeight(headroomOwn, units)}` : 'under a ceiling'}
              </span>
            </span>
          </label>
        </>
      ) : (
        <div className="panel-empty" style={{ padding: '6px 8px' }}>
          {hasHeightsProperty(mapData)
            ? 'Loading elevation…'
            : 'No elevation on this map. The Height tool adds it; then its overlay, water and flow show here.'}
        </div>
      )}
    </div>
  );
};
