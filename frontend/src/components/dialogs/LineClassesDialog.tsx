import React, { useState } from 'react';
import { useWorldSetStore } from '../../store/worldSetStore';
import { BUILTIN_LINE_CLASSES, newClassId, resolveLineClasses } from '../../data/lineClasses';
import type { LineClass, LineKind } from '../../data/lineClasses';

interface Row extends Omit<LineClass, 'widthM'> { width: string }

const _toRows = (classes: LineClass[]): Row[] => classes.map(({ widthM, ...c }) => ({ ...c, width: String(widthM) }));
const _validWidth = (t: string) => { const v = Number(t); return t.trim() !== '' && Number.isFinite(v) && v > 0; };

/**
 * Edit the active world set's road and river classes. Saved to the world set file;
 * lines keep pointing at a class by its ID, so renaming or re-widthing a class
 * updates every line of that class on every map.
 */
export const LineClassesDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { activeWorldSet, setLineClasses, saveWorldSet } = useWorldSetStore();
  const [rows, setRows] = useState<Row[]>(() => _toRows(resolveLineClasses(activeWorldSet?.lineClasses)));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const update = (i: number, change: Partial<Row>) => setRows((r) => r.map((row, k) => (k === i ? { ...row, ...change } : row)));
  const invalid = rows.some((r) => !r.name.trim() || !_validWidth(r.width));

  const save = async (classes: LineClass[] | null) => {
    setSaving(true);
    try {
      setLineClasses(classes);
      await saveWorldSet();
      onClose();
    } catch (e) {
      setError(`Saving failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  if (!activeWorldSet) {
    return (
      <div className="dialog-backdrop" onClick={onClose}>
        <div className="dialog" onClick={(e) => e.stopPropagation()}>
          <div className="dialog-title">Road and River Classes</div>
          <p style={{ color: '#aaa' }}>Open a world set first: classes belong to a world set.</p>
          <div className="dialog-buttons"><button className="btn-primary" onClick={onClose}>Close</button></div>
        </div>
      </div>
    );
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ minWidth: 480 }}>
        <div className="dialog-title">Road and River Classes — {activeWorldSet.name}</div>
        <p style={{ color: '#888', fontSize: 12, margin: '0 0 8px' }}>
          A class sets a line's default width and look. Lines refer to their class by ID, so changes here apply to every map in this world set.
        </p>
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          <table className="tileset-table">
            <thead><tr><th>Name</th><th>Kind</th><th>Width (m)</th><th>Colour</th><th>ID</th><th></th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td><input type="text" value={r.name} style={{ width: 110, borderColor: r.name.trim() ? undefined : '#c44' }} onChange={(e) => update(i, { name: e.target.value })} /></td>
                  <td>
                    <select value={r.kind} onChange={(e) => update(i, { kind: e.target.value as LineKind })}>
                      <option value="road">Road</option>
                      <option value="water">Water</option>
                    </select>
                  </td>
                  <td><input type="text" value={r.width} style={{ width: 50, borderColor: _validWidth(r.width) ? undefined : '#c44' }} onChange={(e) => update(i, { width: e.target.value })} /></td>
                  <td><input type="color" value={r.color} aria-label={`${r.name} colour`} onChange={(e) => update(i, { color: e.target.value })} /></td>
                  <td style={{ color: '#777', fontSize: 11 }}>{r.id}</td>
                  <td>
                    <button className="btn-danger" style={{ fontSize: 11, padding: '1px 6px' }} title="Remove (lines of this class then show as unclassified)"
                      onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="btn-secondary" onClick={() => {
            const name = 'New class';
            const id = newClassId(name, rows.map(({ width, ...c }) => ({ ...c, widthM: Number(width) || 1 })));
            setRows((rs) => [...rs, { id, name, kind: 'road', width: '3', color: '#c0a080' }]);
          }}>Add class</button>
          <button className="btn-secondary" title="Go back to the built-in classes for this world set" onClick={() => setRows(_toRows(BUILTIN_LINE_CLASSES))}>
            Reset to built-in
          </button>
        </div>
        {error && <div className="dialog-error">{error}</div>}
        <div className="dialog-buttons">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            disabled={invalid || saving}
            onClick={() => {
              const classes: LineClass[] = rows.map(({ width, ...c }) => ({ ...c, name: c.name.trim(), widthM: Number(width) }));
              const isBuiltin = JSON.stringify(classes) === JSON.stringify(BUILTIN_LINE_CLASSES);
              save(isBuiltin ? null : classes).catch(console.error);
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};
