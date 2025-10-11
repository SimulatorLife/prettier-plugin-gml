// Lightweight helpers for accessing the bundled Feather metadata artefact.
//
// Keeping these utilities within the plugin tree reflects that they are
// purely formatter-facing and avoids leaking Feather concepts into the
// shared parser/runtime utilities.

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let cachedMetadata = null;

function loadFeatherMetadata() {
    if (cachedMetadata) {
        return cachedMetadata;
    }

    const metadata = require("../../../../resources/feather-metadata.json");
    cachedMetadata = metadata;
    return metadata;
}

export function getFeatherMetadata() {
    return loadFeatherMetadata();
}

export function getFeatherDiagnostics() {
    const metadata = loadFeatherMetadata();
    const diagnostics = metadata?.diagnostics;

    if (!Array.isArray(diagnostics)) {
        return [];
    }

    return diagnostics;
}

export function getFeatherDiagnosticById(id) {
    if (!id) {
        return null;
    }

    const diagnostics = getFeatherDiagnostics();

    return diagnostics.find((diagnostic) => diagnostic?.id === id) ?? null;
}
