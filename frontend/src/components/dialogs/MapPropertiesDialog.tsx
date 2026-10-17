import React, { useState } from 'react';
import { useMapStore } from '../../store/mapStore';
import { useWorldSetStore } from '../../store/worldSetStore';
import { MAP_SCALES, DEFAULT_UNIT_SYSTEM, defaultScaleForShape } from '../../data/mapScales';
import type { UnitSystem } from '../../data/mapScales';
import { UnitsSelect } from './UnitsSelect';

interface Props {
  onClose: () => void;
}

export const MapPropertiesDialog: React.FC<Props> = ({ onClose }) => {
  const { mapData, setMapScale, saveMapToServer } = useMapStore();
  const worldSetUnits = useWorldSetStore((s) => s.activeWorldSet?.units) ?? DEFAULT_UNIT_SYSTEM;

  const currentScaleId = mapData?.scale
    ?? defaultScaleForShape(mapData?.orientation === 'hexagonal' ? 'hex' : 'tile');
  const [selectedScaleId, setSelectedScaleId] = useState<string>(currentScaleId);
  // undefined = inherit from the world set
  const [units, setUnits] = useState<UnitSystem | undefined>(mapData?.units);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const effectiveUnits = units ?? worldSetUnits;

  const handleSave = async () => {
    setIsSaving(true);
    setMapScale(selectedScaleId, units);
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
          <label>Units</label>
          <UnitsSelect value={units} worldSetUnits={worldSetUnits} onChange={setUnits} />
        </div>

        <div className="dialog-row">
          <label>Scale</label>
          <select
            value={selectedScaleId}
            onChange={(e) => setSelectedScaleId(e.target.value)}
          >
            {MAP_SCALES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} ({s[effectiveUnits].unit})
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
