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
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(path.join(root, 'migrations')),
          AUTH_MODE: 'local-signed',
          ACCESS_TEAM_DOMAIN: 'https://hackweek-local.cloudflareaccess.com',
          ACCESS_AUD: 'hackweek-local',
          ALLOWED_EMAIL_DOMAIN: 'sentry.io',
          LOCAL_ACCESS_JWKS:
            '{"keys":[{"kty":"RSA","n":"3SSum9jtxKTheDwctdDnp80Mv5_hAQzcKJJcxpw3wShOU0LyEpt23riO3ncaOC4iVm5xseM9PJmFjYMQJcplKi6I3nDC7tToFWrFqrn7LSjdvJS3WqUjn20CUiUxYZ3QLZcYyERU6M39M8nE1zFHQ3tHz7YkjoNQTPMUXMRydeL8yuBizdsrGQosgpGJceTAFIHJkKtdCipbSBZA3qrrE-HDJa9nZSYloywLVsaxzKJG2SiJzvVBydZbCQ2ZQeR44qdpCIibU2IMyVelKqiCqHwoBwzYybGx4Tcx4N_1UrNZQnECbcN7jSzxRp1agrK6p2w-svyYYXmt7ymqa3kjdQ","e":"AQAB","kid":"hackweek-local-test","alg":"RS256","use":"sig"}]}',
        },
      },
    })),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
  },
});
