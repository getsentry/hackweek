import type {PlaylistItem, PlaybackResponse} from '../../shared/videos';
import type {PlayerAudioGraph} from './audio';
import {attachMp4, type MediaAttachment} from './media';

export type PlayerPhase = 'idle' | 'title' | 'playing' | 'paused' | 'complete' | 'error';

export interface PlayerState {
  phase: PlayerPhase;
  index: number;
  error: string | null;
  countdownSeconds: number | null;
  currentTime: number;
  durationSeconds: number;
}

export interface ScreeningController {
  start(index?: number): Promise<void>;
  jumpTo(index: number): Promise<void>;
  togglePause(): Promise<void>;
  seek(time: number): void;
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
  errorDurationMs = 1_800,
  attach = attachMp4,
}: {
  playlist: PlaylistItem[];
  elements: [HTMLVideoElement, HTMLVideoElement];
  audio: PlayerAudioGraph;
  getPlayback: (videoId: string) => Promise<PlaybackResponse>;
  onState: (state: PlayerState) => void;
  titleDurationMs?: number;
  errorDurationMs?: number;
  attach?: typeof attachMp4;
}): ScreeningController {
  let index = 0;
  let active: 0 | 1 = 0;
  let phase: PlayerPhase = 'idle';
  let countdownSeconds: number | null = null;
  let currentTime = 0;
  let durationSeconds = playlist[0]?.durationSeconds ?? 0;
  let destroyed = false;
  let operation = 0;
  let transitionTimer: ReturnType<typeof setTimeout> | null = null;
  let countdownTimer: ReturnType<typeof setInterval> | null = null;
  const attachments: [MediaAttachment | null, MediaAttachment | null] = [null, null];
  const attachedVideoIds: [string | null, string | null] = [null, null];
  const slotOperations: [number, number] = [0, 0];
  const notify = (error: string | null = null) =>
    onState({phase, index, error, countdownSeconds, currentTime, durationSeconds});

  const endedHandlers = elements.map((_element, slot) => () => {
    if (phase === 'playing' && slot === active) void advance();
  });
  const progressHandlers = elements.map((element, slot) => () => {
    if (slot !== active) return;
    currentTime = finiteMediaTime(element.currentTime, currentTime);
    durationSeconds = finiteMediaTime(
      element.duration,
      playlist[index]?.durationSeconds ?? durationSeconds,
    );
    notify();
  });
  elements.forEach((element, slot) => {
    element.addEventListener('ended', endedHandlers[slot]);
    element.addEventListener('timeupdate', progressHandlers[slot]);
    element.addEventListener('durationchange', progressHandlers[slot]);
  });

  function clearTransitionTimers() {
    if (transitionTimer) clearTimeout(transitionTimer);
    if (countdownTimer) clearInterval(countdownTimer);
    transitionTimer = null;
    countdownTimer = null;
    countdownSeconds = null;
  }

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

  function beginTitleCountdown(currentOperation: number) {
    const endsAt = Date.now() + titleDurationMs;
    countdownSeconds = Math.max(1, Math.ceil(titleDurationMs / 1_000));
    notify();
    countdownTimer = setInterval(() => {
      if (destroyed || currentOperation !== operation || phase !== 'title') return;
      const next = Math.max(1, Math.ceil((endsAt - Date.now()) / 1_000));
      if (next !== countdownSeconds) {
        countdownSeconds = next;
        notify();
      }
    }, 100);
    transitionTimer = setTimeout(() => {
      clearTransitionTimers();
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

  async function playCurrent() {
    if (destroyed) return;
    clearTransitionTimers();
    const currentOperation = ++operation;
    currentTime = 0;
    durationSeconds = playlist[index]?.durationSeconds ?? 0;
    phase = 'title';
    notify();
    await prepare(index, active);
    if (destroyed || currentOperation !== operation || phase !== 'title') return;
    elements[active].currentTime = 0;

    const nextSlot = active === 0 ? 1 : 0;
    void prepare(index + 1, nextSlot).catch(() => undefined);
    beginTitleCountdown(currentOperation);
  }

  async function advance() {
    operation += 1;
    clearTransitionTimers();
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
    clearTransitionTimers();
    elements[active].pause();
    phase = 'error';
    notify(message);
    const failedOperation = operation;
    transitionTimer = setTimeout(() => {
      transitionTimer = null;
      if (destroyed || failedOperation !== operation || phase !== 'error') return;
      void advance();
    }, errorDurationMs);
  }

  async function playFrom(nextIndex: number) {
    if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= playlist.length)
      return;
    operation += 1;
    clearTransitionTimers();
    elements[active].pause();
    index = nextIndex;
    active = (nextIndex % 2) as 0 | 1;
    await audio.resume();
    await playCurrent().catch((error: unknown) =>
      fail(error instanceof Error ? error.message : 'playback could not start'),
    );
  }

  return {
    async start(startIndex = 0) {
      if (!playlist.length || phase !== 'idle') return;
      await playFrom(startIndex);
    },
    async jumpTo(nextIndex) {
      if (!playlist.length) return;
      await playFrom(nextIndex);
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
    seek(time) {
      if (!['playing', 'paused'].includes(phase) || !Number.isFinite(time)) return;
      const next = Math.max(0, Math.min(time, durationSeconds));
      elements[active].currentTime = next;
      currentTime = next;
      notify();
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
      clearTransitionTimers();
      elements.forEach((element, slot) => {
        element.pause();
        element.removeEventListener('ended', endedHandlers[slot]);
        element.removeEventListener('timeupdate', progressHandlers[slot]);
        element.removeEventListener('durationchange', progressHandlers[slot]);
      });
      attachments.forEach((attachment) => attachment?.destroy());
      void audio.close();
    },
  };
}

function finiteMediaTime(value: number, fallback: number) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
