import nodeFs from "node:fs/promises";

type RecursiveMkdirFs = Pick<typeof nodeFs, "mkdir">;

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
export async function ensureDir(
    dirPath: string,
    fsModule: RecursiveMkdirFs = nodeFs
): Promise<void> {
    await fsModule.mkdir(dirPath, { recursive: true });
}
