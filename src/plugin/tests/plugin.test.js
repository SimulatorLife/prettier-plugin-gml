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

async function loadTestCases() {
  const entries = await fs.readdir(currentDirectory);
  const inputFiles = entries
    .filter((file) => file.endsWith(`.input${fixtureExtension}`))
    .sort();

  return Promise.all(
    inputFiles.map(async (inputFile) => {
      const baseName = inputFile.replace(`.input${fixtureExtension}`, '');
      const outputFile = `${baseName}.output${fixtureExtension}`;
      const inputPath = path.join(currentDirectory, inputFile);
      const outputPath = path.join(currentDirectory, outputFile);

      const [rawInput, expectedOutput] = await Promise.all([
        fs.readFile(inputPath, fileEncoding),
        readFixture(outputPath),
      ]);

      if (typeof rawInput !== 'string') {
        throw new TypeError(`Expected fixture '${inputPath}' to be read as a string.`);
      }

      return { baseName, inputSource: rawInput, expectedOutput };
    })
  );
}

async function formatWithPlugin(source) {
  const formatted = await prettier.format(source, {
    plugins: [pluginPath],
    parser: 'gml-parse',
  });

  if (typeof formatted !== 'string') {
    throw new TypeError('Prettier returned a non-string result when formatting GML.');
  }

  return formatted.trim();
}

const testCases = await loadTestCases();

describe('Prettier GameMaker plugin fixtures', () => {
  for (const { baseName, inputSource, expectedOutput } of testCases) {
    it(`formats ${baseName}`, async () => {
      const formatted = await formatWithPlugin(inputSource);
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
});
