import React, { useState, useEffect, useCallback } from 'react';
import { useWorldSetStore } from '../store/worldSetStore';
import { useMapStore } from '../store/mapStore';
import { navigateToMap } from '../utils/navigation';
import {
  getWarnings,
  toggleCollapse,
  isNodeCollapsed,
} from '../utils/hierarchyPanelLogic';
import type { CollapseState } from '../utils/hierarchyPanelLogic';
import { listWorldSets, listMaps, getMap } from '../api/client';
import type { WorldSetNode } from '../types/worldSet';
import type { TmjMap } from '../types/tmj';

export interface OpenWorldSetDialogArgs {
  initialView?: 'list' | 'nodes' | 'configure';
  initialParentMapName?: string | null;
  initialMapName?: string;
  initialAnchor?: { col: number; row: number };
  hideParent?: boolean;
}

interface Props {
  /** Called when context menu items need to open the management dialog (D-07). */
  onOpenWorldSetDialog: (args: OpenWorldSetDialogArgs) => void;
}

type ContextMenuState = { mapName: string; x: number; y: number } | null;
type DirtyGuardState = { targetMap: string } | null;
type TooltipState = { warnings: string[]; x: number; y: number } | null;

export const WorldHierarchyPanel: React.FC<Props> = ({ onOpenWorldSetDialog }) => {
  const {
    activeWorldSetName,
    activeWorldSet,
    setActiveWorldSet,
    removeNode,
    saveWorldSet,
    rootNodes,
    childrenOf,
  } = useWorldSetStore();
  const { isDirty, mapName: currentMapName } = useMapStore();

  const [collapseState, setCollapseState] = useState<CollapseState>({});
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [dirtyGuard, setDirtyGuard] = useState<DirtyGuardState>(null);
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const [worldSetNames, setWorldSetNames] = useState<string[]>([]);
  const [mapDataCache, setMapDataCache] = useState<Record<string, TmjMap>>({});
  const [knownMapNames, setKnownMapNames] = useState<Set<string>>(new Set());

  // Load list of all world sets for the switcher (D-02)
  useEffect(() => {
    listWorldSets().then(setWorldSetNames).catch(() => setWorldSetNames([]));
  }, [activeWorldSetName]);

  // Load list of all known maps for missing-map detection (PANEL-03)
  useEffect(() => {
    listMaps().then((names) => setKnownMapNames(new Set(names))).catch(() => setKnownMapNames(new Set()));
  }, [activeWorldSetName]);

  // Fetch TmjMap data for every node in active world set — drives validation badges (Pitfall 2)
  useEffect(() => {
    if (!activeWorldSet) {
      setMapDataCache({});
      return;
    }
    const namesToFetch = activeWorldSet.nodes
      .map((n) => n.mapName)
      .filter((name) => !(name in mapDataCache));
    if (namesToFetch.length === 0) return;
    Promise.all(
      namesToFetch.map((name) =>
        getMap(name).then((data) => [name, data] as const).catch(() => [name, null] as const),
      ),
    ).then((results) => {
      setMapDataCache((prev) => {
        const next = { ...prev };
        for (const [name, data] of results) {
          if (data) next[name] = data;
        }
        return next;
      });
    });
  }, [activeWorldSet]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dismiss context menu on outside click or Escape (Pitfall: register only when open)
  useEffect(() => {
    if (!contextMenu) return;
    const onMouseDown = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setContextMenu(null); };
    // Register on next tick to avoid catching the same click that opened the menu
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onMouseDown);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  // Dismiss dirty-guard on Escape
  useEffect(() => {
    if (!dirtyGuard) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDirtyGuard(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dirtyGuard]);

  const handleNodeClick = useCallback((mapName: string) => {
    if (isDirty) {
      setDirtyGuard({ targetMap: mapName });
    } else {
      navigateToMap(mapName, { saveFirst: false }).catch((e) => console.error('Navigation failed', e));
    }
  }, [isDirty]);

  const handleToggleCollapse = useCallback((mapName: string) => {
    if (!activeWorldSetName) return;
    setCollapseState((prev) => toggleCollapse(prev, activeWorldSetName, mapName));
  }, [activeWorldSetName]);

  const handleContextMenu = useCallback((e: React.MouseEvent, mapName: string) => {
    e.preventDefault();
    setContextMenu({ mapName, x: e.clientX, y: e.clientY });
  }, []);

  const handleAddChild = (mapName: string) => {
    setContextMenu(null);
    onOpenWorldSetDialog({ initialView: 'configure', initialParentMapName: mapName });
  };

  const handleChangeParent = (mapName: string) => {
    setContextMenu(null);
    onOpenWorldSetDialog({ initialView: 'configure', initialMapName: mapName });
  };

  const handleRemove = async (mapName: string) => {
    setContextMenu(null);
    removeNode(mapName);
    try {
      await saveWorldSet();
    } catch (e) {
      console.error('Failed to save world set after remove', e);
    }
  };

  const handleDirtyGuardSave = () => {
    if (!dirtyGuard) return;
    const target = dirtyGuard.targetMap;
    setDirtyGuard(null);
    navigateToMap(target, { saveFirst: true }).catch((e) => console.error('Navigation failed', e));
  };

  const handleDirtyGuardDiscard = () => {
    if (!dirtyGuard) return;
    const target = dirtyGuard.targetMap;
    setDirtyGuard(null);
    navigateToMap(target, { saveFirst: false }).catch((e) => console.error('Navigation failed', e));
  };

  const handleDirtyGuardCancel = () => setDirtyGuard(null);

  // PANEL-05: not mounted when no active world set
  if (activeWorldSetName === null) return null;

  const ctx = {
    mapDataCache,
    knownMapNames,
    allNodes: activeWorldSet?.nodes ?? [],
  };

  const renderNode = (node: WorldSetNode, depth: number): React.ReactNode => {
    const children = childrenOf(node.mapName);
    const collapsed = isNodeCollapsed(collapseState, activeWorldSetName, node.mapName);
    const warnings = getWarnings(node, ctx);
    const isActive = currentMapName === node.mapName;
    const hasChildren = children.length > 0;

    return (
      <React.Fragment key={node.mapName}>
        <li
          className={`hierarchy-node${isActive ? ' active' : ''}`}
          style={{ paddingLeft: `calc(12px + ${depth} * 16px)` }}
          onClick={() => handleNodeClick(node.mapName)}
          onContextMenu={(e) => handleContextMenu(e, node.mapName)}
        >
          <button
            type="button"
            className="hierarchy-toggle"
            style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
            onClick={(e) => { e.stopPropagation(); handleToggleCollapse(node.mapName); }}
            aria-label={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? '▶' : '▾'}
          </button>
          <span className="layer-name">{node.mapName}</span>
          {warnings.length > 0 && (
            <span
              className="hierarchy-badge"
              title={warnings.join('\n')}
              onMouseEnter={(e) => setTooltip({ warnings, x: e.clientX + 12, y: e.clientY + 12 })}
              onMouseMove={(e) => setTooltip({ warnings, x: e.clientX + 12, y: e.clientY + 12 })}
              onMouseLeave={() => setTooltip(null)}
            >
              ⚠
            </span>
          )}
        </li>
        {!collapsed && hasChildren && children.map((child) => renderNode(child, depth + 1))}
      </React.Fragment>
    );
  };

  const roots = rootNodes();

  return (
    <div className="hierarchy-panel">
      <div className="hierarchy-header">
        <span>WORLD SET</span>
        {worldSetNames.length > 1 ? (
          <select
            className="hierarchy-switcher"
            value={activeWorldSetName}
            onChange={(e) => setActiveWorldSet(e.target.value).catch(console.error)}
          >
            {worldSetNames.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        ) : (
          <span className="hierarchy-switcher">{activeWorldSetName}</span>
        )}
        <button
          type="button"
          className="hierarchy-deactivate"
          title="Deactivate world set"
          onClick={() => setActiveWorldSet(null).catch(console.error)}
          aria-label="Deactivate world set"
        >
          ×
        </button>
      </div>
      {roots.length === 0 ? (
        <div className="panel-empty">No maps in this world set.</div>
      ) : (
        <ul className="hierarchy-tree">
          {roots.map((root) => renderNode(root, 0))}
        </ul>
      )}

      {contextMenu && (
        <ul
          className="hierarchy-ctx-menu"
          role="menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <li role="menuitem" onClick={() => handleAddChild(contextMenu.mapName)}>Add child here</li>
          <li role="menuitem" onClick={() => handleChangeParent(contextMenu.mapName)}>Change parent</li>
          <li role="menuitem" className="danger" onClick={() => handleRemove(contextMenu.mapName)}>
            Remove from world set
          </li>
        </ul>
      )}

      {dirtyGuard && (
        <div className="dialog-backdrop" onClick={handleDirtyGuardCancel}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">Unsaved Changes</div>
            <p>You have unsaved changes in the current map. What would you like to do?</p>
            <div className="dialog-buttons">
              <button className="btn-secondary" onClick={handleDirtyGuardCancel}>Keep Editing</button>
              <button className="btn-danger" onClick={handleDirtyGuardDiscard}>Discard Changes</button>
              <button className="btn-primary" onClick={handleDirtyGuardSave}>Save Map</button>
            </div>
          </div>
        </div>
      )}

      {tooltip && (
        <div className="hierarchy-tooltip" style={{ top: tooltip.y, left: tooltip.x }}>
          {tooltip.warnings.join('\n')}
        </div>
      )}
    </div>
  );
};
