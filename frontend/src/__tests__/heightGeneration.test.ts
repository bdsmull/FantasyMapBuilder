import { describe, it, expect } from 'vitest';
import {
  gradientNoise, worldNoise, octaveTerm, noiseScale, mapOriginMeters, generateHeights, reliefSamples, tooCoarse, minWavelengthFor,
} from '../utils/heightGeneration';
import type { GenerationSettings } from '../utils/heightGeneration';
import { createPatch } from '../utils/heightGrid';
import type { TmjMap, TmjTileLayer } from '../types/tmj';
import type { WorldSetNode } from '../types/worldSet';

const square = (w: number, h: number, layers: TmjTileLayer[] = [], tilesets: TmjMap['tilesets'] = []): TmjMap => ({
  orientation: 'orthogonal', width: w, height: h, tilewidth: 16, tileheight: 16,
  nextlayerid: 2, nextobjectid: 1, tilesets, layers,
});
const settings: GenerationSettings = { seed: 1234, featureSizeM: 20_000 };
const node = (mapName: string, parentMapName: string | null, col = 0, row = 0): WorldSetNode => ({
  mapName, parentMapName, parentAnchor: parentMapName ? { col, row } : null, z: 0,
});

describe('noise', () => {
  it('is deterministic, bounded, smooth, and depends on the seed', () => {
    const a = gradientNoise(3.3, 7.1, 5);
    expect(gradientNoise(3.3, 7.1, 5)).toBe(a);
    expect(gradientNoise(3.3, 7.1, 6)).not.toBe(a);
    expect(Math.abs(gradientNoise(3.3001, 7.1, 5) - a)).toBeLessThan(0.01);
    expect(gradientNoise(4, 9, 5)).toBe(0); // zero at lattice points
    let max = 0;
    for (let i = 0; i < 2000; i++) max = Math.max(max, Math.abs(gradientNoise(i * 0.37, i * 0.61, 9)));
    expect(max).toBeLessThanOrEqual(1.0001);
  });

  it('coarse maps get the same large bumps; fine maps only add small ones', () => {
    const coarse = worldNoise(12_345, 67_890, settings, settings.featureSizeM); // one octave
    expect(coarse).toBeCloseTo(octaveTerm(12_345, 67_890, settings, 0) / noiseScale(settings), 12);
    const fine = worldNoise(12_345, 67_890, settings, 1);
    // Every octave after the first together weighs at most 1 (0.5 + 0.25 + ...), before scaling
    expect(Math.abs(fine - coarse)).toBeLessThanOrEqual(1 / noiseScale(settings));
  });

  it('roughness: default 0.5; higher keeps more fine detail; ±1 still holds about 95% of places', () => {
    expect(noiseScale(settings)).toBeCloseTo(0.68, 2);
    expect(worldNoise(5_000, 7_000, settings, 10)).toBe(worldNoise(5_000, 7_000, { ...settings, roughness: 0.5 }, 10));
    // Bumpiness at 10 m spacing on a small (400 m) map
    const bumpiness = (roughness: number) => {
      let sum = 0, n = 0;
      for (let y = 0; y < 400; y += 10) {
        for (let x = 0; x < 400; x += 10) {
          sum += Math.abs(worldNoise(x + 10, y, { ...settings, roughness }, 20) - worldNoise(x, y, { ...settings, roughness }, 20));
          n++;
        }
      }
      return sum / n;
    };
    expect(bumpiness(0.8)).toBeGreaterThan(3 * bumpiness(0.5));
    expect(bumpiness(0.5)).toBeGreaterThan(bumpiness(0.3));
    for (const roughness of [0.3, 0.5, 0.8]) {
      const all: number[] = [];
      for (let i = 0; i < 4000; i++) all.push(worldNoise((i * 7919.3) % 400_000, (i * 104_729.7) % 400_000, { ...settings, roughness }, 20));
      const inside = all.filter((v) => Math.abs(v) <= 1).length / all.length;
      expect(inside).toBeGreaterThan(0.9);
      expect(inside).toBeLessThan(0.99);
    }
  });

  it('varies near the world origin too, and about 95% of places stay within ±1', () => {
    const near: number[] = [];
    for (let x = 0; x <= 3000; x += 250) for (let y = 0; y <= 2000; y += 250) near.push(worldNoise(x, y, settings, 200));
    expect(Math.max(...near) - Math.min(...near)).toBeGreaterThan(0.2);
    const all: number[] = [];
    for (let i = 0; i < 4000; i++) all.push(worldNoise((i * 7919.3) % 400_000, (i * 104_729.7) % 400_000, settings, 200));
    const inside = all.filter((v) => Math.abs(v) <= 1).length / all.length;
    expect(inside).toBeGreaterThan(0.9);
    expect(inside).toBeLessThan(0.99);
  });
});

describe('mapOriginMeters', () => {
  it('chains placements up to the root; unplaced maps are their own origin', () => {
    // Root 10 x 10 cells of 100 m; child 20 x 20 of 10 m (2 x 2 root cells) at (5, 5): cells [4, 6] -> 400 m
    // Grandchild 10 x 10 of 2 m (2 x 2 child cells) at child cell (3, 3): child cells [2, 4] -> 20 m more
    const maps: Record<string, { map: TmjMap; mpu: number }> = {
      root: { map: square(10, 10), mpu: 100 },
      child: { map: square(20, 20), mpu: 10 },
      grand: { map: square(10, 10), mpu: 2 },
      loose: { map: square(5, 5), mpu: 1 },
    };
    const nodes = [node('root', null), node('child', 'root', 5, 5), node('grand', 'child', 3, 3), node('loose', null)];
    const lookup = (n: string) => maps[n];
    expect(mapOriginMeters('root', nodes, lookup)).toEqual({ x: 0, y: 0 });
    expect(mapOriginMeters('child', nodes, lookup)).toEqual({ x: 400, y: 400 });
    expect(mapOriginMeters('grand', nodes, lookup)).toEqual({ x: 420, y: 420 });
    expect(mapOriginMeters('loose', nodes, lookup)).toEqual({ x: 0, y: 0 });
    expect(mapOriginMeters('missing', nodes, lookup)).toEqual({ x: 0, y: 0 });
  });
});

describe('generateHeights', () => {
  const opts = { settings, mpu: 100, origin: { x: 0, y: 0 }, strength: 1, fallbackReliefCm: 10_000 };

  it('adds detail on top of the current heights, keeping hand-set ones', () => {
    const map = square(20, 20);
    const patch = createPatch(map, 5000);
    patch.mask[7] = 1;
    const { cm, changed } = generateHeights(map, patch, opts);
    expect(changed).toBeGreaterThan(400);
    expect(cm[7]).toBe(5000);
    expect(Math.max(...Array.from(cm).map((v) => Math.abs(v - 5000)))).toBeLessThanOrEqual(25_000); // rare extremes reach ~2x relief
    expect(patch.cm[0]).toBe(5000); // the input is not modified
  });

  it('strength scales the detail; no relief changes nothing', () => {
    const map = square(10, 10);
    const full = generateHeights(map, createPatch(map, 0), opts).cm;
    const half = generateHeights(map, createPatch(map, 0), { ...opts, strength: 0.5 }).cm;
    for (let i = 0; i < full.length; i++) expect(Math.abs(half[i] - full[i] / 2)).toBeLessThanOrEqual(1);
    expect(generateHeights(map, createPatch(map, 0), { ...opts, fallbackReliefCm: 0 }).changed).toBe(0);
  });

  it('a parent and a child generated separately agree where they overlap', () => {
    // Parent: 100 m cells. Child: 10 m cells, origin 400 m east and south of the parent's
    const parent = square(10, 10), child = square(20, 20);
    const p = generateHeights(parent, createPatch(parent, 0), opts).cm;
    const c = generateHeights(child, createPatch(child, 0), { ...opts, mpu: 10, origin: { x: 400, y: 400 } }).cm;
    // Parent corner (5, 5) is at 500 m: the child's corner (10, 10)
    const fromParent = p[5 * 11 + 5], fromChild = c[10 * 21 + 10];
    // The child only adds octaves of 156 m and shorter (weight 0.0137 / 0.68 of the relief at most)
    expect(Math.abs(fromChild - fromParent)).toBeLessThanOrEqual(205);
    // A different seed (or a separately seeded map) would not match
    const other = generateHeights(parent, createPatch(parent, 0), { ...opts, settings: { ...settings, seed: 99 } }).cm;
    expect(Math.abs(other[5 * 11 + 5] - fromParent)).toBeGreaterThan(205);
  });
});

describe('relief', () => {
  it('comes from terrain types, with the fallback elsewhere', () => {
    const tileset = {
      firstgid: 1, name: 'T', tilewidth: 16, tileheight: 16, tilecount: 1, columns: 1, image: '',
      tiles: [{ id: 0, type: 'Mountains', properties: [
        { name: 'heightBase', type: 'float' as const, value: 2000 }, { name: 'heightRelief', type: 'float' as const, value: 800 },
      ] }],
    };
    const layer: TmjTileLayer = { type: 'tilelayer', id: 1, name: 'G', width: 4, height: 1, visible: true, opacity: 1, offsetx: 0, offsety: 0, data: [1, 1, 0, 0] };
    const map = square(4, 1, [layer], [tileset]);
    const { reliefCm, fromTerrain } = reliefSamples(map, 5, 2, 0);
    expect(fromTerrain).toBe(6); // corners touching the two mountain cells
    expect(reliefCm[0]).toBeGreaterThan(reliefCm[4]); // fades towards the bare end
    expect(reliefCm[4]).toBeGreaterThanOrEqual(0);
  });

  it('knows when a map is too coarse for the feature size', () => {
    expect(minWavelengthFor(100)).toBe(200);
    expect(tooCoarse(settings, 100_000)).toBe(true);
    expect(tooCoarse(settings, 100)).toBe(false);
  });
});
