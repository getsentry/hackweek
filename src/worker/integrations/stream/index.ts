import type {WorkerEnv} from '../../index';
import {FakeStreamGateway} from './fake';
import {RealStreamGateway} from './real';
import type {StreamMode} from '../../../shared/videos';
import {ServiceError} from '../../services/errors';
import type {StreamGateway} from './types';

const fakeGateway = new FakeStreamGateway();

export function streamMode(env: WorkerEnv['Bindings']): StreamMode {
  const mode = env.STREAM_MODE;
  if (mode === 'disabled' || mode === 'fake' || mode === 'real') return mode;
  throw new ServiceError(
    'AUTH_CONFIG_INVALID',
    'STREAM_MODE must be explicitly configured as disabled, fake, or real',
    500,
  );
}

export function streamGateway(env: WorkerEnv['Bindings']): StreamGateway {
  const mode = streamMode(env);
  if (mode === 'disabled') {
    throw new ServiceError(
      'SERVICE_UNAVAILABLE',
      'Video processing is temporarily unavailable',
      503,
    );
  }
  if (mode === 'fake') return fakeGateway;
  if (!env.STREAM_ACCOUNT_ID?.trim() || !env.STREAM_API_TOKEN?.trim()) {
    throw new ServiceError(
      'AUTH_CONFIG_INVALID',
      'Real Stream integration is not configured',
      500,
    );
  }
  return new RealStreamGateway(env.STREAM_ACCOUNT_ID, env.STREAM_API_TOKEN);
}

export type {StreamGateway} from './types';
