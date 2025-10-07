import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it } from 'mocha';

import GMLParser from '../src/gml-parser.js';

const currentDirectory = fileURLToPath(new URL('.', import.meta.url));
const fixturesDirectory = path.join(currentDirectory, 'input');
const fixtureExtension = '.gml';
const fileEncoding = 'utf8';

async function loadFixtures() {
  const entries = await fs.readdir(fixturesDirectory, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(fixtureExtension))
    .map((entry) => entry.name)
    .sort();
}

async function readFixture(fileName) {
  const filePath = path.join(fixturesDirectory, fileName);
  const source = await fs.readFile(filePath, fileEncoding);

  if (typeof source !== 'string') {
    throw new TypeError(`Expected fixture '${fileName}' to be read as a string.`);
  }

  return source;
}

function hasLocationInformation(node) {
  if (node === null || typeof node !== 'object') {
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(node, 'start') || Object.prototype.hasOwnProperty.call(node, 'end')) {
    return true;
  }

  for (const value of Object.values(node)) {
    if (hasLocationInformation(value)) {
      return true;
    }
  }

  return false;
}

function parseFixture(source, { suppressErrors = false, options } = {}) {
  if (!suppressErrors) {
    return GMLParser.parse(source, options);
  }

  const originalError = console.error;

  try {
    console.error = () => {};
    return GMLParser.parse(source, options);
  } finally {
    console.error = originalError;
  }
}

const fixtureNames = await loadFixtures();
const expectedFailures = new Set([
  // Known parser gaps where the grammar currently rejects otherwise valid fixtures.
  'character_controller_step.gml',
  'cursed_gml.gml',
  'equals.gml',
  'expressions.gml',
  'loungeware.gml',
  'snap_deep_copy.gml',
]);
const successfulFixtures = fixtureNames.filter((fixtureName) => !expectedFailures.has(fixtureName));

describe('GameMaker parser fixtures', () => {
  for (const fixtureName of fixtureNames) {
    it(`parses ${fixtureName}`, async () => {
      const source = await readFixture(fixtureName);
      const shouldFail = expectedFailures.has(fixtureName);
      const ast = parseFixture(source, { suppressErrors: shouldFail });

      if (shouldFail) {
        assert.strictEqual(ast, null, `Parser unexpectedly produced an AST for ${fixtureName}.`);
        return;
      }

      assert.ok(ast, `Parser returned no AST for ${fixtureName}.`);
      assert.strictEqual(ast.type, 'Program', `Unexpected root node type for ${fixtureName}.`);
      assert.ok(Array.isArray(ast.body), `AST body for ${fixtureName} is not an array.`);
    });
  }

  it('omits location metadata when disabled', async () => {
    const [fixtureName] = successfulFixtures;

    assert.ok(fixtureName, 'Expected at least one parser fixture to be present.');

    const source = await readFixture(fixtureName);
    const astWithoutLocations = parseFixture(source, {
      options: { getLocations: false },
    });

    assert.ok(astWithoutLocations, 'Parser returned no AST when locations were disabled.');
    assert.strictEqual(
      hasLocationInformation(astWithoutLocations),
      false,
      'AST unexpectedly contains location metadata when getLocations is false.'
    );
  });
});
