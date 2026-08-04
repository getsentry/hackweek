import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Route, Router} from 'wouter';
import {memoryLocation} from 'wouter/memory-location';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {
  handleScreeningShortcut,
  ScreeningPlayer,
} from '../../src/app/player/ScreeningPlayer';
import {WatchPage} from '../../src/app/routes/WatchPage';
import {ProjectVideoPanel} from '../../src/app/video/ProjectVideoPanel';
import type {ResumableUpload, UploadSnapshot} from '../../src/app/video/upload';
import type {PlaylistItem, ProjectVideo} from '../../src/shared/videos';

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', fetchMock);
vi.stubGlobal(
  'confirm',
  vi.fn(() => true),
);

afterEach(() => fetchMock.mockReset());

describe('video user experience', () => {
  it('shows resumable upload progress controls through a local fake tus event adapter', async () => {
    fetchMock.mockImplementation(async (_input, init) => {
      if (init?.method === 'POST') {
        return json(
          {
            video: {...baseVideo, status: 'uploading'},
            upload: {
              protocol: 'tus',
              url: 'https://upload.test/files/one',
              expiresAt: 'later',
              chunkSize: 1024,
            },
          },
          201,
        );
      }
      return json({});
    });
    const uploadFactory = (
      file: File,
      _url: string,
      _chunkSize: number,
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

  it('keeps failed owner state visible with retry/replacement/delete actions', () => {
    renderQuery(
      <ProjectVideoPanel
        projectId="project"
        yearId="2026"
        video={{
          ...baseVideo,
          status: 'failed',
          failureStage: 'measurement',
          errorMessage: 'audio decode failed',
        }}
        canManage
      />,
    );
    expect(screen.getByText('audio decode failed')).toBeTruthy();
    expect(screen.getByLabelText('choose replacement video')).toBeTruthy();
    expect(screen.getByRole('button', {name: 'retry measurement'})).toBeTruthy();
    expect(screen.getByRole('button', {name: 'delete video'})).toBeTruthy();
  });

  it('renders accessible empty reel and individual ready-video permalinks', async () => {
    fetchMock.mockResolvedValue(json({videos: playlist}));
    renderRoute(<WatchPage />, '/years/2026/watch', '/years/:yearId/watch');
    expect(await screen.findByRole('heading', {name: 'play the reel'})).toBeTruthy();
    expect(screen.getByRole('button', {name: 'play all'})).toBeTruthy();
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
  streamUid: 'stream',
  sourceMediaId: null,
  status: 'ready',
  durationSeconds: 30,
  loudnessLufs: -16,
  gainDb: 0,
  errorMessage: null,
  failureStage: null,
  archiveStatus: 'pending',
  archiveError: null,
};
const playlist: PlaylistItem[] = [
  {
    videoId: 'video-1',
    projectId: 'project',
    projectName: 'First project',
    durationSeconds: 30,
    gainDb: 0,
    position: 0,
  },
];
