import {createMiddleware} from 'hono/factory';

import type {WorkerEnv} from '../index';

export const requireVideoService = createMiddleware<WorkerEnv>(async (c, next) => {
  const expected = c.env.VIDEO_SERVICE_TOKEN?.trim();
  const authorization = c.req.header('Authorization');
  const actual = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!expected || !actual || !timingSafeEqual(expected, actual)) {
    return c.json(
      {error: {code: 'AUTH_REQUIRED', message: 'Video service token is required'}},
      401,
    );
  }
  await next();
});

function timingSafeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}
