import React, { useState } from 'react';
import { useMapStore } from '../../store/mapStore';
import type { TmjTileset, TmjTileEntry } from '../../types/tmj';
import { isTileLayer } from '../../types/tmj';
import { DEFAULT_TILE_TILESET, DEFAULT_HEX_TILESET } from '../../data/defaultTilesets';

interface Props {
  onClose: () => void;
}

export const TilesetDialog: React.FC<Props> = ({ onClose }) => {
  const { mapData, addTileset, removeTileset } = useMapStore();
  const [error, setError] = useState('');

  if (!mapData) return null;

  const handleLoadBuiltin = () => {
    const isHex = mapData.orientation === 'hexagonal';
    const template = isHex ? DEFAULT_HEX_TILESET : DEFAULT_TILE_TILESET;
    const alreadyLoaded = mapData.tilesets.some((ts) => ts.name === template.name);
    if (alreadyLoaded) {
      setError(`"${template.name}" is already loaded.`);
      return;
    }
    const lastTs = mapData.tilesets[mapData.tilesets.length - 1];
    const firstgid = lastTs ? lastTs.firstgid + lastTs.tilecount : 1;
    addTileset({ ...template, firstgid });
    setError('');
  };

  const handleAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const name = prompt('Tileset name:', file.name.replace(/\.[^.]+$/, '')) ?? '';
    if (!name.trim()) return;
    const tileW = Number(prompt('Tile width (px):', '32') ?? '32');
    const tileH = Number(prompt('Tile height (px):', '32') ?? '32');
    if (!tileW || !tileH) { setError('Invalid tile size'); return; }

    const img = new Image();
    img.onload = () => {
      const cols = Math.max(1, Math.floor(img.width / tileW));
      const rows = Math.max(1, Math.floor(img.height / tileH));
      const count = cols * rows;

      const tiles: TmjTileEntry[] = [];
      for (let i = 0; i < count; i++) {
        tiles.push({
          id: i,
          type: `Tile ${i + 1}`,
          properties: [
            { name: 'color_r', type: 'int', value: 200 },
            { name: 'color_g', type: 'int', value: 200 },
            { name: 'color_b', type: 'int', value: 200 },
            { name: 'category', type: 'string', value: 'TERRAIN' },
          ],
        });
      }

      // Determine firstgid: one past the end of the last tileset
      const lastTs = mapData.tilesets[mapData.tilesets.length - 1];
      const firstgid = lastTs ? lastTs.firstgid + lastTs.tilecount : 1;

      // The image path — use the file's name as a local reference
      // (absolute server path not available for browser-uploaded files)
      const ts: TmjTileset = {
        firstgid,
        name: name.trim(),
        tilewidth: tileW,
        tileheight: tileH,
        tilecount: count,
        columns: cols,
        image: '',   // blank: no server-side path for uploaded images
        imagewidth: img.width,
        imageheight: img.height,
        tiles,
      };
      addTileset(ts);
      setError('');
    };
    img.onerror = () => setError('Failed to load image');
    img.src = URL.createObjectURL(file);
  };

  const handleRemove = (firstgid: number) => {
    // Check if any tile layer references tiles from this tileset
    const ts = mapData.tilesets.find((t) => t.firstgid === firstgid);
    if (!ts) return;

    const isUsed = mapData.layers.some((layer) => {
      if (!isTileLayer(layer)) return false;
      return layer.data.some(
        (gid) => gid >= ts.firstgid && gid < ts.firstgid + ts.tilecount,
      );
    });

    if (isUsed) {
      setError(`Tileset "${ts.name}" is referenced by a tile layer and cannot be removed.`);
      return;
    }

    removeTileset(firstgid);
    setError('');
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">Manage Tilesets</div>

        {mapData.tilesets.length === 0 ? (
          <p style={{ color: '#888' }}>No tilesets loaded.</p>
        ) : (
          <table className="tileset-table">
            <thead>
              <tr><th>Name</th><th>Size</th><th>Tiles</th><th></th></tr>
            </thead>
            <tbody>
              {mapData.tilesets.map((ts) => (
                <tr key={ts.firstgid}>
                  <td>{ts.name}</td>
                  <td>{ts.tilewidth}×{ts.tileheight}</td>
                  <td>{ts.tilecount}</td>
                  <td>
                    <button
                      className="btn-danger"
                      onClick={() => handleRemove(ts.firstgid)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-secondary" onClick={handleLoadBuiltin}>
            Load Built-in Default
          </button>
          <label className="btn-secondary">
            Add from PNG…
            <input type="file" accept="image/*" onChange={handleAdd} style={{ display: 'none' }} />
          </label>
        </div>

        {error && <div className="dialog-error">{error}</div>}

        <div className="dialog-buttons">
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
