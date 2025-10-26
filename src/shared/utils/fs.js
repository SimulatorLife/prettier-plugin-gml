import nodeFs from "node:fs/promises";

import { isErrorWithCode } from "./error.js";

/**
 * Ensure that a directory exists, creating it when absent.
 *
 * The helper defaults to Node's promise-based `fs` facade but accepts any
 * compatible implementation so call sites can provide mocks during testing or
 * substitute custom filesystem layers. The signature mirrors the CLI wrapper
 * that previously exported this utility, allowing consumers to avoid repeating
 * the `mkdir` recursion boilerplate wherever manual artefacts are staged.
 *
 * @param {string} dirPath Directory that should exist on disk.
 * @param {{ mkdir(path: string, options?: object): Promise<void> }} [fsModule=nodeFs]
 *        Promise-based filesystem facade exposing a `mkdir` method.
 * @returns {Promise<void>} Resolves once the directory hierarchy exists.
 */
export async function ensureDir(dirPath, fsModule = nodeFs) {
    await fsModule.mkdir(dirPath, { recursive: true });
}

/**
 * Type-safe wrapper over {@link isErrorWithCode} so callers can narrow thrown
 * filesystem errors to specific Node-style `code` strings without repeating the
 * shared utility import. Accepts the same loose inputs as the underlying
 * helper, mirroring how error guards are typically used in catch blocks.
 *
 * @param {unknown} error Candidate error thrown by the filesystem facade.
 * @param {...string} codes Node-style error codes (for example `"ENOENT"`).
 * @returns {error is NodeJS.ErrnoException} `true` when {@link error} exposes a
 *          matching {@link NodeJS.ErrnoException.code} value.
 */
export function isFsErrorCode(error, ...codes) {
    return isErrorWithCode(error, ...codes);
}
