import { describe, it, expect, beforeEach } from 'vitest';
import {
  BUILTIN_LINE_CLASSES, classForType, newClassId, resolveLineClasses,
} from '../data/lineClasses';
import {
  linePoints, toPolyline, readWidths, writeWidths, nearestOnLine, insertPoint, removePoint, pixelsPerMeter,
  lineLengthM, readLines, lineAt, pointWidthsM,
} from '../utils/lines';
import { screenWidths } from '../canvas/lineRenderer';
import { inspectAt } from '../utils/inspect';
import { useMapStore, LINE_LAYER } from '../store/mapStore';
import { useViewStore } from '../store/viewStore';
import { lineTool, lineToolKey } from '../tools/lineTool';
import type { TmjMap, TmjObject } from '../types/tmj';
import { isObjectLayer } from '../types/tmj';

const road = (o: Partial<TmjObject> = {}): TmjObject => ({
  id: 5, name: 'Road 1', type: 'road', x: 100, y: 50, width: 0, height: 0, visible: true,
  polyline: [{ x: 0, y: 0 }, { x: 30, y: 40 }, { x: 60, y: 40 }], ...o,
});
const square = (): TmjMap => ({
  orientation: 'orthogonal', width: 20, height: 20, tilewidth: 10, tileheight: 10, nextlayerid: 2, nextobjectid: 10,
  tilesets: [], metersPerUnit: 100,
  layers: [{ type: 'tilelayer', id: 1, name: 'Ground', width: 20, height: 20, visible: true, opacity: 1, offsetx: 0, offsety: 0, data: new Array(400).fill(0) }],
});

describe('line classes', () => {
  it('finds classes by ID; generic types show as their usual class but are flagged', () => {
    expect(classForType('river', BUILTIN_LINE_CLASSES)).toMatchObject({ known: true, cls: { name: 'River', widthM: 20 } });
    const legacy = classForType('road', BUILTIN_LINE_CLASSES);
    expect(legacy.known).toBe(false);
    expect(legacy.cls.widthM).toBe(5); // drawn as a minor road
    expect(classForType('bridge', BUILTIN_LINE_CLASSES)).toMatchObject({ known: false, cls: { name: 'bridge (no class)' } });
  });

  it('a world set list replaces the built-in one; new IDs are unique slugs', () => {
    const own = [{ id: 'ice-road', name: 'Ice road', kind: 'road' as const, widthM: 6, color: '#ffffff' }];
    expect(resolveLineClasses(own)).toBe(own);
    expect(resolveLineClasses(undefined)).toBe(BUILTIN_LINE_CLASSES);
    expect(resolveLineClasses([])).toBe(BUILTIN_LINE_CLASSES);
    expect(newClassId('Ice road', own)).toBe('ice-road-2');
    expect(newClassId('  Royal Highway! ', own)).toBe('royal-highway');
  });
});

describe('line geometry and widths', () => {
  it('points are relative to the object; toPolyline anchors at the first point', () => {
    const pts = linePoints(road());
    expect(pts).toEqual([{ x: 100, y: 50 }, { x: 130, y: 90 }, { x: 160, y: 90 }]);
    expect(toPolyline(pts)).toEqual({ x: 100, y: 50, polyline: road().polyline });
  });

  it('per-point widths: blanks use the class width; all blank removes the property', () => {
    const o = road({ properties: [{ name: 'widths', type: 'string', value: '20, ,25' }] });
    expect(readWidths(o)).toEqual([20, null, 25]);
    expect(pointWidthsM(o, BUILTIN_LINE_CLASSES[5])).toEqual([20, 20, 25]);
    expect(writeWidths(o.properties, [8, null, 12.345])).toEqual([{ name: 'widths', type: 'string', value: '8,,12.35' }]);
    expect(writeWidths(o.properties, [null, null, null])).toEqual([]);
    expect(readWidths(road())).toEqual([null, null, null]);
  });

  it('nearest point, insert and remove', () => {
    const pts = linePoints(road());
    expect(nearestOnLine(pts, 145, 95)).toMatchObject({ d: 5, segment: 1 });
    const ins = insertPoint(pts, [10, null, 30], 1, { x: 145, y: 90 });
    expect(ins.points).toHaveLength(4);
    expect(ins.widths).toEqual([10, null, null, 30]); // a blank neighbour: blank (class width)
    expect(insertPoint(pts, [10, 20, 30], 0, { x: 115, y: 70 }).widths).toEqual([10, 15, 20, 30]);
    expect(removePoint(pts, [1, 2, 3], 1)).toEqual({ points: [pts[0], pts[2]], widths: [1, 3] });
  });

  it('scale: pixels per meter and length', () => {
    const map = square(); // 10 px cells of 100 m
    expect(pixelsPerMeter(map, 100)).toBeCloseTo(0.1);
    expect(pixelsPerMeter(map, undefined)).toBeNull();
    expect(lineLengthM(linePoints(road()), 0.1)).toBeCloseTo(800); // 50 + 30 px
  });

  it('screen widths follow meters but never vanish', () => {
    const river = BUILTIN_LINE_CLASSES.find((c) => c.id === 'river')!;
    expect(screenWidths(road(), river, 0.1, 2)).toEqual([4, 4, 4]);       // 20 m * 0.1 px/m * zoom 2
    expect(screenWidths(road(), river, 0.001, 1)).toEqual([1.5, 1.5, 1.5]); // minimum
    expect(screenWidths(road(), river, null, 1)).toEqual([4, 4, 4]);       // no scale: fixed
  });
});

describe('finding lines', () => {
  it('reads lines from object layers and hit-tests them; the inspector sees them', () => {
    const map = square();
    map.layers.push({ type: 'objectgroup', id: 2, name: 'Roads', visible: true, opacity: 1, offsetx: 0, offsety: 0, color: '#fff', objects: [road()] });
    const lines = readLines(map);
    expect(lines.map((l) => l.id)).toEqual([5]);
    expect(lineAt(lines, 131, 91, 3)?.id).toBe(5);
    expect(lineAt(lines, 120, 100, 3)).toBeNull();
    expect(inspectAt(map, 131, 91, 3)!.objects.map((o) => [o.name, o.kind])).toEqual([['Road 1', 'line']]);
  });
});

describe('line editing in the store', () => {
  const s = () => useMapStore.getState();
  beforeEach(() => {
    s().loadMap(square(), 'm', 'ws');
    s().setActiveLayer(0);
  });

  it('a new line goes into a new "Roads and rivers" layer above the active tile layer; undo removes both', () => {
    const id = s().addLine([{ x: 5, y: 5 }, { x: 50, y: 5 }], 'river')!;
    expect(s().mapData!.layers.map((l) => l.name)).toEqual(['Ground', LINE_LAYER]);
    const [line] = readLines(s().mapData!);
    expect(line.object).toMatchObject({ id, type: 'river', x: 5, y: 5, polyline: [{ x: 0, y: 0 }, { x: 45, y: 0 }] });
    expect(s().activeLayerIndex).toBe(0);
    s().undo();
    expect(s().mapData!.layers).toHaveLength(1);
  });

  it('goes into the active object layer when there is one', () => {
    s().addLayer('object');
    s().addLine([{ x: 5, y: 5 }, { x: 50, y: 5 }], 'path');
    expect(s().mapData!.layers.filter(isObjectLayer).map((l) => [l.name, l.objects.length])).toEqual([['Object Layer 1', 1]]);
  });

  it('updates name, class, points and widths as one step each; delete is undoable', () => {
    const id = s().addLine([{ x: 5, y: 5 }, { x: 50, y: 5 }], 'river')!;
    s().updateLine(id, { name: 'Varra', classId: 'stream' });
    s().updateLine(id, { points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 40, y: 10 }], widths: [null, 6, 9] });
    const o = readLines(s().mapData!)[0].object;
    expect(o).toMatchObject({ name: 'Varra', type: 'stream', x: 0, y: 0 });
    expect(readWidths(o)).toEqual([null, 6, 9]);
    s().deleteLine(id);
    expect(readLines(s().mapData!)).toHaveLength(0);
    s().undo();
    s().undo();
    expect(readLines(s().mapData!)[0].object.polyline).toHaveLength(2);
  });
});

describe('Line tool', () => {
  const s = () => useMapStore.getState();
  const v = () => useViewStore.getState();
  beforeEach(() => {
    s().loadMap(square(), 'm', 'ws');
    s().setZoom(1);
    v().selectLine(null);
    v().setDraftLine(null);
    v().setNewLineClass('major-road');
  });
  const click = (x: number, y: number) => { lineTool.onPress(0, 0, s(), { x, y }); lineTool.onRelease(s()); };

  it('clicks add points; Enter finishes, adds the line and selects it', () => {
    click(10, 10);
    click(60, 10);
    click(60, 80);
    expect(v().draftLine).toHaveLength(3);
    expect(lineToolKey('Backspace', s())).toBe(true);
    expect(v().draftLine).toHaveLength(2);
    lineToolKey('Enter', s());
    const [line] = readLines(s().mapData!);
    expect(line.object.type).toBe('major-road');
    expect(linePoints(line.object)).toEqual([{ x: 10, y: 10 }, { x: 60, y: 10 }]);
    expect(v().selectedLineId).toBe(line.id);
    expect(v().draftLine).toBeNull();
  });

  it('a double-click finishes; Esc cancels a line being drawn', () => {
    click(10, 10);
    click(60, 10);
    click(60, 10); // same spot, quickly: double-click
    expect(readLines(s().mapData!)).toHaveLength(1);
    v().selectLine(null);
    click(100, 100);
    click(150, 100);
    lineToolKey('Escape', s());
    expect(v().draftLine).toBeNull();
    expect(readLines(s().mapData!)).toHaveLength(1);
  });

  it('select a line, drag a point (one undo step), insert at a midpoint, delete a point then the line', () => {
    const id = s().addLine([{ x: 10, y: 10 }, { x: 110, y: 10 }], 'river')!;
    click(60, 12);                       // on the line: select it
    expect(v().selectedLineId).toBe(id);
    const steps = s().past.length;
    lineTool.onPress(0, 0, s(), { x: 110, y: 10 }); // its end point
    lineTool.onDrag(0, 0, s(), { x: 120, y: 30 });
    expect(v().dragPoints?.[1]).toEqual({ x: 120, y: 30 });
    lineTool.onRelease(s());
    expect(s().past.length).toBe(steps + 1);
    expect(linePoints(readLines(s().mapData!)[0].object)[1]).toEqual({ x: 120, y: 30 });
    lineTool.onPress(0, 0, s(), { x: 65, y: 20 }); // the midpoint handle
    lineTool.onDrag(0, 0, s(), { x: 65, y: 0 });
    lineTool.onRelease(s());
    expect(linePoints(readLines(s().mapData!)[0].object)).toHaveLength(3);
    expect(v().selectedPoint).toBe(1);
    lineToolKey('Delete', s());          // removes the selected point
    expect(linePoints(readLines(s().mapData!)[0].object)).toHaveLength(2);
    lineToolKey('Delete', s());          // no point selected: removes the line
    expect(readLines(s().mapData!)).toHaveLength(0);
    expect(v().selectedLineId).toBeNull();
  });

  it('a click away from any line deselects, the next one starts a line', () => {
    s().addLine([{ x: 10, y: 10 }, { x: 110, y: 10 }], 'river');
    click(60, 10);
    click(60, 150);
    expect(v().selectedLineId).toBeNull();
    expect(v().draftLine).toBeNull();
    click(60, 150);
    expect(v().draftLine).toHaveLength(1);
  });
});
