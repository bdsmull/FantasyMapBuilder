import { describe, it, expect, vi, afterEach } from 'vitest';
import { importMapset, mapsetDownloadUrl } from '../api/client';

function respond(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('importMapset', () => {
  const file = new File(['zip bytes'], 'Brakka.mapset');

  it('returns the imported world set on success', async () => {
    vi.stubGlobal('fetch', respond(201, { imported: 'Brakka', maps: ['world'] }));
    expect(await importMapset(file)).toEqual({ ok: true, imported: 'Brakka', maps: ['world'] });
  });

  it('reports a name conflict instead of throwing, so the user can pick another name', async () => {
    vi.stubGlobal('fetch', respond(409, { detail: "A world set named 'Brakka' already exists" }));
    expect(await importMapset(file)).toEqual({ ok: false, conflict: "A world set named 'Brakka' already exists" });
  });

  it('sends the new name with the file', async () => {
    const fetchMock = respond(201, { imported: 'Brakka copy', maps: [] });
    vi.stubGlobal('fetch', fetchMock);
    await importMapset(file, 'Brakka copy');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/mapsets');
    const form = init.body as FormData;
    expect(form.get('name')).toBe('Brakka copy');
    expect((form.get('file') as File).name).toBe('Brakka.mapset');
  });

  it('throws on other errors (e.g. an invalid package)', async () => {
    vi.stubGlobal('fetch', respond(400, { detail: 'Not a valid .mapset: no mapset.json' }));
    await expect(importMapset(file)).rejects.toThrow(/400/);
  });
});

describe('mapsetDownloadUrl', () => {
  it('encodes the world set name', () => {
    expect(mapsetDownloadUrl('Full World')).toBe('/api/mapsets/Full%20World');
  });
});
