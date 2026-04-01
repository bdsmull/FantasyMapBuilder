import React from 'react';
import { useMapStore } from '../store/mapStore';
import { scaleLabel } from '../data/mapScales';

export const StatusBar: React.FC = () => {
  const { mapData, mapName, isDirty, zoom } = useMapStore();

  if (!mapData) {
    return <div className="status-bar"><span>No map open</span></div>;
  }

  return (
    <div className="status-bar">
      <span className="status-name">
        {mapName || 'Untitled'}{isDirty ? ' *' : ''}
      </span>
      <span className="status-map-info">
        {mapData.width}×{mapData.height} tiles
      </span>
      {mapData.scale && (
        <span className="status-scale">
          {scaleLabel(mapData.scale)}
        </span>
      )}
      <span className="status-zoom">
        {Math.round(zoom * 100)}%
      </span>
    </div>
  );
};
