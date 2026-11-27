'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const manifest = require('../package.json');
const lockfile = require('../package-lock.json');

const root = path.resolve(__dirname, '..');
const buildRoot = path.join(root, 'dist');
const packageName = `Farol-IA-Local-${manifest.version}-win-${process.arch}`;
const executableName = 'Farol IA Local.exe';

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function copyProductionDependencies(appDirectory) {
  for (const [relativePath, entry] of Object.entries(lockfile.packages)) {
    if (!relativePath.startsWith('node_modules/') || entry.dev || entry.link) continue;
    const source = path.join(root, relativePath);
    if (entry.optional && !await exists(source)) continue;
    await fs.cp(source, path.join(appDirectory, relativePath), {
      recursive: true,
      filter: (filePath) => filePath === source || path.basename(filePath) !== 'node_modules',
    });
  }
}

async function build() {
  if (process.platform !== 'win32') throw new Error('Execute este build no Windows.');
  const electronBinary = require('electron');
  const runtime = path.dirname(electronBinary);
  await fs.access(electronBinary);

  await fs.mkdir(buildRoot, { recursive: true });
  const staging = await fs.mkdtemp(path.join(buildRoot, '.farol-build-'));
  await fs.cp(runtime, staging, {
    recursive: true,
    filter: (filePath) => path.relative(runtime, filePath) !== path.join('resources', 'default_app.asar'),
  });
  await fs.rename(path.join(staging, path.basename(electronBinary)), path.join(staging, executableName));

  const appDirectory = path.join(staging, 'resources', 'app');
  await fs.mkdir(appDirectory, { recursive: true });
  await fs.cp(path.join(root, 'src'), path.join(appDirectory, 'src'), { recursive: true });
  await fs.copyFile(path.join(root, 'package.json'), path.join(appDirectory, 'package.json'));
  await fs.copyFile(path.join(root, 'LICENSE'), path.join(appDirectory, 'LICENSE'));
  await copyProductionDependencies(appDirectory);

  const guardianPath = path.join('native', 'Farol.NetworkGuardian', 'bin', 'Release', 'net9.0-windows');
  if (await exists(path.join(root, guardianPath, 'Farol.NetworkGuardian.dll'))) {
    await fs.cp(path.join(root, guardianPath), path.join(appDirectory, guardianPath), { recursive: true });
  }

  const preferred = path.join(buildRoot, packageName);
  const destination = await exists(preferred) ? `${preferred}-${path.basename(staging).split('-').at(-1)}` : preferred;
  await fs.rename(staging, destination);
  console.log(`Executável: ${path.join(destination, executableName)}`);
}

build().catch((error) => {
  console.error(`Falha ao empacotar o Farol: ${error.message}`);
  process.exitCode = 1;
});
