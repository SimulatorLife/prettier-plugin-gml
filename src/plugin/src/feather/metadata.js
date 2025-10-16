/**
 * Lightweight helpers for accessing the bundled Feather metadata artefact.
 *
 * The formatter queries individual diagnostics to understand the intent
 * behind specific auto-fixes. Centralising metadata access keeps downstream
 * modules from worrying about relative path resolution or cache management.
 */

/**
 * @typedef {object} FeatherDiagnostic
 * @property {string} [id]
 */

/**
 * @typedef {object} FeatherMetadata
 * @property {Array<FeatherDiagnostic>} [diagnostics]
 */

import { createRequire } from "node:module";

import { asArray } from "../../../shared/array-utils.js";
import { toTrimmedString } from "../../../shared/string-utils.js";

const require = createRequire(import.meta.url);

/** @type {FeatherMetadata | null} */
let cachedMetadata = null;

function loadFeatherMetadata() {
    if (cachedMetadata) {
        return cachedMetadata;
    }

    /** @type {FeatherMetadata} */
    const metadata = require("../../../../resources/feather-metadata.json");
    cachedMetadata = metadata;
    return metadata;
}

/**
 * Retrieve the shared Feather metadata payload bundled with the plugin.
 *
 * @returns {FeatherMetadata}
 */
export function getFeatherMetadata() {
    return loadFeatherMetadata();
}

/**
 * Return the list of Feather diagnostics declared in the bundled metadata.
 *
 * @returns {Array<FeatherDiagnostic>}
 */
export function getFeatherDiagnostics() {
    const metadata = loadFeatherMetadata();
    return asArray(metadata?.diagnostics);
}

/**
 * Look up a single Feather diagnostic by its identifier.
 *
 * @param {string | null | undefined} id Diagnostic identifier to find.
 * @returns {FeatherDiagnostic | null}
 */
export function getFeatherDiagnosticById(id) {
    const normalizedId = toTrimmedString(id);
    if (!normalizedId) {
        return null;
    }

    const diagnostics = getFeatherDiagnostics();

    return (
        diagnostics.find(
            (diagnostic) => toTrimmedString(diagnostic?.id) === normalizedId
        ) ?? null
    );
}
