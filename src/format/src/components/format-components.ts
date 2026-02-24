import { createDefaultGmlFormatComponents } from "./default-format-components.js";
import { normalizeGmlFormatComponents } from "./format-component-normalizer.js";
import type { GmlFormatComponentBundle } from "./format-types.js";

/**
 * The immutable, normalized format component bundle used by the GML Prettier plugin.
 * This constant is initialized once at module load time and never changes.
 *
 * Components include:
 * - Parsers for converting GML source to AST
 * - Printers for converting AST back to formatted GML
 * - Format options and their defaults
 */
export const gmlFormatComponents: GmlFormatComponentBundle = Object.freeze(
    normalizeGmlFormatComponents(createDefaultGmlFormatComponents())
);
