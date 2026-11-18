/**
 * Line classes for roads and rivers (#6): a class sets a line's default width and
 * how it is drawn. A line stores its class ID as its Tiled object type.
 *
 * The built-in set follows the original world legend's roads (* highway, = major
 * road, - minor road, | small path, . narrow trail) plus common waterways. A world
 * set can replace it with its own list (world set file, `lineClasses`). IDs are
 * stable; names, widths and colours can change without touching the maps.
 */

export type LineKind = 'road' | 'water';

export interface LineClass {
  /** Stable ID, stored as the line's Tiled object type. */
  id: string;
  name: string;
  kind: LineKind;
  /** Default width, meters. */
  widthM: number;
  /** CSS colour. */
  color: string;
}

export const BUILTIN_LINE_CLASSES: LineClass[] = [
  { id: 'highway', name: 'Highway', kind: 'road', widthM: 12, color: '#f5c542' },
  { id: 'major-road', name: 'Major road', kind: 'road', widthM: 8, color: '#f2e2b8' },
  { id: 'minor-road', name: 'Minor road', kind: 'road', widthM: 5, color: '#e8d9b0' },
  { id: 'path', name: 'Path', kind: 'road', widthM: 2, color: '#c9a77c' },
  { id: 'trail', name: 'Trail', kind: 'road', widthM: 1, color: '#a8865e' },
  { id: 'river', name: 'River', kind: 'water', widthM: 20, color: '#3d7fd1' },
  { id: 'stream', name: 'Stream', kind: 'water', widthM: 5, color: '#5b9ae0' },
  { id: 'brook', name: 'Brook', kind: 'water', widthM: 1.5, color: '#7db2ea' },
  { id: 'canal', name: 'Canal', kind: 'water', widthM: 10, color: '#4a8bc9' },
];

/** The class new lines get unless another is chosen. */
export const DEFAULT_LINE_CLASS = 'minor-road';

/** Older generic types (e.g. the Brakka roads, typed "road") and the class they show as. */
const _GENERIC_TYPES: Record<string, string> = { road: 'minor-road', river: 'river', stream: 'stream' };

/** Fallback look for a line whose type matches no class. */
const _UNKNOWN: Omit<LineClass, 'id'> = { name: 'Unclassified', kind: 'road', widthM: 3, color: '#b0b0b0' };

/** The classes in force: the world set's own list, else the built-in one. */
export function resolveLineClasses(worldSetClasses: LineClass[] | undefined): LineClass[] {
  return worldSetClasses && worldSetClasses.length > 0 ? worldSetClasses : BUILTIN_LINE_CLASSES;
}

/**
 * The class for a line's type. A generic type ("road") shows as its usual class but
 * is flagged so the editor can offer to set a real one; an unknown type gets a neutral look.
 */
export function classForType(type: string, classes: LineClass[]): { cls: LineClass; known: boolean } {
  const exact = classes.find((c) => c.id === type);
  if (exact) return { cls: exact, known: true };
  const generic = _GENERIC_TYPES[type.toLowerCase()];
  const viaGeneric = generic ? classes.find((c) => c.id === generic) : undefined;
  if (viaGeneric) return { cls: { ...viaGeneric, id: type }, known: false };
  return { cls: { ..._UNKNOWN, id: type, name: type ? `${type} (no class)` : _UNKNOWN.name }, known: false };
}

/** A new class ID from a name, unique among `classes` (e.g. "Ice road" -> "ice-road"). */
export function newClassId(name: string, classes: LineClass[]): string {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'class';
  const taken = new Set(classes.map((c) => c.id));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}
