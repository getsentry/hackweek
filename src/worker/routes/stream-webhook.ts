import {Hono} from 'hono';

import type {WorkerEnv} from '../index';
import {processStreamWebhook} from '../services/videos';

const MAX_CLOCK_SKEW_SECONDS = 5 * 60;

export const streamWebhookRoutes = new Hono<WorkerEnv>();

streamWebhookRoutes.post('/', async (c) => {
  const secret = c.env.STREAM_WEBHOOK_SECRET?.trim();
  if (!secret) return c.json({error: 'Webhook is not configured'}, 503);
  const rawBody = await c.req.text();
  const signature = c.req.header('Webhook-Signature');
  if (!(await verifyStreamWebhook(rawBody, signature, secret))) {
    return c.json({error: 'Invalid webhook signature'}, 401);
  }

  const payload = parseWebhook(rawBody);
  if (!payload) return c.json({error: 'Invalid webhook payload'}, 400);
  const result = await processStreamWebhook(c.env.DB, payload);
  return c.json(result);
});

export async function verifyStreamWebhook(
  body: string,
  header: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  if (!header) return false;
  const fields = new Map(
    header.split(',').map((part) => {
      const separator = part.indexOf('=');
      return separator < 1
        ? ['', '']
        : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
    }),
  );
  const timestampText = fields.get('time');
  const actualHex = fields.get('sig1');
  const timestamp = Number(timestampText);
  if (
    !timestampText ||
    !Number.isInteger(timestamp) ||
    Math.abs(nowSeconds - timestamp) > MAX_CLOCK_SKEW_SECONDS ||
    !actualHex ||
    !/^[a-f0-9]{64}$/i.test(actualHex)
  ) {
    return false;
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    {name: 'HMAC', hash: 'SHA-256'},
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestampText}.${body}`),
  );
  return timingSafeHex(hex(digest), actualHex.toLowerCase());
}

function parseWebhook(body: string) {
  try {
    const value = JSON.parse(body) as Record<string, unknown>;
    const status = value.status as Record<string, unknown> | undefined;
    if (
      typeof value.uid !== 'string' ||
      !value.uid ||
      !status ||
      typeof status.state !== 'string'
    ) {
      return null;
    }
    const ready =
      value.readyToStream === true &&
      status.state === 'ready' &&
      Number(status.pctComplete) === 100;
    const modified = typeof value.modified === 'string' ? value.modified : '';
    const eventType = ready ? 'ready' : `failed:${status.state}`;
    return {
      eventId: `${value.uid}:${modified}:${eventType}`,
      streamUid: value.uid,
      eventType,
      ready,
      durationSeconds:
        typeof value.duration === 'number' && Number.isFinite(value.duration)
          ? value.duration
          : null,
      errorMessage:
        typeof status.errorReasonText === 'string' && status.errorReasonText
          ? status.errorReasonText
          : typeof status.errorReasonCode === 'string' && status.errorReasonCode
            ? status.errorReasonCode
            : null,
    };
  } catch {
    return null;
  }
}

function hex(value: ArrayBuffer) {
  return [...new Uint8Array(value)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeHex(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
