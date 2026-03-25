import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export type TempProjectWorkspace = {
    projectRoot: string;
    writeProjectFile: (relativePath: string, contents: string) => Promise<string>;
    cleanup: () => Promise<void>;
};

/**
 * Creates an isolated temporary GameMaker project workspace for semantic tests.
 */
export async function createTempProjectWorkspace(prefix: string): Promise<TempProjectWorkspace> {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));

    const writeProjectFile = async (relativePath: string, contents: string): Promise<string> => {
        const absolutePath = path.join(projectRoot, relativePath);
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.writeFile(absolutePath, contents, "utf8");
        return absolutePath;
    };

    const cleanup = async (): Promise<void> => {
        await fs.rm(projectRoot, { recursive: true, force: true });
    };

    return {
        projectRoot,
        writeProjectFile,
        cleanup
    };
}

/**
 * Returns the values of a record while preserving the caller's value type.
 */
export function recordValues<T>(record: Record<string, T>): T[] {
    return Object.values(record);
}
