// set-config-values.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const packageConfig = JSON.parse(fs.readFileSync(path.resolve(currentDir, 'package.json'), 'utf-8')).config;

// Set environment variables
for (const [key, value] of Object.entries(packageConfig)) {
  process.env[`npm_package_config_${key}`] = value;
}

console.log('npm configuration values set!');