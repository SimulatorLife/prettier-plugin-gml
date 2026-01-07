import { createDefaultGmlPluginComponents } from "./default-plugin-components.js";
import { normalizeGmlPluginComponents } from "./plugin-component-normalizer.js";
import type { GmlPluginComponentBundle } from "./plugin-types.js";

/**
 * The immutable, normalized plugin component bundle used by the GML Prettier plugin.
 * This constant is initialized once at module load time and never changes.
 *
 * Components include:
 * - Parsers for converting GML source to AST
 * - Printers for converting AST back to formatted GML
 * - Plugin options and their defaults
 */
export const gmlPluginComponents: GmlPluginComponentBundle = Object.freeze(
    normalizeGmlPluginComponents(createDefaultGmlPluginComponents())
);
