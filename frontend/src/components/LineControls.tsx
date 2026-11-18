import React, { useEffect, useState } from 'react';
import { useMapStore } from '../store/mapStore';
import { useWorldSetStore } from '../store/worldSetStore';
import { useViewStore } from '../store/viewStore';
import { resolveLineClasses, classForType } from '../data/lineClasses';
import { resolveMetersPerUnit, resolveUnits } from '../data/mapScales';
import { readLines, linePoints, readWidths, lineLengthM, pixelsPerMeter } from '../utils/lines';

/** Text field applied on Enter or when leaving it (one undo step per edit). */
const CommitField: React.FC<{ value: string; onCommit: (v: string) => void; placeholder?: string; width?: number; invalid?: (v: string) => boolean; title?: string }> = ({
  value, onCommit, placeholder, width = 110, invalid, title,
}) => {
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);
  const bad = invalid?.(text) ?? false;
  const apply = () => { if (!bad && text !== value) onCommit(text); };
  return (
    <input
      type="text" value={text} placeholder={placeholder} title={title}
      style={{ width, borderColor: bad ? '#c44' : undefined }}
      onChange={(e) => setText(e.target.value)} onBlur={apply}
      onKeyDown={(e) => { if (e.key === 'Enter') { apply(); (e.target as HTMLInputElement).blur(); } e.stopPropagation(); }}
    />
  );
};

const _metersText = (m: number) => String(Math.round(m * 100) / 100);
const _parseWidth = (t: string): number | null | undefined => {
  if (t.trim() === '') return null;
  const v = Number(t.replace(/,/g, '').trim());
  return Number.isFinite(v) && v > 0 ? v : undefined;
};

/** Line tool panel: the class for new lines, and editing of the selected line and point. */
export const LineControls: React.FC = () => {
  const { mapData, mapWorldSet, updateLine, deleteLine } = useMapStore();
  const { activeWorldSetName, activeWorldSet } = useWorldSetStore();
  const { selectedLineId, selectedPoint, selectLine, newLineClass, setNewLineClass, draftLine, setLineClassesOpen } = useViewStore();
  if (!mapData) return null;
  const classes = resolveLineClasses(mapWorldSet === activeWorldSetName ? activeWorldSet?.lineClasses : undefined);
  const units = resolveUnits(mapData, activeWorldSet?.units);
  const ppm = pixelsPerMeter(mapData, resolveMetersPerUnit(mapData, activeWorldSet?.units));
  const line = selectedLineId !== null ? readLines(mapData).find((l) => l.id === selectedLineId) : undefined;
  const cls = line ? classForType(line.object.type, classes) : null;
  const points = line ? linePoints(line.object) : [];
  const widths = line ? readWidths(line.object) : [];
  const length = lineLengthM(points, ppm);
  const lengthText = length === null ? '' : units === 'imperial'
    ? `${(length / 1609.344).toLocaleString('en-US', { maximumFractionDigits: 2 })} mi`
    : length >= 1000 ? `${(length / 1000).toLocaleString('en-US', { maximumFractionDigits: 2 })} km` : `${Math.round(length)} m`;

  const classSelect = (value: string, onChange: (id: string) => void, extra?: string) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ maxWidth: 130 }}>
      {extra && <option value={extra}>{classForType(extra, classes).cls.name}</option>}
      {classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({_metersText(c.widthM)} m)</option>)}
    </select>
  );

  return (
    <div className="line-controls" style={{ padding: '4px 8px', fontSize: 12, borderTop: '1px solid #333' }}>
      <div style={{ display: 'flex', alignItems: 'center', color: '#aaa', marginBottom: 4 }}>
        <span style={{ flex: 1 }}>Roads and rivers</span>
        <button className="btn-secondary" style={{ fontSize: 11, padding: '1px 6px' }} title="Edit this world set's road and river classes" onClick={() => setLineClassesOpen(true)}>
          Classes…
        </button>
      </div>
      <label style={{ display: 'block', marginBottom: 4 }}>
        New lines: {classSelect(newLineClass, setNewLineClass)}
      </label>
      <div style={{ color: '#888', marginBottom: 4 }}>
        {draftLine
          ? `Drawing (${draftLine.length} point${draftLine.length === 1 ? '' : 's'}): double-click or Enter to finish, Backspace removes the last point, Esc cancels.`
          : 'Click to start a line. Click a line to select it; drag its points, or drag a midpoint handle to add one.'}
      </div>

      {line && cls && (
        <div style={{ borderTop: '1px solid #333', paddingTop: 4 }}>
          <div style={{ color: '#aaa', marginBottom: 4 }}>
            Selected line · {points.length} points{lengthText ? ` · ${lengthText}` : ''}
          </div>
          <label style={{ display: 'block', marginBottom: 4 }}>
            Name{' '}
            <CommitField value={line.object.name} placeholder="(optional)" onCommit={(v) => updateLine(line.id, { name: v.trim() })} />
          </label>
          <label style={{ display: 'block', marginBottom: 4 }}>
            Class{' '}
            {classSelect(line.object.type, (id) => updateLine(line.id, { classId: id }), cls.known ? undefined : line.object.type)}
          </label>
          {!cls.known && (
            <div style={{ color: '#fbbf24', marginBottom: 4 }}>
              This line's type "{line.object.type}" isn't a class; it's drawn as {cls.cls.name.replace(/ \(no class\)$/, '')}. Pick a class to set it.
            </div>
          )}
          {selectedPoint !== null && selectedPoint < points.length ? (
            <div style={{ marginBottom: 4 }}>
              <label style={{ display: 'block', marginBottom: 4 }} title="Blank uses the class width">
                Point {selectedPoint + 1} width (m){' '}
                <CommitField
                  value={widths[selectedPoint] === null ? '' : _metersText(widths[selectedPoint]!)}
                  placeholder={`${_metersText(cls.cls.widthM)} (class)`}
                  width={80}
                  invalid={(t) => _parseWidth(t) === undefined}
                  onCommit={(t) => {
                    const w = _parseWidth(t);
                    if (w === undefined) return;
                    updateLine(line.id, { widths: widths.map((x, k) => (k === selectedPoint ? w : x)) });
                  }}
                />
              </label>
              <span style={{ color: '#888' }}>Delete removes this point.</span>
            </div>
          ) : (
            <div style={{ color: '#888', marginBottom: 4 }}>Click a point to set its width (rivers widening downstream, etc.).</div>
          )}
          <button className="btn-danger" style={{ fontSize: 11 }} onClick={() => { deleteLine(line.id); selectLine(null); }}>
            Delete line
          </button>
        </div>
      )}
    </div>
  );
};
