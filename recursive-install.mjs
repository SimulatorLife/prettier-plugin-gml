import { exec } from 'child_process';
import { readdir } from 'fs';
import { join } from 'path';

const REQUIRED_NODE_RANGE = '^18.18.0 || ^20.9.0 || >=21.1.0';

function isSupportedNodeVersion(version) {
  const [major, minor, patch] = version.split('.').map(Number);

  if (Number.isNaN(major) || Number.isNaN(minor) || Number.isNaN(patch)) {
    return false;
  }

  if (major === 18) {
    return minor >= 18;
  }

  if (major === 20) {
    return minor >= 9;
  }

  if (major === 21) {
    return minor > 1 || (minor === 1 && patch >= 0);
  }

  return major > 21;
}

const detectedNodeVersion = process.versions.node;

if (!isSupportedNodeVersion(detectedNodeVersion)) {
  console.error(
    `Unsupported Node.js runtime (detected ${process.version}).\n` +
      `This workspace requires Node.js ${REQUIRED_NODE_RANGE}.\n` +
      'Install a compatible release (see the .nvmrc file) before running install scripts.'
  );
  process.exit(1);
}

function installInDir(directory) {
  exec('npm install', { cwd: directory }, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error installing in ${directory}: ${error.message}`);
      return;
    }
    console.log(stdout);
    console.error(stderr);
  });
}

function searchForPackageJsons(startPath) {
  readdir(startPath, { withFileTypes: true }, (err, files) => {
    if (err) {
      console.error(err);
      return;
    }

    for (const file of files) {
      const currentPath = join(startPath, file.name);
      if (file.isDirectory()) {
        if (file.name !== 'node_modules') {
          searchForPackageJsons(currentPath);
        }
      } else if (file.name === 'package.json') {
        installInDir(startPath);
      }
    }
  });
}

const currentDir = new URL('.', import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1');
searchForPackageJsons(currentDir);
