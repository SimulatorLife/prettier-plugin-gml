import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";
import { FunctionalParserTransform } from "./functional-transform.js";

type MarkCallsMissingArgumentSeparatorsTransformOptions = {
    originalText?: string;
};

export class MarkCallsMissingArgumentSeparatorsTransform extends FunctionalParserTransform<MarkCallsMissingArgumentSeparatorsTransformOptions> {
    constructor() {
        super("mark-calls-missing-argument-separators", {});
    }

    protected execute(
        ast: MutableGameMakerAstNode,
        options: MarkCallsMissingArgumentSeparatorsTransformOptions
    ): MutableGameMakerAstNode {
        if (typeof options.originalText === "string") {
            this.markCallsMissingArgumentSeparators(ast, options.originalText);
        }
        return ast;
    }

    private markCallsMissingArgumentSeparators(
        ast: MutableGameMakerAstNode,
        originalText: string
    ) {
        if (!ast || typeof ast !== "object") {
            return;
        }

        const visitedNodes = new WeakSet();

        const visit = (node: MutableGameMakerAstNode) => {
            if (!node || typeof node !== "object") {
                return;
            }

            if (visitedNodes.has(node)) {
                return;
            }
            visitedNodes.add(node);

            Core.visitChildNodes(node, visit);

            if (
                this.shouldPreserveCallWithMissingSeparators(node, originalText)
            ) {
                Object.defineProperty(node, "preserveOriginalCallText", {
                    configurable: true,
                    enumerable: false,
                    writable: true,
                    value: true
                });
            }
        };

        visit(ast);
    }

    private shouldPreserveCallWithMissingSeparators(
        node: MutableGameMakerAstNode,
        originalText: string
    ) {
        if (!node || node.type !== "CallExpression") {
            return false;
        }

        const args = Core.toMutableArray(node.arguments);

        if (
            args.some(
                (argument) =>
                    argument &&
                    typeof argument === "object" &&
                    (argument as any).preserveOriginalCallText === true
            )
        ) {
            return true;
        }

        if (args.length < 2) {
            return false;
        }

        for (let index = 0; index < args.length - 1; index += 1) {
            const current = args[index];
            const next = args[index + 1];
            const currentEnd = Core.getNodeEndIndex(current);
            const nextStart = Core.getNodeStartIndex(next);

            if (
                currentEnd == null ||
                nextStart == null ||
                nextStart <= currentEnd
            ) {
                continue;
            }

            const between = originalText.slice(currentEnd, nextStart);
            if (between.includes(",")) {
                continue;
            }

            const previousChar =
                currentEnd > 0 ? originalText[currentEnd - 1] : "";
            const nextChar =
                nextStart < originalText.length ? originalText[nextStart] : "";

            if (
                !Core.isNonEmptyTrimmedString(between) &&
                this.isNumericBoundaryCharacter(previousChar) &&
                this.isNumericBoundaryCharacter(nextChar)
            ) {
                return true;
            }
        }

        return false;
    }

    private isNumericBoundaryCharacter(character: string | undefined) {
        return /[0-9.-]/.test(character ?? "");
    }
}

export const markCallsMissingArgumentSeparatorsTransform =
    new MarkCallsMissingArgumentSeparatorsTransform();

