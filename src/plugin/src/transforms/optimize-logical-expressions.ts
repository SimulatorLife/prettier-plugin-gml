/**
 * Exposes the logical expression condensation helper from `logical-expressions/condensation.ts`
 * as a parser transform so the plugin can reduce nested chains of the same boolean operator.
 */
import { createParserTransform } from "./functional-transform.js";
import {
    applyLogicalExpressionCondensation,
    type CondenseLogicalExpressionsOptions
} from "./logical-expressions/condensation.js";

/**
 * Delegates to the shared condensation helper, passing along any helper registry supplied by callers.
 */
function execute(ast: any, options: CondenseLogicalExpressionsOptions) {
    return applyLogicalExpressionCondensation(ast, options.helpers);
}

/** Pre-instantiated transform exposed for parser-normalization pipelines. */
export const condenseLogicalExpressionsTransform = createParserTransform<CondenseLogicalExpressionsOptions>(
    "condense-logical-expressions",
    {},
    execute
);
