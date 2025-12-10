/**
 * Exposes the logical expression condensation helper from `logical-expressions/condensation.ts`
 * as a parser transform so the plugin can reduce nested chains of the same boolean operator.
 */
import { FunctionalParserTransform } from "./functional-transform.js";
import {
    applyLogicalExpressionCondensation,
    type CondenseLogicalExpressionsOptions
} from "./logical-expressions/condensation.js";

/**
 * Transform wrapper used by the plugin to run the condensation logic defined in the dedicated submodule.
 */
export class CondenseLogicalExpressionsTransform extends FunctionalParserTransform<CondenseLogicalExpressionsOptions> {
    constructor() {
        super("condense-logical-expressions", {});
    }

    /**
     * Delegates to the shared condensation helper, passing along any helper registry supplied by callers.
     */
    protected execute(ast: any, options: CondenseLogicalExpressionsOptions) {
        return applyLogicalExpressionCondensation(ast, options.helpers);
    }
}

/** Pre-instantiated transform exposed for parser-normalization pipelines. */
export const condenseLogicalExpressionsTransform =
    new CondenseLogicalExpressionsTransform();
