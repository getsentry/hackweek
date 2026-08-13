import {describe, expect, it} from 'vitest';

import {
  localObjectFilename,
  objectMetadataMatches,
  randomSample,
  reconcileBucket,
  type R2ObjectMetadata,
  wranglerMetadataArgs,
} from '../../scripts/migrate-cloudflare-r2';

function object(
  key: string,
  size: number,
  overrides: Partial<R2ObjectMetadata> = {},
): R2ObjectMetadata {
  return {
    key,
    size,
    storage_class: 'Standard',
    http_metadata: {contentType: 'application/octet-stream'},
    custom_metadata: {},
    ...overrides,
  };
}

describe('Cloudflare account R2 migration', () => {
  it('reconciles expected, source, and destination keys without exposing paths', () => {
    const inventory = reconcileBucket(
      'attachments',
      [object('present', 10), object('unreferenced', 20)],
      [object('present', 9), object('destination-only', 30)],
      ['present', 'missing'],
    );

    expect(inventory).toMatchObject({
      expectedKeys: 2,
      source: {objects: 2, bytes: 30, largestObjectBytes: 20},
      destination: {objects: 2, bytes: 39, largestObjectBytes: 30},
      missingFromSource: ['missing'],
      unexpectedInSource: ['unreferenced'],
      missingFromDestination: ['unreferenced'],
      unexpectedInDestination: ['destination-only'],
      destinationSizeMismatches: ['present'],
    });
  });

  it('compares bytes and HTTP metadata while deliberately excluding custom metadata', () => {
    const source = object('video', 42, {
      custom_metadata: {sha256: 'source'},
      http_metadata: {contentType: 'video/mp4'},
    });
    const destination = object('video', 42, {
      custom_metadata: {},
      http_metadata: {contentType: 'video/mp4'},
    });

    expect(objectMetadataMatches(source, destination)).toBe(true);
    expect(
      objectMetadataMatches(source, {
        ...destination,
        http_metadata: {contentType: 'application/octet-stream'},
      }),
    ).toBe(false);
  });

  it('selects a unique random sample without mutating the input', () => {
    const values = Array.from({length: 20}, (_, index) => index);
    const sample = randomSample(values, 10);

    expect(sample).toHaveLength(10);
    expect(new Set(sample).size).toBe(10);
    expect(sample.every((value) => values.includes(value))).toBe(true);
    expect(values).toEqual(Array.from({length: 20}, (_, index) => index));
    expect(() => randomSample(values, 21)).toThrow(/Cannot sample/);
  });

  it('maps supported HTTP metadata and storage class to Wrangler flags', () => {
    expect(
      wranglerMetadataArgs({
        key: 'key',
        size: 1,
        storage_class: 'InfrequentAccess',
        http_metadata: {
          contentType: 'video/mp4',
          contentDisposition: 'attachment',
          contentEncoding: 'gzip',
          contentLanguage: 'en-US',
          cacheControl: 'private',
          cacheExpiry: '2030-01-01T00:00:00Z',
        },
      }),
    ).toEqual([
      '--content-type',
      'video/mp4',
      '--content-disposition',
      'attachment',
      '--content-encoding',
      'gzip',
      '--content-language',
      'en-US',
      '--cache-control',
      'private',
      '--expires',
      '2030-01-01T00:00:00Z',
      '--storage-class',
      'InfrequentAccess',
    ]);
  });

  it('maps arbitrary object keys to stable path-safe filenames', () => {
    const first = localObjectFilename('bucket', '../../private/video.mp4');
    const second = localObjectFilename('bucket', '../../private/video.mp4');

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}\.object$/);
    expect(first).not.toContain('private');
  });
});
