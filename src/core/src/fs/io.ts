import { createAbortGuard } from "../utils/abort.js";
import { toArrayFromIterable } from "../utils/array.js";
import { isErrorWithCode } from "../utils/error.js";

export interface FileSystemDirectoryReader {
    readonly readDir: (path: string) => Promise<Iterable<string>>;
}

export interface FileSystemStats {
    readonly mtimeMs?: number;
}

export interface FileSystemStatReader {
    readonly stat: (path: string) => Promise<FileSystemStats | null>;
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
 *        Filesystem facade whose `readDir` method mirrors
 *        `fs.promises.readdir`.
 * @param {string} directoryPath Absolute or relative directory to read.
 * @param {{ signal?: AbortSignal | null }} [options] Optional abort signal
 *        bag. The same object is forwarded to {@link createAbortGuard} so any
 *        extra metadata (like custom fallback messages) is honored.
 * @returns {Promise<Array<string>>} Stable array of directory entries,
 *          ordered according to the underlying iterator.
 */
export async function listDirectory(
    fsFacade: FileSystemDirectoryReader,
    directoryPath: string,
    options: Parameters<typeof createAbortGuard>[0] = {}
) {
    const abortMessage = "Directory listing was aborted.";
    const guard = createAbortGuard(options, {
        fallbackMessage: abortMessage
    });

    try {
        const entries = await fsFacade.readDir(directoryPath);
        guard.ensureNotAborted();

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
 * @param {{ signal?: AbortSignal | null }} [options] Optional abort signal
 *        bag forwarded to {@link createAbortGuard}.
 * @returns {Promise<number | null>} Millisecond precision modified time, or
 *          `null` when unavailable.
 */
export async function getFileMtime(
    fsFacade: FileSystemStatReader,
    filePath: string,
    options: Parameters<typeof createAbortGuard>[0] = {}
) {
    const abortMessage = "File metadata read was aborted.";
    const guard = createAbortGuard(options, {
        fallbackMessage: abortMessage
    });

    try {
        const stats = await fsFacade.stat(filePath);
        guard.ensureNotAborted();
        return typeof stats.mtimeMs === "number" ? stats.mtimeMs : null;
    } catch (error) {
        if (isFsErrorCode(error, "ENOENT")) {
            return null;
        }
        throw error;
    }
}
