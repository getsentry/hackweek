import type {PlaylistItem, PlaybackResponse} from '../../shared/videos';
import type {PlayerAudioGraph} from './audio';
import {attachMp4, type MediaAttachment} from './media';

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
  attach = attachMp4,
}: {
  playlist: PlaylistItem[];
  elements: [HTMLVideoElement, HTMLVideoElement];
  audio: PlayerAudioGraph;
  getPlayback: (videoId: string) => Promise<PlaybackResponse>;
  onState: (state: PlayerState) => void;
  titleDurationMs?: number;
  attach?: typeof attachMp4;
}): ScreeningController {
  let index = 0;
  let active: 0 | 1 = 0;
  let phase: PlayerPhase = 'idle';
  let destroyed = false;
  let operation = 0;
  let titleTimer: ReturnType<typeof setTimeout> | null = null;
  const attachments: [MediaAttachment | null, MediaAttachment | null] = [null, null];
  const attachedVideoIds: [string | null, string | null] = [null, null];
  const slotOperations: [number, number] = [0, 0];
  const notify = (error: string | null = null) => onState({phase, index, error});

  const endedHandlers = elements.map((_element, slot) => () => {
    if (phase === 'playing' && slot === active) void advance();
  });
  elements.forEach((element, slot) =>
    element.addEventListener('ended', endedHandlers[slot]),
  );

  async function prepare(clipIndex: number, slot: 0 | 1) {
    const clip = playlist[clipIndex];
    if (!clip || attachedVideoIds[slot] === clip.videoId) return;
    const slotOperation = ++slotOperations[slot];
    const playback = await getPlayback(clip.videoId);
    if (destroyed || slotOperation !== slotOperations[slot]) return;
    if (playback.source.kind !== 'mp4') {
      throw new Error('protected MP4 playback is unavailable');
    }

    attachments[slot]?.destroy();
    attachments[slot] = null;
    attachedVideoIds[slot] = null;
    const attachment = attach(
      elements[slot],
      playback.source.url,
      undefined,
      (message) => {
        if (destroyed || slotOperation !== slotOperations[slot]) return;
        attachments[slot]?.destroy();
        attachments[slot] = null;
        attachedVideoIds[slot] = null;
        if (slot === active && clipIndex === index) fail(message);
      },
    );
    if (destroyed || slotOperation !== slotOperations[slot]) {
      attachment.destroy();
      return;
    }
    attachments[slot] = attachment;
    attachedVideoIds[slot] = clip.videoId;
    audio.setGain(slot, clip.gainDb);
  }

  async function playCurrent() {
    if (destroyed) return;
    const currentOperation = ++operation;
    phase = 'title';
    notify();
    await prepare(index, active);
    if (destroyed || currentOperation !== operation || phase !== 'title') return;

    const nextSlot = active === 0 ? 1 : 0;
    void prepare(index + 1, nextSlot).catch(() => undefined);
    titleTimer = setTimeout(() => {
      titleTimer = null;
      if (destroyed || currentOperation !== operation || phase !== 'title') return;
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
    operation += 1;
    if (titleTimer) {
      clearTimeout(titleTimer);
      titleTimer = null;
    }
    elements[active].pause();
    if (index >= playlist.length - 1) {
      phase = 'complete';
      notify();
      return;
    }
    index += 1;
    active = active === 0 ? 1 : 0;
    await playCurrent().catch((error: unknown) =>
      fail(error instanceof Error ? error.message : 'playback could not start'),
    );
  }

  function fail(message: string) {
    operation += 1;
    if (titleTimer) {
      clearTimeout(titleTimer);
      titleTimer = null;
    }
    elements[active].pause();
    phase = 'error';
    notify(message);
  }

  return {
    async start() {
      if (!playlist.length || phase !== 'idle') return;
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
        try {
          await audio.resume();
          await elements[active].play();
          phase = 'playing';
          notify();
        } catch (error) {
          fail(error instanceof Error ? error.message : 'playback could not resume');
        }
      }
    },
    async skip() {
      if (phase === 'idle' || phase === 'complete') return;
      await advance();
    },
    destroy() {
      destroyed = true;
      operation += 1;
      slotOperations[0] += 1;
      slotOperations[1] += 1;
      if (titleTimer) clearTimeout(titleTimer);
      elements.forEach((element, slot) => {
        element.pause();
        element.removeEventListener('ended', endedHandlers[slot]);
      });
      attachments.forEach((attachment) => attachment?.destroy());
      void audio.close();
    },
  };
}
