import {constants, copyFile, mkdir, readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {spawn} from 'node:child_process';

const dryRun = process.argv.includes('--dry-run');

await main();

async function main() {
  const targetRoot = await gitRoot();
  const sourceRoot = await masterWorktree();

  if (path.resolve(sourceRoot) === path.resolve(targetRoot)) {
    console.log('worktree setup: already in the master worktree; nothing to copy');
    return;
  }

  console.log(`worktree setup: using master state from ${sourceRoot}`);

  await prepareDependencies(sourceRoot, targetRoot);
  await cloneDirectoryIfMissing(
    path.join(sourceRoot, '.wrangler', 'state'),
    path.join(targetRoot, '.wrangler', 'state'),
    'Wrangler state',
  );
  await cloneFileIfMissing(
    path.join(sourceRoot, '.dev.vars'),
    path.join(targetRoot, '.dev.vars'),
    'local environment',
  );

  if (dryRun) {
    console.log('worktree setup: would apply pending local D1 migrations');
    return;
  }

  await run('npm', ['run', 'db:migrate:local'], {cwd: targetRoot});
  console.log('worktree setup: ready for npm run dev:video');
}

async function prepareDependencies(sourceRoot, targetRoot) {
  const targetModules = path.join(targetRoot, 'node_modules');
  if (await exists(targetModules)) {
    console.log('worktree setup: node_modules already exists; keeping it');
    return;
  }

  const sourceModules = path.join(sourceRoot, 'node_modules');
  const locksMatch = await filesMatch(
    path.join(sourceRoot, 'package-lock.json'),
    path.join(targetRoot, 'package-lock.json'),
  );
  if ((await exists(sourceModules)) && locksMatch) {
    await cloneDirectory(sourceModules, targetModules, 'node_modules');
    return;
  }

  if (dryRun) {
    console.log('worktree setup: would install dependencies with npm ci');
    return;
  }
  await run('npm', ['ci'], {cwd: targetRoot});
}

async function cloneDirectoryIfMissing(source, destination, label) {
  if (await exists(destination)) {
    console.log(`worktree setup: ${label} already exists; keeping it`);
    return;
  }
  if (!(await exists(source))) {
    console.log(`worktree setup: master has no ${label}; skipping it`);
    return;
  }
  await cloneDirectory(source, destination, label);
}

async function cloneDirectory(source, destination, label) {
  if (dryRun) {
    console.log(`worktree setup: would clone ${label}`);
    return;
  }
  if (process.platform !== 'darwin') {
    throw new Error(
      `Cloning ${label} without duplicating its data is currently supported only on macOS`,
    );
  }
  await mkdir(path.dirname(destination), {recursive: true});
  await run('cp', ['-cR', source, destination]);
  console.log(`worktree setup: cloned ${label}`);
}

async function cloneFileIfMissing(source, destination, label) {
  if (await exists(destination)) {
    console.log(`worktree setup: ${label} already exists; keeping it`);
    return;
  }
  if (!(await exists(source))) {
    console.log(`worktree setup: master has no ${label}; skipping it`);
    return;
  }
  if (dryRun) {
    console.log(`worktree setup: would clone ${label}`);
    return;
  }
  await mkdir(path.dirname(destination), {recursive: true});
  await copyFile(
    source,
    destination,
    constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE,
  );
  console.log(`worktree setup: cloned ${label}`);
}

async function masterWorktree() {
  const output = await capture('git', ['worktree', 'list', '--porcelain']);
  const worktrees = output
    .trim()
    .split(/\n\s*\n/)
    .map((record) =>
      Object.fromEntries(
        record.split('\n').map((line) => {
          const separator = line.indexOf(' ');
          return separator === -1
            ? [line, true]
            : [line.slice(0, separator), line.slice(separator + 1)];
        }),
      ),
    );
  const master = worktrees.find((worktree) => worktree.branch === 'refs/heads/master');
  if (typeof master?.worktree !== 'string') {
    throw new Error(
      'The master branch must have a checked-out worktree to seed local state',
    );
  }
  return master.worktree;
}

async function gitRoot() {
  return (await capture('git', ['rev-parse', '--show-toplevel'])).trim();
}

async function filesMatch(left, right) {
  try {
    const [leftContent, rightContent] = await Promise.all([
      readFile(left),
      readFile(right),
    ]);
    return leftContent.equals(rightContent);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return false;
    throw error;
  }
}

async function exists(value) {
  return stat(value).then(
    () => true,
    (error) => {
      if (error && typeof error === 'object' && error.code === 'ENOENT') return false;
      throw error;
    },
  );
}

function capture(command, args) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(command, args, {stdio: ['ignore', 'pipe', 'pipe']});
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} ${args.join(' ')} failed: ${stderr.trim()}`));
    });
  });
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {...options, stdio: 'inherit'});
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
  });
}
