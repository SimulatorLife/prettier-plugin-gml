import nodeFs from "node:fs/promises";
import nodeFsSync from "node:fs";

type RecursiveMkdirFs = Pick<typeof nodeFs, "mkdir">;
type RecursiveMkdirFsSync = Pick<typeof nodeFsSync, "mkdirSync">;

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
 */
export async function ensureDir(dirPath: string, fsModule: RecursiveMkdirFs = nodeFs): Promise<void> {
    await fsModule.mkdir(dirPath, { recursive: true });
}

/**
 * Synchronous variant of {@link ensureDir} for contexts that require blocking
 * directory creation (e.g., synchronous CLI commands or initialization logic).
 *
 * Centralises the recursive `mkdirSync` guard used by synchronous code paths
 * while preserving the same testability and error-handling guarantees as the
 * async variant. Defaults to Node's synchronous `fs` facade but accepts any
 * compatible implementation.
 *
 */
export function ensureDirSync(dirPath: string, fsModule: RecursiveMkdirFsSync = nodeFsSync): void {
    fsModule.mkdirSync(dirPath, { recursive: true });
}
