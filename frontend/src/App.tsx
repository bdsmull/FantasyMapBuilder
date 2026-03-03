import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import { MapCanvas } from './components/MapCanvas';
import { LayerPanel } from './components/LayerPanel';
import { TilePalette } from './components/TilePalette';
import { Toolbar } from './components/Toolbar';
import { MenuBar } from './components/MenuBar';
import { StatusBar } from './components/StatusBar';
import { NewMapDialog } from './components/dialogs/NewMapDialog';
import { OpenMapDialog } from './components/dialogs/OpenMapDialog';
import { TilesetDialog } from './components/dialogs/TilesetDialog';
import { useMapStore } from './store/mapStore';

type Dialog = 'new' | 'open' | 'tilesets' | null;

export const App: React.FC = () => {
  const [activeDialog, setActiveDialog] = useState<Dialog>(null);
  const { mapData, undo, redo, setTool, setShowGrid, showGrid, saveMapToServer } = useMapStore();

  // Global keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); undo(); return; }
      if (e.key === 'y' || e.key === 'Y') { e.preventDefault(); redo(); return; }
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); saveMapToServer().catch(console.error); return; }
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setActiveDialog('new'); return; }
      if (e.key === 'o' || e.key === 'O') { e.preventDefault(); setActiveDialog('open'); return; }
    }

    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === '1') { setTool('paint'); return; }
      if (e.key === '2') { setTool('erase'); return; }
      if (e.key === '3') { setTool('fill'); return; }
      if (e.key === '4') { setTool('point'); return; }
      if (e.key === 'g' || e.key === 'G') { setShowGrid(!showGrid); return; }
      if (e.key === 'Escape') { setActiveDialog(null); return; }
    }
  }, [undo, redo, setTool, setShowGrid, showGrid, saveMapToServer]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="app-layout">
      <MenuBar
        onNew={() => setActiveDialog('new')}
        onOpen={() => setActiveDialog('open')}
        onManageTilesets={() => setActiveDialog('tilesets')}
      />
      <Toolbar />
      <div className="editor-body">
        <aside className="left-panel">
          <LayerPanel />
        </aside>
        <main className="canvas-area">
          <MapCanvas />
          {!mapData && (
            <div className="canvas-placeholder">
              <div>
                <p>No map open</p>
                <button className="btn-primary" onClick={() => setActiveDialog('new')}>New Map</button>
                <button style={{ marginLeft: 8 }} onClick={() => setActiveDialog('open')}>Open Map</button>
              </div>
            </div>
          )}
        </main>
        <aside className="right-panel">
          <TilePalette />
        </aside>
      </div>
      <StatusBar />

      {activeDialog === 'new' && <NewMapDialog onClose={() => setActiveDialog(null)} />}
      {activeDialog === 'open' && <OpenMapDialog onClose={() => setActiveDialog(null)} />}
      {activeDialog === 'tilesets' && mapData && <TilesetDialog onClose={() => setActiveDialog(null)} />}
    </div>
  );
};
