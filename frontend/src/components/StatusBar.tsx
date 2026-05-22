import React, { useState } from 'react';
import { useMapStore } from '../store/mapStore';
import { useWorldSetStore } from '../store/worldSetStore';
import { scaleLabel } from '../data/mapScales';
import { navigateToMap } from '../utils/navigation';

export const StatusBar: React.FC = () => {
  const { mapData, mapName, isDirty, zoom } = useMapStore();
  const worldSetStore = useWorldSetStore();
  const parentNode = mapName ? worldSetStore.parentOf(mapName) : null;
  const [dirtyGuardTarget, setDirtyGuardTarget] = useState<string | null>(null);

  const handleBreadcrumbClick = () => {
    if (!parentNode) return;
    if (isDirty) {
      setDirtyGuardTarget(parentNode.mapName);
    } else {
      navigateToMap(parentNode.mapName, { saveFirst: false }).catch(console.error);
    }
  };

  if (!mapData) {
    return <div className="status-bar"><span>No map open</span></div>;
  }

  return (
    <>
      <div className="status-bar">
        {parentNode !== null && (
          <span className="status-breadcrumb">
            <span>&#8593;</span>
            <button
              className="status-breadcrumb-link"
              onClick={handleBreadcrumbClick}
              title={parentNode.mapName}
            >
              {parentNode.mapName}
            </button>
            <span style={{ color: '#666' }}>{'>'}</span>
          </span>
        )}
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
      {dirtyGuardTarget !== null && (
        <div className="dialog-backdrop" style={{ zIndex: 3000 }}>
          <div className="dialog" style={{ minWidth: 300 }}>
            <div className="dialog-title">Unsaved Changes</div>
            <p style={{ marginBottom: 16, color: '#aaa', fontSize: 13 }}>
              You have unsaved changes. Save before navigating?
            </p>
            <div className="dialog-buttons">
              <button className="btn-secondary" onClick={() => setDirtyGuardTarget(null)}>
                Cancel
              </button>
              <button className="btn-secondary" onClick={() => {
                const target = dirtyGuardTarget;
                setDirtyGuardTarget(null);
                navigateToMap(target, { saveFirst: false }).catch(console.error);
              }}>
                Discard
              </button>
              <button className="btn-primary" onClick={() => {
                const target = dirtyGuardTarget;
                setDirtyGuardTarget(null);
                navigateToMap(target, { saveFirst: true }).catch(console.error);
              }}>
                Save &amp; Navigate
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
