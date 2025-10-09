import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import prettier from 'prettier';
import { describe, it } from 'mocha';

const currentDirectory = fileURLToPath(new URL('.', import.meta.url));
const pluginPath = path.resolve(currentDirectory, '../src/gml.js');
const fileEncoding = 'utf8';
const fixtureExtension = '.gml';

async function readFixture(filePath) {
  const contents = await fs.readFile(filePath, fileEncoding);
  if (typeof contents !== 'string') {
    throw new TypeError(`Expected fixture '${filePath}' to be read as a string.`);
  }
  return contents.trim();
}

async function tryLoadOptions(baseName) {
  const optionsFile = `${baseName}.options.json`;
  const optionsPath = path.join(currentDirectory, optionsFile);

  try {
    const contents = await fs.readFile(optionsPath, fileEncoding);
    if (!contents) {
      return null;
    }

    const parsed = JSON.parse(contents);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }

  return null;
}

async function loadTestCases() {
  const entries = await fs.readdir(currentDirectory);
  const caseMap = new Map();

  for (const entry of entries) {
    if (!entry.endsWith(fixtureExtension)) {
      continue;
    }

    if (entry.endsWith(`.input${fixtureExtension}`)) {
      const baseName = entry.replace(`.input${fixtureExtension}`, '');
      const existing = caseMap.get(baseName) ?? {};
      caseMap.set(baseName, { ...existing, inputFile: entry });
      continue;
    }

    if (entry.endsWith(`.output${fixtureExtension}`)) {
      const baseName = entry.replace(`.output${fixtureExtension}`, '');
      const existing = caseMap.get(baseName) ?? {};
      caseMap.set(baseName, { ...existing, outputFile: entry });
      continue;
    }

    const baseName = entry.replace(fixtureExtension, '');
    const existing = caseMap.get(baseName) ?? {};
    caseMap.set(baseName, { ...existing, singleFile: entry });
  }

  const sortedBaseNames = [...caseMap.keys()].sort();

  return Promise.all(
    sortedBaseNames.map(async (baseName) => {
      const { inputFile, outputFile, singleFile } = caseMap.get(baseName);

      if (singleFile && (inputFile || outputFile)) {
        throw new Error(
          `Fixture '${baseName}' has both standalone and input/output files. Please keep only one style.`
        );
      }

      if (singleFile) {
        const singlePath = path.join(currentDirectory, singleFile);
        const [rawInput, expectedOutput] = await Promise.all([
          fs.readFile(singlePath, fileEncoding),
          readFixture(singlePath),
        ]);

        if (typeof rawInput !== 'string') {
          throw new TypeError(`Expected fixture '${singlePath}' to be read as a string.`);
        }

        const options = await tryLoadOptions(baseName);

        return { baseName, inputSource: rawInput, expectedOutput, options };
      }

      if (!inputFile || !outputFile) {
        throw new Error(
          `Fixture '${baseName}' is missing its ${inputFile ? 'output' : 'input'} file.`
        );
      }

      const inputPath = path.join(currentDirectory, inputFile);
      const outputPath = path.join(currentDirectory, outputFile);

      const [rawInput, expectedOutput] = await Promise.all([
        fs.readFile(inputPath, fileEncoding),
        readFixture(outputPath),
      ]);

      if (typeof rawInput !== 'string') {
        throw new TypeError(`Expected fixture '${inputPath}' to be read as a string.`);
      }

      const options = await tryLoadOptions(baseName);

      return { baseName, inputSource: rawInput, expectedOutput, options };
    })
  );
}

async function formatWithPlugin(source, overrides) {
  const formatted = await prettier.format(source, {
    plugins: [pluginPath],
    parser: 'gml-parse',
    ...(overrides ?? {}),
  });

  if (typeof formatted !== 'string') {
    throw new TypeError('Prettier returned a non-string result when formatting GML.');
  }

  return formatted.trim();
}

const testCases = await loadTestCases();

describe('Prettier GameMaker plugin fixtures', () => {
  for (const { baseName, inputSource, expectedOutput, options } of testCases) {
    it(`formats ${baseName}`, async () => {
      const formatted = await formatWithPlugin(inputSource, options);
      const expected = expectedOutput.trim();

      if (formatted === expected) {
        return;
      }

      const formattedLines = formatted.split('\n');
      const expectedLines = expected.split('\n');
      const maxLineCount = Math.max(formattedLines.length, expectedLines.length);

      for (let index = 0; index < maxLineCount; index += 1) {
        const lineNumber = index + 1;
        const actualLine = formattedLines[index];
        const expectedLine = expectedLines[index];

        if (expectedLine === undefined) {
          assert.fail(`Expected line ${lineNumber} is missing.`);
        }

        if (actualLine === undefined) {
          assert.fail(`Received line ${lineNumber} is missing.`);
        }

        if (actualLine.trim() !== expectedLine.trim()) {
          assert.strictEqual(
            actualLine,
            expectedLine,
            `Line ${lineNumber} does not match.`
          );
        }
      }
    });
  }

  it("preserves 'globalvar' declarations by default", async () => {
    const source = [
      'globalvar foo, bar;',
      'foo = 1;',
      'bar = 2;',
      '',
    ].join('\n');

    const formatted = await formatWithPlugin(source);

    assert.ok(
      /globalvar foo, bar;/.test(formatted),
      "Expected formatted output to retain the 'globalvar' declaration."
    );
    assert.ok(
      /global\.foo = 1;/.test(formatted) && /global\.bar = 2;/.test(formatted),
      "Expected formatter to continue prefixing global assignments."
    );
  });

  it("can elide 'globalvar' declarations when disabled", async () => {
    const source = [
      'globalvar foo, bar;',
      'foo = 1;',
      'bar = 2;',
      '',
    ].join('\n');

    const formatted = await formatWithPlugin(source, { preserveGlobalVarStatements: false });

    assert.ok(
      !/globalvar\s+foo,\s*bar;/.test(formatted),
      "Expected formatter to omit 'globalvar' declarations when disabled."
    );
  });

  it('strips trailing macro semicolons when Feather fixes are applied', async () => {
    const source = [
      '#macro FOO(value) (value + 1);',
      '#macro BAR 100;',
      '',
      'var result = FOO(1) + BAR;',
    ].join('\n');

    const formatted = await formatWithPlugin(source, { applyFeatherFixes: true });

    const expected = [
      '#macro FOO(value) (value + 1)',
      '',
      '#macro BAR 100',
      '',
      'var result = FOO(1) + BAR;',
    ].join('\n');

    assert.strictEqual(formatted, expected);
  });

  it('strips trailing macro semicolons before inline comments when Feather fixes are applied', async () => {
    const source = [
      '#macro FOO(value) (value + 1); // comment',
      '#macro BAR value + 2;',
      '',
      'var result = FOO(3) + BAR;',
    ].join('\n');

    const formatted = await formatWithPlugin(source, { applyFeatherFixes: true });

    const expected = [
      '#macro FOO(value) (value + 1) // comment',
      '',
      '#macro BAR value + 2',
      '',
      'var result = FOO(3) + BAR;',
    ].join('\n');

    assert.strictEqual(formatted, expected);
  });
});
