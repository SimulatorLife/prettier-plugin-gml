import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

import { describe, it } from 'mocha';

const execFileAsync = promisify(execFile);
const currentDirectory = fileURLToPath(new URL('.', import.meta.url));
const wrapperPath = path.resolve(currentDirectory, '../prettier-wrapper.js');

async function createTemporaryDirectory() {
  const directoryPrefix = path.join(os.tmpdir(), 'gml-prettier-wrapper-');
  return fs.mkdtemp(directoryPrefix);
}

describe('Prettier wrapper CLI', () => {
  it('formats files with uppercase .GML extensions', async () => {
    const tempDirectory = await createTemporaryDirectory();

    try {
      const targetFile = path.join(tempDirectory, 'SCRIPT.GML');
      await fs.writeFile(targetFile, 'var    a=1;\n', 'utf8');

      await execFileAsync('node', [wrapperPath, tempDirectory]);

      const formatted = await fs.readFile(targetFile, 'utf8');
      assert.equal(formatted, 'var a = 1;\n');
    } finally {
      await fs.rm(tempDirectory, { recursive: true, force: true });
    }
  });

  it('applies Prettier configuration from the target project', async () => {
    const tempDirectory = await createTemporaryDirectory();

    try {
      const targetFile = path.join(tempDirectory, 'script.gml');
      await fs.writeFile(
        targetFile,
        ['if (true) {', '    a = 1;', '}', ''].join('\n'),
        'utf8'
      );

      const configPath = path.join(tempDirectory, '.prettierrc');
      await fs.writeFile(
        configPath,
        JSON.stringify({ tabWidth: 2 }, null, 2),
        'utf8'
      );

      await execFileAsync('node', [wrapperPath, tempDirectory]);

      const formatted = await fs.readFile(targetFile, 'utf8');
      assert.equal(formatted, ['if (true) {', '  a = 1;', '}', ''].join('\n'));
    } finally {
      await fs.rm(tempDirectory, { recursive: true, force: true });
    }
  });
});
