import { FunctionalParserTransform } from "./functional-transform.js";
import {
    applyLogicalExpressionCondensation,
    type CondenseLogicalExpressionsOptions
} from "./logical-expressions/condensation.js";

export class CondenseLogicalExpressionsTransform extends FunctionalParserTransform<CondenseLogicalExpressionsOptions> {
    constructor() {
        super("condense-logical-expressions", {});
    }

    protected execute(ast: any, options: CondenseLogicalExpressionsOptions) {
        return applyLogicalExpressionCondensation(ast, options.helpers);
    }
}

export const condenseLogicalExpressionsTransform =
    new CondenseLogicalExpressionsTransform();

