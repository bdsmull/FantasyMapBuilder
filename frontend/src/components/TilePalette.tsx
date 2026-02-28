import React, { useRef, useEffect, useCallback } from 'react';
import { useMapStore } from '../store/mapStore';
import { tilesetImageUrl } from '../api/client';

export const TilePalette: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { mapData, activeGid, setActiveGid } = useMapStore();

  const tileset = mapData?.tilesets[0] ?? null;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !tileset) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cols = tileset.columns || 8;
    const rows = Math.ceil(tileset.tilecount / cols);
    const tw = tileset.tilewidth;
    const th = tileset.tileheight;

    canvas.width = cols * tw;
    canvas.height = rows * th;

    if (tileset.image) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        highlightSelected(ctx, tileset, tw, th);
      };
      img.src = tilesetImageUrl(tileset.image);
    } else {
      // Placeholder: draw colored rectangles
      ctx.fillStyle = '#222';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const tile of tileset.tiles) {
        const lid = tile.id;
        const tx = (lid % cols) * tw;
        const ty = Math.floor(lid / cols) * th;
        const props = Object.fromEntries(tile.properties.map((p) => [p.name, p.value]));
        const r = Number(props['color_r'] ?? 200);
        const g = Number(props['color_g'] ?? 200);
        const b = Number(props['color_b'] ?? 200);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(tx + 1, ty + 1, tw - 2, th - 2);
      }
      highlightSelected(ctx, tileset, tw, th);
    }
  }, [tileset, activeGid]);

  function highlightSelected(
    ctx: CanvasRenderingContext2D,
    ts: NonNullable<typeof tileset>,
    tw: number,
    th: number,
  ) {
    if (!mapData) return;
    // Find the local ID for the active GID within this tileset
    const lid = activeGid - ts.firstgid;
    if (lid < 0 || lid >= ts.tilecount) return;
    const cols = ts.columns || 8;
    const tx = (lid % cols) * tw;
    const ty = Math.floor(lid / cols) * th;
    ctx.strokeStyle = 'rgba(255,220,0,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(tx + 1, ty + 1, tw - 2, th - 2);
  }

  useEffect(() => { draw(); }, [draw]);

  const onClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!tileset) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;
    const col = Math.floor(px / tileset.tilewidth);
    const row = Math.floor(py / tileset.tileheight);
    const lid = row * (tileset.columns || 8) + col;
    if (lid >= 0 && lid < tileset.tilecount) {
      setActiveGid(tileset.firstgid + lid);
    }
  }, [tileset, setActiveGid]);

  if (!tileset) {
    return (
      <div className="panel-empty" style={{ padding: '8px' }}>
        No tileset loaded
      </div>
    );
  }

  return (
    <div className="tile-palette">
      <div className="panel-header">Tile Palette</div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        <canvas
          ref={canvasRef}
          onClick={onClick}
          style={{ display: 'block', width: '100%', cursor: 'pointer', imageRendering: 'pixelated' }}
          title="Click to select tile"
        />
      </div>
    </div>
  );
};
