import { Core } from "@gml-modules/core";

export {
    buildDeprecatedBuiltinVariableReplacements,
    type DeprecatedReplacementEntry,
    getDeprecatedBuiltinReplacementEntry
} from "./deprecated-builtin-variable-replacements.js";

// Re-export feather metadata functionality from Core
export const __normalizeFeatherMetadataForTests = Core.__normalizeFeatherMetadataForTests;
export const clearFeatherMetadataCache = Core.clearFeatherMetadataCache;
export const FEATHER_METADATA_PATH = Core.FEATHER_METADATA_PATH;
export const FEATHER_METADATA_URL = Core.FEATHER_METADATA_URL;
export const getFeatherDiagnosticById = Core.getFeatherDiagnosticById;
export const getFeatherDiagnostics = Core.getFeatherDiagnostics;
export const getFeatherMetadata = Core.getFeatherMetadata;
export const loadBundledFeatherMetadata = Core.loadBundledFeatherMetadata;

export * from "./feather-type-system.js";
export type { FeatherDiagnostic, FeatherMetadata } from "@gml-modules/core";
