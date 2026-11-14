import React, { useState, useEffect } from 'react';
import { useMapStore } from '../../store/mapStore';
import type { TmjMap } from '../../types/tmj';
import { saveMap as apiSaveMap, listMaps, listWorldSets, getWorldSet } from '../../api/client';
import { DEFAULT_TILE_TILESET, DEFAULT_HEX_TILESET } from '../../data/defaultTilesets';
import { useWorldSetStore } from '../../store/worldSetStore';
import { MAP_SCALES, MAP_SCALE_BY_ID, DEFAULT_UNIT_SYSTEM, defaultScaleForShape } from '../../data/mapScales';
import type { UnitSystem } from '../../data/mapScales';
import { UnitsSelect } from './UnitsSelect';
import { regularHexTileSize } from '../../canvas/hexGeometry';

interface Props {
  onClose: () => void;
  /**
   * When provided, called with the new map name instead of loadMap (Plan 7-01 chain context).
   * The map is then always created in the active world set.
   */
  onCreated?: (name: string) => void;
}

export const NewMapDialog: React.FC<Props> = ({ onClose, onCreated }) => {
  const [mapType, setMapType] = useState<'tile' | 'hex'>('tile');
  // Once the user picks a type explicitly, scale changes stop suggesting one.
  const [typeChosen, setTypeChosen] = useState(false);
  const [scale, setScale] = useState(defaultScaleForShape('tile'));
  const [units, setUnits] = useState<UnitSystem | undefined>(undefined);
  const activeWorldSetName = useWorldSetStore((s) => s.activeWorldSetName);
  const activeWorldSetUnits = useWorldSetStore((s) => s.activeWorldSet?.units);
  const setActiveWorldSet = useWorldSetStore((s) => s.setActiveWorldSet);
  // Every map lives in a world set; default to the active one.
  const [worldSetNames, setWorldSetNames] = useState<string[]>([]);
  const [targetWorldSet, setTargetWorldSet] = useState(activeWorldSetName ?? '');
  const [targetUnits, setTargetUnits] = useState<UnitSystem | undefined>(activeWorldSetUnits);
  const worldSetUnits = targetUnits ?? DEFAULT_UNIT_SYSTEM;
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

  useEffect(() => {
    listWorldSets()
      .then((names) => {
        setWorldSetNames(names);
        setTargetWorldSet((current) => current || names[0] || '');
      })
      .catch((e) => setError(String(e)));
  }, []);

  // The "World set default" units option reflects the chosen target world set.
  useEffect(() => {
    if (!targetWorldSet) return;
    if (targetWorldSet === activeWorldSetName) { setTargetUnits(activeWorldSetUnits); return; }
    getWorldSet(targetWorldSet).then((ws) => setTargetUnits(ws.units)).catch(() => setTargetUnits(undefined));
  }, [targetWorldSet, activeWorldSetName, activeWorldSetUnits]);

  const doCreate = async () => {
    setIsCreating(true);
    const isHex = mapType === 'hex';
    const mapData: TmjMap = {
      scale,
      ...(units ? { units } : {}),
      tiledversion: '1.10.0',
      version: '1.10',
      type: 'map',
      orientation: isHex ? 'hexagonal' : 'orthogonal',
      renderorder: 'right-down',
      width,
      height,
      // Hex maps: Tiled's tile size is the hex's bounding box, derived from the side length.
      ...(isHex ? regularHexTileSize(hexSize, 'x') : { tilewidth: tileW, tileheight: tileH }),
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

    const mapName = name.trim();
    try {
      if ((await listMaps(targetWorldSet)).includes(mapName)) {
        setError(`A map named "${mapName}" already exists in ${targetWorldSet}`);
        setIsCreating(false);
        return;
      }
      await apiSaveMap(targetWorldSet, mapName, mapData);
      if (onCreated) {
        onCreated(mapName); // signal caller with new map name; skip loadMap in chain context
      } else {
        // Standard standalone flow. The current map is being replaced (dirty guard
        // already handled), so switching world set here doesn't need to close it.
        if (targetWorldSet !== activeWorldSetName) await setActiveWorldSet(targetWorldSet);
        loadMap(mapData, mapName, targetWorldSet);
      }
      onClose();
    } catch (e) {
      setError(String(e));
      setIsCreating(false);
    }
  };

  const handleCreate = () => {
    if (!name.trim()) { setError('Map name is required'); return; }
    if (!targetWorldSet) { setError('Create a world set first (Edit → World Sets…)'); return; }
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
          <label>World set</label>
          <select
            value={targetWorldSet}
            onChange={(e) => setTargetWorldSet(e.target.value)}
            disabled={!!onCreated || worldSetNames.length === 0}
          >
            {worldSetNames.length === 0 && <option value="">No world sets yet</option>}
            {worldSetNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <div className="dialog-row">
          <label>Units</label>
          <UnitsSelect value={units} worldSetUnits={worldSetUnits} onChange={setUnits} />
        </div>

        <div className="dialog-row">
          <label>Scale</label>
          <select
            value={scale}
            onChange={(e) => {
              const id = e.target.value;
              setScale(id);
              const preset = MAP_SCALE_BY_ID[id];
              if (preset && !typeChosen) setMapType(preset.defaultShape);
            }}
          >
            {MAP_SCALES.map((s) => (
              <option key={s.id} value={s.id}>{s.label} ({s[units ?? worldSetUnits].unit})</option>
            ))}
          </select>
        </div>

        <div className="dialog-row">
          <label>Type</label>
          <div>
            <label><input type="radio" value="tile" checked={mapType === 'tile'} onChange={() => { setMapType('tile'); setTypeChosen(true); }} /> Square Map</label>
            <label style={{ marginLeft: 16 }}><input type="radio" value="hex" checked={mapType === 'hex'} onChange={() => { setMapType('hex'); setTypeChosen(true); }} /> Hex Map</label>
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
            <label>Hex Side</label>
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
