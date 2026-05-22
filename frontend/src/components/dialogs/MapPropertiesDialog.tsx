import React, { useState } from 'react';
import { useMapStore } from '../../store/mapStore';
import { MAP_SCALES } from '../../data/mapScales';

interface Props {
  onClose: () => void;
}

export const MapPropertiesDialog: React.FC<Props> = ({ onClose }) => {
  const { mapData, setMapScale, saveMapToServer } = useMapStore();

  const currentScaleId = mapData?.scale ?? 'building';
  const [selectedScaleId, setSelectedScaleId] = useState<string>(currentScaleId);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setIsSaving(true);
    setMapScale(selectedScaleId);
    try {
      await saveMapToServer();
      onClose();
    } catch (e) {
      setError(`Save failed: ${e}`);
      setIsSaving(false);
    }
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">Map Properties</div>

        <div className="dialog-row">
          <label>Scale</label>
          <select
            value={selectedScaleId}
            onChange={(e) => setSelectedScaleId(e.target.value)}
          >
            {MAP_SCALES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} ({s.unit})
              </option>
            ))}
          </select>
        </div>

        {error && <div className="dialog-error">{error}</div>}

        <div className="dialog-buttons">
          <button onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};
