export interface DatasetManifest {
  readonly schemaVersion: 3;
  readonly generatedAt: string;
  readonly totalCameras: number;
  readonly sourceCounts: {
    readonly deflock: number;
    readonly osm: number;
    readonly merged: number;
  };
  readonly dedupStats: {
    readonly duplicatesCollapsed: number;
    readonly matchRadiusMeters: 10;
  };
  readonly buildRunUrl: string;
}

export function parseDatasetManifest(raw: string): DatasetManifest {
  const data = JSON.parse(raw) as Record<string, unknown>;
  if (data['schemaVersion'] !== 3) {
    throw new Error(`Unsupported manifest schemaVersion: ${String(data['schemaVersion'])}`);
  }
  if (typeof data['generatedAt'] !== 'string') throw new Error('manifest missing generatedAt');
  if (typeof data['totalCameras'] !== 'number') throw new Error('manifest missing totalCameras');
  if (typeof data['buildRunUrl'] !== 'string') throw new Error('manifest missing buildRunUrl');
  const sc = data['sourceCounts'] as Record<string, unknown> | undefined;
  if (
    !sc ||
    typeof sc['deflock'] !== 'number' ||
    typeof sc['osm'] !== 'number' ||
    typeof sc['merged'] !== 'number'
  ) {
    throw new Error('manifest missing sourceCounts');
  }
  const ds = data['dedupStats'] as Record<string, unknown> | undefined;
  if (!ds || typeof ds['duplicatesCollapsed'] !== 'number' || ds['matchRadiusMeters'] !== 10) {
    throw new Error('manifest missing dedupStats');
  }
  return {
    schemaVersion: 3,
    generatedAt: data['generatedAt'],
    totalCameras: data['totalCameras'],
    sourceCounts: { deflock: sc['deflock'], osm: sc['osm'], merged: sc['merged'] },
    dedupStats: { duplicatesCollapsed: ds['duplicatesCollapsed'], matchRadiusMeters: 10 },
    buildRunUrl: data['buildRunUrl'],
  };
}
