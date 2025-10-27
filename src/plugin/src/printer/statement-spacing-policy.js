import {
    getNormalizedDefineReplacementDirective,
    isFunctionLikeDeclaration
} from "./util.js";
import { getBooleanLiteralValue } from "../shared/index.js";

/**
 * Encapsulates spacing heuristics so callers can reason about blank-line
 * insertion without embedding policy logic in the printer's rendering paths.
 */
class StatementSpacingPolicy {
    isMacroLikeStatement(node) {
        const nodeType = node?.type;
        if (!nodeType) {
            return false;
        }

        if (nodeType === "MacroDeclaration") {
            return true;
        }

        if (nodeType === "DefineStatement") {
            return getNormalizedDefineReplacementDirective(node) === "#macro";
        }

        return false;
    }

    shouldSuppressEmptyLineBetween(previousNode, nextNode) {
        if (!previousNode || !nextNode) {
            return false;
        }

        if (
            this.isMacroLikeStatement(previousNode) &&
            this.isMacroLikeStatement(nextNode)
        ) {
            return true;
        }

        return false;
    }

    shouldForceTrailingBlankLineForNestedFunction(
        node,
        blockNode,
        containerNode
    ) {
        if (!isFunctionLikeDeclaration(node)) {
            return false;
        }

        if (!blockNode || blockNode.type !== "BlockStatement") {
            return false;
        }

        return isFunctionLikeDeclaration(containerNode);
    }

    shouldForceBlankLineBetweenReturnPaths(currentNode, nextNode) {
        if (!currentNode || currentNode.type !== "IfStatement") {
            return false;
        }

        if (!nextNode || nextNode.type !== "ReturnStatement") {
            return false;
        }

        if (currentNode.alternate) {
            return false;
        }

        const consequent = currentNode.consequent;
        if (!consequent || consequent.type !== "BlockStatement") {
            return false;
        }

        const body = Array.isArray(consequent.body) ? consequent.body : [];
        let lastReturn = null;

        for (let index = body.length - 1; index >= 0; index -= 1) {
            const statement = body[index];
            if (!statement) {
                continue;
            }

            if (statement.type === "ReturnStatement") {
                lastReturn = statement;
                break;
            }

            return false;
        }

        if (!lastReturn) {
            return false;
        }

        const consequentBoolean = getBooleanLiteralValue(lastReturn.argument);
        const fallbackBoolean = getBooleanLiteralValue(nextNode.argument);

        if (consequentBoolean === null || fallbackBoolean === null) {
            return false;
        }

        return consequentBoolean !== fallbackBoolean;
    }
}

export { StatementSpacingPolicy };
