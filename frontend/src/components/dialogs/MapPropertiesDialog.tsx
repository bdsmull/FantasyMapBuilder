import React, { useState } from 'react';
import { useMapStore } from '../../store/mapStore';
import { useWorldSetStore } from '../../store/worldSetStore';
import { MAP_SCALES, DEFAULT_UNIT_SYSTEM, defaultScaleForShape } from '../../data/mapScales';
import type { UnitSystem } from '../../data/mapScales';
import { UnitsSelect } from './UnitsSelect';
import { openMapIsRoot } from '../../tools/pointTool';
import { SEAM_BLEND_CELLS, seamStepCm, withWrap, wrapProblem, wrapsX, hasSeamTwin } from '../../utils/worldWrap';
import { formatHeight, hasHeightsProperty } from '../../utils/heightGrid';

interface Props {
  onClose: () => void;
}

export const MapPropertiesDialog: React.FC<Props> = ({ onClose }) => {
  const { mapData, mapName, mapWorldSet, heights, setMapScale, setWrapX, saveMapToServer } = useMapStore();
  const worldSetUnits = useWorldSetStore((s) => s.activeWorldSet?.units) ?? DEFAULT_UNIT_SYSTEM;

  const currentScaleId = mapData?.scale
    ?? defaultScaleForShape(mapData?.orientation === 'hexagonal' ? 'hex' : 'tile');
  const [selectedScaleId, setSelectedScaleId] = useState<string>(currentScaleId);
  // undefined = inherit from the world set
  const [units, setUnits] = useState<UnitSystem | undefined>(mapData?.units);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const effectiveUnits = units ?? worldSetUnits;

  // East-west wrap: for a world set's root map (or to turn off, wherever it's set)
  const wrapsNow = !!mapData && wrapsX(mapData);
  const [wrap, setWrap] = useState(wrapsNow);
  const showWrap = !!mapData && (wrapsNow || openMapIsRoot({ mapName, mapWorldSet }));
  const heightsLoading = !!mapData && !heights && hasHeightsProperty(mapData);
  const problem = mapData ? wrapProblem(mapData) : null;
  // What turning it on does to the heights
  const step = mapData && heights && hasSeamTwin({ ...mapData, properties: withWrap(mapData.properties, true) })
    ? seamStepCm(heights.cm, heights.cols) : 0;

  const handleSave = async () => {
    setIsSaving(true);
    setMapScale(selectedScaleId, units);
    if (wrap !== wrapsNow) setWrapX(wrap);
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

        {showWrap && (
          <div className="dialog-row">
            <label htmlFor="map-wrap">World</label>
            <div>
              <label title="The east edge continues at the west edge, as on a globe">
                <input
                  id="map-wrap"
                  type="checkbox"
                  checked={wrap}
                  disabled={heightsLoading || (!wrapsNow && !!problem)}
                  onChange={(e) => setWrap(e.target.checked)}
                /> Wraps east–west
              </label>
              <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
                {problem && !wrapsNow ? problem
                  : heightsLoading ? 'Loading elevation…'
                  : wrap && !wrapsNow && step > 0
                    ? `The heights at the two edges differ by up to ${formatHeight(step, effectiveUnits)}; those within ${SEAM_BLEND_CELLS} cells of the seam are eased to meet. Undoable.`
                    : 'Heights, generated detail, the sea, lakes and flow continue across the edge.'}
              </div>
            </div>
          </div>
        )}

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
