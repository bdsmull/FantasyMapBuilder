import React from 'react';
import { useMapStore } from '../store/mapStore';
import type { ToolName } from '../store/mapStore';
import { useViewStore } from '../store/viewStore';
import type { TerrainMode } from '../store/viewStore';
import { isObjectLayer, isTileLayer } from '../types/tmj';
import { TilePalette } from './TilePalette';
import { HeightPanel } from './HeightPanel';
import { WaterPanel } from './WaterPanel';
import { LineControls } from './LineControls';

export const TOOL_TITLES: Record<ToolName, string> = {
  inspect: 'Inspect',
  terrain: 'Terrain',
  height: 'Height',
  water: 'Water',
  roads: 'Roads',
  point: 'Points',
};

const _TERRAIN_MODES: { mode: TerrainMode; label: string; hint: string }[] = [
  { mode: 'paint', label: 'Paint', hint: 'Paint the selected tile (drag for more)' },
  { mode: 'fill', label: 'Fill', hint: 'Fill the connected area of the same tile (Shift+click fills in any mode)' },
  { mode: 'erase', label: 'Erase', hint: 'Clear tiles (dragging with the right button erases in any mode)' },
];

const _note: React.CSSProperties = { padding: '6px 8px', fontSize: 12, color: '#888' };

/** Terrain: Paint / Fill / Erase, and the tile palette. */
const TerrainPanel: React.FC = () => {
  const { mapData, activeLayerIndex } = useMapStore();
  const mode = useViewStore((s) => s.terrainMode);
  const setMode = useViewStore((s) => s.setTerrainMode);
  const layer = mapData?.layers[activeLayerIndex];
  return (
    <>
      <div className="mode-row">
        {_TERRAIN_MODES.map((m) => (
          <button key={m.mode} className={`tool-btn${mode === m.mode ? ' active' : ''}`} title={m.hint} onClick={() => setMode(m.mode)}>
            {m.label}
          </button>
        ))}
      </div>
      {layer && !isTileLayer(layer) && (
        <div style={{ ..._note, color: '#fbbf24' }}>The active layer "{layer.name}" holds objects; pick a tile layer (left panel) to paint on.</div>
      )}
      <TilePalette />
      <div style={_note}>Shift+click fills; right-drag erases.</div>
    </>
  );
};

/** Points: where they go and how to remove them. */
const PointPanel: React.FC = () => {
  const { mapData, activeLayerIndex } = useMapStore();
  const layer = mapData?.layers[activeLayerIndex];
  return (
    <div style={_note}>
      Click to place a point on the active object layer. Right-click removes the nearest one (on maps outside a world set; inside one, right-click opens the map menu).
      {layer && !isObjectLayer(layer) && (
        <div style={{ color: '#fbbf24', marginTop: 4 }}>
          The active layer "{layer.name}" is a tile layer; pick an object layer (left panel), or add one with + Objects.
        </div>
      )}
    </div>
  );
};

/**
 * The right panel (#38): the active tool's settings, switching with the tool. P (or
 * View → Tool Panel, or ×) hides it.
 */
export const ToolPanel: React.FC = () => {
  const { mapData, selectedTool } = useMapStore();
  const setShowPalette = useViewStore((s) => s.setShowPalette);
  return (
    <div className="tool-panel">
      <div className="panel-header" style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ flex: 1 }}>{TOOL_TITLES[selectedTool]}</span>
        <button
          className="inspector-close"
          title="Hide the tool panel (P; View → Tool Panel shows it again)"
          aria-label="Hide the tool panel"
          onClick={() => setShowPalette(false)}
        >
          ×
        </button>
      </div>
      <div className="tool-panel-body">
        {!mapData ? <div style={_note}>No map open</div>
          : selectedTool === 'terrain' ? <TerrainPanel />
          : selectedTool === 'height' ? <HeightPanel />
          : selectedTool === 'water' ? <WaterPanel />
          : selectedTool === 'roads' ? <LineControls kind="road" />
          : selectedTool === 'point' ? <PointPanel />
          : <div style={_note}>Click the map to see what's there: terrain, height, water, objects and roads.</div>}
      </div>
    </div>
  );
};
