import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runPipeline } from '../../../scripts/build-dataset/run';

describe('pipeline (e2e against fixtures)', () => {
  let outDir: string;

  beforeAll(async () => {
    outDir = await mkdtemp(join(tmpdir(), 'flock-pipe-'));
    await runPipeline({
      outDir,
      buildRunUrl: 'https://example/run/test',
      deflockIndexFixturePath: 'scripts/build-dataset/fixtures/deflock-index.json',
      deflockTileFixturePath: 'scripts/build-dataset/fixtures/deflock-tile-sample.json',
      osmFixturePath: 'scripts/build-dataset/fixtures/osm-sample.json',
    });
  }, 30_000);

  afterAll(async () => {
    if (outDir) await rm(outDir, { recursive: true, force: true });
  });

  it('produces cameras-us.json with merged dataset', async () => {
    const main = JSON.parse(await readFile(join(outDir, 'cameras-us.json'), 'utf-8')) as {
      schemaVersion: number;
      cameras: unknown[];
    };
    expect(main.schemaVersion).toBe(3);
    expect(Array.isArray(main.cameras)).toBe(true);
    // 5 deflock records × N US-intersecting fixture regions + 4 osm = many; merge collapses dupes
    expect(main.cameras.length).toBeGreaterThan(0);
  });

  it('produces a parseable manifest', async () => {
    const manifest = JSON.parse(
      await readFile(join(outDir, 'cameras-us.json.meta.json'), 'utf-8'),
    ) as {
      schemaVersion: number;
      sourceCounts: { deflock: number; osm: number; merged: number };
      dedupStats: { matchRadiusMeters: number };
    };
    expect(manifest.schemaVersion).toBe(3);
    expect(manifest.sourceCounts.deflock).toBeGreaterThan(0);
    expect(manifest.sourceCounts.osm).toBe(4);
    expect(manifest.dedupStats.matchRadiusMeters).toBe(10);
  });

  it('produces 5 per-city subset files', async () => {
    const entries = await readdir(join(outDir, 'cameras-by-city'));
    expect(entries.sort()).toEqual([
      'atlanta.json', 'dallas.json', 'detroit.json', 'memphis.json', 'sanfrancisco.json',
    ]);
  });
});
