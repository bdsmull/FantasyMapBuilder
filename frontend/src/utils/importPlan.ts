/**
 * Pure helpers for the Import Map dialog: describing a tileset clash and
 * choosing sensible defaults.
 */

import type { MapImportPlan, TilesetChoice, TilesetImportPlan } from '../api/client';

/** One-line description of how two same-named tilesets differ. */
export function describeClash(summary: NonNullable<TilesetImportPlan['summary']>): string {
  const parts = [`${summary.sameTiles} same`];
  if (summary.differingTiles.length > 0) {
    const examples = summary.differingTiles
      .slice(0, 3)
      .map((d) => `#${d.id}: "${d.target}" here vs "${d.imported}" imported`)
      .join('; ');
    const more = summary.differingTiles.length > 3 ? `; +${summary.differingTiles.length - 3} more` : '';
    parts.push(`${summary.differingTiles.length} different (${examples}${more})`);
  }
  if (summary.onlyImported.length > 0) parts.push(`${summary.onlyImported.length} only in the imported one`);
  return `This world set's version has ${summary.targetTiles} tiles, the imported one ${summary.importedTiles}: ${parts.join(', ')}.`;
}

/** Default choice per conflicting tileset: merge where possible, otherwise keep both. */
export function defaultChoices(plan: MapImportPlan): Record<string, TilesetChoice> {
  const choices: Record<string, TilesetChoice> = {};
  for (const t of plan.tilesets) {
    if (t.status === 'conflict') choices[t.name] = t.canMerge ? 'merge' : 'keep_both';
  }
  return choices;
}

/** Name to import the map under: its own, unless it's taken. */
export function suggestedName(plan: MapImportPlan, sourceLabel: string): string {
  return plan.mapExists ? `${plan.map} (${sourceLabel})` : plan.map;
}
