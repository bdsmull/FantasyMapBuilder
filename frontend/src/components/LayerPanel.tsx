import React from 'react';
import { useMapStore } from '../store/mapStore';

export const LayerPanel: React.FC = () => {
  const { mapData, activeLayerIndex, setActiveLayer, setLayerVisible } = useMapStore();

  if (!mapData) {
    return <div className="panel-empty">No map open</div>;
  }

  // Display layers top-first (reverse of storage order)
  const reversed = [...mapData.layers].reverse();
  const lastIdx = mapData.layers.length - 1;

  return (
    <div className="layer-panel">
      <div className="panel-header">Layers</div>
      <ul className="layer-list">
        {reversed.map((layer, revIdx) => {
          const actualIdx = lastIdx - revIdx;
          const isActive = actualIdx === activeLayerIndex;
          return (
            <li
              key={actualIdx}
              className={`layer-item${isActive ? ' active' : ''}`}
              onClick={() => setActiveLayer(actualIdx)}
            >
              <input
                type="checkbox"
                checked={layer.visible}
                onChange={(e) => {
                  e.stopPropagation();
                  setLayerVisible(actualIdx, e.target.checked);
                }}
                title="Toggle visibility"
              />
              <span className="layer-icon">
                {layer.type === 'tilelayer' ? '▦' : '◉'}
              </span>
              <span className="layer-name">{layer.name}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
