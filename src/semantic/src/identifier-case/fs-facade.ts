import {
    accessSync as nodeAccessSync,
    existsSync as nodeExistsSync,
    mkdirSync as nodeMkdirSync,
    type PathOrFileDescriptor,
    renameSync as nodeRenameSync,
    statSync as nodeStatSync
} from "node:fs";

import { Core } from "@gml-modules/core";

import { DEFAULT_WRITE_ACCESS_MODE } from "./common.js";

const { readTextFileSync, writeTextFileSync } = Core;

const defaultIdentifierCaseFsFacade = Object.freeze({
    readFileSync(targetPath: PathOrFileDescriptor) {
        if (typeof targetPath !== "string") {
            throw new TypeError("readFileSync only accepts string paths");
        }
        return readTextFileSync(targetPath);
    },
    writeFileSync(targetPath: PathOrFileDescriptor, contents: string | Buffer, encoding: BufferEncoding = "utf8") {
        if (typeof targetPath !== "string") {
            throw new TypeError("writeFileSync only accepts string paths");
        }
        if (typeof contents !== "string") {
            throw new TypeError("writeFileSync with centralized helpers only accepts string content");
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

export function getDefaultIdentifierCaseFsFacade() {
    return defaultIdentifierCaseFsFacade;
}

export { defaultIdentifierCaseFsFacade };
