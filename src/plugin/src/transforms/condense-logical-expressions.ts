/**
 * Exposes the logical expression condensation helper from `logical-expressions/condensation.ts`
 * as a parser transform so the plugin can reduce nested chains of the same boolean operator.
 */
import type { ParserTransform } from "./functional-transform.js";
import type { MutableGameMakerAstNode } from "@gml-modules/core";
import {
    applyLogicalExpressionCondensation,
    type CondenseLogicalExpressionsOptions
} from "./logical-expressions/condensation.js";

/**
 * Transform wrapper used by the plugin to run the condensation logic defined in the dedicated submodule.
 */
export class CondenseLogicalExpressionsTransform
    implements
        ParserTransform<
            MutableGameMakerAstNode,
            CondenseLogicalExpressionsOptions
        >
{
    public readonly name = "condense-logical-expressions";
    public readonly defaultOptions = Object.freeze(
        {}
    ) as CondenseLogicalExpressionsOptions;

    public transform(
        ast: MutableGameMakerAstNode,
        options?: CondenseLogicalExpressionsOptions
    ): MutableGameMakerAstNode {
        return applyLogicalExpressionCondensation(ast, options?.helpers);
    }
}

/** Pre-instantiated transform exposed for parser-normalization pipelines. */
export const condenseLogicalExpressionsTransform =
    new CondenseLogicalExpressionsTransform();
