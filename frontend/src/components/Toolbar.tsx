import React from 'react';
import { useMapStore } from '../store/mapStore';
import type { ToolName } from '../store/mapStore';

interface ToolButtonProps {
  name: ToolName;
  label: string;
  shortcut: string;
}

const TOOLS: ToolButtonProps[] = [
  { name: 'paint', label: 'Paint', shortcut: '1' },
  { name: 'erase', label: 'Erase', shortcut: '2' },
  { name: 'fill',  label: 'Fill',  shortcut: '3' },
  { name: 'point', label: 'Point', shortcut: '4' },
];

export const Toolbar: React.FC = () => {
  const { selectedTool, setTool, zoom, setZoom, setPan, showGrid, setShowGrid, mapData, undo, redo, past, future } = useMapStore();

  const zoomIn = () => setZoom(zoom * 1.2);
  const zoomOut = () => setZoom(zoom / 1.2);
  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="toolbar">
      <div className="tool-group">
        {TOOLS.map((t) => (
          <button
            key={t.name}
            className={`tool-btn${selectedTool === t.name ? ' active' : ''}`}
            onClick={() => setTool(t.name)}
            title={`${t.label} (${t.shortcut})`}
            disabled={!mapData}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tool-separator" />

      <div className="tool-group">
        <button className="tool-btn" onClick={undo} disabled={past.length === 0} title="Undo (Ctrl+Z)">
          ↩ Undo
        </button>
        <button className="tool-btn" onClick={redo} disabled={future.length === 0} title="Redo (Ctrl+Y)">
          ↪ Redo
        </button>
      </div>

      <div className="tool-separator" />

      <div className="tool-group">
        <button className="tool-btn" onClick={zoomOut} disabled={!mapData} title="Zoom out">−</button>
        <span className="zoom-label">{Math.round(zoom * 100)}%</span>
        <button className="tool-btn" onClick={zoomIn} disabled={!mapData} title="Zoom in">+</button>
        <button className="tool-btn" onClick={resetView} disabled={!mapData} title="Reset view">⤢</button>
      </div>

      <div className="tool-separator" />

      <button
        className={`tool-btn${showGrid ? ' active' : ''}`}
        onClick={() => setShowGrid(!showGrid)}
        disabled={!mapData}
        title="Toggle grid (G)"
      >
        Grid
      </button>
    </div>
  );
};
