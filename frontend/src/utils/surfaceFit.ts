/**
 * Fitting the height surface to known heights (#8 phases 3c and 3d): spot heights
 * (single points) and contour lines (points every half cell along the line).
 *
 * The current surface is kept and bent by a smooth correction that passes through
 * every known height (to the centimetre at spots; within a few centimetres along
 * tightly curving contours, which a grid of heights can't follow exactly). The correction is the smoothest one (least curvature, a
 * thin-plate fit) that is zero beyond each mark's reach, so it fades out smoothly at
 * the edge of the reach. Between contours closer than twice their reach the ground
 * rises evenly from one to the next. Hand-set heights are kept.
 *
 * The correction is solved on a lattice in cell space with one node per whole cell
 * position: on square maps the nodes are the height samples themselves; hex samples
 * read it bilinearly, and a known height is read through the hex samples around it,
 * just as the map interpolates heights. It's solved coarse to fine (each level starts from the coarser
 * level's answer, so a few conjugate-gradient iterations per level do even on large
 * maps). Each round then re-measures what's left at the marks through the map's own
 * interpolation and corrects again.
 */

import type { TmjMap } from '../types/tmj';
import type { HeightPatch } from './heightGrid';
import { heightAt, hexHeightWeights } from './heightGrid';
import { pixelToCell, sampleCell } from './worldSurface';
import { joinSeam, mod, withWrap, wrapPeriodPx, wrapsX } from './worldWrap';

/** A height (cm) the surface should pass through at a map pixel, pulling within `reachCells`. */
export interface KnownHeight {
  x: number;
  y: number;
  cm: number;
  reachCells: number;
}

export interface FitResult {
  cm: Int32Array;
  /** Samples that moved. */
  changed: number;
  /** Largest remaining difference at a known height (cm), e.g. where hand-set heights hold the surface. */
  maxMissCm: number;
}

/** How strongly the known heights hold against smoothness (rounds take care of the rest). */
const _WEIGHT = 1e4;
/** Keeps the system well posed when no node is held at zero (reach covering the whole map). */
const _RIDGE = 1e-6;
const _ROUNDS = 4;
/** Levels are halved until both sides have at most this many nodes. */
const _COARSEST = 24;
/** Heights are whole centimetres, so a known height can't be met much closer than this. */
const _CLOSE_ENOUGH_CM = 1;
/**
 * Conjugate-gradient iterations on a finer level: small lattices are cheap, so they
 * get plenty; large ones start close to the answer from the coarser level, so a few do.
 */
const _fineIterations = (nodes: number) => Math.max(25, Math.min(400, Math.round(1e7 / nodes)));
/** Lattice entries per known height: up to 3 samples (a hex triangle), each read from 4 nodes. */
const _STRIDE = 12;

/** Where a known height reads the lattice from: positions (relative to the lattice origin) and weights. */
type _Reads = { u: number; v: number; w: number }[];

interface _Level {
  /** Node spacing, in cells. */
  h: number;
  nx: number;
  ny: number;
  /** 1 where the correction may change (within reach, not held by a hand-set height). */
  free: Uint8Array;
  /** Per known height: _STRIDE node indices and weights (unused entries have weight 0). */
  idx: Int32Array;
  w: Float64Array;
  /** Inverse of the system's diagonal (0 at fixed nodes): the preconditioner. */
  invDiag: Float64Array;
}

function _bilinear(lu: number, lv: number, nx: number, ny: number) {
  const fu = Math.min(Math.max(lu, 0), nx - 1), fv = Math.min(Math.max(lv, 0), ny - 1);
  const i0 = Math.min(Math.floor(fu), Math.max(nx - 2, 0)), j0 = Math.min(Math.floor(fv), Math.max(ny - 2, 0));
  const i1 = Math.min(i0 + 1, nx - 1), j1 = Math.min(j0 + 1, ny - 1);
  const tx = fu - i0, ty = fv - j0;
  return {
    idx: [j0 * nx + i0, j0 * nx + i1, j1 * nx + i0, j1 * nx + i1],
    w: [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty],
  };
}

function _degree(i: number, j: number, nx: number, ny: number): number {
  return (i > 0 ? 1 : 0) + (i < nx - 1 ? 1 : 0) + (j > 0 ? 1 : 0) + (j < ny - 1 ? 1 : 0);
}

/** Graph Laplacian of a lattice field (Neumann at the lattice's sides). */
function _laplacian(x: Float64Array, out: Float64Array, nx: number, ny: number): void {
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      let s = 0, d = 0;
      if (i > 0) { s += x[k - 1]; d++; }
      if (i < nx - 1) { s += x[k + 1]; d++; }
      if (j > 0) { s += x[k - nx]; d++; }
      if (j < ny - 1) { s += x[k + nx]; d++; }
      out[k] = s - d * x[k];
    }
  }
}

/** out = A x, with A = (L L) / h² + W Σ a aᵀ + ridge, restricted to free nodes. */
function _apply(L: _Level, x: Float64Array, out: Float64Array, tmp: Float64Array): void {
  const { nx, ny, free, idx, w } = L;
  const s = 1 / (L.h * L.h);
  _laplacian(x, tmp, nx, ny);
  _laplacian(tmp, out, nx, ny);
  for (let k = 0; k < out.length; k++) out[k] *= s;
  for (let p = 0; p < idx.length; p += _STRIDE) {
    let v = 0;
    for (let q = 0; q < _STRIDE; q++) v += w[p + q] * x[idx[p + q]];
    for (let q = 0; q < _STRIDE; q++) out[idx[p + q]] += _WEIGHT * w[p + q] * v;
  }
  for (let k = 0; k < out.length; k++) out[k] = free[k] ? out[k] + _RIDGE * x[k] : 0;
}

const _dot = (a: Float64Array, b: Float64Array) => {
  let s = 0;
  for (let k = 0; k < a.length; k++) s += a[k] * b[k];
  return s;
};

/** Preconditioned conjugate gradients, starting from x (updated in place). */
function _pcg(L: _Level, x: Float64Array, b: Float64Array, maxIter: number, tol: number): void {
  const n = x.length;
  const r = new Float64Array(n), z = new Float64Array(n), p = new Float64Array(n);
  const Ap = new Float64Array(n), tmp = new Float64Array(n);
  _apply(L, x, Ap, tmp);
  for (let k = 0; k < n; k++) r[k] = b[k] - Ap[k];
  const bNorm = Math.sqrt(_dot(b, b));
  if (bNorm === 0) { x.fill(0); return; }
  for (let k = 0; k < n; k++) { z[k] = r[k] * L.invDiag[k]; p[k] = z[k]; }
  let rz = _dot(r, z);
  for (let it = 0; it < maxIter; it++) {
    if (Math.sqrt(_dot(r, r)) <= tol * bNorm) break;
    _apply(L, p, Ap, tmp);
    const pAp = _dot(p, Ap);
    if (pAp <= 0) break;
    const alpha = rz / pAp;
    for (let k = 0; k < n; k++) { x[k] += alpha * p[k]; r[k] -= alpha * Ap[k]; }
    for (let k = 0; k < n; k++) z[k] = r[k] * L.invDiag[k];
    const rzNext = _dot(r, z);
    const beta = rzNext / rz;
    rz = rzNext;
    for (let k = 0; k < n; k++) p[k] = z[k] + beta * p[k];
  }
}

function _withData(level: Omit<_Level, 'idx' | 'w' | 'invDiag'>, reads: _Reads[]): _Level {
  const { nx, ny, h, free } = level;
  const idx = new Int32Array(reads.length * _STRIDE), w = new Float64Array(reads.length * _STRIDE);
  const invDiag = new Float64Array(nx * ny);
  reads.forEach((rs, k) => {
    rs.forEach((r, n) => {
      const b = _bilinear(r.u / h, r.v / h, nx, ny);
      for (let q = 0; q < 4; q++) { idx[k * _STRIDE + n * 4 + q] = b.idx[q]; w[k * _STRIDE + n * 4 + q] = r.w * b.w[q]; }
    });
  });
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const d = _degree(i, j, nx, ny);
      invDiag[j * nx + i] = (d * d + d) / (h * h) + _RIDGE;
    }
  }
  for (let p = 0; p < idx.length; p++) invDiag[idx[p]] += _WEIGHT * w[p] * w[p];
  for (let k = 0; k < invDiag.length; k++) invDiag[k] = free[k] ? 1 / invDiag[k] : 0;
  return { ...level, idx, w, invDiag };
}

/** The lattice levels, finest first. */
function _levels(nx: number, ny: number, free: Uint8Array, reads: _Reads[]): _Level[] {
  const out = [_withData({ h: 1, nx, ny, free }, reads)];
  let cur = out[0];
  while (Math.max(cur.nx, cur.ny) > _COARSEST) {
    const cx = Math.ceil((cur.nx - 1) / 2) + 1, cy = Math.ceil((cur.ny - 1) / 2) + 1;
    const cf = new Uint8Array(cx * cy);
    // A coarse node is free when any fine node around it is
    for (let j = 0; j < cy; j++) {
      for (let i = 0; i < cx; i++) {
        let f = 0;
        for (let dj = -1; dj <= 1 && !f; dj++) {
          for (let di = -1; di <= 1 && !f; di++) {
            const fi = 2 * i + di, fj = 2 * j + dj;
            if (fi >= 0 && fj >= 0 && fi < cur.nx && fj < cur.ny && cur.free[fj * cur.nx + fi]) f = 1;
          }
        }
        cf[j * cx + i] = f;
      }
    }
    cur = _withData({ h: cur.h * 2, nx: cx, ny: cy, free: cf }, reads);
    out.push(cur);
  }
  return out;
}

/** Bilinear prolongation from a coarse level to the next finer one (fixed nodes stay zero). */
function _prolong(coarse: _Level, cx: Float64Array, fine: _Level): Float64Array {
  const x = new Float64Array(fine.nx * fine.ny);
  for (let j = 0; j < fine.ny; j++) {
    for (let i = 0; i < fine.nx; i++) {
      const k = j * fine.nx + i;
      if (!fine.free[k]) continue;
      const b = _bilinear(i / 2, j / 2, coarse.nx, coarse.ny);
      x[k] = b.w[0] * cx[b.idx[0]] + b.w[1] * cx[b.idx[1]] + b.w[2] * cx[b.idx[2]] + b.w[3] * cx[b.idx[3]];
    }
  }
  return x;
}

/** The smooth correction on the finest lattice that meets `residual` at the known heights. */
function _solve(levels: _Level[], residual: Float64Array): Float64Array {
  let x: Float64Array | null = null;
  for (let l = levels.length - 1; l >= 0; l--) {
    const L = levels[l];
    const b = new Float64Array(L.nx * L.ny);
    for (let p = 0; p < L.idx.length; p++) b[L.idx[p]] += _WEIGHT * L.w[p] * residual[Math.floor(p / _STRIDE)];
    for (let k = 0; k < b.length; k++) if (!L.free[k]) b[k] = 0;
    x = x ? _prolong(levels[l + 1], x, L) : new Float64Array(L.nx * L.ny);
    const coarsest = l === levels.length - 1;
    _pcg(L, x, b, coarsest ? 2000 : _fineIterations(b.length), coarsest ? 1e-9 : 1e-6);
  }
  return x!;
}

/**
 * Bend the surface so it passes through every known height. On a wrapped map (#36) the
 * fit reaches across the seam: it's made on the map unrolled a little past both edges, with
 * the marks near each edge repeated beyond the other.
 */
export function fitHeights(map: TmjMap, patch: HeightPatch, known: KnownHeight[]): FitResult {
  if (!wrapsX(map) || known.length === 0) return _fit(map, patch, known);
  const W = map.width, period = wrapPeriodPx(map), hex = map.orientation === 'hexagonal';
  // Far enough for reaches that overlap across the seam; even, so flat-topped hexes keep their stagger
  const reach = Math.ceil(Math.max(...known.map((k) => k.reachCells)));
  const pad = Math.min(W + (W % 2), 2 * Math.ceil((3 * reach + 2) / 2));
  const shift = (pad * period) / W;
  const wide: TmjMap = { ...map, width: W + 2 * pad, properties: withWrap(map.properties, false) };
  const cols = wide.width + (hex ? 0 : 1);
  const margin = (reach * period) / W;
  const copies = known.flatMap((k) => [-1, 0, 1].map((t) => ({ ...k, x: k.x + shift + t * period })))
    .filter((k) => k.x > -margin && k.x < (wide.width * period) / W + margin);
  let cm = patch.cm;
  let best: FitResult | null = null;
  // The two sides are solved apart and agree closely; joining them can move a mark at the
  // seam by a little, so fit what's left again
  for (let round = 0; round < _ROUNDS; round++) {
    const roll = { cols, rows: patch.rows, cm: new Int32Array(cols * patch.rows), mask: new Uint8Array(cols * patch.rows) };
    for (let row = 0; row < patch.rows; row++) {
      for (let col = 0; col < cols; col++) {
        const from = row * patch.cols + mod(col - pad, W);
        roll.cm[row * cols + col] = cm[from];
        roll.mask[row * cols + col] = patch.mask[from];
      }
    }
    const fit = _fit(wide, roll, copies);
    const next = patch.cm.slice();
    for (let row = 0; row < patch.rows; row++) {
      for (let col = 0; col < patch.cols; col++) next[row * patch.cols + col] = fit.cm[row * cols + col + pad];
    }
    joinSeam(map, next, null, patch.cols);
    let maxMissCm = 0, changed = 0;
    for (const k of known) maxMissCm = Math.max(maxMissCm, Math.abs(k.cm - heightAt(map, { ...patch, cm: next }, k.x, k.y)));
    for (let i = 0; i < next.length; i++) if (next[i] !== patch.cm[i]) changed++;
    if (best && maxMissCm > best.maxMissCm * 0.9) break;
    best = { cm: next, changed, maxMissCm };
    if (maxMissCm < _CLOSE_ENOUGH_CM) break;
    cm = next;
  }
  return best!;
}

function _fit(map: TmjMap, patch: HeightPatch, known: KnownHeight[]): FitResult {
  const { cols, rows } = patch;
  const out = patch.cm.slice();
  if (known.length === 0) return { cm: out, changed: 0, maxMissCm: 0 };
  const hex = map.orientation === 'hexagonal';

  // Where the samples are, in cell space
  const su = new Float64Array(cols * rows), sv = new Float64Array(cols * rows);
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const s = sampleCell(map, col, row);
      const k = row * cols + col;
      su[k] = s.u; sv[k] = s.v;
      minU = Math.min(minU, s.u); maxU = Math.max(maxU, s.u);
      minV = Math.min(minV, s.v); maxV = Math.max(maxV, s.v);
    }
  }

  // The lattice: every whole cell position within reach of a known height, inside the samples' extent
  const at = known.map((k) => pixelToCell(map, k.x, k.y));
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  known.forEach((k, i) => {
    u0 = Math.min(u0, at[i].u - k.reachCells); u1 = Math.max(u1, at[i].u + k.reachCells);
    v0 = Math.min(v0, at[i].v - k.reachCells); v1 = Math.max(v1, at[i].v + k.reachCells);
  });
  u0 = Math.max(Math.floor(u0), Math.floor(minU)); u1 = Math.min(Math.ceil(u1), Math.ceil(maxU));
  v0 = Math.max(Math.floor(v0), Math.floor(minV)); v1 = Math.min(Math.ceil(v1), Math.ceil(maxV));
  if (u1 < u0 || v1 < v0) return { cm: out, changed: 0, maxMissCm: 0 };
  const nx = u1 - u0 + 1, ny = v1 - v0 + 1;
  const rel = at.map((a) => ({ u: a.u - u0, v: a.v - v0 }));

  const free = new Uint8Array(nx * ny);
  known.forEach((k, n) => {
    const R = k.reachCells, a = rel[n];
    for (let j = Math.max(0, Math.ceil(a.v - R)); j <= Math.min(ny - 1, Math.floor(a.v + R)); j++) {
      for (let i = Math.max(0, Math.ceil(a.u - R)); i <= Math.min(nx - 1, Math.floor(a.u + R)); i++) {
        if (Math.hypot(i - a.u, j - a.v) < R) free[j * nx + i] = 1;
      }
    }
  });
  // Hand-set heights hold the lattice nodes they read from, so the fit bends around them
  for (let k = 0; k < out.length; k++) {
    if (!patch.mask[k]) continue;
    const lu = su[k] - u0, lv = sv[k] - v0;
    if (lu < -1 || lv < -1 || lu > nx || lv > ny) continue;
    if (!hex) { if (lu >= 0 && lv >= 0 && lu < nx && lv < ny) free[Math.round(lv) * nx + Math.round(lu)] = 0; continue; }
    for (const i of [Math.floor(lu), Math.ceil(lu)]) {
      for (const j of [Math.floor(lv), Math.ceil(lv)]) if (i >= 0 && j >= 0 && i < nx && j < ny) free[j * nx + i] = 0;
    }
  }
  // Square maps read heights bilinearly from the samples (the lattice nodes); hex maps
  // from a triangle of hex samples, each of which reads the lattice bilinearly
  const reads: _Reads[] = known.map((k, n) => (hex
    ? hexHeightWeights(map, k.x, k.y).map((s) => ({ u: su[s.row * cols + s.col] - u0, v: sv[s.row * cols + s.col] - v0, w: s.w }))
    : [{ ...rel[n], w: 1 }]));
  const levels = _levels(nx, ny, free, reads);

  // Rounds: measure what's left at the known heights, solve a correction, apply it
  const total = new Float64Array(out.length);
  const working = { cols, rows, cm: out, mask: patch.mask };
  const missAt = () => {
    const r = new Float64Array(known.length);
    let max = 0;
    known.forEach((k, i) => { r[i] = k.cm - heightAt(map, working, k.x, k.y); max = Math.max(max, Math.abs(r[i])); });
    return { r, max };
  };
  let miss = missAt();
  for (let round = 0; round < _ROUNDS && miss.max >= _CLOSE_ENOUGH_CM; round++) {
    const d = _solve(levels, miss.r);
    for (let k = 0; k < out.length; k++) {
      if (patch.mask[k]) continue;
      const lu = su[k] - u0, lv = sv[k] - v0;
      if (lu < 0 || lv < 0 || lu > nx - 1 || lv > ny - 1) continue;
      const b = _bilinear(lu, lv, nx, ny);
      const c = b.w[0] * d[b.idx[0]] + b.w[1] * d[b.idx[1]] + b.w[2] * d[b.idx[2]] + b.w[3] * d[b.idx[3]];
      if (c === 0) continue;
      total[k] += c;
      out[k] = Math.max(-2_147_483_648, Math.min(2_147_483_647, Math.round(patch.cm[k] + total[k])));
    }
    const next = missAt();
    // Stop when a round barely helps (hand-set heights holding the surface, say)
    if (next.max > miss.max * 0.9) { miss = next; break; }
    miss = next;
  }
  let changed = 0;
  for (let k = 0; k < out.length; k++) if (out[k] !== patch.cm[k]) changed++;
  return { cm: out, changed, maxMissCm: miss.max };
}
