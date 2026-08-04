import type {
  DirectUpload,
  DirectUploadInput,
  DownloadAsset,
  HistoricalPromotionInput,
  StreamGateway,
} from './types';
import {StreamGatewayError} from './types';

interface CloudflareEnvelope<T> {
  success?: boolean;
  result?: T;
  errors?: Array<{message?: string}>;
}

interface TokenResult {
  token?: string;
}

interface DownloadsResult {
  default?: {status?: string; url?: string};
}

export class RealStreamGateway implements StreamGateway {
  constructor(
    private readonly accountId: string,
    private readonly apiToken: string,
  ) {}

  async createDirectUpload(input: DirectUploadInput): Promise<DirectUpload> {
    const response = await fetch(`${this.baseUrl}?direct_user=true`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Tus-Resumable': '1.0.0',
        'Upload-Length': String(input.fileSize),
        'Upload-Creator': input.creator,
        'Upload-Metadata': uploadMetadata({
          name: input.fileName,
          maxdurationseconds: String(input.maxDurationSeconds),
          requiresignedurls: null,
          allowedorigins: input.allowedOrigin,
          expiry: input.expiresAt.toISOString(),
        }),
      },
    });
    const uploadUrl = response.headers.get('Location');
    const uid = response.headers.get('stream-media-id');
    if (response.status !== 201 || !uploadUrl || !uid) {
      throw await responseError(
        response,
        'Cloudflare Stream did not create a tus upload',
      );
    }
    return {uid, uploadUrl, expiresAt: input.expiresAt, protocol: 'tus'};
  }

  async promoteHistoricalVideo(input: HistoricalPromotionInput): Promise<string> {
    const result = await this.request<{uid?: string}>('/copy', {
      method: 'POST',
      body: JSON.stringify({
        url: input.sourceUrl,
        creator: input.creator,
        allowedOrigins: [input.allowedOrigin],
        requireSignedURLs: true,
        meta: {name: input.fileName},
      }),
    });
    if (!result.uid) throw new StreamGatewayError('Stream copy response omitted uid');
    return result.uid;
  }

  async createPlaybackToken(uid: string, expiresAt: Date): Promise<string> {
    return this.createToken(uid, expiresAt, false);
  }

  async createDownloadToken(uid: string, expiresAt: Date): Promise<string> {
    return this.createToken(uid, expiresAt, true);
  }

  async ensureDownload(uid: string): Promise<DownloadAsset> {
    const result = await this.request<DownloadsResult>(
      `/${encodeURIComponent(uid)}/downloads`,
      {method: 'POST'},
    );
    const download = result.default;
    if (!download || !['inprogress', 'ready', 'error'].includes(download.status ?? '')) {
      throw new StreamGatewayError('Stream download response was invalid');
    }
    return {
      status: download.status as DownloadAsset['status'],
      url: download.url ?? null,
    };
  }

  async deleteVideo(uid: string): Promise<void> {
    await this.request<unknown>(`/${encodeURIComponent(uid)}`, {method: 'DELETE'});
  }

  private async createToken(uid: string, expiresAt: Date, downloadable: boolean) {
    const result = await this.request<TokenResult>(`/${encodeURIComponent(uid)}/token`, {
      method: 'POST',
      body: JSON.stringify({
        exp: Math.floor(expiresAt.getTime() / 1000),
        downloadable,
      }),
    });
    if (!result.token)
      throw new StreamGatewayError('Stream token response omitted token');
    return result.token;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: new Headers({
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        ...Object.fromEntries(new Headers(init.headers).entries()),
      }),
    });
    const envelope = (await response.json().catch(() => ({}))) as CloudflareEnvelope<T>;
    if (!response.ok || envelope.success !== true || envelope.result === undefined) {
      const message =
        envelope.errors
          ?.map(({message}) => message)
          .filter(Boolean)
          .join('; ') ||
        `Cloudflare Stream request failed with status ${response.status}`;
      throw new StreamGatewayError(message);
    }
    return envelope.result;
  }

  private get baseUrl() {
    return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(this.accountId)}/stream`;
  }
}

function uploadMetadata(values: Record<string, string | null>) {
  return Object.entries(values)
    .map(([key, value]) => (value === null ? key : `${key} ${base64(value)}`))
    .join(',');
}

function base64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function responseError(response: Response, fallback: string) {
  const envelope = (await response
    .json()
    .catch(() => ({}))) as CloudflareEnvelope<unknown>;
  const detail = envelope.errors
    ?.map(({message}) => message)
    .filter(Boolean)
    .join('; ');
  return new StreamGatewayError(detail || `${fallback} (${response.status})`);
}
