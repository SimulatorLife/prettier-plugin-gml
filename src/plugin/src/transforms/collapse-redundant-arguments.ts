import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";
import { FunctionalParserTransform } from "./functional-transform.js";

type CollapseRedundantMissingCallArgumentsTransformOptions = Record<
    string,
    never
>;

export class CollapseRedundantMissingCallArgumentsTransform extends FunctionalParserTransform<CollapseRedundantMissingCallArgumentsTransformOptions> {
    constructor() {
        super("collapse-redundant-missing-call-arguments", {});
    }

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

export const collapseRedundantMissingCallArgumentsTransform =
    new CollapseRedundantMissingCallArgumentsTransform();

