// TODO: Remove this facade and make direct calls
import { promises as fs } from "node:fs";

const defaultFsFacade = {
    async readDir(targetPath) {
        return fs.readdir(targetPath);
    },
    async stat(targetPath) {
        return fs.stat(targetPath);
    },
    async readFile(targetPath, encoding: BufferEncoding | null = "utf8") {
        return fs.readFile(targetPath, encoding as BufferEncoding | null);
    },
    async writeFile(
        targetPath,
        contents,
        encoding: BufferEncoding | null = "utf8"
    ) {
        return fs.writeFile(
            targetPath,
            contents,
            encoding as BufferEncoding | null
        );
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

export type ProjectIndexFsFacade = Partial<{
    readDir(targetPath: any): Promise<string[]>;
    stat(...args: any[]): Promise<any>;
    readFile(targetPath: any, encoding?: BufferEncoding | null): Promise<any>;
    writeFile(
        targetPath: any,
        contents: any,
        encoding?: BufferEncoding | null
    ): Promise<any>;
    rename(fromPath: any, toPath: any): Promise<any>;
    mkdir(targetPath: any, options?: { recursive?: boolean }): Promise<any>;
    unlink(targetPath: any): Promise<any>;
}>;
export { defaultFsFacade };
