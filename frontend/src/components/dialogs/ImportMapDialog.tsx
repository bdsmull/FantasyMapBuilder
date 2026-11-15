import React, { useEffect, useState } from 'react';
import {
  listWorldSets, listMaps, inspectMapset, planMapImport, importMap,
} from '../../api/client';
import type { ImportSource, MapImportPlan, TilesetChoice } from '../../api/client';
import { describeClash, defaultChoices, suggestedName } from '../../utils/importPlan';

interface Props {
  /** World set to import into. */
  target: string;
  onClose: () => void;
  /** Called with the imported map's name (it arrives unplaced). */
  onImported: (name: string) => void;
}

const _CHOICE_LABELS: Record<TilesetChoice, string> = {
  merge: 'Merge',
  keep_both: 'Keep both',
  use_target: "Use this world set's",
};

/**
 * Import one map, with the tilesets it uses, from another world set or a .mapset.
 * Step 1 picks the source and map; step 2 reviews name and tileset clashes.
 */
export const ImportMapDialog: React.FC<Props> = ({ target, onClose, onImported }) => {
  const [worldSets, setWorldSets] = useState<string[]>([]);
  const [source, setSource] = useState<ImportSource | null>(null);
  const [sourceLabel, setSourceLabel] = useState('');
  const [maps, setMaps] = useState<string[]>([]);
  const [map, setMap] = useState('');
  const [plan, setPlan] = useState<MapImportPlan | null>(null);
  const [newName, setNewName] = useState('');
  const [choices, setChoices] = useState<Record<string, TilesetChoice>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    listWorldSets()
      .then((names) => setWorldSets(names.filter((n) => n !== target)))
      .catch((e) => setError(String(e)));
  }, [target]);

  const run = async (action: () => Promise<void>) => {
    setLoading(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const chooseWorldSet = (name: string) => {
    setPlan(null);
    setMap('');
    if (!name) { setSource(null); setMaps([]); return; }
    run(async () => {
      setMaps(await listMaps(name));
      setSource({ worldSet: name });
      setSourceLabel(name);
    });
  };

  const chooseMapset = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPlan(null);
    setMap('');
    run(async () => {
      const staged = await inspectMapset(file);
      setMaps(staged.maps);
      setSource({ staging: staged.staging });
      setSourceLabel(`${file.name} (${staged.worldSet})`);
    });
  };

  const checkImport = () => {
    if (!source || !map) return;
    run(async () => {
      const result = await planMapImport(target, source, map);
      setPlan(result);
      setNewName(suggestedName(result, 'worldSet' in source ? source.worldSet : 'imported'));
      setChoices(defaultChoices(result));
    });
  };

  const doImport = () => {
    if (!source || !plan) return;
    run(async () => {
      const result = await importMap(target, source, plan.map, newName.trim(), choices);
      onImported(result.imported);
      onClose();
    });
  };

  const sourceWorldSet = source && 'worldSet' in source ? source.worldSet : '';

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">Import Map into {target}</div>

        <div className="dialog-row">
          <label>From</label>
          <select value={sourceWorldSet} onChange={(e) => chooseWorldSet(e.target.value)} disabled={loading}>
            <option value="">{source && !sourceWorldSet ? sourceLabel : 'Choose a world set…'}</option>
            {worldSets.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <label className="btn-secondary" style={{ marginLeft: 8, cursor: 'pointer' }}>
            .mapset file…
            <input type="file" accept=".mapset,.zip" onChange={chooseMapset} disabled={loading} style={{ display: 'none' }} />
          </label>
        </div>

        {source && (
          <div className="dialog-row">
            <label>Map</label>
            <select value={map} onChange={(e) => { setMap(e.target.value); setPlan(null); }} disabled={loading}>
              <option value="">{maps.length ? 'Choose a map…' : 'No maps'}</option>
              {maps.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <button className="btn-secondary" onClick={checkImport} disabled={!map || loading} style={{ marginLeft: 8 }}>
              Check
            </button>
          </div>
        )}

        {plan && (
          <>
            <div className="dialog-row">
              <label>Import as</label>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} disabled={loading} />
            </div>
            {plan.mapExists && newName.trim() === plan.map && (
              <div className="dialog-warn"><p>A map named "{plan.map}" already exists here. Choose another name.</p></div>
            )}
            {plan.unitsPinned && (
              <p style={{ color: '#aaa', fontSize: 12, margin: '4px 0' }}>
                The map will keep {plan.unitsPinned} units so it stays the same size here.
              </p>
            )}

            <div className="dialog-section-label" style={{ marginTop: 8 }}>Tilesets</div>
            <ul className="map-list">
              {plan.tilesets.map((t) => (
                <li key={t.name} className="map-list-item" style={{ display: 'block' }}>
                  <div>
                    <strong>{t.name}</strong>{' — '}
                    {t.status === 'new' && 'will be added'}
                    {t.status === 'identical' && 'already here; will be shared'}
                    {t.status === 'conflict' && 'differs from the one here'}
                  </div>
                  {t.status === 'conflict' && t.summary && (
                    <>
                      <div style={{ color: '#aaa', fontSize: 12, margin: '4px 0' }}>{describeClash(t.summary)}</div>
                      <div>
                        {(Object.keys(_CHOICE_LABELS) as TilesetChoice[]).map((c) => (
                          <label
                            key={c}
                            style={{ marginRight: 12 }}
                            title={c === 'merge' && !t.canMerge ? 'Only color-only tilesets with the same tile size can be merged' : undefined}
                          >
                            <input
                              type="radio"
                              name={`choice-${t.name}`}
                              checked={choices[t.name] === c}
                              disabled={loading || (c === 'merge' && !t.canMerge)}
                              onChange={() => setChoices((prev) => ({ ...prev, [t.name]: c }))}
                            />{' '}
                            {_CHOICE_LABELS[c]}
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </li>
              ))}
              {plan.tilesets.length === 0 && <li className="map-list-item">None</li>}
            </ul>
            <p style={{ color: '#888', fontSize: 12 }}>
              Merge adds the imported tiles to this world set's tileset without changing how existing maps look.
              The map arrives unplaced; use "Add map node" to place it.
            </p>
          </>
        )}

        {error && <div className="dialog-error">{error}</div>}

        <div className="dialog-buttons">
          <button onClick={onClose} disabled={loading}>Cancel</button>
          <button
            className="btn-primary"
            onClick={doImport}
            disabled={!plan || !newName.trim() || loading || (plan.mapExists && newName.trim() === plan.map)}
          >
            {loading ? 'Working…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
};
