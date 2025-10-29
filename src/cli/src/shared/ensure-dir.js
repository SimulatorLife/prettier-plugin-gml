import nodeFs from "node:fs/promises";

/**
 * Ensure that a directory exists, creating it when absent.
 *
 * Centralises the recursive `mkdir` guard the CLI relies on when staging
 * artefacts and writing performance reports. The helper defaults to Node's
 * promise-based `fs` facade but accepts any compatible implementation so call
 * sites can provide mocks during testing or substitute custom filesystem
 * layers. Co-locating the utility under the CLI keeps the shared package
 * focused on cross-environment primitives while preserving the ergonomics the
 * command modules expect.
 *
 * @param {string} dirPath Directory that should exist on disk.
 * @param {{ mkdir(path: string, options?: object): Promise<void> }} [fsModule=nodeFs]
 *        Promise-based filesystem facade exposing a `mkdir` method.
 * @returns {Promise<void>} Resolves once the directory hierarchy exists.
 */
export async function ensureDir(dirPath, fsModule = nodeFs) {
    await fsModule.mkdir(dirPath, { recursive: true });
}
