import {
    readFileSync as nodeReadFileSync,
    writeFileSync as nodeWriteFileSync,
    renameSync as nodeRenameSync,
    accessSync as nodeAccessSync,
    statSync as nodeStatSync,
    mkdirSync as nodeMkdirSync,
    existsSync as nodeExistsSync
} from "node:fs";

import { DEFAULT_WRITE_ACCESS_MODE } from "./common.js";

const defaultIdentifierCaseFsFacade = Object.freeze({
    readFileSync(targetPath, encoding = "utf8") {
        return nodeReadFileSync(targetPath, encoding);
    },
    writeFileSync(targetPath, contents, encoding = "utf8") {
        nodeWriteFileSync(targetPath, contents, encoding);
    },
    renameSync(fromPath, toPath) {
        nodeRenameSync(fromPath, toPath);
    },
    accessSync(targetPath, mode = DEFAULT_WRITE_ACCESS_MODE) {
        if (mode == undefined) {
            nodeAccessSync(targetPath);
        } else {
            nodeAccessSync(targetPath, mode);
        }
    },
    statSync(targetPath) {
        return nodeStatSync(targetPath);
    },
    mkdirSync(targetPath) {
        nodeMkdirSync(targetPath, { recursive: true });
    },
    existsSync(targetPath) {
        return nodeExistsSync(targetPath);
    }
});

export function getDefaultIdentifierCaseFsFacade() {
    return defaultIdentifierCaseFsFacade;
}

export { defaultIdentifierCaseFsFacade };
