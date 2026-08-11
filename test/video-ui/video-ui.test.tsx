import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Route, Router} from 'wouter';
import {memoryLocation} from 'wouter/memory-location';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {IndividualPlayer} from '../../src/app/player/IndividualPlayer';
import {
  handleScreeningShortcut,
  ScreeningPlayer,
} from '../../src/app/player/ScreeningPlayer';
import {WatchPage} from '../../src/app/routes/WatchPage';
import {ProjectVideoPanel} from '../../src/app/video/ProjectVideoPanel';
import {
  createMultipartUpload,
  persistResumeRecord,
  readResumeRecord,
  type ResumableUpload,
  type UploadSnapshot,
} from '../../src/app/video/upload';
import type {
  PlaylistItem,
  ProjectVideo,
  VideoUploadSession,
} from '../../src/shared/videos';

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', fetchMock);
vi.stubGlobal(
  'confirm',
  vi.fn(() => true),
);

afterEach(() => {
  fetchMock.mockReset();
  localStorage.clear();
});

describe('video user experience', () => {
  it('shows resumable multipart progress controls through a local event adapter', async () => {
    fetchMock.mockImplementation(async (_input, init) => {
      if (init?.method === 'POST') {
        return json({video: null, upload: uploadSession}, 201);
      }
      return json({});
    });
    const uploadFactory = (
      file: File,
      _session: VideoUploadSession,
      onChange: (snapshot: UploadSnapshot) => void,
    ): ResumableUpload => ({
      start: () =>
        onChange({phase: 'uploading', bytesSent: 2, bytesTotal: file.size, error: null}),
      pause: async () =>
        onChange({phase: 'paused', bytesSent: 2, bytesTotal: file.size, error: null}),
      resume: () =>
        onChange({phase: 'uploading', bytesSent: 2, bytesTotal: file.size, error: null}),
      retry: () =>
        onChange({phase: 'uploading', bytesSent: 2, bytesTotal: file.size, error: null}),
    });

    renderQuery(
      <ProjectVideoPanel
        projectId="project"
        yearId="2026"
        video={null}
        canManage
        uploadFactory={uploadFactory}
      />,
    );
    await userEvent.upload(
      screen.getByLabelText('select project video'),
      new File(['video'], 'demo.mp4', {type: 'video/mp4'}),
    );

    expect(await screen.findByRole('progressbar')).toBeTruthy();
    expect(screen.getByRole('button', {name: 'pause upload'})).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project/video/upload',
      expect.objectContaining({method: 'POST'}),
    );
  });

  it('persists multipart resume identity and skips server-confirmed parts', async () => {
    const file = new File(['abcde'], 'resume.mp4', {
      type: 'video/mp4',
      lastModified: 42,
    });
    const session: VideoUploadSession = {
      ...uploadSession,
      fileName: file.name,
      fileSize: file.size,
      partSize: 3,
      completedParts: [{partNumber: 1, etag: 'first', sizeBytes: 3}],
    };
    persistResumeRecord(file, session);
    expect(readResumeRecord('project', file)).toMatchObject({
      uploadId: 'upload-1',
      completedParts: session.completedParts,
    });

    fetchMock
      .mockResolvedValueOnce(json({part: {partNumber: 2, etag: 'second', sizeBytes: 2}}))
      .mockResolvedValueOnce(json({video: {...baseVideo, status: 'queued'}}));
    const snapshots: UploadSnapshot[] = [];
    createMultipartUpload(file, session, (snapshot) => snapshots.push(snapshot)).start();

    await vi.waitFor(() => expect(snapshots.at(-1)?.phase).toBe('complete'));
    const firstRequest = fetchMock.mock.calls[0][0];
    if (typeof firstRequest !== 'string')
      throw new Error('Expected a string request URL');
    expect(firstRequest).toContain('/parts/2');
    expect(firstRequest).not.toContain('/parts/1');
    expect(readResumeRecord('project', file)).toBeNull();
  });

  it('keeps ready playback and uploads independent of Stream configuration', () => {
    const ready = renderQuery(
      <ProjectVideoPanel
        projectId="project"
        yearId="2026"
        video={baseVideo}
        canManage={false}
      />,
    );
    expect(screen.getByRole('link', {name: 'watch video'}).getAttribute('href')).toBe(
      '/years/2026/projects/project/video',
    );
    ready.unmount();

    renderQuery(
      <ProjectVideoPanel projectId="project" yearId="2026" video={null} canManage />,
    );
    expect(screen.getByLabelText('select project video')).toBeTruthy();
    expect(screen.getByText(/private R2 storage/i)).toBeTruthy();
  });

  it('requires retirement before a failed video can be replaced', () => {
    renderQuery(
      <ProjectVideoPanel
        projectId="project"
        yearId="2026"
        video={{
          ...baseVideo,
          status: 'failed',
          failureStage: 'processing',
          errorMessage: 'audio decode failed',
        }}
        canManage
      />,
    );
    expect(screen.getByText('audio decode failed')).toBeTruthy();
    expect(screen.queryByLabelText('select project video')).toBeNull();
    expect(screen.getByRole('button', {name: 'retire video'})).toBeTruthy();
  });

  it('attaches authenticated progressive MP4 directly to an HTML video element', async () => {
    const load = vi
      .spyOn(HTMLMediaElement.prototype, 'load')
      .mockImplementation(() => undefined);
    const pause = vi
      .spyOn(HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => undefined);
    const view = renderQuery(
      <IndividualPlayer
        playback={{
          source: {kind: 'mp4', url: '/api/videos/video-1/content'},
          expiresAt: null,
        }}
        title="First project"
      />,
    );
    const video = screen.getByLabelText('First project video') as HTMLVideoElement;
    expect(video.getAttribute('src')).toBe('/api/videos/video-1/content');
    expect(video.preload).toBe('auto');

    video.dispatchEvent(new Event('error'));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'private video could not be loaded',
    );
    view.unmount();
    expect(video.hasAttribute('src')).toBe(false);
    expect(load).toHaveBeenCalled();
    expect(pause).toHaveBeenCalled();
    load.mockRestore();
    pause.mockRestore();
  });

  it('renders accessible empty reel and individual ready-video permalinks', async () => {
    fetchMock.mockResolvedValue(json({videos: playlist}));
    renderRoute(<WatchPage />, '/years/2026/watch', '/years/:yearId/watch');
    expect(await screen.findByRole('heading', {name: 'play the reel'})).toBeTruthy();
    expect(screen.getByRole('button', {name: 'play all'})).toBeTruthy();
    expect(screen.getByText('Ada Lovelace · Grace Hopper')).toBeTruthy();
    expect(screen.getByRole('link', {name: /First project/}).getAttribute('href')).toBe(
      '/years/2026/watch/video-1',
    );

    renderQuery(<ScreeningPlayer playlist={[]} getPlayback={vi.fn()} />);
    expect(screen.getByRole('heading', {name: 'no videos are ready'})).toBeTruthy();
  });

  it('exposes visible pause, skip, fullscreen controls and keyboard shortcuts', async () => {
    const actions = {togglePause: vi.fn(), skip: vi.fn(), fullscreen: vi.fn()};
    for (const [code, key] of [
      ['Space', ' '],
      ['ArrowRight', 'ArrowRight'],
      ['KeyF', 'f'],
    ]) {
      handleScreeningShortcut(
        {code, key, target: document.body, preventDefault: vi.fn()},
        actions,
      );
    }
    expect(actions.togglePause).toHaveBeenCalledOnce();
    expect(actions.skip).toHaveBeenCalledOnce();
    expect(actions.fullscreen).toHaveBeenCalledOnce();

    const requestFullscreen = vi.fn(async () => undefined);
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    });
    renderQuery(<ScreeningPlayer playlist={playlist} getPlayback={vi.fn()} />);
    expect(screen.getByRole('button', {name: /pause/}).hasAttribute('disabled')).toBe(
      true,
    );
    expect(screen.getByRole('button', {name: /skip/}).hasAttribute('disabled')).toBe(
      true,
    );
    await userEvent.click(screen.getByRole('button', {name: /fullscreen/}));
    expect(requestFullscreen).toHaveBeenCalledOnce();
  });
});

function renderQuery(element: React.ReactNode) {
  return render(<QueryClientProvider client={client()}>{element}</QueryClientProvider>);
}

function renderRoute(element: React.ReactNode, path: string, pattern: string) {
  const {hook} = memoryLocation({path});
  return render(
    <Router hook={hook}>
      <QueryClientProvider client={client()}>
        <Route path={pattern}>{element}</Route>
      </QueryClientProvider>
    </Router>,
  );
}

function client() {
  return new QueryClient({defaultOptions: {queries: {retry: false}}});
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {'Content-Type': 'application/json'},
  });
}

const baseVideo: ProjectVideo = {
  id: 'video-1',
  projectId: 'project',
  status: 'ready',
  originalName: 'demo.mp4',
  contentType: 'video/mp4',
  sizeBytes: 5,
  durationSeconds: 30,
  loudnessLufs: -16,
  gainDb: 0,
  errorMessage: null,
  failureStage: null,
  processingAttempt: 1,
  createdAt: '2030-01-01T00:00:00.000Z',
};
const uploadSession: VideoUploadSession = {
  uploadId: 'upload-1',
  videoId: 'video-1',
  projectId: 'project',
  fileName: 'demo.mp4',
  contentType: 'video/mp4',
  fileSize: 5,
  partSize: 50 * 1024 * 1024,
  expiresAt: '2030-01-02T00:00:00.000Z',
  status: 'uploading',
  completedParts: [],
};
const playlist: PlaylistItem[] = [
  {
    videoId: 'video-1',
    projectId: 'project',
    projectName: 'First project',
    teamMembers: ['Ada Lovelace', 'Grace Hopper'],
    durationSeconds: 30,
    gainDb: 0,
    position: 0,
  },
];
