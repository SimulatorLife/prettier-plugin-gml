// testRunner.js

import * as prettier from "prettier";
import fs from 'fs';
import path from 'path';

const testsDirectory = '.';
const fileEncoding = 'utf8';
const fileExt = '.gml';

async function getFilesWithExtension(directory, extension) {
  const files = await fs.promises.readdir(directory);
  return files.filter(file => file.endsWith(extension));
}

async function testFiles() {
  const inputFiles = await getFilesWithExtension(testsDirectory, fileExt);

  for (let inputFile of inputFiles) {
    const baseName = inputFile.slice(0, -4); // remove '.gml' extension
    const outputFile = baseName.replace('.input', '.output') + fileExt;

    const inputCode = await fs.promises.readFile(path.join(testsDirectory, inputFile), fileEncoding);
    const expectedOutput = await fs.promises.readFile(path.join(testsDirectory, outputFile), fileEncoding);

    if (typeof inputCode !== 'string') {
      console.error(`Unexpected type for input code. Expected string but got ${typeof inputCode}`);
      process.exit(1);
    }

    if (typeof expectedOutput !== 'string') {
      console.error(`Unexpected type for expected output. Expected string but got ${typeof expectedOutput}`);
      process.exit(1);
    }

    const formatted = await prettier.format(inputCode, {
      plugins: ["./src/gml.js"],
      parser: "gml-parse",
    });

    if (typeof formatted !== 'string') {
      console.error(`Unexpected type for formatted code. Expected string but got ${typeof formatted}`);
      process.exit(1);
    } else if (formatted.trim() === '') {
      console.error(`Unexpected empty string for formatted code.`);
      process.exit(1);
    }

    if (formatted !== expectedOutput) {
      const formattedLines = formatted.split('\n');
      const expectedLines = expectedOutput.split('\n');

      console.error(`\nTest failed for file ${inputFile}\n`);
      for (let i = 0; i < Math.max(formattedLines.length, expectedLines.length); i++) {
        if (formattedLines[i] !== expectedLines[i]) {
          console.error(`Line ${i + 1} does not match:`);
          console.error(`Expected: ${expectedLines[i]}`);
          console.error(`Received: ${formattedLines[i]}`);
        }
      }

      process.exit(1); // Exit with a failure code
    }
    console.log('Test passed!');
  }

  console.log('All tests passed!');
  process.exit(0); // Exit with a success code
}

testFiles();