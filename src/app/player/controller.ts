import type {PlaylistItem, PlaybackResponse} from '../../shared/videos';
import type {PlayerAudioGraph} from './audio';
import {attachProtectedHls, type MediaAttachment} from './media';

export type PlayerPhase = 'idle' | 'title' | 'playing' | 'paused' | 'complete' | 'error';

export interface PlayerState {
  phase: PlayerPhase;
  index: number;
  error: string | null;
}

export interface ScreeningController {
  start(): Promise<void>;
  togglePause(): Promise<void>;
  skip(): Promise<void>;
  destroy(): void;
}

export function createScreeningController({
  playlist,
  elements,
  audio,
  getPlayback,
  onState,
  titleDurationMs = 1_800,
  attach = attachProtectedHls,
}: {
  playlist: PlaylistItem[];
  elements: [HTMLVideoElement, HTMLVideoElement];
  audio: PlayerAudioGraph;
  getPlayback: (videoId: string) => Promise<PlaybackResponse>;
  onState: (state: PlayerState) => void;
  titleDurationMs?: number;
  attach?: typeof attachProtectedHls;
}): ScreeningController {
  let index = 0;
  let active: 0 | 1 = 0;
  let phase: PlayerPhase = 'idle';
  let destroyed = false;
  let titleTimer: ReturnType<typeof setTimeout> | null = null;
  const attachments: [MediaAttachment | null, MediaAttachment | null] = [null, null];
  const attachedVideoIds: [string | null, string | null] = [null, null];
  const notify = (error: string | null = null) => onState({phase, index, error});

  const onEnded = () => {
    if (phase === 'playing') void advance();
  };
  elements.forEach((element) => element.addEventListener('ended', onEnded));

  async function prepare(clipIndex: number, slot: 0 | 1) {
    const clip = playlist[clipIndex];
    if (!clip || attachedVideoIds[slot] === clip.videoId) return;
    const playback = await getPlayback(clip.videoId);
    if (!playback.manifestUrl) {
      throw new Error(
        playback.mode === 'fake'
          ? 'local fake Stream does not provide playable HLS'
          : 'protected playback is unavailable',
      );
    }
    attachments[slot]?.destroy();
    elements[slot].pause();
    elements[slot].removeAttribute('src');
    attach(elements[slot], playback.manifestUrl, undefined, fail);
    attachedVideoIds[slot] = clip.videoId;
    audio.setGain(slot, clip.gainDb);
  }

  async function playCurrent() {
    if (destroyed) return;
    phase = 'title';
    notify();
    await prepare(index, active);
    void prepare(index + 1, active === 0 ? 1 : 0).catch(() => undefined);
    titleTimer = setTimeout(() => {
      if (destroyed || phase !== 'title') return;
      phase = 'playing';
      notify();
      void elements[active]
        .play()
        .catch((error: unknown) =>
          fail(error instanceof Error ? error.message : 'playback could not start'),
        );
    }, titleDurationMs);
  }

  async function advance() {
    elements[active].pause();
    if (index >= playlist.length - 1) {
      phase = 'complete';
      notify();
      return;
    }
    index += 1;
    active = active === 0 ? 1 : 0;
    await playCurrent();
  }

  function fail(message: string) {
    phase = 'error';
    notify(message);
  }

  return {
    async start() {
      if (!playlist.length) return;
      await audio.resume();
      await playCurrent().catch((error: unknown) =>
        fail(error instanceof Error ? error.message : 'playback could not start'),
      );
    },
    async togglePause() {
      if (phase === 'playing') {
        elements[active].pause();
        phase = 'paused';
        notify();
      } else if (phase === 'paused') {
        await audio.resume();
        await elements[active].play();
        phase = 'playing';
        notify();
      }
    },
    async skip() {
      if (phase === 'idle' || phase === 'complete') return;
      if (titleTimer) clearTimeout(titleTimer);
      await advance();
    },
    destroy() {
      destroyed = true;
      if (titleTimer) clearTimeout(titleTimer);
      elements.forEach((element) => {
        element.pause();
        element.removeEventListener('ended', onEnded);
      });
      attachments.forEach((attachment) => attachment?.destroy());
      void audio.close();
    },
  };
}
