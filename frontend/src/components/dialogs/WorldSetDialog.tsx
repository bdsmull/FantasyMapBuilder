import React, { useState, useEffect } from 'react';
import { useWorldSetStore } from '../../store/worldSetStore';
import { listWorldSets, saveWorldSet as apiSaveWorldSet, deleteWorldSet, getMap } from '../../api/client';
import { MAP_SCALE_BY_ID, scaleLabel } from '../../data/mapScales';
import type { WorldSet } from '../../types/worldSet';
import { WORLD_SET_VERSION } from '../../types/worldSet';
import type { TmjMap } from '../../types/tmj';

interface Props { onClose: () => void; }

export const WorldSetDialog: React.FC<Props> = ({ onClose }) => {
  type View = 'list' | 'nodes' | 'configure';
  const [view, setView] = useState<View>('list');
  const [worldSets, setWorldSets] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Cached TmjMap data for any map referenced by the active world set.
  // Keyed by mapName. Loaded lazily when entering nodes view.
  const [mapDataCache, setMapDataCache] = useState<Record<string, TmjMap>>({});

  const {
    activeWorldSetName,
    activeWorldSet,
    setActiveWorldSet,
    removeNode,
    saveWorldSet,
  } = useWorldSetStore();

  useEffect(() => {
    listWorldSets().then(setWorldSets).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (view !== 'nodes' || !activeWorldSet) return;
    const namesToFetch = activeWorldSet.nodes
      .map((n) => n.mapName)
      .filter((name) => !(name in mapDataCache));
    if (namesToFetch.length === 0) return;
    Promise.all(
      namesToFetch.map((name) =>
        getMap(name)
          .then((data) => [name, data] as const)
          .catch(() => [name, null] as const),
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
  }, [view, activeWorldSet]);

  const handleSelect = async (name: string) => {
    try {
      await setActiveWorldSet(name);
      setView('nodes');
    } catch (e) {
      setError(String(e));
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) { setError('Name is required'); return; }
    if (worldSets.includes(name)) { setError('A world set with that name already exists'); return; }
    setLoading(true);
    setError('');
    try {
      const ws: WorldSet = { name, version: WORLD_SET_VERSION, nodes: [] };
      await apiSaveWorldSet(name, ws);
      const updated = await listWorldSets();
      setWorldSets(updated);
      await setActiveWorldSet(name);
      setNewName('');
      setView('nodes');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (name: string) => {
    setConfirmDelete(name);
  };

  const handleConfirmDelete = async () => {
    if (confirmDelete === null) return;
    setLoading(true);
    setError('');
    try {
      await deleteWorldSet(confirmDelete);
      const updated = await listWorldSets();
      setWorldSets(updated);
      if (confirmDelete === activeWorldSetName) {
        await setActiveWorldSet(null);
      }
      setConfirmDelete(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleCancelDelete = () => {
    setConfirmDelete(null);
  };

  const nodeScaleLabel = (mapName: string): string => {
    const data = mapDataCache[mapName];
    if (!data) return '(loading…)';
    const fpu = data.feetPerUnit ?? (data.scale ? MAP_SCALE_BY_ID[data.scale]?.feetPerUnit : undefined);
    if (!fpu) return 'no scale';
    return scaleLabel(data.scale ?? '') !== (data.scale ?? '')
      ? scaleLabel(data.scale ?? '')
      : `${fpu} ft/unit`;
  };

  const handleRemoveNode = async (mapName: string) => {
    setLoading(true);
    setError('');
    try {
      removeNode(mapName);
      await saveWorldSet();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  // Will be expanded in Task 2 to reset configure-view fields.
  // Defined now so the nodes-view "Add map node" button can call it.
  const resetConfigureForm = () => {
    setError('');
    // Task 2 adds: setSelectedMap(''), setSelectedMapData(null), setParentMapName(null), etc.
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        {view === 'list' && (
          <>
            <div className="dialog-title">World Sets</div>
            <div className="dialog-section-label">World Sets</div>
            {worldSets.length === 0 ? (
              <p style={{ color: '#888', margin: '8px 0' }}>No world sets found.</p>
            ) : (
              <ul className="map-list">
                {worldSets.map((name) => (
                  <li
                    key={name}
                    className="map-list-item"
                    onClick={() => handleSelect(name)}
                  >
                    <span>{name}</span>
                    <button
                      className="btn-danger"
                      onClick={(e) => { e.stopPropagation(); handleDeleteClick(name); }}
                      disabled={loading}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="dialog-row" style={{ marginTop: 16 }}>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="new-world-set"
                disabled={loading}
              />
              <button
                className="btn-primary"
                onClick={handleCreate}
                disabled={!newName.trim() || loading}
              >
                {loading ? 'Creating…' : 'Create'}
              </button>
            </div>
            {confirmDelete && (
              <div className="dialog-warn">
                <p>Delete '{confirmDelete}'? This cannot be undone.</p>
                <div className="dialog-buttons">
                  <button onClick={handleCancelDelete}>Cancel</button>
                  <button className="btn-danger" onClick={handleConfirmDelete} disabled={loading}>
                    {loading ? 'Deleting…' : 'Yes, delete'}
                  </button>
                </div>
              </div>
            )}
            {error && <div className="dialog-error">{error}</div>}
            <div className="dialog-buttons">
              <button onClick={onClose}>Close</button>
            </div>
          </>
        )}
        {view === 'nodes' && (
          <>
            <div className="dialog-title">World Set: {activeWorldSetName}</div>
            <div className="dialog-section-label">Maps in this world set</div>
            {!activeWorldSet || activeWorldSet.nodes.length === 0 ? (
              <p style={{ color: '#888', margin: '8px 0' }}>No maps added yet.</p>
            ) : (
              <ul className="map-list">
                {activeWorldSet.nodes.map((node) => (
                  <li key={node.mapName} className="map-list-item">
                    <span>
                      {node.mapName}
                      <span style={{ color: '#888', marginLeft: 8, fontSize: 12 }}>
                        — {nodeScaleLabel(node.mapName)}
                      </span>
                    </span>
                    <button
                      className="btn-danger"
                      onClick={() => handleRemoveNode(node.mapName)}
                      disabled={loading}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {error && <div className="dialog-error">{error}</div>}
            <div className="dialog-buttons">
              <button className="btn-secondary" onClick={() => { setError(''); setView('list'); }}>Back</button>
              <button
                className="btn-primary"
                onClick={() => {
                  // Reset configure-view state on entry (per RESEARCH.md Pitfall 6)
                  resetConfigureForm();
                  setView('configure');
                }}
              >
                Add map node
              </button>
            </div>
          </>
        )}
        {view === 'configure' && (
          <>
            <div className="dialog-title">Add Map Node</div>
            <p style={{ color: '#888' }}>Configure view — implemented in plan 04-02.</p>
            <div className="dialog-buttons">
              <button className="btn-secondary" onClick={() => setView('nodes')}>Back</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
