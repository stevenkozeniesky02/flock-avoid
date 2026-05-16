import { fetchDeflock, fetchDeflockFromFixtures } from './fetch-deflock';
import { fetchOsm, fetchOsmFromFixture } from './fetch-osm';
import { normalizeDeflock, normalizeOsm } from './normalize';
import { mergeWithStats } from './merge';
import { validateDataset } from './validate';
import { publishDataset } from './publish';

export interface RunOptions {
  readonly outDir: string;
  readonly buildRunUrl: string;
  /** If set together with deflockTileFixturePath, read DeFlock from fixtures instead of the CDN. */
  readonly deflockIndexFixturePath?: string;
  readonly deflockTileFixturePath?: string;
  /** If set, read OSM from this fixture file instead of the network. */
  readonly osmFixturePath?: string;
  /** Override OSM source minimum. Defaults to 0 when an osmFixturePath is set
   *  (fixtures are small by design) and to validate.ts's production default
   *  otherwise. */
  readonly minOsmCount?: number;
}

export async function runPipeline(opts: RunOptions): Promise<void> {
  const useDeflockFixture =
    opts.deflockIndexFixturePath != null && opts.deflockTileFixturePath != null;

  const [rawDeflock, rawOsm] = await Promise.all([
    useDeflockFixture
      ? fetchDeflockFromFixtures(opts.deflockIndexFixturePath!, opts.deflockTileFixturePath!)
      : fetchDeflock(),
    opts.osmFixturePath ? fetchOsmFromFixture(opts.osmFixturePath) : fetchOsm(),
  ]);

  const deflockCams = normalizeDeflock(rawDeflock);
  const osmCams = normalizeOsm(rawOsm);
  const { merged, stats } = mergeWithStats(deflockCams, osmCams);
  const minOsmCount = opts.minOsmCount ?? (opts.osmFixturePath ? 0 : undefined);
  validateDataset(
    merged,
    { deflock: deflockCams.length, osm: osmCams.length },
    minOsmCount != null ? { minOsmCount } : undefined,
  );
  await publishDataset(opts.outDir, {
    cameras: merged,
    deflockCount: deflockCams.length,
    osmCount: osmCams.length,
    mergeStats: stats,
    buildRunUrl: opts.buildRunUrl,
  });
}

// CLI entry: read env vars + run
if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = process.env['OUT_DIR'] ?? './dist-dataset';
  const buildRunUrl = process.env['BUILD_RUN_URL'] ?? 'local';
  const deflockIndexFixturePath = process.env['DEFLOCK_INDEX_FIXTURE'];
  const deflockTileFixturePath = process.env['DEFLOCK_TILE_FIXTURE'];
  const osmFixturePath = process.env['OSM_FIXTURE'];
  const minOsmCountRaw = process.env['MIN_OSM_COUNT'];
  const minOsmCount = minOsmCountRaw != null ? Number(minOsmCountRaw) : undefined;

  const opts: RunOptions = {
    outDir,
    buildRunUrl,
    ...(deflockIndexFixturePath ? { deflockIndexFixturePath } : {}),
    ...(deflockTileFixturePath ? { deflockTileFixturePath } : {}),
    ...(osmFixturePath ? { osmFixturePath } : {}),
    ...(minOsmCount != null && Number.isFinite(minOsmCount) ? { minOsmCount } : {}),
  };

  runPipeline(opts).then(
    () => {
      console.log(`Pipeline complete. Output: ${outDir}`);
    },
    (err: unknown) => {
      console.error('Pipeline failed:', err);
      process.exit(1);
    },
  );
}
