import { promises as fs } from "node:fs";

const defaultFsFacade = {
    async readDir(targetPath) {
        return await fs.readdir(targetPath);
    },
    async stat(targetPath) {
        return await fs.stat(targetPath);
    },
    async readFile(targetPath, encoding = "utf8") {
        return await fs.readFile(targetPath, encoding);
    },
    async writeFile(targetPath, contents, encoding = "utf8") {
        return await fs.writeFile(targetPath, contents, encoding);
    },
    async rename(fromPath, toPath) {
        return await fs.rename(fromPath, toPath);
    },
    async mkdir(targetPath, options = { recursive: true }) {
        return await fs.mkdir(targetPath, options);
    },
    async unlink(targetPath) {
        return await fs.unlink(targetPath);
    }
};

export { defaultFsFacade };
