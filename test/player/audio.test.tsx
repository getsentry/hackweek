/* eslint-disable typescript/unbound-method -- audio node methods are Vitest spies in this fake */
import {describe, expect, it, vi} from 'vitest';

import {
  clampGainDb,
  createPlayerAudioGraph,
  gainDbToLinear,
  type PlayerAudioContext,
} from '../../src/app/player/audio';

describe('screening audio graph', () => {
  it('uses exact dB conversion after clamping server metadata', () => {
    expect(gainDbToLinear(6)).toBeCloseTo(10 ** (6 / 20), 12);
    expect(gainDbToLinear(99)).toBeCloseTo(10 ** (12 / 20), 12);
    expect(clampGainDb(-99)).toBe(-12);
  });

  it('creates one context, per-element gains, and one shared limiter resumed by gesture', async () => {
    const destination: AudioDestinationNode = Object.create(null);
    const limiter: DynamicsCompressorNode = Object.assign(Object.create(null), {
      connect: vi.fn(),
      threshold: {value: 0},
      knee: {value: 0},
      ratio: {value: 0},
      attack: {value: 0},
      release: {value: 0},
    });
    const gains: [GainNode, GainNode] = [gainNode(), gainNode()];
    const sources: [MediaElementAudioSourceNode, MediaElementAudioSourceNode] = [
      mediaSourceNode(),
      mediaSourceNode(),
    ];
    const resume = vi.fn(async () => undefined);
    const close = vi.fn(async () => undefined);
    let sourceIndex = 0;
    let gainIndex = 0;
    const createContext = vi.fn(
      (): PlayerAudioContext => ({
        state: 'suspended',
        destination,
        createDynamicsCompressor: () => limiter,
        createMediaElementSource: () => sources[sourceIndex++],
        createGain: () => gains[gainIndex++],
        resume,
        close,
      }),
    );

    const graph = createPlayerAudioGraph(
      [document.createElement('video'), document.createElement('video')],
      createContext,
    );
    graph.setGain(1, 6);
    await graph.resume();

    expect(createContext).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sources[0].connect).mock.calls[0]?.[0]).toBe(gains[0]);
    expect(vi.mocked(sources[1].connect).mock.calls[0]?.[0]).toBe(gains[1]);
    expect(vi.mocked(gains[0].connect).mock.calls[0]?.[0]).toBe(limiter);
    expect(vi.mocked(gains[1].connect).mock.calls[0]?.[0]).toBe(limiter);
    expect(vi.mocked(limiter.connect).mock.calls[0]?.[0]).toBe(destination);
    expect(gains[1].gain.value).toBeCloseTo(10 ** (6 / 20));
    expect(resume).toHaveBeenCalledOnce();
  });
});

function mediaSourceNode(): MediaElementAudioSourceNode {
  return Object.assign(Object.create(null), {connect: vi.fn()});
}

function gainNode(): GainNode {
  return Object.assign(Object.create(null), {
    connect: vi.fn(),
    gain: {value: 1},
  });
}
