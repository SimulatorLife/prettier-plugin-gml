import nodeFs from "node:fs/promises";

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
