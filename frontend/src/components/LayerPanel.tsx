import React, { useState } from 'react';
import { useMapStore } from '../store/mapStore';
import { isTileLayer } from '../types/tmj';
import type { TmjLayer } from '../types/tmj';
import { ElevationPanel } from './ElevationPanel';
import { LineControls } from './LineControls';
import { useViewStore } from '../store/viewStore';
import { useCrossScaleStore } from '../store/crossScaleStore';
import { surfaceKey } from '../store/worldSurfaceStore';
import { readLines } from '../utils/lines';

/** True if deleting the layer would lose painted tiles or placed objects. */
function hasContent(layer: TmjLayer): boolean {
  return isTileLayer(layer) ? layer.data.some((gid) => gid !== 0) : layer.objects.length > 0;
}

export const LayerPanel: React.FC = () => {
  const {
    mapData, activeLayerIndex, setActiveLayer, setLayerVisible, setLayerOpacity,
    addLayer, renameLayer, deleteLayer, moveLayer, selectedTool, mapName, mapWorldSet,
  } = useMapStore();
  const showLines = useViewStore((s) => s.showLines);
  const setShowLines = useViewStore((s) => s.setShowLines);
  const cross = useCrossScaleStore();
  const [renaming, setRenaming] = useState<{ index: number; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  if (!mapData) {
    return <div className="panel-empty">No map open</div>;
  }

  // Display layers top-first (reverse of storage order)
  const reversed = [...mapData.layers].reverse();
  const lastIdx = mapData.layers.length - 1;
  const active = mapData.layers[activeLayerIndex];

  const finishRename = () => {
    if (renaming) renameLayer(renaming.index, renaming.name);
    setRenaming(null);
  };

  const requestDelete = (index: number) => {
    const layer = mapData.layers[index];
    if (layer && hasContent(layer)) setConfirmDelete(index);
    else deleteLayer(index);
  };

  return (
    <div className="layer-panel">
      <div className="panel-header" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ flex: 1 }}>Layers</span>
        <button className="layer-btn" title="Add a tile layer above the active layer" onClick={() => addLayer('tile')}>+ Tile</button>
        <button className="layer-btn" title="Add an object layer above the active layer" onClick={() => addLayer('object')}>+ Objects</button>
      </div>
      <ul className="layer-list">
        {reversed.map((layer, revIdx) => {
          const actualIdx = lastIdx - revIdx;
          const isActive = actualIdx === activeLayerIndex;
          const isRenaming = renaming?.index === actualIdx;
          return (
            <li
              key={layer.id ?? `${actualIdx}-${layer.name}`}
              className={`layer-item${isActive ? ' active' : ''}`}
              onClick={() => setActiveLayer(actualIdx)}
              onDoubleClick={() => setRenaming({ index: actualIdx, name: layer.name })}
              title="Double-click to rename"
            >
              <input
                type="checkbox"
                checked={layer.visible}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setLayerVisible(actualIdx, e.target.checked)}
                title="Toggle visibility"
              />
              <span className="layer-icon">
                {layer.type === 'tilelayer' ? '▦' : '◉'}
              </span>
              {isRenaming ? (
                <input
                  type="text"
                  className="layer-rename"
                  autoFocus
                  value={renaming.name}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setRenaming({ index: actualIdx, name: e.target.value })}
                  onBlur={finishRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') finishRename();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                />
              ) : (
                <span className="layer-name">{layer.name}</span>
              )}
            </li>
          );
        })}
      </ul>

      {active && (
        <div className="layer-controls">
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <button
              className="layer-btn"
              title="Move up (drawn above the layer over it)"
              disabled={activeLayerIndex >= lastIdx}
              onClick={() => moveLayer(activeLayerIndex, 1)}
            >
              ↑
            </button>
            <button
              className="layer-btn"
              title="Move down"
              disabled={activeLayerIndex <= 0}
              onClick={() => moveLayer(activeLayerIndex, -1)}
            >
              ↓
            </button>
            <button className="layer-btn" title="Rename" onClick={() => setRenaming({ index: activeLayerIndex, name: active.name })}>
              Rename
            </button>
            <button
              className="layer-btn btn-danger"
              title={lastIdx === 0 ? "A map needs at least one layer" : 'Delete the active layer'}
              disabled={lastIdx === 0}
              onClick={() => requestDelete(activeLayerIndex)}
            >
              Delete
            </button>
          </div>
          <label style={{ fontSize: 12 }} title="Layer opacity">
            Opacity{' '}
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(active.opacity * 100)}
              onChange={(e) => setLayerOpacity(activeLayerIndex, Number(e.target.value) / 100)}
              style={{ width: 90, verticalAlign: 'middle' }}
            />{' '}
            {Math.round(active.opacity * 100)}%
          </label>
          {confirmDelete !== null && mapData.layers[confirmDelete] && (
            <div className="dialog-warn" style={{ marginTop: 6 }}>
              <p style={{ margin: '0 0 6px' }}>
                Delete "{mapData.layers[confirmDelete].name}" and everything on it? You can undo this.
              </p>
              <button className="btn-danger" onClick={() => { deleteLayer(confirmDelete); setConfirmDelete(null); }}>Delete</button>{' '}
              <button onClick={() => setConfirmDelete(null)}>Cancel</button>
            </div>
          )}
        </div>
      )}

      {(() => {
        const own = readLines(mapData, true).length;
        const other = cross.key === surfaceKey(mapWorldSet, mapName) ? cross.ghosts.length : 0;
        return (
          <div
            className="layer-item roads-rivers-row"
            style={{ cursor: 'default', borderTop: '1px solid #333' }}
            title="This map's roads and rivers (whatever layer they're on, even a hidden one) and faded ones from parent and child maps"
          >
            <input type="checkbox" checked={showLines} onChange={(e) => setShowLines(e.target.checked)} aria-label="Show roads and rivers" />
            <span className="layer-icon">〰</span>
            <span className="layer-name">
              Roads &amp; rivers
              <span style={{ color: '#888', marginLeft: 6, fontSize: 11 }}>
                {own} here{other ? ` · ${other} from other maps` : ''}
              </span>
            </span>
          </div>
        );
      })()}
      {selectedTool === 'line' && <LineControls />}
      <ElevationPanel />
    </div>
  );
};
