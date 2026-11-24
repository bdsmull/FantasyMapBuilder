import React, { useEffect, useMemo, useState } from 'react';
import { useMapStore } from '../store/mapStore';
import { useWorldSetStore } from '../store/worldSetStore';
import { useWorldSurfaceStore, surfaceKey } from '../store/worldSurfaceStore';
import { resolveMetersPerUnit } from '../data/mapScales';
import type { UnitSystem } from '../data/mapScales';
import { formatHeight, parseHeightToCm } from '../utils/heightGrid';
import { displayPatch } from '../utils/worldSurface';
import {
  gridRange, guessRawSide, heightmapInfo, heightmapLayout, heightmapSize, importHeightmap, quantize, rawBytes, rawSource,
  sampleHeightmap, samplesToFractions,
} from '../utils/heightmap';
import type { HeightmapFormat, HeightmapSize, HeightmapSource } from '../utils/heightmap';
import { decodeHeightmap, encodeHeightmapPng } from '../api/client';

/** Save a blob as a download. */
function _download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const _meters = (m: number) => `${Math.round(m * 100) / 100} m`;
/** A height in the map's units for a text field (no thousands separators). */
const _field = (cm: number, units: UnitSystem) => String(Math.round((units === 'imperial' ? cm / 30.48 : cm / 100) * 100) / 100);
const _rowStyle: React.CSSProperties = { display: 'block', marginBottom: 4 };
const _input = (bad: boolean): React.CSSProperties => ({ width: 70, borderColor: bad ? '#c44' : undefined });

const ControlsHeader: React.FC<{ title: string; onClose: () => void }> = ({ title, onClose }) => (
  <div style={{ display: 'flex', alignItems: 'center', color: '#aaa', marginBottom: 4 }}>
    <span style={{ flex: 1 }}>{title}</span>
    <button className="inspector-close" aria-label={`Close ${title.toLowerCase()}`} title="Close" onClick={onClose}>×</button>
  </div>
);

/**
 * "Export heightmap" in the Elevation panel (#46): the map's heights as a 16-bit PNG or
 * RAW for a game engine, plus a .json with the numbers that restore real heights.
 */
export const HeightmapExport: React.FC<{ units: UnitSystem; onClose: () => void }> = ({ units, onClose }) => {
  const { mapData, mapName, mapWorldSet, heights, heightsRev } = useMapStore();
  const worldSetUnits = useWorldSetStore((s) => s.activeWorldSet?.units);
  const { key, overrides } = useWorldSurfaceStore();
  const [format, setFormat] = useState<HeightmapFormat>('png');
  const [size, setSize] = useState<HeightmapSize>('native');
  const [fixed, setFixed] = useState(false);
  const [lo, setLo] = useState('');
  const [hi, setHi] = useState('');
  const [assembled, setAssembled] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setNote(''); }, [mapName, heightsRev]);

  const mpu = resolveMetersPerUnit(mapData ?? undefined, worldSetUnits);
  const hasChildren = !!overrides && overrides.index.length > 0 && key === surfaceKey(mapWorldSet, mapName);
  const source = heights && assembled && hasChildren ? displayPatch(heights, overrides) : heights;
  // The map's own samples, for the range and the clamping warning (a 2ⁿ + 1 resample
  // stays within them); the full export grid is only built when exporting.
  const preview = useMemo(
    () => (mapData && source ? sampleHeightmap(mapData, source, 'native', mpu ?? 0) : null),
    [mapData, source, mpu, heightsRev], // heights are edited in place; heightsRev tracks them
  );

  if (!mapData || !source || !preview) return null;
  const layout = heightmapLayout(mapData, size, mpu ?? 0);
  const own = gridRange(preview);
  const loCm = fixed ? parseHeightToCm(lo, units) : own.minCm;
  const hiCm = fixed ? parseHeightToCm(hi, units) : own.maxCm;
  const rangeBad = loCm === null || hiCm === null || hiCm < loCm;
  const q = !rangeBad ? quantize(preview, { minCm: loCm, maxCm: hiCm }) : null;
  const native = heightmapSize(mapData, 'native');
  const pow2 = heightmapSize(mapData, 'pow2');

  const exportNow = async () => {
    if (loCm === null || hiCm === null || hiCm < loCm) return;
    setBusy(true);
    // Let the button show "Exporting…" before the work (a large 2ⁿ + 1 grid takes a moment)
    await new Promise((resolve) => setTimeout(resolve, 30));
    try {
      const grid = size === 'native' ? preview : sampleHeightmap(mapData, source, size, mpu ?? 0);
      const q = quantize(grid, { minCm: loCm, maxCm: hiCm });
      const info = heightmapInfo(mapName, format, grid, q, assembled && hasChildren);
      const base = `${mapName || 'map'}.heightmap`;
      if (format === 'png') {
        _download(await encodeHeightmapPng(q.steps, grid.cols, grid.rows, info), `${base}.png`);
      } else {
        _download(new Blob([rawBytes(q.steps)], { type: 'application/octet-stream' }), `${base}.r16`);
      }
      _download(new Blob([JSON.stringify(info, null, 2)], { type: 'application/json' }), `${base}.json`);
      setNote(`Exported ${grid.cols} × ${grid.rows}${q.clipped ? `; ${q.clipped.toLocaleString('en-US')} heights were outside the range and were clamped to it` : ''}.`);
    } catch (e) {
      setNote(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="heightmap-controls" style={{ padding: '4px 8px', fontSize: 12, borderTop: '1px solid #333' }}>
      <ControlsHeader title="Export heightmap" onClose={onClose} />
      <label style={_rowStyle}>
        Format{' '}
        <select value={format} onChange={(e) => setFormat(e.target.value as HeightmapFormat)}>
          <option value="png">PNG, 16-bit grayscale</option>
          <option value="raw">RAW, 16-bit (.r16, little-endian)</option>
        </select>
      </label>
      <label style={_rowStyle} title="Unity needs a square 2ⁿ + 1 size; the heights are stretched to fill it">
        Size{' '}
        <select value={size} onChange={(e) => setSize(e.target.value as HeightmapSize)}>
          <option value="native">This map's samples ({native.cols} × {native.rows})</option>
          <option value="pow2">Square 2ⁿ + 1 ({pow2.cols} × {pow2.rows})</option>
        </select>
      </label>
      <div style={_rowStyle}>
        <label title="Step 0 is the lowest height and 65535 the highest">
          <input type="radio" checked={!fixed} onChange={() => setFixed(false)} /> This map's range ({formatHeight(own.minCm, units)} to {formatHeight(own.maxCm, units)})
        </label>
        <br />
        <label title="The same range on neighbouring maps makes their heightmaps line up in the engine">
          <input
            type="radio"
            checked={fixed}
            onChange={() => {
              setFixed(true);
              if (lo === '' && hi === '') { setLo(_field(own.minCm, units)); setHi(_field(own.maxCm, units)); }
            }}
          /> Fixed range
        </label>
        {fixed && (
          <span>
            {' '}<input type="text" aria-label="Lowest height" value={lo} style={_input(loCm === null || rangeBad)} onChange={(e) => setLo(e.target.value)} />
            {' to '}<input type="text" aria-label="Highest height" value={hi} style={_input(hiCm === null || rangeBad)} onChange={(e) => setHi(e.target.value)} />
            {' '}{units === 'imperial' ? 'ft' : 'm'}
          </span>
        )}
      </div>
      {hasChildren && (
        <label style={_rowStyle} title="The heights as shown here: child maps' heights inside their footprints">
          <input type="checkbox" checked={assembled} onChange={(e) => setAssembled(e.target.checked)} /> Include child maps' heights
        </label>
      )}
      <div style={{ color: '#888', marginBottom: 4 }}>
        {mpu
          ? <>Samples {_meters(layout.spacingXM)}{Math.abs(layout.spacingXM - layout.spacingYM) > 1e-6 ? ` × ${_meters(layout.spacingYM)}` : ''} apart; terrain size {_meters(layout.widthM)} × {_meters(layout.heightM)}.</>
          : <>This map has no scale, so the sample spacing is unknown (File → Map Properties…).</>}
        {q && q.metersPerStep > 0 && <> One step is {Math.round(q.metersPerStep * 1e5) / 100} mm.</>}
        {' '}The .json beside the file has these numbers for the engine.
      </div>
      {mapData.orientation === 'hexagonal' && (
        <div style={{ color: '#888', marginBottom: 4 }}>Hex heights are resampled to a square grid, one sample per hex each way.</div>
      )}
      {q && q.clipped > 0 && (
        <div style={{ color: '#fbbf24', marginBottom: 4 }}>
          ⚠ {q.clipped.toLocaleString('en-US')} heights are outside the range and will be clamped to it.
        </div>
      )}
      <button className="btn-primary" disabled={busy || !q} onClick={() => { exportNow().catch(console.error); }}>
        {busy ? 'Exporting…' : 'Export'}
      </button>
      {note && <div style={{ color: '#aaa', marginTop: 4 }}>{note}</div>}
    </div>
  );
};

/** A chosen heightmap file, unpacked. */
interface _Loaded {
  name: string;
  /** Null for a RAW file until its size is known. */
  src: HeightmapSource | null;
  raw?: ArrayBuffer;
  /** What the file (or its .json) said about its range, in cm. */
  minCm?: number;
  maxCm?: number;
  note?: string;
}

const _num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/**
 * "Import heightmap" in the Elevation panel (#46): lay a heightmap image over the open
 * map (stretched to fit) and set its heights from it, as one undo step.
 */
export const HeightmapImport: React.FC<{ units: UnitSystem; onClose: () => void }> = ({ units, onClose }) => {
  const { mapData, mapName, heights, replaceHeights } = useMapStore();
  const [loaded, setLoaded] = useState<_Loaded | null>(null);
  const [rawW, setRawW] = useState('');
  const [rawH, setRawH] = useState('');
  const [bigEndian, setBigEndian] = useState(false);
  const [lo, setLo] = useState('');
  const [hi, setHi] = useState('');
  const [keep, setKeep] = useState(true);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setNote(''); }, [mapName]);

  if (!mapData || !heights) return null;
  const handSet = heights.mask.reduce((n, m) => n + (m ? 1 : 0), 0);
  const loCm = parseHeightToCm(lo, units);
  const hiCm = parseHeightToCm(hi, units);
  const rangeBad = loCm === null || hiCm === null || hiCm < loCm;
  const rawWN = Number(rawW), rawHN = Number(rawH);
  const src: HeightmapSource | null = loaded?.src
    ?? (loaded?.raw && Number.isInteger(rawWN) && Number.isInteger(rawHN) ? rawSource(loaded.raw, rawWN, rawHN, !bigEndian) : null);
  const target = heightmapSize(mapData, 'native');
  const stretch = src && Math.abs(src.width / src.height - target.cols / target.rows) > 0.02 * (target.cols / target.rows);

  /** Fill the range fields from what the file said, else from the map's current heights. */
  const fillRange = (minCm: number | undefined, maxCm: number | undefined) => {
    if (minCm !== undefined && maxCm !== undefined) {
      setLo(_field(minCm, units)); setHi(_field(maxCm, units));
    } else if (lo === '' && hi === '') {
      const r = gridRange(heights);
      setLo(_field(r.minCm, units)); setHi(_field(r.maxCm, units));
    }
  };

  const chooseFile = async (file: File) => {
    setBusy(true);
    setNote('');
    try {
      if (/\.json$/i.test(file.name)) {
        // The numbers beside an exported heightmap
        const info = JSON.parse(await file.text()) as Record<string, unknown>;
        const minM = _num(info.minM), maxM = _num(info.maxM);
        if (minM === undefined || maxM === undefined) throw new Error('that .json has no minM / maxM');
        fillRange(Math.round(minM * 100), Math.round(maxM * 100));
        const w = _num(info.width), h = _num(info.height);
        if (w && h) { setRawW(String(w)); setRawH(String(h)); }
        setNote(`Range and size read from ${file.name}.`);
        return;
      }
      if (/\.(r16|raw)$/i.test(file.name)) {
        const raw = await file.arrayBuffer();
        const side = guessRawSide(raw.byteLength);
        if (side && !(rawW && rawH && Number(rawW) * Number(rawH) * 2 === raw.byteLength)) { setRawW(String(side)); setRawH(String(side)); }
        setLoaded({ name: file.name, src: null, raw, note: 'RAW has no header: check its size, and load its .json (or type the range).' });
        fillRange(undefined, undefined);
        return;
      }
      const decoded = await decodeHeightmap(file);
      const fractions = samplesToFractions(decoded.samples, decoded.info.sample);
      const meta = decoded.info.metadata ?? {};
      const minM = _num(meta.minM), maxM = _num(meta.maxM);
      const fromFile = minM !== undefined && maxM !== undefined;
      const bits = decoded.info.sample === 'u8' ? '8-bit' : decoded.info.sample === 'u16' ? '16-bit' : '32-bit';
      setLoaded({
        name: file.name,
        src: { width: decoded.width, height: decoded.height, fractions },
        note: fromFile ? 'Range read from the file.'
          : decoded.info.sample === 'f32'
            ? `A 32-bit image: its values run ${decoded.info.rawMin} to ${decoded.info.rawMax}. Type the heights they stand for.`
            : `A ${bits} image without a range: type the heights its darkest and brightest values stand for, or load its .json.`,
      });
      fillRange(fromFile ? Math.round(minM * 100) : undefined, fromFile ? Math.round(maxM * 100) : undefined);
    } catch (e) {
      setNote(`Couldn't read ${file.name}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const importNow = () => {
    const { mapData: map, heights: patch } = useMapStore.getState();
    if (!map || !patch || !src || rangeBad) return;
    const result = importHeightmap(map, patch, src, { minCm: loCm, maxCm: hiCm }, keep);
    if (result.changed > 0) replaceHeights(result.cm, keep ? undefined : result.mask);
    const kept = result.kept ? ` Kept ${result.kept.toLocaleString('en-US')} hand-set heights.` : '';
    setNote(result.changed > 0
      ? `Set ${result.changed.toLocaleString('en-US')} heights from ${loaded?.name}.${kept} Undo to take it back.`
      : `Nothing changed: the heights already match.${kept}`);
  };

  return (
    <div className="heightmap-controls" style={{ padding: '4px 8px', fontSize: 12, borderTop: '1px solid #333' }}>
      <ControlsHeader title="Import heightmap" onClose={onClose} />
      <label className="btn-secondary" style={{ display: 'inline-block', fontSize: 11, marginBottom: 4, cursor: 'pointer' }}
        title="A grayscale PNG or TIFF, a 16-bit RAW (.r16 / .raw), or the .json exported beside one">
        Choose file…
        <input
          type="file"
          accept=".png,.tif,.tiff,.r16,.raw,.json,image/png,image/tiff"
          style={{ display: 'none' }}
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) chooseFile(file).catch(console.error);
          }}
        />
      </label>
      {loaded && <span style={{ color: '#aaa' }}> {loaded.name}{src ? ` (${src.width} × ${src.height})` : ''}</span>}
      {loaded?.note && <div style={{ color: '#888', marginBottom: 4 }}>{loaded.note}</div>}
      {loaded?.raw && (
        <div style={_rowStyle}>
          Size{' '}
          <input type="text" aria-label="RAW width" value={rawW} style={_input(!src)} onChange={(e) => setRawW(e.target.value)} />
          {' × '}
          <input type="text" aria-label="RAW height" value={rawH} style={_input(!src)} onChange={(e) => setRawH(e.target.value)} />{' '}
          <label title="Mac byte order (Unity's &quot;Mac&quot; option)">
            <input type="checkbox" checked={bigEndian} onChange={(e) => setBigEndian(e.target.checked)} /> Big-endian
          </label>
        </div>
      )}
      {loaded && (
        <div style={_rowStyle} title="The heights that the file's lowest and highest values stand for">
          Heights from{' '}
          <input type="text" aria-label="Lowest height" value={lo} style={_input(loCm === null || rangeBad)} onChange={(e) => setLo(e.target.value)} />
          {' to '}
          <input type="text" aria-label="Highest height" value={hi} style={_input(hiCm === null || rangeBad)} onChange={(e) => setHi(e.target.value)} />
          {' '}{units === 'imperial' ? 'ft' : 'm'}
        </div>
      )}
      {loaded && (
        <label style={_rowStyle} title={handSet ? 'Hand-set heights keep their height; untick to overwrite them too (they lose their hand-set mark)' : 'This map has no hand-set heights'}>
          <input type="checkbox" checked={keep} disabled={handSet === 0} onChange={(e) => setKeep(e.target.checked)} /> Keep hand-set heights{handSet ? ` (${handSet.toLocaleString('en-US')})` : ''}
        </label>
      )}
      {src && (
        <div style={{ color: stretch ? '#fbbf24' : '#888', marginBottom: 4 }}>
          {stretch ? '⚠ The file is a different shape from the map; it will be stretched to fit. '
            : 'The file is stretched over the whole map. '}
          This map has {target.cols} × {target.rows} height samples.
        </div>
      )}
      {loaded && (
        <button className="btn-primary" disabled={busy || !src || rangeBad} title="Sets the map's heights from the file. One undo step." onClick={importNow}>
          Import
        </button>
      )}
      {note && <div style={{ color: '#aaa', marginTop: 4 }}>{note}</div>}
    </div>
  );
};
