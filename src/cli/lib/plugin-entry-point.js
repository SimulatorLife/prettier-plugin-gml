import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const CLI_DIRECTORY = path.resolve(MODULE_DIRECTORY, "..");
const REPO_ROOT = path.resolve(CLI_DIRECTORY, "..");

const CANDIDATE_PLUGIN_PATHS = [
    ["plugin", "src", "gml.js"],
    ["plugin", "src", "index.js"],
    ["plugin", "index.js"]
];

function resolveCandidatePath(segments) {
    return path.resolve(REPO_ROOT, ...segments);
}

export function resolvePluginEntryPoint() {
    for (const segments of CANDIDATE_PLUGIN_PATHS) {
        const candidate = resolveCandidatePath(segments);
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    throw new Error(
        "Unable to locate the Prettier plugin entry point. Expected one of: " +
            CANDIDATE_PLUGIN_PATHS.map((segments) =>
                resolveCandidatePath(segments)
            ).join(", ")
    );
}
