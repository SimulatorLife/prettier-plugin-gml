import { createRequire } from "node:module";

import { getNonEmptyTrimmedString } from "../../shared/utils.js";

const require = createRequire(import.meta.url);

const FALLBACK_CLI_VERSION_LABEL = "development build";

const PACKAGE_VERSION_CANDIDATES = Object.freeze([
    "../package.json",
    "../../../package.json",
    "../../plugin/package.json"
]);

function normalizeVersionValue(value) {
    return getNonEmptyTrimmedString(value);
}

function readPackageVersion(candidate) {
    try {
        const packageJson = require(candidate);
        return normalizeVersionValue(packageJson?.version);
    } catch {
        return null;
    }
}

export function resolveCliVersion() {
    const envCandidates = [
        process.env.PRETTIER_PLUGIN_GML_VERSION,
        process.env.npm_package_version
    ];

    for (const candidate of envCandidates) {
        const version = normalizeVersionValue(candidate);
        if (version) {
            return version;
        }
    }

    for (const packagePath of PACKAGE_VERSION_CANDIDATES) {
        const version = readPackageVersion(packagePath);
        if (version) {
            return version;
        }
    }

    return FALLBACK_CLI_VERSION_LABEL;
}

export { FALLBACK_CLI_VERSION_LABEL };
