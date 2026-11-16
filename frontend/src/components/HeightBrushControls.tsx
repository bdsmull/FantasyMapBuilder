import React, { useEffect, useState } from 'react';
import { useMapStore } from '../store/mapStore';
import type { UnitSystem } from '../data/mapScales';
import type { HeightBrushMode } from '../utils/heightBrush';
import { formatHeight, parseHeightToCm } from '../utils/heightGrid';

const _MODES: { mode: HeightBrushMode; label: string; hint: string }[] = [
  { mode: 'raise', label: 'Raise', hint: 'Raise the ground, strongest at the centre' },
  { mode: 'lower', label: 'Lower', hint: 'Lower the ground, strongest at the centre' },
  { mode: 'set', label: 'Set', hint: 'Flatten to the target height (right-click picks it)' },
  { mode: 'smooth', label: 'Smooth', hint: 'Even out bumps towards the neighbours' },
  { mode: 'release', label: 'Release', hint: 'Unprotect hand-set heights without changing them' },
];

/** A height typed in the map's units, applied when it parses. */
const HeightField: React.FC<{ cm: number; units: UnitSystem; onChange: (cm: number) => void; title: string }> = ({
  cm, units, onChange, title,
}) => {
  const toText = (v: number) => formatHeight(v, units).replace(/ (m|ft)$/, '');
  const [text, setText] = useState(toText(cm));
  useEffect(() => { setText(toText(cm)); }, [cm, units]); // eslint-disable-line react-hooks/exhaustive-deps
  const valid = parseHeightToCm(text, units) !== null;
  return (
    <input
      type="text"
      value={text}
      title={title}
      style={{ width: 70, borderColor: valid ? undefined : '#c44' }}
      onChange={(e) => {
        setText(e.target.value);
        const v = parseHeightToCm(e.target.value, units);
        if (v !== null) onChange(v);
      }}
    />
  );
};

/** Brush settings for the Height tool, shown in the Elevation section while it's selected. */
export const HeightBrushControls: React.FC<{ units: UnitSystem }> = ({ units }) => {
  const { heightBrush, setHeightBrush } = useMapStore();
  const unit = units === 'imperial' ? 'ft' : 'm';
  return (
    <div className="height-brush" style={{ padding: '4px 8px', fontSize: 12, borderTop: '1px solid #333' }}>
      <div style={{ color: '#aaa', marginBottom: 4 }}>Height brush</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
        {_MODES.map((m) => (
          <button
            key={m.mode}
            className={`tool-btn${heightBrush.mode === m.mode ? ' active' : ''}`}
            title={m.hint}
            onClick={() => setHeightBrush({ mode: m.mode })}
            style={{ padding: '2px 6px', fontSize: 11 }}
          >
            {m.label}
          </button>
        ))}
      </div>
      <label style={{ display: 'block', marginBottom: 4 }} title="Brush radius in cells">
        Radius{' '}
        <input
          type="range"
          min={0.5}
          max={20}
          step={0.5}
          value={heightBrush.radius}
          onChange={(e) => setHeightBrush({ radius: Number(e.target.value) })}
          style={{ width: 80, verticalAlign: 'middle' }}
        />{' '}
        {heightBrush.radius} cell{heightBrush.radius === 1 ? '' : 's'}
      </label>
      {(heightBrush.mode === 'raise' || heightBrush.mode === 'lower') && (
        <label style={{ display: 'block' }}>
          Amount per step ({unit}){' '}
          <HeightField
            cm={heightBrush.strengthCm}
            units={units}
            title="How much each brush step raises or lowers the ground at its centre"
            onChange={(v) => setHeightBrush({ strengthCm: Math.abs(v) })}
          />
        </label>
      )}
      {heightBrush.mode === 'set' && (
        <label style={{ display: 'block' }}>
          Target ({unit}){' '}
          <HeightField
            cm={heightBrush.targetCm}
            units={units}
            title="Height to flatten to; right-click the map to pick one"
            onChange={(v) => setHeightBrush({ targetCm: v })}
          />
          <div style={{ color: '#888' }}>Right-click the map to pick a height.</div>
        </label>
      )}
      <div style={{ color: '#888', marginTop: 4 }}>
        Edited heights are protected from later regeneration; Release unprotects them. Each stroke is one undo step.
      </div>
    </div>
  );
};
