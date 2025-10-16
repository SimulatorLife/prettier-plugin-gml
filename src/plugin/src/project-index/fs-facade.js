import { promises as fs } from "node:fs";

/**
 * Read-only file system contract for modules that need to enumerate
 * directories.
 *
 * @typedef {object} ProjectIndexDirectoryReader
 * @property {(targetPath: string) => Promise<Array<string>>} readDir
 */

/**
 * Read-only file system contract for retrieving file metadata.
 *
 * @typedef {object} ProjectIndexFileStatReader
 * @property {(targetPath: string) => Promise<import("node:fs").Stats>} stat
 */

/**
 * Read-only file system contract for loading file contents.
 *
 * @typedef {object} ProjectIndexFileReader
 * @property {(targetPath: string, encoding?: string) => Promise<string>} readFile
 */

/**
 * File system contract for persisting cache data. The responsibilities are
 * limited to the mutation operations required by the project index cache so
 * consumers that only read from the file system can depend on a narrower API.
 *
 * @typedef {object} ProjectIndexCacheWriter
 * @property {(targetPath: string, options?: import("node:fs").MakeDirectoryOptions) => Promise<unknown>} mkdir
 * @property {(targetPath: string, contents: string | ArrayBufferView, encoding?: string) => Promise<unknown>} writeFile
 * @property {(fromPath: string, toPath: string) => Promise<unknown>} rename
 * @property {(targetPath: string) => Promise<unknown>} unlink
 */

/**
 * Combined legacy facade retained for compatibility. New code should favour
 * {@link ProjectIndexDirectoryReader}, {@link ProjectIndexFileReader}, and
 * {@link ProjectIndexCacheWriter} so that each module only depends on the
 * operations it actually performs.
 *
 * @typedef {ProjectIndexDirectoryReader &
 *     ProjectIndexFileStatReader &
 *     ProjectIndexFileReader &
 *     ProjectIndexCacheWriter} ProjectIndexFsFacade
 */

const defaultFsFacade = {
    async readDir(targetPath) {
        return fs.readdir(targetPath);
    },
    async stat(targetPath) {
        return fs.stat(targetPath);
    },
    async readFile(targetPath, encoding = "utf8") {
        return fs.readFile(targetPath, encoding);
    },
    async writeFile(targetPath, contents, encoding = "utf8") {
        return fs.writeFile(targetPath, contents, encoding);
    },
    async rename(fromPath, toPath) {
        return fs.rename(fromPath, toPath);
    },
    async mkdir(targetPath, options = { recursive: true }) {
        return fs.mkdir(targetPath, options);
    },
    async unlink(targetPath) {
        return fs.unlink(targetPath);
    }
};

export function getDefaultFsFacade() {
    return defaultFsFacade;
}

export { defaultFsFacade };
