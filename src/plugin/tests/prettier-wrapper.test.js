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

  it('formats files restored by negated patterns in .prettierignore', async () => {
    const tempDirectory = await createTemporaryDirectory();

    try {
      const ignoredDirectory = path.join(tempDirectory, 'ignored');
      const nestedDirectory = path.join(ignoredDirectory, 'nested');
      await fs.mkdir(nestedDirectory, { recursive: true });

      const targetFile = path.join(nestedDirectory, 'script.gml');
      await fs.writeFile(targetFile, 'var    a=1;\n', 'utf8');

      const ignorePath = path.join(tempDirectory, '.prettierignore');
      await fs.writeFile(
        ignorePath,
        ['ignored/*', '!ignored/nested/', '!ignored/nested/script.gml', ''].join('\n'),
        'utf8'
      );

      await execFileAsync('node', [wrapperPath, tempDirectory]);

      const formatted = await fs.readFile(targetFile, 'utf8');
      assert.equal(formatted, 'var a = 1;\n');
    } finally {
      await fs.rm(tempDirectory, { recursive: true, force: true });
    }
  });

  const directorySymlinkType = process.platform === 'win32' ? 'junction' : 'dir';
  const fileSymlinkType = process.platform === 'win32' ? 'file' : null;

  it('skips symbolic links to avoid infinite directory traversal loops', async function () {
    const tempDirectory = await createTemporaryDirectory();

    try {
      const targetFile = path.join(tempDirectory, 'script.gml');
      await fs.writeFile(targetFile, 'var    a=1;\n', 'utf8');

      const directorySymlinkPath = path.join(tempDirectory, 'loop');
      const fileSymlinkPath = path.join(tempDirectory, 'script-link.gml');

      let shouldSkip = false;

      try {
        await fs.symlink(tempDirectory, directorySymlinkPath, directorySymlinkType);
      } catch (error) {
        if (error && (error.code === 'EPERM' || error.code === 'ENOSYS')) {
          shouldSkip = true;
        } else {
          throw error;
        }
      }

      try {
        if (fileSymlinkType) {
          await fs.symlink(targetFile, fileSymlinkPath, fileSymlinkType);
        } else {
          await fs.symlink(targetFile, fileSymlinkPath);
        }
      } catch (error) {
        if (error && (error.code === 'EPERM' || error.code === 'ENOSYS')) {
          shouldSkip = true;
        } else {
          throw error;
        }
      }

      if (shouldSkip) {
        this.skip();
      }

      const { stdout } = await execFileAsync('node', [wrapperPath, tempDirectory]);

      assert.ok(
        stdout.includes(`Skipping ${directorySymlinkPath} (symbolic link to directory)`),
        'Expected wrapper output to report skipped directory symbolic links'
      );

      assert.ok(
        stdout.includes(`Formatted ${fileSymlinkPath}`),
        'Expected wrapper to format files reachable through symbolic links'
      );

      const formatted = await fs.readFile(targetFile, 'utf8');
      assert.equal(formatted, 'var a = 1;\n');
    } finally {
      await fs.rm(tempDirectory, { recursive: true, force: true });
    }
  });

  it('exits with a non-zero status when formatting fails', async () => {
    const tempDirectory = await createTemporaryDirectory();

    try {
      const targetFile = path.join(tempDirectory, 'script.gml');
      await fs.writeFile(targetFile, 'if (\n', 'utf8');

      try {
        await execFileAsync('node', [wrapperPath, tempDirectory]);
        assert.fail('Expected the wrapper to exit with a non-zero status code');
      } catch (error) {
        assert.ok(error, 'Expected an error to be thrown for a failing format');
        assert.equal(error.code, 1, 'Expected a non-zero exit code when formatting fails');
        assert.ok(
          /Syntax Error/.test(error.stderr),
          'Expected stderr to include the formatting error message'
        );
      }
    } finally {
      await fs.rm(tempDirectory, { recursive: true, force: true });
    }
  });
});
