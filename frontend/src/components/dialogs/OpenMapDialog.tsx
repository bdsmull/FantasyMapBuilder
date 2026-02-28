import React, { useState, useEffect } from 'react';
import { useMapStore } from '../../store/mapStore';
import { listMaps, getMap, uploadMap, downloadMapUrl } from '../../api/client';

interface Props {
  onClose: () => void;
}

export const OpenMapDialog: React.FC<Props> = ({ onClose }) => {
  const [serverMaps, setServerMaps] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { loadMap } = useMapStore();

  useEffect(() => {
    listMaps().then(setServerMaps).catch((e) => setError(String(e)));
  }, []);

  const handleOpen = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const data = await getMap(selected);
      loadMap(data, selected);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const name = await uploadMap(file);
      const data = await getMap(name);
      loadMap(data, name);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
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
