import nodeFs from "node:fs/promises";

import { toArrayFromIterable } from "./array.js";
import { createAbortGuard } from "./abort.js";
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

/**
 * Enumerate the entries in {@link directoryPath} while respecting the abort
 * semantics shared by long-running filesystem workflows. Missing directories
 * resolve to an empty array so callers can treat them as already-processed
 * without branching.
 *
 * @param {{ readDir(path: string): Promise<Iterable<string>> }} fsFacade
 *        Filesystem facade whose `readDir` method mirrors `fs.promises.readdir`.
 * @param {string} directoryPath Absolute or relative directory to read.
 * @param {{ signal?: AbortSignal | null }} [options] Optional abort signal bag.
 *        The same object is forwarded to {@link createAbortGuard} so any extra
 *        metadata (like custom fallback messages) is honored.
 * @returns {Promise<Array<string>>} Stable array of directory entries, ordered
 *          according to the underlying iterator.
 */
export async function listDirectory(fsFacade, directoryPath, options = {}) {
    const abortMessage = "Directory listing was aborted.";
    const { ensureNotAborted } = createAbortGuard(options, {
        fallbackMessage: abortMessage
    });

    try {
        const entries = await fsFacade.readDir(directoryPath);
        ensureNotAborted();

        return toArrayFromIterable(entries);
    } catch (error) {
        if (isFsErrorCode(error, "ENOENT", "ENOTDIR")) {
            return [];
        }
        throw error;
    }
}

/**
 * Resolve the `mtimeMs` value for {@link filePath}, returning `null` when the
 * file cannot be stat'ed (for example when it was deleted mid-flight). The
 * guard mirrors {@link listDirectory} so long-running scans can honor abort
 * requests between async boundaries.
 *
 * @param {{ stat(path: string): Promise<{ mtimeMs?: number }> }} fsFacade
 *        Filesystem facade exposing a promise-based `stat` method.
 * @param {string} filePath Absolute or relative file path to inspect.
 * @param {{ signal?: AbortSignal | null }} [options] Optional abort signal bag
 *        forwarded to {@link createAbortGuard}.
 * @returns {Promise<number | null>} Millisecond precision modified time, or
 *          `null` when unavailable.
 */
export async function getFileMtime(fsFacade, filePath, options = {}) {
    const abortMessage = "File metadata read was aborted.";
    const { ensureNotAborted } = createAbortGuard(options, {
        fallbackMessage: abortMessage
    });

    try {
        const stats = await fsFacade.stat(filePath);
        ensureNotAborted();
        return typeof stats.mtimeMs === "number" ? stats.mtimeMs : null;
    } catch (error) {
        if (isFsErrorCode(error, "ENOENT")) {
            return null;
        }
        throw error;
    }
}

/**
 * Canonical async filesystem facade backed by Node's `fs/promises` module.
 *
 * Project index helpers previously defined this shim within their own module,
 * even though the implementation simply forwarded to the shared utilities
 * contract. Hoisting the facade alongside the other filesystem helpers keeps
 * the default within the shared boundary and avoids sprinkling duplicate
 * wrappers across feature areas.
 */
const defaultFsFacade = Object.freeze({
    async readDir(targetPath) {
        return nodeFs.readdir(targetPath);
    },
    async stat(targetPath) {
        return nodeFs.stat(targetPath);
    },
    async readFile(targetPath, encoding = "utf8") {
        return nodeFs.readFile(targetPath, encoding);
    },
    async writeFile(targetPath, contents, encoding = "utf8") {
        return nodeFs.writeFile(targetPath, contents, encoding);
    },
    async rename(fromPath, toPath) {
        return nodeFs.rename(fromPath, toPath);
    },
    async mkdir(targetPath, options = { recursive: true }) {
        return nodeFs.mkdir(targetPath, options);
    },
    async unlink(targetPath) {
        return nodeFs.unlink(targetPath);
    }
});

export { defaultFsFacade };
