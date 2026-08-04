import {copyFile, rm, stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';

const localVars = '.dev.vars';
const hiddenVars = '.dev.vars.worker-test-hidden';
const hadLocalVars = await exists(localVars);

try {
  if (hadLocalVars) await copyFile(localVars, hiddenVars);
  if (hadLocalVars) await rm(localVars);
  const code = await run('./node_modules/.bin/vp', [
    'test',
    'run',
    '--config',
    'vitest.config.ts',
    ...process.argv.slice(2),
  ]);
  process.exitCode = code;
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
