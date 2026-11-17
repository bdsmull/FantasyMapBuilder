/**
 * Generated height detail (#8 phase 3b).
 *
 * "Generate" adds natural-looking detail on top of a map's current heights. How
 * rugged each place gets is its terrain type's relief (blended across boundaries,
 * as in 3a), with a fallback for places without one. Hand-set heights are kept.
 *
 * The detail is world-anchored: it is a single noise field over the whole world
 * set, positioned in meters from the root map's top-left corner, with the seed and
 * largest feature size stored in the world set. A place gets the same bumps on a
 * province map and on the town map inside it; each map only includes the bumps its
 * cells are big enough to show (wavelengths of at least two cells).
 *
 * Noise: 2D gradient (Perlin) noise, summed over octaves whose wavelength halves
 * each step while the amplitude keeps a share set by the world set's roughness
 * (fBm; 0.5 by default). The sum is scaled by a fixed factor (not by
 * the octaves present), so leaving out the fine ones on coarse maps doesn't change
 * the rest. About 95% of places then vary by up to ±relief.
 */

import type { TmjMap } from '../types/tmj';
import type { WorldSetNode } from '../types/worldSet';
import type { HeightPatch } from './heightGrid';
import { placeChild, sampleCell } from './worldSurface';
import { terrainSamples, smoothSamples } from './terrainHeights';

/** World set generation settings. */
export interface GenerationSettings {
  seed: number;
  /** Wavelength of the largest bumps, meters. */
  featureSizeM: number;
  /**
   * How much of each octave's amplitude the next (half-size) octave keeps, 0.3-0.8.
   * Higher = more fine detail (rugged); lower = smoother. Absent = 0.5.
   */
  roughness?: number;
}

export const DEFAULT_FEATURE_SIZE_M = 20_000;
export const DEFAULT_ROUGHNESS = 0.5;
export const MIN_ROUGHNESS = 0.3;
export const MAX_ROUGHNESS = 0.8;

const _roughness = (s: GenerationSettings) =>
  Math.min(MAX_ROUGHNESS, Math.max(MIN_ROUGHNESS, s.roughness ?? DEFAULT_ROUGHNESS));

/** A new random seed (31-bit, so it round-trips through JSON and int math). */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

// ---------------------------------------------------------------------------
// Noise
// ---------------------------------------------------------------------------

function _hash(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

const _fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

function _grad(ix: number, iy: number, seed: number, dx: number, dy: number): number {
  const a = (_hash(ix, iy, seed) / 4294967296) * Math.PI * 2;
  return Math.cos(a) * dx + Math.sin(a) * dy;
}

/** Gradient noise at (x, y) in lattice units, roughly in [-1, 1]. */
export function gradientNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const u = _fade(fx), v = _fade(fy);
  const n00 = _grad(x0, y0, seed, fx, fy);
  const n10 = _grad(x0 + 1, y0, seed, fx - 1, fy);
  const n01 = _grad(x0, y0 + 1, seed, fx, fy - 1);
  const n11 = _grad(x0 + 1, y0 + 1, seed, fx - 1, fy - 1);
  const nx0 = n00 + (n10 - n00) * u, nx1 = n01 + (n11 - n01) * u;
  return (nx0 + (nx1 - nx0) * v) * Math.SQRT2;
}

/** Smallest wavelength used at all (meters). */
const _MIN_WAVELENGTH_M = 1;

/** Standard deviation of one octave of gradientNoise (measured). */
const _OCTAVE_SD = 0.3;

/**
 * Scale for the fBm sum so about 95% of places fall within [-1, 1] at any roughness:
 * 1.96 standard deviations of the sum over all octaves, whose variance is
 * sd² × (1 + r² + r⁴ + ...) = sd² / (1 − r²). Based on all octaves, not the ones a map
 * includes, so coarse and fine maps agree. (At r = 0.5 this is about 0.68.)
 */
export function noiseScale(settings: GenerationSettings): number {
  const r = _roughness(settings);
  return 1.96 * _OCTAVE_SD / Math.sqrt(1 - r * r);
}

/**
 * Octave `octave`'s term (amplitude included) at (x, y) meters. Each octave is shifted
 * by its own seed-derived offset, so no map sits on a point where every octave is zero.
 */
export function octaveTerm(x: number, y: number, settings: GenerationSettings, octave: number): number {
  const lambda = settings.featureSizeM / 2 ** octave;
  const seed = settings.seed + octave * 1013;
  const ox = (_hash(octave, 1, seed) / 4294967296) * 997;
  const oy = (_hash(octave, 2, seed) / 4294967296) * 997;
  return _roughness(settings) ** octave * gradientNoise(x / lambda + ox, y / lambda + oy, seed);
}

/**
 * World-anchored fBm at (x, y) meters: octaves from `featureSizeM` down to
 * `minWavelengthM`. About 95% of values lie in [-1, 1]; the same point gives the
 * same coarse octaves whatever `minWavelengthM` is.
 */
export function worldNoise(x: number, y: number, settings: GenerationSettings, minWavelengthM: number): number {
  let sum = 0;
  const floor = Math.max(minWavelengthM, _MIN_WAVELENGTH_M);
  for (let octave = 0; settings.featureSizeM / 2 ** octave >= floor && octave < 40; octave++) {
    sum += octaveTerm(x, y, settings, octave);
  }
  return sum / noiseScale(settings);
}

// ---------------------------------------------------------------------------
// Where a map sits in the world
// ---------------------------------------------------------------------------

/** What's needed to place a map: its data and cell size (meters). */
export interface PlacedMapSource {
  map: TmjMap;
  mpu: number;
}

/**
 * Position (meters) of a map's top-left corner, measured from the root of its
 * branch of the world set: each map sits where computeFootprint/placeChild puts it on
 * its parent. Maps without a parent (or with one that can't be placed) are their own origin.
 */
export function mapOriginMeters(
  name: string, nodes: WorldSetNode[], lookup: (name: string) => PlacedMapSource | undefined,
  seen: Set<string> = new Set(),
): { x: number; y: number } {
  const node = nodes.find((n) => n.mapName === name);
  const self = lookup(name);
  if (!node?.parentMapName || !node.parentAnchor || !self || seen.has(name)) return { x: 0, y: 0 };
  const parent = lookup(node.parentMapName);
  if (!parent) return { x: 0, y: 0 };
  const place = placeChild(self.map.width, self.map.height, self.mpu, parent.mpu, node.parentAnchor);
  const o = mapOriginMeters(node.parentMapName, nodes, lookup, new Set([...seen, name]));
  return { x: o.x + place.left * parent.mpu, y: o.y + place.top * parent.mpu };
}

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  settings: GenerationSettings;
  /** The map's cell size, meters. */
  mpu: number;
  /** The map's top-left corner in world meters. */
  origin: { x: number; y: number };
  /** Multiplier on the relief (1 = as set). */
  strength: number;
  /** Relief (cm) where the terrain sets none. */
  fallbackReliefCm: number;
}

/** Relief (cm) per sample: from terrain types, smoothed across boundaries, else the fallback. */
export function reliefSamples(map: TmjMap, cols: number, rows: number, fallbackCm: number): { reliefCm: Float64Array; fromTerrain: number } {
  const { values, has } = terrainSamples(map, cols, rows, (t) => t.reliefCm);
  let fromTerrain = 0;
  for (let i = 0; i < values.length; i++) {
    if (has[i]) fromTerrain++;
    else values[i] = fallbackCm;
  }
  // Smooth everywhere so relief fades in and out at terrain edges
  smoothSamples(map, cols, rows, values, new Uint8Array(values.length).fill(1));
  return { reliefCm: values, fromTerrain };
}

/** The shortest wavelength a map can show: two cells. */
export const minWavelengthFor = (mpu: number) => 2 * mpu;

/**
 * The patch's heights with generated detail added. Hand-set samples are kept.
 * `changed` counts samples that moved.
 */
export function generateHeights(map: TmjMap, patch: HeightPatch, opts: GenerateOptions): { cm: Int32Array; changed: number } {
  const { cols, rows } = patch;
  const { reliefCm } = reliefSamples(map, cols, rows, opts.fallbackReliefCm);
  const minWave = minWavelengthFor(opts.mpu);
  const out = patch.cm.slice();
  let changed = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      if (patch.mask[i]) continue;
      const amp = reliefCm[i] * opts.strength;
      if (amp === 0) continue;
      const { u, v } = sampleCell(map, col, row);
      const n = worldNoise(opts.origin.x + u * opts.mpu, opts.origin.y + v * opts.mpu, opts.settings, minWave);
      const next = Math.max(-2_147_483_648, Math.min(2_147_483_647, Math.round(out[i] + n * amp)));
      if (next !== out[i]) { out[i] = next; changed++; }
    }
  }
  return { cm: out, changed };
}

/** True when the map's cells are too coarse to show any of the generated detail. */
export function tooCoarse(settings: GenerationSettings, mpu: number): boolean {
  return settings.featureSizeM < minWavelengthFor(mpu);
}
