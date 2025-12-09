import { FunctionalParserTransform } from "./functional-transform.js";
import {
    applyLogicalExpressionCondensation,
    type CondenseLogicalExpressionsOptions
} from "./logical-expressions/condensation.js";

class CondenseLogicalExpressionsTransform extends FunctionalParserTransform<CondenseLogicalExpressionsOptions> {
    constructor() {
        super("condense-logical-expressions", {});
    }

    protected execute(ast: any, options: CondenseLogicalExpressionsOptions) {
        return applyLogicalExpressionCondensation(ast, options.helpers);
    }
}

const condenseLogicalExpressionsTransform =
    new CondenseLogicalExpressionsTransform();

/**
 * Applies the logical-expression condensation transform with optional helpers
 * for comment detection.
 */
export function condenseLogicalExpressions(
    ast: any,
    helpersOrOptions?:
        | CondenseLogicalExpressionsOptions
        | CondenseLogicalExpressionsOptions["helpers"]
) {
    const helpers = (
        helpersOrOptions &&
        typeof helpersOrOptions === "object" &&
        "helpers" in helpersOrOptions
            ? helpersOrOptions.helpers
            : helpersOrOptions
    ) as CondenseLogicalExpressionsOptions["helpers"];

    return condenseLogicalExpressionsTransform.transform(ast, {
        helpers
    });
}
