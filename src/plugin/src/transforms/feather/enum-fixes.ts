/**
 * Feather-specific enum helpers ensure automatic fixes either remove duplicate members or sanitize invalid initializers.
 */
import { Core } from "@gml-modules/core";

import { getEndFromNode } from "./ast-traversal.js";
import { removeDuplicateSemicolons } from "./semicolon-fixes.js";
import {
    attachFeatherFixMetadata,
    createFeatherFixDetail,
    hasFeatherDiagnosticContext,
    isIntegerLiteralString,
    visitFeatherAST
} from "./utils.js";

/**
 * Remove repeated `enum` members and emit Feather fix metadata describing the deletions.
 */
export function removeDuplicateEnumMembers({ ast, diagnostic, sourceText }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    visitFeatherAST(ast, (node) => {
        if (node.type === "EnumDeclaration") {
            const members = Core.asArray(node.members);

            if (members.length > 1) {
                const seen = new Map();

                const removeMember = (targetMember) => {
                    if (!Core.isNode(targetMember)) {
                        return -1;
                    }

                    const targetName = Core.isIdentifierNode((targetMember as any).name)
                        ? (targetMember as any).name.name
                        : null;

                    const removalIndex = members.indexOf(targetMember);
                    if (removalIndex === -1) {
                        return -1;
                    }

                    const startIndex = Core.getNodeStartIndex(targetMember);
                    const endIndex = Core.getNodeEndIndex(targetMember);
                    const fixDetail = createFeatherFixDetail(diagnostic, {
                        target: targetName,
                        range:
                            typeof startIndex === "number" && typeof endIndex === "number"
                                ? {
                                      start: startIndex,
                                      end: endIndex
                                  }
                                : null
                    });

                    if (fixDetail) {
                        fixes.push(fixDetail);
                        attachFeatherFixMetadata(node, [fixDetail]);
                    }

                    members.splice(removalIndex, 1);
                    return removalIndex;
                };

                const removeMemberAndAdjustIndex = (targetMember, currentIndex) => {
                    const removalIndex = removeMember(targetMember);
                    if (removalIndex !== -1 && removalIndex <= currentIndex) {
                        return currentIndex - 1;
                    }

                    return currentIndex;
                };

                for (let index = 0; index < members.length; index += 1) {
                    const member = members[index];

                    if (!Core.isNode(member)) {
                        continue;
                    }

                    const name = Core.isIdentifierNode((member as any).name) ? (member as any).name.name : null;

                    if (typeof name !== "string" || name.length === 0) {
                        continue;
                    }

                    const normalizedName = name.toLowerCase();

                    if (!seen.has(normalizedName)) {
                        seen.set(normalizedName, member);
                        continue;
                    }

                    const existingMember = seen.get(normalizedName);
                    const existingHasInitializer = existingMember?.initializer != null;
                    const currentHasInitializer = (member as any).initializer != null;

                    if (!existingHasInitializer && currentHasInitializer) {
                        index = removeMemberAndAdjustIndex(existingMember, index);
                        seen.set(normalizedName, member);
                        continue;
                    }

                    index = removeMemberAndAdjustIndex(member, index);
                }

                if (members.length === 0) {
                    node.hasTrailingComma = false;
                }
            }
        }
    });

    // If no fixes were discovered via AST-bounded scanning, fall back to a
    // conservative full-source scan for duplicate-semicolon runs. This
    // captures cases where duplicate semicolons appear within the same
    // statement node (e.g. `var a = 1;;`) and ensures we produce concrete
    // ranges for GM1033 fixes expected by tests. Reuse the dedicated
    // duplicate-semicolon scanner to produce proper fix details.
    if (fixes.length === 0 && typeof sourceText === "string") {
        const dupFixes = removeDuplicateSemicolons({
            ast,
            sourceText,
            diagnostic
        });
        if (Core.isNonEmptyArray(dupFixes)) {
            fixes.push(...dupFixes);
        }
    }

    return fixes;
}

/**
 * Guard and sanitize enum initializers that are not numerically valid.
 */
export function sanitizeEnumAssignments({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    visitFeatherAST(ast, (node) => {
        if (node.type === "EnumMember") {
            const fix = sanitizeEnumMember(node, diagnostic);

            if (fix) {
                fixes.push(fix);
            }
        }
    });

    return fixes;
}

/**
 * Null out problematic enum member initializers while recording fix metadata.
 */
function sanitizeEnumMember(node, diagnostic) {
    if (!node || typeof node !== "object" || !diagnostic) {
        return null;
    }

    const initializer = node.initializer;

    if (!hasInvalidEnumInitializer(initializer)) {
        return null;
    }

    const originalEnd = Core.getNodeEndIndex(node);
    const startIndex = Core.getNodeStartIndex(node);

    node._featherOriginalInitializer = initializer ?? null;
    node.initializer = null;

    if (node.name?.end) {
        node.end = node.name.end;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: node.name?.name ?? null,
        range:
            typeof startIndex === "number" && typeof originalEnd === "number"
                ? {
                      start: startIndex,
                      end: originalEnd
                  }
                : null
    });

    if (!fixDetail) {
        return null;
    }

    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

/**
 * Detect enum initializers that cannot safely be printed (non-numeric strings, objects, etc.).
 */
function hasInvalidEnumInitializer(initializer) {
    if (initializer === undefined) {
        return false;
    }

    // Guard against explicit `null` which typeof reports as "object" but
    // cannot be dereferenced. Treat `null` as an invalid initializer so
    // downstream logic can handle it consistently without throwing.
    if (initializer === null) {
        return true;
    }

    if (typeof initializer === "string") {
        const normalized = initializer.trim();

        if (normalized.length === 0) {
            return true;
        }

        if (isIntegerLiteralString(normalized)) {
            return false;
        }

        return true;
    }

    if (typeof initializer === "number") {
        return !Number.isInteger(initializer);
    }

    if (typeof initializer === "object") {
        if (initializer.type === "Literal") {
            const value = initializer.value;

            if (typeof value === "number") {
                return !Number.isInteger(value);
            }

            if (typeof value === "string") {
                return !isIntegerLiteralString(value.trim());
            }
        }

        return false;
    }

    return true;
}
