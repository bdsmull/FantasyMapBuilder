import React, { useState, useEffect } from 'react';
import { useMapStore } from '../../store/mapStore';
import { listAllMaps, getMap, uploadMap, downloadMapUrl } from '../../api/client';
import type { MapRef } from '../../api/client';
import { useWorldSetStore } from '../../store/worldSetStore';
import {
  MAP_SCALES, MAP_SCALE_BY_ID, scaleLabel, resolveUnits, defaultScaleForShape,
} from '../../data/mapScales';
import type { TmjMap } from '../../types/tmj';

interface Props {
  onClose: () => void;
}

export const OpenMapDialog: React.FC<Props> = ({ onClose }) => {
  const [serverMaps, setServerMaps] = useState<MapRef[]>([]);
  const [selected, setSelected] = useState<MapRef | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dirtyWarn, setDirtyWarn] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);
  const [scalePrompt, setScalePrompt] = useState<{ data: TmjMap; ref: MapRef } | null>(null);
  const [chosenScale, setChosenScale] = useState('');
  const { loadMap, isDirty, mapName: currentName, saveMapToServer } = useMapStore();
  const worldSetUnits = useWorldSetStore((s) => s.activeWorldSet?.units);
  const activeWorldSetName = useWorldSetStore((s) => s.activeWorldSetName);
  const setActiveWorldSet = useWorldSetStore((s) => s.setActiveWorldSet);

  // Without an active world set there is nothing to filter by, so list everything.
  const listingAll = showAll || !activeWorldSetName;
  const visibleMaps = listingAll
    ? serverMaps
    : serverMaps.filter((m) => m.worldSet === activeWorldSetName);
  const isSelected = (m: MapRef) => selected?.worldSet === m.worldSet && selected.name === m.name;

  const scaleIsValid = (data: TmjMap) =>
    !!data.scale && !!MAP_SCALE_BY_ID[data.scale];

  const finishLoad = async (data: TmjMap, ref: MapRef) => {
    try {
      // Opening a map from another world set makes that world set active.
      // The current map is being replaced, so it is not closed separately.
      if (ref.worldSet !== activeWorldSetName) await setActiveWorldSet(ref.worldSet);
      loadMap(data, ref.name, ref.worldSet);
      onClose();
    } catch (e) {
      setError(String(e));
    }
  };

  const maybePromptScale = (data: TmjMap, ref: MapRef) => {
    if (scaleIsValid(data)) {
      finishLoad(data, ref);
      return;
    }
    setChosenScale(defaultScaleForShape(data.orientation === 'hexagonal' ? 'hex' : 'tile'));
    setScalePrompt({ data, ref });
  };

  const handleScaleConfirm = () => {
    if (!scalePrompt) return;
    finishLoad({ ...scalePrompt.data, scale: chosenScale }, scalePrompt.ref);
  };

  useEffect(() => {
    listAllMaps().then(setServerMaps).catch((e) => setError(String(e)));
  }, []);

  const guardDirty = (action: () => Promise<void>) => {
    if (isDirty && currentName) {
      setPendingAction(() => action);
      setDirtyWarn(true);
    } else {
      action();
    }
  };

  const handleSaveAndProceed = async () => {
    try { await saveMapToServer(); } catch (e) { setError(`Save failed: ${e}`); return; }
    setDirtyWarn(false);
    pendingAction?.();
    setPendingAction(null);
  };

  const handleDiscardAndProceed = () => {
    setDirtyWarn(false);
    pendingAction?.();
    setPendingAction(null);
  };

  const doOpen = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const data = await getMap(selected.worldSet, selected.name);
      maybePromptScale(data, selected);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => guardDirty(doOpen);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!activeWorldSetName) return;
    const worldSet = activeWorldSetName;
    const doUpload = async () => {
      setLoading(true);
      try {
        const name = await uploadMap(worldSet, file);
        const data = await getMap(worldSet, name);
        maybePromptScale(data, { worldSet, name });
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    };
    guardDirty(doUpload);
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">Open Map</div>

        <div className="dialog-section-label">
          {listingAll ? 'Maps in all world sets' : `Maps in ${activeWorldSetName}`}
        </div>
        {activeWorldSetName && (
          <label style={{ display: 'block', margin: '4px 0 8px' }}>
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              style={{ marginRight: 6 }}
            />
            All world sets
          </label>
        )}
        {visibleMaps.length === 0 ? (
          <p style={{ color: '#888', margin: '8px 0' }}>No saved maps found.</p>
        ) : (
          <ul className="map-list">
            {visibleMaps.map((m) => (
              <li
                key={`${m.worldSet}/${m.name}`}
                className={`map-list-item${isSelected(m) ? ' selected' : ''}`}
                onClick={() => setSelected(m)}
              >
                <span>
                  {m.name}
                  {listingAll && (
                    <span style={{ color: '#888', marginLeft: 8, fontSize: 12 }}>— {m.worldSet}</span>
                  )}
                </span>
                <a
                  href={downloadMapUrl(m.worldSet, m.name)}
                  download={`${m.name}.tmj`}
                  onClick={(e) => e.stopPropagation()}
                  className="download-link"
                  title="Download .tmj"
                >
                  ↓
                </a>
              </li>
            ))}
          </ul>
        )}

        <div className="dialog-section-label" style={{ marginTop: 16 }}>Upload from device</div>
        {activeWorldSetName ? (
          <>
            <p style={{ color: '#888', margin: '4px 0', fontSize: 12 }}>Uploads into {activeWorldSetName}.</p>
            <input type="file" accept=".tmj,.json" onChange={handleUpload} disabled={loading} />
          </>
        ) : (
          <p style={{ color: '#888', margin: '4px 0', fontSize: 12 }}>Choose a world set (Edit → World Sets…) to upload into.</p>
        )}

        {dirtyWarn && (
          <div className="dialog-warn">
            <p>"{currentName}" has unsaved changes. Save before opening?</p>
            <div className="dialog-buttons">
              <button onClick={() => { setDirtyWarn(false); setPendingAction(null); }}>Cancel</button>
              <button onClick={handleDiscardAndProceed}>Discard & Open</button>
              <button className="btn-primary" onClick={handleSaveAndProceed}>Save & Open</button>
            </div>
          </div>
        )}

        {scalePrompt && (
          <div className="dialog-warn">
            <p>
              <strong>"{scalePrompt.ref.name}"</strong> has no map scale set
              {scalePrompt.data.scale ? ` ("${scalePrompt.data.scale}" is not a recognised scale)` : ''}.
              Choose the scale for this map:
            </p>
            <div className="dialog-row" style={{ marginBottom: 8 }}>
              <select
                value={chosenScale}
                onChange={(e) => setChosenScale(e.target.value)}
              >
                {MAP_SCALES.map((s) => (
                  <option key={s.id} value={s.id}>{scaleLabel(s.id, resolveUnits(scalePrompt.data, worldSetUnits))}</option>
                ))}
              </select>
            </div>
            <div className="dialog-buttons">
              <button onClick={() => setScalePrompt(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleScaleConfirm}>Open</button>
            </div>
          </div>
        )}

        {error && <div className="dialog-error">{error}</div>}

        <div className="dialog-buttons">
          <button onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={handleOpen}
            disabled={!selected || loading}
          >
            {loading ? 'Opening…' : 'Open'}
          </button>
        </div>
      </div>
    </div>
  );
};
