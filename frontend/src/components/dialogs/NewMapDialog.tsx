import React, { useState } from 'react';
import { useMapStore } from '../../store/mapStore';
import type { TmjMap } from '../../types/tmj';
import { saveMap as apiSaveMap } from '../../api/client';

interface Props {
  onClose: () => void;
}

export const NewMapDialog: React.FC<Props> = ({ onClose }) => {
  const [mapType, setMapType] = useState<'tile' | 'hex'>('tile');
  const [name, setName] = useState('');
  const [width, setWidth] = useState(20);
  const [height, setHeight] = useState(15);
  const [tileW, setTileW] = useState(32);
  const [tileH, setTileH] = useState(32);
  const [hexSize, setHexSize] = useState(40);
  const [error, setError] = useState('');

  const { loadMap } = useMapStore();

  const handleCreate = async () => {
    if (!name.trim()) { setError('Map name is required'); return; }

    const isHex = mapType === 'hex';
    const mapData: TmjMap = {
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
      tilesets: [],
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
    }
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">New Map</div>

        <div className="dialog-row">
          <label>Type</label>
          <div>
            <label><input type="radio" value="tile" checked={mapType === 'tile'} onChange={() => setMapType('tile')} /> Tile Map</label>
            <label style={{ marginLeft: 16 }}><input type="radio" value="hex" checked={mapType === 'hex'} onChange={() => setMapType('hex')} /> Hex Map</label>
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

        {error && <div className="dialog-error">{error}</div>}

        <div className="dialog-buttons">
          <button onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleCreate} disabled={!name.trim()}>Create</button>
        </div>
      </div>
    </div>
  );
};
