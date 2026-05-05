import React, { useState, useEffect } from 'react';
import { useWorldSetStore } from '../../store/worldSetStore';
import { listWorldSets, saveWorldSet as apiSaveWorldSet, deleteWorldSet } from '../../api/client';
import type { WorldSet } from '../../types/worldSet';
import { WORLD_SET_VERSION } from '../../types/worldSet';

interface Props { onClose: () => void; }

export const WorldSetDialog: React.FC<Props> = ({ onClose }) => {
  type View = 'list' | 'nodes' | 'configure';
  const [view, setView] = useState<View>('list');
  const [worldSets, setWorldSets] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const { activeWorldSetName, setActiveWorldSet } = useWorldSetStore();

  useEffect(() => {
    listWorldSets().then(setWorldSets).catch((e) => setError(String(e)));
  }, []);

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
            <p style={{ color: '#888' }}>Node management view — implemented in plan 04-02.</p>
            <div className="dialog-buttons">
              <button className="btn-secondary" onClick={() => setView('list')}>Back</button>
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
