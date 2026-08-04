import type {WorkerEnv} from '../../index';
import {FakeStreamGateway} from './fake';
import {RealStreamGateway} from './real';
import type {StreamGateway} from './types';

const fakeGateway = new FakeStreamGateway();

export function streamGateway(env: WorkerEnv['Bindings']): StreamGateway {
  const mode = env.STREAM_MODE ?? 'fake';
  if (mode === 'fake') return fakeGateway;
  if (mode !== 'real') throw new Error('STREAM_MODE must be fake or real');
  if (!env.STREAM_ACCOUNT_ID?.trim() || !env.STREAM_API_TOKEN?.trim()) {
    throw new Error('Real Stream integration is not configured');
  }
  return new RealStreamGateway(env.STREAM_ACCOUNT_ID, env.STREAM_API_TOKEN);
}

export type {StreamGateway} from './types';
