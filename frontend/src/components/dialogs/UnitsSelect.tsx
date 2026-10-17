import React from 'react';
import type { UnitSystem } from '../../data/mapScales';

const _UNIT_NAMES: Record<UnitSystem, string> = { metric: 'Metric', imperial: 'Imperial' };

interface Props {
  /** The map's own override; undefined = inherit from the world set. */
  value: UnitSystem | undefined;
  /** The units the map inherits when it has no override. */
  worldSetUnits: UnitSystem;
  onChange: (units: UnitSystem | undefined) => void;
  disabled?: boolean;
}

/** Per-map unit system picker with a "use world set default" option. */
export const UnitsSelect: React.FC<Props> = ({ value, worldSetUnits, onChange, disabled }) => (
  <select
    value={value ?? ''}
    onChange={(e) => onChange((e.target.value || undefined) as UnitSystem | undefined)}
    disabled={disabled}
  >
    <option value="">World set default ({_UNIT_NAMES[worldSetUnits]})</option>
    <option value="metric">{_UNIT_NAMES.metric}</option>
    <option value="imperial">{_UNIT_NAMES.imperial}</option>
  </select>
);
