import type {
  DirectUpload,
  DirectUploadInput,
  DownloadAsset,
  HistoricalPromotionInput,
  StreamGateway,
} from './types';
import {StreamGatewayError} from './types';

export interface FakeStreamRecord {
  uid: string;
  source: 'direct' | 'historical';
  deleted: boolean;
  downloadStatus: DownloadAsset['status'];
}

export class FakeStreamGateway implements StreamGateway {
  readonly records = new Map<string, FakeStreamRecord>();

  async createDirectUpload(input: DirectUploadInput): Promise<DirectUpload> {
    const uid = fakeUid();
    this.records.set(uid, {
      uid,
      source: 'direct',
      deleted: false,
      downloadStatus: 'ready',
    });
    return {
      uid,
      uploadUrl: `https://upload.videodelivery.net/fake/${uid}`,
      expiresAt: input.expiresAt,
      protocol: 'tus',
    };
  }

  async promoteHistoricalVideo(_input: HistoricalPromotionInput): Promise<string> {
    const uid = fakeUid();
    this.records.set(uid, {
      uid,
      source: 'historical',
      deleted: false,
      downloadStatus: 'ready',
    });
    return uid;
  }

  async createPlaybackToken(uid: string, expiresAt: Date): Promise<string> {
    this.assertVideo(uid);
    return fakeToken('playback', uid, expiresAt);
  }

  async createDownloadToken(uid: string, expiresAt: Date): Promise<string> {
    this.assertVideo(uid);
    return fakeToken('download', uid, expiresAt);
  }

  async ensureDownload(uid: string): Promise<DownloadAsset> {
    const record = this.assertVideo(uid);
    return {
      status: record.downloadStatus,
      url:
        record.downloadStatus === 'error'
          ? null
          : `https://customer-fake.cloudflarestream.com/${uid}/downloads/default.mp4`,
    };
  }

  async deleteVideo(uid: string): Promise<void> {
    this.assertVideo(uid).deleted = true;
  }

  private assertVideo(uid: string) {
    const record = this.records.get(uid);
    if (!record || record.deleted)
      throw new StreamGatewayError('Fake Stream video not found');
    return record;
  }
}

function fakeUid() {
  return `fake-${crypto.randomUUID()}`;
}

function fakeToken(kind: string, uid: string, expiresAt: Date) {
  return `fake.${kind}.${uid}.${Math.floor(expiresAt.getTime() / 1000)}`;
}
