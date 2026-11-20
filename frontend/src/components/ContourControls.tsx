import React from 'react';
import { useMapStore } from '../store/mapStore';
import { useViewStore } from '../store/viewStore';
import type { UnitSystem } from '../data/mapScales';
import { bandIntervalCm, formatHeight, parseHeightToCm } from '../utils/heightGrid';
import { readContours } from '../utils/contours';
import { DEFAULT_REACH_CELLS } from '../utils/spotHeights';
import { newContourCm } from '../tools/contourMode';
import { ValueField, parseReach } from './SpotHeightControls';

/**
 * Contour mode of the Height tool: settings for new contour lines, and editing of the
 * selected one (each edit is one undo step).
 */
export const ContourControls: React.FC<{ units: UnitSystem }> = ({ units }) => {
  const store = useMapStore();
  const { mapData, heightBrush, setHeightBrush, updateContour, deleteContour } = store;
  const selectedId = useViewStore((s) => s.selectedContourId);
  const selectContour = useViewStore((s) => s.selectContour);
  const drafting = useViewStore((s) => s.draftLine !== null);
  if (!mapData) return null;
  const unit = units === 'imperial' ? 'ft' : 'm';
  const contours = readContours(mapData);
  const selected = contours.find((c) => c.id === selectedId) ?? null;
  const heightText = (cm: number) => formatHeight(cm, units).replace(/ (m|ft)$/, '').replace(/,/g, '');
  const parseHeight = (t: string) => parseHeightToCm(t, units);
  const step = bandIntervalCm(mapData.scale, units);
  const newCm = newContourCm(store);
  const stepBtn = (sign: 1 | -1) => (
    <button
      className="btn-secondary"
      style={{ fontSize: 11, padding: '0 6px', marginLeft: 2 }}
      title={`${sign > 0 ? 'Up' : 'Down'} one contour interval (${formatHeight(step, units)})`}
      onClick={() => setHeightBrush({ contourCm: Math.round(newCm + sign * step) })}
    >
      {sign > 0 ? '+' : '−'}
    </button>
  );

  return (
    <div className="contour-controls">
      <div style={{ color: '#888', marginBottom: 4 }}>
        {drafting
          ? 'Click to add points. Double-click or Enter finishes; click the first point to close a loop. Esc cancels.'
          : 'Click the map to start a contour line; click a contour to edit it. Right-click picks the height under the pointer.'}
      </div>
      <label style={{ display: 'block', marginBottom: 4 }}>
        New contours: height ({unit}){' '}
        <ValueField value={newCm} format={heightText} parse={parseHeight} commit="change"
          title="Height for new contour lines" onChange={(v) => setHeightBrush({ contourCm: v })} />
        {stepBtn(-1)}{stepBtn(1)}
      </label>
      <label style={{ display: 'block', marginBottom: 6 }}>
        reach (cells){' '}
        <ValueField value={heightBrush.contourReachCells ?? DEFAULT_REACH_CELLS} format={String} parse={parseReach} commit="change" width={50}
          title="How far new contours pull the surface when fitting, in cells. Contours closer than twice their reach blend into one slope."
          onChange={(c) => setHeightBrush({ contourReachCells: c })} />
      </label>

      {selected ? (
        <div style={{ borderTop: '1px solid #333', paddingTop: 4 }}>
          <div style={{ color: '#aaa', marginBottom: 4 }}>
            Selected contour · {selected.points.length} points{selected.closed ? ' · closed' : ''}
          </div>
          <label style={{ display: 'block', marginBottom: 4 }}>
            Name{' '}
            <ValueField value={selected.name} format={(s) => s} parse={(t) => t.trim()} commit="blur" width={110}
              title="Optional name" onChange={(n) => updateContour(selected.id, { name: n })} />
          </label>
          <label style={{ display: 'block', marginBottom: 4 }}>
            Height ({unit}){' '}
            <ValueField value={selected.cm} format={heightText} parse={parseHeight} commit="blur"
              title="This contour's height (Enter to apply)" onChange={(v) => updateContour(selected.id, { cm: v })} />
          </label>
          <label style={{ display: 'block', marginBottom: 4 }}>
            Reach (cells){' '}
            <ValueField value={selected.reachCells} format={String} parse={parseReach} commit="blur" width={50}
              title="How far this contour pulls the surface (Enter to apply)" onChange={(c) => updateContour(selected.id, { reachCells: c })} />
          </label>
          <label style={{ display: 'block', marginBottom: 4 }} title="A closed contour is a loop, e.g. around a hilltop">
            <input
              type="checkbox"
              checked={selected.closed}
              disabled={!selected.closed && selected.points.length < 3}
              onChange={(e) => updateContour(selected.id, { closed: e.target.checked })}
            />{' '}
            Closed loop
          </label>
          <div style={{ color: '#888', marginBottom: 4 }}>
            Drag points to move them; drag a midpoint to add one. Delete removes the selected point.
          </div>
          <button className="btn-danger" style={{ fontSize: 11 }} onClick={() => { deleteContour(selected.id); selectContour(null); }}>
            Delete contour
          </button>
        </div>
      ) : (
        <div style={{ color: '#888' }}>{contours.length} contour{contours.length === 1 ? '' : 's'} on this map.</div>
      )}
      <div style={{ color: '#888', marginTop: 4 }}>
        Contours change nothing until you use "Fit to spots &amp; contours" above.
      </div>
    </div>
  );
};
