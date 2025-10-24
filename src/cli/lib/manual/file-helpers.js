import fs from "node:fs/promises";
import path from "node:path";

import {
    ensureDir,
    isNonEmptyString,
    stringifyJsonForFile
} from "../shared-deps.js";

/**
 * Persist manual-derived artefacts to disk while guaranteeing parent directories
 * exist. Centralises the file-system ceremony shared by manual helpers so
 * commands and caching logic can focus on their payloads and logging.
 *
 * @param {{
 *   outputPath: string,
 *   contents: string,
 *   encoding?: BufferEncoding,
 *   onAfterWrite?: (details: {
 *     outputPath: string,
 *     contents: string,
 *     encoding: BufferEncoding
 *   }) => void
 * }} options
 * @returns {Promise<void>}
 */
export async function writeManualFile({
    outputPath,
    contents,
    encoding = "utf8",
    onAfterWrite
}) {
    if (!isNonEmptyString(outputPath)) {
        throw new TypeError("outputPath must be provided to writeManualFile.");
    }

    await ensureDir(path.dirname(outputPath));
    await fs.writeFile(outputPath, contents, encoding);

    if (typeof onAfterWrite === "function") {
        onAfterWrite({ outputPath, contents, encoding });
    }
}

/**
 * Serialize manual metadata into JSON with stable formatting before persisting
 * it via {@link writeManualFile}. Keeps commands from duplicating newline and
 * indentation handling when emitting artefacts.
 *
 * @param {{
 *   outputPath: string,
 *   payload: unknown,
 *   replacer?: Parameters<typeof JSON.stringify>[1],
 *   space?: Parameters<typeof JSON.stringify>[2],
 *   includeTrailingNewline?: boolean,
 *   onAfterWrite?: Parameters<typeof writeManualFile>[0]["onAfterWrite"]
 * }} options
 * @returns {Promise<void>}
 */
export async function writeManualJsonArtifact({
    outputPath,
    payload,
    replacer,
    space = 2,
    includeTrailingNewline = true,
    onAfterWrite
}) {
    const contents = stringifyJsonForFile(payload, {
        replacer,
        space,
        includeTrailingNewline
    });

    await writeManualFile({
        outputPath,
        contents,
        encoding: "utf8",
        onAfterWrite
    });
}
