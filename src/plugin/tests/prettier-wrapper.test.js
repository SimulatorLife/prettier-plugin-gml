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

  it('formats files when a custom extension is provided', async () => {
    const tempDirectory = await createTemporaryDirectory();

    try {
      const targetFile = path.join(tempDirectory, 'script.txt');
      await fs.writeFile(targetFile, 'var    a=1;\n', 'utf8');

      await execFileAsync('node', [wrapperPath, '--extensions=.txt', tempDirectory]);

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

  it('respects ignore rules from .prettierignore', async () => {
    const tempDirectory = await createTemporaryDirectory();

    try {
      const targetFile = path.join(tempDirectory, 'script.gml');
      await fs.writeFile(targetFile, 'var    a=1;\n', 'utf8');

      const ignorePath = path.join(tempDirectory, '.prettierignore');
      await fs.writeFile(ignorePath, 'script.gml\n', 'utf8');

      await execFileAsync('node', [wrapperPath, tempDirectory]);

      const formatted = await fs.readFile(targetFile, 'utf8');
      assert.equal(formatted, 'var    a=1;\n');
    } finally {
      await fs.rm(tempDirectory, { recursive: true, force: true });
    }
  });

  it('does not descend into directories ignored by .prettierignore', async () => {
    const tempDirectory = await createTemporaryDirectory();

    try {
      const targetFile = path.join(tempDirectory, 'script.gml');
      await fs.writeFile(targetFile, 'var    a=1;\n', 'utf8');

      const ignoredDirectory = path.join(tempDirectory, 'ignored');
      await fs.mkdir(ignoredDirectory);

      const ignoredSidecar = path.join(ignoredDirectory, 'file.txt');
      await fs.writeFile(ignoredSidecar, 'hello', 'utf8');

      const ignorePath = path.join(tempDirectory, '.prettierignore');
      await fs.writeFile(ignorePath, 'ignored/\n', 'utf8');

      const { stdout } = await execFileAsync('node', [wrapperPath, tempDirectory]);

      const skippedMatch = stdout.match(/Skipped (\d+) files/);
      assert.ok(skippedMatch, 'Expected wrapper output to report skipped files');
      assert.equal(Number(skippedMatch[1]), 1);

      const formatted = await fs.readFile(targetFile, 'utf8');
      assert.equal(formatted, 'var a = 1;\n');
    } finally {
      await fs.rm(tempDirectory, { recursive: true, force: true });
    }
  });
});
