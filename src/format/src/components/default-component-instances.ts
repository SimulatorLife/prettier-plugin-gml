/**
 * Default concrete component instances wired to the canonical implementations.
 *
 * This module handles the lowest-level dependency wiring, importing concrete
 * parser and printer adapters and assembling the frozen component contract.
 * Higher-level orchestration code should depend on the normalized bundle (in
 * format-components.ts) rather than importing concrete implementations directly.
 */

import { handleComments, printComment } from "../comments/index.js";
import { LogicalOperatorsStyle } from "../options/logical-operators-style.js";
import { gmlParserAdapter } from "../parsers/index.js";
import { print } from "../printer/index.js";
import type { GmlFormatComponentContract } from "./format-types.js";

/**
 * Default implementation bundle wiring the canonical parser, printer, and
 * comment handlers. This is the single point where concrete adapters are
 * assembled into the component contract.
 */
export const defaultGmlFormatComponentImplementations: GmlFormatComponentContract = Object.freeze({
    gmlParserAdapter,
    print,
    handleComments,
    printComment,
    LogicalOperatorsStyle
});
