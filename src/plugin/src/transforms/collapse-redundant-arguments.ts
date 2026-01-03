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
import { createParserTransform } from "./functional-transform.js";

type CollapseRedundantMissingCallArgumentsTransformOptions = Record<string, never>;

/**
 * Entrypoint invoked by the transform framework; this just delegates to the
 * private walker since there are no configurable options.
 */
function execute(
    ast: MutableGameMakerAstNode,
    _options: CollapseRedundantMissingCallArgumentsTransformOptions
): MutableGameMakerAstNode {
    void _options;
    collapseRedundantMissingCallArguments(ast);
    return ast;
}

function collapseRedundantMissingCallArguments(ast: MutableGameMakerAstNode) {
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

        if (node.type === "CallExpression" && Array.isArray(node.arguments) && node.arguments.length > 1) {
            const args = Core.toMutableArray(node.arguments) as Array<any>;
            const hasNonMissingArgument = args.some((argument) => argument?.type !== "MissingOptionalArgument");

            if (!hasNonMissingArgument) {
                const [firstMissingArgument] = args;
                // Retain a single placeholder to preserve call-expression structure.
                // When all arguments in a call are `MissingOptionalArgument` placeholders,
                // we collapse them to a single representative placeholder rather than
                // removing them entirely. GameMaker's runtime allows calling functions
                // with fewer arguments than declared (missing arguments default to
                // `undefined`), so keeping one placeholder signals "this call has optional
                // arguments" to the printer, allowing it to render the correct parenthesis
                // shape (e.g., `func()` vs. `func`). Removing all placeholders would make
                // it ambiguous whether the author intended an empty argument list or a
                // zero-argument invocation, and downstream transformations or printers
                // might incorrectly elide the parentheses altogether.
                node.arguments = firstMissingArgument ? [firstMissingArgument] : [];
            }
        }

        Core.visitChildNodes(node, visit);
    };

    visit(ast);
}

/** Singleton instance exported for composition into the plugin pipeline. */
export const collapseRedundantMissingCallArgumentsTransform =
    createParserTransform<CollapseRedundantMissingCallArgumentsTransformOptions>(
        "collapse-redundant-missing-call-arguments",
        {},
        execute
    );
