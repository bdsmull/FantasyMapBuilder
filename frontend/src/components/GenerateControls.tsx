import React, { useEffect, useState } from 'react';
import { useMapStore } from '../store/mapStore';
import { useWorldSetStore } from '../store/worldSetStore';
import { getMap } from '../api/client';
import { resolveMetersPerUnit } from '../data/mapScales';
import type { UnitSystem } from '../data/mapScales';
import { parseHeightToCm } from '../utils/heightGrid';
import {
  DEFAULT_FEATURE_SIZE_M, DEFAULT_ROUGHNESS, MIN_ROUGHNESS, MAX_ROUGHNESS, generateHeights, mapOriginMeters, minWavelengthFor, randomSeed, reliefSamples, tooCoarse,
} from '../utils/heightGeneration';
import type { GenerationSettings, PlacedMapSource } from '../utils/heightGeneration';
import { wrapsX } from '../utils/worldWrap';

const _METERS_PER_MILE = 1609.344;

/** Distance in km or mi for the feature size field. */
const _bigUnit = (units: UnitSystem) => (units === 'imperial' ? 'mi' : 'km');
const _toBig = (m: number, units: UnitSystem) => String(Math.round((m / (units === 'imperial' ? _METERS_PER_MILE : 1000)) * 100) / 100);
function _fromBig(text: string, units: UnitSystem): number | null {
  const v = Number(text.replace(/,/g, '').trim());
  return text.trim() !== '' && Number.isFinite(v) && v > 0 ? v * (units === 'imperial' ? _METERS_PER_MILE : 1000) : null;
}

/**
 * "Generate" settings in the Elevation panel: add world-anchored detail on top of
 * the current heights. Seed, feature size and roughness belong to the world set (shared by all
 * its maps); strength and the fallback relief are per run.
 */
export const GenerateControls: React.FC<{ units: UnitSystem; onClose: () => void }> = ({ units, onClose }) => {
  const { mapData, mapName, mapWorldSet, heights, replaceHeights } = useMapStore();
  const { activeWorldSetName, activeWorldSet, setGeneration, saveWorldSet } = useWorldSetStore();
  const stored = activeWorldSet?.generation;
  const [seed, setSeed] = useState(String(stored?.seed ?? randomSeed()));
  const [feature, setFeature] = useState(_toBig(stored?.featureSizeM ?? DEFAULT_FEATURE_SIZE_M, units));
  const [roughness, setRoughness] = useState(Math.round((stored?.roughness ?? DEFAULT_ROUGHNESS) * 100));
  const [strength, setStrength] = useState(100);
  const [fallback, setFallback] = useState('0');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setNote(''); }, [mapName]);

  if (!mapData || !heights) return null;
  const inActive = mapWorldSet === activeWorldSetName && !!activeWorldSet;
  const mpu = resolveMetersPerUnit(mapData, activeWorldSet?.units);
  const seedNum = /^\d+$/.test(seed.trim()) ? Number(seed.trim()) % 0x80000000 : null;
  const featureM = _fromBig(feature, units);
  const fallbackCm = parseHeightToCm(fallback, units);
  const settings: GenerationSettings | null = seedNum !== null && featureM !== null ? { seed: seedNum, featureSizeM: featureM, roughness: roughness / 100 } : null;

  const blocker = !inActive ? "Open this map's world set (World Sets…) to generate: the noise is shared by the world set."
    : !mpu ? 'Set a scale for this map first (File → Map Properties…): detail is sized in real distances.'
    : settings && tooCoarse(settings, mpu)
      ? `This map's cells are too big to show bumps of ${_toBig(settings.featureSizeM, units)} ${_bigUnit(units)}. `
        + `Use a feature size of at least ${_toBig(minWavelengthFor(mpu), units)} ${_bigUnit(units)}.`
      : null;
  const reliefNote = (() => {
    if (!mpu) return '';
    const { fromTerrain } = reliefSamples(mapData, heights.cols, heights.rows, 0);
    const share = Math.round((fromTerrain / heights.cm.length) * 100);
    return share === 100 ? '' : share === 0
      ? 'No terrain here has a relief; detail comes only from "Relief elsewhere".'
      : `${100 - share}% of the map has no terrain relief; "Relief elsewhere" applies there.`;
  })();

  const generate = async () => {
    if (!settings || !mpu || fallbackCm === null || !activeWorldSet) return;
    setBusy(true);
    try {
      // The seed, feature size and roughness are shared: store them with the world set
      if (stored?.seed !== settings.seed || stored?.featureSizeM !== settings.featureSizeM
        || (stored?.roughness ?? DEFAULT_ROUGHNESS) !== settings.roughness) {
        setGeneration(settings);
        await saveWorldSet();
      }
      // Place this map in the world: fetch its ancestors for their cell sizes
      const sources = new Map<string, PlacedMapSource>([[mapName, { map: mapData, mpu }]]);
      let node = activeWorldSet.nodes.find((n) => n.mapName === mapName);
      while (node?.parentMapName && !sources.has(node.parentMapName)) {
        const parent = await getMap(activeWorldSet.name, node.parentMapName);
        const parentMpu = resolveMetersPerUnit(parent, activeWorldSet.units);
        if (!parentMpu) break;
        sources.set(node.parentMapName, { map: parent, mpu: parentMpu });
        const parentName: string = node.parentMapName;
        node = activeWorldSet.nodes.find((n) => n.mapName === parentName);
      }
      const origin = mapOriginMeters(mapName, activeWorldSet.nodes, (n) => sources.get(n));
      // On a wrapped world the detail repeats once per turn, on every map in it
      const root = node && !node.parentMapName ? sources.get(node.mapName) : undefined;
      const circumferenceM = root && wrapsX(root.map) ? root.map.width * root.mpu : undefined;
      const current = useMapStore.getState().heights;
      if (!current) return;
      const result = generateHeights(mapData, current, {
        settings, mpu, origin, strength: strength / 100, fallbackReliefCm: Math.abs(fallbackCm), circumferenceM,
      });
      if (result.changed > 0) replaceHeights(result.cm);
      setNote(result.changed > 0
        ? `Added detail to ${result.changed.toLocaleString('en-US')} heights. Undo to try other settings.`
        : 'Nothing changed: no relief here (set terrain relief, or "Relief elsewhere"), or it is all hand-set.');
    } catch (e) {
      setNote(`Generating failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const field = (bad: boolean): React.CSSProperties => ({ width: 70, borderColor: bad ? '#c44' : undefined });
  return (
    <div className="generate-controls" style={{ padding: '4px 8px', fontSize: 12, borderTop: '1px solid #333' }}>
      <div style={{ display: 'flex', alignItems: 'center', color: '#aaa', marginBottom: 4 }}>
        <span style={{ flex: 1 }}>Generate detail</span>
        <button className="inspector-close" aria-label="Close generate" title="Close" onClick={onClose}>×</button>
      </div>
      <label style={{ display: 'block', marginBottom: 4 }} title="Multiplies each terrain type's relief">
        Strength{' '}
        <input type="range" min={0} max={200} step={5} value={strength}
          onChange={(e) => setStrength(Number(e.target.value))} style={{ width: 80, verticalAlign: 'middle' }} />{' '}
        {strength}%
      </label>
      <label style={{ display: 'block', marginBottom: 4 }} title="Relief where the terrain type sets none (0 = leave those places alone)">
        Relief elsewhere ({units === 'imperial' ? 'ft' : 'm'}){' '}
        <input type="text" value={fallback} style={field(fallbackCm === null)} onChange={(e) => setFallback(e.target.value)} />
      </label>
      <div style={{ color: '#888', margin: '6px 0 2px' }}>Shared by the world set:</div>
      <label style={{ display: 'block', marginBottom: 4 }} title="Wavelength of the largest bumps">
        Feature size ({_bigUnit(units)}){' '}
        <input type="text" value={feature} style={field(featureM === null)} onChange={(e) => setFeature(e.target.value)} />
      </label>
      <label style={{ display: 'block', marginBottom: 4 }} title="How much of each layer of bumps the next, half-size layer keeps: higher is more rugged, lower is smoother">
        Roughness{' '}
        <input type="range" min={MIN_ROUGHNESS * 100} max={MAX_ROUGHNESS * 100} step={5} value={roughness}
          onChange={(e) => setRoughness(Number(e.target.value))} style={{ width: 80, verticalAlign: 'middle' }} />{' '}
        {roughness}%{roughness === DEFAULT_ROUGHNESS * 100 ? ' (default)' : ''}
      </label>
      <label style={{ display: 'block', marginBottom: 4 }}>
        Seed{' '}
        <input type="text" value={seed} style={{ ...field(seedNum === null), width: 90 }} onChange={(e) => setSeed(e.target.value)} />{' '}
        <button className="btn-secondary" style={{ fontSize: 11, padding: '1px 6px' }} title="Pick a new random seed" onClick={() => setSeed(String(randomSeed()))}>
          New
        </button>
      </label>
      <div style={{ color: '#888', marginBottom: 4 }}>
        Every map generated with the same seed, feature size and roughness gets matching detail where they overlap.
        Changing them affects maps generated from now on.
      </div>
      {reliefNote && <div style={{ color: '#888', marginBottom: 4 }}>{reliefNote}</div>}
      {blocker && <div style={{ color: '#fbbf24', marginBottom: 4 }}>{blocker}</div>}
      <button
        className="btn-primary"
        disabled={busy || !!blocker || !settings || fallbackCm === null}
        title="Adds detail on top of the current heights; hand-set heights are kept. One undo step."
        onClick={() => { generate().catch(console.error); }}
      >
        {busy ? 'Generating…' : 'Generate'}
      </button>
      {note && <div style={{ color: '#aaa', marginTop: 4 }}>{note}</div>}
    </div>
  );
};
