import { promises as fs } from "node:fs";

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
