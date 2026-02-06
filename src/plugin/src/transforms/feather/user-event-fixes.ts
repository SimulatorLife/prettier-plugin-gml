/**
 * User event constant handling for Feather diagnostics.
 *
 * Provides functionality to detect missing user event constants and annotate
 * AST nodes with appropriate fix metadata for GM2025 diagnostics.
 */

import { Core, type GameMakerAstNode } from "@gml-modules/core";

import { attachFeatherFixMetadata, createFeatherFixDetail, hasFeatherDiagnosticContext } from "./utils.js";

/**
 * Annotates missing user-event constant references in the AST.
 *
 * Traverses the AST to find `event_user`, `event_perform`, and `event_perform_object`
 * calls that reference user events by numeric literal instead of named constants.
 * Attaches fix metadata to enable constant insertion.
 *
 * @param context - Contains ast and diagnostic information
 * @returns Array of fix details for user event constant annotations
 */
export function annotateMissingUserEvents({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const entry of node) {
                visit(entry);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "CallExpression") {
            const fix = annotateUserEventCall(node, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                visit(value);
            }
        }
    };

    visit(ast);

    return fixes;
}

/**
 * Annotates a single user event call with fix metadata.
 *
 * @param node - CallExpression node to check
 * @param diagnostic - Feather diagnostic context
 * @returns Fix detail if annotation was successful, null otherwise
 */
function annotateUserEventCall(node, diagnostic) {
    const eventInfo = getUserEventReference(node);

    if (!eventInfo) {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: eventInfo.name,
        automatic: false,
        range: {
            start: Core.getNodeStartIndex(node),
            end: Core.getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

/**
 * Creates user event info from an argument node.
 *
 * @param argumentNode - AST node representing the event index
 * @returns Object with index and name, or null if invalid
 */
function createUserEventInfo(argumentNode: GameMakerAstNode) {
    const eventIndex = resolveUserEventIndex(argumentNode);

    if (eventIndex === null) {
        return null;
    }

    return { index: eventIndex, name: formatUserEventName(eventIndex) };
}

/**
 * Extracts user event reference information from a call expression.
 *
 * Handles three types of calls:
 * - event_user(index)
 * - event_perform(ev_user, index)
 * - event_perform_object(object, type, index)
 *
 * @param node - CallExpression node to analyze
 * @returns User event info if found, null otherwise
 */
function getUserEventReference(node) {
    if (!node || node.type !== "CallExpression") {
        return null;
    }

    const callee = Core.getCallExpressionIdentifier(node);
    const args = Core.getCallExpressionArguments(node);

    if (Core.isIdentifierWithName(callee, "event_user")) {
        return createUserEventInfo(args[0]);
    }

    if (Core.isIdentifierWithName(callee, "event_perform")) {
        if (args.length < 2 || !Core.isIdentifierWithName(args[0], "ev_user")) {
            return null;
        }

        return createUserEventInfo(args[1]);
    }

    if (Core.isIdentifierWithName(callee, "event_perform_object")) {
        if (args.length < 3) {
            return null;
        }

        return createUserEventInfo(args[2]);
    }

    return null;
}

/**
 * Resolves a user event index from an AST node.
 *
 * Accepts:
 * - Numeric literals (0-15)
 * - Identifiers matching pattern ev_user{N} where N is 0-15
 *
 * @param node - AST node to resolve
 * @returns Event index (0-15) or null if invalid
 */
function resolveUserEventIndex(node) {
    if (!node) {
        return null;
    }

    if (node.type === "Literal") {
        const numericValue = typeof node.value === "number" ? node.value : Number(node.value);

        if (!Number.isInteger(numericValue) || numericValue < 0 || numericValue > 15) {
            return null;
        }

        return numericValue;
    }

    if (node.type === "Identifier") {
        const match = /^ev_user(\d+)$/.exec(node.name);

        if (!match) {
            return null;
        }

        const numericValue = Number.parseInt(match[1]);

        if (!Number.isInteger(numericValue) || numericValue < 0 || numericValue > 15) {
            return null;
        }

        return numericValue;
    }

    return null;
}

/**
 * Formats a user event index as a readable name.
 *
 * @param index - Event index (0-15)
 * @returns Formatted name like "User Event 0" or null if invalid
 */
function formatUserEventName(index) {
    if (!Number.isInteger(index)) {
        return null;
    }

    return `User Event ${index}`;
}
