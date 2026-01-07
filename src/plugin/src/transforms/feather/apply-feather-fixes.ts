/**
 * Feather diagnostic transforms and AST fix application.
 *
 * ARCHITECTURE NOTE: This file has accumulated a large collection of Feather-specific
 * fix handlers and should be split into focused, domain-specific modules:
 *
 * - enum-constant-fixes.ts → handles enum member constant transformations
 * - vertex-format-fixes.ts → handles begin/end vertex format migrations
 * - color-constant-fixes.ts → handles color constant renaming and normalization
 * - identifier-renaming.ts → handles reserved identifier conflicts and safe renaming
 * - doc-comment-fixes.ts → handles JSDoc type annotation corrections
 * - user-event-fixes.ts → handles missing user event constant insertions
 *
 * The core metadata attachment function `attachFeatherFixMetadata` can remain here as
 * the public entry point, but delegates to focused submodules for each diagnostic category.
 *
 * MAINTENANCE HAZARD: Many helper functions in this file duplicate functionality from
 * the 'refactor' and 'semantic' modules. Identifier renaming logic in particular should
 * be consolidated into the 'refactor' module, which is built on top of 'semantic' to
 * provide scope-aware, conflict-free renaming. Before adding new identifier manipulation
 * here, check if the behavior already exists in those packages and prefer importing it
 * or extracting a shared utility into Core.
 */

/**
 * Provides a collection of helpers that interpret and apply YoYo Games "Feather" diagnostics as AST fixes.
 * The transforms here mutate the AST, gather fix metadata, and expose diagnostics-driven helpers to the CLI plugin.
 */

import { Core, type MutableGameMakerAstNode, type GameMakerAstNode } from "@gml-modules/core";
import type { ParserTransform } from "../functional-transform.js";
import {
    getEndFromNode,
    getStartFromNode,
    hasArrayParentWithNumericIndex,
    resolveCallExpressionArrayContext,
    walkAstNodes
} from "./ast-traversal.js";
import {
    hasFeatherDiagnosticContext,
    createFeatherFixDetail,
    attachFeatherFixMetadata,
    createCallExpressionTargetFixDetail,
    hasFeatherSourceTextContext,
    NUMERIC_STRING_LITERAL_PATTERN
} from "./utils.js";
import { removeDuplicateSemicolons, findDuplicateSemicolonRanges } from "./semicolon-fixes.js";
import { removeDuplicateEnumMembers, sanitizeEnumAssignments } from "./enum-fixes.js";
import { parseExample } from "./parser-bootstrap.js";
import { preprocessFunctionArgumentDefaultsTransform } from "../preprocess-function-argument-defaults.js";
import {
    getDocCommentMetadata,
    getDeprecatedDocCommentFunctionSet,
    setDeprecatedDocCommentFunctionSet
} from "../doc-comment/doc-comment-metadata.js";

type RenameOptions = {
    // DUPLICATION WARNING: The identifier renaming logic in this file may overlap
    // with functionality already implemented in the 'refactor' and 'semantic' modules.
    //
    // ARCHITECTURE: Identifier renaming should live in the 'refactor' module, which
    // is built on top of 'semantic'. The 'semantic' module provides scope analysis
    // and binding resolution (determining what each identifier refers to and where
    // it's defined), while 'refactor' uses that information to perform safe renames
    // that avoid shadowing conflicts and preserve program semantics.
    //
    // CURRENT STATE: This file implements ad-hoc renaming for Feather fixes (reserved
    // identifiers, deprecated names, etc.) without consulting scope information. This
    // risks introducing name conflicts, shadowing variables, or breaking references
    // in nested scopes.
    //
    // RECOMMENDATION: Before adding new renaming logic here, check if 'refactor'
    // already provides the capability. If it does, import it and use the scope-aware
    // implementation. If it doesn't, consider adding the feature to 'refactor' so it
    // can be shared across the codebase rather than duplicating the logic here.
    //
    // LONG-TERM: Extract all identifier renaming from this file and consolidate it
    // into 'refactor', then import those functions here for Feather-specific fixes.
    onRename?: (payload: { identifier: MutableGameMakerAstNode; originalName: string; replacement: string }) => void;
};

type ApplyFeatherFixesOptions = {
    sourceText?: string;
    preprocessedFixMetadata?: unknown;
    options?: Record<string, unknown>;
};

export const TRAILING_MACRO_SEMICOLON_PATTERN = new RegExp(
    ";(?=[^\\S\\r\\n]*(?:\\/\\*[\\s\\S]*?\\*\/[^\\S\\r\\n]*)*(?:\\/\\/[^\\r\\n]*)?(?:\\r?\\n|$))"
);
const DATA_STRUCTURE_ACCESSOR_TOKENS = ["?", "|", "#", "@", "$", "%"];
const ALLOWED_DELETE_MEMBER_TYPES = new Set(["MemberDotExpression", "MemberIndexExpression"]);
const MANUAL_FIX_TRACKING_KEY = Symbol("manualFeatherFixes");
const FEATHER_COMMENT_OUT_SYMBOL = Symbol.for("prettier.gml.feather.commentOut");
const FEATHER_COMMENT_TEXT_SYMBOL = Symbol.for("prettier.gml.feather.commentText");
const FEATHER_COMMENT_PREFIX_TEXT_SYMBOL = Symbol.for("prettier.gml.feather.commentPrefixText");
const VERTEX_BEGIN_TEMPLATE_CACHE = new WeakMap();
const FILE_FIND_BLOCK_CALL_TARGETS = new Set(["file_find_next"]);
const FILE_FIND_CLOSE_FUNCTION_NAME = "file_find_close";
const READ_ONLY_BUILT_IN_VARIABLES = new Set(["working_directory"]);
const BREAKABLE_CONSTRUCT_TYPES = new Set([
    "DoUntilStatement",
    "ForStatement",
    "RepeatStatement",
    "SwitchStatement",
    "WhileStatement",
    "WithStatement"
]);
const FILE_ATTRIBUTE_IDENTIFIER_PATTERN = /^fa_[A-Za-z0-9_]+$/;
const STRING_LENGTH_CALL_BLOCKLIST = new Set([
    "string_byte_at",
    "string_byte_length",
    "string_height",
    "string_height_ext",
    "string_length",
    "string_pos",
    "string_pos_ext",
    "string_width",
    "string_width_ext"
]);

export const ROOM_NAVIGATION_DIRECTION = Object.freeze({
    NEXT: "next",
    PREVIOUS: "previous"
});

/**
 * @typedef {typeof ROOM_NAVIGATION_DIRECTION[keyof typeof ROOM_NAVIGATION_DIRECTION]} RoomNavigationDirection
 */

const ROOM_NAVIGATION_DIRECTION_VALUES = new Set(Object.values(ROOM_NAVIGATION_DIRECTION));
const ROOM_NAVIGATION_DIRECTION_LABELS = Array.from(ROOM_NAVIGATION_DIRECTION_VALUES).join(", ");

const ROOM_NAVIGATION_HELPERS = Object.freeze({
    [ROOM_NAVIGATION_DIRECTION.NEXT]: Object.freeze({
        binary: "room_next",
        goto: "room_goto_next"
    }),
    [ROOM_NAVIGATION_DIRECTION.PREVIOUS]: Object.freeze({
        binary: "room_previous",
        goto: "room_goto_previous"
    })
});

type RoomNavigationDirection = (typeof ROOM_NAVIGATION_DIRECTION)[keyof typeof ROOM_NAVIGATION_DIRECTION];

function normalizeRoomNavigationDirection(direction: unknown): RoomNavigationDirection {
    if (typeof direction !== "string") {
        throw new TypeError("Room navigation direction must be provided as a string.");
    }

    if (!ROOM_NAVIGATION_DIRECTION_VALUES.has(direction as RoomNavigationDirection)) {
        throw new RangeError(
            `Unsupported room navigation direction: ${direction}. Expected one of: ${ROOM_NAVIGATION_DIRECTION_LABELS}.`
        );
    }

    return direction as RoomNavigationDirection;
}

/**
 * Look up the proper room helper names for a normalized Feather navigation direction.
 */
export function getRoomNavigationHelpers(direction: unknown) {
    const normalizedDirection = normalizeRoomNavigationDirection(direction);
    return ROOM_NAVIGATION_HELPERS[normalizedDirection];
}

function isFeatherDiagnostic(value: unknown): value is { id: string } {
    return Core.getOptionalString(value, "id") !== null;
}
let RESERVED_IDENTIFIER_NAMES: Set<string> | null = null;
function getReservedIdentifierNames() {
    if (!RESERVED_IDENTIFIER_NAMES) {
        RESERVED_IDENTIFIER_NAMES = Core.loadReservedIdentifierNames();
    }
    return RESERVED_IDENTIFIER_NAMES;
}
const DEPRECATED_BUILTIN_VARIABLE_REPLACEMENTS = Core.buildDeprecatedBuiltinVariableReplacements();
const GM1041_CALL_ARGUMENT_TARGETS = new Map([
    ["instance_create_depth", [3]],
    ["instance_create_layer", [3]],
    ["instance_create_layer_depth", [4]],
    ["layer_instance_create", [3]]
]);
const FEATHER_TYPE_SYSTEM_INFO = buildFeatherTypeSystemInfo();
const AUTOMATIC_FEATHER_FIX_HANDLERS = createAutomaticFeatherFixHandlers();
const FEATHER_DIAGNOSTICS = Core.getFeatherDiagnostics();

function updateStaticFunctionDocComments(ast: any) {
    const allComments = ast.comments || [];

    walkAstNodes(ast, (node) => {
        if (node.type === "VariableDeclaration" && node.kind === "static") {
            if (node.declarations.length !== 1) {
                return;
            }

            const declarator = node.declarations[0];
            if (
                declarator.type !== "VariableDeclarator" ||
                declarator.id.type !== "Identifier" ||
                !declarator.init ||
                (declarator.init.type !== "FunctionExpression" &&
                    declarator.init.type !== "FunctionDeclaration" &&
                    declarator.init.type !== "ArrowFunctionExpression")
            ) {
                return;
            }

            const functionName = declarator.id.name;

            // Try to find comments attached to the node first
            let commentsToSearch = [
                ...(node.comments || []),
                ...(declarator.comments || []),
                ...(declarator.init.comments || [])
            ];

            // If no attached comments, search in global comments
            if (commentsToSearch.length === 0 && allComments.length > 0) {
                const nodeStart = getStartFromNode(node);
                if (nodeStart !== undefined) {
                    // Find comments that end before the node starts
                    const precedingComments = allComments.filter((c: any) => c.end <= nodeStart);
                    // Sort by end descending (closest to node first)
                    precedingComments.sort((a: any, b: any) => b.end - a.end);

                    // We only care about the closest block of comments.
                    // But simpler: just look for the first @function comment.
                    // It is highly unlikely that we skip over another function's @function comment
                    // because that function would be between the comment and this node.
                    commentsToSearch = precedingComments;
                }
            }

            if (commentsToSearch.length > 0) {
                for (const comment of commentsToSearch) {
                    const value = comment.value;
                    // Match @function followed by identifier
                    const match = /(@function\s+)([A-Za-z_][A-Za-z0-9_]*)/.exec(value);
                    if (match) {
                        const currentTagName = match[2];
                        if (currentTagName !== functionName) {
                            comment.value = value.replace(/(@function\s+)[A-Za-z_][A-Za-z0-9_]*/, `$1${functionName}`);
                            // Force the printer to use the new value by removing source location
                            delete comment.start;
                            delete comment.end;
                            delete comment.loc;
                        }
                        // Once we found the @function tag for this function, stop searching.
                        // We assume the first one we find (going backwards) is the correct one.
                        break;
                    }
                }
            }
        }
    });
}

function applyFeatherFixesImpl(ast: any, opts: ApplyFeatherFixesOptions = {}) {
    const { sourceText, preprocessedFixMetadata, options } = opts ?? {};
    if (!ast || typeof ast !== "object") {
        return ast;
    }

    // Ensure parser-level normalization of function parameter defaults runs
    // before any feather fixers so fixers that expect canonical parameter
    // shapes (Identifiers vs DefaultParameter) operate on normalized nodes.
    try {
        preprocessFunctionArgumentDefaultsTransform.transform(ast);
    } catch {
        // Swallow errors to avoid letting preprocessing failures stop the
        // broader fix application pipeline.
    }

    try {
        updateStaticFunctionDocComments(ast);
    } catch {
        // Ignore errors during static function doc comment updates. If the
        // update logic encounters malformed AST nodes, missing metadata, or
        // incompatible node structures, the Feather fix transform continues
        // processing with the doc comments it was able to update. This resilience
        // ensures that a single problematic function does not prevent the entire
        // Feather fix pipeline from completing.
    }

    // Populate documented param names so Feather fixes can respect JSDoc @param tags
    // This is necessary because the Feather transform runs before the printer (which usually handles this),
    // and we need the metadata to decide whether to rename arguments.
    let collectionService;
    if (sourceText) {
        // Use the core service to extract and attach documented param names
        // This handles finding comments correctly (which might not be directly on the node)
        const traversal = Core.resolveDocCommentTraversalService(ast);
        collectionService = Core.resolveDocCommentCollectionService(ast);
        Core.buildDocumentedParamNameLookup(ast, sourceText, traversal);

        const deprecatedFunctionNames = Core.collectDeprecatedFunctionNames(ast, sourceText, traversal);
        setDeprecatedDocCommentFunctionSet(ast, deprecatedFunctionNames);
    }

    const appliedFixes = [];

    for (const entry of FEATHER_DIAGNOSTIC_FIXERS.values()) {
        const fixes = entry.applyFix(ast, {
            sourceText,
            preprocessedFixMetadata,
            options,
            collectionService
        });

        if (Core.isNonEmptyArray(fixes)) {
            appliedFixes.push(...fixes);
        }
    }

    // Post-process certain diagnostics to ensure their metadata is well-formed
    // Historically some fixers (or upstream consumers) have emitted diagnostic
    // entries without a concrete `range`. Tests expect GM1033 (duplicate
    // semicolons) to always include a numeric range; if a GM1033 entry was
    // emitted without one, regenerate the canonical GM1033 fixes and replace
    // any nullary entries so downstream consumers can rely on ranges.
    if (appliedFixes.length > 0) {
        try {
            const hasBadGM1033 = appliedFixes.some(
                (f) =>
                    f?.id === "GM1033" &&
                    (f.range == null || typeof f.range.start !== "number" || typeof f.range.end !== "number")
            );

            if (hasBadGM1033 && Array.isArray(FEATHER_DIAGNOSTICS)) {
                const gm1033Diagnostic = FEATHER_DIAGNOSTICS.find((d) => d?.id === "GM1033");

                if (gm1033Diagnostic) {
                    const regenerated = removeDuplicateSemicolons({
                        ast,
                        sourceText,
                        diagnostic: gm1033Diagnostic
                    });

                    if (Core.isNonEmptyArray(regenerated)) {
                        // Replace any GM1033 entries lacking ranges with the
                        // regenerated, range-bearing fixes.
                        const kept = appliedFixes.filter(
                            (f) =>
                                f?.id !== "GM1033" ||
                                (f.range != null &&
                                    typeof f.range.start === "number" &&
                                    typeof f.range.end === "number")
                        );

                        appliedFixes.length = 0;
                        appliedFixes.push(...kept, ...regenerated);
                    }
                }
            }
        } catch {
            // Be conservative: don't let the post-processing fail the entire
            // fix application. The original appliedFixes will still be
            // attached.
            void 0;
        }

        try {
            attachFeatherFixMetadata(ast, appliedFixes);
        } catch {
            // Suppress metadata attachment failures to prevent breaking transforms.
            // The attachFeatherFixMetadata call logs which fixes were applied to
            // which nodes for debugging and telemetry purposes. If attaching this
            // metadata throws (e.g., due to frozen nodes, proxy restrictions, or
            // memory constraints), we catch the error and continue. Diagnostic
            // metadata is a convenience, not a correctness requirement, so losing
            // it is preferable to aborting the entire Feather fix pipeline.
            void 0;
        }

        // Some fixer implementations create or replace nodes later in the
        // pipeline which can cause non-enumerable per-node metadata to be
        // lost if it was attached to an earlier object instance. Tests and
        // consumers expect per-function metadata (e.g. GM1056) to be present
        // on the live FunctionDeclaration node in the final AST. As a
        // narrow, defensive step, walk the AST and attach any applied fixes
        // which name a function target to the corresponding Function
        // Declaration node if not already present.
        try {
            for (const fix of appliedFixes) {
                if (!fix) {
                    continue;
                }

                // If the fixer provided a stable function name target, prefer
                // name-based reattachment. This is the common path for many
                // diagnostic fixes.
                if (typeof fix.target === "string") {
                    attachFeatherFixToNamedFunction(ast, fix);
                    continue;
                }

                // Fallback: some fixers attach a range but omit a human-friendly
                // target name (target === null). Attempt to match on the numeric
                // range to attach the fix to the live FunctionDeclaration node.
                if (fix.range && typeof fix.range.start === "number" && typeof fix.range.end === "number") {
                    attachFeatherFixToRange(ast, fix);
                }

                // If we didn't attach via range matching, continue to the
                // next fix. A narrow GM1056-specific heuristic is executed
                // after the main name/range attempts below so it runs even
                // when the fix lacks a numeric range.

                // GM1056-specific fallback: some GM1056 fixes may be emitted
                // without a reliable target name or numeric range. As a
                // last-resort, but still narrow, attempt to attach GM1056 to
                // any live FunctionDeclaration that contains a
                // DefaultParameter whose right-hand side is the canonical
                // undefined literal. Before attaching, check whether this
                // fix id has already been attached to any function to avoid
                // duplicate attachments.
                try {
                    if (String(fix.id) === "GM1056" && !isGM1056FixAlreadyAttached(fix, ast)) {
                        attachGM1056FixToUndefinedParameters(fix, ast);
                    }
                } catch {
                    void 0;
                }
            }
        } catch {
            // Non-fatal: don't let this guard step break the transform.
            void 0;
        }

        // Diagnostic snapshot: list every FunctionDeclaration in the final
    }

    // Re-scan the transformed AST to update hasDirectReference metadata
    // This is crucial for GM1032 fixes where arguments are re-indexed or aliased
    walkAstNodes(ast, (node) => {
        if (
            node &&
            (node.type === "FunctionDeclaration" || node.type === "StructFunctionDeclaration") &&
            Array.isArray(node._featherImplicitArgumentDocEntries)
        ) {
            const entries = node._featherImplicitArgumentDocEntries;
            const remainingDirectRefIndices = new Set<number>();

            // Walk the function body to find argument references
            // We need to be careful not to walk into nested functions
            if (node.body) {
                walkAstNodes(node.body, (child) => {
                    // Restrict function body traversal to the immediate function scope only.
                    // Nested function declarations (FunctionDeclaration, StructFunctionDeclaration)
                    // define their own parameter namespaces, so `argument0`, `argument1`, etc.
                    // inside a nested function refer to that inner function's parameters, not
                    // the outer function's. If we descended into nested declarations, we would
                    // incorrectly attribute those inner argument references to the outer
                    // function's parameter list, generating spurious or conflicting @param
                    // entries in the outer function's doc comment. By returning false here,
                    // we prevent the walker from entering nested function bodies while still
                    // allowing it to traverse other nested constructs (loops, conditionals, etc.)
                    // that legitimately reference the outer function's parameters.
                    if (child.type === "FunctionDeclaration" || child.type === "StructFunctionDeclaration") {
                        return false;
                    }

                    if (child.type === "Identifier" && /^argument\d+$/.test(child.name)) {
                        const index = Number.parseInt(child.name.slice(8), 10);
                        remainingDirectRefIndices.add(index);
                    }
                });
            }

            // Update the metadata
            for (const entry of entries) {
                entry.hasDirectReference = remainingDirectRefIndices.has(entry.index);
            }
        }
    });

    return ast;
}

function isGM1056FixAlreadyAttached(fix: any, ast: MutableGameMakerAstNode) {
    let alreadyAttached = false;
    walkAstNodes(ast, (node) => {
        if (!node || node.type !== "FunctionDeclaration") {
            return;
        }

        const existing = Array.isArray(node._appliedFeatherDiagnostics) ? node._appliedFeatherDiagnostics : [];

        if (existing.some((entry) => entry && entry.id === fix.id)) {
            alreadyAttached = true;
            return false;
        }
    });

    return alreadyAttached;
}

function attachGM1056FixToUndefinedParameters(fix: any, ast: MutableGameMakerAstNode) {
    walkAstNodes(ast, (node) => {
        if (!node || node.type !== "FunctionDeclaration") {
            return;
        }

        const params = Array.isArray(node.params) ? node.params : [];
        for (const param of params) {
            if (!isUndefinedDefaultParameter(param)) {
                continue;
            }

            attachFixWithOptionalTarget(node, fix);
            return false;
        }
    });
}

function isUndefinedDefaultParameter(param: any): boolean {
    return (
        param &&
        param.type === "DefaultParameter" &&
        param.right &&
        param.right.type === "Literal" &&
        String(param.right.value) === "undefined"
    );
}

function attachFixWithOptionalTarget(node: MutableGameMakerAstNode, fix: any) {
    try {
        const nodeName = getFunctionIdentifierName(node);
        const toAttach = !fix.target && nodeName ? [{ ...fix, target: nodeName }] : [fix];

        attachFeatherFixMetadata(node, toAttach);
    } catch {
        attachFeatherFixMetadata(node, [fix]);
    }
}

function attachFeatherFixToNamedFunction(ast: MutableGameMakerAstNode, fix: any): void {
    try {
        // console.warn(
        //     `[feather:diagnostic] reattach-guard fix=${fix.id} target=${String(
        //         fix.target
        //     )}`
        // );
    } catch {
        void 0;
    }

    const targetNode = findFunctionDeclaration(ast, (node) => getFunctionIdentifierName(node) === String(fix.target));

    if (targetNode) {
        attachFeatherFixToFunctionNode(targetNode, fix);
    }
}

function attachFeatherFixToRange(ast: MutableGameMakerAstNode, fix: any): void {
    try {
        // console.warn(
        //     `[feather:diagnostic] reattach-guard-range fix=${fix.id} target=<range:${fix.range.start}-${fix.range.end}>`
        // );
    } catch {
        void 0;
    }

    const { start, end } = fix.range;
    const targetNode = findFunctionDeclaration(ast, (node) => rangeMatchesNode(node, start, end));

    if (targetNode) {
        attachFeatherFixToFunctionNode(targetNode, fix);
    }
}

function findFunctionDeclaration(
    ast: MutableGameMakerAstNode,
    predicate: (node: MutableGameMakerAstNode) => boolean
): MutableGameMakerAstNode | null {
    let targetNode: MutableGameMakerAstNode | null = null;

    walkAstNodes(ast, (node) => {
        if (!node || node.type !== "FunctionDeclaration") {
            return;
        }

        if (predicate(node)) {
            targetNode = node;
            return false;
        }
    });

    return targetNode;
}

function attachFeatherFixToFunctionNode(targetNode: MutableGameMakerAstNode, fix: any): void {
    const existing = Array.isArray(targetNode._appliedFeatherDiagnostics) ? targetNode._appliedFeatherDiagnostics : [];

    const already = existing.some(
        (entry) =>
            entry &&
            entry.id === fix.id &&
            entry.range &&
            fix.range &&
            entry.range.start === fix.range.start &&
            entry.range.end === fix.range.end
    );

    if (already) {
        return;
    }

    try {
        const nodeName = getFunctionIdentifierName(targetNode);
        const toAttach = !fix.target && nodeName ? [{ ...fix, target: nodeName }] : [fix];

        attachFeatherFixMetadata(targetNode, toAttach);
    } catch {
        attachFeatherFixMetadata(targetNode, [fix]);
    }
}

function rangeMatchesNode(node: MutableGameMakerAstNode, start: number, end: number): boolean {
    const nodeStart = Core.getNodeStartIndex(node);
    const nodeEnd = Core.getNodeEndIndex(node);

    if (nodeStart === start && nodeEnd === end) {
        return true;
    }

    if (typeof nodeStart === "number" && typeof nodeEnd === "number" && nodeStart <= start && nodeEnd >= end) {
        return true;
    }

    return false;
}

function buildFeatherDiagnosticFixers(diagnostics, implementationRegistry) {
    const registry = new Map();

    for (const diagnostic of Core.asArray(diagnostics)) {
        if (!isFeatherDiagnostic(diagnostic)) {
            continue;
        }
        const diagnosticId = diagnostic.id;
        if (registry.has(diagnosticId)) {
            continue;
        }

        const applyFix = createFixerForDiagnostic(diagnostic, implementationRegistry);

        if (typeof applyFix !== "function") {
            continue;
        }

        registry.set(diagnosticId, {
            diagnostic,
            applyFix
        });
    }

    return registry;
}

function createFixerForDiagnostic(diagnostic, implementationRegistry) {
    if (!implementationRegistry) {
        return createNoOpFixer();
    }

    const implementationFactory = implementationRegistry.get(diagnostic?.id);

    if (typeof implementationFactory !== "function") {
        return createNoOpFixer();
    }

    const implementation = implementationFactory(diagnostic);
    if (typeof implementation !== "function") {
        return createNoOpFixer();
    }

    return (ast, context) => {
        const fixes = implementation({
            ast,
            sourceText: context?.sourceText,
            preprocessedFixMetadata: context?.preprocessedFixMetadata,
            options: context?.options,
            collectionService: context?.collectionService
        });

        return Core.asArray(fixes);
    };
}

function createNoOpFixer() {
    // Feather diagnostics are harvested independently of the formatter bundle,
    // so the plugin frequently encounters rule IDs before their fixer
    // implementations land. Returning an empty fixer keeps the pipeline
    // tolerant of that skew: downstream call sites treat "no edits" as "leave
    // the AST untouched" while still surfacing diagnostic metadata. That
    // contract matters because the orchestrator in applyFeatherFixes blindly
    // concatenates the arrays returned by every fixer; providing [] keeps the
    // type signature intact and avoids signalling "fixer missing" as a fatal
    // error. When we experimented with throwing here the formatter would stop
    // mid-run or, worse, fall back to speculative edits that reorder nodes
    // without the guard rails laid out in docs/feather-data-plan.md. Until the
    // corresponding fixer implementation ships we deliberately fall back to this
    // inert function so diagnostics reach the caller while the AST remains
    // untouched.
    return () => [];
}

function removeBreakStatementsWithoutEnclosingLoops({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visitArray = (array, owner, property, breakableDepth) => {
        if (!Array.isArray(array)) {
            return;
        }

        let index = 0;

        while (index < array.length) {
            const removed = visit(array[index], array, index, breakableDepth, owner);

            if (!removed) {
                index += 1;
            }
        }
    };

    const visit = (node, parent, property, breakableDepth, owner) => {
        if (!node) {
            return false;
        }

        if (Array.isArray(node)) {
            visitArray(node, owner, property, breakableDepth);
            return false;
        }

        if (typeof node !== "object") {
            return false;
        }

        if (node.type === "BreakStatement" && breakableDepth === 0) {
            if (!Core.isArrayIndex(parent, property)) {
                return false;
            }

            const fixDetail = createFeatherFixDetail(diagnostic, {
                target: "break",
                range: {
                    start: Core.getNodeStartIndex(node),
                    end: Core.getNodeEndIndex(node)
                }
            });

            if (!fixDetail) {
                return false;
            }

            parent.splice(property, 1);

            let metadataTarget = null;

            if (owner && owner !== ast) {
                metadataTarget = owner;
            } else if (Array.isArray(parent)) {
                metadataTarget = parent;
            }

            if (metadataTarget) {
                attachFeatherFixMetadata(metadataTarget, [fixDetail]);
            }

            fixes.push(fixDetail);

            return true;
        }

        const nextBreakableDepth = breakableDepth + (isBreakableConstruct(node) ? 1 : 0);

        Core.forEachNodeChild(node, (value, key) => {
            if (Array.isArray(value)) {
                visitArray(value, node, key, nextBreakableDepth);
                return;
            }

            visit(value, node, key, nextBreakableDepth, node);
        });

        return false;
    };

    visit(ast, null, null, 0, null);

    return fixes;
}

function isBreakableConstruct(node) {
    return node && typeof node === "object" && BREAKABLE_CONSTRUCT_TYPES.has(node.type);
}

/**
 * Prettier transform that runs every applicable Feather fixer and returns the mutated AST.
 */
export class ApplyFeatherFixesTransform implements ParserTransform<MutableGameMakerAstNode, ApplyFeatherFixesOptions> {
    public readonly name = "apply-feather-fixes";
    public readonly defaultOptions = Object.freeze({}) as ApplyFeatherFixesOptions;

    public transform(ast: MutableGameMakerAstNode, options?: ApplyFeatherFixesOptions): MutableGameMakerAstNode {
        return applyFeatherFixesImpl(ast, options ?? this.defaultOptions);
    }
}

export const applyFeatherFixesTransform = new ApplyFeatherFixesTransform();

type FeatherFixFactory = () => (context: any) => any;

type FeatherFixBuilder = (diagnostic: any) => FeatherFixFactory;

const FEATHER_FIX_BUILDERS = new Map<string, FeatherFixBuilder>([
    [
        "GM1000",
        (diagnostic) =>
            () =>
            ({ ast }) => {
                const fixes = removeBreakStatementsWithoutEnclosingLoops({
                    ast,
                    diagnostic
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            }
    ],
    [
        "GM1002",
        (diagnostic) =>
            () =>
            ({ ast }) => {
                const fixes = splitGlobalVarInlineInitializers({
                    ast,
                    diagnostic
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            }
    ],
    [
        "GM1003",
        (diagnostic) =>
            () =>
            ({ ast }) => {
                const fixes = sanitizeEnumAssignments({ ast, diagnostic });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            }
    ],
    [
        "GM1005",
        (diagnostic) => () => {
            const callTemplate = createFunctionCallTemplateFromDiagnostic(diagnostic);

            return ({ ast }) => {
                const fixes = ensureRequiredArgumentProvided({
                    ast,
                    diagnostic,
                    callTemplate
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            };
        }
    ],
    [
        "GM1004",
        (diagnostic) =>
            () =>
            ({ ast, sourceText }) => {
                const fixes = removeDuplicateEnumMembers({
                    ast,
                    diagnostic,
                    sourceText
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            }
    ],
    [
        "GM1007",
        (diagnostic) =>
            () =>
            ({ ast, sourceText }) => {
                const fixes = flagInvalidAssignmentTargets({
                    ast,
                    sourceText,
                    diagnostic
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            }
    ],
    [
        "GM2000",
        (diagnostic) =>
            () =>
            ({ ast }) => {
                const fixes = ensureBlendModeIsReset({ ast, diagnostic });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            }
    ],
    [
        "GM2003",
        (diagnostic) =>
            () =>
            ({ ast, sourceText }) => {
                const fixes = ensureShaderResetIsCalled({
                    ast,
                    diagnostic,
                    sourceText
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            }
    ],
    [
        "GM2004",
        (diagnostic) =>
            () =>
            ({ ast }) => {
                const fixes = convertUnusedIndexForLoops({ ast, diagnostic });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            }
    ],
    [
        "GM2007",
        (diagnostic) =>
            () =>
            ({ ast, sourceText }) => {
                const fixes = ensureVarDeclarationsAreTerminated({
                    ast,
                    sourceText,
                    diagnostic
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            }
    ],
    [
        "GM2008",
        (diagnostic) =>
            () =>
            ({ ast }) => {
                const fixes = closeOpenVertexBatches({ ast, diagnostic });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            }
    ],
    [
        "GM1008",
        (diagnostic) =>
            () =>
            ({ ast }) => {
                const fixes = convertReadOnlyBuiltInAssignments({
                    ast,
                    diagnostic
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            }
    ],
    [
        "GM1010",
        (diagnostic) =>
            () =>
            ({ ast }) => {
                const fixes = ensureNumericOperationsUseRealLiteralCoercion({
                    ast,
                    diagnostic
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            }
    ],
    [
        "GM1013",
        (diagnostic) =>
            () =>
            ({ ast }) => {
                const fixes = resolveWithOtherVariableReferences({
                    ast,
                    diagnostic
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            }
    ],
    [
        "GM2012",
        (diagnostic) =>
            () =>
            ({ ast }) => {
                const fixes = ensureVertexFormatsClosedBeforeStartingNewOnes({
                    ast,
                    diagnostic
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            }
    ],
    [
        "GM2040",
        (diagnostic) =>
            () =>
            ({ ast }) => {
                const fixes = removeInvalidEventInheritedCalls({
                    // Once the identifier-case project index can expose event
                    // ancestry we should query it here instead of trusting the
                    // diagnostic payload alone. GM2040 only fires when
                    // `event_inherited()` is orphaned, but without project-scope
                    // metadata the fixer cannot distinguish a legitimate override
                    // from a missing parent event. Integrating with the scoping
                    // pipeline outlined in `docs/legacy-identifier-case-plan.md#archived-project-index-roadmap`
                    // will let us re-evaluate inherited events during formatting and
                    // avoid deleting valid calls when Feather diagnostics are
                    // unavailable.
                    ast,
                    diagnostic
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            }
    ],
    [
        "GM2030",
        (diagnostic) =>
            () =>
            ({ ast }) => {
                const fixes = ensureDrawPrimitiveEndCallsAreBalanced({
                    ast,
                    diagnostic
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            }
    ],
    [
        "GM2015",
        (diagnostic) =>
            () =>
            ({ ast }) => {
                const fixes = ensureVertexFormatDefinitionsAreClosed({
                    ast,
                    diagnostic
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            }
    ],
    [
        "GM2028",
        (diagnostic) =>
            () =>
            ({ ast }) => {
                const fixes = ensurePrimitiveBeginPrecedesEnd({
                    ast,
                    diagnostic
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            }
    ],
    [
        "GM2025",
        (diagnostic) =>
            () =>
            ({ ast }) => {
                const fixes = annotateMissingUserEvents({ ast, diagnostic });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            }
    ],
    [
        "GM1063",
        (diagnostic) =>
            () =>
            ({ ast }) => {
                const fixes = harmonizeTexturePointerTernaries({
                    ast,
                    diagnostic
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            }
    ],
    [
        "GM2005",
        (diagnostic) =>
            () =>
            ({ ast }) => {
                const fixes = ensureSurfaceTargetResetForGM2005({
                    ast,
                    diagnostic
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            }
    ],
    [
        "GM1064",
        (diagnostic) =>
            () =>
            ({ ast }) => {
                const fixes = removeRedeclaredGlobalFunctions({
                    ast,
                    diagnostic
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            }
    ],
    [
        "GM2011",
        (diagnostic) =>
            () =>
            ({ ast }) => {
                const fixes = ensureVertexBuffersAreClosed({ ast, diagnostic });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            }
    ],
    [
        "GM2009",
        (diagnostic) =>
            () =>
            ({ ast, options }) => {
                const fixes = ensureVertexBeginPrecedesEnd({
                    ast,
                    diagnostic,
                    options
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            }
    ],
    [
        "GM2043",
        (diagnostic) =>
            () =>
            ({ ast }) => {
                const fixes = ensureLocalVariablesAreDeclaredBeforeUse({
                    ast,
                    diagnostic
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            }
    ],
    [
        "GM2033",
        (diagnostic) =>
            () =>
            ({ ast }) => {
                const fixes = removeDanglingFileFindCalls({ ast, diagnostic });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            }
    ],
    [
        "GM2050",
        (diagnostic) =>
            () =>
            ({ ast }) => {
                const fixes = ensureFogIsReset({ ast, diagnostic });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            }
    ],
    [
        "GM2035",
        (diagnostic) =>
            () =>
            ({ ast }) => {
                const fixes = ensureGpuStateIsPopped({ ast, diagnostic });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            }
    ]
]);

function registerFeatherFixBuilder({
    registry,
    diagnostic,
    builder
}: {
    registry: Map<any, any>;
    diagnostic: any;
    builder: FeatherFixBuilder;
}) {
    registerFeatherFixer(registry, diagnostic.id, builder(diagnostic));
}

function buildFeatherFixImplementations(diagnostics) {
    const registry = new Map();

    for (const diagnostic of Core.asArray(diagnostics)) {
        if (!isFeatherDiagnostic(diagnostic)) {
            continue;
        }
        const diagnosticId = diagnostic.id;

        const builder = FEATHER_FIX_BUILDERS.get(diagnosticId);
        if (builder) {
            registerFeatherFixBuilder({
                registry,
                diagnostic,
                builder
            });
            continue;
        }

        const handler = AUTOMATIC_FEATHER_FIX_HANDLERS.get(diagnosticId);

        if (handler) {
            registerAutomaticFeatherFix({
                registry,
                diagnostic,
                handler
            });
            continue;
        }

        if (diagnosticId === "GM1017") {
            registerFeatherFixer(registry, diagnosticId, () => {
                return ({ ast, sourceText }) => {
                    const fixes = captureDeprecatedFunctionManualFixes({
                        ast,
                        sourceText,
                        diagnostic
                    });

                    return resolveAutomaticFixes(fixes, {
                        ast,
                        diagnostic
                    });
                };
            });
            continue;
        }

        registerManualOnlyFeatherFix({ registry, diagnostic });
    }

    return registry;
}

function registerAutomaticFeatherFix({ registry, diagnostic, handler }) {
    if (!diagnostic?.id || typeof handler !== "function") {
        return;
    }

    registerFeatherFixer(registry, diagnostic.id, () => (context: any = {}) => {
        const fixes = handler({ ...context, diagnostic });

        // Preserve sourceText when resolving automatic fixes so that
        // registerManualFeatherFix can attempt to compute concrete fix
        // details (e.g. ranges for GM1033) when falling back.
        return resolveAutomaticFixes(fixes, {
            ast: context.ast,
            diagnostic,
            sourceText: context.sourceText
        });
    });
}

function registerManualOnlyFeatherFix({ registry, diagnostic }) {
    if (!diagnostic?.id) {
        return;
    }

    registerFeatherFixer(
        registry,
        diagnostic.id,
        () => (context: any) =>
            registerManualFeatherFix({
                ast: context.ast,
                diagnostic,
                sourceText: context.sourceText
            })
    );
}

function resolveAutomaticFixes(fixes, context) {
    if (Core.isNonEmptyArray(fixes)) {
        return fixes;
    }

    return registerManualFeatherFix(context);
}

function resolveWithOtherVariableReferences({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];
    const variableDeclarations = new Map();
    const ancestorStack = [];

    const visit = (node, parent, property, arrayOwner, arrayProperty, context) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index, arrayOwner ?? parent, arrayProperty ?? property, context);
            }
            return;
        }

        ancestorStack.push(node);

        if (Core.isVarVariableDeclaration(node)) {
            recordVariableDeclaration(variableDeclarations, {
                declaration: node,
                parent,
                property,
                owner: arrayOwner ?? null
            });
        }

        const insideWithOther = Boolean(context?.insideWithOther);

        if (insideWithOther && node.type === "Identifier") {
            convertIdentifierReference({
                identifier: node,
                parent,
                property,
                arrayOwner,
                arrayProperty,
                variableDeclarations,
                diagnostic,
                fixes,
                ancestorStack,
                context
            });
            ancestorStack.pop();
            return;
        }

        if (node.type === "WithStatement" && isWithStatementTargetingOther(node)) {
            visit(node.test, node, "test", null, null, {
                insideWithOther,
                withBodies: context?.withBodies ?? []
            });

            visit(node.body, node, "body", node, "body", {
                insideWithOther: true,
                withBodies: [...(context?.withBodies ?? []), node.body]
            });

            ancestorStack.pop();
            return;
        }

        for (const [key, value] of Object.entries(node)) {
            if (!value || typeof value !== "object") {
                continue;
            }

            if (Array.isArray(value)) {
                visit(value, node, key, node, key, context);
            } else {
                visit(value, node, key, null, null, context);
            }
        }

        ancestorStack.pop();
    };

    visit(ast, null, null, null, null, {
        insideWithOther: false,
        withBodies: []
    });

    return fixes;
}

function recordVariableDeclaration(registry, context) {
    if (!registry || !context) {
        return;
    }

    const { declaration, parent, property, owner } = context;

    if (!Core.isArrayIndex(parent, property)) {
        return;
    }

    const declarations = Core.asArray(declaration?.declarations);

    if (declarations.length !== 1) {
        return;
    }

    const declarator = declarations[0] as Record<string, unknown>;

    if (!Core.isNode(declarator)) {
        return;
    }

    const id = declarator.id;
    if (!Core.isNode(id) || (id.type ?? null) !== "Identifier" || !declarator.init) {
        return;
    }

    const name = typeof id.name === "string" ? id.name : null;

    if (!name) {
        return;
    }

    const startIndex = Core.getNodeStartIndex(declaration);
    const entry = {
        declaration,
        declarator,
        parent,
        property,
        owner,
        startIndex: typeof startIndex === "number" ? startIndex : null,
        replaced: false,
        invalid: false,
        assignment: null,
        fixDetail: null
    };

    if (!registry.has(name)) {
        registry.set(name, []);
    }

    registry.get(name).push(entry);
}

function convertIdentifierReference({
    identifier,
    parent,
    property,
    arrayOwner,
    arrayProperty,
    variableDeclarations,
    diagnostic,
    fixes,
    ancestorStack,
    context
}) {
    if (!identifier || identifier.type !== "Identifier") {
        return;
    }

    const ownerNode = Array.isArray(parent) ? arrayOwner : parent;
    const ownerProperty = Array.isArray(parent) ? arrayProperty : property;

    if (Array.isArray(parent) && (!ownerNode || typeof ownerNode !== "object")) {
        return;
    }

    if (!ownerNode || !shouldConvertIdentifierInWith(identifier, ownerNode, ownerProperty)) {
        return;
    }

    const candidates = variableDeclarations.get(identifier.name);
    const hasCandidates = Core.isNonEmptyArray(candidates);

    const withBodies = Core.asArray(context?.withBodies);
    const identifierStart = Core.getNodeStartIndex(identifier);
    const identifierEnd = Core.getNodeEndIndex(identifier);

    let matchedContext = null;
    let sawUnpromotableCandidate = false;

    if (hasCandidates) {
        for (let index = candidates.length - 1; index >= 0; index -= 1) {
            const candidate = candidates[index];

            if (!candidate || candidate.invalid) {
                continue;
            }

            if (!isPromotableWithOtherCandidate(candidate)) {
                sawUnpromotableCandidate = true;
                continue;
            }

            if (candidate.owner && withBodies.includes(candidate.owner)) {
                continue;
            }

            if (candidate.owner && !ancestorStack.includes(candidate.owner)) {
                continue;
            }

            if (
                typeof candidate.startIndex === "number" &&
                typeof identifierStart === "number" &&
                candidate.startIndex > identifierStart
            ) {
                continue;
            }

            matchedContext = candidate;
            break;
        }
    }

    if (!matchedContext) {
        if (hasCandidates || sawUnpromotableCandidate) {
            return;
        }

        replaceIdentifierWithOtherMember({
            identifier,
            parent,
            property,
            diagnostic,
            fixes,
            identifierStart,
            identifierEnd
        });
        return;
    }

    if (!matchedContext.replaced) {
        const assignment = promoteVariableDeclaration(matchedContext, diagnostic, fixes);

        if (!assignment) {
            matchedContext.invalid = true;
            return;
        }
    }

    replaceIdentifierWithOtherMember({
        identifier,
        parent,
        property,
        diagnostic,
        fixes,
        identifierStart,
        identifierEnd
    });
}

function replaceIdentifierWithOtherMember({
    identifier,
    parent,
    property,
    diagnostic,
    fixes,
    identifierStart,
    identifierEnd
}) {
    const memberExpression = createOtherMemberExpression(identifier);

    if (Array.isArray(parent)) {
        parent[property] = memberExpression;
    } else if (parent && typeof parent === "object") {
        parent[property] = memberExpression;
    }

    const range =
        typeof identifierStart === "number" && typeof identifierEnd === "number"
            ? { start: identifierStart, end: identifierEnd }
            : null;

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: identifier?.name ?? null,
        range
    });

    if (!fixDetail) {
        return;
    }

    attachFeatherFixMetadata(memberExpression, [fixDetail]);
    fixes.push(fixDetail);
}

function promoteVariableDeclaration(context, diagnostic, fixes) {
    if (!context || context.replaced) {
        return context?.assignment ?? null;
    }

    if (!Array.isArray(context.parent) || typeof context.property !== "number") {
        return null;
    }

    const declaration = context.declaration;
    const declarator = context.declarator;

    if (!declarator || declarator.id?.type !== "Identifier" || !declarator.init) {
        return null;
    }

    const assignment: Record<string, unknown> = {
        type: "AssignmentExpression",
        operator: "=",
        left: Core.cloneIdentifier(declarator.id),
        right: declarator.init,
        start: getStartFromNode(declaration),
        end: getEndFromNode(declaration)
    };

    copyCommentMetadata(declaration, assignment);

    context.parent[context.property] = assignment;

    const startIndex = Core.getNodeStartIndex(declaration);
    const endIndex = Core.getNodeEndIndex(declaration);
    const range =
        typeof startIndex === "number" && typeof endIndex === "number" ? { start: startIndex, end: endIndex } : null;

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: declarator.id?.name ?? null,
        range
    });

    if (fixDetail) {
        attachFeatherFixMetadata(assignment, [fixDetail]);
        fixes.push(fixDetail);
        context.fixDetail = fixDetail;
    }

    context.replaced = true;
    context.assignment = assignment;

    return assignment;
}

function isPromotableWithOtherCandidate(candidate) {
    if (!candidate) {
        return false;
    }

    const owner = candidate.owner;

    if (!owner || typeof owner !== "object") {
        return true;
    }

    return owner.type === "Program";
}

function isWithStatementTargetingOther(node) {
    if (!node || node.type !== "WithStatement") {
        return false;
    }

    const testExpression = node.test?.type === "ParenthesizedExpression" ? node.test.expression : node.test;

    return Core.isIdentifierWithName(testExpression, "other");
}

function shouldConvertIdentifierInWith(identifier, parent, property) {
    if (!identifier || identifier.type !== "Identifier") {
        return false;
    }

    if (!parent || typeof parent !== "object") {
        return false;
    }

    if (identifier.name === "other" || identifier.name === "self") {
        return false;
    }

    if (parent.type === "AssignmentExpression" && property === "left") {
        return false;
    }

    if (parent.type === "CallExpression" && property === "object") {
        return false;
    }

    if (parent.type === "MemberDotExpression" || parent.type === "MemberIndexExpression") {
        return false;
    }

    if (property === "property" || property === "id" || property === "name" || property === "params") {
        return false;
    }

    if (
        (parent.type === "FunctionDeclaration" || parent.type === "FunctionExpression") &&
        (property === "name" || property === "id")
    ) {
        return false;
    }

    if (parent.type === "StructLiteralMember" && property === "key") {
        return false;
    }

    return true;
}

function createOtherMemberExpression(identifier) {
    const memberExpression = {
        type: "MemberDotExpression",
        object: Core.createIdentifierNode("other", identifier),
        property: Core.cloneIdentifier(identifier)
    };

    Core.assignClonedLocation(memberExpression, identifier);

    return memberExpression;
}

function createAutomaticFeatherFixHandlers() {
    return new Map([
        [
            "GM1009",
            ({ ast, diagnostic, sourceText }) => {
                const fixes = [];

                const attributeFixes = convertFileAttributeAdditionsToBitwiseOr({
                    ast,
                    diagnostic
                });

                if (Core.isNonEmptyArray(attributeFixes)) {
                    fixes.push(...attributeFixes);
                }

                const roomFixes = convertRoomNavigationArithmetic({
                    ast,
                    diagnostic,
                    sourceText
                });

                if (Core.isNonEmptyArray(roomFixes)) {
                    fixes.push(...roomFixes);
                }

                return fixes;
            }
        ],
        ["GM1021", ({ ast, diagnostic }) => applyMissingFunctionCallCorrections({ ast, diagnostic })],
        ["GM1023", ({ ast, diagnostic }) => replaceDeprecatedConstantReferences({ ast, diagnostic })],
        ["GM1024", ({ ast, diagnostic }) => replaceDeprecatedBuiltinVariables({ ast, diagnostic })],
        ["GM1026", ({ ast, diagnostic }) => rewriteInvalidPostfixExpressions({ ast, diagnostic })],
        [
            "GM1028",
            ({ ast, preprocessedFixMetadata, diagnostic }) =>
                correctDataStructureAccessorTokens({
                    ast,
                    diagnostic,
                    metadata: preprocessedFixMetadata
                })
        ],
        ["GM1029", ({ ast, diagnostic }) => convertNumericStringArgumentsToNumbers({ ast, diagnostic })],
        [
            "GM1032",
            ({ ast, diagnostic, collectionService, sourceText }) =>
                normalizeArgumentBuiltinReferences({
                    ast,
                    diagnostic,
                    collectionService,
                    sourceText
                })
        ],
        ["GM1033", ({ ast, sourceText, diagnostic }) => removeDuplicateSemicolons({ ast, sourceText, diagnostic })],
        ["GM1030", ({ ast, sourceText, diagnostic }) => renameReservedIdentifiers({ ast, diagnostic, sourceText })],
        ["GM1034", ({ ast, diagnostic }) => relocateArgumentReferencesInsideFunctions({ ast, diagnostic })],
        ["GM1036", ({ ast, diagnostic }) => normalizeMultidimensionalArrayIndexing({ ast, diagnostic })],
        ["GM1038", ({ ast, diagnostic }) => removeDuplicateMacroDeclarations({ ast, diagnostic })],
        ["GM1012", ({ ast, diagnostic }) => convertStringLengthPropertyAccesses({ ast, diagnostic })],
        ["GM1014", ({ ast, diagnostic }) => addMissingEnumMembers({ ast, diagnostic })],
        ["GM1051", ({ ast, sourceText, diagnostic }) => removeTrailingMacroSemicolons({ ast, sourceText, diagnostic })],
        ["GM1015", ({ ast, diagnostic }) => preventDivisionOrModuloByZero({ ast, diagnostic })],
        [
            "GM1016",
            ({ ast, preprocessedFixMetadata, diagnostic }) =>
                removeBooleanLiteralStatements({
                    ast,
                    diagnostic,
                    metadata: preprocessedFixMetadata
                })
        ],
        ["GM1041", ({ ast, diagnostic }) => convertAssetArgumentStringsToIdentifiers({ ast, diagnostic })],
        [
            "GM1100",
            ({ ast, preprocessedFixMetadata, diagnostic }) =>
                normalizeObviousSyntaxErrors({
                    ast,
                    diagnostic,
                    metadata: preprocessedFixMetadata
                })
        ],
        [
            "GM1058",
            ({ ast, diagnostic }) =>
                ensureConstructorDeclarationsForNewExpressions({
                    ast,
                    diagnostic
                })
        ],
        ["GM1054", ({ ast, diagnostic }) => ensureConstructorParentsExist({ ast, diagnostic })],
        ["GM1059", ({ ast, options, diagnostic }) => renameDuplicateFunctionParameters({ ast, diagnostic, options })],
        [
            "GM1062",
            ({ ast, diagnostic }) =>
                sanitizeMalformedJsDocTypes({
                    ast,
                    diagnostic,
                    typeSystemInfo: FEATHER_TYPE_SYSTEM_INFO
                })
        ],
        ["GM1056", ({ ast, diagnostic }) => reorderOptionalParameters({ ast, diagnostic })],
        ["GM1052", ({ ast, diagnostic }) => replaceInvalidDeleteStatements({ ast, diagnostic })],
        ["GM2020", ({ ast, diagnostic }) => convertAllDotAssignmentsToWithStatements({ ast, diagnostic })],
        ["GM2032", ({ ast, diagnostic }) => ensureFileFindFirstBeforeClose({ ast, diagnostic })],
        ["GM2031", ({ ast, diagnostic }) => ensureFileFindSearchesAreSerialized({ ast, diagnostic })],
        ["GM2023", ({ ast, diagnostic }) => normalizeFunctionCallArgumentOrder({ ast, diagnostic })],
        ["GM2026", ({ ast, diagnostic }) => ensureHalignIsReset({ ast, diagnostic })],
        ["GM2029", ({ ast, diagnostic }) => ensureDrawVertexCallsAreWrapped({ ast, diagnostic })],
        ["GM1063", ({ ast, diagnostic }) => harmonizeTexturePointerTernaries({ ast, diagnostic })],
        ["GM2042", ({ ast, diagnostic }) => balanceGpuStateStack({ ast, diagnostic })],
        ["GM2044", ({ ast, diagnostic }) => deduplicateLocalVariableDeclarations({ ast, diagnostic })],
        ["GM2046", ({ ast, diagnostic }) => ensureSurfaceTargetsAreReset({ ast, diagnostic })],
        ["GM2048", ({ ast, diagnostic }) => ensureBlendEnableIsReset({ ast, diagnostic })],
        ["GM2051", ({ ast, diagnostic }) => ensureCullModeIsReset({ ast, diagnostic })],
        ["GM2052", ({ ast, diagnostic }) => ensureColourWriteEnableIsReset({ ast, diagnostic })],
        ["GM2053", ({ ast, diagnostic }) => ensureAlphaTestEnableIsReset({ ast, diagnostic })],
        ["GM2054", ({ ast, diagnostic }) => ensureAlphaTestRefIsReset({ ast, diagnostic })],
        ["GM2056", ({ ast, diagnostic }) => ensureTextureRepeatIsReset({ ast, diagnostic })],
        ["GM2061", ({ ast, diagnostic }) => convertNullishCoalesceOpportunities({ ast, diagnostic })],
        ["GM2064", ({ ast, diagnostic }) => annotateInstanceVariableStructAssignments({ ast, diagnostic })]
    ]);
}

function convertStringLengthPropertyAccesses({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent = null, property = null) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "MemberDotExpression") {
            const fix = convertLengthAccess(node, parent, property, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        Core.forEachNodeChild(node, (value, key) => {
            visit(value, node, key);
        });
    };

    visit(ast);

    return fixes;
}

function convertLengthAccess(node, parent, property, diagnostic) {
    if (!node || node.type !== "MemberDotExpression") {
        return null;
    }

    if (!parent || property == null) {
        return null;
    }

    if (parent.type === "AssignmentExpression" && parent.left === node) {
        return null;
    }

    if (parent.type === "CallExpression" && parent.object === node) {
        return null;
    }

    const propertyIdentifier = node.property;

    if (!Core.isIdentifierWithName(propertyIdentifier, "length")) {
        return null;
    }

    const argumentExpression = node.object;

    if (!argumentExpression || typeof argumentExpression !== "object") {
        return null;
    }

    if (!isStringReturningExpression(argumentExpression)) {
        return null;
    }

    const stringLengthIdentifier = Core.createIdentifierNode("string_length", propertyIdentifier);

    if (!stringLengthIdentifier) {
        return null;
    }

    const callExpression: Record<string, unknown> = {
        type: "CallExpression",
        object: stringLengthIdentifier,
        arguments: [argumentExpression]
    };

    const callStart = getStartFromNode(node);
    if (callStart) {
        callExpression.start = callStart;
    }

    const callEnd = getEndFromNode(node);
    if (callEnd) {
        callExpression.end = callEnd;
    }

    copyCommentMetadata(node, callExpression);

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: propertyIdentifier?.name ?? null,
        range: {
            start: Core.getNodeStartIndex(node),
            end: Core.getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    if (Array.isArray(parent)) {
        parent[property] = callExpression;
    } else if (parent && typeof property === "string") {
        parent[property] = callExpression;
    } else {
        return null;
    }

    attachFeatherFixMetadata(callExpression, [fixDetail]);

    return fixDetail;
}

function isStringReturningExpression(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    if (node.type === "CallExpression") {
        const calleeName = Core.getCallExpressionIdentifierName(node);
        if (!calleeName) {
            return false;
        }

        if (calleeName === "string") {
            return true;
        }

        if (STRING_LENGTH_CALL_BLOCKLIST.has(calleeName)) {
            return false;
        }

        if (calleeName.startsWith("string_")) {
            return true;
        }
    }

    return false;
}

function convertAssetArgumentStringsToIdentifiers({ ast, diagnostic }) {
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
            const calleeName = Core.getCallExpressionIdentifierName(node);

            if (calleeName && GM1041_CALL_ARGUMENT_TARGETS.has(calleeName)) {
                const argumentIndexes = GM1041_CALL_ARGUMENT_TARGETS.get(calleeName) ?? [];
                const args = Core.getCallExpressionArguments(node);

                for (const argumentIndex of argumentIndexes) {
                    if (typeof argumentIndex !== "number" || argumentIndex < 0 || argumentIndex >= args.length) {
                        continue;
                    }

                    const fixDetail = convertStringLiteralArgumentToIdentifier({
                        argument: args[argumentIndex],
                        container: args,
                        index: argumentIndex,
                        diagnostic
                    });

                    if (fixDetail) {
                        fixes.push(fixDetail);
                    }
                }
            }
        }

        Core.forEachNodeChild(node, (value) => {
            visit(value);
        });
    };

    visit(ast);

    return fixes;
}

function convertStringLiteralArgumentToIdentifier({ argument, container, index, diagnostic }) {
    if (!Core.isArrayIndex(container, index)) {
        return null;
    }

    if (!argument || argument.type !== "Literal" || typeof argument.value !== "string") {
        return null;
    }

    const identifierName = extractIdentifierNameFromLiteral(argument.value);
    if (!identifierName) {
        return null;
    }

    const identifierNode = {
        type: "Identifier",
        name: identifierName
    };

    Core.assignClonedLocation(identifierNode, argument);

    copyCommentMetadata(argument, identifierNode);

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: identifierName,
        range: {
            start: Core.getNodeStartIndex(argument),
            end: Core.getNodeEndIndex(argument)
        }
    });

    if (!fixDetail) {
        return null;
    }

    container[index] = identifierNode;
    attachFeatherFixMetadata(identifierNode, [fixDetail]);

    return fixDetail;
}

function buildFeatherTypeSystemInfo() {
    const metadata = Core.getFeatherMetadata();
    const typeSystem = metadata?.typeSystem;

    const baseTypes = new Set();
    const baseTypesLowercase = new Set();
    const specifierBaseTypes = new Set();

    const entries = Core.asArray(typeSystem?.baseTypes);

    for (const entry of entries) {
        const name = Core.toTrimmedString(Core.getOptionalString(entry, "name"));

        if (!name) {
            continue;
        }

        baseTypes.add(name);
        baseTypesLowercase.add(name.toLowerCase());

        const specifierExamples = Core.asArray(Core.getOptionalArray(entry, "specifierExamples"));
        const hasDotSpecifier = specifierExamples.some((example) => {
            if (typeof example !== "string") {
                return false;
            }

            return example.trim().startsWith(".");
        });

        const description = Core.toTrimmedString(Core.getOptionalString(entry, "description")) ?? "";
        const requiresSpecifier = /requires specifiers/i.test(description) || /constructor/i.test(description);

        if (hasDotSpecifier || requiresSpecifier) {
            specifierBaseTypes.add(name.toLowerCase());
        }
    }

    return {
        baseTypeNames: [...baseTypes],
        baseTypeNamesLower: baseTypesLowercase,
        specifierBaseTypeNamesLower: specifierBaseTypes
    };
}

function registerFeatherFixer(registry, diagnosticId, factory) {
    if (!registry || typeof registry.set !== "function") {
        return;
    }

    if (!diagnosticId || typeof factory !== "function") {
        return;
    }

    if (!registry.has(diagnosticId)) {
        registry.set(diagnosticId, factory);
    }
}

function splitGlobalVarInlineInitializers({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent = null, property = null) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "GlobalVarStatement") {
            const fixDetails = splitGlobalVarStatementInitializers({
                statement: node,
                parent,
                property,
                diagnostic
            });

            if (Core.isNonEmptyArray(fixDetails)) {
                fixes.push(...fixDetails);
            }

            return;
        }

        Core.forEachNodeChild(node, (value, key) => {
            visit(value, node, key);
        });
    };

    visit(ast);

    return fixes;
}

function splitGlobalVarStatementInitializers({ statement, parent, property, diagnostic }) {
    if (!statement || statement.type !== "GlobalVarStatement") {
        return [];
    }

    if (!hasArrayParentWithNumericIndex(parent, property)) {
        return [];
    }

    const declarators = Array.isArray(statement.declarations) ? statement.declarations : [];

    if (declarators.length === 0) {
        return [];
    }

    const assignments = [];

    for (const declarator of declarators) {
        const assignmentInfo = createAssignmentFromGlobalVarDeclarator({
            statement,
            declarator,
            diagnostic
        });

        if (!assignmentInfo) {
            continue;
        }

        assignments.push(assignmentInfo);
        clearGlobalVarDeclaratorInitializer(declarator);
    }

    if (assignments.length === 0) {
        return [];
    }

    const fixDetails = assignments.map((entry) => entry.fixDetail);

    parent.splice(property + 1, 0, ...assignments.map((entry) => entry.assignment));

    attachFeatherFixMetadata(statement, fixDetails);

    for (const { assignment, fixDetail } of assignments) {
        attachFeatherFixMetadata(assignment, [fixDetail]);
    }

    return fixDetails;
}

function createAssignmentFromGlobalVarDeclarator({ statement, declarator, diagnostic }) {
    if (!declarator || declarator.type !== "VariableDeclarator") {
        return null;
    }

    const initializer = declarator.init;

    if (!initializer || typeof initializer !== "object") {
        return null;
    }

    const identifier = Core.cloneIdentifier(declarator.id);

    if (!identifier) {
        return null;
    }

    if (declarator.id && declarator.id.isGlobalIdentifier && Core.isNode(identifier)) {
        identifier.isGlobalIdentifier = true;
    }

    const assignment: MutableGameMakerAstNode = {
        type: "AssignmentExpression",
        operator: "=",
        left: identifier,
        right: initializer
    } as MutableGameMakerAstNode;

    if (Object.hasOwn(declarator, "start")) {
        Core.assignClonedLocation(assignment as any, declarator);
    } else if (Object.hasOwn(statement, "start")) {
        Core.assignClonedLocation(assignment as any, statement);
    }

    if (Object.hasOwn(initializer, "end")) {
        Core.assignClonedLocation(assignment as any, initializer);
    } else if (Object.hasOwn(declarator, "end")) {
        Core.assignClonedLocation(assignment as any, declarator);
    } else if (Object.hasOwn(statement, "end")) {
        Core.assignClonedLocation(assignment as any, statement);
    }

    copyCommentMetadata(declarator, assignment);
    copyCommentMetadata(initializer, assignment);

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: identifier?.name ?? null,
        range: {
            start: Core.getNodeStartIndex(declarator),
            end: Core.getNodeEndIndex(declarator)
        }
    });

    if (!fixDetail) {
        return null;
    }

    return { assignment, fixDetail };
}

function clearGlobalVarDeclaratorInitializer(declarator) {
    if (!declarator || declarator.type !== "VariableDeclarator") {
        return;
    }

    declarator.init = null;

    if (declarator.id && typeof declarator.id === "object" && Object.hasOwn(declarator.id, "end")) {
        Core.assignClonedLocation(declarator, declarator.id);
    }
}

const NODE_REMOVED = Symbol("flaggedInvalidAssignmentRemovedNode");

function flagInvalidAssignmentTargets({ ast, diagnostic, sourceText }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property, container, index) => {
        if (!node) {
            return null;
        }

        if (Array.isArray(node)) {
            for (let arrayIndex = 0; arrayIndex < node.length; arrayIndex += 1) {
                const child = node[arrayIndex];
                const result = visit(child, parent, property, node, arrayIndex);

                if (result === NODE_REMOVED) {
                    arrayIndex -= 1;
                }
            }
            return null;
        }

        if (typeof node !== "object") {
            return null;
        }

        if (node.type === "ExpressionStatement") {
            const removalFix = removeInvalidAssignmentExpression({
                statement: node,
                container,
                index,
                ast,
                diagnostic,
                sourceText
            });

            if (removalFix) {
                fixes.push(removalFix);
                return NODE_REMOVED;
            }
        }

        if (node.type === "AssignmentExpression") {
            const fix = flagInvalidAssignmentTarget(ast, node, diagnostic, sourceText);

            if (fix) {
                if (
                    shouldRemoveInvalidAssignmentFromContainer({
                        parent,
                        property,
                        container
                    })
                ) {
                    removeNodeFromContainer(container, index, node);
                    fixes.push(fix);
                    return NODE_REMOVED;
                }

                fixes.push(fix);
            }

            return null;
        }

        for (const [childKey, value] of Object.entries(node)) {
            if (!value || typeof value !== "object") {
                continue;
            }

            if (Array.isArray(value)) {
                visit(value, node, childKey, value, null);
                continue;
            }

            visit(value, node, childKey, null, null);
        }

        return null;
    };

    visit(ast, null, null, null, null);

    return fixes;
}

function removeInvalidAssignmentExpression({ statement, container, index, diagnostic, sourceText, ast }) {
    if (!statement || statement.type !== "ExpressionStatement") {
        return null;
    }

    const expression = statement.expression;

    if (!expression || expression.type !== "AssignmentExpression") {
        return null;
    }

    if (isAssignableTarget(expression.left)) {
        return null;
    }

    const fixDetail = flagInvalidAssignmentTarget(ast, expression, diagnostic, sourceText);

    if (!fixDetail) {
        return null;
    }

    removeNodeFromContainer(container, index, statement);

    attachFeatherFixMetadata(statement, [fixDetail]);

    return fixDetail;
}

function getFiniteIndex(value) {
    return Core.isFiniteNumber(value) && value >= 0 ? value : null;
}

function removeNodeFromContainer(container, index, node) {
    if (!Array.isArray(container)) {
        return;
    }

    let removalIndex = getFiniteIndex(index);

    if (removalIndex === null) {
        removalIndex = getFiniteIndex(container.indexOf(node));
    }

    if (removalIndex !== null) {
        container.splice(removalIndex, 1);
    }
}

function shouldRemoveInvalidAssignmentFromContainer({ parent, property, container }) {
    if (!parent || !Array.isArray(container) || property !== "body") {
        return false;
    }

    const parentType = parent?.type ?? null;

    return parentType === "Program" || parentType === "BlockStatement";
}

function flagInvalidAssignmentTarget(ast, node, diagnostic, sourceText) {
    if (!node || node.type !== "AssignmentExpression") {
        return null;
    }

    const left = node.left;

    if (!left || isAssignableTarget(left)) {
        return null;
    }

    const startIndex = Core.getNodeStartIndex(left);
    const endIndex = Core.getNodeEndIndex(left);

    const range =
        typeof startIndex === "number" && typeof endIndex === "number"
            ? {
                  start: startIndex,
                  end: endIndex
              }
            : null;

    const targetText = getSourceTextSlice({
        sourceText,
        startIndex,
        endIndex
    });

    const fixDetail = createFeatherFixDetail(diagnostic, {
        automatic: false,
        range,
        target: targetText
    });

    if (!fixDetail) {
        return null;
    }

    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

function isAssignableTarget(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    if (node.type === "Identifier") {
        return true;
    }

    if (node.type === "MemberDotExpression" || node.type === "MemberIndexExpression") {
        return true;
    }

    return false;
}

function getSourceTextSlice({ sourceText, startIndex, endIndex }) {
    if (typeof sourceText !== "string") {
        return null;
    }

    if (typeof startIndex !== "number" || typeof endIndex !== "number") {
        return null;
    }

    if (startIndex < 0 || endIndex > sourceText.length) {
        return null;
    }

    const slice = sourceText.slice(startIndex, endIndex);

    if (slice.length === 0) {
        return null;
    }

    return slice.trim() || null;
}

function convertReadOnlyBuiltInAssignments({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];
    const nameRegistry = collectAllIdentifierNames(ast);

    const visit = (node, parent = null, property = null) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "AssignmentExpression") {
            const fixDetail = convertReadOnlyAssignment(node, parent, property, diagnostic, nameRegistry);

            if (fixDetail) {
                fixes.push(fixDetail);
                return;
            }
        }

        Core.forEachNodeChild(node, (value, key) => {
            visit(value, node, key);
        });
    };

    visit(ast);

    return fixes;
}

function convertReadOnlyAssignment(node, parent, property, diagnostic, nameRegistry) {
    if (!hasArrayParentWithNumericIndex(parent, property)) {
        return null;
    }

    if (!node || node.type !== "AssignmentExpression" || node.operator !== "=") {
        return null;
    }

    const identifier = node.left;

    if (!identifier || identifier.type !== "Identifier") {
        return null;
    }

    if (!READ_ONLY_BUILT_IN_VARIABLES.has(identifier.name)) {
        return null;
    }

    const replacementName = createReadOnlyReplacementName(identifier.name, nameRegistry);
    const replacementIdentifier = Core.createIdentifierNode(replacementName, identifier);

    const declarator = {
        type: "VariableDeclarator",
        id: replacementIdentifier,
        init: node.right,
        start: getStartFromNode(node),
        end: getEndFromNode(node)
    };

    const declaration = {
        type: "VariableDeclaration",
        declarations: [declarator],
        kind: "var",
        start: getStartFromNode(node),
        end: getEndFromNode(node)
    };

    copyCommentMetadata(node, declaration);

    parent[property] = declaration;

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: identifier.name ?? null,
        range: {
            start: Core.getNodeStartIndex(node),
            end: Core.getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    attachFeatherFixMetadata(declaration, [fixDetail]);

    replaceReadOnlyIdentifierReferences(parent, property + 1, identifier.name, replacementName);

    return fixDetail;
}

function replaceReadOnlyIdentifierReferences(siblings, startIndex, originalName, replacementName) {
    if (!Array.isArray(siblings)) {
        return;
    }

    for (let index = startIndex; index < siblings.length; index += 1) {
        renameIdentifiersInNode(siblings[index], originalName, replacementName);
    }
}

// This local identifier renaming implementation performs a direct AST walk and
// in-place name replacement, which overlaps conceptually with the batch renaming
// engine in the `refactor` module and the symbol-tracking facilities in `semantic`.
// The duplication exists because:
//   1. The `refactor` module was designed for cross-file, semantically validated
//      renames and produces workspace edits rather than mutating the AST directly.
//   2. The `semantic` module tracks scope and usage but doesn't expose a lightweight
//      single-function rename helper suitable for inline Feather fix application.
//   3. This function must run synchronously within the Feather fix transform pass
//      without triggering heavyweight semantic analysis or file I/O.
//
// Future refactoring should extract a shared AST-level renaming primitive into the
// `refactor` or `semantic` module that both this code and the batch rename engine
// can delegate to, reducing duplication while preserving the performance constraints
// of the Feather fix pipeline. Until then, this implementation remains local to avoid
// introducing cross-module coupling that would complicate the plugin's data flow.
function renameIdentifiersInNode(root, originalName, replacementName) {
    const stack = [{ node: root, parent: null, property: null, ancestors: [] }];

    while (stack.length > 0) {
        const { node, parent, property, ancestors } = stack.pop();

        if (!node) {
            continue;
        }

        if (Array.isArray(node)) {
            const arrayContext = { node, parent, property };
            const nextAncestors = [...ancestors, arrayContext];

            for (let index = node.length - 1; index >= 0; index -= 1) {
                stack.push({
                    node: node[index],
                    parent: node,
                    property: index,
                    ancestors: nextAncestors
                });
            }
            continue;
        }

        if (typeof node !== "object") {
            continue;
        }

        if (node.type === "Identifier" && node.name === originalName) {
            if (
                !shouldSkipIdentifierReplacement({
                    parent,
                    property,
                    ancestors
                })
            ) {
                const replacement = Core.createIdentifierNode(replacementName, node);

                if (parent && property !== null && property !== undefined) {
                    parent[property] = replacement;
                }
            }
            continue;
        }

        const nextAncestors = [...ancestors, { node, parent, property }];

        Core.forEachNodeChild(node, (value, key) => {
            stack.push({
                node: value,
                parent: node,
                property: key,
                ancestors: nextAncestors
            });
        });
    }
}

const IDENTIFIER_DECLARATION_CONTEXTS = new Set([
    "VariableDeclarator:id",
    "FunctionDeclaration:id",
    "ConstructorDeclaration:id",
    "StructDeclaration:id",
    "EnumDeclaration:name",
    "EnumMember:name",
    "ConstructorParentClause:id",
    "MacroDeclaration:name",
    "NamespaceDeclaration:id",
    "DefaultParameter:left"
]);

/**
 * Determines whether an identifier in the AST should be skipped during renaming.
 *
 * DUPLICATION WARNING: This logic overlaps with scope analysis in 'semantic' and
 * identifier categorization in 'refactor'. The decision of whether to rename an
 * identifier should ideally be based on:
 *   1. Scope information (is it a declaration, binding, or reference?)
 *   2. Syntactic context (is it the target of a property access, an import, etc.?)
 *
 * CURRENT STATE: This function uses a hardcoded set of parent-type + property-name
 * pairs to identify declaration contexts where renaming should be skipped. This is
 * fragile and duplicates semantic analysis that 'semantic' already performs.
 *
 * RECOMMENDATION: Consolidate this with 'semantic' binding analysis or 'refactor'
 * renaming utilities. The semantic module can mark each identifier node with metadata
 * indicating its role (declaration, reference, import, etc.), and renaming logic can
 * consult that metadata instead of re-deriving it from parent context.
 *
 * WHAT WOULD BREAK: Removing or changing this function without understanding the
 * identifier's semantic role could cause:
 *   - Renaming declaration sites incorrectly (e.g., turning `function foo()` into `function bar()`)
 *   - Missing references that should be renamed
 *   - Renaming property keys or import specifiers that should remain unchanged
 */
function shouldSkipIdentifierReplacement({ parent, property, ancestors }) {
    if (!parent) {
        return true;
    }

    if (parent.type === "MemberDotExpression" && property === "property") {
        return true;
    }

    if (parent.type === "NamespaceAccessExpression" && property === "name") {
        return true;
    }

    const contextKey = parent.type ? `${parent.type}:${property}` : null;

    if (contextKey && IDENTIFIER_DECLARATION_CONTEXTS.has(contextKey)) {
        return true;
    }

    if (!Array.isArray(parent)) {
        return false;
    }

    let arrayIndex = -1;
    for (let index = ancestors.length - 1; index >= 0; index -= 1) {
        if (ancestors[index].node === parent) {
            arrayIndex = index;
            break;
        }
    }

    if (arrayIndex === -1) {
        return false;
    }

    const arrayContext = ancestors[arrayIndex];
    const ownerContext = arrayIndex > 0 ? ancestors[arrayIndex - 1] : null;
    const containerNode = ownerContext?.node ?? null;
    const containerProperty = arrayContext?.property ?? null;

    if (
        containerNode &&
        containerProperty === "params" &&
        (containerNode.type === "FunctionDeclaration" ||
            containerNode.type === "ConstructorDeclaration" ||
            containerNode.type === "StructDeclaration" ||
            containerNode.type === "ConstructorParentClause")
    ) {
        return true;
    }

    return false;
}

function createReadOnlyReplacementName(originalName, nameRegistry) {
    const baseName = Core.getNonEmptyString(originalName) ?? "value";
    const sanitized = baseName.replaceAll(/[^a-zA-Z0-9_]/g, "_");
    let candidate = `__feather_${sanitized}`;
    let suffix = 1;

    while (nameRegistry.has(candidate)) {
        suffix += 1;
        candidate = `__feather_${sanitized}_${suffix}`;
    }

    nameRegistry.add(candidate);

    return candidate;
}

/**
 * Collects all identifier names used in the given AST subtree.
 *
 * DUPLICATION WARNING: This function walks the AST to extract identifier names,
 * which overlaps with functionality in 'refactor' and 'semantic':
 *   - 'semantic' already performs complete binding analysis and knows every identifier
 *     in scope, its declaration site, and all its references.
 *   - 'refactor' provides utilities for collecting identifiers within a scope for
 *     conflict detection during renaming.
 *
 * CURRENT STATE: This function performs a manual tree walk to build a Set of all
 * identifier names. It doesn't distinguish between declarations, references, or
 * shadowed names, and doesn't respect scope boundaries.
 *
 * RECOMMENDATION: Import identifier collection from 'semantic' or 'refactor' instead
 * of reimplementing it here. If scope-aware collection is needed (e.g., "find all
 * identifiers in this function's scope"), use the semantic binding map. If you only
 * need a simple name registry for conflict detection, consider extracting this logic
 * to a shared utility in Core.
 *
 * LONG-TERM: Consolidate all identifier-collection logic into 'semantic' and provide
 * a public API for queries like "getAllIdentifiersInScope(node)" or "getBindingsAtNode(node)".
 */
function collectAllIdentifierNames(root) {
    const names = new Set();

    walkAstNodes(root, (node) => {
        const identifierDetails = Core.getIdentifierDetails(node);
        if (identifierDetails) {
            names.add(identifierDetails.name);
        }
    });

    return names;
}

function convertFileAttributeAdditionsToBitwiseOr({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    walkAstNodes(ast, (node) => {
        if (node.type !== "BinaryExpression") {
            return;
        }

        const fix = normalizeFileAttributeAddition(node, diagnostic);

        if (!fix) {
            return;
        }

        fixes.push(fix);

        return false;
    });

    return fixes;
}

function normalizeFileAttributeAddition(node, diagnostic) {
    if (!node || node.type !== "BinaryExpression") {
        return null;
    }

    if (node.operator !== "+") {
        return null;
    }

    const leftIdentifier = unwrapIdentifierFromExpression(node.left);
    const rightIdentifier = unwrapIdentifierFromExpression(node.right);

    if (!isFileAttributeIdentifier(leftIdentifier) || !isFileAttributeIdentifier(rightIdentifier)) {
        return null;
    }

    const originalOperator = node.operator;
    node.operator = "|";

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: originalOperator ?? null,
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

function unwrapIdentifierFromExpression(node) {
    if (!node || typeof node !== "object") {
        return null;
    }

    if (node.type === "Identifier") {
        return node;
    }

    if (node.type === "ParenthesizedExpression") {
        return unwrapIdentifierFromExpression(node.expression);
    }

    return null;
}

function unwrapLiteralFromExpression(node) {
    if (!node || typeof node !== "object") {
        return null;
    }

    if (node.type === "Literal") {
        return node;
    }

    if (node.type === "ParenthesizedExpression") {
        return unwrapLiteralFromExpression(node.expression);
    }

    return null;
}

function isFileAttributeIdentifier(node) {
    const identifierDetails = Core.getIdentifierDetails(node);
    if (!identifierDetails) {
        return false;
    }

    return FILE_ATTRIBUTE_IDENTIFIER_PATTERN.test(identifierDetails.name);
}

function convertRoomNavigationArithmetic({ ast, diagnostic, sourceText }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    walkAstNodes(ast, (node, parent, property) => {
        if (node.type === "CallExpression") {
            const fix = rewriteRoomGotoCall({
                node,
                diagnostic,
                sourceText
            });

            if (fix) {
                fixes.push(fix);
            }
        }

        if (node.type !== "BinaryExpression") {
            return;
        }

        const fix = rewriteRoomNavigationBinaryExpression({
            node,
            parent,
            property,
            diagnostic,
            sourceText
        });

        if (!fix) {
            return;
        }

        fixes.push(fix);

        return false;
    });

    return fixes;
}

function rewriteRoomNavigationBinaryExpression({ node, parent, property, diagnostic, sourceText }) {
    if (!node || node.type !== "BinaryExpression") {
        return null;
    }

    if (!isEligibleRoomBinaryParent(parent, property)) {
        return null;
    }

    const navigation = resolveRoomNavigationFromBinaryExpression(node);

    if (!navigation) {
        return null;
    }

    const { direction, baseIdentifier } = navigation;
    const { binary: replacementName } = getRoomNavigationHelpers(direction);
    const calleeIdentifier = Core.createIdentifierNode(replacementName, baseIdentifier);
    const argumentIdentifier = Core.cloneIdentifier(baseIdentifier);

    if (!calleeIdentifier || !argumentIdentifier) {
        return null;
    }

    const callExpression: Record<string, unknown> = {
        type: "CallExpression",
        object: calleeIdentifier,
        arguments: [argumentIdentifier]
    };

    Core.assignClonedLocation(callExpression, node);

    copyCommentMetadata(node, callExpression);

    const startIndex = Core.getNodeStartIndex(node);
    const endIndex = Core.getNodeEndIndex(node);
    const range =
        typeof startIndex === "number" && typeof endIndex === "number" ? { start: startIndex, end: endIndex } : null;

    const target =
        getSourceTextSlice({
            sourceText,
            startIndex,
            endIndex
        }) ?? null;

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target,
        range
    });

    if (!fixDetail) {
        return null;
    }

    fixDetail.replacement = replacementName;

    if (Array.isArray(parent)) {
        parent[property] = callExpression;
    } else if (parent && typeof property === "string") {
        parent[property] = callExpression;
    } else {
        return null;
    }

    attachFeatherFixMetadata(callExpression, [fixDetail]);

    return fixDetail;
}

function rewriteRoomGotoCall({ node, diagnostic, sourceText }) {
    if (!isCallExpressionWithName(node, "room_goto")) {
        return null;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length !== 1) {
        return null;
    }

    const navigation = resolveRoomNavigationFromBinaryExpression(args[0]);

    if (!navigation) {
        return null;
    }

    const { goto: replacementName } = getRoomNavigationHelpers(navigation.direction);

    const startIndex = Core.getNodeStartIndex(node);
    const endIndex = Core.getNodeEndIndex(node);
    const range =
        typeof startIndex === "number" && typeof endIndex === "number" ? { start: startIndex, end: endIndex } : null;

    const target =
        getSourceTextSlice({
            sourceText,
            startIndex,
            endIndex
        }) ??
        node.object?.name ??
        null;

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target,
        range
    });

    if (!fixDetail) {
        return null;
    }

    fixDetail.replacement = replacementName;

    const updatedCallee = Core.createIdentifierNode(replacementName, node.object);

    if (!updatedCallee) {
        return null;
    }

    node.object = updatedCallee;
    node.arguments = [];

    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

function resolveRoomNavigationFromBinaryExpression(node) {
    if (!node || node.type !== "BinaryExpression") {
        return null;
    }

    const leftIdentifier = unwrapIdentifierFromExpression(node.left);
    const rightIdentifier = unwrapIdentifierFromExpression(node.right);
    const leftLiteral = unwrapLiteralFromExpression(node.left);
    const rightLiteral = unwrapLiteralFromExpression(node.right);

    if (Core.isIdentifierWithName(leftIdentifier, "room")) {
        if (node.operator === "+") {
            if (isLiteralOne(rightLiteral)) {
                return {
                    direction: ROOM_NAVIGATION_DIRECTION.NEXT,
                    baseIdentifier: leftIdentifier
                };
            }

            if (isNegativeOneLiteral(rightLiteral)) {
                return {
                    direction: ROOM_NAVIGATION_DIRECTION.PREVIOUS,
                    baseIdentifier: leftIdentifier
                };
            }
        }

        if (node.operator === "-") {
            if (isLiteralOne(rightLiteral)) {
                return {
                    direction: ROOM_NAVIGATION_DIRECTION.PREVIOUS,
                    baseIdentifier: leftIdentifier
                };
            }

            if (isNegativeOneLiteral(rightLiteral)) {
                return {
                    direction: ROOM_NAVIGATION_DIRECTION.NEXT,
                    baseIdentifier: leftIdentifier
                };
            }
        }
    }

    if (Core.isIdentifierWithName(rightIdentifier, "room")) {
        if (node.operator === "+") {
            if (isLiteralOne(leftLiteral)) {
                return {
                    direction: ROOM_NAVIGATION_DIRECTION.NEXT,
                    baseIdentifier: rightIdentifier
                };
            }

            if (isNegativeOneLiteral(leftLiteral)) {
                return {
                    direction: ROOM_NAVIGATION_DIRECTION.PREVIOUS,
                    baseIdentifier: rightIdentifier
                };
            }
        }

        if (node.operator === "-") {
            if (isLiteralOne(leftLiteral)) {
                return {
                    direction: ROOM_NAVIGATION_DIRECTION.PREVIOUS,
                    baseIdentifier: rightIdentifier
                };
            }

            if (isNegativeOneLiteral(leftLiteral)) {
                return {
                    direction: ROOM_NAVIGATION_DIRECTION.NEXT,
                    baseIdentifier: rightIdentifier
                };
            }
        }
    }

    return null;
}

function isEligibleRoomBinaryParent(parent, property) {
    if (!parent) {
        return false;
    }

    if (parent.type === "VariableDeclarator" && property === "init") {
        return true;
    }

    if (parent.type === "AssignmentExpression" && property === "right") {
        return true;
    }

    return false;
}

function preventDivisionOrModuloByZero({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            const items = node.slice();

            for (const item of items) {
                visit(item);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "BinaryExpression") {
            const fix = normalizeDivisionBinaryExpression(node, diagnostic);

            if (fix) {
                fixes.push(fix);
            }
        } else if (node.type === "AssignmentExpression") {
            const fix = normalizeDivisionAssignmentExpression(node, diagnostic);

            if (fix) {
                fixes.push(fix);
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

function normalizeDivisionBinaryExpression(node, diagnostic) {
    if (!node || node.type !== "BinaryExpression") {
        return null;
    }

    if (node.operator !== "/" && node.operator !== "%") {
        return null;
    }

    const zeroLiteralInfo = findZeroLiteralInfo(node.right);

    if (!zeroLiteralInfo) {
        return null;
    }

    const { literal, container, property } = zeroLiteralInfo;
    const replacementLiteral = createLiteral("1", literal);

    if (!replacementLiteral) {
        return null;
    }

    if (container && property) {
        container[property] = replacementLiteral;
    } else {
        node.right = replacementLiteral;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: literal?.value ?? null,
        range: {
            start: Core.getNodeStartIndex(literal),
            end: Core.getNodeEndIndex(literal)
        }
    });

    if (!fixDetail) {
        return null;
    }

    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

function normalizeDivisionAssignmentExpression(node, diagnostic) {
    if (!node || node.type !== "AssignmentExpression") {
        return null;
    }

    if (node.operator !== "/=" && node.operator !== "%=") {
        return null;
    }

    const zeroLiteralInfo = findZeroLiteralInfo(node.right);

    if (!zeroLiteralInfo) {
        return null;
    }

    const { literal, container, property } = zeroLiteralInfo;
    const replacementLiteral = createLiteral("1", literal);

    if (!replacementLiteral) {
        return null;
    }

    if (container && property) {
        container[property] = replacementLiteral;
    } else {
        node.right = replacementLiteral;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: literal?.value ?? null,
        range: {
            start: Core.getNodeStartIndex(literal),
            end: Core.getNodeEndIndex(literal)
        }
    });

    if (!fixDetail) {
        return null;
    }

    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

function findZeroLiteralInfo(node) {
    if (!node || typeof node !== "object") {
        return null;
    }

    if (node.type === "Literal") {
        return isZeroLiteral(node) ? { literal: node, container: null, property: null } : null;
    }

    if (node.type === "ParenthesizedExpression") {
        if (!node.expression || typeof node.expression !== "object") {
            return null;
        }

        const innerInfo = findZeroLiteralInfo(node.expression);

        if (!innerInfo) {
            return null;
        }

        if (!innerInfo.container) {
            return {
                literal: innerInfo.literal,
                container: node,
                property: "expression"
            };
        }

        return innerInfo;
    }

    if (node.type === "UnaryExpression") {
        if (node.operator !== "+" && node.operator !== "-") {
            return null;
        }

        if (!node.argument || typeof node.argument !== "object") {
            return null;
        }

        const innerInfo = findZeroLiteralInfo(node.argument);

        if (!innerInfo) {
            return null;
        }

        if (!innerInfo.container) {
            return {
                literal: innerInfo.literal,
                container: node,
                property: "argument"
            };
        }

        return innerInfo;
    }

    return null;
}

function isZeroLiteral(node) {
    if (!node || node.type !== "Literal") {
        return false;
    }

    const rawValue = node.value;

    if (typeof rawValue === "number") {
        return rawValue === 0;
    }

    if (typeof rawValue !== "string" || rawValue.length === 0) {
        return false;
    }

    const normalized = Number(rawValue);

    if (!Number.isFinite(normalized)) {
        return false;
    }

    return normalized === 0;
}

function cleanupSelfAssignments(node) {
    const renames = new Map();

    const traverse = (n) => {
        if (!n || typeof n !== "object") {
            return;
        }

        if (Array.isArray(n)) {
            for (let i = n.length - 1; i >= 0; i--) {
                traverse(n[i]);
                const child = n[i];
                if (child && child.type === "VariableDeclaration" && child.declarations.length === 0) {
                    n.splice(i, 1);
                }
            }
            return;
        }

        if (n.type === "VariableDeclaration") {
            n.declarations = n.declarations.filter((declarator) => {
                if (declarator.type !== "VariableDeclarator") {
                    return true;
                }
                if (declarator.id.type !== "Identifier") {
                    return true;
                }
                if (!declarator.init || declarator.init.type !== "Identifier") {
                    return true;
                }
                if (declarator.id.name === declarator.init.name) {
                    return false;
                }
                if (declarator.id.name === `_${declarator.init.name}`) {
                    renames.set(declarator.id.name, declarator.init.name);
                    return false;
                }
                return true;
            });
            return;
        }

        for (const key of Object.keys(n)) {
            if (
                key === "parent" ||
                key === "loc" ||
                key === "start" ||
                key === "end" ||
                key === "range" ||
                key === "comments"
            ) {
                continue;
            }
            traverse(n[key]);
        }
    };

    traverse(node);

    if (renames.size > 0) {
        const applyRenames = (n) => {
            if (!n || typeof n !== "object") {
                return;
            }

            if (Array.isArray(n)) {
                for (const child of n) {
                    applyRenames(child);
                }
                return;
            }

            if (n.type === "Identifier" && renames.has(n.name)) {
                n.name = renames.get(n.name);
            }

            for (const key of Object.keys(n)) {
                if (
                    key === "parent" ||
                    key === "loc" ||
                    key === "start" ||
                    key === "end" ||
                    key === "range" ||
                    key === "comments"
                ) {
                    continue;
                }
                applyRenames(n[key]);
            }
        };

        applyRenames(node);
    }
}

function normalizeArgumentBuiltinReferences({ ast, diagnostic, collectionService, sourceText }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const child of node) {
                visit(child);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (Core.isFunctionLikeNode(node)) {
            const metadata = getDocCommentMetadata(node);
            const documentedParamNames = metadata?.documentedParamNames ?? new Set<string>();
            const functionFixes = fixArgumentReferencesWithinFunction(
                node,
                diagnostic,
                collectionService,
                documentedParamNames,
                sourceText
            );

            if (Core.isNonEmptyArray(functionFixes)) {
                fixes.push(...functionFixes);
            }

            return;
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

function updateImplicitArgumentDocEntryIndices(functionNode, mapping) {
    const entries = functionNode?._featherImplicitArgumentDocEntries;
    if (!entries) {
        return;
    }

    for (const entry of entries) {
        if (!entry || typeof entry.index !== "number") {
            continue;
        }

        if (!mapping.has(entry.index)) {
            continue;
        }

        const oldIndex = entry.index;
        const newIndex = mapping.get(oldIndex);
        entry.index = newIndex;

        if (entry.name === `argument${oldIndex}`) {
            entry.name = `argument${newIndex}`;
        }
        if (entry.canonical === `argument${oldIndex}`) {
            entry.canonical = `argument${newIndex}`;
        }
        if (entry.fallbackCanonical === `argument${oldIndex}`) {
            entry.fallbackCanonical = `argument${newIndex}`;
        }
    }
}

const FEATHER_FIX_IMPLEMENTATIONS = buildFeatherFixImplementations(FEATHER_DIAGNOSTICS);
const FEATHER_DIAGNOSTIC_FIXERS = buildFeatherDiagnosticFixers(FEATHER_DIAGNOSTICS, FEATHER_FIX_IMPLEMENTATIONS);

/**
 * Provide a copy of the configured feather diagnostic fixers so callers can iterate without mutating the registry.
 */
export function getFeatherDiagnosticFixers() {
    return new Map(FEATHER_DIAGNOSTIC_FIXERS);
}

function resolveFunctionTagParamList(functionNode, collectionService, sourceText) {
    const serviceComments =
        typeof collectionService?.getComments === "function" ? collectionService.getComments(functionNode) : null;
    const docComments = Array.isArray(serviceComments)
        ? serviceComments
        : Array.isArray(functionNode?.docComments)
          ? functionNode.docComments
          : Array.isArray(functionNode?.comments)
            ? functionNode.comments
            : null;
    if (!Array.isArray(docComments) || docComments.length === 0) {
        return null;
    }

    for (const comment of docComments) {
        if (!comment || comment.type !== "CommentLine") {
            continue;
        }

        const value = typeof comment.value === "string" ? comment.value : null;
        if (!Core.isNonEmptyString(value)) {
            continue;
        }

        const params = Core.extractFunctionTagParams(value);
        if (params.length > 0) {
            cacheFunctionTagParams(functionNode, params);
            return params;
        }
    }

    const fromSource = findFunctionTagParamsFromSource(functionNode, sourceText);
    if (fromSource && fromSource.length > 0) {
        cacheFunctionTagParams(functionNode, fromSource);
        return fromSource;
    }

    return null;
}

function findFunctionTagParamsFromSource(functionNode, sourceText) {
    if (!Core.isNonEmptyString(sourceText)) {
        return null;
    }

    const startLine = Core.getNodeStartLine(functionNode);
    if (!Number.isFinite(startLine)) {
        return null;
    }

    const lines = Core.splitLines(sourceText);
    const startIndex = Math.max(startLine - 2, 0);

    for (let lineIndex = startIndex; lineIndex >= 0; lineIndex -= 1) {
        const line = lines[lineIndex];
        if (!Core.isNonEmptyString(line)) {
            break;
        }

        const trimmed = line.trim();
        if (trimmed.length === 0) {
            break;
        }

        if (!trimmed.startsWith("//")) {
            break;
        }

        const commentValue = trimmed.replace(/^\/\/\s*\/?/, "").trimStart();
        if (commentValue.length === 0) {
            continue;
        }

        const params = Core.extractFunctionTagParams(commentValue);
        if (params.length > 0) {
            return params;
        }
    }

    return null;
}

function cacheFunctionTagParams(functionNode, params) {
    if (!functionNode || typeof functionNode !== "object") {
        return;
    }

    if (Array.isArray(functionNode._functionTagParamNames)) {
        return;
    }

    functionNode._functionTagParamNames = params;
}

function applyOrderedDocNamesToImplicitEntries(functionNode, orderedDocNames, collectionService, sourceText) {
    const entries = functionNode?._featherImplicitArgumentDocEntries;
    const functionTagParams = resolveFunctionTagParamList(functionNode, collectionService, sourceText);
    const resolvedDocNames = functionTagParams ?? orderedDocNames;
    if (!entries || !resolvedDocNames || resolvedDocNames.length === 0) {
        return;
    }

    for (const entry of entries) {
        if (!entry || typeof entry.index !== "number") {
            continue;
        }

        if (entry.index >= resolvedDocNames.length) {
            continue;
        }

        const docName = resolvedDocNames[entry.index];
        if (!docName) {
            continue;
        }

        // Prefer the alias name unless the entry still uses a generic fallback.
        const docNameIsFallback = /^argument\d+$/.test(docName);
        const entryNameIsFallback = /^argument\d+$/.test(entry.name);

        if (entryNameIsFallback) {
            entry.name = docName;
            entry.canonical = docName.toLowerCase();
            continue;
        }

        if (docNameIsFallback && docName !== entry.name) {
            updateJSDocParamName(functionNode, docName, entry.name, collectionService);
        }
    }
}

function fixArgumentReferencesWithinFunction(
    functionNode,
    diagnostic,
    collectionService,
    documentedParamNames,
    sourceText
) {
    const resolvedDocNames = populateDocumentedParamNames({
        functionNode,
        collectionService,
        documentedParamNames,
        sourceText
    });

    const referenceState = collectArgumentReferenceState({
        functionNode,
        diagnostic,
        collectionService,
        documentedParamNames,
        sourceText
    });

    if (referenceState.references.length === 0) {
        return referenceState.fixes;
    }

    const mapping = createArgumentIndexMapping(referenceState.references.map((reference) => reference.index));

    if (!Core.isMapLike(mapping) || !Core.hasIterableItems(mapping)) {
        return referenceState.fixes;
    }

    if (functionNode._featherImplicitArgumentDocEntries) {
        updateImplicitArgumentDocEntryIndices(functionNode, mapping);
        applyOrderedDocNamesToImplicitEntries(functionNode, resolvedDocNames, collectionService, sourceText);
    }

    applyArgumentIndexMappingFixes({
        references: referenceState.references,
        mapping,
        diagnostic,
        fixes: referenceState.fixes
    });

    applyArgumentAliasAndDocFixes({
        functionNode,
        resolvedDocNames,
        mapping,
        references: referenceState.references,
        aliasDeclarations: referenceState.aliasDeclarations,
        documentedParamNames,
        diagnostic,
        fixes: referenceState.fixes
    });

    const promotionPlan = buildImplicitArgumentPromotionPlan({
        references: referenceState.references,
        mapping,
        orderedDocNames: resolvedDocNames,
        aliasDeclarations: referenceState.aliasDeclarations,
        documentedParamNames
    });

    if (promotionPlan) {
        applyImplicitArgumentPromotions({
            references: referenceState.references,
            mapping,
            promotionPlan,
            diagnostic,
            fixes: referenceState.fixes
        });
        maybeInsertImplicitFunctionParameters({
            functionNode,
            promotionPlan
        });
    }

    cleanupSelfAssignments(functionNode.body);

    return referenceState.fixes;
}

type ArgumentReference = { node: any; index: number };

type ArgumentAliasDeclaration = {
    index: number;
    name: string;
    init: any;
    declarator: any;
};

function populateDocumentedParamNames({
    functionNode,
    collectionService,
    documentedParamNames,
    sourceText
}: {
    functionNode: any;
    collectionService: any;
    documentedParamNames: Set<string>;
    sourceText: string | null;
}) {
    const orderedDocNames = functionNode._documentedParamNamesOrdered as string[] | undefined;
    const functionTagParams = resolveFunctionTagParamList(functionNode, collectionService, sourceText);
    const resolvedDocNames = functionTagParams ?? orderedDocNames;

    if (resolvedDocNames && resolvedDocNames.length > 0) {
        for (const name of resolvedDocNames) {
            documentedParamNames.add(name);
        }
    }

    return resolvedDocNames;
}

function collectArgumentReferenceState({
    functionNode,
    diagnostic,
    collectionService,
    documentedParamNames,
    sourceText
}: {
    functionNode: any;
    diagnostic: any;
    collectionService: any;
    documentedParamNames: Set<string>;
    sourceText: string | null;
}) {
    const fixes: any[] = [];
    const references: ArgumentReference[] = [];
    const aliasDeclarations: ArgumentAliasDeclaration[] = [];

    const traverse = (node: any) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const child of node) {
                traverse(child);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "VariableDeclarator") {
            const aliasIndex = getArgumentIdentifierIndex(node.init);

            if (
                typeof aliasIndex === "number" &&
                node.id?.type === "Identifier" &&
                typeof node.id.name === "string" &&
                node.id.name.length > 0
            ) {
                aliasDeclarations.push({
                    index: aliasIndex,
                    name: node.id.name,
                    init: node.init,
                    declarator: node
                });
            }
        }

        if (node !== functionNode && Core.isFunctionLikeNode(node)) {
            const nestedFixes = fixArgumentReferencesWithinFunction(
                node,
                diagnostic,
                collectionService,
                documentedParamNames,
                sourceText
            );

            if (Core.isNonEmptyArray(nestedFixes)) {
                fixes.push(...nestedFixes);
            }

            return;
        }

        const argumentIndex = getArgumentIdentifierIndex(node);

        if (typeof argumentIndex === "number") {
            references.push({ node, index: argumentIndex });
            return;
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                traverse(value);
            }
        }
    };

    const body = functionNode?.body;
    if (body && typeof body === "object") {
        traverse(body);
    } else {
        traverse(functionNode);
    }

    return { fixes, references, aliasDeclarations };
}

function applyArgumentIndexMappingFixes({
    references,
    mapping,
    diagnostic,
    fixes
}: {
    references: ArgumentReference[];
    mapping: Map<any, any>;
    diagnostic: any;
    fixes: any[];
}) {
    for (const reference of references) {
        const newIndex = mapping.get(reference.index);

        if (typeof newIndex !== "number" || newIndex === reference.index) {
            continue;
        }

        const newName = `argument${newIndex}`;
        const fixDetail = createFeatherFixDetail(diagnostic, {
            target: newName,
            range: {
                start: Core.getNodeStartIndex(reference.node),
                end: Core.getNodeEndIndex(reference.node)
            }
        });

        if (!fixDetail) {
            continue;
        }

        reference.node.name = newName;
        attachFeatherFixMetadata(reference.node, [fixDetail]);
        fixes.push(fixDetail);
    }
}

function applyArgumentAliasAndDocFixes({
    functionNode,
    resolvedDocNames,
    mapping,
    references,
    aliasDeclarations,
    documentedParamNames,
    diagnostic,
    fixes
}: {
    functionNode: any;
    resolvedDocNames: string[] | undefined;
    mapping: Map<any, any>;
    references: ArgumentReference[];
    aliasDeclarations: ArgumentAliasDeclaration[];
    documentedParamNames: Set<string>;
    diagnostic: any;
    fixes: any[];
}) {
    if (documentedParamNames.size === 0) {
        return;
    }

    const normalizedDocNames = new Set([...documentedParamNames].map(Core.normalizeDocParamNameForComparison));

    const aliasInfos = aliasDeclarations
        .map((alias) => {
            const mappedIndex = mapping.get(alias.index);
            const normalizedAliasName = typeof alias.name === "string" ? alias.name : null;

            return {
                index: typeof mappedIndex === "number" ? mappedIndex : alias.index,
                name: normalizedAliasName,
                init: alias.init,
                declarator: alias.declarator
            };
        })
        .filter(
            (alias) =>
                typeof alias.index === "number" &&
                typeof alias.name === "string" &&
                alias.name.length > 0 &&
                normalizedDocNames.has(Core.normalizeDocParamNameForComparison(alias.name))
        );

    if (aliasInfos.length === 0 && (!resolvedDocNames || resolvedDocNames.length === 0)) {
        return;
    }

    const aliasByIndex = new Map();
    const aliasInitNodes = new Set();

    for (const alias of aliasInfos) {
        aliasByIndex.set(alias.index, alias);
        if (alias.init) {
            aliasInitNodes.add(alias.init);
        }
    }

    for (const reference of references) {
        const normalizedIndex = mapping.has(reference.index) ? mapping.get(reference.index) : reference.index;
        const alias = aliasByIndex.get(normalizedIndex);

        let newName = null;
        let sourceNode = null;

        if (resolvedDocNames && normalizedIndex < resolvedDocNames.length) {
            newName = resolvedDocNames[normalizedIndex];
        } else if (alias && !aliasInitNodes.has(reference.node)) {
            newName = alias.name;
            sourceNode = alias.declarator;
        }

        if (!newName) {
            continue;
        }

        if (reference.node?.type !== "Identifier") {
            continue;
        }

        if (reference.node.name === newName) {
            continue;
        }

        if (sourceNode) {
            const aliasStart = Core.getNodeStartIndex(sourceNode);
            const referenceStart = Core.getNodeStartIndex(reference.node);

            if (typeof aliasStart === "number" && typeof referenceStart === "number" && referenceStart < aliasStart) {
                continue;
            }
        }

        const fixDetail = createFeatherFixDetail(diagnostic, {
            target: newName,
            range: {
                start: Core.getNodeStartIndex(reference.node),
                end: Core.getNodeEndIndex(reference.node)
            }
        });

        if (fixDetail) {
            attachFeatherFixMetadata(reference.node, [fixDetail]);
            fixes.push(fixDetail);
        }

        reference.node.name = newName;
    }

    if (!functionNode._featherImplicitArgumentDocEntries) {
        return;
    }

    const remainingDirectRefIndices = new Set();

    for (const reference of references) {
        if (aliasInitNodes.has(reference.node)) {
            continue;
        }

        if (/^argument\d+$/.test(reference.node.name)) {
            const normalizedIndex = mapping.has(reference.index) ? mapping.get(reference.index) : reference.index;
            remainingDirectRefIndices.add(normalizedIndex);
        }
    }

    for (const entry of functionNode._featherImplicitArgumentDocEntries) {
        if (entry && typeof entry.index === "number" && !remainingDirectRefIndices.has(entry.index)) {
            entry.hasDirectReference = false;
        }
    }
}

function applyImplicitArgumentPromotions({
    references,
    mapping,
    promotionPlan,
    diagnostic,
    fixes
}: {
    references: ArgumentReference[];
    mapping: Map<any, any>;
    promotionPlan: any;
    diagnostic: any;
    fixes: any[];
}) {
    const { names } = promotionPlan;

    for (const reference of references) {
        const normalizedIndex = mapping.has(reference.index) ? mapping.get(reference.index) : reference.index;
        if (typeof normalizedIndex !== "number" || normalizedIndex < 0 || normalizedIndex >= names.length) {
            continue;
        }

        const newName = names[normalizedIndex];
        if (!newName) {
            continue;
        }

        const referenceNode = reference.node;
        if (!referenceNode || typeof referenceNode !== "object") {
            continue;
        }

        if (referenceNode.type === "Identifier") {
            if (referenceNode.name === newName) {
                continue;
            }
            referenceNode.name = newName;
        } else if (
            referenceNode.type === "MemberIndexExpression" &&
            Core.isIdentifierWithName(referenceNode.object, "argument")
        ) {
            referenceNode.type = "Identifier";
            referenceNode.name = newName;
            delete referenceNode.object;
            delete referenceNode.property;
            delete referenceNode.accessor;
        } else {
            continue;
        }

        const fixDetail = createFeatherFixDetail(diagnostic, {
            target: newName,
            range: {
                start: Core.getNodeStartIndex(referenceNode),
                end: Core.getNodeEndIndex(referenceNode)
            }
        });

        if (fixDetail) {
            attachFeatherFixMetadata(referenceNode, [fixDetail]);
            fixes.push(fixDetail);
        }
    }
}

function maybeInsertImplicitFunctionParameters({ functionNode, promotionPlan }) {
    if (!functionNode || !promotionPlan) {
        return;
    }

    const existingParams = Array.isArray(functionNode.params) ? functionNode.params : [];
    if (existingParams.length > 0) {
        return;
    }

    const { names, aliasByIndex } = promotionPlan;
    if (!Array.isArray(names) || names.length === 0) {
        return;
    }

    const nextParams = [];
    for (const [index, name] of names.entries()) {
        if (!name) {
            return;
        }

        const alias = aliasByIndex.get(index);
        const templateNode = alias?.declarator?.id ?? alias?.declarator ?? functionNode ?? null;
        const identifier = Core.createIdentifierNode(name, templateNode);
        if (!identifier) {
            return;
        }

        nextParams.push(identifier);
    }

    functionNode.params = nextParams;
}

function buildImplicitArgumentPromotionPlan({
    references,
    mapping,
    orderedDocNames,
    aliasDeclarations,
    documentedParamNames
}) {
    if (!Array.isArray(references) || references.length === 0) {
        return null;
    }

    if (!Core.isMapLike(mapping) || !Core.hasIterableItems(mapping)) {
        return null;
    }

    const normalizedIndices = [];
    for (const reference of references) {
        if (!reference || typeof reference.index !== "number") {
            continue;
        }

        const normalizedIndex = mapping.has(reference.index) ? mapping.get(reference.index) : reference.index;

        if (typeof normalizedIndex === "number" && normalizedIndex >= 0) {
            normalizedIndices.push(normalizedIndex);
        }
    }

    if (normalizedIndices.length === 0) {
        return null;
    }

    const maxIndex = Math.max(...normalizedIndices);
    if (!Number.isInteger(maxIndex) || maxIndex < 0) {
        return null;
    }

    const aliasByIndex = new Map();
    for (const alias of aliasDeclarations ?? []) {
        if (!alias || typeof alias.index !== "number") {
            continue;
        }

        const normalizedIndex = mapping.has(alias.index) ? mapping.get(alias.index) : alias.index;

        if (
            typeof normalizedIndex !== "number" ||
            normalizedIndex < 0 ||
            typeof alias.name !== "string" ||
            alias.name.length === 0
        ) {
            continue;
        }

        aliasByIndex.set(normalizedIndex, alias);
    }

    const hasDocumentedNames = documentedParamNames && documentedParamNames.size > 0;
    const names = [];

    for (let index = 0; index <= maxIndex; index += 1) {
        const docName =
            hasDocumentedNames && Array.isArray(orderedDocNames) && index < orderedDocNames.length
                ? orderedDocNames[index]
                : null;
        const alias = aliasByIndex.get(index);

        const preferredDocName = normalizeImplicitParamName(docName);
        const preferredAliasName = normalizeImplicitParamName(alias?.name);
        const chosenName = preferredDocName ?? preferredAliasName;

        if (!chosenName) {
            return null;
        }

        names.push(chosenName);
    }

    return { names, aliasByIndex };
}

function normalizeImplicitParamName(name: unknown): string | null {
    const normalized = Core.getNonEmptyTrimmedString(name);
    if (!normalized) {
        return null;
    }

    if (/^argument\\d+$/i.test(normalized)) {
        return null;
    }

    return normalized;
}

function createArgumentIndexMapping(indices: unknown[]) {
    if (!Core.isNonEmptyArray(indices)) {
        return null;
    }

    const uniqueIndices = (
        [
            ...new Set(
                indices.filter(
                    (index): index is number => typeof index === "number" && Number.isInteger(index) && index >= 0
                )
            )
        ] as number[]
    ).sort((left, right) => left - right);

    if (uniqueIndices.length === 0) {
        return null;
    }

    const mapping = new Map();
    let expectedIndex = 0;

    for (const index of uniqueIndices) {
        if (!Number.isInteger(index) || index < 0) {
            continue;
        }

        if (index === expectedIndex) {
            mapping.set(index, index);
            expectedIndex = index + 1;
            continue;
        }

        if (index > expectedIndex) {
            mapping.set(index, expectedIndex);
            expectedIndex += 1;
            continue;
        }

        mapping.set(index, expectedIndex);
        expectedIndex += 1;
    }

    return mapping;
}

function getArgumentIdentifierIndex(node) {
    if (node?.type === "MemberIndexExpression" && Core.isIdentifierWithName(node.object, "argument")) {
        const propertyEntry = Core.getSingleMemberIndexPropertyEntry(node);
        if (!propertyEntry) {
            return null;
        }

        const indexText = Core.getMemberIndexText(propertyEntry);
        if (indexText === null) {
            return null;
        }

        const parsed = Number.parseInt(String(indexText), 10);
        return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
    }

    const identifierDetails = Core.getIdentifierDetails(node);
    if (!identifierDetails) {
        return null;
    }

    const match = Core.GML_ARGUMENT_IDENTIFIER_PATTERN.exec(identifierDetails.name);

    if (!match) {
        return null;
    }

    const parsed = Number.parseInt(match[1]);

    if (!Number.isInteger(parsed) || parsed < 0) {
        return null;
    }

    return parsed;
}

function removeDuplicateMacroDeclarations({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];
    const seenMacros = new Set();

    const visit = (node, parent = null, property = null) => {
        if (!node) {
            return false;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                const child = node[index];
                const removed = visit(child, node, index);

                if (removed) {
                    index -= 1;
                }
            }

            return false;
        }

        if (typeof node !== "object") {
            return false;
        }

        if (node.type === "MacroDeclaration") {
            const macroName = node.name?.name;

            if (!macroName) {
                return false;
            }

            if (!seenMacros.has(macroName)) {
                seenMacros.add(macroName);
                return false;
            }

            if (!Array.isArray(parent) || typeof property !== "number") {
                return false;
            }

            const fixDetail = createFeatherFixDetail(diagnostic, {
                target: macroName,
                range: {
                    start: Core.getNodeStartIndex(node),
                    end: Core.getNodeEndIndex(node)
                }
            });

            if (!fixDetail) {
                return false;
            }

            parent.splice(property, 1);
            fixes.push(fixDetail);

            return true;
        }

        Core.forEachNodeChild(node, (value, key) => {
            visit(value, node, key);
        });

        return false;
    };

    visit(ast);

    return fixes;
}

function replaceDeprecatedBuiltinVariables({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object" || DEPRECATED_BUILTIN_VARIABLE_REPLACEMENTS.size === 0) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property, owner, ownerKey) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index, owner, ownerKey);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "Identifier") {
            const fix = replaceDeprecatedIdentifier(node, parent, property, owner, ownerKey, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        Core.forEachNodeChild(node, (value, key) => {
            visit(value, node, key, node, key);
        });
    };

    visit(ast, null, null, null, null);

    return fixes;
}

function replaceDeprecatedIdentifier(node, parent, property, owner, ownerKey, diagnostic) {
    const identifierDetails = Core.getIdentifierDetails(node);
    if (!identifierDetails) {
        return null;
    }

    const normalizedName = Core.toNormalizedLowerCaseString(identifierDetails.name);

    if (!normalizedName || normalizedName.length === 0) {
        return null;
    }

    const replacementEntry = Core.getDeprecatedBuiltinReplacementEntry(normalizedName);

    if (!replacementEntry) {
        return null;
    }

    if (
        shouldSkipDeprecatedIdentifierReplacement({
            parent,
            property,
            owner,
            ownerKey
        })
    ) {
        return null;
    }

    const originalName = node.name;
    const replacementName = replacementEntry.replacement;

    if (!replacementName || replacementName === originalName) {
        return null;
    }

    node.name = replacementName;

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: replacementEntry.deprecated ?? originalName,
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

function shouldSkipDeprecatedIdentifierReplacement({ parent, property, owner, ownerKey }) {
    if (!parent) {
        return false;
    }

    if (parent.type === "MemberDotExpression" && property === "property") {
        return true;
    }

    if (parent.type === "VariableDeclarator" && property === "id") {
        return true;
    }

    if (parent.type === "MacroDeclaration" && property === "name") {
        return true;
    }

    if (parent.type === "EnumDeclaration" && property === "name") {
        return true;
    }

    if (parent.type === "EnumMember" && property === "name") {
        return true;
    }

    if (Array.isArray(parent) && ownerKey === "params") {
        const ownerType = owner?.type;

        if (
            ownerType === "FunctionDeclaration" ||
            ownerType === "FunctionExpression" ||
            ownerType === "ConstructorDeclaration"
        ) {
            return true;
        }
    }

    return false;
}

function rewriteInvalidPostfixExpressions({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent = null, property = null) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "IncDecStatement") {
            const fix = rewritePostfixStatement(node, parent, property, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        Core.forEachNodeChild(node, (value, key) => {
            visit(value, node, key);
        });
    };

    visit(ast);

    return fixes;
}

function rewritePostfixStatement(node, parent, property, diagnostic) {
    if (!hasArrayParentWithNumericIndex(parent, property)) {
        return null;
    }

    if (!node || node.type !== "IncDecStatement" || node.prefix !== false) {
        return null;
    }

    const argument = node.argument;

    if (!argument || typeof argument !== "object") {
        return null;
    }

    const argumentName = Core.getIdentifierName(argument);

    if (typeof argumentName === "string" && argumentName.startsWith("__featherFix_")) {
        return null;
    }

    const siblings = parent;
    const temporaryName = createTemporaryIdentifierName(argument, siblings);

    if (!temporaryName) {
        return null;
    }

    const initializer = Core.cloneAstNode(argument);
    const declarationIdentifier = Core.createIdentifierNode(temporaryName, argument);

    if (!initializer || !declarationIdentifier) {
        return null;
    }

    const declarator = {
        type: "VariableDeclarator",
        id: declarationIdentifier,
        init: initializer
    };

    // Preserve location metadata from the argument into the declarator
    Core.assignClonedLocation(declarator as any, argument);

    const variableDeclaration = {
        type: "VariableDeclaration",
        declarations: [declarator],
        kind: "var"
    };

    // Preserve location metadata from the original node onto the synthetic declaration
    Core.assignClonedLocation(variableDeclaration as any, node);

    const temporaryIdentifier = Core.createIdentifierNode(temporaryName, argument);

    if (!temporaryIdentifier) {
        return null;
    }

    const rewrittenStatement = {
        type: "IncDecStatement",
        operator: node.operator,
        prefix: node.prefix,
        argument: temporaryIdentifier
    };

    if (Object.hasOwn(node, "start")) {
        Core.assignClonedLocation(rewrittenStatement as any, node);
    }

    if (Object.hasOwn(node, "end")) {
        Core.assignClonedLocation(rewrittenStatement as any, node);
    }

    copyCommentMetadata(node, variableDeclaration);
    copyCommentMetadata(node, rewrittenStatement);

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: Core.getIdentifierName(argument),
        range: {
            start: Core.getNodeStartIndex(node),
            end: Core.getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    parent.splice(property, 1, variableDeclaration, rewrittenStatement);

    attachFeatherFixMetadata(variableDeclaration, [fixDetail]);
    attachFeatherFixMetadata(rewrittenStatement, [fixDetail]);

    return fixDetail;
}

function normalizeMultidimensionalArrayIndexing({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent = null, property = null) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "MemberIndexExpression") {
            const fix = convertMultidimensionalMemberIndex(node, parent, property, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast);

    return fixes;
}

function convertMultidimensionalMemberIndex(node, parent, property, diagnostic) {
    if (!Array.isArray(parent) && (typeof parent !== "object" || parent === null)) {
        return null;
    }

    if (property == null) {
        return null;
    }

    if (!node || node.type !== "MemberIndexExpression") {
        return null;
    }

    const indices = Array.isArray(node.property) ? node.property : null;

    if (node.accessor && node.accessor !== "[") {
        // Non-standard accessors such as '[#' (ds_grid) use comma-separated
        // coordinates rather than nested lookups. Leave them unchanged so the
        // grid access semantics remain intact.
        return null;
    }

    if (!indices || indices.length <= 1) {
        return null;
    }

    const nestedExpression = buildNestedMemberIndexExpression({
        object: node.object,
        indices,
        template: node
    });

    if (!nestedExpression) {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: getMemberExpressionRootIdentifier(node) ?? null,
        range: {
            start: Core.getNodeStartIndex(node),
            end: Core.getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    copyCommentMetadata(node, nestedExpression);

    if (Array.isArray(parent)) {
        parent[property] = nestedExpression;
    } else if (Core.isObjectLike(parent)) {
        parent[property] = nestedExpression;
    }

    attachFeatherFixMetadata(nestedExpression, [fixDetail]);

    return fixDetail;
}

function buildNestedMemberIndexExpression({ object, indices, template }) {
    if (!object || !Core.isNonEmptyArray(indices)) {
        return null;
    }

    const [firstIndex, ...remaining] = indices;
    const accessor = template?.accessor ?? "[";

    let current = {
        type: "MemberIndexExpression",
        object,
        property: [firstIndex],
        accessor
    };

    if (Object.hasOwn(template, "start")) {
        Core.assignClonedLocation(current as any, template);
    }

    if (remaining.length === 0 && Object.hasOwn(template, "end")) {
        Core.assignClonedLocation(current as any, template);
    }

    for (let index = 0; index < remaining.length; index += 1) {
        const propertyNode = remaining[index];

        const next = {
            type: "MemberIndexExpression",
            object: current,
            property: [propertyNode],
            accessor
        };

        if (Object.hasOwn(template, "start")) {
            Core.assignClonedLocation(next as any, template);
        }

        if (index === remaining.length - 1 && Object.hasOwn(template, "end")) {
            Core.assignClonedLocation(next as any, template);
        }

        current = next;
    }

    return current;
}

function getMemberExpressionRootIdentifier(node) {
    if (!node || typeof node !== "object") {
        return null;
    }

    if (node.type === "Identifier") {
        return node.name ?? null;
    }

    if (node.type === "MemberDotExpression" || node.type === "MemberIndexExpression") {
        return getMemberExpressionRootIdentifier(node.object);
    }

    if (node.type === "CallExpression") {
        return getMemberExpressionRootIdentifier(node.object);
    }

    return null;
}

function normalizeObviousSyntaxErrors({ ast, diagnostic, metadata }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const gm1100Entries = Core.asArray(metadata?.GM1100);

    if (gm1100Entries.length === 0) {
        return [];
    }

    const nodeIndex = collectGM1100Candidates(ast);
    const handledNodes = new Set();
    const fixes = [];

    for (const entry of gm1100Entries) {
        if (!Core.isNode(entry)) {
            continue;
        }

        const lineNumber = typeof (entry as any).line === "number" ? (entry as any).line : undefined;
        if (lineNumber === undefined) continue;

        const candidates = nodeIndex.get(lineNumber) ?? [];
        let node = null;

        if ((entry as any).type === "declaration") {
            node = candidates.find((candidate) => candidate?.type === "VariableDeclaration") ?? null;
        } else if ((entry as any).type === "assignment") {
            node = candidates.find((candidate) => candidate?.type === "AssignmentExpression") ?? null;
        }

        if (!node || handledNodes.has(node)) {
            continue;
        }

        handledNodes.add(node);

        const fixDetail = createFeatherFixDetail(diagnostic, {
            target: (entry as any).identifier ?? null,
            range: {
                start: Core.getNodeStartIndex(node),
                end: Core.getNodeEndIndex(node)
            }
        });

        if (!fixDetail) {
            continue;
        }

        attachFeatherFixMetadata(node, [fixDetail]);
        fixes.push(fixDetail);
    }

    return fixes;
}

function removeTrailingMacroSemicolons({ ast, sourceText, diagnostic }) {
    if (!hasFeatherSourceTextContext(ast, diagnostic, sourceText)) {
        return [];
    }

    const fixes = [];

    const visit = (node) => {
        if (!node || typeof node !== "object") {
            return;
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                visit(item);
            }
            return;
        }

        if (node.type === "MacroDeclaration") {
            const fixInfo = sanitizeMacroDeclaration(node, sourceText, diagnostic);
            if (fixInfo) {
                registerSanitizedMacroName(ast, node?.name?.name);
                fixes.push(fixInfo);
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

function removeBooleanLiteralStatements({ ast, diagnostic, metadata }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];
    const gm1016MetadataEntries = extractFeatherPreprocessMetadata(metadata, "GM1016");

    for (const entry of gm1016MetadataEntries) {
        const range = normalizePreprocessedRange(entry);

        if (!range) {
            continue;
        }

        const fixDetail = createFeatherFixDetail(diagnostic, {
            target: null,
            range
        });

        if (!fixDetail) {
            continue;
        }

        const owner = findInnermostBlockForRange(ast, range.start.index, range.end.index);

        if (owner && owner !== ast) {
            attachFeatherFixMetadata(owner, [fixDetail]);
        }

        fixes.push(fixDetail);
    }

    const arrayOwners = new WeakMap();

    const visitNode = (node) => {
        if (!node || typeof node !== "object") {
            return;
        }

        for (const value of Object.values(node)) {
            if (!value || typeof value !== "object") {
                continue;
            }

            if (Array.isArray(value)) {
                arrayOwners.set(value, node);
                visitArray(value);
                continue;
            }

            visitNode(value);
        }
    };

    const visitArray = (array) => {
        if (!Array.isArray(array)) {
            return;
        }

        for (let index = 0; index < array.length; index += 1) {
            const item = array[index];

            if (item && typeof item === "object" && item.type === "ExpressionStatement") {
                const fix = removeBooleanLiteralExpression(item, array, index);

                if (fix) {
                    const owner = arrayOwners.get(array) ?? ast;
                    if (owner !== ast) {
                        attachFeatherFixMetadata(owner, [fix]);
                    }
                    fixes.push(fix);
                    array.splice(index, 1);
                    index -= 1;
                    continue;
                }
            }

            visitNode(item);
        }
    };

    function removeBooleanLiteralExpression(node, parentArray = null, index = -1) {
        if (!parentArray || !Array.isArray(parentArray) || index < 0) {
            return null;
        }

        const expression = node.expression;

        if (!Core.isBooleanLiteral(expression, true)) {
            return null;
        }

        const fixDetail = createFeatherFixDetail(diagnostic, {
            target: null,
            range: {
                start: Core.getNodeStartIndex(node),
                end: Core.getNodeEndIndex(node)
            }
        });

        if (!fixDetail) {
            return null;
        }

        return fixDetail;
    }

    visitNode(ast);

    if (fixes.length === 0) {
        return [];
    }

    return fixes;
}

function replaceDeprecatedConstantReferences({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const metadata = extractDeprecatedConstantReplacement(diagnostic);

    if (!metadata) {
        return [];
    }

    const { deprecatedConstant, replacementConstant } = metadata;

    if (!deprecatedConstant || !replacementConstant) {
        return [];
    }

    const fixes = [];

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                visit(item);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "Identifier" && node.name === deprecatedConstant) {
            const start = Core.getNodeStartIndex(node);
            const end = Core.getNodeEndIndex(node);

            const fixDetail = createFeatherFixDetail(diagnostic, {
                target: replacementConstant,
                range: typeof start === "number" && typeof end === "number" ? { start, end } : null
            });

            if (!fixDetail) {
                return;
            }

            node.name = replacementConstant;
            attachFeatherFixMetadata(node, [fixDetail]);
            fixes.push(fixDetail);
            return;
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

function extractDeprecatedConstantReplacement(diagnostic) {
    if (!diagnostic) {
        return null;
    }

    const badExample = typeof diagnostic.badExample === "string" ? diagnostic.badExample : "";
    const correction = typeof diagnostic.correction === "string" ? diagnostic.correction : "";
    const goodExample = typeof diagnostic.goodExample === "string" ? diagnostic.goodExample : "";

    const deprecatedMatch = badExample.match(/Constant\s+'([A-Za-z_][A-Za-z0-9_]*)'\s+is\s+deprecated/);
    const replacementFromCorrection = correction.match(
        /\b(?:modern|replacement)\s+constant\s+is\s+([A-Za-z_][A-Za-z0-9_]*)\b/i
    );

    let deprecatedConstant = deprecatedMatch?.[1] ?? null;
    let replacementConstant = replacementFromCorrection?.[1] ?? null;

    if (!replacementConstant) {
        const replacementFromGoodExample = findReplacementConstantInExample({
            goodExample,
            badExample,
            deprecatedConstant
        });

        if (replacementFromGoodExample) {
            replacementConstant = replacementFromGoodExample;
        }
    }

    if (!deprecatedConstant) {
        deprecatedConstant = findDeprecatedConstantInExample({
            badExample,
            goodExample,
            replacementConstant
        });
    }

    if (!deprecatedConstant || !replacementConstant) {
        return null;
    }

    return { deprecatedConstant, replacementConstant };
}

function collectIdentifiers(example) {
    if (typeof example !== "string" || example.length === 0) {
        return new Set();
    }

    const matches = example.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g);

    if (!Array.isArray(matches)) {
        return new Set();
    }

    return new Set(matches);
}

function isLikelyConstant(identifier) {
    if (typeof identifier !== "string" || identifier.length === 0) {
        return false;
    }

    if (/^[A-Z0-9_]+$/.test(identifier)) {
        return true;
    }

    if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(identifier)) {
        return true;
    }

    return false;
}

function findReplacementConstantInExample({ goodExample, badExample, deprecatedConstant }) {
    const goodIdentifiers = collectIdentifiers(goodExample);
    const badIdentifiers = collectIdentifiers(badExample);

    for (const identifier of goodIdentifiers) {
        if (identifier === deprecatedConstant) {
            continue;
        }

        if (badIdentifiers.has(identifier)) {
            continue;
        }

        if (isLikelyConstant(identifier)) {
            return identifier;
        }
    }

    return null;
}

function findDeprecatedConstantInExample({ badExample, goodExample, replacementConstant }) {
    const badIdentifiers = collectIdentifiers(badExample);
    const goodIdentifiers = collectIdentifiers(goodExample);

    for (const identifier of badIdentifiers) {
        if (identifier === replacementConstant) {
            continue;
        }

        if (goodIdentifiers.has(identifier)) {
            continue;
        }

        if (isLikelyConstant(identifier)) {
            return identifier;
        }
    }

    return null;
}

function extractFeatherPreprocessMetadata(metadata, key) {
    if (!metadata || typeof metadata !== "object") {
        return [];
    }

    const entries = metadata[key];

    return Core.compactArray(entries);
}

function normalizePreprocessedRange(entry) {
    const startIndex = entry?.start?.index;
    const endIndex = entry?.end?.index;

    if (typeof startIndex !== "number" || typeof endIndex !== "number") {
        return null;
    }

    if (endIndex < startIndex) {
        return null;
    }

    const startLine = entry?.start?.line;
    const endLine = entry?.end?.line;

    const startLocation: { index: number; line?: number } = {
        index: startIndex
    };
    const endLocation: { index: number; line?: number } = { index: endIndex };

    if (typeof startLine === "number") {
        startLocation.line = startLine;
    }

    if (typeof endLine === "number") {
        endLocation.line = endLine;
    }

    return { start: startLocation, end: endLocation };
}

function findInnermostBlockForRange(ast, startIndex, endIndex) {
    if (!ast || typeof ast !== "object") {
        return null;
    }

    let bestMatch = null;

    const visit = (node) => {
        if (!node || typeof node !== "object") {
            return;
        }

        const nodeStart = Core.getNodeStartIndex(node);
        const nodeEnd = Core.getNodeEndIndex(node);

        if (
            typeof nodeStart !== "number" ||
            typeof nodeEnd !== "number" ||
            nodeStart > startIndex ||
            nodeEnd < endIndex
        ) {
            return;
        }

        if (node.type === "BlockStatement") {
            if (bestMatch) {
                const bestStart = Core.getNodeStartIndex(bestMatch);
                const bestEnd = Core.getNodeEndIndex(bestMatch);

                if (
                    typeof bestStart === "number" &&
                    typeof bestEnd === "number" &&
                    (nodeStart > bestStart || nodeEnd < bestEnd)
                ) {
                    bestMatch = node;
                }
            } else {
                bestMatch = node;
            }
        }

        for (const value of Object.values(node)) {
            if (Array.isArray(value)) {
                for (const item of value) {
                    visit(item);
                }
                continue;
            }

            visit(value);
        }
    };

    visit(ast);

    return bestMatch;
}

function hasDisabledColourChannel(args) {
    if (!Array.isArray(args)) {
        return false;
    }

    const channels = args.slice(0, 4);

    return channels.some((argument) => isLiteralFalse(argument));
}

function sanitizeMacroDeclaration(node, sourceText, diagnostic) {
    if (!node || typeof node !== "object") {
        return null;
    }

    const tokens = Array.isArray(node.tokens) ? node.tokens : null;
    if (!tokens || tokens.length === 0) {
        return null;
    }

    const lastToken = tokens.at(-1);
    if (lastToken !== ";") {
        return null;
    }

    const startIndex = node.start?.index;
    const endIndex = node.end?.index;

    if (typeof startIndex !== "number" || typeof endIndex !== "number") {
        return null;
    }

    const originalText = sourceText.slice(startIndex, endIndex + 1);

    // Remove trailing semicolons from Feather macro definitions because the macro
    // preprocessor already appends a semicolon during expansion. Leaving the source
    // semicolon in place would double-terminate statements, causing syntax errors
    // or unexpected expression boundaries. We only strip semicolons at the macro's
    // end to preserve semicolons that appear within the macro body itself.
    const sanitizedText = originalText.replace(TRAILING_MACRO_SEMICOLON_PATTERN, "");

    if (sanitizedText === originalText) {
        return null;
    }

    node.tokens = tokens.slice(0, -1);
    node._featherMacroText = sanitizedText;

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: node.name?.name ?? null,
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

function registerSanitizedMacroName(ast, macroName) {
    if (!ast || typeof ast !== "object" || ast.type !== "Program") {
        return;
    }

    if (typeof macroName !== "string" || macroName.length === 0) {
        return;
    }

    const registry = Core.ensureSet(ast._featherSanitizedMacroNames);

    registry.add(macroName);
    ast._featherSanitizedMacroNames = registry;
}

function ensureVarDeclarationsAreTerminated({ ast, sourceText, diagnostic }) {
    if (!hasFeatherSourceTextContext(ast, diagnostic, sourceText)) {
        return [];
    }

    const fixes = [];

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                visit(item);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (Core.isVarVariableDeclaration(node)) {
            const fix = ensureVarDeclarationIsTerminated(node, ast, sourceText, diagnostic);

            if (fix) {
                fixes.push(fix);
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

function ensureVarDeclarationIsTerminated(node, ast, sourceText, diagnostic) {
    if (!node || node.type !== "VariableDeclaration" || node.kind !== "var") {
        return null;
    }

    if (variableDeclarationHasTerminatingSemicolon(node, sourceText)) {
        return null;
    }

    const target = extractVariableDeclarationTarget(node);

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target,
        range: {
            start: Core.getNodeStartIndex(node),
            end: Core.getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    preserveTrailingCommentAlignmentForVarDeclaration({
        declaration: node,
        ast,
        sourceText
    });

    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

function extractVariableDeclarationTarget(node) {
    if (!node || node.type !== "VariableDeclaration") {
        return null;
    }

    const declarations = Array.isArray(node.declarations) ? node.declarations : [];

    if (declarations.length === 0) {
        return null;
    }

    const [firstDeclarator] = declarations;
    const identifier = firstDeclarator?.id;

    if (!identifier || identifier.type !== "Identifier") {
        return null;
    }

    return identifier.name ?? null;
}

function variableDeclarationHasTerminatingSemicolon(node, sourceText) {
    if (!node || node.type !== "VariableDeclaration" || typeof sourceText !== "string") {
        return true;
    }

    const length = sourceText.length;
    if (length === 0) {
        return true;
    }

    const searchStart = Core.getNodeEndIndex(node);

    if (typeof searchStart !== "number") {
        return true;
    }

    let index = searchStart;

    while (index < length) {
        const char = sourceText[index];

        if (char === ";") {
            return true;
        }

        if (char === " " || char === "\t" || char === "\v" || char === "\f") {
            index += 1;
            continue;
        }

        if (char === "\r") {
            return false;
        }

        if (char === "\n") {
            return false;
        }

        if (char === "/") {
            const nextChar = sourceText[index + 1];

            if (nextChar === "/") {
                return false;
            }

            if (nextChar === "*") {
                const closingIndex = sourceText.indexOf("*/", index + 2);

                if (closingIndex === -1) {
                    return false;
                }

                index = closingIndex + 2;
                continue;
            }

            return false;
        }

        if (char === "\u2028" || char === "\u2029") {
            return false;
        }

        if (char && char.trim() === "") {
            index += 1;
            continue;
        }

        return false;
    }

    return false;
}

function preserveTrailingCommentAlignmentForVarDeclaration({ declaration, ast, sourceText }) {
    if (
        !declaration ||
        declaration.type !== "VariableDeclaration" ||
        typeof sourceText !== "string" ||
        sourceText.length === 0 ||
        !ast ||
        typeof ast !== "object"
    ) {
        return;
    }

    const commentStartIndex = findLineCommentStartIndexAfterDeclaration(declaration, sourceText);

    if (commentStartIndex == null) {
        return;
    }

    const comment = findLineCommentStartingAt(ast, commentStartIndex);

    if (!comment) {
        return;
    }

    const inlinePadding = computeTrailingCommentInlinePadding(declaration, commentStartIndex, sourceText);

    markCommentForTrailingPaddingPreservation(comment, inlinePadding);
}

function findLineCommentStartIndexAfterDeclaration(declaration, sourceText) {
    const endIndex = Core.getNodeEndIndex(declaration);

    if (typeof endIndex !== "number") {
        return null;
    }

    const length = sourceText.length;

    for (let index = endIndex; index < length; index += 1) {
        const char = sourceText[index];

        if (char === " " || char === "\t" || char === "\v" || char === "\f") {
            continue;
        }

        if (char === "\r" || char === "\n" || char === "\u2028" || char === "\u2029") {
            return null;
        }

        if (char === "/" && sourceText[index + 1] === "/") {
            return index;
        }

        return null;
    }

    return null;
}

function findLineCommentStartingAt(ast, startIndex) {
    if (typeof startIndex !== "number" || startIndex < 0) {
        return null;
    }

    const comments = Core.collectCommentNodes(ast);

    if (comments.length === 0) {
        return null;
    }

    for (const comment of comments) {
        if (comment?.type !== "CommentLine") {
            continue;
        }

        const commentStartIndex = Core.getNodeStartIndex(comment);

        if (typeof commentStartIndex !== "number") {
            continue;
        }

        if (commentStartIndex === startIndex) {
            return comment;
        }
    }

    return null;
}

function computeTrailingCommentInlinePadding(declaration, commentStartIndex, sourceText) {
    if (!declaration || typeof commentStartIndex !== "number" || typeof sourceText !== "string") {
        return null;
    }

    const declarationEnd = Core.getNodeEndIndex(declaration);
    if (typeof declarationEnd !== "number") {
        return null;
    }

    const padding = commentStartIndex - declarationEnd;
    return Math.max(padding, 0);
}

function markCommentForTrailingPaddingPreservation(comment, inlinePadding = null) {
    if (!comment || typeof comment !== "object") {
        return;
    }

    const key = "_featherPreserveTrailingPadding";

    if (comment[key] === true) {
        return;
    }

    Object.defineProperty(comment, key, {
        configurable: true,
        enumerable: false,
        writable: true,
        value: true
    });

    if (typeof inlinePadding === "number" && inlinePadding >= 0) {
        const previousPadding = comment.inlinePadding;
        comment.inlinePadding =
            typeof previousPadding === "number" ? Math.max(previousPadding, inlinePadding) : inlinePadding;
    }
}
function markStatementToSuppressFollowingEmptyLine(statement) {
    if (!statement || typeof statement !== "object") {
        return;
    }

    statement._featherSuppressFollowingEmptyLine = true;
}

function markStatementToSuppressLeadingEmptyLine(statement) {
    if (!statement || typeof statement !== "object") {
        return;
    }

    statement._featherSuppressLeadingEmptyLine = true;
}

function captureDeprecatedFunctionManualFixes({ ast, sourceText, diagnostic }) {
    if (
        !hasFeatherSourceTextContext(ast, diagnostic, sourceText, {
            allowEmpty: true
        })
    ) {
        return [];
    }

    const deprecatedFunctions = getDeprecatedDocCommentFunctionSet(ast) ?? new Set();

    if (!deprecatedFunctions || deprecatedFunctions.size === 0) {
        return [];
    }

    const fixes = [];
    const seenLocations = new Set();

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                visit(item);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "CallExpression") {
            const fix = recordDeprecatedCallMetadata(node, deprecatedFunctions, diagnostic);

            if (fix) {
                const startIndex = fix.range?.start;
                const endIndex = fix.range?.end;
                const locationKey = `${startIndex}:${endIndex}`;

                if (!seenLocations.has(locationKey)) {
                    seenLocations.add(locationKey);
                    fixes.push(fix);
                    attachFeatherFixMetadata(node, [fix]);
                }
            }
        }

        Core.visitChildNodes(node, visit);
    };

    visit(ast);

    return fixes;
}

function recordDeprecatedCallMetadata(node, deprecatedFunctions, diagnostic) {
    if (!node) {
        return null;
    }

    const functionName = Core.getCallExpressionIdentifierName(node);

    if (!functionName || !deprecatedFunctions.has(functionName)) {
        return null;
    }

    const startIndex = Core.getNodeStartIndex(node);
    const endIndex = Core.getNodeEndIndex(node);

    if (typeof startIndex !== "number" || typeof endIndex !== "number") {
        return null;
    }

    return createFeatherFixDetail(diagnostic, {
        target: functionName,
        range: {
            start: startIndex,
            end: endIndex
        },
        automatic: false
    });
}

function convertNumericStringArgumentsToNumbers({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                visit(item);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "CallExpression") {
            const args = Core.getCallExpressionArguments(node);

            for (const argument of args) {
                const fix = convertNumericStringLiteral(argument, diagnostic);

                if (fix) {
                    fixes.push(fix);
                }
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

function convertNumericStringLiteral(argument, diagnostic) {
    const literal = extractLiteral(argument);

    if (!literal) {
        return null;
    }

    if (literal._skipNumericStringCoercion) {
        return null;
    }

    const rawValue = literal.value;

    if (typeof rawValue !== "string" || rawValue.length < 2) {
        return null;
    }

    if (!rawValue.startsWith('"') || !rawValue.endsWith('"')) {
        return null;
    }

    const numericText = Core.stripStringQuotes(rawValue);

    if (!NUMERIC_STRING_LITERAL_PATTERN.test(numericText)) {
        return null;
    }

    literal.value = numericText;

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: numericText,
        range: {
            start: Core.getNodeStartIndex(literal),
            end: Core.getNodeEndIndex(literal)
        }
    });

    if (!fixDetail) {
        return null;
    }

    attachFeatherFixMetadata(literal, [fixDetail]);

    return fixDetail;
}

function extractLiteral(node) {
    if (!node || typeof node !== "object") {
        return null;
    }

    if (node.type === "Literal") {
        return node;
    }

    if (node.type === "ParenthesizedExpression") {
        return extractLiteral(node.expression);
    }

    return null;
}

function ensureConstructorDeclarationsForNewExpressions({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];
    const functionDeclarations = new Map();

    const collectFunctions = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            Core.visitChildNodes(node, collectFunctions);
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "FunctionDeclaration") {
            const functionName = Core.getNonEmptyString(node.id);

            if (functionName && !functionDeclarations.has(functionName)) {
                functionDeclarations.set(functionName, node);
            }
        }

        Core.visitChildNodes(node, collectFunctions);
    };

    collectFunctions(ast);

    if (functionDeclarations.size === 0) {
        return [];
    }

    const convertedFunctions = new Set();

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                visit(item);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "NewExpression") {
            const expression = node.expression;
            const constructorName =
                expression?.type === "Identifier" && typeof expression.name === "string" ? expression.name : null;

            if (constructorName) {
                const functionNode = functionDeclarations.get(constructorName);

                if (
                    functionNode &&
                    functionNode.type === "FunctionDeclaration" &&
                    !convertedFunctions.has(functionNode)
                ) {
                    const fix = convertFunctionDeclarationToConstructor(functionNode, diagnostic);

                    if (fix) {
                        fixes.push(fix);
                        convertedFunctions.add(functionNode);
                    }
                }
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

function convertFunctionDeclarationToConstructor(functionNode, diagnostic) {
    if (!functionNode || functionNode.type !== "FunctionDeclaration") {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: typeof functionNode.id === "string" ? functionNode.id : null,
        range: {
            start: Core.getNodeStartIndex(functionNode),
            end: Core.getNodeEndIndex(functionNode)
        }
    });

    if (!fixDetail) {
        return null;
    }

    functionNode.type = "ConstructorDeclaration";

    if (!Object.hasOwn(functionNode, "parent")) {
        functionNode.parent = null;
    }

    attachFeatherFixMetadata(functionNode, [fixDetail]);

    return fixDetail;
}

function deduplicateLocalVariableDeclarations({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];
    const scopeStack = [];

    const pushScope = (initialNames = []) => {
        const scope = new Map();

        if (Array.isArray(initialNames)) {
            for (const name of initialNames) {
                if (Core.isNonEmptyString(name)) {
                    scope.set(name, true);
                }
            }
        }

        scopeStack.push(scope);
    };

    const popScope = () => {
        scopeStack.pop();
    };

    const declareLocal = (name) => {
        if (!Core.isNonEmptyString(name)) {
            return true;
        }

        const scope = scopeStack.at(-1);

        if (!scope) {
            return true;
        }

        if (scope.has(name)) {
            return false;
        }

        scope.set(name, true);
        return true;
    };

    const handleVariableDeclaration = (node, parent, property) => {
        const declarations = Array.isArray(node.declarations) ? node.declarations : [];

        if (declarations.length === 0) {
            return [];
        }

        const retained = [];
        const duplicates = [];

        for (const declarator of declarations) {
            if (!declarator || typeof declarator !== "object") {
                retained.push(declarator);
                continue;
            }

            const name = getVariableDeclaratorName(declarator);

            if (!name) {
                retained.push(declarator);
                continue;
            }

            const isNewDeclaration = declareLocal(name);

            if (isNewDeclaration) {
                retained.push(declarator);
                continue;
            }

            duplicates.push(declarator);
        }

        if (duplicates.length === 0) {
            return [];
        }

        if (!hasArrayParentWithNumericIndex(parent, property)) {
            return [];
        }

        const fixDetails = [];
        const assignments = [];

        for (const declarator of duplicates) {
            const name = getVariableDeclaratorName(declarator);

            const fixDetail = createFeatherFixDetail(diagnostic, {
                target: name,
                range: {
                    start: Core.getNodeStartIndex(declarator),
                    end: Core.getNodeEndIndex(declarator)
                }
            });

            if (!fixDetail) {
                continue;
            }

            const assignment = createAssignmentFromDeclarator(declarator, node);

            if (assignment) {
                attachFeatherFixMetadata(assignment, [fixDetail]);
                assignments.push(assignment);
            }

            fixDetails.push(fixDetail);
        }

        if (fixDetails.length === 0) {
            return [];
        }

        node.declarations = retained;

        if (retained.length === 0) {
            if (assignments.length > 0) {
                parent.splice(property, 1, ...assignments);
            } else {
                parent.splice(property, 1);
            }
        } else if (assignments.length > 0) {
            parent.splice(property + 1, 0, ...assignments);
        }

        if (retained.length > 0) {
            attachFeatherFixMetadata(node, fixDetails);
        }

        return fixDetails;
    };

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                const initialLength = node.length;
                visit(node[index], node, index);

                if (node.length < initialLength) {
                    index -= 1;
                }
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (Core.isFunctionLikeNode(node)) {
            const paramNames = getFunctionParameterNames(node);

            pushScope(paramNames);

            const params = Core.getArrayProperty(node, "params");
            for (const param of params) {
                visit(param, node, "params");
            }

            visit(node.body, node, "body");
            popScope();
            return;
        }

        if (Core.isVarVariableDeclaration(node)) {
            const fixDetails = handleVariableDeclaration(node, parent, property);

            if (Core.isNonEmptyArray(fixDetails)) {
                fixes.push(...fixDetails);
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (key === "body" && Core.isFunctionLikeNode(node)) {
                continue;
            }

            if (!value || typeof value !== "object") {
                continue;
            }

            visit(value, node, key);
        }
    };

    pushScope();
    visit(ast, null, null);
    popScope();

    return fixes;
}

function renameDuplicateFunctionParameters({
    ast,
    diagnostic
}: {
    ast: unknown;
    diagnostic: unknown;
    options?: unknown;
}) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            let index = 0;

            while (index < node.length) {
                const value = node[index];

                visit(value);

                if (index >= node.length) {
                    continue;
                }

                if (node[index] === value) {
                    index += 1;
                }
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "FunctionDeclaration" || node.type === "ConstructorDeclaration") {
            const functionFixes = renameDuplicateParametersInFunction(node, diagnostic);
            if (Core.isNonEmptyArray(functionFixes)) {
                fixes.push(...functionFixes);
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

function renameDuplicateParametersInFunction(functionNode, diagnostic) {
    const params = Array.isArray(functionNode?.params) ? functionNode.params : [];

    if (params.length === 0) {
        return [];
    }

    const fixes = [];
    const seenNames = new Set();

    for (let index = 0; index < params.length; index += 1) {
        const param = params[index];
        const identifier = getFunctionParameterIdentifier(param);

        const hasIdentifier = identifier && Core.isNonEmptyString(identifier.name);

        if (!hasIdentifier) {
            continue;
        }

        const originalName = identifier.name;

        if (!seenNames.has(originalName)) {
            seenNames.add(originalName);
            continue;
        }

        const range = {
            start: Core.getNodeStartIndex(identifier),
            end: Core.getNodeEndIndex(identifier)
        };

        const fixDetail = createFeatherFixDetail(diagnostic, {
            target: originalName,
            range
        });

        if (fixDetail) {
            attachFeatherFixMetadata(functionNode, [fixDetail]);
            fixes.push(fixDetail);
        }

        params.splice(index, 1);
        index -= 1;
    }

    return fixes;
}

function getFunctionParameterIdentifier(param) {
    if (!param || typeof param !== "object") {
        return null;
    }

    if (param.type === "Identifier") {
        return param;
    }

    if (param.type === "DefaultParameter" && param.left?.type === "Identifier") {
        return param.left;
    }

    if (param.type === "RestParameter" && param.argument?.type === "Identifier") {
        return param.argument;
    }

    return null;
}

function replaceInvalidDeleteStatements({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "DeleteStatement") {
            const fix = convertDeleteStatementToUndefinedAssignment(node, parent, property, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function convertDeleteStatementToUndefinedAssignment(node, parent, property, diagnostic) {
    if (!node || node.type !== "DeleteStatement" || !diagnostic) {
        return null;
    }

    if (!isValidDeleteTarget(node.argument)) {
        return null;
    }

    const targetName = getDeleteTargetName(node.argument);
    const assignment: Record<string, unknown> = {
        type: "AssignmentExpression",
        operator: "=",
        left: node.argument,
        right: createLiteral("undefined", null),
        start: Core.cloneLocation(node.start),
        end: Core.cloneLocation(node.end)
    };

    copyCommentMetadata(node, assignment);

    // Ensure the synthesized identifier carries a cloned location when
    // possible so downstream printers and tests can observe a concrete
    // position. Use the shared helper to defensively copy start/end.
    try {
        if (assignment.right && typeof Core.assignClonedLocation === "function") {
            Core.assignClonedLocation(
                assignment.right as Record<string, unknown>,
                (Core.isNode(node.argument) ? node.argument : node) as Record<string, unknown>
            );
        }
    } catch {
        // Best-effort only; don't fail the transform on location copy errors.
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: targetName,
        range: {
            start: Core.getNodeStartIndex(node),
            end: Core.getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    if (!replaceNodeInParent(parent, property, assignment)) {
        return null;
    }

    attachFeatherFixMetadata(assignment, [fixDetail]);

    return fixDetail;
}

function isValidDeleteTarget(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    if (Core.isIdentifierNode(node)) {
        return true;
    }

    return ALLOWED_DELETE_MEMBER_TYPES.has(node.type);
}

function getDeleteTargetName(node) {
    if (!node || typeof node !== "object") {
        return null;
    }

    if (Core.isIdentifierNode(node)) {
        return node.name;
    }

    if (node.type === "MemberDotExpression") {
        return node.property?.name ?? null;
    }

    return null;
}

function replaceNodeInParent(parent, property, replacement) {
    if (Array.isArray(parent)) {
        if (typeof property !== "number" || property < 0 || property >= parent.length) {
            return false;
        }

        parent[property] = replacement;
        return true;
    }

    if (parent && typeof parent === "object" && property !== undefined) {
        parent[property] = replacement;
        return true;
    }

    return false;
}

function closeOpenVertexBatches({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            if (isStatementList(parent, property)) {
                const statementFixes = ensureVertexBatchesClosed(node, diagnostic);

                if (Core.isNonEmptyArray(statementFixes)) {
                    fixes.push(...statementFixes);
                }
            }

            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureVertexBatchesClosed(statements, diagnostic) {
    if (!diagnostic || !Core.isNonEmptyArray(statements)) {
        return [];
    }

    const fixes = [];
    let lastBeginCall = null;

    for (let index = 0; index < statements.length; index += 1) {
        const statement = statements[index];

        if (isVertexBeginCallNode(statement)) {
            markStatementToSuppressFollowingEmptyLine(statement);
            if (lastBeginCall) {
                const vertexEndCall = createVertexEndCallFromBegin(lastBeginCall);
                const fixDetail = createFeatherFixDetail(diagnostic, {
                    target: getVertexBatchTarget(lastBeginCall),
                    range: {
                        start: Core.getNodeStartIndex(lastBeginCall),
                        end: Core.getNodeEndIndex(lastBeginCall)
                    }
                });

                if (vertexEndCall && fixDetail) {
                    markStatementToSuppressFollowingEmptyLine(lastBeginCall);
                    markStatementToSuppressLeadingEmptyLine(vertexEndCall);
                    statements.splice(index, 0, vertexEndCall);
                    attachFeatherFixMetadata(vertexEndCall, [fixDetail]);
                    fixes.push(fixDetail);
                    index += 1;
                }
            }

            lastBeginCall = statement;
            continue;
        }

        if (isVertexEndCallNode(statement)) {
            lastBeginCall = null;
        }
    }

    return fixes;
}

function isVertexBeginCallNode(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    return Core.isIdentifierWithName(node.object, "vertex_begin");
}

function isVertexEndCallNode(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    return Core.isIdentifierWithName(node.object, "vertex_end");
}

function getVertexBatchTarget(callExpression) {
    if (!callExpression || callExpression.type !== "CallExpression") {
        return null;
    }

    const args = Core.getCallExpressionArguments(callExpression);

    if (args.length > 0) {
        const firstArgument = args[0];

        if (Core.isIdentifierNode(firstArgument)) {
            return firstArgument.name ?? null;
        }
    }

    return callExpression.object?.name ?? null;
}

function createVertexEndCallFromBegin(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = Core.createIdentifierNode("vertex_end", template.object);

    if (!identifier) {
        return null;
    }

    const callExpression: Record<string, unknown> = {
        type: "CallExpression",
        object: identifier,
        arguments: []
    };

    if (Core.isNonEmptyArray(template.arguments)) {
        const clonedArgument = Core.cloneAstNode(template.arguments[0]);

        if (clonedArgument) {
            (callExpression.arguments as any[]).push(clonedArgument);
        }
    }

    Core.assignClonedLocation(callExpression, template);

    return callExpression;
}

function convertUnusedIndexForLoops({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "ForStatement") {
            const fix = convertForLoopToRepeat(node, parent, property, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function convertForLoopToRepeat(node, parent, property, diagnostic) {
    if (!node || node.type !== "ForStatement") {
        return null;
    }

    const transformation = analyzeForLoopForRepeat(node);

    if (!transformation) {
        return null;
    }

    if (Array.isArray(parent)) {
        if (typeof property !== "number" || property < 0 || property >= parent.length) {
            return null;
        }
    } else if (!parent || (typeof property !== "string" && typeof property !== "number")) {
        return null;
    }

    const repeatStatement = {
        type: "RepeatStatement",
        test: transformation.testExpression,
        body: transformation.body,
        start: Core.cloneLocation(node.start),
        end: Core.cloneLocation(node.end)
    };

    copyCommentMetadata(node, repeatStatement);

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: transformation.indexName ?? null,
        range: {
            start: Core.getNodeStartIndex(node),
            end: Core.getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    parent[property] = Array.isArray(parent) ? repeatStatement : repeatStatement;

    attachFeatherFixMetadata(repeatStatement, [fixDetail]);

    return fixDetail;
}

function analyzeForLoopForRepeat(node) {
    if (!node || node.type !== "ForStatement") {
        return null;
    }

    const indexInfo = getLoopIndexInfo(node.init);

    if (!indexInfo) {
        return null;
    }

    const testExpression = getRepeatTestExpression(node.test, indexInfo.name);

    if (!testExpression) {
        return null;
    }

    if (!isRepeatCompatibleUpdate(node.update, indexInfo.name)) {
        return null;
    }

    if (doesNodeUseIdentifier(node.body, indexInfo.name)) {
        return null;
    }

    return {
        indexName: indexInfo.name,
        testExpression,
        body: node.body
    };
}

function getLoopIndexInfo(init) {
    if (!init || typeof init !== "object") {
        return null;
    }

    if (init.type === "VariableDeclaration") {
        const declarations = Array.isArray(init.declarations) ? init.declarations : [];

        if (declarations.length !== 1) {
            return null;
        }

        const [declaration] = declarations;
        const identifier = declaration?.id;
        const initializer = declaration?.init;

        if (!Core.isIdentifierNode(identifier) || !isLiteralZero(initializer)) {
            return null;
        }

        return { name: identifier.name };
    }

    if (init.type === "AssignmentExpression") {
        if (init.operator !== "=") {
            return null;
        }

        if (!Core.isIdentifierNode(init.left) || !isLiteralZero(init.right)) {
            return null;
        }

        return { name: init.left.name };
    }

    return null;
}

function getRepeatTestExpression(test, indexName) {
    if (!test || typeof test !== "object") {
        return null;
    }

    if (test.type !== "BinaryExpression") {
        return null;
    }

    if (test.operator !== "<") {
        return null;
    }

    if (!Core.isIdentifierWithName(test.left, indexName)) {
        return null;
    }

    const right = test.right;

    if (!right || typeof right !== "object") {
        return null;
    }

    return right;
}

function isRepeatCompatibleUpdate(update, indexName) {
    if (!update || typeof update !== "object") {
        return false;
    }

    if (update.type === "AssignmentExpression") {
        if (!Core.isIdentifierWithName(update.left, indexName)) {
            return false;
        }

        if (update.operator === "+=") {
            return isLiteralOne(update.right);
        }

        if (update.operator === "=") {
            if (!update.right || update.right.type !== "BinaryExpression") {
                return false;
            }

            const { left, right, operator } = update.right;

            if (operator !== "+") {
                return false;
            }

            if (!Core.isIdentifierWithName(left, indexName)) {
                return false;
            }

            return isLiteralOne(right);
        }

        return false;
    }

    if (update.type === "IncDecStatement") {
        if (update.operator !== "++") {
            return false;
        }

        return Core.isIdentifierWithName(update.argument, indexName);
    }

    return false;
}

/**
 * Checks whether the given AST node contains any reference to the specified identifier name.
 *
 * LOCATION SMELL: This utility performs identifier-reference detection, which is a general
 * AST analysis task. It doesn't belong in the Feather-fixes file, which should focus on
 * applying diagnostic-driven transformations.
 *
 * RECOMMENDATION: Move this function to a shared identifier-utility module, such as:
 *   - src/core/src/ast/identifier-utils.ts (if it's general-purpose)
 *   - src/semantic/src/identifier-analysis.ts (if it should use scope information)
 *
 * The semantic module already tracks identifier bindings and references; consider using
 * its binding map instead of manually traversing the tree. If scope-aware detection isn't
 * needed, extract this to Core so other packages can reuse it without depending on Feather.
 */
function doesNodeUseIdentifier(node, name) {
    if (!node || !name) {
        return false;
    }

    let found = false;

    const visit = (current) => {
        if (found || !current) {
            return;
        }

        if (Array.isArray(current)) {
            for (const entry of current) {
                visit(entry);
                if (found) {
                    break;
                }
            }
            return;
        }

        if (typeof current !== "object") {
            return;
        }

        if (current.type === "Identifier" && current.name === name) {
            found = true;
            return;
        }

        for (const value of Object.values(current)) {
            if (value && typeof value === "object") {
                visit(value);
                if (found) {
                    break;
                }
            }
        }
    };

    visit(node);

    return found;
}

function convertAllDotAssignmentsToWithStatements({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "AssignmentExpression") {
            const fix = convertAllAssignment(node, parent, property, diagnostic);
            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function normalizeFunctionCallArgumentOrder({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];
    const state = {
        counter: 0,
        statementInsertionOffsets: new WeakMap()
    };

    const visit = (node, parent, property, ancestors) => {
        if (!node) {
            return;
        }

        const nextAncestors = Array.isArray(ancestors)
            ? [...ancestors, { node, parent, property }]
            : [{ node, parent, property }];

        if (Array.isArray(node)) {
            let index = 0;

            while (index < node.length) {
                const beforeLength = node.length;
                const child = node[index];

                visit(child, node, index, nextAncestors);

                const afterLength = node.length;

                if (afterLength > beforeLength) {
                    const inserted = afterLength - beforeLength;
                    index = Math.max(0, index - inserted);
                    continue;
                }

                if (afterLength < beforeLength) {
                    index = Math.max(0, index - 1);
                    continue;
                }

                index += 1;
            }

            return;
        }

        if (typeof node !== "object") {
            return;
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key, nextAncestors);
            }
        }

        if (node.type === "CallExpression") {
            const fix = normalizeCallExpressionArguments({
                node,
                diagnostic,
                ancestors: nextAncestors,
                state
            });

            if (fix) {
                fixes.push(fix);
            }
        }
    };

    visit(ast, null, null, []);

    return fixes;
}

function normalizeCallExpressionArguments({ node, diagnostic, ancestors, state }) {
    if (!node || node.type !== "CallExpression") {
        return null;
    }

    const args = Core.getCallExpressionArguments(node);
    if (args.length === 0) {
        return null;
    }

    const callArgumentInfos = [];

    for (const [index, argument] of args.entries()) {
        if (!Core.isNode(argument) || argument.type !== "CallExpression") {
            continue;
        }

        callArgumentInfos.push({
            argument,
            index
        });
    }

    if (callArgumentInfos.length < 2) {
        return null;
    }

    const statementContext = findStatementContext(ancestors);

    if (!statementContext) {
        return null;
    }

    const insertionInfo = getStatementInsertionInfo(state, statementContext.statements, statementContext.index);

    const insertionOffset = insertionInfo && typeof insertionInfo.offset === "number" ? insertionInfo.offset : 0;

    const temporaryDeclarations = [];

    for (const { argument, index } of callArgumentInfos) {
        const tempName = buildTemporaryIdentifierName(state);
        const tempIdentifier = Core.createIdentifierNode(tempName, argument);

        if (!tempIdentifier) {
            continue;
        }

        const declaration = createTemporaryVariableDeclaration(tempName, argument);

        if (!declaration) {
            continue;
        }

        temporaryDeclarations.push({
            declaration,
            index,
            identifier: tempIdentifier
        });
    }

    if (temporaryDeclarations.length !== callArgumentInfos.length) {
        return null;
    }

    const fixDetail = createCallExpressionTargetFixDetail(diagnostic, node);

    if (!fixDetail) {
        return null;
    }

    for (const { index, identifier } of temporaryDeclarations) {
        node.arguments[index] = Core.createIdentifierNode(identifier.name, identifier);
    }

    const declarations = temporaryDeclarations.map(({ declaration }) => declaration);

    const insertionIndex = statementContext.index + insertionOffset;

    statementContext.statements.splice(insertionIndex, 0, ...declarations);

    if (insertionInfo) {
        insertionInfo.offset += declarations.length;
    }

    for (const { declaration } of temporaryDeclarations) {
        attachFeatherFixMetadata(declaration, [fixDetail]);
    }

    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

function buildTemporaryIdentifierName(state) {
    if (!state || typeof state !== "object") {
        return "__feather_call_arg_0";
    }

    const nextIndex = typeof state.counter === "number" ? state.counter : 0;
    state.counter = nextIndex + 1;

    return `__feather_call_arg_${nextIndex}`;
}

function createTemporaryVariableDeclaration(name, init) {
    if (!name || !init || typeof init !== "object") {
        return null;
    }

    const id = Core.createIdentifierNode(name, init);

    if (!id) {
        return null;
    }

    const declarator = {
        type: "VariableDeclarator",
        id,
        init,
        start: Core.cloneLocation(init.start),
        end: Core.cloneLocation(init.end)
    };

    return {
        type: "VariableDeclaration",
        declarations: [declarator],
        kind: "var",
        start: Core.cloneLocation(init.start),
        end: Core.cloneLocation(init.end)
    };
}

function getStatementInsertionInfo(state, statements, baseIndex) {
    if (!state || typeof state !== "object" || !Array.isArray(statements) || typeof baseIndex !== "number") {
        return null;
    }

    if (!state.statementInsertionOffsets) {
        state.statementInsertionOffsets = new WeakMap();
    }

    const arrayInfo = Core.getOrCreateMapEntry(state.statementInsertionOffsets, statements, () => new Map());

    return Core.getOrCreateMapEntry(arrayInfo, baseIndex, () => ({
        offset: 0
    }));
}

function findStatementContext(ancestors) {
    if (!Array.isArray(ancestors)) {
        return null;
    }

    for (let index = ancestors.length - 1; index >= 0; index -= 1) {
        const entry = ancestors[index];

        if (!entry || !Array.isArray(entry.parent) || typeof entry.property !== "number") {
            continue;
        }

        const arrayAncestor = ancestors[index - 1];

        if (!arrayAncestor) {
            continue;
        }

        if (!isStatementArray(arrayAncestor)) {
            continue;
        }

        return {
            statements: entry.parent,
            index: entry.property
        };
    }

    return null;
}

function isStatementArray(entry) {
    if (!entry || !Array.isArray(entry.node)) {
        return false;
    }

    const owner = entry.parent;
    const propertyName = entry.property;

    if (!owner || typeof propertyName !== "string") {
        return false;
    }

    if (propertyName !== "body") {
        return false;
    }

    const parentType = owner?.type;

    return parentType === "Program" || parentType === "BlockStatement" || parentType === "SwitchCase";
}

function convertAllAssignment(node, parent, property, diagnostic) {
    if (!hasArrayParentWithNumericIndex(parent, property)) {
        return null;
    }

    if (!node || node.type !== "AssignmentExpression" || node.operator !== "=") {
        return null;
    }

    const member = node.left;
    if (!member || member.type !== "MemberDotExpression") {
        return null;
    }

    const object = member.object;
    if (!object || object.type !== "Identifier" || object.name !== "all") {
        return null;
    }

    const propertyIdentifier = member.property;
    if (!propertyIdentifier || propertyIdentifier.type !== "Identifier") {
        return null;
    }

    const normalizedAssignment = {
        type: "AssignmentExpression",
        operator: node.operator,
        left: Core.cloneIdentifier(propertyIdentifier),
        right: node.right,
        start: Core.cloneLocation(node.start),
        end: Core.cloneLocation(node.end)
    };

    const assignmentStatement = {
        type: "ExpressionStatement",
        expression: normalizedAssignment,
        start: Core.cloneLocation(node.start),
        end: Core.cloneLocation(node.end),
        _featherSuppressFollowingEmptyLine: true
    };

    const blockStatement = {
        type: "BlockStatement",
        body: [assignmentStatement],
        start: Core.cloneLocation(node.start),
        end: Core.cloneLocation(node.end)
    };

    const parenthesizedExpression = {
        type: "ParenthesizedExpression",
        expression: Core.cloneIdentifier(object),
        start: Core.cloneLocation(object?.start ?? node.start),
        end: Core.cloneLocation(object?.end ?? node.end)
    };

    const withStatement = {
        type: "WithStatement",
        test: parenthesizedExpression,
        body: blockStatement,
        start: Core.cloneLocation(node.start),
        end: Core.cloneLocation(node.end)
    };

    copyCommentMetadata(node, assignmentStatement);
    copyCommentMetadata(node, withStatement);

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: propertyIdentifier?.name ?? null,
        range: {
            start: Core.getNodeStartIndex(node),
            end: Core.getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    parent[property] = withStatement;
    attachFeatherFixMetadata(withStatement, [fixDetail]);

    return fixDetail;
}

function convertNullishCoalesceOpportunities({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return false;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; ) {
                const mutated = visit(node[index], node, index);
                if (mutated) {
                    continue;
                }
                index += 1;
            }
            return false;
        }

        if (typeof node !== "object") {
            return false;
        }

        if (node.type === "IfStatement") {
            const result = convertNullishIfStatement(node, parent, property, diagnostic);

            if (result && result.fix) {
                fixes.push(result.fix);
                return result.mutatedParent === true;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }

        return false;
    };

    visit(ast, null, null);

    return fixes;
}

function convertNullishIfStatement(node, parent, property, diagnostic) {
    if (!hasArrayParentWithNumericIndex(parent, property)) {
        return null;
    }

    if (!node || node.type !== "IfStatement" || node.alternate) {
        return null;
    }

    const comparison = Core.unwrapParenthesizedExpression(node.test);

    if (!comparison || comparison.type !== "BinaryExpression") {
        return null;
    }

    if (comparison.operator !== "==") {
        return null;
    }

    const identifierInfo = extractUndefinedComparisonIdentifier(comparison);

    if (!identifierInfo) {
        return null;
    }

    const consequentAssignment = extractConsequentAssignment(node.consequent);

    if (!consequentAssignment || consequentAssignment.operator !== "=") {
        return null;
    }

    const assignmentIdentifier = consequentAssignment.left;

    if (!Core.isIdentifierNode(assignmentIdentifier) || assignmentIdentifier.name !== identifierInfo.name) {
        return null;
    }

    const fallbackExpression = consequentAssignment.right;

    if (!fallbackExpression) {
        return null;
    }

    const previousNode = parent[property - 1];

    if (
        previousNode &&
        previousNode.type === "AssignmentExpression" &&
        previousNode.operator === "=" &&
        Core.isIdentifierNode(previousNode.left) &&
        previousNode.left.name === identifierInfo.name &&
        previousNode.right
    ) {
        const previousRight = previousNode.right;

        const binaryExpression = {
            type: "BinaryExpression",
            operator: "??",
            left: previousRight,
            right: fallbackExpression
        };

        if (Object.hasOwn(previousRight, "start")) {
            Core.assignClonedLocation(binaryExpression as any, previousRight);
        } else if (Object.hasOwn(previousNode, "start")) {
            Core.assignClonedLocation(binaryExpression as any, previousNode);
        }

        if (Object.hasOwn(fallbackExpression, "end")) {
            Core.assignClonedLocation(binaryExpression as any, fallbackExpression);
        } else if (Object.hasOwn(consequentAssignment, "end")) {
            Core.assignClonedLocation(binaryExpression as any, consequentAssignment);
        }

        previousNode.right = binaryExpression;

        if (Object.hasOwn(node, "end")) {
            Core.assignClonedLocation(previousNode, node);
        } else if (Object.hasOwn(consequentAssignment, "end")) {
            Core.assignClonedLocation(previousNode, consequentAssignment);
        }

        const fixDetail = createFeatherFixDetail(diagnostic, {
            target: identifierInfo.name,
            range: {
                start: Core.getNodeStartIndex(previousNode),
                end: Core.getNodeEndIndex(previousNode)
            }
        });

        if (!fixDetail) {
            return null;
        }

        parent.splice(property, 1);
        attachFeatherFixMetadata(previousNode, [fixDetail]);

        return { fix: fixDetail, mutatedParent: true };
    }

    const nullishAssignment = {
        type: "AssignmentExpression",
        operator: "??=",
        left: assignmentIdentifier,
        right: fallbackExpression
    };

    if (Object.hasOwn(consequentAssignment, "start")) {
        Core.assignClonedLocation(nullishAssignment as any, consequentAssignment);
    } else if (Object.hasOwn(node, "start")) {
        Core.assignClonedLocation(nullishAssignment as any, node);
    }

    if (Object.hasOwn(node, "end")) {
        Core.assignClonedLocation(nullishAssignment as any, node);
    } else if (Object.hasOwn(consequentAssignment, "end")) {
        Core.assignClonedLocation(nullishAssignment as any, consequentAssignment);
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: identifierInfo.name,
        range: {
            start: Core.getNodeStartIndex(nullishAssignment),
            end: Core.getNodeEndIndex(nullishAssignment)
        }
    });

    if (!fixDetail) {
        return null;
    }

    parent[property] = nullishAssignment;
    attachFeatherFixMetadata(nullishAssignment, [fixDetail]);

    return { fix: fixDetail, mutatedParent: false };
}

function extractUndefinedComparisonIdentifier(expression) {
    if (!expression || expression.type !== "BinaryExpression") {
        return null;
    }

    const { left, right } = expression;

    if (Core.isIdentifierNode(left) && Core.isUndefinedSentinel(right)) {
        return { node: left, name: left.name };
    }

    if (Core.isIdentifierNode(right) && Core.isUndefinedSentinel(left)) {
        return { node: right, name: right.name };
    }

    return null;
}

function extractConsequentAssignment(consequent) {
    if (!consequent || typeof consequent !== "object") {
        return null;
    }

    if (consequent.type === "AssignmentExpression") {
        return consequent;
    }

    if (consequent.type === "BlockStatement") {
        const single = Core.getSingleBodyStatement(consequent, {
            skipBlockCommentCheck: true,
            skipStatementCommentCheck: true
        });

        if (single && single.type === "AssignmentExpression") {
            return single;
        }
    }

    return null;
}

function ensureShaderResetIsCalled({ ast, diagnostic, sourceText }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "CallExpression") {
            const fix = ensureShaderResetAfterSet(node, parent, property, diagnostic, sourceText);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureShaderResetAfterSet(node, parent, property, diagnostic, sourceText) {
    if (!resolveCallExpressionArrayContext(node, parent, property)) {
        return null;
    }

    if (!Core.isIdentifierWithName(node.object, "shader_set")) {
        return null;
    }

    const siblings = parent;
    let insertionIndex = property + 1;
    let lastSequentialCallIndex = property;
    let previousNode = node;

    while (insertionIndex < siblings.length) {
        const candidate = siblings[insertionIndex];

        if (isShaderResetCall(candidate)) {
            return null;
        }

        if (!isCallExpression(candidate)) {
            break;
        }

        if (Core.isIdentifierWithName(candidate.object, "shader_set")) {
            break;
        }

        if (!hasOnlyWhitespaceBetweenNodes(previousNode, candidate, sourceText)) {
            break;
        }

        lastSequentialCallIndex = insertionIndex;
        previousNode = candidate;
        insertionIndex += 1;
    }

    if (lastSequentialCallIndex > property) {
        insertionIndex = lastSequentialCallIndex + 1;
    }

    const resetCall = createShaderResetCall(node);

    if (!resetCall) {
        return null;
    }

    const fixDetail = createCallExpressionTargetFixDetail(diagnostic, node);

    if (!fixDetail) {
        return null;
    }

    markStatementToSuppressFollowingEmptyLine(node);
    siblings.splice(insertionIndex, 0, resetCall);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
}

function ensureFogIsReset({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "CallExpression") {
            const fix = ensureFogResetAfterCall(node, parent, property, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureFogResetAfterCall(node, parent, property, diagnostic) {
    if (!resolveCallExpressionArrayContext(node, parent, property)) {
        return null;
    }

    if (!Core.isIdentifierWithName(node.object, "gpu_set_fog")) {
        return null;
    }

    if (isFogResetCall(node)) {
        return null;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return null;
    }

    if (isLiteralFalse(args[0])) {
        return null;
    }

    const siblings = parent;
    let insertionIndex = property + 1;

    while (insertionIndex < siblings.length) {
        const candidate = siblings[insertionIndex];

        if (candidate?.type === "EmptyStatement") {
            insertionIndex += 1;
            continue;
        }

        if (isFogResetCall(candidate)) {
            return null;
        }

        if (!candidate || candidate.type !== "CallExpression") {
            break;
        }

        if (!isDrawFunctionCall(candidate)) {
            break;
        }

        markStatementToSuppressLeadingEmptyLine(candidate);
        insertionIndex += 1;
    }

    const resetCall = createFogResetCall(node);

    if (!resetCall) {
        return null;
    }

    const fixDetail = createCallExpressionTargetFixDetail(diagnostic, node);

    if (!fixDetail) {
        return null;
    }

    siblings.splice(insertionIndex, 0, resetCall);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
}

function ensureSurfaceTargetsAreReset({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "CallExpression") {
            const fix = ensureSurfaceTargetResetAfterCall(node, parent, property, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureSurfaceTargetResetAfterCall(node, parent, property, diagnostic) {
    if (!resolveCallExpressionArrayContext(node, parent, property)) {
        return null;
    }

    if (!Core.isIdentifierWithName(node.object, "surface_set_target")) {
        return null;
    }

    const siblings = parent;
    let insertionIndex = property + 1;
    let lastDrawCallIndex = property;

    while (insertionIndex < siblings.length) {
        const candidate = siblings[insertionIndex];

        if (isSurfaceResetTargetCall(candidate)) {
            return null;
        }

        if (!candidate || candidate.type !== "CallExpression") {
            break;
        }

        const isDrawCall = isDrawFunctionCall(candidate);
        const isActiveTargetSubmit = !isDrawCall && isVertexSubmitCallUsingActiveTarget(candidate);

        if (!isDrawCall && !isActiveTargetSubmit) {
            break;
        }

        markStatementToSuppressLeadingEmptyLine(candidate);
        lastDrawCallIndex = insertionIndex;
        insertionIndex += 1;

        if (isActiveTargetSubmit) {
            break;
        }
    }

    if (lastDrawCallIndex > property) {
        insertionIndex = lastDrawCallIndex + 1;
    } else if (insertionIndex >= siblings.length) {
        insertionIndex = siblings.length;
    } else {
        return null;
    }

    const resetCall = createSurfaceResetTargetCall(node);

    if (!resetCall) {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: extractSurfaceTargetName(node),
        range: {
            start: Core.getNodeStartIndex(node),
            end: Core.getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    siblings.splice(insertionIndex, 0, resetCall);
    removeRedundantSurfaceResetCalls(siblings, insertionIndex + 1);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
}

function ensureBlendEnableIsReset({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "CallExpression") {
            const fix = ensureBlendEnableResetAfterCall(node, parent, property, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureBlendEnableResetAfterCall(node, parent, property, diagnostic) {
    if (!resolveCallExpressionArrayContext(node, parent, property)) {
        return null;
    }

    if (!Core.isIdentifierWithName(node.object, "gpu_set_blendenable")) {
        return null;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return null;
    }

    if (!shouldResetBlendEnable(args[0])) {
        return null;
    }

    const siblings = parent;
    let insertionIndex = siblings.length;

    for (let index = property + 1; index < siblings.length; index += 1) {
        const sibling = siblings[index];

        if (isBlendEnableResetCall(sibling)) {
            return null;
        }

        if (!isTriviallyIgnorableStatement(sibling)) {
            insertionIndex = index + 1;
            break;
        }
    }

    const resetCall = createBlendEnableResetCall(node);

    if (!resetCall) {
        return null;
    }

    const fixDetail = createCallExpressionTargetFixDetail(diagnostic, node);

    if (!fixDetail) {
        return null;
    }

    for (let cleanupIndex = property + 1; cleanupIndex < insertionIndex; cleanupIndex += 1) {
        const candidate = siblings[cleanupIndex];

        if (!isTriviallyIgnorableStatement(candidate)) {
            continue;
        }

        siblings.splice(cleanupIndex, 1);
        insertionIndex -= 1;
        cleanupIndex -= 1;
    }

    const previousSibling = siblings[insertionIndex - 1] ?? node;
    const nextSibling = siblings[insertionIndex] ?? null;
    const needsSeparator =
        !isAlphaTestDisableCall(nextSibling) &&
        nextSibling &&
        insertionIndex > property + 1 &&
        !isTriviallyIgnorableStatement(previousSibling) &&
        !hasOriginalBlankLineBetween(previousSibling, nextSibling);

    if (needsSeparator) {
        insertionIndex = insertSeparatorStatementBeforeIndex(siblings, insertionIndex, previousSibling);
    }

    markStatementToSuppressFollowingEmptyLine(node);
    markStatementToSuppressLeadingEmptyLine(resetCall);

    siblings.splice(insertionIndex, 0, resetCall);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
}

function ensureBlendModeIsReset({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "CallExpression") {
            const fix = ensureBlendModeResetAfterCall(node, parent, property, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureBlendModeResetAfterCall(node, parent, property, diagnostic) {
    if (!resolveCallExpressionArrayContext(node, parent, property)) {
        return null;
    }

    if (!Core.isIdentifierWithName(node.object, "gpu_set_blendmode")) {
        return null;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return null;
    }

    if (isBlendModeNormalArgument(args[0])) {
        return null;
    }

    const siblings = parent;
    let insertionIndex = property + 1;
    let lastDrawCallIndex = property;

    while (insertionIndex < siblings.length) {
        const candidate = siblings[insertionIndex];

        if (isBlendModeResetCall(candidate)) {
            return null;
        }

        if (!candidate) {
            break;
        }

        if (isTriviallyIgnorableStatement(candidate)) {
            insertionIndex += 1;
            continue;
        }

        if (!isCallExpression(candidate)) {
            break;
        }

        if (!isDrawFunctionCall(candidate)) {
            break;
        }

        markStatementToSuppressLeadingEmptyLine(candidate);
        lastDrawCallIndex = insertionIndex;
        insertionIndex += 1;
    }

    if (lastDrawCallIndex > property) {
        insertionIndex = lastDrawCallIndex + 1;
    } else if (insertionIndex >= siblings.length) {
        insertionIndex = siblings.length;
    } else {
        return null;
    }

    const resetCall = createBlendModeResetCall(node);

    if (!resetCall) {
        return null;
    }

    const fixDetail = createCallExpressionTargetFixDetail(diagnostic, node);

    if (!fixDetail) {
        return null;
    }

    markStatementToSuppressFollowingEmptyLine(node);
    siblings.splice(insertionIndex, 0, resetCall);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
}

function ensureFileFindFirstBeforeClose({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; ) {
                const element = node[index];

                if (element?.type === "CallExpression") {
                    const fix = ensureFileFindFirstBeforeCloseCall(element, node, index, diagnostic);

                    if (fix) {
                        fixes.push(fix);
                        continue;
                    }
                }

                visit(element, node, index);
                index += 1;
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "CallExpression") {
            const fix = ensureFileFindFirstBeforeCloseCall(node, parent, property, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureFileFindFirstBeforeCloseCall(node, parent, property, diagnostic) {
    if (!hasArrayParentWithNumericIndex(parent, property)) {
        return null;
    }

    if (!node || node.type !== "CallExpression") {
        return null;
    }

    if (!Core.isIdentifierWithName(node.object, "file_find_close")) {
        return null;
    }

    const diagnosticMetadata = Array.isArray(node._appliedFeatherDiagnostics) ? node._appliedFeatherDiagnostics : [];

    const insertedForSerializedSearch = diagnosticMetadata.some((entry) => entry?.id === "GM2031");

    if (insertedForSerializedSearch) {
        return null;
    }

    const siblings = parent;

    for (let index = property - 1; index >= 0; index -= 1) {
        const sibling = siblings[index];

        if (!sibling) {
            continue;
        }

        if (containsFileFindFirstCall(sibling)) {
            return null;
        }
    }

    const fixDetail = createCallExpressionTargetFixDetail(diagnostic, node);

    if (!fixDetail) {
        return null;
    }

    siblings.splice(property, 1);

    return fixDetail;
}

function containsFileFindFirstCall(node) {
    if (!node) {
        return false;
    }

    if (Array.isArray(node)) {
        for (const item of node) {
            if (containsFileFindFirstCall(item)) {
                return true;
            }
        }
        return false;
    }

    if (typeof node !== "object") {
        return false;
    }

    if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression") {
        return false;
    }

    if (node.type === "CallExpression" && Core.isIdentifierWithName(node.object, "file_find_first")) {
        return true;
    }

    for (const value of Object.values(node)) {
        if (value && typeof value === "object" && containsFileFindFirstCall(value)) {
            return true;
        }
    }

    return false;
}

function ensureAlphaTestEnableIsReset({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "CallExpression") {
            const fix = ensureAlphaTestEnableResetAfterCall(node, parent, property, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureAlphaTestRefIsReset({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "CallExpression") {
            const fix = ensureAlphaTestRefResetAfterCall(node, parent, property, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function removeRedeclaredGlobalFunctions({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const body = Core.getBodyStatements(ast) as GameMakerAstNode[];

    if (body.length === 0) {
        return [];
    }

    const seenDeclarations = new Map();
    const fixes = [];

    for (let index = 0; index < body.length; ) {
        const node = body[index];

        if (!Core.isNode(node) || node.type !== "FunctionDeclaration") {
            index += 1;
            continue;
        }

        const nodeObj = node;
        const functionId = typeof nodeObj.id === "string" ? nodeObj.id : null;

        if (!functionId) {
            index += 1;
            continue;
        }

        const originalDeclaration = seenDeclarations.get(functionId);

        if (!originalDeclaration) {
            seenDeclarations.set(functionId, node);
            index += 1;
            continue;
        }

        const range = {
            start: Core.getNodeStartIndex(node),
            end: Core.getNodeEndIndex(node)
        };

        const fixDetail = createFeatherFixDetail(diagnostic, {
            target: functionId,
            range
        });

        if (fixDetail) {
            fixes.push(fixDetail);

            if (originalDeclaration && typeof originalDeclaration === "object") {
                const originalHasComments = Core.hasComment(originalDeclaration);

                attachFeatherFixMetadata(originalDeclaration, [fixDetail]);

                // Suppress synthetic @returns metadata when a Feather fix removes
                // a redeclared global function. The formatter should keep
                // existing documentation intact without introducing additional
                // lines so the output remains stable for the surviving
                // declaration.
                if (originalHasComments) {
                    originalDeclaration._suppressSyntheticReturnsDoc = true;
                } else {
                    delete originalDeclaration._suppressSyntheticReturnsDoc;
                }
            }
        }

        body.splice(index, 1);
    }

    return fixes;
}

function ensureHalignIsReset({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "CallExpression") {
            const fix = ensureHalignResetAfterCall(node, parent, property, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureConstructorParentsExist({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const constructors = new Map();
    const functions = new Map();

    const collect = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const entry of node) {
                collect(entry);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "ConstructorDeclaration" && typeof node.id === "string") {
            if (!constructors.has(node.id)) {
                constructors.set(node.id, node);
            }
        } else if (node.type === "FunctionDeclaration" && typeof node.id === "string" && !functions.has(node.id)) {
            functions.set(node.id, node);
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                collect(value);
            }
        }
    };

    collect(ast);

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

        if (node.type === "ConstructorDeclaration") {
            const parentClause = node.parent;

            if (parentClause && typeof parentClause === "object") {
                const parentName = parentClause.id;

                if (Core.isNonEmptyString(parentName) && !constructors.has(parentName)) {
                    const fallback = functions.get(parentName);

                    if (fallback && fallback.type === "FunctionDeclaration") {
                        fallback.type = "ConstructorDeclaration";

                        if (!Object.hasOwn(fallback, "parent")) {
                            fallback.parent = null;
                        }

                        constructors.set(parentName, fallback);
                        functions.delete(parentName);

                        const fixDetail = createFeatherFixDetail(diagnostic, {
                            target: parentName,
                            range: {
                                start: Core.getNodeStartIndex(fallback),
                                end: Core.getNodeEndIndex(fallback)
                            }
                        });

                        if (fixDetail) {
                            attachFeatherFixMetadata(fallback, [fixDetail]);
                            fixes.push(fixDetail);
                        }
                    } else {
                        const fixDetail = createFeatherFixDetail(diagnostic, {
                            target: parentName,
                            range: {
                                start: Core.getNodeStartIndex(parentClause),
                                end: Core.getNodeEndIndex(parentClause)
                            }
                        });

                        if (fixDetail) {
                            node.parent = null;
                            attachFeatherFixMetadata(node, [fixDetail]);
                            fixes.push(fixDetail);
                        }
                    }
                }
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

function ensurePrimitiveBeginPrecedesEnd({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];
    const ancestors = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        const entry = { node, parent, property };
        ancestors.push(entry);

        if (Array.isArray(node)) {
            if (isStatementArray(entry)) {
                let index = 0;

                while (index < node.length) {
                    const statement = node[index];

                    if (isDrawPrimitiveEndCall(statement)) {
                        const fix = ensurePrimitiveBeginBeforeEnd({
                            statements: node,
                            index,
                            endCall: statement,
                            diagnostic,
                            ancestors
                        });

                        if (fix) {
                            fixes.push(fix);
                        }
                    }

                    visit(node[index], node, index);
                    index += 1;
                }

                ancestors.pop();
                return;
            }

            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }

            ancestors.pop();
            return;
        }

        if (typeof node !== "object") {
            ancestors.pop();
            return;
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }

        ancestors.pop();
    };

    visit(ast, null, null);

    return fixes;
}

function ensurePrimitiveBeginBeforeEnd({ statements, index, endCall, diagnostic, ancestors }) {
    if (!Array.isArray(statements) || typeof index !== "number") {
        return null;
    }

    if (!endCall || !isDrawPrimitiveEndCall(endCall)) {
        return null;
    }

    let unmatchedBegins = 0;

    for (let position = 0; position < index; position += 1) {
        const statement = statements[position];

        if (isDrawPrimitiveBeginCall(statement)) {
            unmatchedBegins += 1;
            continue;
        }

        if (isDrawPrimitiveEndCall(statement) && unmatchedBegins > 0) {
            unmatchedBegins -= 1;
        }
    }

    if (unmatchedBegins > 0) {
        return null;
    }

    if (
        hasAncestorDrawPrimitiveBegin({
            ancestors,
            currentStatements: statements
        })
    ) {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: endCall?.object?.name ?? null,
        range: {
            start: Core.getNodeStartIndex(endCall),
            end: Core.getNodeEndIndex(endCall)
        }
    });

    if (!fixDetail) {
        return null;
    }

    statements.splice(index, 1);
    attachFeatherFixMetadata(endCall, [fixDetail]);

    return fixDetail;
}

function hasAncestorDrawPrimitiveBegin({ ancestors, currentStatements }) {
    if (!Core.isNonEmptyArray(ancestors)) {
        return false;
    }

    for (let i = ancestors.length - 2; i >= 0; i -= 1) {
        const entry = ancestors[i];

        if (!entry || !Array.isArray(entry.parent) || typeof entry.property !== "number") {
            continue;
        }

        if (entry.parent === currentStatements) {
            continue;
        }

        const parentArrayEntry = findAncestorArrayEntry(ancestors, entry.parent);

        if (!parentArrayEntry || !isStatementArray(parentArrayEntry)) {
            continue;
        }

        if (hasUnmatchedBeginBeforeIndex(entry.parent, entry.property)) {
            return true;
        }
    }

    return false;
}

function findAncestorArrayEntry(ancestors, target) {
    if (!target) {
        return null;
    }

    for (let index = ancestors.length - 1; index >= 0; index -= 1) {
        const entry = ancestors[index];

        if (entry?.node === target) {
            return entry;
        }
    }

    return null;
}

function hasUnmatchedBeginBeforeIndex(statements, stopIndex) {
    if (!Array.isArray(statements) || typeof stopIndex !== "number") {
        return false;
    }

    let unmatchedBegins = 0;

    for (let index = 0; index < stopIndex; index += 1) {
        const statement = statements[index];

        if (isDrawPrimitiveBeginCall(statement)) {
            unmatchedBegins += 1;
            continue;
        }

        if (isDrawPrimitiveEndCall(statement) && unmatchedBegins > 0) {
            unmatchedBegins -= 1;
        }
    }

    return unmatchedBegins > 0;
}

function ensureDrawPrimitiveEndCallsAreBalanced({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            ensurePrimitiveSequenceBalance(node, parent, property, fixes, diagnostic);

            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensurePrimitiveSequenceBalance(statements, parent, property, fixes, diagnostic) {
    if (!Core.isNonEmptyArray(statements)) {
        return;
    }

    for (let index = 0; index < statements.length; index += 1) {
        const current = statements[index];

        if (!isDrawPrimitiveBeginCall(current)) {
            continue;
        }

        const nextNode = statements[index + 1];

        if (!nextNode || nextNode.type !== "IfStatement") {
            continue;
        }

        const followingNode = statements[index + 2];

        if (isDrawPrimitiveEndCall(followingNode)) {
            continue;
        }

        const fix = liftDrawPrimitiveEndCallFromConditional(nextNode, statements, index + 1, diagnostic);

        if (fix) {
            fixes.push(fix);
        }
    }
}

function liftDrawPrimitiveEndCallFromConditional(conditional, siblings, conditionalIndex, diagnostic) {
    if (!conditional || conditional.type !== "IfStatement") {
        return null;
    }

    const consequentInfo = getDrawPrimitiveEndCallInfo(conditional.consequent);
    const alternateInfo = getDrawPrimitiveEndCallInfo(conditional.alternate);

    if (!consequentInfo || !alternateInfo) {
        return null;
    }

    const totalMatches = consequentInfo.matches.length + alternateInfo.matches.length;

    if (totalMatches !== 1) {
        return null;
    }

    const branchWithCall = consequentInfo.matches.length === 1 ? consequentInfo : alternateInfo;
    const branchWithoutCall = branchWithCall === consequentInfo ? alternateInfo : consequentInfo;

    if (branchWithCall.matches.length !== 1 || branchWithoutCall.matches.length > 0) {
        return null;
    }

    const [match] = branchWithCall.matches;

    if (!match || match.index !== branchWithCall.body.length - 1) {
        return null;
    }

    const callNode = match.node;

    if (!callNode || !isDrawPrimitiveEndCall(callNode)) {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: callNode.object?.name ?? null,
        range: {
            start: Core.getNodeStartIndex(callNode),
            end: Core.getNodeEndIndex(callNode)
        }
    });

    if (!fixDetail) {
        return null;
    }

    (branchWithCall.body as GameMakerAstNode[]).splice(match.index, 1);

    removeSyntheticDrawPrimitiveBeginInsertedByGM2028(branchWithCall.body);

    const insertionIndex = conditionalIndex + 1;

    siblings.splice(insertionIndex, 0, callNode);

    attachFeatherFixMetadata(callNode, [fixDetail]);

    return fixDetail;
}

function removeSyntheticDrawPrimitiveBeginInsertedByGM2028(statements) {
    if (!Core.isNonEmptyArray(statements)) {
        return false;
    }

    for (let index = 0; index < statements.length; index += 1) {
        const statement = statements[index];

        if (!isDrawPrimitiveBeginCall(statement)) {
            continue;
        }

        const diagnosticMetadata = Array.isArray(statement?._appliedFeatherDiagnostics)
            ? statement._appliedFeatherDiagnostics
            : [];

        const insertedByGM2028 = diagnosticMetadata.some((entry) => entry?.id === "GM2028");

        if (!insertedByGM2028) {
            continue;
        }

        statements.splice(index, 1);
        return true;
    }

    return false;
}

function getDrawPrimitiveEndCallInfo(block) {
    if (!block || block.type !== "BlockStatement") {
        return null;
    }

    const body = Core.getBodyStatements(block);
    const matches = [];

    for (const [index, statement] of body.entries()) {
        if (isDrawPrimitiveEndCall(statement)) {
            matches.push({ index, node: statement });
        }
    }

    return { body, matches };
}

function ensureAlphaTestEnableResetAfterCall(node, parent, property, diagnostic) {
    if (!resolveCallExpressionArrayContext(node, parent, property)) {
        return null;
    }

    if (!Core.isIdentifierWithName(node.object, "gpu_set_alphatestenable")) {
        return null;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return null;
    }

    if (!isLiteralTrue(args[0])) {
        return null;
    }

    const siblings = parent;

    const insertionInfo = computeStateResetInsertionIndex({
        siblings,
        startIndex: property + 1,
        isResetCall: isAlphaTestEnableResetCall
    });

    if (!insertionInfo) {
        return null;
    }

    if (insertionInfo.alreadyReset) {
        return null;
    }

    const resetCall = createAlphaTestEnableResetCall(node);

    if (!resetCall) {
        return null;
    }

    const fixDetail = createCallExpressionTargetFixDetail(diagnostic, node);

    if (!fixDetail) {
        return null;
    }

    let insertionIndex = insertionInfo.index;

    for (let index = property + 1; index < insertionIndex; index += 1) {
        const candidate = siblings[index];

        if (!candidate || isTriviallyIgnorableStatement(candidate)) {
            continue;
        }

        markStatementToSuppressLeadingEmptyLine(candidate);
    }

    markStatementToSuppressFollowingEmptyLine(node);

    const previousSibling = siblings[insertionIndex - 1] ?? siblings[property] ?? node;
    const nextSibling = siblings[insertionIndex] ?? null;
    const shouldInsertSeparator =
        insertionIndex > property + 1 &&
        !isTriviallyIgnorableStatement(previousSibling) &&
        nextSibling &&
        !isTriviallyIgnorableStatement(nextSibling) &&
        !isAlphaTestDisableCall(nextSibling) &&
        !hasOriginalBlankLineBetween(previousSibling, nextSibling);

    if (shouldInsertSeparator) {
        insertionIndex = insertSeparatorStatementBeforeIndex(siblings, insertionIndex, previousSibling);
    }

    siblings.splice(insertionIndex, 0, resetCall);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
}

function ensureHalignResetAfterCall(node, parent, property, diagnostic) {
    if (!hasArrayParentWithNumericIndex(parent, property)) {
        return null;
    }

    if (!node || node.type !== "CallExpression") {
        return null;
    }

    if (!Core.isIdentifierWithName(node.object, "draw_set_halign")) {
        return null;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return null;
    }

    if (Core.isIdentifierWithName(args[0], "fa_left")) {
        return null;
    }

    const siblings = parent;

    const insertionInfo = computeStateResetInsertionIndex({
        siblings,
        startIndex: property + 1,
        isResetCall: isHalignResetCall
    });

    if (!insertionInfo) {
        return null;
    }

    if (insertionInfo.alreadyReset) {
        return null;
    }

    const resetCall = createHalignResetCall(node);

    if (!resetCall) {
        return null;
    }

    const fixDetail = createCallExpressionTargetFixDetail(diagnostic, node);

    if (!fixDetail) {
        return null;
    }

    const insertionIndex = typeof insertionInfo.index === "number" ? insertionInfo.index : siblings.length;

    for (let index = property + 1; index < insertionIndex; index += 1) {
        const candidate = siblings[index];

        if (!candidate || isTriviallyIgnorableStatement(candidate)) {
            continue;
        }

        markStatementToSuppressLeadingEmptyLine(candidate);
    }

    markStatementToSuppressFollowingEmptyLine(node);
    markStatementToSuppressLeadingEmptyLine(resetCall);

    siblings.splice(insertionIndex, 0, resetCall);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
}

function ensureAlphaTestRefResetAfterCall(node, parent, property, diagnostic) {
    if (!hasArrayParentWithNumericIndex(parent, property)) {
        return null;
    }

    if (!node || node.type !== "CallExpression") {
        return null;
    }

    if (!Core.isIdentifierWithName(node.object, "gpu_set_alphatestref")) {
        return null;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return null;
    }

    if (isLiteralZero(args[0])) {
        return null;
    }

    const siblings = parent;
    let insertionIndex = siblings.length;

    for (let index = property + 1; index < siblings.length; index += 1) {
        const sibling = siblings[index];

        if (isAlphaTestRefResetCall(sibling)) {
            return null;
        }

        if (isAlphaTestDisableCall(sibling)) {
            insertionIndex = index;
            break;
        }
    }

    const resetCall = createAlphaTestRefResetCall(node);

    if (!resetCall) {
        return null;
    }

    const fixDetail = createCallExpressionTargetFixDetail(diagnostic, node);

    if (!fixDetail) {
        return null;
    }

    const previousSibling = siblings[insertionIndex - 1] ?? node;
    const nextSibling = siblings[insertionIndex] ?? null;
    const shouldInsertSeparator =
        !nextSibling &&
        insertionIndex > property + 1 &&
        !isTriviallyIgnorableStatement(previousSibling) &&
        !hasOriginalBlankLineBetween(previousSibling, nextSibling) &&
        !isAlphaTestDisableCall(nextSibling);

    if (shouldInsertSeparator) {
        insertionIndex = insertSeparatorStatementBeforeIndex(siblings, insertionIndex, previousSibling);
    }

    siblings.splice(insertionIndex, 0, resetCall);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
}

function ensureSurfaceTargetResetForGM2005({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "CallExpression") {
            const fix = ensureSurfaceTargetResetAfterCallForGM2005(node, parent, property, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureSurfaceTargetResetAfterCallForGM2005(node, parent, property, diagnostic) {
    if (!Array.isArray(parent) || typeof property !== "number") {
        return null;
    }

    if (!isSurfaceSetTargetCall(node)) {
        return null;
    }

    const siblings = parent;
    if (hasSurfaceResetBeforeNextTarget(siblings, property)) {
        return null;
    }
    let insertionIndex = siblings.length;

    for (let index = property + 1; index < siblings.length; index += 1) {
        const candidate = siblings[index];

        if (isSurfaceResetTargetCall(candidate)) {
            return null;
        }

        if (isSurfaceSetTargetCall(candidate)) {
            insertionIndex = index;
            break;
        }

        if (isTerminatingStatement(candidate)) {
            insertionIndex = index;
            break;
        }

        if (isDrawSurfaceCall(candidate)) {
            insertionIndex = index;
            break;
        }

        if (!isCallExpression(candidate)) {
            insertionIndex = index;
            break;
        }
    }

    insertionIndex = Math.max(property + 1, insertionIndex);

    const resetCall = createSurfaceResetTargetCall(node);

    if (!resetCall) {
        return null;
    }

    const fixDetail = createCallExpressionTargetFixDetail(diagnostic, node);

    if (!fixDetail) {
        return null;
    }

    siblings.splice(insertionIndex, 0, resetCall);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
}

function hasSurfaceResetBeforeNextTarget(statements, startIndex) {
    if (!Array.isArray(statements)) {
        return false;
    }

    for (let index = startIndex + 1; index < statements.length; index += 1) {
        const candidate = statements[index];

        if (isSurfaceResetTargetCall(candidate)) {
            return true;
        }

        if (isSurfaceSetTargetCall(candidate)) {
            return false;
        }
    }

    return false;
}

function removeRedundantSurfaceResetCalls(statements, startIndex) {
    if (!Array.isArray(statements)) {
        return;
    }

    for (let index = startIndex; index < statements.length; index += 1) {
        const candidate = statements[index];

        if (isSurfaceSetTargetCall(candidate)) {
            return;
        }

        if (!isSurfaceResetTargetCall(candidate)) {
            continue;
        }

        const nextSibling = statements[index + 1] ?? null;
        const shouldPreserveBlankLine = nextSibling && hasOriginalBlankLineBetween(candidate, nextSibling);

        statements.splice(index, 1);
        index -= 1;

        if (shouldPreserveBlankLine && nextSibling) {
            const insertionIndex = index + 1;
            const followingNode = statements[insertionIndex];

            if (followingNode?.type !== "EmptyStatement") {
                insertSeparatorStatementBeforeIndex(statements, insertionIndex, nextSibling);
            }
        }
    }
}

function ensureDrawVertexCallsAreWrapped({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            const normalizedFixes = normalizeDrawVertexStatements(node, diagnostic, ast);

            if (Core.isNonEmptyArray(normalizedFixes)) {
                fixes.push(...normalizedFixes);
            }

            for (const child of node) {
                visit(child);
            }

            return;
        }

        if (typeof node !== "object") {
            return;
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

function normalizeDrawVertexStatements(statements, diagnostic, ast) {
    if (!Core.isNonEmptyArray(statements)) {
        return [];
    }

    const fixes = [];

    for (let index = 0; index < statements.length; index += 1) {
        const statement = statements[index];

        if (!isDrawVertexCall(statement)) {
            continue;
        }

        if (hasOpenPrimitiveBefore(statements, index)) {
            continue;
        }

        let blockEnd = index;

        while (blockEnd + 1 < statements.length && isDrawVertexCall(statements[blockEnd + 1])) {
            blockEnd += 1;
        }

        const candidateBegin = statements[blockEnd + 1];

        if (!isDrawPrimitiveBeginCall(candidateBegin)) {
            continue;
        }

        const beginIndex = blockEnd + 1;
        const endIndex = findMatchingDrawPrimitiveEnd(statements, beginIndex + 1);

        if (endIndex === -1) {
            continue;
        }

        const primitiveEnd = statements[endIndex] ?? null;
        const vertexStatements = statements.slice(index, blockEnd + 1);
        const fixDetails = [];

        for (const vertex of vertexStatements) {
            const fixDetail = createFeatherFixDetail(diagnostic, {
                target: getDrawCallName(vertex),
                range: {
                    start: Core.getNodeStartIndex(vertex),
                    end: Core.getNodeEndIndex(vertex)
                }
            });

            if (!fixDetail) {
                continue;
            }

            attachFeatherFixMetadata(vertex, [fixDetail]);
            fixDetails.push(fixDetail);
        }

        if (fixDetails.length === 0) {
            continue;
        }

        const [primitiveBegin] = statements.splice(beginIndex, 1);

        if (!primitiveBegin) {
            continue;
        }

        if (primitiveEnd) {
            primitiveEnd._featherSuppressLeadingEmptyLine = true;
        }

        statements.splice(index, 0, primitiveBegin);
        attachLeadingCommentsToWrappedPrimitive({
            ast,
            primitiveBegin,
            vertexStatements,
            statements,
            insertionIndex: index
        });
        fixes.push(...fixDetails);

        index += vertexStatements.length;
    }

    return fixes;
}

function attachLeadingCommentsToWrappedPrimitive({
    ast,
    primitiveBegin,
    vertexStatements,
    statements,
    insertionIndex
}) {
    if (
        !ast ||
        !primitiveBegin ||
        !Array.isArray(vertexStatements) ||
        vertexStatements.length === 0 ||
        !Array.isArray(statements) ||
        typeof insertionIndex !== "number"
    ) {
        return;
    }

    const comments = Core.collectCommentNodes(ast);

    if (!Core.isNonEmptyArray(comments)) {
        return;
    }

    const firstVertex = vertexStatements[0];

    const firstVertexStart = Core.getNodeStartIndex(firstVertex);

    if (typeof firstVertexStart !== "number") {
        return;
    }

    const precedingStatement = insertionIndex > 0 ? (statements[insertionIndex - 1] ?? null) : null;

    const previousEndIndex = precedingStatement === null ? null : Core.getNodeEndIndex(precedingStatement);

    for (const comment of comments) {
        if (!Core.isNode(comment) || (comment as any).type !== "CommentLine") {
            continue;
        }

        const mutableComment = comment as MutableGameMakerAstNode;

        if (mutableComment._featherHoistedTarget) {
            continue;
        }

        const commentStartIndex = Core.getNodeStartIndex(comment);
        const commentEndIndex = Core.getNodeEndIndex(comment);

        if (typeof commentStartIndex !== "number" || typeof commentEndIndex !== "number") {
            continue;
        }

        if (commentEndIndex > firstVertexStart) {
            continue;
        }

        if (previousEndIndex !== null && commentStartIndex < previousEndIndex) {
            continue;
        }

        const trimmedValue = Core.getCommentValue(comment, { trim: true });
        const isDocStyleComment = trimmedValue.startsWith("/");
        const isBlockStartComment = previousEndIndex === null;

        if (!isDocStyleComment && !isBlockStartComment) {
            continue;
        }

        mutableComment._featherHoistedTarget = primitiveBegin;
    }
}

function hasOpenPrimitiveBefore(statements, index) {
    let depth = 0;

    for (let cursor = 0; cursor < index; cursor += 1) {
        const statement = statements[cursor];

        if (isDrawPrimitiveBeginCall(statement)) {
            depth += 1;
            continue;
        }

        if (isDrawPrimitiveEndCall(statement) && depth > 0) {
            depth -= 1;
        }
    }

    return depth > 0;
}

function findMatchingDrawPrimitiveEnd(statements, startIndex) {
    if (!Array.isArray(statements)) {
        return -1;
    }

    let depth = 0;

    for (let index = startIndex; index < statements.length; index += 1) {
        const statement = statements[index];

        if (isDrawPrimitiveBeginCall(statement)) {
            depth += 1;
            continue;
        }

        if (isDrawPrimitiveEndCall(statement)) {
            if (depth === 0) {
                return index;
            }

            depth -= 1;
        }
    }

    return -1;
}

function isDrawVertexCall(node) {
    const name = getDrawCallName(node);

    if (!name) {
        return false;
    }

    return name.startsWith("draw_vertex");
}

function getDrawCallName(node) {
    if (!node || node.type !== "CallExpression") {
        return null;
    }

    const object = node.object;

    if (!object || object.type !== "Identifier") {
        return null;
    }

    return object.name ?? null;
}

function ensureCullModeIsReset({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "CallExpression") {
            const fix = ensureCullModeResetAfterCall(node, parent, property, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureCullModeResetAfterCall(node, parent, property, diagnostic) {
    if (!Array.isArray(parent) || typeof property !== "number") {
        return null;
    }

    if (!node || node.type !== "CallExpression") {
        return null;
    }

    if (!Core.isIdentifierWithName(node.object, "gpu_set_cullmode")) {
        return null;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return null;
    }

    const [modeArgument] = args;

    if (!Core.isIdentifierNode(modeArgument)) {
        return null;
    }

    if (Core.isIdentifierWithName(modeArgument, "cull_noculling")) {
        return null;
    }

    const siblings = parent;
    const insertionInfo = computeStateResetInsertionIndex({
        siblings,
        startIndex: property + 1,
        isResetCall: isCullModeResetCall
    });

    if (!insertionInfo) {
        return null;
    }

    if (insertionInfo.alreadyReset) {
        return null;
    }

    const resetCall = createCullModeResetCall(node);

    if (!resetCall) {
        return null;
    }

    const fixDetail = createCallExpressionTargetFixDetail(diagnostic, node);

    if (!fixDetail) {
        return null;
    }

    const insertionIndex = typeof insertionInfo.index === "number" ? insertionInfo.index : siblings.length;

    for (let index = property + 1; index < insertionIndex; index += 1) {
        const candidate = siblings[index];

        if (!candidate || isTriviallyIgnorableStatement(candidate)) {
            continue;
        }

        markStatementToSuppressLeadingEmptyLine(candidate);
    }

    markStatementToSuppressFollowingEmptyLine(node);

    siblings.splice(insertionIndex, 0, resetCall);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
}

function ensureVertexBeginPrecedesEnd({ ast, diagnostic, options }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        const fix = ensureVertexBeginBeforeVertexEndCall(node, parent, property, diagnostic, options);

        if (fix) {
            fixes.push(fix);
            return;
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureVertexBeginBeforeVertexEndCall(node, parent, property, diagnostic, options) {
    if (!Array.isArray(parent) || typeof property !== "number") {
        return null;
    }

    if (!node || node.type !== "CallExpression") {
        return null;
    }

    if (!Core.isIdentifierWithName(node.object, "vertex_end")) {
        return null;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return null;
    }

    const bufferArgument = args[0];

    if (!Core.isIdentifierNode(bufferArgument)) {
        return null;
    }

    const bufferName = bufferArgument.name;

    for (let index = property - 1; index >= 0; index -= 1) {
        const sibling = parent[index];

        if (!sibling || typeof sibling !== "object") {
            continue;
        }

        if (isVertexBeginCallForBuffer(sibling, bufferName)) {
            return null;
        }
    }

    const shouldRemoveStandaloneVertexEnd = options?.removeStandaloneVertexEnd === true;

    const vertexBeginCall = shouldRemoveStandaloneVertexEnd
        ? null
        : createVertexBeginCall({
              diagnostic,
              referenceCall: node,
              bufferIdentifier: bufferArgument
          });

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: typeof bufferName === "string" ? bufferName : null,
        range: {
            start: Core.getNodeStartIndex(node),
            end: Core.getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    const shouldInsertVertexBegin = !shouldRemoveStandaloneVertexEnd && !!vertexBeginCall;

    if (shouldInsertVertexBegin) {
        parent.splice(property, 0, vertexBeginCall);
        attachFeatherFixMetadata(vertexBeginCall, [fixDetail]);
        attachFeatherFixMetadata(node, [fixDetail]);
        markStatementToSuppressFollowingEmptyLine(vertexBeginCall);
        markStatementToSuppressLeadingEmptyLine(node);
        return fixDetail;
    }

    parent.splice(property, 1);
    return fixDetail;
}

function isVertexBeginCallForBuffer(node, bufferName) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (!Core.isIdentifierWithName(node.object, "vertex_begin")) {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return false;
    }

    const firstArgument = args[0];

    if (!Core.isIdentifierNode(firstArgument)) {
        return false;
    }

    return firstArgument.name === bufferName;
}

function ensureVertexBuffersAreClosed({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "CallExpression") {
            const fix = ensureVertexEndInserted(node, parent, property, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureVertexEndInserted(node, parent, property, diagnostic) {
    if (!Array.isArray(parent) || typeof property !== "number") {
        return null;
    }

    if (!node || node.type !== "CallExpression") {
        return null;
    }

    if (!Core.isIdentifierWithName(node.object, "vertex_begin")) {
        return null;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return null;
    }

    const bufferArgument = args[0];

    if (!Core.isIdentifierNode(bufferArgument)) {
        return null;
    }

    const bufferName = bufferArgument.name;
    const siblings = parent;

    for (let index = property + 1; index < siblings.length; index += 1) {
        const sibling = siblings[index];

        if (isVertexEndCallForBuffer(sibling, bufferName)) {
            return null;
        }
    }

    const vertexEndCall = createVertexEndCall(node, bufferArgument);

    if (!vertexEndCall) {
        return null;
    }

    const insertionIndex = findVertexEndInsertionIndex({
        siblings,
        startIndex: property + 1,
        bufferName
    });

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: bufferName ?? null,
        range: {
            start: Core.getNodeStartIndex(node),
            end: Core.getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    siblings.splice(insertionIndex, 0, vertexEndCall);
    attachFeatherFixMetadata(vertexEndCall, [fixDetail]);
    markStatementToSuppressLeadingEmptyLine(vertexEndCall);

    const previousSibling = siblings[property - 1] ?? null;

    if (previousSibling) {
        markStatementToSuppressFollowingEmptyLine(previousSibling);
    }

    return fixDetail;
}

function findVertexEndInsertionIndex({ siblings, startIndex, bufferName }) {
    if (!Array.isArray(siblings)) {
        return 0;
    }

    let index = typeof startIndex === "number" ? startIndex : 0;

    while (index < siblings.length) {
        const node = siblings[index];

        if (!node || typeof node !== "object") {
            break;
        }

        if (isVertexEndCallForBuffer(node, bufferName)) {
            break;
        }

        if (!isCallExpression(node)) {
            break;
        }

        if (isVertexSubmitCallForBuffer(node, bufferName)) {
            break;
        }

        if (!hasFirstArgumentIdentifier(node, bufferName)) {
            break;
        }

        index += 1;
    }

    return index;
}

function isCallExpression(node: unknown): node is { type: "CallExpression"; object?: unknown } {
    return (
        !!node &&
        typeof (node as { type?: unknown }).type === "string" &&
        (node as { type?: unknown }).type === "CallExpression"
    );
}

function isCallExpressionWithName(node: unknown, name: Parameters<typeof Core.isIdentifierWithName>[1]) {
    if (!isCallExpression(node)) {
        return false;
    }

    return Core.isIdentifierWithName(node.object, name);
}

function hasOnlyWhitespaceBetweenNodes(previous, next, sourceText) {
    if (typeof sourceText !== "string") {
        return true;
    }

    const previousEnd = Core.getNodeEndIndex(previous);
    const nextStart = Core.getNodeStartIndex(next);

    if (typeof previousEnd !== "number" || typeof nextStart !== "number" || previousEnd >= nextStart) {
        return true;
    }

    const between = sourceText.slice(previousEnd, nextStart);

    if (between.length === 0) {
        return true;
    }

    const sanitized = between.replaceAll(";", "");

    return !Core.isNonEmptyTrimmedString(sanitized);
}

function hasFirstArgumentIdentifier(node, name) {
    if (!isCallExpression(node)) {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return false;
    }

    const firstArg = args[0];

    if (!Core.isIdentifierNode(firstArg)) {
        return false;
    }

    if (typeof name !== "string") {
        return true;
    }

    return firstArg.name === name;
}

function isVertexSubmitCallForBuffer(node, bufferName) {
    if (!isCallExpression(node)) {
        return false;
    }

    if (!Core.isIdentifierWithName(node.object, "vertex_submit")) {
        return false;
    }

    return hasFirstArgumentIdentifier(node, bufferName);
}

function isVertexEndCallForBuffer(node, bufferName) {
    if (!isCallExpression(node)) {
        return false;
    }

    if (!Core.isIdentifierWithName(node.object, "vertex_end")) {
        return false;
    }

    if (typeof bufferName !== "string") {
        return true;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return false;
    }

    const firstArg = args[0];

    return Core.isIdentifierNode(firstArg) && firstArg.name === bufferName;
}

function createVertexEndCall(template, bufferIdentifier) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    if (!Core.isIdentifierNode(bufferIdentifier)) {
        return null;
    }

    const callExpression = {
        type: "CallExpression",
        object: Core.createIdentifierNode("vertex_end", template),
        arguments: [Core.cloneIdentifier(bufferIdentifier)]
    };

    Core.assignClonedLocation(callExpression, template);

    return callExpression;
}

function createVertexBeginCall({ diagnostic, referenceCall, bufferIdentifier }) {
    if (!Core.isIdentifierNode(bufferIdentifier)) {
        return null;
    }

    const callExpression = {
        type: "CallExpression",
        object: Core.createIdentifierNode("vertex_begin", referenceCall?.object),
        arguments: []
    };

    if (!Core.isIdentifierNode(callExpression.object)) {
        return null;
    }

    const bufferClone = Core.cloneIdentifier(bufferIdentifier);

    if (!bufferClone) {
        return null;
    }

    callExpression.arguments.push(bufferClone);

    const template = getVertexBeginTemplateFromDiagnostic(diagnostic);

    if (template && Core.isNonEmptyArray(template.additionalArguments)) {
        for (const argumentTemplate of template.additionalArguments) {
            const clonedArgument = Core.cloneAstNode(argumentTemplate);

            if (clonedArgument) {
                callExpression.arguments.push(clonedArgument);
            }
        }
    }

    if (callExpression.arguments.length === 1) {
        const fallbackArgument =
            Core.createIdentifierNode("format", referenceCall?.object) ||
            Core.createIdentifierNode("format", referenceCall?.object ?? null);

        if (fallbackArgument) {
            callExpression.arguments.push(fallbackArgument);
        }
    }

    if (template) {
        Core.assignClonedLocation(callExpression, template);
    }

    if (!Object.hasOwn(callExpression, "start") || !Object.hasOwn(callExpression, "end")) {
        Core.assignClonedLocation(callExpression, referenceCall);
    }

    return callExpression;
}

function getVertexBeginTemplateFromDiagnostic(diagnostic) {
    if (!diagnostic) {
        return null;
    }

    if (VERTEX_BEGIN_TEMPLATE_CACHE.has(diagnostic)) {
        return VERTEX_BEGIN_TEMPLATE_CACHE.get(diagnostic);
    }

    const template = createVertexBeginCallTemplateFromDiagnostic(diagnostic);
    VERTEX_BEGIN_TEMPLATE_CACHE.set(diagnostic, template);
    return template;
}

function createVertexBeginCallTemplateFromDiagnostic(diagnostic) {
    const example = typeof diagnostic?.goodExample === "string" ? diagnostic.goodExample : null;

    if (!example) {
        return null;
    }

    try {
        const exampleAst = parseExample(example, {
            getLocations: true,
            simplifyLocations: false
        });
        const callExpression = findFirstCallExpression(exampleAst);

        if (!callExpression) {
            return null;
        }

        if (!Core.isIdentifierWithName(callExpression.object, "vertex_begin")) {
            return null;
        }

        const args = Core.getCallExpressionArguments(callExpression);

        if (args.length <= 1) {
            return { additionalArguments: [] };
        }

        const additionalArguments = args
            .slice(1)
            .map((argument) => cloneNodeWithoutLocations(argument))
            .filter((argument) => !!argument);

        return { additionalArguments };
    } catch {
        return null;
    }
}
function ensureLocalVariablesAreDeclaredBeforeUse({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];
    const ancestors = [];
    const visitedNodes = new WeakSet();

    const visitNode = (node, parent, property, container, index) => {
        if (!node || typeof node !== "object") {
            return;
        }

        if (visitedNodes.has(node)) {
            return;
        }

        visitedNodes.add(node);

        const context = { node, parent, property, container, index };
        ancestors.push(context);

        const action = handleLocalVariableDeclarationPatterns({
            context,
            ancestors,
            diagnostic,
            fixes
        });

        if (action?.skipChildren) {
            ancestors.pop();
            return;
        }

        for (const [key, value] of Object.entries(node)) {
            if (!value || typeof value !== "object") {
                continue;
            }

            if (Array.isArray(value)) {
                for (let childIndex = 0; childIndex < value.length; childIndex += 1) {
                    visitNode(value[childIndex], node, key, value, childIndex);
                }
                continue;
            }

            visitNode(value, node, key, null, null);
        }

        ancestors.pop();
    };

    visitNode(ast, null, null, null, null);

    return fixes;
}

function handleLocalVariableDeclarationPatterns({ context, ancestors, diagnostic, fixes }) {
    const { node, container, index } = context;

    if (!node || typeof node !== "object") {
        return null;
    }

    if (node.type !== "VariableDeclaration" || node.kind !== "var") {
        return null;
    }

    const declarator = Core.getSingleVariableDeclarator(node);

    if (!declarator) {
        return null;
    }

    const variableName = getDeclaratorName(declarator);

    if (!variableName) {
        return null;
    }

    if (container && Array.isArray(container) && typeof index === "number") {
        const precedingNode = container[index - 1];
        const fixDetail = convertPrecedingAssignmentToVariableDeclaration({
            assignmentNode: precedingNode,
            declarationNode: node,
            container,
            assignmentIndex: index - 1,
            declarationIndex: index,
            diagnostic,
            variableName
        });

        if (fixDetail) {
            fixes.push(fixDetail);
            return { skipChildren: true };
        }
    }

    if (context.parent?.type !== "BlockStatement") {
        return null;
    }

    const blockBody = Array.isArray(container) ? container : null;

    if (!blockBody) {
        return null;
    }

    const owningStatementContext = findNearestStatementContext(ancestors.slice(0, -1));

    if (!owningStatementContext) {
        return null;
    }

    const { container: statementContainer, index: statementIndex } = owningStatementContext;

    if (!statementContainer || !Array.isArray(statementContainer) || typeof statementIndex !== "number") {
        return null;
    }

    if (hasVariableDeclarationInContainer(statementContainer, variableName, statementIndex)) {
        return null;
    }

    if (!referencesIdentifierAfterIndex(statementContainer, variableName, statementIndex + 1)) {
        return null;
    }

    const rootAst = ancestors.length > 0 ? ancestors[0]?.node : null;

    const fixDetail = hoistVariableDeclarationOutOfBlock({
        declarationNode: node,
        blockBody,
        declarationIndex: index,
        statementContainer,
        statementIndex,
        diagnostic,
        variableName,
        ast: rootAst
    });

    if (fixDetail) {
        fixes.push(fixDetail);
        return { skipChildren: true };
    }

    return null;
}

function getDeclaratorName(declarator) {
    const identifier = declarator?.id;

    if (!identifier || identifier.type !== "Identifier") {
        return null;
    }

    return identifier.name ?? null;
}

function convertPrecedingAssignmentToVariableDeclaration({
    assignmentNode,
    declarationNode,
    container,
    assignmentIndex,
    declarationIndex,
    diagnostic,
    variableName
}) {
    if (!assignmentNode || assignmentNode.type !== "AssignmentExpression" || assignmentNode.operator !== "=") {
        return null;
    }

    if (!container || !Array.isArray(container)) {
        return null;
    }

    if (typeof assignmentIndex !== "number" || typeof declarationIndex !== "number") {
        return null;
    }

    if (
        !assignmentNode.left ||
        assignmentNode.left.type !== "Identifier" ||
        assignmentNode.left.name !== variableName
    ) {
        return null;
    }

    const declarator = Core.getSingleVariableDeclarator(declarationNode);

    if (!declarator || !declarator.init) {
        return null;
    }

    const variableDeclaration = createVariableDeclarationFromAssignment(assignmentNode, declarator);

    if (!variableDeclaration) {
        return null;
    }

    const assignmentExpression = createAssignmentFromDeclarator(declarator, declarationNode);

    if (!assignmentExpression) {
        return null;
    }

    const rangeStart = Core.getNodeStartIndex(assignmentNode);
    const rangeEnd = Core.getNodeEndIndex(declarationNode);

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: variableName,
        range: {
            start: rangeStart,
            end: rangeEnd
        }
    });

    if (!fixDetail) {
        return null;
    }

    container[assignmentIndex] = variableDeclaration;
    container[declarationIndex] = assignmentExpression;

    copyCommentMetadata(assignmentNode, variableDeclaration);
    copyCommentMetadata(declarationNode, assignmentExpression);

    attachFeatherFixMetadata(variableDeclaration, [fixDetail]);
    attachFeatherFixMetadata(assignmentExpression, [fixDetail]);

    return fixDetail;
}

function createVariableDeclarationFromAssignment(assignmentNode, declaratorTemplate) {
    if (!assignmentNode || assignmentNode.type !== "AssignmentExpression") {
        return null;
    }

    const identifier = Core.cloneIdentifier(assignmentNode.left);

    if (!identifier) {
        return null;
    }

    const declarator = {
        type: "VariableDeclarator",
        id: identifier,
        init: assignmentNode.right
    };

    if (declaratorTemplate && typeof declaratorTemplate === "object") {
        Core.assignClonedLocation(declarator as any, declaratorTemplate);
    }

    const declaration = {
        type: "VariableDeclaration",
        kind: "var",
        declarations: [declarator]
    };

    Core.assignClonedLocation(declaration as any, assignmentNode);

    return declaration;
}

function findNearestStatementContext(ancestors) {
    if (!Array.isArray(ancestors)) {
        return null;
    }

    for (let index = ancestors.length - 1; index >= 0; index -= 1) {
        const entry = ancestors[index];

        if (!entry || !Array.isArray(entry.container)) {
            continue;
        }

        if (typeof entry.index !== "number") {
            continue;
        }

        if (entry.node && entry.node.type === "VariableDeclaration" && entry.node.kind === "var") {
            continue;
        }

        return entry;
    }

    return null;
}

function hasVariableDeclarationInContainer(container, variableName, uptoIndex) {
    if (!Array.isArray(container) || !variableName) {
        return false;
    }

    const limit = typeof uptoIndex === "number" ? uptoIndex : container.length;

    for (let index = 0; index < limit; index += 1) {
        const node = container[index];

        if (!node || node.type !== "VariableDeclaration" || node.kind !== "var") {
            continue;
        }

        const declarations = Array.isArray(node.declarations) ? node.declarations : [];

        for (const declarator of declarations) {
            if (!declarator || declarator.type !== "VariableDeclarator") {
                continue;
            }

            if (declarator.id?.type === "Identifier" && declarator.id.name === variableName) {
                return true;
            }
        }
    }

    return false;
}

function hoistVariableDeclarationOutOfBlock({
    declarationNode,
    blockBody,
    declarationIndex,
    statementContainer,
    statementIndex,
    diagnostic,
    variableName,
    ast
}) {
    if (!declarationNode || declarationNode.type !== "VariableDeclaration") {
        return null;
    }

    if (!Array.isArray(blockBody) || typeof declarationIndex !== "number") {
        return null;
    }

    if (!Array.isArray(statementContainer) || typeof statementIndex !== "number") {
        return null;
    }

    const declarator = Core.getSingleVariableDeclarator(declarationNode);

    if (!declarator || !declarator.init) {
        return null;
    }

    const hoistedDeclaration = createHoistedVariableDeclaration(declarator);

    if (!hoistedDeclaration) {
        return null;
    }

    const assignment = createAssignmentFromDeclarator(declarator, declarationNode);

    if (!assignment) {
        return null;
    }

    const rangeStart = Core.getNodeStartIndex(declarationNode);
    const owningStatement = statementContainer[statementIndex];
    const precedingStatement = statementIndex > 0 ? statementContainer[statementIndex - 1] : null;
    const rangeEnd = Core.getNodeEndIndex(owningStatement ?? declarationNode);

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: variableName,
        range: {
            start: rangeStart,
            end: rangeEnd
        }
    });

    if (!fixDetail) {
        return null;
    }

    statementContainer.splice(statementIndex, 0, hoistedDeclaration);
    blockBody[declarationIndex] = assignment;

    attachLeadingCommentsToHoistedDeclaration({
        ast,
        hoistedDeclaration,
        owningStatement,
        precedingStatement
    });

    copyCommentMetadata(declarationNode, assignment);

    attachFeatherFixMetadata(hoistedDeclaration, [fixDetail]);
    attachFeatherFixMetadata(assignment, [fixDetail]);

    return fixDetail;
}

function createHoistedVariableDeclaration(declaratorTemplate) {
    if (!declaratorTemplate || declaratorTemplate.type !== "VariableDeclarator") {
        return null;
    }

    const identifier = Core.cloneIdentifier(declaratorTemplate.id);

    if (!identifier) {
        return null;
    }

    const declarator = {
        type: "VariableDeclarator",
        id: identifier,
        init: null
    };

    if (Core.isObjectLike(declaratorTemplate)) {
        Core.assignClonedLocation(declarator as any, declaratorTemplate);
    }

    const declaration = {
        type: "VariableDeclaration",
        kind: "var",
        declarations: [declarator]
    };

    if (Core.isObjectLike(declaratorTemplate)) {
        Core.assignClonedLocation(declaration as any, declaratorTemplate);
    }

    return declaration;
}

function attachLeadingCommentsToHoistedDeclaration({ ast, hoistedDeclaration, owningStatement, precedingStatement }) {
    if (!ast || !hoistedDeclaration || !owningStatement) {
        return;
    }

    const comments = Core.collectCommentNodes(ast);

    if (!Core.isNonEmptyArray(comments)) {
        return;
    }

    const owningStartIndex = Core.getNodeStartIndex(owningStatement);

    if (typeof owningStartIndex !== "number") {
        return;
    }

    const previousEndIndex = precedingStatement === null ? null : Core.getNodeEndIndex(precedingStatement);

    let attachedComment = false;

    for (const comment of comments) {
        if (!comment || comment.type !== "CommentLine") {
            continue;
        }

        if (comment._featherHoistedTarget) {
            continue;
        }

        const commentStartIndex = Core.getNodeStartIndex(comment);
        const commentEndIndex = Core.getNodeEndIndex(comment);

        if (typeof commentStartIndex !== "number" || typeof commentEndIndex !== "number") {
            continue;
        }

        if (commentEndIndex > owningStartIndex) {
            continue;
        }

        if (previousEndIndex !== null && commentStartIndex < previousEndIndex) {
            continue;
        }

        const trimmedValue = Core.getCommentValue(comment, { trim: true });

        if (!trimmedValue) {
            continue;
        }

        comment._featherHoistedTarget = hoistedDeclaration;
        attachedComment = true;
    }

    if (attachedComment) {
        hoistedDeclaration._featherForceFollowingEmptyLine = true;
    }
}

function removeInvalidEventInheritedCalls({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visitArray = (array, owner, ownerKey) => {
        if (!Array.isArray(array)) {
            return;
        }

        for (let index = 0; index < array.length; ) {
            const removed = visit(array[index], array, index, owner, ownerKey);

            if (!removed) {
                index += 1;
            }
        }
    };

    const visit = (node, parent, property, owner, ownerKey) => {
        if (!node) {
            return false;
        }

        if (Array.isArray(node)) {
            visitArray(node, owner, ownerKey);
            return false;
        }

        if (typeof node !== "object") {
            return false;
        }

        if (node.type === "CallExpression") {
            const fix = removeEventInheritedCall(node, parent, property, owner, ownerKey, diagnostic);

            if (fix) {
                fixes.push(fix);
                return true;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (!value || typeof value !== "object") {
                continue;
            }

            if (Array.isArray(value)) {
                visitArray(value, node, key);
            } else {
                visit(value, node, key, node, key);
            }
        }

        return false;
    };

    visit(ast, null, null, null, null);

    return fixes;
}

function removeEventInheritedCall(node, parent, property, owner, ownerKey, diagnostic) {
    if (!Array.isArray(parent) || typeof property !== "number") {
        return null;
    }

    if (!isStatementContainer(owner, ownerKey)) {
        return null;
    }

    if (!isEventInheritedCall(node)) {
        return null;
    }

    const fixDetail = createCallExpressionTargetFixDetail(diagnostic, node);

    if (!fixDetail) {
        return null;
    }

    parent.splice(property, 1);

    return fixDetail;
}

function ensureColourWriteEnableIsReset({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "CallExpression") {
            const fix = ensureColourWriteEnableResetAfterCall(node, parent, property, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureColourWriteEnableResetAfterCall(node, parent, property, diagnostic) {
    if (!Array.isArray(parent) || typeof property !== "number") {
        return null;
    }

    if (!node || node.type !== "CallExpression") {
        return null;
    }

    if (!Core.isIdentifierWithName(node.object, "gpu_set_colourwriteenable")) {
        return null;
    }

    const args = Core.getCallExpressionArguments(node);

    if (!hasDisabledColourChannel(args)) {
        return null;
    }

    const siblings = parent;

    const insertionInfo = computeStateResetInsertionIndex({
        siblings,
        startIndex: property + 1,
        isResetCall: isColourWriteEnableResetCall
    });

    if (!insertionInfo) {
        return null;
    }

    if (insertionInfo.alreadyReset) {
        return null;
    }

    const resetCall = createColourWriteEnableResetCall(node);

    if (!resetCall) {
        return null;
    }

    const fixDetail = createCallExpressionTargetFixDetail(diagnostic, node);

    if (!fixDetail) {
        return null;
    }

    let insertionIndex = insertionInfo.index;

    if (typeof insertionIndex !== "number") {
        return null;
    }

    const cleanupStartIndex = property + 1;

    for (let index = cleanupStartIndex; index < insertionIndex; ) {
        const candidate = siblings[index];

        if (isTriviallyIgnorableStatement(candidate)) {
            siblings.splice(index, 1);
            insertionIndex -= 1;
            continue;
        }

        markStatementToSuppressLeadingEmptyLine(candidate);
        index += 1;
    }

    markStatementToSuppressFollowingEmptyLine(node);

    const previousSibling = siblings[insertionIndex - 1] ?? node;
    const nextSibling = siblings[insertionIndex] ?? null;
    const hasOriginalSeparator = nextSibling
        ? hasOriginalBlankLineBetween(previousSibling, nextSibling)
        : hasOriginalBlankLineBetween(node, previousSibling);
    const shouldInsertSeparator =
        insertionIndex > property + 1 &&
        !isTriviallyIgnorableStatement(previousSibling) &&
        nextSibling &&
        !isTriviallyIgnorableStatement(nextSibling) &&
        !hasOriginalSeparator;

    if (shouldInsertSeparator) {
        insertionIndex = insertSeparatorStatementBeforeIndex(siblings, insertionIndex, previousSibling);
    }

    markStatementToSuppressLeadingEmptyLine(resetCall);
    siblings.splice(insertionIndex, 0, resetCall);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
}

function ensureRequiredArgumentProvided({ ast, diagnostic, callTemplate }) {
    if (
        !diagnostic ||
        !ast ||
        typeof ast !== "object" ||
        !callTemplate?.functionName ||
        !callTemplate.argumentTemplate
    ) {
        return [];
    }

    const fixes = [];

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                visit(item);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "CallExpression") {
            const fix = ensureCallHasRequiredArgument(node, diagnostic, callTemplate);

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

function ensureCallHasRequiredArgument(node, diagnostic, callTemplate) {
    if (!node || node.type !== "CallExpression") {
        return null;
    }

    if (!Core.isIdentifierWithName(node.object, callTemplate.functionName)) {
        return null;
    }

    if (Core.isNonEmptyArray(node.arguments)) {
        return null;
    }

    const argumentNode = cloneNodeWithoutLocations(callTemplate.argumentTemplate);

    if (!argumentNode || typeof argumentNode !== "object") {
        return null;
    }

    const fixDetail = createCallExpressionTargetFixDetail(diagnostic, node);

    if (!fixDetail) {
        return null;
    }

    if (!Array.isArray(node.arguments)) {
        node.arguments = [];
    }

    node.arguments.push(argumentNode);
    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

function createFunctionCallTemplateFromDiagnostic(diagnostic) {
    const example = typeof diagnostic?.goodExample === "string" ? diagnostic.goodExample : null;

    if (!example) {
        return null;
    }

    try {
        const exampleAst = parseExample(example, {
            getLocations: true,
            simplifyLocations: false
        });
        const callExpression = findFirstCallExpression(exampleAst);

        if (!callExpression || !Core.isIdentifierNode(callExpression.object)) {
            return null;
        }

        const args = Core.getCallExpressionArguments(callExpression);

        if (args.length === 0) {
            return null;
        }

        return {
            functionName: callExpression.object.name,
            argumentTemplate: cloneNodeWithoutLocations(args[0])
        };
    } catch {
        return null;
    }
}

function findFirstCallExpression(node) {
    if (!node) {
        return null;
    }

    if (Array.isArray(node)) {
        for (const item of node) {
            const result = findFirstCallExpression(item);

            if (result) {
                return result;
            }
        }

        return null;
    }

    if (typeof node !== "object") {
        return null;
    }

    if (node.type === "CallExpression") {
        return node;
    }

    for (const value of Object.values(node)) {
        const result = findFirstCallExpression(value);

        if (result) {
            return result;
        }
    }

    return null;
}

/**
 * Creates a deep clone of an AST node, stripping all location metadata.
 *
 * PURPOSE: Location information (start, end, line, column) is specific to the original
 * source text. When creating synthetic nodes or transplanting nodes to different contexts,
 * we need clean copies without stale location data that would point to the wrong source
 * positions.
 *
 * LOCATION SMELL: This is a general-purpose AST utility that doesn't belong in the
 * Feather-fixes file. It should live in Core alongside other node manipulation helpers
 * like createIdentifierNode, cloneNode, and getNodeStartIndex.
 *
 * RECOMMENDATION: Move this function to src/core/src/ast/node-utils.ts (or similar) and
 * export it as part of the Core API. Update all imports in this file and elsewhere to
 * use Core.cloneNodeWithoutLocations.
 *
 * WHAT WOULD BREAK: Leaving general utilities scattered across domain-specific files
 * makes them hard to discover and leads to duplication (someone else might write a
 * similar function in another package). Centralizing AST utilities in Core ensures
 * consistent behavior and makes the codebase easier to navigate.
 */
function cloneNodeWithoutLocations(node) {
    const clonedNode = Core.cloneAstNode(node);

    if (clonedNode === null) {
        return node === undefined ? undefined : null;
    }

    if (typeof clonedNode !== "object") {
        return clonedNode;
    }

    Core.removeLocationMetadata(clonedNode);
    return clonedNode;
}

function ensureNumericOperationsUseRealLiteralCoercion({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];
    const stringLiteralAssignments = new Set();

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const child of node) {
                visit(child);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "AssignmentExpression") {
            recordIdentifierStringAssignment(node.left, node.right, stringLiteralAssignments);
        }

        if (node.type === "VariableDeclarator") {
            recordIdentifierStringAssignment(node.id, node.init, stringLiteralAssignments);
        }

        if (node.type === "BinaryExpression") {
            const fix = coerceStringLiteralsInBinaryExpression(node, diagnostic, stringLiteralAssignments);

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

function coerceStringLiteralsInBinaryExpression(node, diagnostic, stringLiteralAssignments) {
    if (!node || node.type !== "BinaryExpression") {
        return null;
    }

    if (node.operator !== "+") {
        return null;
    }

    const leftLiteral = isCoercibleStringLiteral(node.left) ? node.left : null;
    const rightLiteral = isCoercibleStringLiteral(node.right) ? node.right : null;

    let mutated = false;

    if (!leftLiteral && !rightLiteral) {
        const leftIsNumeric = isNumericLiteralNode(node.left);
        const rightIsNumeric = isNumericLiteralNode(node.right);

        const leftIdentifier = getIdentifierName(node.left);
        const rightIdentifier = getIdentifierName(node.right);

        const leftTracked = typeof leftIdentifier === "string" && stringLiteralAssignments.has(leftIdentifier);
        const rightTracked = typeof rightIdentifier === "string" && stringLiteralAssignments.has(rightIdentifier);

        if (leftIsNumeric && rightTracked && canWrapOperandWithReal(node.right)) {
            node.right = createRealCoercionCall(node.right);
            mutated = true;
        } else if (rightIsNumeric && leftTracked && canWrapOperandWithReal(node.left)) {
            node.left = createRealCoercionCall(node.left);
            mutated = true;
        }
    }

    if (leftLiteral) {
        node.left = createRealCoercionCall(leftLiteral);
        mutated = true;
    }

    if (rightLiteral) {
        node.right = createRealCoercionCall(rightLiteral);
        mutated = true;
    }

    if (!mutated) {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: node.operator ?? null,
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

function isNumericLiteralNode(node) {
    if (!node || node.type !== "Literal") {
        return false;
    }

    const rawValue = typeof node.value === "string" ? node.value : null;

    if (!rawValue) {
        return false;
    }

    return NUMERIC_STRING_LITERAL_PATTERN.test(rawValue);
}

function canWrapOperandWithReal(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    if (node.type === "CallExpression") {
        const object = node.object;
        if (object && object.type === "Identifier" && object.name === "real") {
            return false;
        }
    }

    return true;
}

function getIdentifierName(node) {
    if (Core.isIdentifierNode(node) && typeof node.name === "string") {
        return node.name;
    }

    return null;
}

function isCoercibleStringLiteral(node) {
    if (!node || node.type !== "Literal") {
        return false;
    }

    const rawValue = typeof node.value === "string" ? node.value : null;

    if (!rawValue) {
        return false;
    }

    let literalText = null;

    if (rawValue.startsWith('@"') && rawValue.endsWith('"')) {
        literalText = rawValue.slice(2, -1);
    } else if (rawValue.length >= 2) {
        const startingQuote = rawValue[0];
        const endingQuote = rawValue.at(-1);

        if ((startingQuote === '"' || startingQuote === "'") && startingQuote === endingQuote) {
            literalText = Core.stripStringQuotes(rawValue);
        }
    }

    if (literalText === undefined) {
        return false;
    }

    const trimmed = Core.toTrimmedString(literalText);

    if (trimmed.length === 0) {
        return false;
    }

    return NUMERIC_STRING_LITERAL_PATTERN.test(trimmed);
}

function recordIdentifierStringAssignment(identifier, expression, assignments) {
    const name = getIdentifierName(identifier);

    if (!name || !assignments) {
        return;
    }

    if (isStringLiteralNode(expression)) {
        assignments.add(name);
    } else {
        assignments.delete(name);
    }
}

function isStringLiteralNode(node) {
    if (!node || node.type !== "Literal") {
        return false;
    }

    const rawValue = typeof node.value === "string" ? node.value : null;

    if (!rawValue) {
        return false;
    }

    if (rawValue.startsWith('@"') && rawValue.endsWith('"')) {
        return true;
    }

    if (rawValue.length >= 2) {
        const startingQuote = rawValue[0];
        const endingQuote = rawValue.at(-1);

        return (startingQuote === '"' || startingQuote === "'") && startingQuote === endingQuote;
    }

    return false;
}

function createRealCoercionCall(literal) {
    const argument = cloneLiteral(literal) ?? literal;

    if (argument && typeof argument === "object") {
        argument._skipNumericStringCoercion = true;
    }

    const identifier = Core.createIdentifierNode("real", literal);

    return {
        type: "CallExpression",
        object: identifier,
        arguments: [argument],
        start: Core.cloneLocation(literal.start),
        end: Core.cloneLocation(literal.end)
    };
}

function addMissingEnumMembers({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const enumRegistry = collectEnumDeclarations(ast);

    if (enumRegistry.size === 0) {
        return [];
    }

    const fixes = [];

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const child of node) {
                visit(child);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "MemberDotExpression") {
            const fix = addMissingEnumMember(node, enumRegistry, diagnostic);

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

function collectEnumDeclarations(ast) {
    const registry = new Map();

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                visit(item);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "EnumDeclaration") {
            const enumName = node.name?.name;

            if (enumName && !registry.has(enumName)) {
                let members = Array.isArray(node.members) ? node.members : null;

                if (!members) {
                    members = [];
                    node.members = members;
                }

                const memberNames = new Set();

                for (const member of members) {
                    const memberName = member?.name?.name;
                    if (memberName) {
                        memberNames.add(memberName);
                    }
                }

                registry.set(enumName, {
                    declaration: node,
                    members,
                    memberNames
                });
            }
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                visit(value);
            }
        }
    };

    visit(ast);

    return registry;
}

function addMissingEnumMember(memberExpression, enumRegistry, diagnostic) {
    if (!memberExpression || memberExpression.type !== "MemberDotExpression") {
        return null;
    }

    const enumIdentifier = memberExpression.object;
    const memberIdentifier = memberExpression.property;

    if (!enumIdentifier || enumIdentifier.type !== "Identifier") {
        return null;
    }

    if (!memberIdentifier || memberIdentifier.type !== "Identifier") {
        return null;
    }

    const enumName = enumIdentifier.name;
    const memberName = memberIdentifier.name;

    if (!enumName || !memberName) {
        return null;
    }

    const enumInfo = enumRegistry.get(enumName);

    if (!enumInfo) {
        return null;
    }

    if (enumInfo.memberNames.has(memberName)) {
        return null;
    }

    const newMember = createEnumMember(memberName);

    if (!newMember) {
        return null;
    }

    const insertIndex = getEnumInsertionIndex(enumInfo.members);
    enumInfo.members.splice(insertIndex, 0, newMember);
    enumInfo.memberNames.add(memberName);

    const start = Core.getNodeStartIndex(memberIdentifier);
    const end = Core.getNodeEndIndex(memberIdentifier);

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: `${enumName}.${memberName}`,
        range: start !== null && end !== null ? { start, end } : null
    });

    if (!fixDetail) {
        return null;
    }

    attachFeatherFixMetadata(newMember, [fixDetail]);

    const declaration = enumInfo.declaration;
    if (declaration && typeof declaration === "object") {
        attachFeatherFixMetadata(declaration, [fixDetail]);
    }

    return fixDetail;
}

function createEnumMember(name) {
    if (typeof name !== "string" || name.length === 0) {
        return null;
    }

    return {
        type: "EnumMember",
        name: {
            type: "Identifier",
            name
        },
        initializer: null
    };
}

function getEnumInsertionIndex(members) {
    if (!Core.isNonEmptyArray(members)) {
        return Array.isArray(members) ? members.length : 0;
    }

    const lastIndex = members.length - 1;
    const lastMember = members[lastIndex];

    if (isSizeofEnumMember(lastMember)) {
        return lastIndex;
    }

    return members.length;
}

function isSizeofEnumMember(member) {
    if (!member || member.type !== "EnumMember") {
        return false;
    }

    const identifier = member.name;

    if (!identifier || identifier.type !== "Identifier") {
        return false;
    }

    return identifier.name === "SIZEOF";
}

function ensureTextureRepeatIsReset({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "CallExpression") {
            const fix = ensureTextureRepeatResetAfterCall(node, parent, property, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureTextureRepeatResetAfterCall(node, parent, property, diagnostic) {
    if (!Array.isArray(parent) || typeof property !== "number") {
        return null;
    }

    if (!node || node.type !== "CallExpression") {
        return null;
    }

    if (!Core.isIdentifierWithName(node.object, "gpu_set_texrepeat")) {
        return null;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return null;
    }

    if (!shouldResetTextureRepeat(args[0])) {
        return null;
    }

    const siblings = parent;
    let insertionIndex = siblings.length;

    for (let index = property + 1; index < siblings.length; index += 1) {
        const sibling = siblings[index];

        if (isTextureRepeatResetCall(sibling)) {
            return null;
        }

        if (!isTriviallyIgnorableStatement(sibling)) {
            insertionIndex = index + 1;
            break;
        }
    }

    const resetCall = createTextureRepeatResetCall(node);

    if (!resetCall) {
        return null;
    }

    const fixDetail = createCallExpressionTargetFixDetail(diagnostic, node);

    if (!fixDetail) {
        return null;
    }

    const previousSibling = siblings[insertionIndex - 1] ?? node;
    const nextSibling = siblings[insertionIndex] ?? null;
    const needsSeparator =
        insertionIndex > property + 1 &&
        !isTriviallyIgnorableStatement(previousSibling) &&
        nextSibling &&
        !isTriviallyIgnorableStatement(nextSibling) &&
        !hasOriginalBlankLineBetween(previousSibling, nextSibling);

    if (needsSeparator) {
        insertionIndex = insertSeparatorStatementBeforeIndex(siblings, insertionIndex, previousSibling);
    }

    siblings.splice(insertionIndex, 0, resetCall);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
}

function computeStateResetInsertionIndex({ siblings, startIndex, isResetCall }) {
    if (!Array.isArray(siblings)) {
        return null;
    }

    let insertionIndex = siblings.length;

    for (let index = startIndex; index < siblings.length; index += 1) {
        const sibling = siblings[index];

        if (typeof isResetCall === "function" && isResetCall(sibling)) {
            return { alreadyReset: true };
        }

        if (isExitLikeStatement(sibling)) {
            insertionIndex = index;
            break;
        }
    }

    while (
        insertionIndex > startIndex &&
        insertionIndex <= siblings.length &&
        isTriviallyIgnorableStatement(siblings[insertionIndex - 1])
    ) {
        insertionIndex -= 1;
    }

    return { index: insertionIndex };
}

function isExitLikeStatement(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    switch (node.type) {
        case "ReturnStatement":
        case "ThrowStatement":
        case "ExitStatement": {
            return true;
        }
        default: {
            return false;
        }
    }
}

function isTriviallyIgnorableStatement(node) {
    if (!node || typeof node !== "object") {
        return true;
    }

    if (node.type === "EmptyStatement") {
        return true;
    }

    if (Array.isArray(node)) {
        return node.length === 0;
    }

    return false;
}

function createEmptyStatementLike(template) {
    const empty = { type: "EmptyStatement" };

    Core.assignClonedLocation(empty, template);

    return empty;
}

function insertSeparatorStatementBeforeIndex(siblings, insertionIndex, referenceNode) {
    const normalizedIndex = typeof insertionIndex === "number" ? insertionIndex : 0;
    const separator = createEmptyStatementLike(referenceNode);
    const targetArray = siblings;
    const nextIndex = normalizedIndex + 1;

    targetArray.splice(normalizedIndex, 0, separator);

    return nextIndex;
}

function hasOriginalBlankLineBetween(beforeNode, afterNode) {
    const beforeEndLine = Core.getNodeEndLine(beforeNode);
    const afterStartLine = Core.getNodeStartLine(afterNode);

    if (beforeEndLine === undefined || afterStartLine === undefined) {
        return false;
    }

    return afterStartLine > beforeEndLine + 1;
}

function correctDataStructureAccessorTokens({ ast, diagnostic, metadata }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    // Context-sensitive fixes like accessor replacement require specific diagnostic instances.
    // Applying a global replacement based on the generic diagnostic example is unsafe.
    if (!metadata) {
        return [];
    }

    const entries = extractFeatherPreprocessMetadata(metadata, diagnostic.id);
    if (!entries || entries.length === 0) {
        return [];
    }

    const accessorReplacement = getAccessorReplacementFromDiagnostic(diagnostic);

    if (!accessorReplacement) {
        return [];
    }

    const { incorrectAccessor, correctAccessor } = accessorReplacement;

    if (incorrectAccessor === correctAccessor) {
        return [];
    }

    const fixes = [];

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const child of node) {
                visit(child);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "MemberIndexExpression") {
            const fix = updateMemberIndexAccessor(node, {
                incorrectAccessor,
                correctAccessor,
                diagnostic,
                entries
            });

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

function updateMemberIndexAccessor(node, { incorrectAccessor, correctAccessor, diagnostic, entries }) {
    if (!node || node.type !== "MemberIndexExpression") {
        return null;
    }

    if (typeof incorrectAccessor !== "string" || typeof correctAccessor !== "string") {
        return null;
    }

    if (node.accessor !== incorrectAccessor) {
        return null;
    }

    // Check if this node matches any of the diagnostic entries
    const nodeStart = Core.getNodeStartIndex(node);
    const nodeEnd = Core.getNodeEndIndex(node);

    const match = entries.find((entry) => {
        const range = normalizePreprocessedRange(entry);
        if (!range) {
            return false;
        }
        // Check for intersection or containment
        // The diagnostic range usually covers the accessor or the whole expression
        return (
            (range.start.index >= nodeStart && range.start.index < nodeEnd) ||
            (range.end.index > nodeStart && range.end.index <= nodeEnd) ||
            (nodeStart >= range.start.index && nodeEnd <= range.end.index)
        );
    });

    if (!match) {
        return null;
    }

    node.accessor = correctAccessor;

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: typeof node.object?.name === "string" ? node.object.name : null,
        range: {
            start: nodeStart,
            end: nodeEnd
        }
    });

    if (!fixDetail) {
        return null;
    }

    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

function getAccessorReplacementFromDiagnostic(diagnostic) {
    if (!diagnostic) {
        return null;
    }

    const incorrectAccessor = extractAccessorFromExample(diagnostic.badExample);
    const correctAccessor = extractAccessorFromExample(diagnostic.goodExample);

    if (!incorrectAccessor || !correctAccessor) {
        return null;
    }

    if (incorrectAccessor === correctAccessor) {
        return null;
    }

    return { incorrectAccessor, correctAccessor };
}

function extractAccessorFromExample(example) {
    if (typeof example !== "string" || example.length === 0) {
        return null;
    }

    for (const token of DATA_STRUCTURE_ACCESSOR_TOKENS) {
        const search = `[${token}`;

        if (example.includes(search)) {
            return search;
        }
    }

    return null;
}

function ensureFileFindSearchesAreSerialized({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];
    const state = createFileFindState();

    processStatementBlock(getProgramStatements(ast), state);

    return fixes;

    function processStatementBlock(statements, currentState) {
        if (!Array.isArray(statements) || statements.length === 0 || !currentState) {
            return;
        }

        let index = 0;

        while (index < statements.length) {
            const statement = statements[index];

            if (isFileFindCloseStatement(statement)) {
                currentState.openCount = Math.max(currentState.openCount - 1, 0);
                index += 1;
                continue;
            }

            const callNode = getFileFindFirstCallFromStatement(statement);

            if (callNode && currentState.openCount > 0) {
                const insertion = insertFileFindCloseBefore(statements, index, callNode);

                if (insertion?.fixDetail) {
                    fixes.push(insertion.fixDetail);
                    currentState.openCount = Math.max(currentState.openCount - 1, 0);
                    index += insertion.insertedBefore;
                    continue;
                }
            }

            if (callNode) {
                currentState.openCount += 1;
            }

            handleNestedStatements(statement, currentState);
            index += 1;
        }
    }

    function handleNestedStatements(statement, currentState) {
        if (!statement || typeof statement !== "object" || !currentState) {
            return;
        }

        switch (statement.type) {
            case "BlockStatement": {
                processStatementBlock(statement.body ?? [], currentState);
                break;
            }
            case "IfStatement": {
                processBranch(statement, "consequent", currentState);

                if (statement.alternate) {
                    processBranch(statement, "alternate", currentState);
                }

                break;
            }
            case "WhileStatement":
            case "RepeatStatement":
            case "DoWhileStatement":
            case "ForStatement": {
                processBranch(statement, "body", currentState);
                break;
            }
            case "SwitchStatement": {
                const cases = Array.isArray(statement.cases) ? statement.cases : [];

                for (const caseClause of cases) {
                    const branchState = cloneFileFindState(currentState);
                    processStatementBlock(caseClause?.consequent ?? [], branchState);
                }
                break;
            }
            case "TryStatement": {
                if (statement.block) {
                    processStatementBlock(statement.block.body ?? [], currentState);
                }

                if (statement.handler) {
                    processBranch(statement.handler, "body", currentState);
                }

                if (statement.finalizer) {
                    processStatementBlock(statement.finalizer.body ?? [], currentState);
                }
                break;
            }
            default: {
                break;
            }
        }
    }

    function processBranch(parent, key, currentState) {
        if (!parent || typeof parent !== "object" || !currentState) {
            return;
        }

        const statements = getBranchStatements(parent, key);

        if (!statements) {
            return;
        }

        const branchState = cloneFileFindState(currentState);
        processStatementBlock(statements, branchState);
    }

    function getBranchStatements(parent, key) {
        if (!parent || typeof parent !== "object" || !key) {
            return null;
        }

        let target = parent[key];

        if (!target) {
            return null;
        }

        if (target.type !== "BlockStatement") {
            target = ensureBlockStatement(parent, key, target);
        }

        if (!target || target.type !== "BlockStatement") {
            return null;
        }

        return Core.getBodyStatements(target);
    }

    function insertFileFindCloseBefore(statements, index, callNode) {
        if (!Array.isArray(statements) || typeof index !== "number") {
            return null;
        }

        const closeCall = createFileFindCloseCall(callNode);

        if (!closeCall) {
            return null;
        }

        const fixDetail = createFeatherFixDetail(diagnostic, {
            target: callNode?.object?.name ?? null,
            range: {
                start: Core.getNodeStartIndex(callNode),
                end: Core.getNodeEndIndex(callNode)
            }
        });

        if (!fixDetail) {
            return null;
        }

        attachFeatherFixMetadata(closeCall, [fixDetail]);
        statements.splice(index, 0, closeCall);

        return {
            fixDetail,
            insertedBefore: 1
        };
    }

    function getFileFindFirstCallFromStatement(statement) {
        if (!statement || typeof statement !== "object") {
            return null;
        }

        switch (statement.type) {
            case "CallExpression": {
                return Core.isIdentifierWithName(statement.object, "file_find_first") ? statement : null;
            }
            case "AssignmentExpression": {
                return getFileFindFirstCallFromExpression(statement.right);
            }
            case "VariableDeclaration": {
                const declarations = Array.isArray(statement.declarations) ? statement.declarations : [];

                for (const declarator of declarations) {
                    const call = getFileFindFirstCallFromExpression(declarator?.init);
                    if (call) {
                        return call;
                    }
                }
                return null;
            }
            case "ReturnStatement":
            case "ThrowStatement": {
                return getFileFindFirstCallFromExpression(statement.argument);
            }
            case "ExpressionStatement": {
                return getFileFindFirstCallFromExpression(statement.expression);
            }
            default: {
                return null;
            }
        }
    }

    function getFileFindFirstCallFromExpression(expression) {
        if (!expression || typeof expression !== "object") {
            return null;
        }

        if (expression.type === "CallExpression") {
            return Core.isIdentifierWithName(expression.object, "file_find_first") ? expression : null;
        }

        if (expression.type === "ParenthesizedExpression") {
            return getFileFindFirstCallFromExpression(expression.expression);
        }

        if (expression.type === "AssignmentExpression") {
            return getFileFindFirstCallFromExpression(expression.right);
        }

        if (expression.type === "SequenceExpression") {
            const expressions = Array.isArray(expression.expressions) ? expression.expressions : [];

            for (const item of expressions) {
                const call = getFileFindFirstCallFromExpression(item);
                if (call) {
                    return call;
                }
            }
        }

        if (expression.type === "BinaryExpression" || expression.type === "LogicalExpression") {
            const leftCall = getFileFindFirstCallFromExpression(expression.left);
            if (leftCall) {
                return leftCall;
            }

            return getFileFindFirstCallFromExpression(expression.right);
        }

        if (expression.type === "ConditionalExpression" || expression.type === "TernaryExpression") {
            const consequentCall = getFileFindFirstCallFromExpression(expression.consequent);
            if (consequentCall) {
                return consequentCall;
            }

            return getFileFindFirstCallFromExpression(expression.alternate);
        }

        return null;
    }

    function isFileFindCloseStatement(statement) {
        if (!statement || typeof statement !== "object") {
            return false;
        }

        if (statement.type === "CallExpression") {
            return Core.isIdentifierWithName(statement.object, "file_find_close");
        }

        if (statement.type === "ExpressionStatement") {
            return isFileFindCloseStatement(statement.expression);
        }

        if (statement.type === "ReturnStatement" || statement.type === "ThrowStatement") {
            return isFileFindCloseStatement(statement.argument);
        }

        return false;
    }

    function getProgramStatements(node) {
        if (!Core.isNode(node)) {
            return [];
        }

        if (Array.isArray(node.body)) {
            return node.body;
        }

        return Core.getBodyStatements(node);
    }

    function createFileFindState() {
        return {
            openCount: 0
        };
    }

    function cloneFileFindState(existing) {
        if (!existing || typeof existing !== "object") {
            return createFileFindState();
        }

        return {
            openCount: existing.openCount ?? 0
        };
    }

    function createFileFindCloseCall(template) {
        const identifier = Core.createIdentifierNode("file_find_close", template?.object ?? template);

        if (!identifier) {
            return null;
        }

        const callExpression = {
            type: "CallExpression",
            object: identifier,
            arguments: []
        };

        Core.assignClonedLocation(callExpression, template);

        return callExpression;
    }

    function ensureBlockStatement(parent, key, statement) {
        if (!parent || typeof parent !== "object" || !key) {
            return null;
        }

        if (!statement || typeof statement !== "object") {
            return null;
        }

        const block = {
            type: "BlockStatement",
            body: [statement]
        };

        Core.assignClonedLocation(block, statement);

        parent[key] = block;

        return block;
    }
}

function ensureGpuStateIsPopped({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "IfStatement") {
            const fix = moveGpuPopStateCallOutOfConditional(node, parent, property, diagnostic);

            if (fix) {
                fixes.push(fix);
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function moveGpuPopStateCallOutOfConditional(node, parent, property, diagnostic) {
    if (!Array.isArray(parent) || typeof property !== "number") {
        return null;
    }

    if (!node || node.type !== "IfStatement") {
        return null;
    }

    const consequentBlock = node.consequent;

    if (!consequentBlock || consequentBlock.type !== "BlockStatement") {
        return null;
    }

    const consequentBody = Core.getBodyStatements(consequentBlock);

    if (consequentBody.length === 0) {
        return null;
    }

    const trailingPopIndex = findTrailingGpuPopIndex(consequentBody);

    if (trailingPopIndex === -1) {
        return null;
    }

    if (hasTrailingGpuPopInAlternate(node.alternate)) {
        return null;
    }

    const siblings = parent;

    if (hasGpuPopStateAfterIndex(siblings, property)) {
        return null;
    }

    if (!hasGpuPushStateBeforeIndex(siblings, property)) {
        return null;
    }

    const [popStatement] = (consequentBody as GameMakerAstNode[]).splice(trailingPopIndex, 1);
    const callExpression = getCallExpression(popStatement);

    if (!callExpression || !Core.isIdentifierWithName(callExpression.object, "gpu_pop_state")) {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: callExpression.object?.name ?? "gpu_pop_state",
        range: {
            start: Core.getNodeStartIndex(callExpression),
            end: Core.getNodeEndIndex(callExpression)
        }
    });

    if (!fixDetail) {
        return null;
    }

    siblings.splice(property + 1, 0, popStatement);
    attachFeatherFixMetadata(callExpression, [fixDetail]);

    return fixDetail;
}

function hasTrailingGpuPopInAlternate(alternate) {
    if (!alternate) {
        return false;
    }

    if (alternate.type === "BlockStatement") {
        const body = Core.getBodyStatements(alternate);

        if (body.length === 0) {
            return false;
        }

        return isGpuPopStateCallStatement(body.at(-1));
    }

    if (alternate.type === "IfStatement") {
        return true;
    }

    return isGpuPopStateCallStatement(alternate);
}

function findTrailingGpuPopIndex(statements) {
    if (!Core.isNonEmptyArray(statements)) {
        return -1;
    }

    for (let index = statements.length - 1; index >= 0; index -= 1) {
        const statement = statements[index];

        if (isGpuPopStateCallStatement(statement)) {
            return index;
        }

        if (!isEmptyStatement(statement)) {
            break;
        }
    }

    return -1;
}

function isEmptyStatement(node) {
    return !!node && node.type === "EmptyStatement";
}

function hasGpuPopStateAfterIndex(statements, index) {
    if (!Array.isArray(statements)) {
        return false;
    }

    for (let offset = index + 1; offset < statements.length; offset += 1) {
        const statement = statements[offset];
        if (isEmptyStatement(statement)) {
            continue;
        }

        if (isGpuPopStateCallStatement(statement)) {
            return true;
        }

        break;
    }

    return false;
}

function hasGpuPushStateBeforeIndex(statements, index) {
    if (!Array.isArray(statements)) {
        return false;
    }

    for (let offset = index - 1; offset >= 0; offset -= 1) {
        const statement = statements[offset];
        if (isEmptyStatement(statement)) {
            continue;
        }
        if (isGpuPushStateCallStatement(statement)) {
            return true;
        }
    }

    return false;
}

/**
 * Checks whether any statement after the given index references the specified variable name.
 *
 * LOCATION SMELL: This is a general identifier-usage check that doesn't belong in the
 * Feather-fixes file. It should be consolidated with other identifier utilities.
 *
 * RECOMMENDATION: Move to src/core/src/ast/identifier-utils.ts or use the semantic
 * module's binding analysis instead. The semantic module already knows which identifiers
 * are used where; querying it is more reliable than manual AST scanning.
 */
function referencesIdentifierAfterIndex(container, variableName, startIndex) {
    if (!Array.isArray(container) || !variableName) {
        return false;
    }

    const initialIndex = typeof startIndex === "number" ? startIndex : 0;

    for (let index = initialIndex; index < container.length; index += 1) {
        if (referencesIdentifier(container[index], variableName)) {
            return true;
        }
    }

    return false;
}

/**
 * Recursively checks whether the given AST node contains a reference to the specified variable.
 *
 * LOCATION SMELL: This is a variant of doesNodeUseIdentifier and should be consolidated
 * with other identifier-detection utilities rather than living in the Feather-fixes file.
 *
 * RECOMMENDATION: Extract to a shared identifier-utils module in Core, or use semantic
 * binding analysis to query reference information instead of manually walking the tree.
 */
function referencesIdentifier(node, variableName) {
    if (!node || typeof node !== "object") {
        return false;
    }

    const stack = [{ value: node, parent: null, key: null }];

    while (stack.length > 0) {
        const { value, parent, key } = stack.pop();

        if (!value || typeof value !== "object") {
            continue;
        }

        if (Core.isFunctionLikeNode(value)) {
            // Nested functions introduce new scopes. References to the same
            // identifier name inside them do not require hoisting the current
            // declaration, so skip descending into those subtrees.
            continue;
        }

        if (Array.isArray(value)) {
            for (const item of value) {
                stack.push({ value: item, parent, key });
            }
            continue;
        }

        if (value.type === "Identifier" && value.name === variableName) {
            const isDeclaratorId = parent?.type === "VariableDeclarator" && key === "id";

            if (!isDeclaratorId) {
                return true;
            }
        }

        for (const [childKey, childValue] of Object.entries(value)) {
            if (childValue && typeof childValue === "object") {
                stack.push({ value: childValue, parent: value, key: childKey });
            }
        }
    }

    return false;
}

function isGpuStateCall(node, expectedName, { allowStatements = false } = {}) {
    if (typeof expectedName !== "string" || expectedName.length === 0) {
        return false;
    }

    let expression = null;

    if (allowStatements) {
        expression = getCallExpression(node);
    } else if (node && node.type === "CallExpression") {
        expression = node;
    }

    if (!expression) {
        return false;
    }

    return Core.isIdentifierWithName(expression.object, expectedName);
}

function isGpuPopStateCallStatement(node) {
    return isGpuStateCall(node, "gpu_pop_state", { allowStatements: true });
}

function isGpuPushStateCallStatement(node) {
    return isGpuStateCall(node, "gpu_push_state", { allowStatements: true });
}

function getCallExpression(node) {
    if (!node) {
        return null;
    }

    if (node.type === "CallExpression") {
        return node;
    }

    if (node.type === "ExpressionStatement") {
        const expression = node.expression;

        if (expression && expression.type === "CallExpression") {
            return expression;
        }
    }

    return null;
}

function removeDanglingFileFindCalls({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            if (isStatementList(parent, property)) {
                sanitizeFileFindCalls(node, parent, fixes, diagnostic, ast);
            }

            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function sanitizeFileFindCalls(statements, parent, fixes, diagnostic, metadataRoot) {
    if (!Core.isNonEmptyArray(statements)) {
        return;
    }

    for (let index = 0; index < statements.length; index += 1) {
        const statement = statements[index];

        if (!isFileFindBlockFunctionCall(statement)) {
            continue;
        }

        if (!hasPrecedingFileFindClose(statements, index)) {
            continue;
        }

        const fixDetail = createFeatherFixDetail(diagnostic, {
            target: getCallExpressionCalleeName(statement),
            range: {
                start: Core.getNodeStartIndex(statement),
                end: Core.getNodeEndIndex(statement)
            }
        });

        if (!fixDetail) {
            continue;
        }

        const metadataTarget = parent && typeof parent === "object" ? parent : null;
        if (metadataTarget && metadataTarget !== metadataRoot) {
            attachFeatherFixMetadata(metadataTarget, [fixDetail]);
        }

        statements.splice(index, 1);
        index -= 1;

        fixes.push(fixDetail);
    }
}

function isStatementList(parent, property) {
    if (!parent || typeof property === "number") {
        return false;
    }

    if (property === "body") {
        return Core.isProgramOrBlockStatement(parent);
    }

    if (property === "consequent" && parent.type === "SwitchCase") {
        return true;
    }

    return false;
}

function isFileFindBlockFunctionCall(statement) {
    if (!statement || typeof statement !== "object") {
        return false;
    }

    const calleeName = getCallExpressionCalleeName(statement);

    if (!calleeName) {
        return false;
    }

    return FILE_FIND_BLOCK_CALL_TARGETS.has(calleeName);
}

function hasPrecedingFileFindClose(statements, index) {
    for (let offset = index - 1; offset >= 0; offset -= 1) {
        const candidate = statements[offset];

        if (isCallExpressionStatementWithName(candidate, FILE_FIND_CLOSE_FUNCTION_NAME)) {
            return true;
        }
    }

    return false;
}

function isCallExpressionStatementWithName(statement, name) {
    if (!statement || typeof statement !== "object" || !name) {
        return false;
    }

    const calleeName = getCallExpressionCalleeName(statement);

    return calleeName === name;
}

function getCallExpressionCalleeName(node) {
    if (!node || typeof node !== "object") {
        return null;
    }

    if (node.type === "CallExpression") {
        return node.object?.name ?? null;
    }

    if (node.type === "ExpressionStatement") {
        return getCallExpressionCalleeName(node.expression);
    }

    return null;
}

function ensureVertexFormatDefinitionsAreClosed({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "CallExpression") {
            const fix = ensureVertexFormatDefinitionIsClosed(node, parent, property, diagnostic, ast);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureVertexFormatsClosedBeforeStartingNewOnes({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            if (shouldProcessStatementSequence(parent, property)) {
                ensureSequentialVertexFormatsAreClosed(node, diagnostic, fixes);
            }

            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }

            return;
        }

        if (typeof node !== "object") {
            return;
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureSequentialVertexFormatsAreClosed(statements, diagnostic, fixes) {
    if (!Core.isNonEmptyArray(statements)) {
        return;
    }

    let openBegins = [];

    for (let index = 0; index < statements.length; ) {
        const statement = statements[index];

        if (!statement || typeof statement !== "object") {
            index += 1;
            continue;
        }

        if (isVertexFormatBeginCall(statement)) {
            const previousEntry = openBegins.length > 0 ? openBegins.at(-1) : null;

            if (previousEntry && previousEntry.node !== statement) {
                const previousEntryIndex = statements.indexOf(previousEntry.node);

                if (previousEntryIndex !== -1) {
                    previousEntry.index = previousEntryIndex;
                }

                const removalCount = removeDanglingVertexFormatDefinition({
                    statements,
                    startIndex: previousEntry.index,
                    stopIndex: index,
                    diagnostic,
                    fixes
                });

                if (removalCount > 0) {
                    openBegins = openBegins.filter((entry) => entry.index < previousEntry.index);
                    index = previousEntry.index;
                    continue;
                }

                const fixDetail = insertVertexFormatEndBefore(statements, index, previousEntry.node, diagnostic);

                if (fixDetail) {
                    fixes.push(fixDetail);
                    openBegins.pop();
                    index += 1;
                    continue;
                }
            }

            const lastEntry = openBegins.length > 0 ? openBegins.at(-1) : null;

            if (lastEntry) {
                const lastEntryIndex = statements.indexOf(lastEntry.node);

                if (lastEntryIndex !== -1) {
                    lastEntry.index = lastEntryIndex;
                }
            }

            if (!lastEntry || lastEntry.node !== statement) {
                openBegins.push({
                    node: statement,
                    index,
                    hasVertexAdd: false
                });
            }

            index += 1;
            continue;
        }

        if (isVertexFormatAddCall(statement)) {
            const activeEntry = openBegins.length > 0 ? openBegins.at(-1) : null;

            if (activeEntry) {
                activeEntry.hasVertexAdd = true;
            }
        }

        const closingCount = countVertexFormatEndCalls(statement);

        let unmatchedClosers = closingCount;
        const closedEntries = [];

        while (unmatchedClosers > 0 && openBegins.length > 0) {
            const entry = openBegins.pop();

            if (entry) {
                closedEntries.push(entry);
            }

            unmatchedClosers -= 1;
        }

        if (
            closingCount === 1 &&
            unmatchedClosers === 0 &&
            closedEntries.length === 1 &&
            isCallExpressionStatementWithName(statement, "vertex_format_end")
        ) {
            const [closedEntry] = closedEntries;
            const beginIndex = statements.indexOf(closedEntry?.node);

            if (beginIndex !== -1) {
                closedEntry.index = beginIndex;
            }

            const removed = removeEmptyVertexFormatDefinition({
                statements,
                beginIndex,
                endIndex: index,
                diagnostic,
                fixes,
                hasVertexAdd: closedEntry?.hasVertexAdd ?? false
            });

            if (removed) {
                index = beginIndex;
                continue;
            }
        }

        if (unmatchedClosers > 0) {
            const removed = removeDanglingVertexFormatEndCall({
                statements,
                index,
                diagnostic,
                fixes
            });

            if (removed) {
                continue;
            }
        }

        index += 1;
    }
}

function removeDanglingVertexFormatDefinition({ statements, startIndex, stopIndex, diagnostic, fixes }) {
    if (
        !Array.isArray(statements) ||
        typeof startIndex !== "number" ||
        typeof stopIndex !== "number" ||
        startIndex < 0 ||
        startIndex >= stopIndex
    ) {
        return 0;
    }

    for (let index = startIndex; index < stopIndex; index += 1) {
        const candidate = statements[index];

        if (!isVertexFormatBeginCall(candidate) && !isVertexFormatAddCall(candidate)) {
            return 0;
        }
    }

    const firstNode = statements[startIndex];
    const lastNode = statements[stopIndex - 1] ?? firstNode;

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: getCallExpressionCalleeName(firstNode) ?? null,
        range: createRangeFromNodes(firstNode, lastNode)
    });

    if (!fixDetail) {
        return 0;
    }

    const removalCount = stopIndex - startIndex;
    statements.splice(startIndex, removalCount);

    if (Array.isArray(fixes)) {
        fixes.push(fixDetail);
    }

    return removalCount;
}

function removeDanglingVertexFormatEndCall({ statements, index, diagnostic, fixes }) {
    if (!Array.isArray(statements) || typeof index !== "number") {
        return false;
    }

    const statement = statements[index];

    if (!isCallExpressionStatementWithName(statement, "vertex_format_end")) {
        return false;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: getCallExpressionCalleeName(statement),
        range: {
            start: Core.getNodeStartIndex(statement),
            end: Core.getNodeEndIndex(statement)
        }
    });

    if (!fixDetail) {
        return false;
    }

    statements.splice(index, 1);

    if (Array.isArray(fixes)) {
        fixes.push(fixDetail);
    }

    return true;
}

function removeEmptyVertexFormatDefinition({ statements, beginIndex, endIndex, diagnostic, fixes, hasVertexAdd }) {
    if (!Array.isArray(statements) || typeof beginIndex !== "number" || typeof endIndex !== "number") {
        return false;
    }

    if (beginIndex < 0 || endIndex < 0 || endIndex < beginIndex) {
        return false;
    }

    const beginStatement = statements[beginIndex];
    const endStatement = statements[endIndex];

    if (!isVertexFormatBeginCall(beginStatement)) {
        return false;
    }

    if (!isCallExpressionStatementWithName(endStatement, "vertex_format_end")) {
        return false;
    }

    if (hasVertexAdd) {
        return false;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: getCallExpressionCalleeName(beginStatement) ?? null,
        range: createRangeFromNodes(beginStatement, endStatement)
    });

    if (!fixDetail) {
        return false;
    }

    statements.splice(endIndex, 1);
    statements.splice(beginIndex, 1);

    if (Array.isArray(fixes)) {
        fixes.push(fixDetail);
    }

    return true;
}

function createRangeFromNodes(startNode, endNode) {
    const start = Core.getNodeStartIndex(startNode);
    const end = Core.getNodeEndIndex(endNode);

    if (typeof start === "number" && typeof end === "number" && end >= start) {
        return { start, end };
    }

    return null;
}

function shouldProcessStatementSequence(parent, property) {
    if (!parent) {
        return true;
    }

    if (property === "body") {
        return Core.isProgramOrBlockStatement(parent);
    }

    return parent.type === "CaseClause" && property === "consequent";
}

function insertVertexFormatEndBefore(statements, index, templateBegin, diagnostic) {
    if (!Array.isArray(statements) || typeof index !== "number") {
        return null;
    }

    if (!templateBegin || typeof templateBegin !== "object") {
        return null;
    }

    const replacement = createVertexFormatEndCall(templateBegin);

    if (!replacement) {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: templateBegin?.object?.name ?? null,
        range: {
            start: Core.getNodeStartIndex(templateBegin),
            end: Core.getNodeEndIndex(templateBegin)
        }
    });

    if (!fixDetail) {
        return null;
    }

    statements.splice(index, 0, replacement);
    attachFeatherFixMetadata(replacement, [fixDetail]);

    return fixDetail;
}

function countVertexFormatEndCalls(node) {
    const stack = [node];
    const seen = new Set();
    let count = 0;

    while (stack.length > 0) {
        const current = stack.pop();

        if (!current || typeof current !== "object") {
            continue;
        }

        if (seen.has(current)) {
            continue;
        }

        seen.add(current);

        if (isVertexFormatEndCall(current)) {
            count += 1;
        }

        if (Array.isArray(current)) {
            for (const element of current) {
                stack.push(element);
            }
            continue;
        }

        for (const value of Object.values(current)) {
            if (value && typeof value === "object") {
                stack.push(value);
            }
        }
    }

    return count;
}

function ensureVertexFormatDefinitionIsClosed(node, parent, property, diagnostic, ast) {
    if (!Array.isArray(parent) || typeof property !== "number") {
        return null;
    }

    if (!node || node.type !== "CallExpression") {
        return null;
    }

    if (!Core.isIdentifierWithName(node.object, "vertex_format_begin")) {
        return null;
    }

    const siblings = parent;
    let insertionIndex = property + 1;

    for (let index = property + 1; index < siblings.length; index += 1) {
        const sibling = siblings[index];

        if (nodeContainsVertexFormatEndCall(sibling)) {
            return null;
        }

        if (isVertexFormatBeginCall(sibling)) {
            break;
        }

        if (isVertexFormatAddCall(sibling)) {
            insertionIndex = index + 1;
            continue;
        }

        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: "vertex_format_begin",
        range: {
            start: Core.getNodeStartIndex(node),
            end: Core.getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    const commentTargets = [];

    for (let index = property; index < insertionIndex; index += 1) {
        const candidate = siblings[index];

        if (candidate && candidate.type === "CallExpression") {
            commentTargets.push(candidate);
        }
    }

    const commentPrefixText = "TODO: Incomplete vertex format definition automatically commented out (GM2015)";

    if (Core.isNonEmptyString(commentPrefixText) && node && typeof node === "object") {
        Object.defineProperty(node, FEATHER_COMMENT_PREFIX_TEXT_SYMBOL, {
            configurable: true,
            enumerable: false,
            writable: true,
            value: commentPrefixText
        });
    }

    for (const target of commentTargets) {
        markCallExpressionForFeatherComment(target);
        target._featherSuppressFollowingEmptyLine = true;
    }

    suppressDuplicateVertexFormatComments(ast, commentTargets, node);

    return fixDetail;
}

function suppressDuplicateVertexFormatComments(ast, commentTargets, node) {
    if (!ast || typeof ast !== "object") {
        return;
    }

    if (!Core.isNonEmptyArray(commentTargets)) {
        return;
    }

    const comments = Core.asArray(ast.comments);

    if (comments.length === 0) {
        return;
    }

    const normalizedTexts = new Set();

    for (const target of commentTargets) {
        const text = createCallExpressionCommentText(target);

        if (Core.isNonEmptyString(text)) {
            normalizedTexts.add(`${text};`);
        }
    }

    if (normalizedTexts.size === 0) {
        return;
    }

    const referenceLine = Core.getNodeStartLine(node);

    const removalIndexes = new Set();

    for (const [index, comment] of comments.entries()) {
        if (!Core.isNode(comment) || comment.type !== "CommentLine") {
            continue;
        }

        const mutableComment = comment as MutableGameMakerAstNode;

        if (mutableComment.leadingChar !== ";") {
            continue;
        }

        const commentLine = getStartFromNode(comment) ? getStartFromNode(comment).line : null;

        if (typeof referenceLine === "number" && typeof commentLine === "number" && commentLine <= referenceLine) {
            continue;
        }

        const normalizedValue = Core.isNode(comment) ? Core.toTrimmedString((comment as any).value) : null;

        if (!normalizedTexts.has(normalizedValue)) {
            continue;
        }

        removalIndexes.add(index);
    }

    if (removalIndexes.size === 0) {
        return;
    }

    ast.comments = comments.filter((_, index) => !removalIndexes.has(index));
}

function nodeContainsVertexFormatEndCall(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    if (isVertexFormatEndCall(node)) {
        return true;
    }

    if (Array.isArray(node)) {
        return node.some(nodeContainsVertexFormatEndCall);
    }

    for (const value of Object.values(node)) {
        if (nodeContainsVertexFormatEndCall(value)) {
            return true;
        }
    }

    return false;
}

function isVertexFormatEndCall(node) {
    return !!node && node.type === "CallExpression" && Core.isIdentifierWithName(node.object, "vertex_format_end");
}

function isVertexFormatBeginCall(node) {
    return !!node && node.type === "CallExpression" && Core.isIdentifierWithName(node.object, "vertex_format_begin");
}

function isVertexFormatAddCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    const identifier = node.object;

    if (!identifier || identifier.type !== "Identifier") {
        return false;
    }

    return typeof identifier.name === "string" && identifier.name.startsWith("vertex_format_add_");
}

function markCallExpressionForFeatherComment(node) {
    if (!node || node.type !== "CallExpression") {
        return;
    }

    const commentText = createCallExpressionCommentText(node);

    Object.defineProperty(node, FEATHER_COMMENT_OUT_SYMBOL, {
        configurable: true,
        enumerable: false,
        writable: true,
        value: true
    });

    if (Core.isNonEmptyString(commentText)) {
        Object.defineProperty(node, FEATHER_COMMENT_TEXT_SYMBOL, {
            configurable: true,
            enumerable: false,
            writable: true,
            value: commentText
        });
    }
}

function createCallExpressionCommentText(node) {
    if (!node || node.type !== "CallExpression") {
        return null;
    }

    const calleeName = getCallExpressionCalleeName(node);

    if (!calleeName) {
        return null;
    }

    const args = Core.getCallExpressionArguments(node);

    if (!Core.isNonEmptyArray(args)) {
        return `${calleeName}()`;
    }

    const placeholderArgs = args.map(() => "...").join(", ");
    return `${calleeName}(${placeholderArgs})`;
}

function createVertexFormatEndCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = Core.createIdentifierNode("vertex_format_end", template.object);

    if (!identifier) {
        return null;
    }

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: []
    };

    Core.assignClonedLocation(callExpression, template);

    return callExpression;
}

function harmonizeTexturePointerTernaries({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "TernaryExpression") {
            const fix = harmonizeTexturePointerTernary(node, parent, property, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

const INSTANCE_CREATE_FUNCTION_NAMES = new Set([
    "instance_create_layer",
    "instance_create_depth",
    "instance_create_depth_ext",
    "instance_create_layer_ext",
    "instance_create_at",
    "instance_create",
    "instance_create_z"
]);

function annotateInstanceVariableStructAssignments({ ast, diagnostic }) {
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
            const callFixes = annotateInstanceCreateCall(node, diagnostic);

            if (Core.isNonEmptyArray(callFixes)) {
                fixes.push(...callFixes);
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

function annotateInstanceCreateCall(node, diagnostic) {
    if (!node || node.type !== "CallExpression") {
        return [];
    }

    if (!isInstanceCreateIdentifier(node.object)) {
        return [];
    }

    const structArgument = findStructArgument(node.arguments);

    if (!structArgument) {
        return [];
    }

    return annotateVariableStructProperties(structArgument, diagnostic);
}

function isInstanceCreateIdentifier(node) {
    const identifierDetails = Core.getIdentifierDetails(node);
    if (!identifierDetails) {
        return false;
    }

    if (INSTANCE_CREATE_FUNCTION_NAMES.has(identifierDetails.name)) {
        return true;
    }

    return identifierDetails.name.startsWith("instance_create_");
}

function findStructArgument(args) {
    if (!Core.isNonEmptyArray(args)) {
        return null;
    }

    for (let index = args.length - 1; index >= 0; index -= 1) {
        const candidate = args[index];

        if (candidate && candidate.type === "StructExpression") {
            return candidate;
        }
    }

    return null;
}

/**
 * Annotates struct properties in a StructExpression with Feather fix metadata.
 *
 * DUPLICATION WARNING: There may be an existing transform that performs similar
 * struct property annotation or manipulation. If struct property handling is needed
 * in multiple places, extract the logic into a shared utility in Core or the
 * Plugin transforms directory.
 *
 * RECOMMENDATION: Search for other functions that iterate over struct properties
 * and apply transformations. If found, consolidate the logic into a reusable helper
 * that can be called from both Feather fixes and general formatting transforms.
 */
function annotateVariableStructProperties(structExpression, diagnostic) {
    if (!structExpression || structExpression.type !== "StructExpression") {
        return [];
    }

    const properties = Array.isArray(structExpression.properties) ? structExpression.properties : [];

    if (properties.length === 0) {
        return [];
    }

    const fixes = [];

    for (const property of properties) {
        const fixDetail = annotateVariableStructProperty(property, diagnostic);

        if (fixDetail) {
            fixes.push(fixDetail);
        }
    }

    return fixes;
}

/**
 * Annotates a single struct property with Feather fix metadata.
 *
 * DUPLICATION WARNING: See the comment on annotateVariableStructProperties above.
 * This function is part of a pattern that may be duplicated elsewhere in the codebase.
 */
function annotateVariableStructProperty(property, diagnostic) {
    if (!property || property.type !== "Property") {
        return null;
    }

    const value = property.value;

    if (!value || value.type !== "Identifier" || typeof value.name !== "string") {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: value.name,
        range: {
            start: Core.getNodeStartIndex(property),
            end: Core.getNodeEndIndex(property)
        },
        automatic: false
    });

    if (!fixDetail) {
        return null;
    }

    attachFeatherFixMetadata(property, [fixDetail]);

    return fixDetail;
}

/**
 * Annotates missing user-event constant references in the AST.
 *
 * ORGANIZATION SMELL: All user-event-related functionality (detection, constant
 * insertion, validation) should be extracted into a dedicated module rather than
 * being scattered through this large Feather-fixes file.
 *
 * RECOMMENDATION: Create src/plugin/src/transforms/feather/user-event-fixes.ts and
 * move all user-event-specific logic there:
 *   - annotateMissingUserEvents
 *   - insertUserEventConstant
 *   - validateUserEventConstant
 *   - USER_EVENT_CONSTANTS (if defined)
 *
 * This makes the code easier to navigate and test, and reduces the size of this
 * already-oversized file.
 */
function annotateMissingUserEvents({ ast, diagnostic }) {
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

function getUserEventReference(node) {
    if (!node || node.type !== "CallExpression") {
        return null;
    }

    const callee = Core.getCallExpressionIdentifier(node);
    const args = Core.getCallExpressionArguments(node);

    if (Core.isIdentifierWithName(callee, "event_user")) {
        const eventIndex = resolveUserEventIndex(args[0]);

        if (eventIndex === null) {
            return null;
        }

        return { index: eventIndex, name: formatUserEventName(eventIndex) };
    }

    if (Core.isIdentifierWithName(callee, "event_perform")) {
        if (args.length < 2 || !Core.isIdentifierWithName(args[0], "ev_user")) {
            return null;
        }

        const eventIndex = resolveUserEventIndex(args[1]);

        if (eventIndex === null) {
            return null;
        }

        return { index: eventIndex, name: formatUserEventName(eventIndex) };
    }

    if (Core.isIdentifierWithName(callee, "event_perform_object")) {
        if (args.length < 3) {
            return null;
        }

        const eventIndex = resolveUserEventIndex(args[2]);

        if (eventIndex === null) {
            return null;
        }

        return { index: eventIndex, name: formatUserEventName(eventIndex) };
    }

    return null;
}

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

function formatUserEventName(index) {
    if (!Number.isInteger(index)) {
        return null;
    }

    return `User Event ${index}`;
}
function harmonizeTexturePointerTernary(node, parent, property, diagnostic) {
    if (!node || node.type !== "TernaryExpression") {
        return null;
    }

    if (!parent || parent.type !== "AssignmentExpression" || property !== "right") {
        return null;
    }

    if (!isSpriteGetTextureCall(node.consequent)) {
        return null;
    }

    const alternate = node.alternate;

    if (!isNegativeOneLiteral(alternate)) {
        return null;
    }

    const pointerIdentifier = Core.createIdentifierNode("pointer_null", alternate);

    if (!pointerIdentifier) {
        return null;
    }

    copyCommentMetadata(alternate, pointerIdentifier);
    node.alternate = pointerIdentifier;

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: Core.isIdentifierNode(parent.left) ? parent.left.name : null,
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

function createAssignmentFromDeclarator(declarator, declarationNode) {
    if (!declarator || typeof declarator !== "object") {
        return null;
    }

    const identifier = declarator.id;

    if (!Core.isIdentifierNode(identifier)) {
        return null;
    }

    if (!declarator.init) {
        return null;
    }

    const assignment = {
        type: "AssignmentExpression",
        operator: "=",
        left: Core.cloneIdentifier(identifier),
        right: declarator.init,
        start: Core.cloneLocation(declarator.start ?? declarationNode?.start),
        end: Core.cloneLocation(declarator.end ?? declarationNode?.end)
    };

    copyCommentMetadata(declarator, assignment);

    return assignment;
}

/**
 * Extracts the parameter names from a function declaration or expression.
 *
 * ORGANIZATION SMELL: Function parameter handling (extraction, validation, transformation)
 * is a common task that appears in multiple contexts (Feather fixes, doc-comment generation,
 * refactoring). This logic should be consolidated into a shared function-utility module.
 *
 * RECOMMENDATION: Create or move this to src/core/src/ast/function-utils.ts (or similar)
 * alongside other function-related helpers like:
 *   - getFunctionParameterNames (this function)
 *   - getFunctionParameterCount
 *   - isFunctionLikeNode
 *   - extractFunctionSignature
 *
 * This makes function-handling logic reusable across the plugin, semantic analysis,
 * and refactoring operations.
 */
function getFunctionParameterNames(node) {
    const params = Core.getArrayProperty(node, "params");
    const names = [];

    for (const param of params) {
        if (!Core.isNode(param)) {
            continue;
        }

        if (Core.isIdentifierNode(param)) {
            if (param.name) {
                names.push(param.name);
            }
            continue;
        }

        if (param.type === "DefaultParameter" && Core.isIdentifierNode(param.left)) {
            if (param.left.name) {
                names.push(param.left.name);
            }
            continue;
        }
    }

    return names;
}

function getVariableDeclaratorName(declarator) {
    if (!declarator || typeof declarator !== "object") {
        return null;
    }

    const identifier = declarator.id;

    if (!Core.isIdentifierNode(identifier)) {
        return null;
    }

    return identifier.name ?? null;
}

/**
 * Creates a shallow clone of a Literal node with fresh location information.
 *
 * LOCATION SMELL: This is a general AST node cloning utility that should live in Core
 * alongside other cloning helpers like cloneIdentifier, cloneAstNode, etc.
 *
 * RECOMMENDATION: Move to src/core/src/ast/node-utils.ts and export it as Core.cloneLiteral.
 * Update all imports in this file and add unit tests for the new Core export.
 *
 * WHAT WOULD BREAK: Leaving node-cloning utilities scattered across domain-specific files
 * makes them hard to discover and leads to duplication. Centralizing them in Core ensures
 * consistent cloning behavior and makes the API more discoverable.
 */
function cloneLiteral(node) {
    if (!node || node.type !== "Literal") {
        return null;
    }

    const cloned = {
        type: "Literal",
        value: node.value
    };

    Core.assignClonedLocation(cloned, node);

    return cloned;
}

/**
 * Copies comment-related metadata from one AST node to another.
 *
 * LOCATION SMELL: This is a general comment-handling utility that should live alongside
 * other comment utilities in Core, not buried in the Feather-fixes file.
 *
 * RECOMMENDATION: Move to src/core/src/comments/comment-utils.ts where similar helpers
 * like getCommentArray, attachComments, etc. already live. This makes comment utilities
 * discoverable and ensures consistent comment handling across the codebase.
 */
function copyCommentMetadata(source, target) {
    if (!source || !target) {
        return;
    }

    for (const key of ["leadingComments", "trailingComments", "innerComments", "comments"]) {
        if (Object.hasOwn(source, key)) {
            target[key] = source[key];
        }
    }
}

/**
 * Extracts an identifier name from a string literal value.
 *
 * PURPOSE: Some GML patterns represent identifiers as string literals (e.g., in
 * reflection or meta-programming contexts). This helper parses those strings to
 * extract valid identifier names.
 *
 * LOCATION SMELL: This is a general identifier-parsing utility that doesn't belong
 * in the Feather-fixes file.
 *
 * RECOMMENDATION: Move to src/core/src/ast/identifier-utils.ts or a dedicated string
 * parsing module if identifier extraction from strings is a common operation.
 */
function extractIdentifierNameFromLiteral(value) {
    if (typeof value !== "string") {
        return null;
    }

    const stripped = Core.stripStringQuotes(value);
    if (!stripped) {
        return null;
    }

    if (!Core.GML_IDENTIFIER_NAME_PATTERN.test(stripped)) {
        return null;
    }

    return stripped;
}

function isDrawPrimitiveBeginCall(node) {
    return Core.isCallExpressionIdentifierMatch(node, "draw_primitive_begin");
}

function isDrawPrimitiveEndCall(node) {
    return Core.isCallExpressionIdentifierMatch(node, "draw_primitive_end");
}

function isLiteralZero(node) {
    if (!node || node.type !== "Literal") {
        return false;
    }

    return node.value === "0" || node.value === 0;
}

function isDrawSurfaceCall(node) {
    const name = Core.getCallExpressionIdentifierName(node);
    return typeof name === "string" && name.startsWith("draw_surface");
}

function isTerminatingStatement(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    return (
        node.type === "ReturnStatement" ||
        node.type === "BreakStatement" ||
        node.type === "ContinueStatement" ||
        node.type === "ThrowStatement" ||
        node.type === "ExitStatement"
    );
}

function isLiteralOne(node) {
    if (!node || node.type !== "Literal") {
        return false;
    }

    return node.value === "1" || node.value === 1;
}

function isLiteralTrue(node) {
    if (!node || node.type !== "Literal") {
        return false;
    }

    return node.value === "true" || node.value === true;
}

function isLiteralFalse(node) {
    if (!node || node.type !== "Literal") {
        return false;
    }

    return node.value === "false" || node.value === false;
}

function isShaderResetCall(node) {
    if (!isCallExpressionWithName(node, "shader_reset")) {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);

    return args.length === 0;
}

function isFogResetCall(node) {
    if (!isCallExpressionWithName(node, "gpu_set_fog")) {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length < 4) {
        return false;
    }

    return (
        isLiteralFalse(args[0]) &&
        Core.isIdentifierWithName(args[1], "c_black") &&
        isLiteralZero(args[2]) &&
        isLiteralOne(args[3])
    );
}

function isAlphaTestEnableResetCall(node) {
    if (!isCallExpressionWithName(node, "gpu_set_alphatestenable")) {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return false;
    }

    return isLiteralFalse(args[0]);
}

function isAlphaTestRefResetCall(node) {
    if (!isCallExpressionWithName(node, "gpu_set_alphatestref")) {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return false;
    }

    return isLiteralZero(args[0]);
}

function isHalignResetCall(node) {
    if (!isCallExpressionWithName(node, "draw_set_halign")) {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return false;
    }

    return Core.isIdentifierWithName(args[0], "fa_left");
}

function isCullModeResetCall(node) {
    if (!isCallExpressionWithName(node, "gpu_set_cullmode")) {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return false;
    }

    return Core.isIdentifierWithName(args[0], "cull_noculling");
}

function isColourWriteEnableResetCall(node) {
    if (!isCallExpressionWithName(node, "gpu_set_colourwriteenable")) {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length < 4) {
        return false;
    }

    return args.slice(0, 4).every((argument) => Core.isBooleanLiteral(argument, true));
}

function isAlphaTestDisableCall(node) {
    if (!isCallExpressionWithName(node, "gpu_set_alphatestenable")) {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return false;
    }

    const [argument] = args;

    return isLiteralFalse(argument) || isLiteralZero(argument);
}

function createAlphaTestEnableResetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = Core.cloneIdentifier(template.object);

    if (!identifier || identifier.name !== "gpu_set_alphatestenable") {
        return null;
    }

    const literalFalse = createLiteral("false", template.arguments?.[0]);

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: [literalFalse]
    };

    Core.assignClonedLocation(callExpression, template);

    return callExpression;
}

function createAlphaTestRefResetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = Core.cloneIdentifier(template.object);

    if (!identifier || identifier.name !== "gpu_set_alphatestref") {
        return null;
    }

    const literalZero = createLiteral("0", template.arguments?.[0]);

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: [literalZero]
    };

    Core.assignClonedLocation(callExpression, template);

    return callExpression;
}

function createBlendModeResetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = Core.cloneIdentifier(template.object);

    if (!identifier || identifier.name !== "gpu_set_blendmode") {
        return null;
    }

    const blendModeIdentifier = Core.createIdentifierNode("bm_normal", template.arguments?.[0]);

    if (!blendModeIdentifier) {
        return null;
    }

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: [blendModeIdentifier]
    };

    Core.assignClonedLocation(callExpression, template);

    return callExpression;
}

function isSurfaceSetTargetCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    return Core.isIdentifierWithName(node.object, "surface_set_target");
}

function createHalignResetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = Core.cloneIdentifier(template.object);

    if (!identifier || identifier.name !== "draw_set_halign") {
        return null;
    }

    const faLeft = Core.createIdentifierNode("fa_left", template.arguments?.[0]);

    if (!faLeft) {
        return null;
    }

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: [faLeft]
    };

    Core.assignClonedLocation(callExpression, template);

    return callExpression;
}

function createCullModeResetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = Core.cloneIdentifier(template.object);

    if (!identifier || identifier.name !== "gpu_set_cullmode") {
        return null;
    }

    const resetArgument = Core.createIdentifierNode("cull_noculling", template.arguments?.[0]);

    if (!resetArgument) {
        return null;
    }

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: [resetArgument]
    };

    Core.assignClonedLocation(callExpression, template);

    return callExpression;
}

function createColourWriteEnableResetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = Core.cloneIdentifier(template.object);

    if (!identifier || identifier.name !== "gpu_set_colourwriteenable") {
        return null;
    }

    const templateArgs = Array.isArray(template.arguments) ? template.arguments : [];
    const argumentsList = [];

    for (let index = 0; index < 4; index += 1) {
        const argumentTemplate = templateArgs[index] ?? templateArgs.at(-1) ?? template;
        const literalTrue = createLiteral("true", argumentTemplate);
        argumentsList.push(literalTrue);
    }

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: argumentsList
    };

    Core.assignClonedLocation(callExpression, template);

    return callExpression;
}

function isBlendModeNormalArgument(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    if (Core.isIdentifierWithName(node, "bm_normal")) {
        return true;
    }

    if (node.type === "Literal") {
        return node.value === "bm_normal";
    }

    return false;
}

function shouldResetBlendEnable(argument) {
    if (!argument || typeof argument !== "object") {
        return false;
    }

    return isLiteralFalse(argument) || isLiteralZero(argument);
}

function shouldResetTextureRepeat(argument) {
    if (!argument || typeof argument !== "object") {
        return false;
    }

    if (isLiteralFalse(argument) || isLiteralZero(argument)) {
        return false;
    }

    return isLiteralTrue(argument) || isLiteralOne(argument);
}

function isTextureRepeatResetCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (!Core.isIdentifierWithName(node.object, "gpu_set_texrepeat")) {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return false;
    }

    const [argument] = args;

    return isLiteralFalse(argument) || isLiteralZero(argument);
}

function createTextureRepeatResetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = Core.cloneIdentifier(template.object);

    if (!identifier || identifier.name !== "gpu_set_texrepeat") {
        return null;
    }

    const literalFalse = createLiteral("false", template.arguments?.[0]);

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: [literalFalse]
    };

    Core.assignClonedLocation(callExpression, template);

    return callExpression;
}

function isBlendModeResetCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (!Core.isIdentifierWithName(node.object, "gpu_set_blendmode")) {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return false;
    }

    return isBlendModeNormalArgument(args[0]);
}

function isBlendEnableResetCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (!Core.isIdentifierWithName(node.object, "gpu_set_blendenable")) {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return false;
    }

    const [argument] = args;

    return isLiteralTrue(argument) || isLiteralOne(argument);
}

function createShaderResetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = Core.createIdentifierNode("shader_reset", template.object);

    if (!identifier) {
        return null;
    }

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: []
    };

    Core.assignClonedLocation(callExpression, template);

    return callExpression;
}

function createFogResetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = Core.cloneIdentifier(template.object);

    if (!identifier || identifier.name !== "gpu_set_fog") {
        return null;
    }

    const [argument0, argument1, argument2, argument3] = Array.isArray(template.arguments) ? template.arguments : [];

    const falseLiteral = createLiteral("false", argument0);
    const colorIdentifier = Core.createIdentifierNode("c_black", argument1);
    const zeroLiteral = createLiteral("0", argument2);
    const oneLiteral = createLiteral("1", argument3);

    if (!falseLiteral || !colorIdentifier || !zeroLiteral || !oneLiteral) {
        return null;
    }

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: [falseLiteral, colorIdentifier, zeroLiteral, oneLiteral]
    };

    Core.assignClonedLocation(callExpression, template);

    return callExpression;
}

function createBlendEnableResetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = Core.cloneIdentifier(template.object);

    if (!identifier || identifier.name !== "gpu_set_blendenable") {
        return null;
    }

    const literalTrue = createLiteral("true", template.arguments?.[0]);

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: [literalTrue]
    };

    Core.assignClonedLocation(callExpression, template);

    return callExpression;
}

function createLiteral(value, template) {
    const literalValue = typeof value === "number" ? String(value) : value;

    const literal = {
        type: "Literal",
        value: literalValue
    };

    Core.assignClonedLocation(literal, template);

    return literal;
}

function reorderOptionalParameters({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                visit(item);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "FunctionDeclaration") {
            const fix = reorderFunctionOptionalParameters(node, diagnostic, ast);

            if (fix) {
                fixes.push(fix);
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

function reorderFunctionOptionalParameters(node, diagnostic, ast) {
    if (!node || node.type !== "FunctionDeclaration") {
        return null;
    }

    const params = Array.isArray(node.params) ? node.params : null;

    if (!params || params.length === 0) {
        return null;
    }

    let encounteredOptional = false;
    let appliedChanges = false;

    for (let index = 0; index < params.length; index += 1) {
        const param = params[index];

        if (isOptionalParameter(param)) {
            encounteredOptional = true;
            continue;
        }

        if (!encounteredOptional) {
            continue;
        }

        const converted = convertParameterToUndefinedDefault(param);

        if (!converted) {
            continue;
        }

        params[index] = converted;
        appliedChanges = true;
    }

    if (!appliedChanges) {
        return null;
    }

    node._flattenSyntheticNumericParens = true;

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: getFunctionIdentifierName(node),
        range: {
            start: Core.getNodeStartIndex(node),
            end: Core.getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    try {
        // Log the function identifier name and the fix target to help
        // trace why per-function GM1056 metadata may be missing in tests.
        console.warn(
            `[feather:diagnostic] reorderFunctionOptionalParameters fnName=${getFunctionIdentifierName(node)} fixTarget=${String(fixDetail.target)}`
        );
    } catch {
        void 0;
    }

    // Attach to the specific function node so callers can inspect per-function
    // applied fixes. Some downstream passes may also rely on program-level
    // metadata; ensure the program also receives the same entry. This is a
    // narrow, local change to guarantee the fixer metadata is visible where
    // tests and consumers expect it.
    attachFeatherFixMetadata(node, [fixDetail]);

    try {
        if (ast && typeof ast === "object") {
            attachFeatherFixMetadata(ast, [fixDetail]);
        }
    } catch {
        // non-fatal: don't break the fix application if program-level attach fails
        void 0;
    }

    return fixDetail;
}

function convertParameterToUndefinedDefault(parameter) {
    if (!parameter || parameter.type !== "Identifier") {
        return null;
    }

    const identifier = Core.cloneIdentifier(parameter) ?? parameter;
    const undefinedLiteral = createLiteral("undefined", parameter);
    if (!undefinedLiteral) {
        return null;
    }

    const defaultParameter = {
        type: "DefaultParameter",
        left: identifier,
        right: undefinedLiteral,
        start: Core.cloneLocation(parameter.start ?? identifier.start),
        end: Core.cloneLocation(parameter.end ?? identifier.end)
    };

    copyCommentMetadata(parameter, defaultParameter);

    return defaultParameter;
}

function isOptionalParameter(parameter) {
    return parameter?.type === "DefaultParameter";
}

/**
 * Extracts the identifier name from a function declaration or expression node.
 *
 * CONTEXT: Function nodes can have their name stored in different properties depending
 * on their type (FunctionDeclaration, FunctionExpression, etc.), and this helper
 * normalizes the extraction logic.
 *
 * LOCATION SMELL: This is a general AST utility for function nodes and should live
 * with other function-related helpers, not in the Feather-fixes file.
 *
 * RECOMMENDATION: Move to src/core/src/ast/function-utils.ts (create if needed) or
 * src/core/src/ast/identifier-utils.ts alongside other name-extraction helpers.
 */
function getFunctionIdentifierName(node) {
    if (!node) {
        return null;
    }

    const { id, name, key } = node;

    if (typeof id === "string") {
        return id;
    }

    if (id && typeof id === "object") {
        if (typeof id.name === "string") {
            return id.name;
        }

        if (id.type === "Identifier" && typeof id.name === "string") {
            return id.name;
        }
    }

    if (typeof name === "string") {
        return name;
    }

    if (key && typeof key === "object" && typeof key.name === "string") {
        return key.name;
    }

    return null;
}

/**
 * Scans the AST for malformed JSDoc type annotations and attempts to fix them.
 *
 * LOCATION SMELL: JSDoc type parsing, validation, and normalization should live in the
 * Core doc-comment service/manager, not in the Feather-fixes file. The doc-comment
 * subsystem already handles JSDoc parsing, tag extraction, and type normalization for
 * general formatting; Feather-specific fixes should import those helpers rather than
 * reimplementing type manipulation logic here.
 *
 * RECOMMENDATION: Move this and related JSDoc type-handling functions to:
 *   src/core/src/comments/doc-comment/service/type-normalization.ts
 *
 * The Core doc-comment service should expose functions like:
 *   - parseTypeAnnotation(text): ParsedType
 *   - normalizeTypeAnnotation(type, typeSystemInfo): string
 *   - balanceTypeDelimiters(text): string
 *
 * Then Feather fixes can import and apply them without duplicating the logic.
 *
 * WHAT WOULD BREAK: Centralizing type-handling logic in Core makes it easier to maintain
 * consistent JSDoc formatting across the codebase and prevents drift between the plugin's
 * doc-comment formatter and Feather's type sanitization.
 */
function sanitizeMalformedJsDocTypes({ ast, diagnostic, typeSystemInfo }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const comments = Core.collectCommentNodes(ast);

    if (comments.length === 0) {
        return [];
    }

    const fixes = [];

    for (const comment of comments) {
        const result = sanitizeDocCommentType(comment, typeSystemInfo);

        if (!result) {
            continue;
        }

        const fixDetail = createFeatherFixDetail(diagnostic, {
            target: result.target ?? null,
            range: {
                start: Core.getNodeStartIndex(comment),
                end: Core.getNodeEndIndex(comment)
            }
        });

        if (!fixDetail) {
            continue;
        }

        attachFeatherFixMetadata(comment, [fixDetail]);
        fixes.push(fixDetail);
    }

    return fixes;
}

/**
 * Sanitizes a single JSDoc comment's type annotation.
 *
 * LOCATION SMELL: This belongs in Core's doc-comment service, not in Feather fixes.
 * See the comment on sanitizeMalformedJsDocTypes for details.
 */
function sanitizeDocCommentType(comment, typeSystemInfo) {
    if (!comment || comment.type !== "CommentLine") {
        return null;
    }

    const rawValue = Core.getCommentValue(comment);

    if (!rawValue || !rawValue.includes("@") || !rawValue.includes("{")) {
        return null;
    }

    const tagMatch = rawValue.match(/\/\s*@([A-Za-z]+)/);

    if (!tagMatch) {
        return null;
    }

    const tagName = tagMatch[1]?.toLowerCase();

    if (tagName !== "param" && tagName !== "return" && tagName !== "returns") {
        return null;
    }

    const annotation = extractTypeAnnotation(rawValue);

    if (!annotation) {
        return null;
    }

    const { beforeBrace, typeText, remainder, hadClosingBrace } = annotation;

    if (typeof typeText !== "string") {
        return null;
    }

    const sanitizedType = sanitizeTypeAnnotationText(typeText, typeSystemInfo);
    const needsClosingBrace = hadClosingBrace === false;
    const hasTypeChange = sanitizedType !== typeText.trim();

    if (!hasTypeChange && !needsClosingBrace) {
        return null;
    }

    const updatedValue = `${beforeBrace}${sanitizedType}}${remainder}`;

    if (updatedValue === rawValue) {
        return null;
    }

    comment.value = updatedValue;

    if (typeof comment.raw === "string") {
        comment.raw = `//${updatedValue}`;
    }

    const target = tagName === "param" ? extractParameterNameFromDocRemainder(remainder) : null;

    return {
        target
    };
}

/**
 * LOCATION SMELL: The following delimiter depth tracking helpers belong in Core's
 * doc-comment service. Bracket/delimiter tracking is a general doc-comment parsing
 * concern, not a Feather-specific fix.
 */
type DelimiterDepthState = {
    square: number;
    angle: number;
    paren: number;
};

function createDelimiterDepthState(): DelimiterDepthState {
    return { square: 0, angle: 0, paren: 0 };
}

function updateDelimiterDepthState(depths: DelimiterDepthState, char: string) {
    switch (char) {
        case "[": {
            depths.square += 1;

            break;
        }
        case "]": {
            depths.square = Math.max(0, depths.square - 1);

            break;
        }
        case "<": {
            depths.angle += 1;

            break;
        }
        case ">": {
            depths.angle = Math.max(0, depths.angle - 1);

            break;
        }
        case "(": {
            depths.paren += 1;

            break;
        }
        case ")": {
            depths.paren = Math.max(0, depths.paren - 1);

            break;
        }
        // Omit a default case because this switch only manages delimiter nesting
        // depth for brackets ([, ], <, >, (, )). All other characters are
        // ignored by design so the calling loop can continue processing them
        // without extra branching noise.
    }
}

function isAtTopLevelDepth(depths: DelimiterDepthState) {
    return depths.square === 0 && depths.angle === 0 && depths.paren === 0;
}

/**
 * Extracts the type annotation portion from a JSDoc tag value.
 *
 * LOCATION SMELL: This belongs in Core's doc-comment service. Type annotation parsing
 * is a core doc-comment concern, not a Feather-specific fix.
 */
function extractTypeAnnotation(value) {
    if (typeof value !== "string") {
        return null;
    }

    const braceIndex = value.indexOf("{");

    if (braceIndex === -1) {
        return null;
    }

    const beforeBrace = value.slice(0, braceIndex + 1);
    const afterBrace = value.slice(braceIndex + 1);

    const closingIndex = afterBrace.indexOf("}");
    let typeText;
    let remainder;
    let hadClosingBrace = true;

    if (closingIndex === -1) {
        const split = splitTypeAndRemainder(afterBrace);
        typeText = split.type;
        remainder = split.remainder;
        hadClosingBrace = false;
    } else {
        typeText = afterBrace.slice(0, closingIndex);
        remainder = afterBrace.slice(closingIndex + 1);
    }

    const trimmedType = Core.toTrimmedString(typeText);

    return {
        beforeBrace,
        typeText: trimmedType,
        remainder,
        hadClosingBrace
    };
}

/**
 * Splits a JSDoc tag value into its type annotation and remaining description text.
 *
 * LOCATION SMELL: This belongs in Core's doc-comment service. Tag parsing is a general
 * doc-comment operation, not a Feather-specific fix.
 */
function splitTypeAndRemainder(text) {
    if (typeof text !== "string") {
        return { type: "", remainder: "" };
    }

    const delimiterDepth = createDelimiterDepthState();

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];

        updateDelimiterDepthState(delimiterDepth, char);

        if (WHITESPACE_PATTERN.test(char) && isAtTopLevelDepth(delimiterDepth)) {
            const typePart = text.slice(0, index).trimEnd();
            const remainder = text.slice(index);
            return { type: typePart, remainder };
        }
    }

    return {
        type: text.trim(),
        remainder: ""
    };
}

const WHITESPACE_PATTERN = /\s/;

/**
 * Normalizes whitespace and formatting in a type annotation string.
 *
 * LOCATION SMELL: This belongs in Core's doc-comment type-normalization service.
 */
function sanitizeTypeAnnotationText(typeText, typeSystemInfo) {
    if (typeof typeText !== "string" || typeText.length === 0) {
        return typeText ?? "";
    }

    const normalized = typeText.trim();
    const balanced = balanceTypeAnnotationDelimiters(normalized);

    const specifierSanitized = fixSpecifierSpacing(balanced, typeSystemInfo?.specifierBaseTypeNamesLower);

    const unionSanitized = fixTypeUnionSpacing(specifierSanitized, typeSystemInfo?.baseTypeNamesLower);

    return normalizeCollectionTypeDelimiters(unionSanitized);
}

/**
 * Ensures that angle brackets, braces, and parentheses are balanced in a type annotation.
 *
 * LOCATION SMELL: This belongs in Core's doc-comment type-normalization service.
 */
function balanceTypeAnnotationDelimiters(typeText) {
    if (typeof typeText !== "string" || typeText.length === 0) {
        return typeText ?? "";
    }

    const stack = [];

    for (const char of typeText) {
        switch (char) {
            case "[": {
                stack.push("]");

                break;
            }
            case "<": {
                stack.push(">");

                break;
            }
            case "(": {
                stack.push(")");

                break;
            }
            case "]":
            case ">":
            case ")": {
                if (stack.length > 0 && stack.at(-1) === char) {
                    stack.pop();
                }

                break;
            }
            // Omit a default case because this switch only processes bracket
            // delimiters ([, <, (, ], >, )) to track and balance them via the
            // stack. All other characters (type names, whitespace, punctuation)
            // do not affect delimiter matching and are implicitly passed over by
            // the loop. Adding a default branch would serve no purpose and
            // obscure the fact that the function deliberately ignores non-bracket
            // characters while scanning.
        }
    }

    if (stack.length === 0) {
        return typeText;
    }

    return typeText + stack.reverse().join("");
}

/**
 * Fixes spacing around type specifiers (e.g., "Array<" vs "Array <").
 *
 * LOCATION SMELL: This belongs in Core's doc-comment type-normalization service.
 */
function fixSpecifierSpacing(typeText, specifierBaseTypes) {
    if (typeof typeText !== "string" || typeText.length === 0) {
        return typeText ?? "";
    }

    if (!Core.isSetLike(specifierBaseTypes) || !Core.hasIterableItems(specifierBaseTypes)) {
        return typeText;
    }

    const patternSource = [...specifierBaseTypes].map((name) => Core.escapeRegExp(name)).join("|");

    if (!patternSource) {
        return typeText;
    }

    const regex = new RegExp(String.raw`\b(${patternSource})\b`, "gi");
    let result = "";
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(typeText)) !== null) {
        const matchStart = match.index;
        const matchEnd = regex.lastIndex;
        const before = typeText.slice(lastIndex, matchStart);
        const matchedText = typeText.slice(matchStart, matchEnd);
        result += before + matchedText;

        const remainder = typeText.slice(matchEnd);
        const specifierInfo = readSpecifierToken(remainder);

        if (specifierInfo) {
            result += specifierInfo.needsDot
                ? `.${specifierInfo.token}`
                : remainder.slice(0, specifierInfo.consumedLength);

            regex.lastIndex = matchEnd + specifierInfo.consumedLength;
            lastIndex = regex.lastIndex;
        } else {
            lastIndex = matchEnd;
        }
    }

    result += typeText.slice(lastIndex);
    return result;
}

/**
 * Reads and parses a type specifier token from the beginning of the text.
 *
 * LOCATION SMELL: This belongs in Core's doc-comment type-normalization service.
 */
function readSpecifierToken(text) {
    if (typeof text !== "string" || text.length === 0) {
        return null;
    }

    let offset = 0;

    while (offset < text.length && WHITESPACE_PATTERN.test(text[offset])) {
        offset += 1;
    }

    if (offset === 0) {
        return null;
    }

    const firstChar = text[offset];

    if (!firstChar || firstChar === "." || firstChar === "," || firstChar === "|" || firstChar === "}") {
        return {
            consumedLength: offset,
            needsDot: false
        };
    }

    let consumed = offset;
    let token = "";
    const delimiterDepth = createDelimiterDepthState();

    while (consumed < text.length) {
        const char = text[consumed];

        if (WHITESPACE_PATTERN.test(char) && isAtTopLevelDepth(delimiterDepth)) {
            break;
        }

        if ((char === "," || char === "|" || char === "}") && isAtTopLevelDepth(delimiterDepth)) {
            break;
        }

        updateDelimiterDepthState(delimiterDepth, char);

        token += char;
        consumed += 1;
    }

    if (token.length === 0) {
        return {
            consumedLength: offset,
            needsDot: false
        };
    }

    return {
        consumedLength: consumed,
        token,
        needsDot: true
    };
}

/**
 * Normalizes spacing around union type separators (|).
 *
 * LOCATION SMELL: This belongs in Core's doc-comment type-normalization service.
 */
function fixTypeUnionSpacing(typeText, baseTypesLower) {
    if (typeof typeText !== "string" || typeText.length === 0) {
        return typeText ?? "";
    }

    if (!Core.isSetLike(baseTypesLower) || !Core.hasIterableItems(baseTypesLower)) {
        return typeText;
    }

    if (!WHITESPACE_PATTERN.test(typeText)) {
        return typeText;
    }

    if (hasDelimiterOutsideNesting(typeText, [",", "|"])) {
        return typeText;
    }

    const segments = splitTypeSegments(typeText);

    if (segments.length <= 1) {
        return typeText;
    }

    const trimmedSegments = segments.map((segment) => segment.trim()).filter((segment) => segment.length > 0);

    if (trimmedSegments.length <= 1) {
        return typeText;
    }

    const recognizedCount = trimmedSegments.reduce((count, segment) => {
        const baseTypeName = extractBaseTypeName(segment);

        if (baseTypeName && baseTypesLower.has(baseTypeName.toLowerCase())) {
            return count + 1;
        }

        return count;
    }, 0);

    if (recognizedCount < 2) {
        return typeText;
    }

    return trimmedSegments.join(",");
}

// Convert legacy square-bracket collection syntax (e.g. Array[String]) into
// Feather's preferred angle-bracket form.
function normalizeCollectionTypeDelimiters(typeText) {
    if (typeof typeText !== "string" || typeText.length === 0) {
        return typeText ?? "";
    }

    return typeText.replaceAll("[", "<").replaceAll("]", ">");
}

/**
 * Splits a complex type annotation into logical segments for processing.
 *
 * LOCATION SMELL: This belongs in Core's doc-comment type-normalization service.
 */
function splitTypeSegments(text) {
    const segments = [];
    let current = "";
    const delimiterDepth = createDelimiterDepthState();

    for (const char of text) {
        updateDelimiterDepthState(delimiterDepth, char);

        if ((WHITESPACE_PATTERN.test(char) || char === "," || char === "|") && isAtTopLevelDepth(delimiterDepth)) {
            if (Core.isNonEmptyTrimmedString(current)) {
                segments.push(current.trim());
            }
            current = "";
            continue;
        }

        current += char;
    }

    if (Core.isNonEmptyTrimmedString(current)) {
        segments.push(current.trim());
    }

    return segments;
}

/**
 * Checks whether a delimiter character appears outside of nested brackets/parens.
 *
 * LOCATION SMELL: This belongs in Core's doc-comment type-normalization service.
 */
function hasDelimiterOutsideNesting(text, delimiters) {
    if (typeof text !== "string" || text.length === 0) {
        return false;
    }

    const delimiterSet = Core.hasIterableItems(delimiters) ? new Set(delimiters) : new Set();
    const delimiterDepth = createDelimiterDepthState();

    for (const char of text) {
        updateDelimiterDepthState(delimiterDepth, char);

        if (delimiterSet.has(char) && isAtTopLevelDepth(delimiterDepth)) {
            return true;
        }
    }

    return false;
}

function createTemporaryIdentifierName(argument, siblings) {
    const existingNames = new Set();

    if (Array.isArray(siblings)) {
        for (const entry of siblings) {
            collectIdentifierNames(entry, existingNames);
        }
    }

    const baseName = sanitizeIdentifierName(Core.getIdentifierName(argument) || "value");
    const prefix = `__featherFix_${baseName}`;
    let candidate = prefix;
    let suffix = 1;

    while (existingNames.has(candidate)) {
        candidate = `${prefix}_${suffix}`;
        suffix += 1;
    }

    return candidate;
}

/**
 * Removes invalid characters from an identifier name.
 *
 * LOCATION SMELL: This is a general identifier utility that should live with other
 * identifier helpers in Core, not in the Feather-fixes file.
 */
function sanitizeIdentifierName(name) {
    if (typeof name !== "string" || name.length === 0) {
        return "value";
    }

    let sanitized = name.replaceAll(/[^A-Za-z0-9_]/g, "_");

    if (!/^[A-Za-z_]/.test(sanitized)) {
        sanitized = `value_${sanitized}`;
    }

    return sanitized || "value";
}

/**
 * Recursively collects all identifier names in a subtree and adds them to the registry.
 *
 * LOCATION SMELL: This is a general identifier collection utility that overlaps with
 * similar functions elsewhere in this file and should be consolidated with other
 * identifier utilities in Core or Semantic.
 */
function collectIdentifierNames(node, registry) {
    if (!node || !registry) {
        return;
    }

    if (Array.isArray(node)) {
        for (const entry of node) {
            collectIdentifierNames(entry, registry);
        }
        return;
    }

    if (typeof node !== "object") {
        return;
    }

    const identifierDetails = Core.getIdentifierDetails(node);
    if (identifierDetails) {
        registry.add(identifierDetails.name);
    }

    for (const value of Object.values(node)) {
        if (value && typeof value === "object") {
            collectIdentifierNames(value, registry);
        }
    }
}

function isSpriteGetTextureCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    return Core.isIdentifierWithName(node.object, "sprite_get_texture");
}

function isSurfaceResetTargetCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    return Core.isIdentifierWithName(node.object, "surface_reset_target");
}

function createSurfaceResetTargetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = Core.createIdentifierNode("surface_reset_target", template.object);

    if (!identifier) {
        return null;
    }

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: []
    };

    Core.assignClonedLocation(callExpression, template);

    return callExpression;
}

function isDrawFunctionCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    const identifier = node.object;

    if (!Core.isIdentifierNode(identifier)) {
        return false;
    }

    return typeof identifier.name === "string" && identifier.name.startsWith("draw_");
}

function isVertexSubmitCallUsingActiveTarget(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (!Core.isIdentifierWithName(node.object, "vertex_submit")) {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length < 3) {
        return false;
    }

    return isNegativeOneLiteral(args[2]);
}

function extractSurfaceTargetName(node) {
    if (!node || node.type !== "CallExpression") {
        return null;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length > 0 && Core.isIdentifierNode(args[0])) {
        return args[0].name;
    }

    return node.object?.name ?? null;
}

function isNegativeOneLiteral(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    if (node.type === "Literal") {
        return node.value === "-1" || node.value === -1;
    }

    if (node.type === "UnaryExpression" && node.operator === "-" && node.prefix) {
        const argument = node.argument;

        if (!argument || argument.type !== "Literal") {
            return false;
        }

        return argument.value === "1" || argument.value === 1;
    }

    return false;
}

function isEventInheritedCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (!Core.isIdentifierWithName(node.object, "event_inherited")) {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);

    return args.length === 0;
}

function isStatementContainer(owner, ownerKey) {
    if (!owner || typeof owner !== "object") {
        return false;
    }

    if (ownerKey === "body") {
        return Core.isProgramOrBlockStatement(owner);
    }

    if (owner.type === "SwitchCase" && ownerKey === "consequent") {
        return true;
    }

    return false;
}

/**
 * Extracts the base type name from a type segment string.
 *
 * PURPOSE: JSDoc type annotations can have specifiers (e.g., "Array<String>").
 * This function extracts just the base type name ("Array") from the full segment.
 *
 * LOCATION SMELL: This belongs in Core's doc-comment type-normalization service.
 * See the comments on sanitizeMalformedJsDocTypes for details on consolidating
 * JSDoc type handling logic.
 */
function extractBaseTypeName(segment) {
    if (typeof segment !== "string") {
        return null;
    }

    const match = segment.match(/^[A-Za-z_][A-Za-z0-9_]*/);

    return match ? match[0] : null;
}

/**
 * Extracts the parameter name from a JSDoc tag's remainder text.
 *
 * PURPOSE: After parsing the type annotation from a @param tag, this function
 * extracts the parameter identifier from the remaining description text.
 *
 * LOCATION SMELL: This belongs in Core's doc-comment parsing service.
 */
function extractParameterNameFromDocRemainder(remainder) {
    if (typeof remainder !== "string") {
        return null;
    }

    const match = remainder.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)/);

    return match ? match[1] : null;
}

/**
 * Renames identifiers that conflict with reserved words or GML built-ins.
 *
 * DUPLICATION WARNING: This function implements identifier renaming logic that likely
 * overlaps with functionality in the 'refactor' and 'semantic' modules.
 *
 * ARCHITECTURE: Identifier renaming should be a responsibility of the 'refactor' module,
 * which is built on top of 'semantic'. The 'semantic' module provides scope analysis and
 * binding resolution (determining what each identifier refers to and where it's defined),
 * while 'refactor' uses that information to perform safe renames that avoid shadowing
 * conflicts and preserve program semantics.
 *
 * CURRENT STATE: This function performs ad-hoc renaming for Feather-detected reserved
 * identifier conflicts without consulting scope information. This risks:
 *   - Introducing new name conflicts by choosing replacements that shadow other variables
 *   - Missing some references if the scope isn't properly analyzed
 *   - Renaming identifiers that don't actually conflict in their scope
 *
 * RECOMMENDATION: Before adding new renaming logic here, check if 'refactor' already
 * provides the capability. If it does, import it and use the scope-aware implementation.
 * If it doesn't, consider adding the feature to 'refactor' so it can be shared and
 * properly tested with scope analysis.
 *
 * LONG-TERM: Extract all identifier renaming from this file and consolidate it into
 * 'refactor', then import those functions here for Feather-specific fixes.
 */
function renameReservedIdentifiers({ ast, diagnostic, sourceText }) {
    if (!diagnostic || !ast || typeof ast !== "object" || getReservedIdentifierNames().size === 0) {
        return [];
    }

    const fixes = [];
    const renameMap = new Map();

    // First pass: find all declarations that need to be renamed
    const collectRenamings = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const child of node) {
                collectRenamings(child);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "VariableDeclaration" && isSupportedVariableDeclaration(node)) {
            const declarationFixes = renameReservedIdentifiersInVariableDeclaration(node, diagnostic);

            if (Core.isNonEmptyArray(declarationFixes)) {
                fixes.push(...declarationFixes);
                // Collect the renamed identifiers
                for (const fix of declarationFixes) {
                    if (fix?.target && fix?.replacement) {
                        renameMap.set(fix.target, fix.replacement);
                    }
                }
            }
        } else if (node.type === "MacroDeclaration") {
            const macroFix = renameReservedIdentifierInMacro(node, diagnostic, sourceText);

            if (macroFix) {
                fixes.push(macroFix);
                if (macroFix?.target && macroFix?.replacement) {
                    renameMap.set(macroFix.target, macroFix.replacement);
                }
            }
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                collectRenamings(value);
            }
        }
    };

    collectRenamings(ast);

    // Second pass: rename all identifier usages
    if (renameMap.size > 0) {
        const renameUsages = (node, parent, property) => {
            if (!node) {
                return;
            }

            if (Array.isArray(node)) {
                for (let i = 0; i < node.length; i++) {
                    renameUsages(node[i], node, i);
                }
                return;
            }

            if (typeof node !== "object") {
                return;
            }

            // Skip renaming identifiers in certain contexts
            if (shouldSkipIdentifierRenaming(node, parent, property)) {
                return;
            }

            if (node.type === "Identifier" && node.name && renameMap.has(node.name)) {
                node.name = renameMap.get(node.name);
            }

            for (const [key, value] of Object.entries(node)) {
                if (value && typeof value === "object") {
                    renameUsages(value, node, key);
                }
            }
        };

        renameUsages(ast, null, null);
    }

    return fixes;
}

function shouldSkipIdentifierRenaming(node, parent, property) {
    if (!parent) {
        return false;
    }

    // Skip renaming the identifier in a variable declarator (already renamed in first pass)
    if (parent.type === "VariableDeclarator" && property === "id") {
        return true;
    }

    // Skip renaming in macro declarations (already renamed in first pass)
    if (parent.type === "MacroDeclaration" && property === "name") {
        return true;
    }

    // Skip renaming property names in member access expressions
    if (parent.type === "MemberDotExpression" && property === "property") {
        return true;
    }

    // Skip renaming in enum declarations
    if (parent.type === "EnumDeclaration" && property === "name") {
        return true;
    }

    // Skip renaming enum member names
    if (parent.type === "EnumMember" && property === "name") {
        return true;
    }

    // Skip renaming function parameter names (already handled separately if needed)
    if (Array.isArray(parent)) {
        // This case is not easily determinable without additional context
        // We might need to check the parent's parent to see if it's a function
        return false;
    }

    return false;
}

function isSupportedVariableDeclaration(node) {
    if (!node || node.type !== "VariableDeclaration") {
        return false;
    }

    const kind = typeof node.kind === "string" ? Core.toNormalizedLowerCaseString(node.kind) : null;

    return kind === "var" || kind === "static";
}

/**
 * Renames reserved identifiers within a VariableDeclaration node.
 *
 * DUPLICATION WARNING: See the comment on renameReservedIdentifiers above.
 * This is part of the identifier renaming subsystem that should be consolidated
 * with the 'refactor' and 'semantic' modules.
 */
function renameReservedIdentifiersInVariableDeclaration(node, diagnostic) {
    const declarations = Array.isArray(node?.declarations) ? node.declarations : [];

    if (declarations.length === 0) {
        return [];
    }

    const fixes = [];

    for (const declarator of declarations) {
        if (!declarator || declarator.type !== "VariableDeclarator") {
            continue;
        }

        const fix = renameReservedIdentifierNode(declarator.id, diagnostic);

        if (fix) {
            fixes.push(fix);
        }
    }

    return fixes;
}

/**
 * Renames a single identifier node if it conflicts with a reserved word.
 *
 * DUPLICATION WARNING: See the comment on renameReservedIdentifiers above.
 * This is part of the identifier renaming subsystem that should be consolidated
 * with the 'refactor' and 'semantic' modules.
 */
function renameReservedIdentifierNode(identifier, diagnostic, options: RenameOptions = {}) {
    if (!identifier || identifier.type !== "Identifier") {
        return null;
    }

    const name = identifier.name;

    if (!isReservedIdentifier(name)) {
        return null;
    }

    const replacement = getReplacementIdentifierName(name);

    if (!replacement || replacement === name) {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: name ?? null,
        range: {
            start: Core.getNodeStartIndex(identifier),
            end: Core.getNodeEndIndex(identifier)
        }
    });

    if (!fixDetail) {
        return null;
    }

    // Add the replacement name to the fix detail so it can be collected
    fixDetail.replacement = replacement;

    identifier.name = replacement;

    if (typeof options.onRename === "function") {
        try {
            options.onRename({
                identifier,
                originalName: name,
                replacement
            });
        } catch {
            // Swallow callback errors to avoid interrupting the fix pipeline.
        }
    }

    attachFeatherFixMetadata(identifier, [fixDetail]);

    return fixDetail;
}

/**
 * Renames a reserved identifier in a macro declaration, updating the macro's text.
 *
 * DUPLICATION WARNING: See the comment on renameReservedIdentifiers above.
 * This is part of the identifier renaming subsystem that should be consolidated
 * with the 'refactor' and 'semantic' modules.
 *
 * SPECIAL CASE: Macros require additional handling because their body is stored as
 * unparsed text rather than an AST. When renaming a macro identifier, we must also
 * update the macro text to reflect the new name.
 */
function renameReservedIdentifierInMacro(node, diagnostic, sourceText) {
    if (!node || node.type !== "MacroDeclaration") {
        return null;
    }

    return renameReservedIdentifierNode(node.name, diagnostic, {
        onRename: ({ originalName, replacement }) => {
            const updatedText = buildMacroReplacementText({
                macro: node,
                originalName,
                replacement,
                sourceText
            });

            if (typeof updatedText === "string") {
                node._featherMacroText = updatedText;
            }
        }
    });
}

/**
 * Checks whether a given identifier name is a GML reserved word or built-in.
 *
 * DUPLICATION WARNING: This check likely exists in 'refactor' or 'semantic' as well,
 * since reserved word detection is a fundamental part of identifier validation and
 * scope analysis.
 *
 * RECOMMENDATION: Check if 'semantic' or 'refactor' already provides this functionality.
 * If so, import it instead of maintaining a separate implementation. If not, consider
 * moving this to Core or Semantic so all packages can use the same reserved-word list.
 */
function isReservedIdentifier(name) {
    if (typeof name !== "string" || name.length === 0) {
        return false;
    }

    return getReservedIdentifierNames().has(name.toLowerCase());
}

function getReplacementIdentifierName(originalName) {
    if (typeof originalName !== "string" || originalName.length === 0) {
        return null;
    }

    let candidate = `__featherFix_${originalName}`;
    const seen = new Set();

    while (isReservedIdentifier(candidate)) {
        if (seen.has(candidate)) {
            return null;
        }

        seen.add(candidate);
        candidate = `_${candidate}`;
    }

    return candidate;
}

function buildMacroReplacementText({ macro, originalName, replacement, sourceText }) {
    if (!macro || macro.type !== "MacroDeclaration" || typeof replacement !== "string") {
        return null;
    }

    const baseText = getMacroBaseText(macro, sourceText);

    if (!Core.isNonEmptyString(baseText)) {
        return null;
    }

    if (Core.isNonEmptyString(originalName)) {
        // Use a regular expression with word boundaries to avoid partial matches during renaming.
        // We use the 'g' flag even though macros usually only contain the name once in the
        // declaration header, as macros are text-based and could potentially reference
        // themselves or others in a way that requires global replacement within the line.
        const escapedName = originalName.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
        const regex = new RegExp(String.raw`\b${escapedName}\b`, "g");

        if (regex.test(baseText)) {
            return baseText.replace(regex, replacement);
        }
    }

    return null;
}

function getMacroBaseText(macro, sourceText) {
    if (!macro || macro.type !== "MacroDeclaration") {
        return null;
    }

    if (Core.isNonEmptyString(macro._featherMacroText)) {
        return macro._featherMacroText;
    }

    if (typeof sourceText !== "string" || sourceText.length === 0) {
        return null;
    }

    const startIndex = Core.getNodeStartIndex(macro);
    const endIndex = Core.getNodeEndIndex(macro);

    if (typeof startIndex !== "number" || typeof endIndex !== "number" || endIndex < startIndex) {
        return null;
    }

    return sourceText.slice(startIndex, endIndex);
}

function registerManualFeatherFix({ ast, diagnostic, sourceText }) {
    if (!ast || typeof ast !== "object" || !diagnostic?.id) {
        return [];
    }

    const manualFixIds = getManualFeatherFixRegistry(ast);

    if (manualFixIds.has(diagnostic.id)) {
        return [];
    }

    manualFixIds.add(diagnostic.id);

    // Special-case GM1033 (duplicate semicolons): if source text is
    // available on the diagnostic context, attempt to compute canonical
    // duplicate-semicolon fixes so tests receive concrete numeric ranges
    // instead of a null-range manual placeholder.
    try {
        const ctxSource = typeof sourceText === "string" ? sourceText : null;

        if (diagnostic?.id === "GM1033" && typeof ctxSource === "string") {
            const regenerated = removeDuplicateSemicolons({
                ast,
                sourceText: ctxSource,
                diagnostic
            });

            if (Core.isNonEmptyArray(regenerated)) {
                // Attach regenerated fixes and mark as manual (automatic: false)
                for (const f of regenerated) {
                    if (f && typeof f === "object") {
                        f.automatic = false;
                    }
                }

                return regenerated;
            }
        }
    } catch {
        // Fall through to create a manual placeholder if regeneration fails.
    }

    // If regeneration failed or produced no fixes, attempt a conservative
    // full-source scan for duplicate-semicolon runs so we can return
    // concrete ranges instead of a null-range placeholder.
    try {
        const ctxSource = typeof sourceText === "string" ? sourceText : null;

        if (diagnostic?.id === "GM1033" && typeof ctxSource === "string") {
            const ranges = findDuplicateSemicolonRanges(ctxSource, 0);

            if (Core.isNonEmptyArray(ranges)) {
                const manualFixes = [];

                for (const range of ranges) {
                    if (!range || typeof range.start !== "number" || typeof range.end !== "number") {
                        continue;
                    }

                    const fixDetail = createFeatherFixDetail(diagnostic, {
                        automatic: false,
                        target: null,
                        range
                    });

                    if (fixDetail) {
                        manualFixes.push(fixDetail);
                    }
                }

                if (manualFixes.length > 0) {
                    return manualFixes;
                }
            }
        }
    } catch {
        // ignore and fall back to null-range placeholder
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        automatic: false,
        range: null,
        target: null
    });

    return [fixDetail];
}

function balanceGpuStateStack({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                visit(item);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (Core.isProgramOrBlockStatement(node)) {
            const statements = Core.getBodyStatements(node);

            if (statements.length > 0 && node.type !== "Program") {
                const blockFixes = balanceGpuStateCallsInStatements(statements, diagnostic, node);

                if (blockFixes.length > 0) {
                    fixes.push(...blockFixes);
                }
            }

            for (const statement of statements) {
                visit(statement);
            }

            for (const [key, value] of Object.entries(node)) {
                if (key === "body") {
                    continue;
                }

                if (value && typeof value === "object") {
                    visit(value);
                }
            }

            return;
        }

        if (node.type === "CaseClause") {
            const statements = Core.getArrayProperty(node, "consequent");

            if (statements.length > 0) {
                const blockFixes = balanceGpuStateCallsInStatements(statements, diagnostic, node);

                if (blockFixes.length > 0) {
                    fixes.push(...blockFixes);
                }
            }

            if (node.test) {
                visit(node.test);
            }

            for (const statement of statements) {
                visit(statement);
            }

            for (const [key, value] of Object.entries(node)) {
                if (key === "consequent" || key === "test") {
                    continue;
                }

                if (value && typeof value === "object") {
                    visit(value);
                }
            }

            return;
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

function balanceGpuStateCallsInStatements(statements, diagnostic, container) {
    if (!Core.isNonEmptyArray(statements)) {
        return [];
    }

    const unmatchedPushes = [];
    const fixes = [];
    const indicesToRemove = new Set();
    let hasPopCall = false;

    for (const [index, statement] of statements.entries()) {
        if (!statement || typeof statement !== "object") {
            continue;
        }

        if (isGpuPushStateCall(statement)) {
            unmatchedPushes.push({ index, node: statement });
            continue;
        }

        if (isGpuPopStateCall(statement)) {
            hasPopCall = true;

            if (unmatchedPushes.length > 0) {
                unmatchedPushes.pop();
                continue;
            }

            const fixDetail = createFeatherFixDetail(diagnostic, {
                target: statement.object?.name ?? "gpu_pop_state",
                range: {
                    start: Core.getNodeStartIndex(statement),
                    end: Core.getNodeEndIndex(statement)
                }
            });

            indicesToRemove.add(index);

            if (!fixDetail) {
                continue;
            }

            fixes.push(fixDetail);
        }
    }

    if (unmatchedPushes.length > 0 && hasPopCall) {
        for (const entry of unmatchedPushes) {
            const fixDetail = createFeatherFixDetail(diagnostic, {
                target: entry.node?.object?.name ?? "gpu_push_state",
                range: {
                    start: Core.getNodeStartIndex(entry.node),
                    end: Core.getNodeEndIndex(entry.node)
                }
            });

            indicesToRemove.add(entry.index);

            if (!fixDetail) {
                continue;
            }

            fixes.push(fixDetail);
        }
    }

    if (indicesToRemove.size > 0) {
        for (let i = statements.length - 1; i >= 0; i -= 1) {
            if (indicesToRemove.has(i)) {
                statements.splice(i, 1);
            }
        }
    }

    if (fixes.length > 0 && container && typeof container === "object") {
        attachFeatherFixMetadata(container, fixes);
    }

    return fixes;
}

function isGpuPushStateCall(node) {
    return isGpuStateCall(node, "gpu_push_state");
}

function isGpuPopStateCall(node) {
    return isGpuStateCall(node, "gpu_pop_state");
}

function getManualFeatherFixRegistry(ast) {
    let registry = ast[MANUAL_FIX_TRACKING_KEY];

    if (Core.isSetLike(registry)) {
        return registry;
    }

    registry = new Set();

    Object.defineProperty(ast, MANUAL_FIX_TRACKING_KEY, {
        configurable: true,
        enumerable: false,
        writable: false,
        value: registry
    });

    return registry;
}

function applyMissingFunctionCallCorrections({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const replacements = extractFunctionCallReplacementsFromExamples(diagnostic);

    if (!Core.isMapLike(replacements) || !Core.hasIterableItems(replacements)) {
        return [];
    }

    const fixes = [];

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                visit(item);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "CallExpression") {
            const fix = correctMissingFunctionCall(node, replacements, diagnostic);

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

function correctMissingFunctionCall(node, replacements, diagnostic) {
    if (!node || node.type !== "CallExpression") {
        return null;
    }

    if (!Core.isMapLike(replacements) || !Core.hasIterableItems(replacements)) {
        return null;
    }

    const callee = Core.getCallExpressionIdentifier(node);

    if (!callee) {
        return null;
    }

    const replacementName = replacements.get(callee.name);

    if (!replacementName || replacementName === callee.name) {
        return null;
    }

    const startIndex = Core.getNodeStartIndex(callee);
    const endIndex = Core.getNodeEndIndex(callee);
    const range =
        typeof startIndex === "number" && typeof endIndex === "number" ? { start: startIndex, end: endIndex } : null;

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: callee.name ?? null,
        range
    });

    if (!fixDetail) {
        return null;
    }

    fixDetail.replacement = replacementName;

    callee.name = replacementName;
    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

function extractFunctionCallReplacementsFromExamples(diagnostic) {
    const replacements = new Map();

    if (!diagnostic) {
        return replacements;
    }

    const badExampleCalls = extractFunctionCallNamesFromExample(diagnostic.badExample);
    const goodExampleCalls = extractFunctionCallNamesFromExample(diagnostic.goodExample);

    const count = Math.min(badExampleCalls.length, goodExampleCalls.length);

    for (let index = 0; index < count; index += 1) {
        const typo = badExampleCalls[index];
        const correction = goodExampleCalls[index];

        if (!typo || !correction || typo === correction) {
            continue;
        }

        if (!replacements.has(typo)) {
            replacements.set(typo, correction);
        }
    }

    return replacements;
}

function extractFunctionCallNamesFromExample(exampleText) {
    if (typeof exampleText !== "string" || exampleText.length === 0) {
        return [];
    }

    const matches = [];
    const lines = exampleText.split(/\r?\n/);

    for (const line of lines) {
        if (!line || !line.includes("(")) {
            continue;
        }

        const [code] = line.split("//", 1);
        if (!Core.isNonEmptyTrimmedString(code)) {
            continue;
        }

        const callPattern = /\b([A-Za-z_][A-Za-z0-9_]*)\s*(?=\()/g;
        let match;
        while ((match = callPattern.exec(code))) {
            matches.push(match[1]);
        }
    }

    return matches;
}

const ARGUMENT_BUILTINS = new Set([
    /**
     * GML built-in argument access functions and constants.
     *
     * ORGANIZATION SMELL: This list of built-in function names belongs in a dedicated
     * GML function library module, not scattered through transformation files.
     *
     * RECOMMENDATION: Create src/core/src/gml/builtin-functions.ts (or similar) to
     * centralize all GML built-in function and constant information:
     *   - ARGUMENT_BUILTINS (this set)
     *   - DRAW_FUNCTIONS (draw_* functions)
     *   - GPU_STATE_FUNCTIONS (gpu_* functions)
     *   - STRING_FUNCTIONS (string_* functions)
     *   - etc.
     *
     * This makes built-in function metadata discoverable, testable, and reusable across
     * the plugin, semantic analysis, and refactoring operations.
     */
    "argument",
    "argument_relative",
    "argument_count",
    ...Array.from({ length: 16 }, (_, index) => `argument${index}`)
]);

function relocateArgumentReferencesInsideFunctions({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const programBody = Core.getBodyStatements(ast);

    if (programBody.length === 0) {
        return [];
    }

    const fixes = [];

    for (let index = 0; index < programBody.length; index += 1) {
        const entry = programBody[index];

        if (!isFunctionDeclaration(entry)) {
            continue;
        }

        const block = getFunctionBlock(entry);

        if (!block) {
            continue;
        }

        const nextIndex = index + 1;

        while (nextIndex < programBody.length) {
            const candidate = programBody[nextIndex];

            if (!candidate || typeof candidate !== "object") {
                break;
            }

            if (isFunctionDeclaration(candidate)) {
                break;
            }

            const argumentReference = findArgumentReferenceOutsideFunctions(candidate);

            if (!argumentReference) {
                break;
            }

            (programBody as GameMakerAstNode[]).splice(nextIndex, 1);
            block.body.push(candidate);

            const fixDetail = createFeatherFixDetail(diagnostic, {
                target: argumentReference?.name ?? null,
                range: {
                    start: Core.getNodeStartIndex(candidate),
                    end: Core.getNodeEndIndex(candidate)
                }
            });

            if (fixDetail) {
                attachFeatherFixMetadata(candidate, [fixDetail]);
                fixes.push(fixDetail);
            }
        }
    }

    return fixes;
}

function isFunctionDeclaration(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    return node.type === "FunctionDeclaration";
}

function getFunctionBlock(declaration) {
    const body = declaration?.body;

    if (!body || body.type !== "BlockStatement") {
        return null;
    }

    const blockBody = Array.isArray(body.body) ? body.body : null;

    if (!blockBody) {
        return null;
    }

    return body;
}

function findArgumentReferenceOutsideFunctions(node) {
    let match = null;

    const visit = (current, isRoot = false) => {
        if (!current || match) {
            return;
        }

        if (Array.isArray(current)) {
            for (const item of current) {
                visit(item, false);

                if (match) {
                    break;
                }
            }

            return;
        }

        if (typeof current !== "object") {
            return;
        }

        if (!isRoot && Core.isFunctionLikeNode(current)) {
            return;
        }

        if (current.type === "Identifier") {
            const builtin = getArgumentBuiltinName(current.name);

            if (builtin) {
                match = { name: builtin };
                return;
            }
        }

        if (current.type === "MemberIndexExpression" && Core.isIdentifierWithName(current.object, "argument")) {
            match = { name: "argument" };
            return;
        }

        if (current.type === "MemberDotExpression" && Core.isIdentifierWithName(current.object, "argument")) {
            match = { name: "argument" };
            return;
        }

        for (const value of Object.values(current)) {
            if (!value || (typeof value !== "object" && !Array.isArray(value))) {
                continue;
            }

            visit(value, false);

            if (match) {
                break;
            }
        }
    };

    visit(node, true);

    return match;
}

function getArgumentBuiltinName(name) {
    if (typeof name !== "string") {
        return null;
    }

    if (ARGUMENT_BUILTINS.has(name)) {
        return name;
    }

    return null;
}

function collectGM1100Candidates(node) {
    const index = new Map();

    const visit = (candidate) => {
        if (!candidate) {
            return;
        }

        if (Array.isArray(candidate)) {
            for (const item of candidate) {
                visit(item);
            }
            return;
        }

        if (typeof candidate !== "object") {
            return;
        }

        if (
            (candidate.type === "VariableDeclaration" || candidate.type === "AssignmentExpression") &&
            typeof Core.getNodeStartLine(candidate) === "number"
        ) {
            const line = Core.getNodeStartLine(candidate);

            if (typeof line === "number") {
                if (!index.has(line)) {
                    index.set(line, []);
                }

                index.get(line).push(candidate);
            }
        }

        for (const value of Object.values(candidate)) {
            if (value && typeof value === "object") {
                visit(value);
            }
        }
    };

    visit(node);

    return index;
}

function updateJSDocParamName(node: any, oldName: string, newName: string, collectionService: any) {
    if (!node) {
        return;
    }

    const comments = collectionService ? collectionService.getComments(node) : node.comments;

    if (!Array.isArray(comments)) {
        return;
    }

    const escapedOld = oldName.replaceAll(/[.*+?^()|[\]\\]/g, String.raw`\$&`);
    const regex = new RegExp(String.raw`\b${escapedOld}\b`, "g");

    for (const comment of comments) {
        if (typeof comment.value === "string" && comment.value.includes("@param")) {
            comment.value = comment.value.replace(regex, newName);
        }
    }
}
