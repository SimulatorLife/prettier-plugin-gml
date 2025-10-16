import { getSingleVariableDeclarator } from "../../../shared/ast-node-helpers.js";
import { getNodeStartIndex } from "../../../shared/ast-locations.js";

function getNodeIndex(node) {
    if (node && typeof node.start === "number") {
        return node.start;
    }

    return getNodeStartIndex(node);
}

function constructorDocHasHide(constructorNode, sourceText) {
    const startIndex = getNodeIndex(constructorNode);
    if (typeof startIndex !== "number" || startIndex <= 0) {
        return false;
    }

    let cursor = startIndex - 1;

    while (cursor >= 0) {
        const currentChar = sourceText.charCodeAt(cursor);
        if (currentChar === 10 || currentChar === 13) {
            cursor -= 1;
            continue;
        }

        const lineStart = sourceText.lastIndexOf("\n", cursor) + 1;
        const line = sourceText.slice(lineStart, cursor + 1);
        const trimmed = line.trim();

        if (trimmed.length === 0) {
            cursor = lineStart - 1;
            continue;
        }

        if (trimmed.startsWith("//") || trimmed.startsWith("///")) {
            const normalized = trimmed
                .replace(/^\/{2,}/, "")
                .trim()
                .toLowerCase();
            if (
                normalized.includes("@hide") ||
                normalized.includes("@private") ||
                normalized.includes("@hidden")
            ) {
                return true;
            }

            cursor = lineStart - 1;
            continue;
        }

        break;
    }

    return false;
}

export function annotateConstructorStatics(ast, { sourceText } = {}) {
    if (!ast || typeof ast !== "object" || !Array.isArray(ast.body)) {
        return;
    }

    if (typeof sourceText !== "string") {
        return;
    }

    const constructorEntries = new Map();

    for (const node of ast.body) {
        if (
            node?.type !== "ConstructorDeclaration" ||
            typeof node.id !== "string"
        ) {
            continue;
        }

        const statements = Array.isArray(node.body?.body) ? node.body.body : [];
        const entry = {
            name: node.id,
            parentName:
                typeof node.parent?.id === "string" ? node.parent.id : null,
            statics: [],
            isHidden: constructorDocHasHide(node, sourceText)
        };

        for (const statement of statements) {
            if (
                statement?.type !== "VariableDeclaration" ||
                statement.kind !== "static"
            ) {
                continue;
            }

            const declarator = getSingleVariableDeclarator(statement);
            if (
                !declarator ||
                declarator.id?.type !== "Identifier" ||
                typeof declarator.id.name !== "string" ||
                declarator.init?.type !== "FunctionDeclaration"
            ) {
                continue;
            }

            entry.statics.push({
                name: declarator.id.name,
                functionNode: declarator.init,
                startIndex: getNodeIndex(statement)
            });
        }

        constructorEntries.set(entry.name, entry);
    }

    const ancestorCache = new Map();

    const collectAncestorStaticNames = (entry) => {
        if (!entry || !entry.parentName) {
            return new Set();
        }

        if (ancestorCache.has(entry.name)) {
            return ancestorCache.get(entry.name);
        }

        const names = new Set();
        const visited = new Set();
        let current = entry.parentName;

        while (typeof current === "string" && current.length > 0) {
            if (visited.has(current)) {
                break;
            }

            visited.add(current);
            const parentEntry = constructorEntries.get(current);
            if (!parentEntry) {
                break;
            }

            for (const staticInfo of parentEntry.statics) {
                names.add(staticInfo.name);
            }

            current = parentEntry.parentName;
        }

        ancestorCache.set(entry.name, names);
        return names;
    };

    for (const entry of constructorEntries.values()) {
        const ancestorNames = collectAncestorStaticNames(entry);

        for (const staticInfo of entry.statics) {
            if (ancestorNames.has(staticInfo.name)) {
                staticInfo.functionNode._docCommentOverride = true;
            }

            if (
                entry.isHidden &&
                (!Array.isArray(staticInfo.functionNode.params) ||
                    staticInfo.functionNode.params.length === 0)
            ) {
                staticInfo.functionNode._suppressSyntheticReturnsDoc = true;
            }
        }
    }
}
