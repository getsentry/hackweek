export const MIN_GAIN_DB = -12;
export const MAX_GAIN_DB = 12;

export function clampGainDb(gainDb: number) {
  return Math.max(MIN_GAIN_DB, Math.min(MAX_GAIN_DB, gainDb));
}

export function gainDbToLinear(gainDb: number) {
  return 10 ** (clampGainDb(gainDb) / 20);
}

export interface PlayerAudioGraph {
  resume(): Promise<void>;
  setGain(elementIndex: 0 | 1, gainDb: number): void;
  close(): Promise<void>;
}

export function createPlayerAudioGraph(
  elements: [HTMLVideoElement, HTMLVideoElement],
  AudioContextClass: typeof AudioContext = window.AudioContext,
): PlayerAudioGraph {
  const context = new AudioContextClass();
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 6;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(context.destination);

  const gains = elements.map((element) => {
    const source = context.createMediaElementSource(element);
    const gain = context.createGain();
    source.connect(gain);
    gain.connect(limiter);
    return gain;
  }) as [GainNode, GainNode];

  return {
    async resume() {
      if (context.state !== 'running') await context.resume();
    },
    setGain(index, gainDb) {
      gains[index].gain.value = gainDbToLinear(gainDb);
    },
    async close() {
      if (context.state !== 'closed') await context.close();
    },
  };
}
