import {isJsonString} from '../../shared/json';

export interface HistoricalVideoSource {
  createReadUrl(key: string, expiresInSeconds: number): Promise<string>;
}

export class FakeHistoricalVideoSource implements HistoricalVideoSource {
  async createReadUrl(key: string, expiresInSeconds: number) {
    const url = new URL(`https://r2-fake.invalid/${encodeKey(key)}`);
    url.searchParams.set('expires', String(expiresInSeconds));
    return url.toString();
  }
}

export class R2HistoricalVideoSource implements HistoricalVideoSource {
  constructor(
    private readonly accountId: string,
    private readonly bucket: string,
    private readonly accessKeyId: string,
    private readonly secretAccessKey: string,
  ) {}

  async createReadUrl(key: string, expiresInSeconds: number) {
    const now = new Date();
    const date = isoDate(now);
    const dateStamp = date.slice(0, 8);
    const scope = `${dateStamp}/auto/s3/aws4_request`;
    const host = `${this.accountId}.r2.cloudflarestorage.com`;
    const canonicalUri = `/${awsEncode(this.bucket)}/${encodeKey(key)}`;
    const query = new URLSearchParams({
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${this.accessKeyId}/${scope}`,
      'X-Amz-Date': date,
      'X-Amz-Expires': String(expiresInSeconds),
      'X-Amz-SignedHeaders': 'host',
    });
    query.sort();
    const canonicalRequest = [
      'GET',
      canonicalUri,
      query.toString(),
      `host:${host}\n`,
      'host',
      'UNSIGNED-PAYLOAD',
    ].join('\n');
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      date,
      scope,
      await sha256Hex(canonicalRequest),
    ].join('\n');
    const dateKey = await hmac(`AWS4${this.secretAccessKey}`, dateStamp);
    const regionKey = await hmac(dateKey, 'auto');
    const serviceKey = await hmac(regionKey, 's3');
    const signingKey = await hmac(serviceKey, 'aws4_request');
    query.set('X-Amz-Signature', await hmacHex(signingKey, stringToSign));
    return `https://${host}${canonicalUri}?${query.toString()}`;
  }
}

function isoDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function encodeKey(value: string) {
  return value.split('/').map(awsEncode).join('/');
}

function awsEncode(value: string) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return hex(digest);
}

async function hmac(key: string | ArrayBuffer, value: string) {
  const rawKey = isJsonString(key) ? new TextEncoder().encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    rawKey,
    {name: 'HMAC', hash: 'SHA-256'},
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(value));
}

async function hmacHex(key: ArrayBuffer, value: string) {
  return hex(await hmac(key, value));
}

function hex(value: ArrayBuffer) {
  return [...new Uint8Array(value)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
