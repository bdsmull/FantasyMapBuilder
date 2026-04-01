import React, { useState, useEffect } from 'react';
import { useMapStore } from '../../store/mapStore';
import { listMaps, getMap, uploadMap, downloadMapUrl } from '../../api/client';
import { MAP_SCALES, MAP_SCALE_BY_ID } from '../../data/mapScales';
import type { TmjMap } from '../../types/tmj';

interface Props {
  onClose: () => void;
}

export const OpenMapDialog: React.FC<Props> = ({ onClose }) => {
  const [serverMaps, setServerMaps] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dirtyWarn, setDirtyWarn] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);
  const [scalePrompt, setScalePrompt] = useState<{ data: TmjMap; name: string } | null>(null);
  const [chosenScale, setChosenScale] = useState('');
  const { loadMap, isDirty, mapName: currentName, saveMapToServer } = useMapStore();

  const scaleIsValid = (data: TmjMap) =>
    !!data.scale && !!MAP_SCALE_BY_ID[data.scale];

  const finishLoad = (data: TmjMap, name: string) => {
    loadMap(data, name);
    onClose();
  };

  const maybePromptScale = (data: TmjMap, name: string) => {
    if (scaleIsValid(data)) {
      finishLoad(data, name);
      return;
    }
    const isHex = data.orientation === 'hexagonal';
    const defaultScale = isHex ? 'town' : 'building';
    setChosenScale(defaultScale);
    setScalePrompt({ data, name });
  };

  const handleScaleConfirm = () => {
    if (!scalePrompt) return;
    finishLoad({ ...scalePrompt.data, scale: chosenScale }, scalePrompt.name);
  };

  useEffect(() => {
    listMaps().then(setServerMaps).catch((e) => setError(String(e)));
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
      const data = await getMap(selected);
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
    const doUpload = async () => {
      setLoading(true);
      try {
        const name = await uploadMap(file);
        const data = await getMap(name);
        maybePromptScale(data, name);
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

        <div className="dialog-section-label">Saved maps</div>
        {serverMaps.length === 0 ? (
          <p style={{ color: '#888', margin: '8px 0' }}>No saved maps found.</p>
        ) : (
          <ul className="map-list">
            {serverMaps.map((m) => (
              <li
                key={m}
                className={`map-list-item${selected === m ? ' selected' : ''}`}
                onClick={() => setSelected(m)}
              >
                {m}
                <a
                  href={downloadMapUrl(m)}
                  download={`${m}.tmj`}
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
        <input type="file" accept=".tmj,.json" onChange={handleUpload} disabled={loading} />

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
              <strong>"{scalePrompt.name}"</strong> has no map scale set
              {scalePrompt.data.scale ? ` ("${scalePrompt.data.scale}" is not a recognised scale)` : ''}.
              Choose the scale for this map:
            </p>
            <div className="dialog-row" style={{ marginBottom: 8 }}>
              <select
                value={chosenScale}
                onChange={(e) => setChosenScale(e.target.value)}
              >
                {MAP_SCALES
                  .filter((s) => s.defaultShape === (scalePrompt.data.orientation === 'hexagonal' ? 'hex' : 'tile'))
                  .map((s) => (
                    <option key={s.id} value={s.id}>{s.label} ({s.unit})</option>
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
