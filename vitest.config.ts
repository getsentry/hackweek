import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {cloudflareTest, readD1Migrations} from '@cloudflare/vitest-pool-workers';
import {defineConfig} from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: {configPath: './wrangler.jsonc'},
      miniflare: {
        serviceBindings: {
          ASSETS: async () =>
            new Response('<!doctype html><div id="root"></div>', {
              headers: {'Content-Type': 'text/html; charset=UTF-8'},
            }),
        },
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(path.join(root, 'migrations')),
          AUTH_MODE: 'google',
          APP_ORIGIN: 'https://hackweek.test',
          GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
          GOOGLE_CLIENT_SECRET: 'test-client-secret',
          GOOGLE_REDIRECT_URI: 'https://hackweek.test/api/auth/callback',
          GOOGLE_TOKEN_ENDPOINT: 'https://tokens.hackweek.test/token',
          ALLOWED_EMAIL_DOMAIN: 'sentry.io',
          STREAM_MODE: 'fake',
          STREAM_ALLOWED_ORIGIN: 'hackweek.test',
          STREAM_DELIVERY_HOST: 'customer-fake.cloudflarestream.com',
          STREAM_WEBHOOK_SECRET: 'test-webhook-secret',
          VIDEO_SERVICE_TOKEN: 'test-video-service-token',
          GOOGLE_JWKS_JSON:
            '{"keys":[{"kty":"RSA","n":"3SSum9jtxKTheDwctdDnp80Mv5_hAQzcKJJcxpw3wShOU0LyEpt23riO3ncaOC4iVm5xseM9PJmFjYMQJcplKi6I3nDC7tToFWrFqrn7LSjdvJS3WqUjn20CUiUxYZ3QLZcYyERU6M39M8nE1zFHQ3tHz7YkjoNQTPMUXMRydeL8yuBizdsrGQosgpGJceTAFIHJkKtdCipbSBZA3qrrE-HDJa9nZSYloywLVsaxzKJG2SiJzvVBydZbCQ2ZQeR44qdpCIibU2IMyVelKqiCqHwoBwzYybGx4Tcx4N_1UrNZQnECbcN7jSzxRp1agrK6p2w-svyYYXmt7ymqa3kjdQ","e":"AQAB","kid":"google-test","alg":"RS256","use":"sig"}]}',
        },
      },
    })),
  ],
  test: {
    maxWorkers: 1,
    include: ['test/**/*.test.ts'],
    exclude: ['test/migration/**'],
    setupFiles: ['./test/setup.ts'],
  },
});
