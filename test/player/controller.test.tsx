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
      titleDurationMs: 10,
    });

    await controller.start();
    await Promise.resolve();
    expect(states.at(-1)?.phase).toBe('title');
    expect(attached).toEqual([
      '/api/videos/video-1/content',
      '/api/videos/video-2/content',
    ]);
    expect(vi.mocked(audio.setGain).mock.calls).toEqual([
      [0, 6],
      [1, -3],
    ]);
    expect(states.at(-1)?.index).toBe(0);

    await vi.advanceTimersByTimeAsync(10);
    expect(states.at(-1)?.phase).toBe('playing');
    expect(vi.mocked(videos[0].play).mock.calls).toHaveLength(1);
    expect(states.at(-1)?.index).toBe(0);

    videos[1].dispatchEvent(new Event('ended'));
    await Promise.resolve();
    expect(states.at(-1)?.index).toBe(0);

    videos[0].dispatchEvent(new Event('ended'));
    await Promise.resolve();
    expect(states.at(-1)?.phase).toBe('title');
    expect(states.at(-1)?.index).toBe(1);
    await vi.advanceTimersByTimeAsync(10);
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

    const errors: PlayerState[] = [];
    const errorController = createScreeningController({
      playlist: [playlist[0]],
      elements: [fakeVideo(), fakeVideo()],
      audio: fakeAudio(),
      getPlayback: async () => {
        throw new Error('private source unavailable');
      },
      onState: (state) => errors.push(state),
      titleDurationMs: 1,
    });
    await errorController.start();
    expect(errors.at(-1)).toMatchObject({
      phase: 'error',
      error: 'private source unavailable',
    });
    await errorController.skip();
    expect(errors.at(-1)?.phase).toBe('complete');
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
    teamMembers: ['Ada', 'Grace'],
    durationSeconds: 10,
    gainDb: 6,
    position: 0,
  },
  {
    videoId: 'video-2',
    projectId: 'project-2',
    projectName: 'Second',
    teamMembers: ['Linus'],
    durationSeconds: 20,
    gainDb: -3,
    position: 1,
  },
];
