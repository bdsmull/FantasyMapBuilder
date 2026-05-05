import React, { useState, useEffect } from 'react';
import { useWorldSetStore } from '../../store/worldSetStore';
import {
  listWorldSets,
  saveWorldSet as apiSaveWorldSet,
  deleteWorldSet,
  getMap,
  listMaps,
  saveMap,
} from '../../api/client';
import { MAP_SCALE_BY_ID, MAP_SCALES, scaleLabel } from '../../data/mapScales';
import { computeFootprint, detectOverlaps } from '../../utils/worldSetUtils';
import type { FootprintedNode } from '../../utils/worldSetUtils';
import type { WorldSet, WorldSetNode } from '../../types/worldSet';
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

  // Configure-view state
  const [allMaps, setAllMaps] = useState<string[]>([]);
  const [selectedMap, setSelectedMap] = useState('');
  const [selectedMapData, setSelectedMapData] = useState<TmjMap | null>(null);
  const [parentMapName, setParentMapName] = useState<string | null>(null);
  const [anchorCol, setAnchorCol] = useState(0);
  const [anchorRow, setAnchorRow] = useState(0);
  const [z, setZ] = useState(0);
  const [zLabel, setZLabel] = useState('');
  const [chosenScale, setChosenScale] = useState('building');
  const [warnings, setWarnings] = useState<string[]>([]);

  const {
    activeWorldSetName,
    activeWorldSet,
    setActiveWorldSet,
    addNode,
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

  useEffect(() => {
    if (view !== 'configure') return;
    if (allMaps.length > 0) return;
    listMaps().then(setAllMaps).catch((e) => setError(String(e)));
  }, [view]);

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

  const resetConfigureForm = () => {
    setSelectedMap('');
    setSelectedMapData(null);
    setParentMapName(null);
    setAnchorCol(0);
    setAnchorRow(0);
    setZ(0);
    setZLabel('');
    setChosenScale('building');
    setWarnings([]);
    setError('');
  };

  const handleMapSelect = async (mapName: string) => {
    setSelectedMap(mapName);
    setError('');
    if (!mapName) {
      setSelectedMapData(null);
      return;
    }
    try {
      const data = await getMap(mapName);
      setSelectedMapData(data);
      const isHex = data.orientation === 'hexagonal';
      setChosenScale(isHex ? 'town' : 'building');
    } catch (e) {
      setError(String(e));
      setSelectedMapData(null);
    }
  };

  // Derived state — declared right above the return statement
  const needsScale =
    !!selectedMapData && !selectedMapData.feetPerUnit && !selectedMapData.scale;

  const handleAddNode = async () => {
    if (!selectedMap || !selectedMapData) {
      setError('Select a map first');
      return;
    }
    setLoading(true);
    setError('');
    setWarnings([]);
    try {
      // Step 1 — write feetPerUnit back to the map file BEFORE adding node (D-03 sequence).
      let finalMapData = selectedMapData;
      if (needsScale) {
        const fpu = MAP_SCALE_BY_ID[chosenScale]?.feetPerUnit;
        if (!fpu) {
          setError(`Unknown scale id '${chosenScale}'`);
          return;
        }
        finalMapData = { ...selectedMapData, feetPerUnit: fpu, scale: chosenScale };
        await saveMap(selectedMap, finalMapData);
      }

      // Step 2 — client-side warnings (scale inversion + footprint overlap).
      const localWarnings: string[] = [];
      const childFPU = finalMapData.feetPerUnit
        ?? (finalMapData.scale ? MAP_SCALE_BY_ID[finalMapData.scale]?.feetPerUnit : undefined);

      if (parentMapName !== null && childFPU) {
        // Get parent's TmjMap from cache or fetch.
        let parentData = mapDataCache[parentMapName];
        if (!parentData) {
          parentData = await getMap(parentMapName);
          setMapDataCache((prev) => ({ ...prev, [parentMapName]: parentData }));
        }
        const parentFPU = parentData.feetPerUnit
          ?? (parentData.scale ? MAP_SCALE_BY_ID[parentData.scale]?.feetPerUnit : undefined);

        if (parentFPU && childFPU >= parentFPU) {
          localWarnings.push(
            `Scale inversion: this map is the same size or larger than its parent.`,
          );
        }

        // Footprint overlap against existing siblings at same parent + same z.
        if (parentFPU && activeWorldSet) {
          const candidate: FootprintedNode = {
            mapName: selectedMap,
            z,
            footprint: computeFootprint(
              finalMapData.width, finalMapData.height,
              childFPU, parentFPU,
              { col: anchorCol, row: anchorRow },
            ),
          };
          const siblings = activeWorldSet.nodes.filter(
            (n) => n.parentMapName === parentMapName && n.z === z && n.parentAnchor !== null,
          );
          const siblingFootprints: FootprintedNode[] = [];
          for (const sib of siblings) {
            const sibData = mapDataCache[sib.mapName];
            if (!sibData) continue;
            const sibFPU = sibData.feetPerUnit
              ?? (sibData.scale ? MAP_SCALE_BY_ID[sibData.scale]?.feetPerUnit : undefined);
            if (!sibFPU) continue;
            siblingFootprints.push({
              mapName: sib.mapName,
              z: sib.z,
              footprint: computeFootprint(
                sibData.width, sibData.height,
                sibFPU, parentFPU,
                sib.parentAnchor!,
              ),
            });
          }
          const overlaps = detectOverlaps([candidate, ...siblingFootprints]);
          for (const [a, b] of overlaps) {
            const other = a === selectedMap ? b : a;
            localWarnings.push(`Footprint overlaps with '${other}' at the same Z level.`);
          }
        }
      }

      // Step 3 — call addNode (store enforces hard blocks: dup, cycle).
      const node: WorldSetNode = {
        mapName: selectedMap,
        parentMapName,
        parentAnchor: parentMapName ? { col: anchorCol, row: anchorRow } : null,
        z,
        zLabel: zLabel.trim() || null,
      };
      const result = addNode(node);
      if (!result.ok) {
        setError(result.error);
        setWarnings(localWarnings); // still surface soft warnings even on hard fail
        return;
      }
      const allWarnings = [...localWarnings, ...result.warnings];
      if (allWarnings.length > 0) setWarnings(allWarnings);

      // Step 4 — persist.
      await saveWorldSet();

      // Step 5 — go back to nodes view.
      setView('nodes');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
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

            <div className="dialog-row">
              <label>Map</label>
              <select
                value={selectedMap}
                onChange={(e) => handleMapSelect(e.target.value)}
                disabled={loading}
              >
                <option value="">Select a map…</option>
                {allMaps.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            {needsScale && (
              <div className="dialog-row">
                <label>Scale</label>
                <select
                  value={chosenScale}
                  onChange={(e) => setChosenScale(e.target.value)}
                  disabled={loading}
                >
                  {MAP_SCALES
                    .filter((s) =>
                      !selectedMapData
                        ? true
                        : s.defaultShape === (selectedMapData.orientation === 'hexagonal' ? 'hex' : 'tile'),
                    )
                    .map((s) => (
                      <option key={s.id} value={s.id}>{s.label} ({s.unit})</option>
                    ))}
                </select>
              </div>
            )}

            <div className="dialog-row">
              <label>Parent</label>
              <select
                value={parentMapName ?? ''}
                onChange={(e) => setParentMapName(e.target.value || null)}
                disabled={loading}
              >
                <option value="">None (root)</option>
                {(activeWorldSet?.nodes ?? [])
                  .filter((n) => n.mapName !== selectedMap)
                  .map((n) => (
                    <option key={n.mapName} value={n.mapName}>{n.mapName}</option>
                  ))}
              </select>
            </div>

            {parentMapName !== null && (
              <>
                <div className="dialog-row">
                  <label>Anchor col</label>
                  <input
                    type="number"
                    value={anchorCol}
                    onChange={(e) => setAnchorCol(Number(e.target.value))}
                    disabled={loading}
                  />
                </div>
                <div className="dialog-row">
                  <label>Anchor row</label>
                  <input
                    type="number"
                    value={anchorRow}
                    onChange={(e) => setAnchorRow(Number(e.target.value))}
                    disabled={loading}
                  />
                </div>
              </>
            )}

            <div className="dialog-row">
              <label>Z level</label>
              <input
                type="number"
                value={z}
                onChange={(e) => setZ(Number(e.target.value))}
                disabled={loading}
              />
            </div>

            <div className="dialog-row">
              <label>Z label</label>
              <input
                type="text"
                value={zLabel}
                onChange={(e) => setZLabel(e.target.value)}
                placeholder="(optional)"
                disabled={loading}
              />
            </div>

            {warnings.length > 0 && (
              <div className="dialog-warn">
                {warnings.map((w, i) => <p key={i}>{w}</p>)}
              </div>
            )}
            {error && <div className="dialog-error">{error}</div>}

            <div className="dialog-buttons">
              <button
                className="btn-secondary"
                onClick={() => { setError(''); setWarnings([]); setView('nodes'); }}
                disabled={loading}
              >
                Back
              </button>
              <button
                className="btn-primary"
                onClick={handleAddNode}
                disabled={!selectedMap || loading}
              >
                {loading ? 'Adding…' : 'Add'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
