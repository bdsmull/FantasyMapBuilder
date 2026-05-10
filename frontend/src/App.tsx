import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { WorldSetDialog } from './components/dialogs/WorldSetDialog';
import { WorldHierarchyPanel } from './components/WorldHierarchyPanel';
import type { OpenWorldSetDialogArgs } from './components/WorldHierarchyPanel';
import { useMapStore } from './store/mapStore';
import { useWorldSetStore } from './store/worldSetStore';

type Dialog = 'new' | 'open' | 'tilesets' | 'worldSets' | null;

export const App: React.FC = () => {
  const [activeDialog, setActiveDialog] = useState<Dialog>(null);
  const [leftPanelOpen, setLeftPanelOpen] = useState<boolean>(false);
  const { activeWorldSetName } = useWorldSetStore();
  const [hierarchyHeight, setHierarchyHeight] = useState<number>(240);
  const leftPanelRef = useRef<HTMLElement>(null);
  const [worldSetDialogArgs, setWorldSetDialogArgs] = useState<OpenWorldSetDialogArgs>({});
  const [worldSetDialogKey, setWorldSetDialogKey] = useState<number>(0);
  const { mapData, undo, redo, setTool, setShowGrid, showGrid, saveMapToServer } = useMapStore();

  const toggleLeftPanel = useCallback(() => {
    setLeftPanelOpen((prev) => !prev);
  }, []);

  const handleOpenWorldSetDialog = useCallback((args: OpenWorldSetDialogArgs) => {
    setWorldSetDialogArgs(args);
    setWorldSetDialogKey((k) => k + 1); // force remount so useState seeds re-init (Pitfall 5)
    setActiveDialog('worldSets');
  }, []);

  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const startHeight = hierarchyHeight;
    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientY - startY;
      const maxHeight = leftPanelRef.current
        ? leftPanelRef.current.clientHeight - 60   // 60px minimum for LayerPanel
        : 9999;
      const newHeight = Math.min(maxHeight, Math.max(80, startHeight + delta));
      setHierarchyHeight(newHeight);
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

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

  useEffect(() => {
    if (!leftPanelOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (leftPanelRef.current && !leftPanelRef.current.contains(e.target as Node)) {
        setLeftPanelOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [leftPanelOpen]);

  return (
    <div className="app-layout">
      <MenuBar
        onNew={() => setActiveDialog('new')}
        onOpen={() => setActiveDialog('open')}
        onManageTilesets={() => setActiveDialog('tilesets')}
        onWorldSets={() => {
          setWorldSetDialogArgs({});
          setWorldSetDialogKey((k) => k + 1);
          setActiveDialog('worldSets');
        }}
      />
      <Toolbar onToggleLeftPanel={toggleLeftPanel} showPanelToggle={true} />
      <div className="editor-body">
        {leftPanelOpen && (
          <div className="left-panel-backdrop" onClick={() => setLeftPanelOpen(false)} />
        )}
        <aside
          className={`left-panel${leftPanelOpen ? ' left-panel--open' : ''}`}
          ref={leftPanelRef}
        >
          {activeWorldSetName !== null && (
            <>
              <div style={{ flex: `0 0 ${hierarchyHeight}px`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <WorldHierarchyPanel onOpenWorldSetDialog={handleOpenWorldSetDialog} />
              </div>
              <div className="panel-resize-handle" onPointerDown={handleResizePointerDown} />
            </>
          )}
          <div style={{ flex: '1 1 60px', minHeight: 60, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <LayerPanel />
          </div>
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
      {activeDialog === 'worldSets' && (
        <WorldSetDialog
          key={worldSetDialogKey}
          onClose={() => { setActiveDialog(null); setWorldSetDialogArgs({}); }}
          initialView={worldSetDialogArgs.initialView}
          initialParentMapName={worldSetDialogArgs.initialParentMapName}
          initialMapName={worldSetDialogArgs.initialMapName}
        />
      )}
    </div>
  );
};
