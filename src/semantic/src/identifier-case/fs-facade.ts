import {
    accessSync as nodeAccessSync,
    existsSync as nodeExistsSync,
    mkdirSync as nodeMkdirSync,
    type PathOrFileDescriptor,
    renameSync as nodeRenameSync,
    statSync as nodeStatSync,
    writeFileSync as nodeWriteFileSync
} from "node:fs";

import { Core } from "@gml-modules/core";

import { DEFAULT_WRITE_ACCESS_MODE } from "./common.js";

const { readTextFileSync } = Core;

const defaultIdentifierCaseFsFacade = Object.freeze({
    readFileSync(targetPath: PathOrFileDescriptor) {
        return readTextFileSync(targetPath as string);
    },
    writeFileSync(targetPath: PathOrFileDescriptor, contents: string | Buffer, _encoding: BufferEncoding = "utf8") {
        nodeWriteFileSync(targetPath, contents, _encoding);
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

export function getDefaultIdentifierCaseFsFacade() {
    return defaultIdentifierCaseFsFacade;
}

export { defaultIdentifierCaseFsFacade };
