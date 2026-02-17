/**
 * Default concrete component instances wired to the canonical implementations.
 *
 * This module handles the lowest-level dependency wiring, importing concrete
 * parser and printer adapters and providing them to the factory function.
 * Higher-level orchestration code should depend on the factory (in
 * plugin-component-bundles.ts) or the normalized bundle (in plugin-components.ts)
 * rather than importing concrete implementations directly.
 */

import { handleComments, printComment } from "../comments/index.js";
import { gmlParserAdapter } from "../parsers/index.js";
import { print } from "../printer/index.js";
import { createDefaultGmlPluginComponentImplementations } from "./plugin-component-bundles.js";

/**
 * Default implementation bundle wiring the canonical parser, printer, and
 * comment handlers. This is the single point where concrete adapters are
 * instantiated and passed to the factory function.
 */
export const defaultGmlPluginComponentImplementations = Object.freeze(
    createDefaultGmlPluginComponentImplementations({
        gmlParserAdapter,
        print,
        handleComments,
        printComment
    })
);
