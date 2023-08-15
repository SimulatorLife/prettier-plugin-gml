import { exec } from 'child_process';
import { readdir } from 'fs';
import { join } from 'path';

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