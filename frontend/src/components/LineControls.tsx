import React, { useEffect, useState } from 'react';
import { useMapStore } from '../store/mapStore';
import { useWorldSetStore } from '../store/worldSetStore';
import { useViewStore } from '../store/viewStore';
import { resolveLineClasses, classForType } from '../data/lineClasses';
import type { LineKind } from '../data/lineClasses';
import { resolveMetersPerUnit, resolveUnits } from '../data/mapScales';
import { readLines, linePoints, readWidths, lineLengthM, pixelsPerMeter } from '../utils/lines';
import { useCrossScaleStore } from '../store/crossScaleStore';
import { surfaceKey } from '../store/worldSurfaceStore';
import {
  refinedByIndex, refinesOf, lineKey, adoptPieces, REFINES_PROPERTY,
} from '../utils/crossScaleLines';
import type { RelatedMap } from '../utils/crossScaleLines';
import { useRefinementChecks } from './useRefinementChecks';
import { describeRefinement } from '../utils/lineFit';
import { linePoints as _pts } from '../utils/lines';

/** "parent", "grandparent", "child map"… for a related map's depth. */
function _relation(depth: number): string {
  if (depth === -1) return 'parent';
  if (depth === -2) return 'grandparent';
  if (depth < 0) return `ancestor (${-depth} levels up)`;
  if (depth === 1) return 'child map';
  return `descendant (${depth} levels down)`;
}

/** A map name with an Open button. */
const MapLink: React.FC<{ name: string; onOpen: (name: string) => void }> = ({ name, onOpen }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 6 }}>
    {name}
    <button className="btn-secondary" style={{ fontSize: 10, padding: '0 5px' }} onClick={() => onOpen(name)}>Open</button>
  </span>
);

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

/**
 * Line drawing panel for one kind of line (#38): roads (Roads tool) or waterways (the
 * Water tool's Rivers mode). The class for new lines, and editing of the selected line
 * and point.
 */
export const LineControls: React.FC<{ kind: LineKind }> = ({ kind }) => {
  const { mapData, mapName, mapWorldSet, updateLine, deleteLine, addLine } = useMapStore();
  const { activeWorldSetName, activeWorldSet } = useWorldSetStore();
  const {
    selectedLineId, selectedPoint, selectLine, newLineClass, setNewLineClass, draftLine, setLineClassesOpen,
    selectedGhost, setSelectedGhost, requestOpenMap,
  } = useViewStore();
  const cross = useCrossScaleStore();
  const checks = useRefinementChecks();
  if (!mapData) return null;
  const related: RelatedMap[] = cross.key === surfaceKey(mapWorldSet, mapName) ? cross.related : [];
  const index = refinedByIndex(mapName, mapData, related);
  const ghost = selectedGhost ? cross.ghosts.find((g) => g.key === selectedGhost) : undefined;
  const allClasses = resolveLineClasses(mapWorldSet === activeWorldSetName ? activeWorldSet?.lineClasses : undefined);
  // This tool's classes (roads or waterways); lookups still know them all
  const classes = allClasses.filter((c) => c.kind === kind);
  const units = resolveUnits(mapData, activeWorldSet?.units);
  const ppm = pixelsPerMeter(mapData, resolveMetersPerUnit(mapData, activeWorldSet?.units));
  const line = selectedLineId !== null
    ? readLines(mapData).find((l) => l.id === selectedLineId && classForType(l.object.type, allClasses).cls.kind === kind)
    : undefined;
  const cls = line ? classForType(line.object.type, allClasses) : null;
  const points = line ? linePoints(line.object) : [];
  const widths = line ? readWidths(line.object) : [];
  const length = lineLengthM(points, ppm);
  const lengthText = length === null ? '' : units === 'imperial'
    ? `${(length / 1609.344).toLocaleString('en-US', { maximumFractionDigits: 2 })} mi`
    : length >= 1000 ? `${(length / 1000).toLocaleString('en-US', { maximumFractionDigits: 2 })} km` : `${Math.round(length)} m`;

  const classSelect = (value: string, onChange: (id: string) => void, extra?: string) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ maxWidth: 130 }}>
      {extra && <option value={extra}>{classForType(extra, allClasses).cls.name}</option>}
      {classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({_metersText(c.widthM)} m)</option>)}
    </select>
  );

  return (
    <div className="line-controls" style={{ padding: '4px 8px', fontSize: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        <label style={{ flex: 1 }}>
          New {kind === 'road' ? 'roads' : 'waterways'}: {classSelect(newLineClass[kind], (id) => setNewLineClass(kind, id))}
        </label>
        <button className="btn-secondary" style={{ fontSize: 11, padding: '1px 6px' }} title="Edit this world set's road and river classes" onClick={() => setLineClassesOpen(true)}>
          Classes…
        </button>
      </div>

      <div style={{ color: '#888', marginBottom: 4 }}>
        {draftLine
          ? `Drawing (${draftLine.length} point${draftLine.length === 1 ? '' : 's'}): double-click or Enter to finish, Backspace removes the last point, Esc cancels.`
          : `Click to start a ${kind === 'road' ? 'road' : 'river'}. Click one to select it; drag its points, or drag a midpoint handle to add one.`}
      </div>

      {ghost && (() => {
        const gcls = classForType(ghost.object.type, allClasses);
        const ancestor = ghost.source.depth < 0;
        const copied = index.get(ghost.key)?.includes(mapName) ?? false;
        const pieces = ancestor && cross.openRect ? adoptPieces(ghost, cross.openRect) : [];
        return (
          <div style={{ borderTop: '1px solid #333', paddingTop: 4 }}>
            <div style={{ color: '#aaa', marginBottom: 4 }}>
              From {_relation(ghost.source.depth)} <strong>{ghost.source.name}</strong> (read-only)
            </div>
            <div style={{ marginBottom: 4 }}>{ghost.object.name || <span style={{ color: '#888' }}>(unnamed)</span>} · {gcls.cls.name}</div>
            {ancestor && (
              <button
                className="btn-primary"
                style={{ fontSize: 11, marginRight: 6 }}
                disabled={copied || pieces.length === 0}
                title={copied ? 'Already copied to this map' : pieces.length === 0 ? "It doesn't cross this map"
                  : "Copy the part inside this map, to refine it here. It's linked to the original, and replaces it in this map's area."}
                onClick={() => {
                  let first: number | null = null;
                  for (const piece of pieces) {
                    const id = addLine(piece.points, ghost.object.type, {
                      name: ghost.object.name,
                      widths: piece.widths,
                      properties: [{ name: REFINES_PROPERTY, type: 'string', value: ghost.key }],
                    });
                    if (first === null) first = id;
                  }
                  setSelectedGhost(null);
                  if (first !== null) selectLine(first);
                }}
              >
                {copied ? 'Copied to this map' : 'Copy to this map'}
              </button>
            )}
            <button className="btn-secondary" style={{ fontSize: 11 }} onClick={() => requestOpenMap(ghost.source.name)}>
              Open {ghost.source.name}
            </button>
          </div>
        );
      })()}

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
          {(() => {
            const refinedOn = (index.get(lineKey(mapName, line.id)) ?? []).filter((n) => n !== mapName);
            const src = refinesOf(line.object);
            const srcMap = src ? related.find((m) => m.name === src.map) : undefined;
            const srcLine = srcMap ? readLines(srcMap.map).find((l) => l.id === src!.id) : undefined;
            const metersPerPx = ppm ? 1 / ppm : null;
            const dist = (m: number) => (units === 'imperial'
              ? (m >= 1609.344 ? `${(m / 1609.344).toLocaleString('en-US', { maximumFractionDigits: 1 })} mi` : `${Math.round(m / 0.3048).toLocaleString('en-US')} ft`)
              : (m >= 1000 ? `${(m / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })} km` : `${Math.round(m).toLocaleString('en-US')} m`));
            // This copy's fit with its original (the copies of one original are checked together)
            const own = checks.find((c) => c.refiningMap === mapName && c.copyIds.includes(line.id));
            const ownProblem = own && own.result.status !== 'missing' ? describeRefinement(own, metersPerPx, dist) : null;
            const ownFixes = own ? own.result.fixes.filter((f) => f.copyId === line.id) : [];
            // Copies of this line on child maps that no longer fit
            const childProblem = (name: string) => {
              const c = checks.find((x) => x.refiningMap === name && x.original === lineKey(mapName, line.id));
              return c ? describeRefinement(c, metersPerPx, dist) : null;
            };
            return (
              <>
                {src && (
                  <div style={{ marginBottom: 4 }}>
                    Refines {srcLine ? <>"{srcLine.object.name || 'unnamed line'}" on </> : null}
                    <MapLink name={src.map} onOpen={requestOpenMap} />
                    {srcMap && !srcLine && <span style={{ color: '#fbbf24' }}>(that line no longer exists)</span>}
                  </div>
                )}
                {ownProblem && (
                  <div style={{ color: '#fbbf24', marginBottom: 4 }}>
                    ⚠ This copy {ownProblem}.
                    {ownFixes.length > 0 && (
                      <div>
                        <button
                          className="btn-secondary"
                          style={{ fontSize: 11, marginTop: 2 }}
                          title="Move this line's ends that are off onto the original's crossing of the map's edge (one undo step)"
                          onClick={() => {
                            const pts = _pts(line.object).map((p) => ({ ...p }));
                            for (const f of ownFixes) pts[f.index] = { x: f.to.x, y: f.to.y };
                            updateLine(line.id, { points: pts });
                          }}
                        >
                          Snap ends to the original
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {refinedOn.length > 0 && (
                  <div style={{ marginBottom: 4 }}>
                    Refined on: {refinedOn.map((n) => {
                      const problem = childProblem(n);
                      return (
                        <span key={n} title={problem ? `The copy on ${n} ${problem}` : undefined}>
                          {problem && <span style={{ color: '#fbbf24' }}>⚠ </span>}
                          <MapLink name={n} onOpen={requestOpenMap} />
                        </span>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}
          <button className="btn-danger" style={{ fontSize: 11 }} onClick={() => { deleteLine(line.id); selectLine(null); }}>
            Delete line
          </button>
        </div>
      )}
    </div>
  );
};
