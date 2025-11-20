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
export declare function listDirectory(fsFacade: any, directoryPath: any, options?: {}): Promise<any>;
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
export declare function getFileMtime(fsFacade: any, filePath: any, options?: {}): Promise<any>;
