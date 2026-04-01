/**
 * Map scale presets.
 *
 * To add, remove, or rename a scale level, edit the MAP_SCALES array below.
 * Each entry needs:
 *   id          – stable key stored in the .tmj file (never change once maps exist)
 *   label       – display name shown in the UI
 *   unit        – measurement description shown alongside the label
 *   defaultShape – suggested map type when this scale is selected
 */

export interface MapScale {
  id: string;
  label: string;
  unit: string;
  defaultShape: 'tile' | 'hex';
}

export const MAP_SCALES: MapScale[] = [
  { id: 'room',     label: 'Room Scale',     unit: "1' square",     defaultShape: 'tile' },
  { id: 'building', label: 'Building Scale', unit: "5' square",     defaultShape: 'tile' },
  { id: 'dungeon',  label: 'Dungeon Scale',  unit: "10' square",    defaultShape: 'tile' },
  { id: 'town',     label: 'Town Scale',     unit: "30' hex",       defaultShape: 'hex'  },
  { id: 'local',    label: 'Local Scale',    unit: "1 mile hex",    defaultShape: 'hex'  },
  { id: 'kingdom',  label: 'Kingdom Scale',  unit: "5 mile hex",    defaultShape: 'hex'  },
  { id: 'region',   label: 'Region Scale',   unit: "50 mile hex",   defaultShape: 'hex'  },
  { id: 'world',    label: 'World Scale',    unit: "500 mile hex",  defaultShape: 'hex'  },
];

export const MAP_SCALE_BY_ID = Object.fromEntries(MAP_SCALES.map((s) => [s.id, s]));

/** Returns the full display string, e.g. "Dungeon Scale (10' square)" */
export function scaleLabel(id: string): string {
  const s = MAP_SCALE_BY_ID[id];
  return s ? `${s.label} (${s.unit})` : id;
}
