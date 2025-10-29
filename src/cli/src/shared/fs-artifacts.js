import { writeFile as writeFileAsync } from "node:fs/promises";
import path from "node:path";

import {
    ensureDir,
    isNonEmptyString,
    stringifyJsonForFile
} from "./dependencies.js";
import { ensureWorkflowPathsAllowed } from "./workflow/path-filter.js";

/**
 * Write text contents to disk while guaranteeing the parent directory exists
 * before persisting the payload.
 *
 * @param {{
 *   outputPath: string,
 *   contents: string,
 *   encoding?: BufferEncoding,
 *   onAfterWrite?: (details: {
 *     outputPath: string,
 *     contents: string,
 *     encoding: BufferEncoding
 *   }) => void,
 *   writeFile?: typeof writeFileAsync
 * }} options
 * @returns {Promise<void>}
 */
export async function writeFileArtifact({
    outputPath,
    contents,
    encoding = "utf8",
    onAfterWrite,
    writeFile = writeFileAsync,
    pathFilter
}) {
    if (!isNonEmptyString(outputPath)) {
        throw new TypeError("outputPath must be provided to writeManualFile.");
    }

    const directory = path.dirname(outputPath);

    ensureWorkflowPathsAllowed(pathFilter, [
        {
            type: "path",
            target: outputPath,
            label: "Artefact output path"
        },
        {
            type: "directory",
            target: directory,
            label: "Artefact directory"
        }
    ]);

    await ensureDir(directory);
    await writeFile(outputPath, contents, encoding);

    if (typeof onAfterWrite === "function") {
        onAfterWrite({ outputPath, contents, encoding });
    }
}

/**
 * Serialize a payload as JSON and persist it via {@link writeFileArtifact}.
 * Callers can override the JSON formatting knobs while reusing the shared
 * filesystem ceremony around directory creation and write hooks.
 *
 * @param {{
 *   outputPath: string,
 *   payload: unknown,
 *   replacer?: Parameters<typeof JSON.stringify>[1],
 *   space?: Parameters<typeof JSON.stringify>[2],
 *   includeTrailingNewline?: boolean,
 *   onAfterWrite?: Parameters<typeof writeFileArtifact>[0]["onAfterWrite"],
 *   encoding?: BufferEncoding,
 *   writeFile?: typeof writeFileAsync
 * }} options
 * @returns {Promise<void>}
 */
export async function writeJsonArtifact({
    outputPath,
    payload,
    replacer,
    space = 2,
    includeTrailingNewline = true,
    onAfterWrite,
    encoding = "utf8",
    writeFile,
    pathFilter
}) {
    const contents = stringifyJsonForFile(payload, {
        replacer,
        space,
        includeTrailingNewline
    });

    await writeFileArtifact({
        outputPath,
        contents,
        encoding,
        onAfterWrite,
        writeFile,
        pathFilter
    });
}
