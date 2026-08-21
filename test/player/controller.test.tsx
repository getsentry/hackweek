/* eslint-disable typescript/unbound-method -- media methods are Vitest spies in this fake */
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {
  createScreeningController,
  type PlayerState,
} from '../../src/app/player/controller';
import type {PlayerAudioGraph} from '../../src/app/player/audio';
import type {PlaylistItem} from '../../src/shared/videos';

beforeEach(() => vi.useFakeTimers());

describe('dual screening controller', () => {
  it('preloads N+1, applies gain, and advances only when media ends', async () => {
    const videos: [HTMLVideoElement, HTMLVideoElement] = [fakeVideo(), fakeVideo()];
    const states: PlayerState[] = [];
    const attached: string[] = [];
    const audio = fakeAudio();
    vi.mocked(audio.resume)
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(() => new Promise<void>(() => undefined));
    const controller = createScreeningController({
      playlist,
      elements: videos,
      audio,
      getPlayback: async (videoId) => ({
        source: {kind: 'mp4', url: `/api/videos/${videoId}/content`},
        expiresAt: null,
      }),
      attach: (_element, url) => {
        attached.push(url);
        return {destroy: vi.fn()};
      },
      onState: (state) => states.push(state),
    });

    await controller.start();
    await Promise.resolve();
    expect(states.at(-1)).toMatchObject({phase: 'title', countdownSeconds: 5});
    expect(attached).toEqual([
      '/api/videos/video-1/content',
      '/api/videos/video-2/content',
    ]);
    expect(vi.mocked(audio.setGain).mock.calls).toEqual([
      [0, 6],
      [1, -3],
    ]);
    expect(states.at(-1)?.index).toBe(0);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(states.at(-1)?.phase).toBe('title');
    await vi.advanceTimersByTimeAsync(1);
    expect(states.at(-1)?.phase).toBe('playing');
    expect(vi.mocked(videos[0].play).mock.calls).toHaveLength(1);
    expect(states.at(-1)?.index).toBe(0);

    controller.seek(4.5);
    expect(videos[0].currentTime).toBe(4.5);
    expect(states.at(-1)).toMatchObject({currentTime: 4.5, durationSeconds: 10});

    videos[1].dispatchEvent(new Event('ended'));
    await Promise.resolve();
    expect(states.at(-1)?.index).toBe(0);

    videos[0].dispatchEvent(new Event('ended'));
    await Promise.resolve();
    expect(audio.resume).toHaveBeenCalledTimes(2);
    expect(states.at(-1)?.phase).toBe('title');
    expect(states.at(-1)?.index).toBe(1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(vi.mocked(videos[1].play).mock.calls).toHaveLength(1);

    videos[1].dispatchEvent(new Event('ended'));
    await Promise.resolve();
    expect(states.at(-1)?.phase).toBe('complete');
  });

  it('supports pause, resume, explicit skip, and recoverable source errors', async () => {
    const videos: [HTMLVideoElement, HTMLVideoElement] = [fakeVideo(), fakeVideo()];
    const states: PlayerState[] = [];
    const controller = createScreeningController({
      playlist,
      elements: videos,
      audio: fakeAudio(),
      getPlayback: async () => ({
        source: {kind: 'mp4', url: '/api/videos/video/content'},
        expiresAt: null,
      }),
      attach: () => ({destroy: vi.fn()}),
      onState: (state) => states.push(state),
      titleDurationMs: 1,
    });
    await controller.start();
    await vi.advanceTimersByTimeAsync(1);
    await controller.togglePause();
    expect(states.at(-1)?.phase).toBe('paused');
    await controller.togglePause();
    expect(states.at(-1)?.phase).toBe('playing');
    await controller.skip();
    expect(states.at(-1)?.index).toBe(1);
    await controller.jumpTo(0);
    expect(states.at(-1)).toMatchObject({phase: 'title', index: 0});

    const errors: PlayerState[] = [];
    const errorVideos: [HTMLVideoElement, HTMLVideoElement] = [fakeVideo(), fakeVideo()];
    const errorController = createScreeningController({
      playlist,
      elements: errorVideos,
      audio: fakeAudio(),
      getPlayback: async (videoId) => {
        if (videoId === 'video-1') throw new Error('private source unavailable');
        return {
          source: {kind: 'mp4' as const, url: '/api/videos/video-2/content'},
          expiresAt: null,
        };
      },
      attach: () => ({destroy: vi.fn()}),
      onState: (state) => errors.push(state),
      titleDurationMs: 1,
      errorDurationMs: 10,
    });
    await errorController.start();
    expect(errors.at(-1)).toMatchObject({
      phase: 'error',
      error: 'private source unavailable',
    });
    errorVideos[0].dispatchEvent(new Event('durationchange'));
    expect(errors.at(-1)).toMatchObject({
      phase: 'error',
      error: 'private source unavailable',
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(errors.at(-1)).toMatchObject({phase: 'title', index: 1});
  });
});

function fakeVideo() {
  const video = document.createElement('video');
  Object.defineProperties(video, {
    play: {value: vi.fn(async () => undefined)},
    pause: {value: vi.fn()},
    load: {value: vi.fn()},
  });
  return video;
}

function fakeAudio(): PlayerAudioGraph {
  return {
    resume: vi.fn(async () => undefined),
    setGain: vi.fn(),
    close: vi.fn(async () => undefined),
  };
}

const playlist: PlaylistItem[] = [
  {
    videoId: 'video-1',
    projectId: 'project-1',
    projectName: 'First',
    groupId: 'europe',
    groupName: 'Europe',
    teamMembers: [
      {id: 'ada', displayName: 'Ada', avatarUrl: null},
      {id: 'grace', displayName: 'Grace', avatarUrl: null},
    ],
    durationSeconds: 10,
    gainDb: 6,
    position: 0,
  },
  {
    videoId: 'video-2',
    projectId: 'project-2',
    projectName: 'Second',
    groupId: 'americas',
    groupName: 'Americas',
    teamMembers: [{id: 'linus', displayName: 'Linus', avatarUrl: null}],
    durationSeconds: 20,
    gainDb: -3,
    position: 1,
  },
];
