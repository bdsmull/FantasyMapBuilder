import React, { useEffect, useState } from 'react';
import { useMapStore } from '../store/mapStore';
import { useViewStore } from '../store/viewStore';
import type { UnitSystem } from '../data/mapScales';
import { formatHeight, parseHeightToCm } from '../utils/heightGrid';
import { readSpots, DEFAULT_REACH_CELLS, MIN_REACH_CELLS } from '../utils/spotHeights';

const _parseReach = (text: string): number | null => {
  const v = Number(text.replace(/,/g, '').trim());
  return text.trim() !== '' && Number.isFinite(v) && v >= MIN_REACH_CELLS ? v : null;
};

/**
 * A text field holding a value. With `commit="change"` it applies each valid edit as
 * you type (for settings); with `commit="blur"` only on Enter or leaving the field,
 * so editing an object is one undo step rather than one per keystroke.
 */
function ValueField<T>({ value, format, parse, onChange, commit, title, width = 70 }: {
  value: T; format: (v: T) => string; parse: (text: string) => T | null;
  onChange: (v: T) => void; commit: 'change' | 'blur'; title: string; width?: number;
}) {
  const [text, setText] = useState(format(value));
  useEffect(() => { setText(format(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const parsed = parse(text);
  const apply = () => { if (parsed !== null && format(parsed) !== format(value)) onChange(parsed); };
  return (
    <input
      type="text" value={text} title={title} style={{ width, borderColor: parsed === null ? '#c44' : undefined }}
      onChange={(e) => {
        setText(e.target.value);
        const v = parse(e.target.value);
        if (commit === 'change' && v !== null) onChange(v);
      }}
      onBlur={commit === 'blur' ? apply : undefined}
      onKeyDown={commit === 'blur' ? (e) => { if (e.key === 'Enter') apply(); } : undefined}
    />
  );
}

/**
 * Spot mode of the Height tool: settings for new spot heights, and editing of the
 * selected one (each edit is one undo step).
 */
export const SpotHeightControls: React.FC<{ units: UnitSystem }> = ({ units }) => {
  const { mapData, heightBrush, setHeightBrush, updateSpotHeight, deleteSpotHeight } = useMapStore();
  const selectedId = useViewStore((s) => s.selectedSpotId);
  const setSelected = useViewStore((s) => s.setSelectedSpotId);
  const unit = units === 'imperial' ? 'ft' : 'm';
  const spots = mapData ? readSpots(mapData) : [];
  const selected = spots.find((s) => s.id === selectedId) ?? null;
  const heightText = (cm: number) => formatHeight(cm, units).replace(/ (m|ft)$/, '').replace(/,/g, '');
  const parseHeight = (t: string) => parseHeightToCm(t, units);

  return (
    <div className="spot-controls">
      <div style={{ color: '#888', marginBottom: 4 }}>
        Click the map to add a spot height; click a spot to edit it. Right-click picks the height under the pointer.
      </div>
      <label style={{ display: 'block', marginBottom: 4 }}>
        New spots: height ({unit}){' '}
        <ValueField value={heightBrush.targetCm} format={heightText} parse={parseHeight} commit="change"
          title="Height for new spots" onChange={(v) => setHeightBrush({ targetCm: v })} />
      </label>
      <label style={{ display: 'block', marginBottom: 6 }}>
        reach (cells){' '}
        <ValueField value={heightBrush.spotReachCells ?? DEFAULT_REACH_CELLS} format={String} parse={_parseReach} commit="change" width={50}
          title="How far new spots pull the surface when fitting, in cells" onChange={(c) => setHeightBrush({ spotReachCells: c })} />
      </label>

      {selected ? (
        <div style={{ borderTop: '1px solid #333', paddingTop: 4 }}>
          <div style={{ color: '#aaa', marginBottom: 4 }}>Selected spot</div>
          <label style={{ display: 'block', marginBottom: 4 }}>
            Name{' '}
            <ValueField value={selected.name} format={(s) => s} parse={(t) => t.trim()} commit="blur" width={110}
              title="Optional name, e.g. a summit or a ford" onChange={(n) => updateSpotHeight(selected.id, { name: n })} />
          </label>
          <label style={{ display: 'block', marginBottom: 4 }}>
            Height ({unit}){' '}
            <ValueField value={selected.cm} format={heightText} parse={parseHeight} commit="blur"
              title="This spot's height (Enter to apply)" onChange={(v) => updateSpotHeight(selected.id, { cm: v })} />
          </label>
          <label style={{ display: 'block', marginBottom: 4 }}>
            Reach (cells){' '}
            <ValueField value={selected.reachCells} format={String} parse={_parseReach} commit="blur" width={50}
              title="How far this spot pulls the surface (Enter to apply)" onChange={(c) => updateSpotHeight(selected.id, { reachCells: c })} />
          </label>
          <button className="btn-danger" style={{ fontSize: 11 }} onClick={() => { deleteSpotHeight(selected.id); setSelected(null); }}>
            Delete spot
          </button>
        </div>
      ) : (
        <div style={{ color: '#888' }}>{spots.length} spot height{spots.length === 1 ? '' : 's'} on this map.</div>
      )}
      <div style={{ color: '#888', marginTop: 4 }}>
        Spots change nothing until you use "Fit to spot heights" above.
      </div>
    </div>
  );
};
