import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {act, render, screen, within} from '@testing-library/react';
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
    let finishUpload: (() => void) | undefined;
    const uploadFactory = (
      file: File,
      _session: VideoUploadSession,
      onChange: (snapshot: UploadSnapshot) => void,
    ): ResumableUpload => {
      finishUpload = () =>
        onChange({
          phase: 'complete',
          bytesSent: file.size,
          bytesTotal: file.size,
          error: null,
        });
      return {
        start: () =>
          onChange({
            phase: 'uploading',
            bytesSent: 2,
            bytesTotal: file.size,
            error: null,
          }),
        pause: async () =>
          onChange({phase: 'paused', bytesSent: 2, bytesTotal: file.size, error: null}),
        resume: () =>
          onChange({
            phase: 'uploading',
            bytesSent: 2,
            bytesTotal: file.size,
            error: null,
          }),
        retry: () =>
          onChange({
            phase: 'uploading',
            bytesSent: 2,
            bytesTotal: file.size,
            error: null,
          }),
      };
    };

    renderQuery(
      <ProjectVideoPanel
        projectId="project"
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

    await act(async () => finishUpload?.());
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('does not start another part when pause races a completed request', async () => {
    const file = new File(['abcdef'], 'pause.mp4', {type: 'video/mp4'});
    const session = {...uploadSession, fileSize: file.size, partSize: 3};
    let resolveFirstPart: ((response: Response) => void) | undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFirstPart = resolve;
        }),
    );
    const snapshots: UploadSnapshot[] = [];
    const upload = createMultipartUpload(file, session, (snapshot) =>
      snapshots.push(snapshot),
    );

    upload.start();
    await vi.waitFor(() => expect(resolveFirstPart).toBeTypeOf('function'));
    resolveFirstPart?.(
      json({part: {partNumber: 1, etag: 'first', sizeBytes: session.partSize}}),
    );
    await upload.pause();

    await vi.waitFor(() =>
      expect(snapshots.at(-1)).toMatchObject({phase: 'paused', bytesSent: 3}),
    );
    expect(fetchMock).toHaveBeenCalledOnce();
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
    const firstUrl =
      firstRequest instanceof Request ? firstRequest.url : firstRequest.toString();
    expect(firstUrl).toContain('/parts/2');
    expect(firstUrl).not.toContain('/parts/1');
    expect(readResumeRecord('project', file)).toBeNull();
  });

  it('removes redundant ready status, watch link, and storage fine print', () => {
    const ready = renderQuery(
      <ProjectVideoPanel projectId="project" video={baseVideo} canManage />,
    );
    expect(screen.queryByRole('link', {name: 'watch video'})).toBeNull();
    expect(screen.queryByText('ready to watch')).toBeNull();
    expect(screen.queryByText(/private R2 storage/i)).toBeNull();
    expect(
      screen.getByRole('button', {name: 'delete video'}).closest('header'),
    ).not.toBeNull();
    ready.unmount();

    renderQuery(<ProjectVideoPanel projectId="project" video={null} canManage />);
    expect(screen.getByLabelText('select project video')).toBeTruthy();
    expect(screen.queryByText(/private R2 storage/i)).toBeNull();
  });

  it('shows the live conversion stage and progress', () => {
    renderQuery(
      <ProjectVideoPanel
        projectId="project"
        video={{
          ...baseVideo,
          status: 'processing',
          processingStage: 'transcoding',
          processingProgress: 63,
        }}
        canManage
      />,
    );

    expect(screen.getByText('converting video')).toBeTruthy();
    expect(screen.getByText('63%')).toBeTruthy();
    expect(
      screen.getByRole('progressbar', {name: 'video conversion progress'}),
    ).toHaveProperty('value', 63);
    expect(screen.getByText('processing continues in the background.')).toBeTruthy();
  });

  it('retries failed processing without requiring another upload', async () => {
    fetchMock.mockResolvedValue(
      json({video: {...baseVideo, status: 'queued', processingAttempt: 2}}, 202),
    );
    renderQuery(
      <ProjectVideoPanel
        projectId="project"
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
    await userEvent.click(screen.getByRole('button', {name: 'retry processing'}));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project/video/retry',
      expect.objectContaining({method: 'POST'}),
    );
    expect(screen.getByRole('button', {name: 'delete video'})).toBeTruthy();
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
    const video = screen.getByLabelText('First project video');
    expect(video).toBeInstanceOf(HTMLVideoElement);
    if (!(video instanceof HTMLVideoElement)) throw new Error();
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

  it('renders the reel playlist with shared project rows and resume controls', async () => {
    fetchMock.mockImplementation(async () => json({videos: playlist}));
    const reel = renderRoute(<WatchPage />, '/years/2026/watch', '/years/:yearId/watch');
    expect(await screen.findByRole('heading', {name: 'play the reel'})).toBeTruthy();
    expect(screen.getByRole('img', {name: 'Hackweek 2026'})).toBeTruthy();
    expect(screen.getByRole('button', {name: 'play all'})).toBeTruthy();
    expect(screen.getByRole('heading', {name: 'choose a group'})).toBeTruthy();
    expect(
      screen.getByText('2 ready videos · 1:25 total · 0:10 interludes'),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('button', {
          name: 'all groups 2 videos 1:25 total · 0:10 interludes',
        })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByRole('button', {
        name: 'Europe 1 video 0:35 total · 0:05 interludes',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: 'Americas 1 video 0:50 total · 0:05 interludes',
      }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', {name: 'playlist'})).toBeTruthy();
    expect(screen.getByText('Ada Lovelace · Grace Hopper')).toBeTruthy();
    const firstRow = screen
      .getByRole('button', {name: 'start reel from First project'})
      .closest('.projectRow');
    if (!(firstRow instanceof HTMLElement)) throw new Error('Expected a project row');
    expect(within(firstRow).getByRole('heading', {name: 'First project'})).toBeTruthy();
    expect(within(firstRow).getByLabelText('Ada Lovelace, Grace Hopper')).toBeTruthy();
    expect(within(firstRow).getByText('AL')).toBeTruthy();
    expect(within(firstRow).getByText('GH')).toBeTruthy();
    expect(
      screen.queryByText(
        'private progressive MP4 playback in the curated screening order.',
      ),
    ).toBeNull();

    await userEvent.click(
      screen.getByRole('button', {
        name: 'Europe 1 video 0:35 total · 0:05 interludes',
      }),
    );
    expect(
      screen
        .getByRole('button', {
          name: 'Europe 1 video 0:35 total · 0:05 interludes',
        })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getByText('1 ready video · 0:35 total · 0:05 interludes')).toBeTruthy();
    expect(screen.getByRole('heading', {name: 'Europe playlist'})).toBeTruthy();
    expect(
      screen.getByRole('button', {name: 'start reel from First project'}),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', {name: 'start reel from Second project'}),
    ).toBeNull();
    reel.unmount();

    renderRoute(<WatchPage />, '/years/2026/watch?from=video-2', '/years/:yearId/watch');
    expect(
      await screen.findByRole('button', {name: 'play from Second project'}),
    ).toBeTruthy();

    renderQuery(<ScreeningPlayer yearId="2026" playlist={[]} getPlayback={vi.fn()} />);
    expect(screen.getByRole('heading', {name: 'no videos are ready'})).toBeTruthy();
  });

  it('falls back safely when a refreshed playlist removes the selected clip', () => {
    const view = render(
      <ScreeningPlayer
        yearId="2026"
        playlist={playlist}
        initialVideoId="video-2"
        getPlayback={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', {name: 'play from Second project'})).toBeTruthy();

    view.rerender(
      <ScreeningPlayer
        yearId="2026"
        playlist={[playlist[0]]}
        initialVideoId="video-2"
        getPlayback={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', {name: 'play all'})).toBeTruthy();
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
    handleScreeningShortcut(
      {
        code: 'Space',
        key: ' ',
        target: document.createElement('select'),
        preventDefault: vi.fn(),
      },
      actions,
    );
    expect(actions.togglePause).toHaveBeenCalledOnce();

    const requestFullscreen = vi.fn(async () => undefined);
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    });
    renderQuery(
      <ScreeningPlayer yearId="2026" playlist={playlist} getPlayback={vi.fn()} />,
    );
    const timeline = screen.getByRole('slider', {name: 'video position'});
    expect(timeline.hasAttribute('disabled')).toBe(true);
    expect(timeline.getAttribute('max')).toBe('30');
    expect(screen.getByRole('button', {name: /pause/}).hasAttribute('disabled')).toBe(
      true,
    );
    expect(screen.getByRole('button', {name: /skip/}).hasAttribute('disabled')).toBe(
      true,
    );
    const speed = screen.getByRole('combobox', {name: 'playback speed'});
    expect(speed).toBeInstanceOf(HTMLSelectElement);
    expect(
      [...speed.querySelectorAll('option')].map((option) => option.getAttribute('value')),
    ).toEqual(['1', '1.15', '1.25', '1.5', '2']);
    await userEvent.selectOptions(speed, '1.5');
    expect(speed).toHaveProperty('value', '1.5');
    expect(
      [...document.querySelectorAll('video')].every(
        (video) => video.playbackRate === 1.5,
      ),
    ).toBe(true);
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

function json<T>(value: T, status = 200) {
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
  processingStage: null,
  processingProgress: null,
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
    groupId: 'europe',
    groupName: 'Europe',
    teamMembers: [
      {id: 'ada', displayName: 'Ada Lovelace', avatarUrl: null},
      {id: 'grace', displayName: 'Grace Hopper', avatarUrl: null},
    ],
    durationSeconds: 30,
    gainDb: 0,
    position: 0,
  },
  {
    videoId: 'video-2',
    projectId: 'project-2',
    projectName: 'Second project',
    groupId: 'americas',
    groupName: 'Americas',
    teamMembers: [{id: 'linus', displayName: 'Linus Torvalds', avatarUrl: null}],
    durationSeconds: 45,
    gainDb: -1,
    position: 1,
  },
];
