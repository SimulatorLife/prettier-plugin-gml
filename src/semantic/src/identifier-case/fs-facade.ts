import {
    accessSync as nodeAccessSync,
    constants as fsConstants,
    existsSync as nodeExistsSync,
    mkdirSync as nodeMkdirSync,
    type PathOrFileDescriptor,
    renameSync as nodeRenameSync,
    statSync as nodeStatSync
} from "node:fs";

import { Core } from "@gmloop/core";

const { readTextFileSync, writeTextFileSync } = Core;
export const DEFAULT_WRITE_ACCESS_MODE = typeof fsConstants?.W_OK === "number" ? fsConstants.W_OK : undefined;

const defaultIdentifierCaseFsFacade = Object.freeze({
    readFileSync(targetPath: PathOrFileDescriptor) {
        if (typeof targetPath !== "string") {
            throw new TypeError("readFileSync only accepts string paths");
        }
        return readTextFileSync(targetPath);
    },
    writeFileSync(targetPath: PathOrFileDescriptor, contents: string) {
        if (typeof targetPath !== "string") {
            throw new TypeError("writeFileSync only accepts string paths");
        }
        writeTextFileSync(targetPath, contents);
    },
    renameSync(fromPath, toPath) {
        nodeRenameSync(fromPath, toPath);
    },
    accessSync(targetPath, mode = DEFAULT_WRITE_ACCESS_MODE) {
        if (mode === undefined) {
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

export { defaultIdentifierCaseFsFacade };
