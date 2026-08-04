/* eslint-disable typescript/unbound-method -- audio node methods are Vitest spies in this fake */
import {describe, expect, it, vi} from 'vitest';

import {
  clampGainDb,
  createPlayerAudioGraph,
  gainDbToLinear,
} from '../../src/app/player/audio';

describe('screening audio graph', () => {
  it('uses exact dB conversion after clamping server metadata', () => {
    expect(gainDbToLinear(6)).toBeCloseTo(10 ** (6 / 20), 12);
    expect(gainDbToLinear(99)).toBeCloseTo(10 ** (12 / 20), 12);
    expect(clampGainDb(-99)).toBe(-12);
  });

  it('creates one context, per-element gains, and one shared limiter resumed by gesture', async () => {
    const destination = {} as AudioDestinationNode;
    const limiter = node() as unknown as DynamicsCompressorNode;
    Object.assign(limiter, {
      threshold: {value: 0},
      knee: {value: 0},
      ratio: {value: 0},
      attack: {value: 0},
      release: {value: 0},
    });
    const gains = [gainNode(), gainNode()];
    const sources = [node(), node()];
    const resume = vi.fn(async () => undefined);
    const close = vi.fn(async () => undefined);
    let sourceIndex = 0;
    let gainIndex = 0;
    const Context = vi.fn(function Context(this: Record<string, unknown>) {
      Object.assign(this, {
        state: 'suspended',
        destination,
        createDynamicsCompressor: () => limiter,
        createMediaElementSource: () => sources[sourceIndex++],
        createGain: () => gains[gainIndex++],
        resume,
        close,
      });
    }) as unknown as typeof AudioContext;

    const graph = createPlayerAudioGraph(
      [document.createElement('video'), document.createElement('video')],
      Context,
    );
    graph.setGain(1, 6);
    await graph.resume();

    expect(Context).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sources[0].connect).mock.calls[0]?.[0]).toBe(gains[0]);
    expect(vi.mocked(sources[1].connect).mock.calls[0]?.[0]).toBe(gains[1]);
    expect(vi.mocked(gains[0].connect).mock.calls[0]?.[0]).toBe(limiter);
    expect(vi.mocked(gains[1].connect).mock.calls[0]?.[0]).toBe(limiter);
    expect(vi.mocked(limiter.connect).mock.calls[0]?.[0]).toBe(destination);
    expect(gains[1].gain.value).toBeCloseTo(10 ** (6 / 20));
    expect(resume).toHaveBeenCalledOnce();
  });
});

function node() {
  return {connect: vi.fn()};
}

function gainNode() {
  return {connect: vi.fn(), gain: {value: 1}} as unknown as GainNode;
}
