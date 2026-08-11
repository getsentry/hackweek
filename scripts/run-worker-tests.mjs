import {copyFile, rm, stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';

const localVars = '.dev.vars';
const hiddenVars = '.dev.vars.worker-test-hidden';
const hadLocalVars = await exists(localVars);
const requested = process.argv.slice(2);
const testFiles = requested.length
  ? requested
  : [
      'test/worker.test.ts',
      'test/auth/auth.test.ts',
      'test/projects/projects.test.ts',
      'test/media/media.test.ts',
      'test/voting/voting.test.ts',
      'test/admin/admin.test.ts',
      'test/video/video.test.ts',
    ];

try {
  if (hadLocalVars) await copyFile(localVars, hiddenVars);
  if (hadLocalVars) await rm(localVars);
  for (const testFile of testFiles) {
    const code = await run('./node_modules/.bin/vp', [
      'test',
      'run',
      '--config',
      'vitest.config.ts',
      testFile,
    ]);
    if (code !== 0) {
      process.exitCode = code;
      break;
    }
  }
} finally {
  if (hadLocalVars) {
    await copyFile(hiddenVars, localVars);
    await rm(hiddenVars);
  }
}

function exists(path) {
  return stat(path).then(
    () => true,
    () => false,
  );
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {stdio: 'inherit'});
    child.once('error', reject);
    child.once('close', (code) => resolve(code ?? 1));
  });
}
