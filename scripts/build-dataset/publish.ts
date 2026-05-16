import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Camera } from '../../src/domain/camera';
import type { DatasetManifest } from '../../src/data/datasetManifest';
import type { MergeStats } from './merge';
import { BENCHMARK_CITIES } from './cities';

export interface PublishInput {
  readonly cameras: readonly Camera[];
  readonly deflockCount: number;
  readonly osmCount: number;
  readonly mergeStats: MergeStats;
  readonly buildRunUrl: string;
}

export async function publishDataset(
  outDir: string,
  input: PublishInput,
): Promise<{ manifestPath: string; mainPath: string; cityPaths: string[] }> {
  await mkdir(outDir, { recursive: true });
  await mkdir(join(outDir, 'cameras-by-city'), { recursive: true });

  const mainPath = join(outDir, 'cameras-us.json');
  await writeFile(mainPath, JSON.stringify({ schemaVersion: 3, cameras: input.cameras }), 'utf-8');

  const mergedCount = input.cameras.reduce(
    (n, c) => n + ((c.sources?.length ?? 0) > 1 ? 1 : 0),
    0,
  );
  const manifest: DatasetManifest = {
    schemaVersion: 3,
    generatedAt: new Date().toISOString(),
    totalCameras: input.cameras.length,
    sourceCounts: {
      deflock: input.deflockCount,
      osm: input.osmCount,
      merged: mergedCount,
    },
    dedupStats: input.mergeStats,
    buildRunUrl: input.buildRunUrl,
  };
  const manifestPath = join(outDir, 'cameras-us.json.meta.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  const cityPaths: string[] = [];
  for (const city of BENCHMARK_CITIES) {
    const inCity = input.cameras.filter(
      (c) =>
        c.lat >= city.minLat &&
        c.lat <= city.maxLat &&
        c.lon >= city.minLon &&
        c.lon <= city.maxLon,
    );
    const path = join(outDir, 'cameras-by-city', `${city.slug}.json`);
    await writeFile(
      path,
      JSON.stringify({ schemaVersion: 3, city: city.slug, cameras: inCity }),
      'utf-8',
    );
    cityPaths.push(path);
  }
  return { manifestPath, mainPath, cityPaths };
}
