/**
 * This transform removes extra trailing `MissingOptionalArgument` nodes from
 * call expressions so that downstream formatting/printer passes do not emit
 * redundant placeholders when all supplied arguments have been elided.
 * 
 * The transform targets cases where a call contains multiple missing optional
 * arguments, collapsing them down to a single missing placeholder and therefore
 * reducing noise during the printer stage.
 */
import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";
import { FunctionalParserTransform } from "./functional-transform.js";

type CollapseRedundantMissingCallArgumentsTransformOptions = Record<
    string,
    never
>;

/**
 * Constructed once and exposed as `collapseRedundantMissingCallArgumentsTransform`
 * so it can be composed into the parser normalization pipeline.
 */
export class CollapseRedundantMissingCallArgumentsTransform extends FunctionalParserTransform<CollapseRedundantMissingCallArgumentsTransformOptions> {
    constructor() {
        super("collapse-redundant-missing-call-arguments", {});
    }

    /**
     * Entrypoint invoked by the transform framework; this just delegates to the
     * private walker since there are no configurable options.
     */
    protected execute(
        ast: MutableGameMakerAstNode,
        _options: CollapseRedundantMissingCallArgumentsTransformOptions
    ): MutableGameMakerAstNode {
        void _options;
        this.collapseRedundantMissingCallArguments(ast);
        return ast;
    }

    private collapseRedundantMissingCallArguments(
        ast: MutableGameMakerAstNode
    ) {
        if (!ast || typeof ast !== "object") {
            return;
        }

        const visited = new WeakSet();

        /**
         * Depth-first walk that only visits each AST node once.
         */
        const visit = (node: MutableGameMakerAstNode) => {
            if (!node || typeof node !== "object" || visited.has(node)) {
                return;
            }

            visited.add(node);

            if (
                node.type === "CallExpression" &&
                Array.isArray(node.arguments) &&
                node.arguments.length > 1
            ) {
                const args = Core.toMutableArray(node.arguments) as Array<any>;
                const hasNonMissingArgument = args.some(
                    (argument) => argument?.type !== "MissingOptionalArgument"
                );

                if (!hasNonMissingArgument) {
                    const [firstMissingArgument] = args;
                    // Keep a single placeholder so the printer can still render the
                    // missing optional argument when required.
                    node.arguments = firstMissingArgument
                        ? [firstMissingArgument]
                        : [];
                }
            }

            Core.visitChildNodes(node, visit);
        };

        visit(ast);
    }
}

/** Singleton instance exported for composition into the plugin pipeline. */
export const collapseRedundantMissingCallArgumentsTransform =
    new CollapseRedundantMissingCallArgumentsTransform();
