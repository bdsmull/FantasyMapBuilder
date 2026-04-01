import React, { useState } from 'react';
import { useMapStore } from '../../store/mapStore';
import type { TmjMap } from '../../types/tmj';
import { saveMap as apiSaveMap } from '../../api/client';
import { DEFAULT_TILE_TILESET, DEFAULT_HEX_TILESET } from '../../data/defaultTilesets';
import { MAP_SCALES } from '../../data/mapScales';

interface Props {
  onClose: () => void;
}

export const NewMapDialog: React.FC<Props> = ({ onClose }) => {
  const [mapType, setMapType] = useState<'tile' | 'hex'>('tile');
  const [scale, setScale] = useState('building');
  const [name, setName] = useState('');
  const [width, setWidth] = useState(20);
  const [height, setHeight] = useState(15);
  const [tileW, setTileW] = useState(32);
  const [tileH, setTileH] = useState(32);
  const [hexSize, setHexSize] = useState(40);
  const [includeDefault, setIncludeDefault] = useState(true);
  const [dirtyWarn, setDirtyWarn] = useState(false);
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const { loadMap, isDirty, mapName: currentName, saveMapToServer } = useMapStore();

  const doCreate = async () => {
    setIsCreating(true);
    const isHex = mapType === 'hex';
    const mapData: TmjMap = {
      scale,
      tiledversion: '1.10.0',
      version: '1.10',
      type: 'map',
      orientation: isHex ? 'hexagonal' : 'orthogonal',
      renderorder: 'right-down',
      width,
      height,
      tilewidth: tileW,
      tileheight: tileH,
      infinite: false,
      nextlayerid: 3,
      nextobjectid: 1,
      ...(isHex ? {
        staggeraxis: 'x',
        staggerindex: 'odd',
        hexsidelength: hexSize,
      } : {}),
      tilesets: includeDefault ? [isHex ? DEFAULT_HEX_TILESET : DEFAULT_TILE_TILESET] : [],
      layers: [
        {
          type: 'tilelayer',
          id: 1,
          name: 'Ground',
          width,
          height,
          visible: true,
          opacity: 1,
          offsetx: 0,
          offsety: 0,
          data: new Array(width * height).fill(0),
        },
        {
          type: 'objectgroup',
          id: 2,
          name: 'Objects',
          visible: true,
          opacity: 1,
          offsetx: 0,
          offsety: 0,
          color: '#a0a0a0',
          objects: [],
        },
      ],
    };

    try {
      await apiSaveMap(name.trim(), mapData);
      loadMap(mapData, name.trim());
      onClose();
    } catch (e) {
      setError(String(e));
      setIsCreating(false);
    }
  };

  const handleCreate = () => {
    if (!name.trim()) { setError('Map name is required'); return; }
    if (isDirty && currentName) { setDirtyWarn(true); return; }
    doCreate();
  };

  const handleSaveAndCreate = async () => {
    try {
      await saveMapToServer();
    } catch (e) {
      setError(`Save failed: ${e}`);
      return;
    }
    setDirtyWarn(false);
    doCreate();
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">New Map</div>

        <div className="dialog-row">
          <label>Scale</label>
          <select
            value={scale}
            onChange={(e) => {
              const id = e.target.value;
              setScale(id);
              const preset = MAP_SCALES.find((s) => s.id === id);
              if (preset) setMapType(preset.defaultShape);
            }}
          >
            {MAP_SCALES.map((s) => (
              <option key={s.id} value={s.id}>{s.label} ({s.unit})</option>
            ))}
          </select>
        </div>

        <div className="dialog-row">
          <label>Type</label>
          <div>
            <label><input type="radio" value="tile" checked={mapType === 'tile'} onChange={() => { setMapType('tile'); setScale('building'); }} /> Tile Map</label>
            <label style={{ marginLeft: 16 }}><input type="radio" value="hex" checked={mapType === 'hex'} onChange={() => { setMapType('hex'); setScale('town'); }} /> Hex Map</label>
          </div>
        </div>

        <div className="dialog-row">
          <label>Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="my-map" />
        </div>
        <div className="dialog-row">
          <label>Width</label>
          <input type="number" value={width} min={1} max={500} onChange={(e) => setWidth(Number(e.target.value))} />
          <label style={{ marginLeft: 16 }}>Height</label>
          <input type="number" value={height} min={1} max={500} onChange={(e) => setHeight(Number(e.target.value))} />
        </div>

        {mapType === 'tile' ? (
          <div className="dialog-row">
            <label>Tile W</label>
            <input type="number" value={tileW} min={8} max={256} onChange={(e) => setTileW(Number(e.target.value))} />
            <label style={{ marginLeft: 16 }}>Tile H</label>
            <input type="number" value={tileH} min={8} max={256} onChange={(e) => setTileH(Number(e.target.value))} />
          </div>
        ) : (
          <div className="dialog-row">
            <label>Hex Size</label>
            <input type="number" value={hexSize} min={10} max={200} onChange={(e) => setHexSize(Number(e.target.value))} />
          </div>
        )}

        <div className="dialog-row">
          <label>
            <input
              type="checkbox"
              checked={includeDefault}
              onChange={(e) => setIncludeDefault(e.target.checked)}
              style={{ marginRight: 6 }}
            />
            Include default tileset
          </label>
        </div>

        {dirtyWarn && (
          <div className="dialog-warn">
            <p>"{currentName}" has unsaved changes. Save before creating?</p>
            <div className="dialog-buttons">
              <button onClick={() => setDirtyWarn(false)}>Cancel</button>
              <button onClick={() => { setDirtyWarn(false); doCreate(); }}>Discard & Create</button>
              <button className="btn-primary" onClick={handleSaveAndCreate}>Save & Create</button>
            </div>
          </div>
        )}

        {error && <div className="dialog-error">{error}</div>}

        <div className="dialog-buttons">
          <button onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleCreate} disabled={!name.trim() || isCreating}>
            {isCreating ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
};
