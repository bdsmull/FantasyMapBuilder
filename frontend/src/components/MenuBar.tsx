import React, { useState, useRef, useEffect } from 'react';
import { useMapStore } from '../store/mapStore';

interface MenuBarProps {
  onNew: () => void;
  onOpen: () => void;
  onManageTilesets: () => void;
}

type MenuName = 'file' | 'edit' | 'view' | null;

export const MenuBar: React.FC<MenuBarProps> = ({ onNew, onOpen, onManageTilesets }) => {
  const [openMenu, setOpenMenu] = useState<MenuName>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const { mapData, mapName, isDirty, saveMapToServer, closeMap, undo, redo, past, future, showGrid, setShowGrid, zoom, setZoom, setPan } = useMapStore();

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (name: MenuName) => setOpenMenu((prev) => (prev === name ? null : name));
  const close = () => setOpenMenu(null);

  const handleSave = async () => {
    close();
    if (!mapData) return;
    if (!mapName) return; // should not happen — new map creates a name
    try {
      await saveMapToServer();
    } catch (e) {
      alert(`Save failed: ${e}`);
    }
  };

  const handleDownload = () => {
    close();
    if (!mapData) return;
    const blob = new Blob([JSON.stringify(mapData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${mapName || 'map'}.tmj`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPng = () => {
    close();
    // Create an offscreen canvas and render the full map to it
    const canvas = document.createElement('canvas');
    if (!mapData) return;
    canvas.width = mapData.width * mapData.tilewidth;
    canvas.height = mapData.height * mapData.tileheight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Render at zoom=1 from origin
    import('../canvas/tileRenderer').then(({ renderTileMap }) => {
      renderTileMap(ctx, mapData, {
        view: { zoom: 1, pan: { x: 0, y: 0 } },
        showGrid: false,
        onImageLoad: () => {
          canvas.toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${mapName || 'map'}.png`;
            a.click();
            URL.revokeObjectURL(url);
          });
        },
      });
      // Trigger immediately (in case all images were cached)
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${mapName || 'map'}.png`;
        a.click();
        URL.revokeObjectURL(url);
      });
    });
  };

  const hasMap = !!mapData;

  return (
    <nav className="menu-bar" ref={barRef}>
      <span className="app-title">Map Editor</span>

      {/* File */}
      <div className="menu-item">
        <button className="menu-btn" onClick={() => toggle('file')}>File</button>
        {openMenu === 'file' && (
          <ul className="menu-dropdown">
            <li onClick={() => { close(); onNew(); }}>New Map…</li>
            <li onClick={() => { close(); onOpen(); }}>Open…</li>
            <li className="menu-sep" />
            <li onClick={handleSave} className={!hasMap ? 'disabled' : ''}>
              Save {isDirty ? '*' : ''} <kbd>Ctrl+S</kbd>
            </li>
            <li onClick={handleDownload} className={!hasMap ? 'disabled' : ''}>Download .tmj</li>
            <li className="menu-sep" />
            <li onClick={handleExportPng} className={!hasMap ? 'disabled' : ''}>Export as PNG</li>
            <li className="menu-sep" />
            <li onClick={() => { close(); closeMap(); }} className={!hasMap ? 'disabled' : ''}>Close Map</li>
          </ul>
        )}
      </div>

      {/* Edit */}
      <div className="menu-item">
        <button className="menu-btn" onClick={() => toggle('edit')}>Edit</button>
        {openMenu === 'edit' && (
          <ul className="menu-dropdown">
            <li onClick={() => { close(); undo(); }} className={past.length === 0 ? 'disabled' : ''}>
              Undo <kbd>Ctrl+Z</kbd>
            </li>
            <li onClick={() => { close(); redo(); }} className={future.length === 0 ? 'disabled' : ''}>
              Redo <kbd>Ctrl+Y</kbd>
            </li>
            <li className="menu-sep" />
            <li onClick={() => { close(); onManageTilesets(); }} className={!hasMap ? 'disabled' : ''}>
              Manage Tilesets…
            </li>
          </ul>
        )}
      </div>

      {/* View */}
      <div className="menu-item">
        <button className="menu-btn" onClick={() => toggle('view')}>View</button>
        {openMenu === 'view' && (
          <ul className="menu-dropdown">
            <li onClick={() => { close(); setZoom(zoom * 1.2); }} className={!hasMap ? 'disabled' : ''}>
              Zoom In <kbd>Ctrl++</kbd>
            </li>
            <li onClick={() => { close(); setZoom(zoom / 1.2); }} className={!hasMap ? 'disabled' : ''}>
              Zoom Out <kbd>Ctrl+−</kbd>
            </li>
            <li onClick={() => { close(); setZoom(1); setPan({ x: 0, y: 0 }); }} className={!hasMap ? 'disabled' : ''}>
              Reset Zoom <kbd>Ctrl+0</kbd>
            </li>
            <li className="menu-sep" />
            <li onClick={() => { close(); setShowGrid(!showGrid); }} className={!hasMap ? 'disabled' : ''}>
              {showGrid ? '✓ ' : '  '}Show Grid <kbd>G</kbd>
            </li>
          </ul>
        )}
      </div>
    </nav>
  );
};
