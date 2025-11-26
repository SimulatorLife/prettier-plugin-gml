import { promises as fs } from "node:fs";

export type ProjectIndexFsFacade = {
    readFile?: (...args: any[]) => Promise<any>;
    writeFile?: (...args: any[]) => Promise<any>;
    rename?: (...args: any[]) => Promise<any>;
    unlink?: (...args: any[]) => Promise<any>;
    mkdir?: (...args: any[]) => Promise<any>;
    stat?: (...args: any[]) => Promise<{ mtimeMs?: number } | null>;
    readDir?: (path: string) => Promise<Iterable<string>>;
};

export const defaultFsFacade: Required<ProjectIndexFsFacade> = {
    readFile: fs.readFile,
    writeFile: fs.writeFile,
    rename: fs.rename,
    unlink: fs.unlink,
    mkdir: fs.mkdir,
    stat: fs.stat,
    readDir: fs.readdir
};
