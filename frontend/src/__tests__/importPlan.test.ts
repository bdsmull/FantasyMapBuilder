import { describe, it, expect } from 'vitest';
import { describeClash, defaultChoices, suggestedName } from '../utils/importPlan';
import type { MapImportPlan } from '../api/client';

const plan = (overrides: Partial<MapImportPlan> = {}): MapImportPlan => ({
  map: 'nauram-town', mapExists: false, unitsPinned: null,
  tilesets: [
    { name: 'Default Tile', status: 'identical' },
    { name: 'Nauram Town', status: 'conflict', canMerge: true },
    { name: 'Art', status: 'conflict', canMerge: false },
    { name: 'New', status: 'new' },
  ],
  ...overrides,
});

describe('defaultChoices', () => {
  it('merges where possible, otherwise keeps both; only for conflicts', () => {
    expect(defaultChoices(plan())).toEqual({ 'Nauram Town': 'merge', Art: 'keep_both' });
  });
});

describe('suggestedName', () => {
  it("keeps the map's name when it's free", () => {
    expect(suggestedName(plan(), 'Brakka')).toBe('nauram-town');
  });
  it('adds the source when the name is taken', () => {
    expect(suggestedName(plan({ mapExists: true }), 'Brakka')).toBe('nauram-town (Brakka)');
  });
});

describe('describeClash', () => {
  it('summarizes same, different and extra tiles', () => {
    expect(describeClash({
      targetTiles: 2, importedTiles: 3, sameTiles: 1,
      differingTiles: [{ id: 1, target: 'Sea', imported: 'Lava' }],
      onlyImported: [2],
    })).toBe(
      "This world set's version has 2 tiles, the imported one 3: 1 same, " +
      '1 different (#1: "Sea" here vs "Lava" imported), 1 only in the imported one.',
    );
  });

  it('lists at most three differing tiles', () => {
    const differing = [0, 1, 2, 3, 4].map((id) => ({ id, target: `T${id}`, imported: `I${id}` }));
    const text = describeClash({ targetTiles: 5, importedTiles: 5, sameTiles: 0, differingTiles: differing, onlyImported: [] });
    expect(text).toContain('#2: "T2" here vs "I2" imported; +2 more');
    expect(text).not.toContain('#3');
  });
});
