import {readFile} from 'node:fs/promises';
import path from 'node:path';

import {
  readStorageManifest,
  transformFirebaseExport,
} from '../../scripts/migrate/transform';

const fixtureRoot = path.resolve('test/fixtures/firebase');

export async function parseLocalReadinessFixture() {
  const source = JSON.parse(
    await readFile(path.join(fixtureRoot, 'database.json'), 'utf8'),
  );
  const manifest = await readStorageManifest(
    path.join(fixtureRoot, 'storage-manifest.json'),
  );
  const transformed = await transformFirebaseExport(
    source,
    manifest,
    path.join(fixtureRoot, 'storage'),
  );
  if (transformed.issues.some(({severity}) => severity === 'error')) {
    throw new Error('The seeded readiness fixture has migration errors');
  }
  transformed.data.media = transformed.data.media.map((media) => ({
    ...media,
    status: media.storageFile ? 'available' : 'missing',
  }));
  return transformed.data;
}
