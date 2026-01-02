/**
 * Central print dispatcher for the GML Prettier plugin.
 *
 * ARCHITECTURE NOTE: This file has grown organically and now houses both high-level
 * print coordination logic and low-level node-handling utilities. It should be refactored
 * into multiple focused modules:
 *
 * - A top-level coordinator that delegates to domain-specific sub-printers
 * - Separate files for each AST node category (expressions, statements, declarations, etc.)
 * - General AST utilities (node inspection, property access) should move to Core
 * - Comment handling should be extracted to a dedicated comment-printer module
 *
 * Until this refactoring occurs, contributors should avoid adding new utility functions
 * here; instead, place domain-specific helpers in appropriately-scoped files under
 * src/plugin/src/printer/ or src/core/src/ast/ and import them as needed.
 */

import { Core, type MutableDocCommentLines } from "@gml-modules/core";
import { util } from "prettier";

import {
    countTrailingBlankLines,
    getNextNonWhitespaceCharacter,
    isLastStatement,
    isSkippableSemicolonWhitespace,
    optionalSemicolon
} from "./semicolons.js";
import {
    getEnumNameAlignmentPadding,
    prepareEnumMembersForPrinting
} from "./enum-alignment.js";
import {
    shouldForceBlankLineBetweenReturnPaths,
    shouldForceTrailingBlankLineForNestedFunction,
    shouldSuppressEmptyLineBetween,
    shouldAddNewlinesAroundStatement
} from "./statement-spacing-policy.js";
import {
    conditionalGroup,
    concat,
    breakParent,
    group,
    hardline,
    ifBreak,
    indent,
    join,
    line,
    lineSuffix,
    lineSuffixBoundary,
    softline,
    willBreak
} from "./prettier-doc-builders.js";

import {
    collectFunctionDocCommentDocs,
    normalizeFunctionDocCommentDocs
} from "./doc-comment/function-docs.js";

import {
    getSyntheticDocCommentForFunctionAssignment,
    getSyntheticDocCommentForStaticVariable
} from "./doc-comment/synthetic-doc-comments.js";

import {
    hasBlankLineBeforeLeadingComment,
    hasBlankLineBetweenLastCommentAndClosingBrace,
    getOriginalTextFromOptions,
    macroTextHasExplicitTrailingBlankLine,
    resolveNodeIndexRangeWithSource,
    resolvePrinterSourceMetadata,
    sliceOriginalText,
    stripTrailingLineTerminators
} from "./source-text.js";
import {
    printComment,
    printDanglingComments,
    printDanglingCommentsAsGroup
} from "../comments/index.js";
import { TRAILING_COMMA } from "../options/trailing-comma-option.js";

import { Semantic } from "@gml-modules/semantic";
import {
    LogicalOperatorsStyle,
    normalizeLogicalOperatorsStyle
} from "../options/logical-operators-style.js";
import {
    ObjectWrapOption,
    resolveObjectWrapOption
} from "../options/object-wrap-option.js";

// Import node type constants to replace magic strings
const {
    ASSIGNMENT_EXPRESSION,
    BLOCK_STATEMENT,
    CALL_EXPRESSION,
    CONSTRUCTOR_DECLARATION,
    DEFINE_STATEMENT,
    DO_UNTIL_STATEMENT,
    EXPRESSION_STATEMENT,
    FOR_STATEMENT,
    FUNCTION_DECLARATION,
    FUNCTION_EXPRESSION,
    IDENTIFIER,
    IF_STATEMENT,
    LITERAL,
    MACRO_DECLARATION,
    MEMBER_DOT_EXPRESSION,
    MEMBER_INDEX_EXPRESSION,
    PROGRAM,
    REPEAT_STATEMENT,
    STRUCT_EXPRESSION,
    TEMPLATE_STRING_TEXT,
    VARIABLE_DECLARATION,
    VARIABLE_DECLARATOR,
    WHILE_STATEMENT,
    WITH_STATEMENT
} = Core;

const { isNextLineEmpty, isPreviousLineEmpty } = util;

// Polyfill literalLine if not available in prettier-doc-builders
// const literalLine = { type: "line", hard: true, literal: true };

// String constants to avoid duplication warnings
const STRING_TYPE = "string";
const OBJECT_TYPE = "object";
const NUMBER_TYPE = "number";
const UNDEFINED_TYPE = "undefined";

// Use Core.* directly instead of destructuring the Core namespace across
// package boundaries (see AGENTS.md): e.g., use Core.getCommentArray(...) not
// `getCommentArray(...)`.

/**
 * Wrapper helpers around optional Semantic identifier-case services.
 *
 * CONTEXT: Some test and runtime environments may not expose the full Semantic facade
 * due to lazy module loading, circular dependencies during initialization, or test provider
 * swaps. These helpers provide safe fallbacks so the printer remains robust and deterministic
 * even when Semantic is partially unavailable.
 *
 * FUTURE: Consider moving these adapters into Core or Semantic for reuse across other
 * modules that need graceful degradation when Semantic features are unavailable.
 */
function getSemanticIdentifierCaseRenameForNode(node, options) {
    // When `__identifierCaseDryRun` is set, the caller wants to preview what would be
    // renamed without actually mutating the output. This dry-run mode is used by the
    // CLI's `--identifier-case-dry-run` flag to generate a report of planned changes
    // before applying them. If we allowed rename lookups during dry-run, the printer
    // would emit the new identifiers in the formatted output, which defeats the purpose
    // of a preview-only pass. Instead, we return `null` here to signal that no rename
    // should be applied, ensuring that dry-run formatting produces a diff-free result
    // while still allowing the rename engine to log or track what *would* have changed.
    if (options?.__identifierCaseDryRun === true) {
        return null;
    }

    // Prefer the registered Semantic lookup service if available, but be defensive
    // about lazy-initialized or dynamically-proxied modules. Some runtime environments
    // (especially test harnesses or module systems with circular dependency resolution)
    // may lazily wrap exports in a Proxy that hides properties from enumeration until
    // first access. Attempting to destructure or directly call the facade helper can
    // fail silently if the export isn't fully resolved yet. To keep printing deterministic
    // even when the higher-level Semantic facade is unavailable (due to circular init,
    // test-provider swaps, or partial module loading), we fall back to a direct lookup
    // in the `renameMap` snapshot attached to the options bag. This two-tier approach
    // ensures that identifier-case corrections still apply even when the Semantic module
    // isn't fully initialized, which can happen during incremental builds or hot-reload
    // scenarios where the printer runs before the semantic analyzer finishes its setup.
    let finalResult = null;
    try {
        if (
            Semantic &&
            typeof Semantic.getIdentifierCaseRenameForNode === "function"
        ) {
            finalResult = Semantic.getIdentifierCaseRenameForNode(
                node,
                options
            );
        }
    } catch {
        /* ignore */
    }

    // If the facade lookup did not produce a rename, attempt a narrow
    // direct lookup against the captured renameMap. This mirrors the
    // planner's location-based key encoding and emits diagnostics to help
    // triage any mismatches.
    try {
        if (!finalResult) {
            const renameMap = options?.__identifierCaseRenameMap ?? null;
            if (
                renameMap &&
                typeof renameMap.get === "function" &&
                node &&
                node.start
            ) {
                const loc =
                    typeof node.start === "number"
                        ? { index: node.start }
                        : node.start;
                const key = Core.buildLocationKey(loc);
                if (key) {
                    finalResult = renameMap.get(key) ?? finalResult;
                }
            }
        }
    } catch {
        /* ignore */
    }

    return finalResult;
}

const FEATHER_COMMENT_OUT_SYMBOL = Symbol.for(
    "prettier.gml.feather.commentOut"
);
const FEATHER_COMMENT_TEXT_SYMBOL = Symbol.for(
    "prettier.gml.feather.commentText"
);
const FEATHER_COMMENT_PREFIX_TEXT_SYMBOL = Symbol.for(
    "prettier.gml.feather.commentPrefixText"
);

const forcedStructArgumentBreaks = new WeakMap();

const GM1015_DIAGNOSTIC_ID = "GM1015";

function hasFeatherFix(node, id) {
    if (!node || typeof node !== OBJECT_TYPE) {
        return false;
    }

    const metadata = Array.isArray(node._appliedFeatherDiagnostics)
        ? node._appliedFeatherDiagnostics
        : [];

    if (metadata.length === 0) {
        return false;
    }

    for (const entry of metadata) {
        if (entry && entry.id === id) {
            return true;
        }
    }

    return false;
}

function callPathMethod(
    path: any,
    methodName: any,
    { args, defaultValue }: { args?: any[]; defaultValue?: any } = {}
) {
    if (!path) {
        return defaultValue;
    }

    const method = path[methodName];
    if (typeof method !== "function") {
        return defaultValue;
    }

    const normalizedArgs =
        args === undefined ? [] : Array.isArray(args) ? args : [args];

    return method.apply(path, normalizedArgs);
}

function isBlockWithinConstructor(path) {
    if (!path || typeof path.getParentNode !== "function") {
        return false;
    }

    // Hoist the `getParentNode` lookup so the tight loop can call it directly
    // without paying for the generic helper's array normalization overhead on
    // every iteration.
    const getParentNode = path.getParentNode;
    for (let depth = 0; depth < 100; depth += 1) {
        const ancestor = getParentNode.call(path, depth);

        if (!ancestor) {
            break;
        }

        if (ancestor.type === CONSTRUCTOR_DECLARATION) {
            return true;
        }

        // Stop traversing if we hit a function boundary that isn't a constructor
        if (
            ancestor.type === FUNCTION_DECLARATION ||
            ancestor.type === FUNCTION_EXPRESSION
        ) {
            return false;
        }
    }

    return false;
}

const BINARY_OPERATOR_INFO = new Map([
    // Binary operator precedence and associativity table used for determining
    // when parentheses are required in nested expressions. This table mirrors
    // the precedence levels defined in the GML parser grammar, ensuring that
    // printed code maintains the same evaluation order as the parsed AST.
    //
    // MAINTENANCE: This table is duplicated from the parser. Consider extracting
    // it to a shared constant in Core or importing it directly from the Parser
    // module to eliminate the duplication and ensure consistency when the grammar
    // is updated.
    ["*", { precedence: 13, associativity: "left" }],
    ["/", { precedence: 13, associativity: "left" }],
    ["div", { precedence: 13, associativity: "left" }],
    ["%", { precedence: 13, associativity: "left" }],
    ["mod", { precedence: 13, associativity: "left" }],
    ["+", { precedence: 12, associativity: "left" }],
    ["-", { precedence: 12, associativity: "left" }],
    ["<<", { precedence: 12, associativity: "left" }],
    [">>", { precedence: 12, associativity: "left" }],
    ["&", { precedence: 11, associativity: "left" }],
    ["^", { precedence: 10, associativity: "left" }],
    ["|", { precedence: 9, associativity: "left" }],
    ["<", { precedence: 8, associativity: "left" }],
    ["<=", { precedence: 8, associativity: "left" }],
    [">", { precedence: 8, associativity: "left" }],
    [">=", { precedence: 8, associativity: "left" }],
    ["==", { precedence: 7, associativity: "left" }],
    ["!=", { precedence: 7, associativity: "left" }],
    ["<>", { precedence: 7, associativity: "left" }],
    ["&&", { precedence: 6, associativity: "left" }],
    ["and", { precedence: 6, associativity: "left" }],
    ["||", { precedence: 5, associativity: "left" }],
    ["or", { precedence: 5, associativity: "left" }],
    ["??", { precedence: 4, associativity: "right" }]
]);

const DOC_COMMENT_OUTPUT_FLAG = "_gmlHasDocCommentOutput";

function resolveLogicalOperatorsStyle(options) {
    return normalizeLogicalOperatorsStyle(options?.logicalOperatorsStyle);
}

function applyLogicalOperatorsStyle(operator, style) {
    if (operator === "&&") {
        return style === LogicalOperatorsStyle.KEYWORDS ? "and" : "&&";
    }

    if (operator === "||") {
        return style === LogicalOperatorsStyle.KEYWORDS ? "or" : "||";
    }

    return operator;
}

function _printImpl(path, options, print) {
    const node = path.getValue();

    if (!node) {
        return concat("");
    }

    if (typeof node === STRING_TYPE) {
        return concat(node);
    }

    return _printImplCore(node, path, options, print);
}

function _printImplCore(node, path, options, print) {
    const doc =
        tryPrintControlStructureNode(node, path, options, print) ??
        tryPrintFunctionNode(node, path, options, print) ??
        tryPrintFunctionSupportNode(node, path, options, print) ??
        tryPrintVariableNode(node, path, options, print) ??
        tryPrintExpressionNode(node, path, options, print) ??
        tryPrintDeclarationNode(node, path, options, print) ??
        tryPrintLiteralNode(node, path, options, print);

    if (doc !== undefined) {
        return doc;
    }

    console.warn(
        `Print.js:print encountered unhandled node type: ${node.type}`,
        node
    );
}

function tryPrintControlStructureNode(node, path, options, print) {
    switch (node.type) {
        case "Program": {
            return printProgramNode(node, path, options, print);
        }
        case "BlockStatement": {
            return printBlockStatementNode(node, path, options, print);
        }
        case "IfStatement": {
            const simplifiedReturn = printBooleanReturnIf(path, print);
            if (simplifiedReturn) {
                return simplifiedReturn;
            }
            return buildIfStatementDoc(path, options, print, node);
        }
        case "SwitchStatement": {
            return printSwitchStatementNode(node, path, options, print);
        }
        case "SwitchCase": {
            return printSwitchCaseNode(node, path, options, print);
        }
        case "TernaryExpression": {
            return printTernaryExpressionNode(node, path, options, print);
        }
        case "ForStatement": {
            return concat([
                "for (",
                group([
                    indent([
                        ifBreak(line),
                        concat([
                            print("init"),
                            ";",
                            line,
                            print("test"),
                            ";",
                            line,
                            print("update")
                        ])
                    ])
                ]),
                ") ",
                printInBlock(path, options, print, "body")
            ]);
        }
        case "DoUntilStatement": {
            return concat([
                "do ",
                printInBlock(path, options, print, "body"),
                " until (",
                buildClauseGroup(printWithoutExtraParens(path, print, "test")),
                ")",
                ";"
            ]);
        }
        case "WhileStatement": {
            return concat(
                printSingleClauseStatement(
                    path,
                    options,
                    print,
                    "while",
                    "test",
                    "body"
                )
            );
        }
        case "RepeatStatement": {
            return concat(
                printSingleClauseStatement(
                    path,
                    options,
                    print,
                    "repeat",
                    "test",
                    "body"
                )
            );
        }
        case "WithStatement": {
            return concat(
                printSingleClauseStatement(
                    path,
                    options,
                    print,
                    "with",
                    "test",
                    "body"
                )
            );
        }
    }
}

function tryPrintFunctionNode(node, path, options, print) {
    switch (node.type) {
        case "FunctionDeclaration":
        case "ConstructorDeclaration": {
            const parts: any[] = [];

            const sourceMetadata = resolvePrinterSourceMetadata(options);
            const { originalText } = sourceMetadata;
            const { startIndex: nodeStartIndex } =
                resolveNodeIndexRangeWithSource(node, sourceMetadata);

            const {
                docCommentDocs: collectedDocCommentDocs,
                existingDocLines,
                needsLeadingBlankLine: collectedNeedsLeadingBlankLine,
                plainLeadingLines
            } = collectFunctionDocCommentDocs({
                node,
                options,
                path,
                nodeStartIndex,
                originalText
            });

            let docCommentDocs: MutableDocCommentLines =
                collectedDocCommentDocs;
            let needsLeadingBlankLine = collectedNeedsLeadingBlankLine;

            try {
                materializeParamDefaultsFromParamDefault(node);
            } catch {
                // Non-fatal heuristic failures should not abort printing.
            }

            let includeOverrideTag = false;
            const parentNode = path.getParentNode();
            if (parentNode && parentNode.type === VARIABLE_DECLARATOR) {
                const grandParentNode = path.getParentNode(1);
                if (
                    grandParentNode &&
                    grandParentNode.type === VARIABLE_DECLARATION &&
                    grandParentNode._overridesStaticFunction
                ) {
                    includeOverrideTag = true;
                }
            }

            ({ docCommentDocs, needsLeadingBlankLine } =
                normalizeFunctionDocCommentDocs({
                    docCommentDocs,
                    needsLeadingBlankLine,
                    node,
                    options,
                    path,
                    overrides: { includeOverrideTag }
                }));

            const shouldEmitPlainLeadingBeforeDoc =
                plainLeadingLines.length > 0 &&
                docCommentDocs.length > 0 &&
                existingDocLines.length === 0;

            if (shouldEmitPlainLeadingBeforeDoc) {
                parts.push(
                    join(hardline, plainLeadingLines),
                    hardline,
                    hardline
                );
            }

            if (docCommentDocs.length > 0) {
                node[DOC_COMMENT_OUTPUT_FLAG] = true;
                const suppressLeadingBlank =
                    docCommentDocs &&
                    docCommentDocs._suppressLeadingBlank === true;

                const hasLeadingNonDocComment =
                    !Core.isNonEmptyArray(node.docComments) &&
                    originalText !== null &&
                    typeof nodeStartIndex === NUMBER_TYPE &&
                    Core.hasCommentImmediatelyBefore(
                        originalText,
                        nodeStartIndex
                    );

                const hasExistingBlankLine =
                    originalText !== null &&
                    typeof nodeStartIndex === NUMBER_TYPE &&
                    isPreviousLineEmpty(originalText, nodeStartIndex);

                if (
                    !suppressLeadingBlank &&
                    (needsLeadingBlankLine ||
                        (hasLeadingNonDocComment && !hasExistingBlankLine))
                ) {
                    parts.push(hardline);
                }

                // Push doc comments individually with hardline to ensure they appear on separate lines
                parts.push(join(hardline, docCommentDocs), hardline);
            } else if (Object.hasOwn(node, DOC_COMMENT_OUTPUT_FLAG)) {
                delete node[DOC_COMMENT_OUTPUT_FLAG];
            }

            // Mark doc comments as printed since we handled them manually.
            // We do NOT mark all comments as printed, because we want Prettier to handle
            // regular comments (non-doc comments) that we didn't consume.
            if (node.docComments) {
                node.docComments.forEach((comment: any) => {
                    comment.printed = true;
                });
            } else {
                // If the function didn't have comments, we might have consumed them from the parent VariableDeclaration
                const parentNode = path.getParentNode();
                if (parentNode && parentNode.type === VARIABLE_DECLARATOR) {
                    const grandParentNode = path.getParentNode(1);
                    if (
                        grandParentNode &&
                        grandParentNode.type === VARIABLE_DECLARATION &&
                        grandParentNode.docComments
                    ) {
                        grandParentNode.docComments.forEach((comment: any) => {
                            comment.printed = true;
                        });
                    }
                }
            }

            let functionNameDoc = "";
            if (Core.isNonEmptyString(node.id)) {
                let renamed = null;
                if (node.idLocation && node.idLocation.start) {
                    renamed = getSemanticIdentifierCaseRenameForNode(
                        {
                            start: node.idLocation.start,
                            scopeId: node.scopeId ?? null
                        },
                        options
                    );
                }
                functionNameDoc = Core.getNonEmptyString(renamed) ?? node.id;
            } else if (node.id) {
                functionNameDoc = print("id");
            }

            const hasFunctionName =
                typeof functionNameDoc === STRING_TYPE
                    ? Core.isNonEmptyString(functionNameDoc)
                    : Boolean(functionNameDoc);

            parts.push([
                "function",
                hasFunctionName ? " " : "",
                functionNameDoc
            ]);

            const hasParameters = Core.isNonEmptyArray(node.params);

            if (hasParameters) {
                const {
                    inlineDoc: inlineParamDoc,
                    multilineDoc: multilineParamDoc
                } = buildFunctionParameterDocs(path, print, options, {
                    forceInline: shouldForceInlineFunctionParameters(
                        path,
                        options
                    )
                });

                parts.push(
                    conditionalGroup([inlineParamDoc, multilineParamDoc])
                );
            } else {
                parts.push(printEmptyParens(path, options));
            }

            if (node.type === CONSTRUCTOR_DECLARATION) {
                if (node.parent) {
                    parts.push(print("parent"));
                } else {
                    parts.push(" constructor");
                }
            }

            const inlineDefaultParameterDoc =
                maybePrintInlineDefaultParameterFunctionBody(path, print);

            if (inlineDefaultParameterDoc) {
                parts.push(" ", inlineDefaultParameterDoc);
                return concat(parts);
            }

            parts.push(" ");
            parts.push(printInBlock(path, options, print, "body"));
            return concat(parts);
        }
    }
}

function tryPrintFunctionSupportNode(node, path, options, print) {
    switch (node.type) {
        case "ConstructorParentClause": {
            const hasParameters = Core.isNonEmptyArray(node.params);
            const params = hasParameters
                ? printCommaSeparatedList(
                      path,
                      print,
                      "params",
                      "(",
                      ")",
                      options,
                      {
                          // Constructor parent clauses participate in the
                          // surrounding function signature. Breaking the
                          // argument list across multiple lines changes
                          // the shape of the signature and regresses
                          // existing fixtures that rely on the entire
                          // clause remaining inline.
                          leadingNewline: false,
                          trailingNewline: false,
                          forceInline: true
                      }
                  )
                : printEmptyParens(path, options);
            return concat([" : ", print("id"), params, " constructor"]);
        }
        case "DefaultParameter": {
            if (shouldOmitDefaultValueForParameter(path, options)) {
                return concat(print("left"));
            }
            return concat(
                printSimpleDeclaration(print("left"), print("right"))
            );
        }
    }
}

function tryPrintVariableNode(node, path, options, print) {
    switch (node.type) {
        case EXPRESSION_STATEMENT: {
            const expression = node.expression;
            if (
                expression?.type === ASSIGNMENT_EXPRESSION &&
                expression.operator === "/=" &&
                hasFeatherFix(expression, GM1015_DIAGNOSTIC_ID)
            ) {
                return "";
            }
            return print("expression");
        }
        case "AssignmentExpression": {
            const parentNode =
                typeof path.getParentNode === "function"
                    ? path.getParentNode()
                    : (path.parent ?? null);
            const parentType = parentNode?.type;
            const isStandaloneAssignment =
                parentType === "Program" ||
                parentType === "BlockStatement" ||
                parentType === "SwitchCase" ||
                parentType === "ExpressionStatement";

            if (
                node.operator === "/=" &&
                isStandaloneAssignment &&
                hasFeatherFix(node, GM1015_DIAGNOSTIC_ID)
            ) {
                return "";
            }
            const padding =
                node.operator === "=" &&
                typeof node._alignAssignmentPadding === NUMBER_TYPE
                    ? Math.max(0, node._alignAssignmentPadding)
                    : 0;
            const spacing = " ".repeat(padding + 1);

            return group(
                concat([
                    group(print("left")),
                    spacing,
                    node.operator,
                    " ",
                    group(print("right"))
                ])
            );
        }
        case "GlobalVarStatement": {
            if (options.preserveGlobalVarStatements === false) {
                // console.log("[DEBUG] GlobalVarStatement preserve=false", node);
                const parts = [];
                node.declarations.forEach((decl, index) => {
                    if (decl.init) {
                        const idDoc = path.call(
                            print,
                            "declarations",
                            index,
                            "id"
                        );
                        const initDoc = path.call(
                            print,
                            "declarations",
                            index,
                            "init"
                        );
                        parts.push(
                            group(
                                concat(["global.", idDoc, " = ", initDoc, ";"])
                            )
                        );
                    }
                });

                if (parts.length === 0) {
                    return null;
                }

                return join(hardline, parts);
            }

            const decls =
                node.declarations.length > 1
                    ? printCommaSeparatedList(
                          path,
                          print,
                          "declarations",
                          "",
                          "",
                          options,
                          {
                              leadingNewline: false,
                              trailingNewline: false
                          }
                      )
                    : path.map(print, "declarations");

            const keyword =
                typeof node.kind === STRING_TYPE ? node.kind : "globalvar";

            return concat([keyword, " ", decls]);
        }
        case "VariableDeclaration": {
            const functionNode = findEnclosingFunctionNode(path);
            const declarators = Core.asArray(node.declarations);

            const keptDeclarators = declarators.filter((declarator: any) => {
                const omit = shouldOmitParameterAlias(
                    declarator,
                    functionNode,
                    options
                );
                return !omit;
            });

            if (keptDeclarators.length === 0) {
                return;
            }

            if (keptDeclarators.length !== declarators.length) {
                const original = node.declarations;
                node.declarations = keptDeclarators;
                try {
                    const decls =
                        keptDeclarators.length > 1
                            ? printCommaSeparatedList(
                                  path,
                                  print,
                                  "declarations",
                                  "",
                                  "",
                                  options,
                                  {
                                      leadingNewline: false,
                                      trailingNewline: false,
                                      addIndent: keptDeclarators.length > 1
                                  }
                              )
                            : path.map(print, "declarations");
                    return concat([node.kind, " ", decls]);
                } finally {
                    node.declarations = original;
                }
            }

            // WORKAROUND: Filter out misattached function doc-comments from non-function variables.
            //
            // PROBLEM: The parser occasionally attaches JSDoc function comments (@function, @func)
            // to the wrong variable declarator—typically the first variable in the file—when the
            // actual function declaration appears later in the source. This causes incorrect
            // comment placement during formatting.
            //
            // SOLUTION: When a single-declarator VariableDeclaration has a function doc-comment
            // but the initializer is not a function, we mark the comment as printed and filter
            // it out. This prevents the bogus comment from appearing in the formatted output.
            //
            // WHAT WOULD BREAK: Removing this filter would cause function documentation to appear
            // on unrelated variable declarations, confusing readers and breaking doc-generation tools.
            //
            // LONG-TERM FIX: This is a parser-level issue. The comment attachment logic in the
            // parser needs to be improved to correctly associate comments with their intended targets
            // based on line proximity and syntactic context. See: <link to parser issue if available>
            if (node.declarations.length === 1) {
                const decl = node.declarations[0];
                if (decl.comments) {
                    decl.comments = decl.comments.filter((comment) => {
                        const isFunctionComment =
                            comment.value.includes("@function") ||
                            comment.value.includes("@func");

                        // NOTE: The isFunctionInit check below was originally intended to verify
                        // whether the declarator's initializer is actually a function before
                        // filtering the comment. However, the current filtering logic is sufficient
                        // because we only enter this branch when there's a single declarator, and
                        // the misattachment issue occurs specifically when the comment belongs to
                        // a function defined elsewhere in the file, not to this variable.
                        //
                        // Keeping this check would be redundant: if the init is a function, the
                        // comment is likely correct and should NOT be filtered. The current code
                        // filters unconditionally when isFunctionComment is true, which may be
                        // overly aggressive but works as a stopgap until the parser is fixed.
                        //
                        // const isFunctionInit =
                        //     decl.init &&
                        //     (decl.init.type === "FunctionDeclaration" ||
                        //         decl.init.type === "ArrowFunctionExpression");

                        if (isFunctionComment) {
                            comment.printed = true;
                            return false;
                        }
                        return true;
                    });

                    if (decl.comments.length === 0) {
                        delete decl.comments;
                    }
                }
            }

            const decls = printCommaSeparatedList(
                path,
                print,
                "declarations",
                "",
                "",
                options,
                {
                    leadingNewline: false,
                    trailingNewline: false,
                    addIndent: keptDeclarators.length > 1
                }
            );

            if (node.kind === "static") {
                // WORKAROUND: Bypass printCommaSeparatedList for static declarations.
                //
                // PROBLEM: printCommaSeparatedList introduces unwanted blank lines or produces
                // empty output when formatting static variable declarations with multiple declarators.
                // The exact root cause is unclear (likely a state-tracking issue in the helper),
                // but static declarations are nearly always single-line or short lists in GML.
                //
                // SOLUTION: Manually map each declarator and join them with ", " to avoid the
                // broken helper entirely. This ensures static declarations format correctly.
                //
                // WHAT WOULD BREAK: Removing this workaround would cause static declarations
                // to either disappear from the output or gain spurious blank lines, breaking
                // both correctness and readability.
                //
                // LONG-TERM FIX: Investigate and fix the underlying issue in printCommaSeparatedList
                // so it correctly handles static declarations, then remove this manual join logic.
                const parts = path.map(print, "declarations");
                const joined = [];
                for (let i = 0; i < parts.length; i++) {
                    joined.push(parts[i]);
                    if (i < parts.length - 1) {
                        joined.push(", ");
                    }
                }
                return group(concat([node.kind, " ", ...joined]));
            }

            return group(concat([node.kind, " ", decls]));
        }
        case "VariableDeclarator": {
            const initializerOverride =
                resolveArgumentAliasInitializerDoc(path);
            if (initializerOverride) {
                return concat(
                    printSimpleDeclaration(print("id"), initializerOverride)
                );
            }
            const simpleDecl = printSimpleDeclaration(
                print("id"),
                print("init")
            );
            return concat(simpleDecl);
        }
    }
}

function tryPrintExpressionNode(node, path, options, print) {
    switch (node.type) {
        case "ParenthesizedExpression": {
            return printParenthesizedExpressionNode(node, path, options, print);
        }
        case "BinaryExpression": {
            return printBinaryExpressionNode(node, path, options, print);
        }
        case "UnaryExpression":
        case "IncDecStatement":
        case "IncDecExpression": {
            return printUnaryLikeExpressionNode(node, path, options, print);
        }
        case "CallExpression": {
            return printCallExpressionNode(node, path, options, print);
        }
        case "MemberDotExpression": {
            return printMemberDotExpressionNode(node, path, options, print);
        }
        case "MemberIndexExpression": {
            return printMemberIndexExpressionNode(node, path, options, print);
        }
        case "StructExpression": {
            return printStructExpressionNode(node, path, options, print);
        }
        case "Property": {
            return printPropertyNode(node, path, options, print);
        }
        case "ArrayExpression": {
            return printArrayExpressionNode(node, path, options, print);
        }
        case "NewExpression": {
            return printNewExpressionNode(node, path, options, print);
        }
    }
}

function printParenthesizedExpressionNode(node, path, _options, print) {
    if (shouldOmitSyntheticParens(path)) {
        return printWithoutExtraParens(path, print, "expression");
    }

    return concat([
        "(",
        printWithoutExtraParens(path, print, "expression"),
        ")"
    ]);
}

function printBinaryExpressionNode(node, path, options, print) {
    if (node.operator === "/" && hasFeatherFix(node, GM1015_DIAGNOSTIC_ID)) {
        return print("left");
    }
    const left = print("left");
    let operator = node.operator;
    let right;
    const logicalOperatorsStyle = resolveLogicalOperatorsStyle(options);
    const optimizeMathExpressions = Boolean(options?.optimizeMathExpressions);

    const leftIsUndefined = Core.isUndefinedSentinel(node.left);
    const rightIsUndefined = Core.isUndefinedSentinel(node.right);

    if (
        (operator === "==" || operator === "!=") &&
        (leftIsUndefined || rightIsUndefined)
    ) {
        const expressionDoc = leftIsUndefined
            ? printWithoutExtraParens(path, print, "right")
            : printWithoutExtraParens(path, print, "left");
        const prefix = operator === "!=" ? "!is_undefined(" : "is_undefined(";
        return group([prefix, expressionDoc, ")"]);
    }

    const booleanSimplification = simplifyBooleanBinaryExpression(
        path,
        print,
        node
    );
    if (booleanSimplification) {
        return booleanSimplification;
    }

    const canConvertDivisionToHalf =
        optimizeMathExpressions &&
        operator === "/" &&
        node?.right?.type === LITERAL &&
        node.right.value === "2" &&
        !Core.hasComment(node) &&
        !Core.hasComment(node.left);

    if (canConvertDivisionToHalf) {
        operator = "*";

        const literal = node.right;
        const originalValue = literal.value;

        literal.value = "0.5";
        try {
            right = print("right");
        } finally {
            literal.value = originalValue;
        }
    } else {
        right = print("right");
        const styledOperator = applyLogicalOperatorsStyle(
            operator,
            logicalOperatorsStyle
        );

        if (styledOperator === operator) {
            switch (operator) {
                case "%": {
                    operator = "mod";

                    break;
                }
                case "^^": {
                    operator = "xor";

                    break;
                }
                case "<>": {
                    operator = "!=";

                    break;
                }
            }
        } else {
            operator = styledOperator;
        }
    }

    return group([left, " ", group([operator, line, right])]);
}

function printUnaryLikeExpressionNode(node, path, _options, print) {
    if (node.prefix) {
        if (node.operator === "+" && shouldOmitUnaryPlus(node.argument)) {
            return print("argument");
        }

        return concat([node.operator, print("argument")]);
    }

    return concat([print("argument"), node.operator]);
}

function printCallExpressionNode(node, path, options, print) {
    if (node?.[FEATHER_COMMENT_OUT_SYMBOL]) {
        const commentText = getFeatherCommentCallText(node);
        const renderedText =
            typeof node[FEATHER_COMMENT_TEXT_SYMBOL] === STRING_TYPE &&
            node[FEATHER_COMMENT_TEXT_SYMBOL].length > 0
                ? node[FEATHER_COMMENT_TEXT_SYMBOL]
                : commentText;
        const prefixTextValue = node[FEATHER_COMMENT_PREFIX_TEXT_SYMBOL];
        const prefixText =
            typeof prefixTextValue === STRING_TYPE && prefixTextValue.length > 0
                ? prefixTextValue
                : null;
        const docs = [];

        if (prefixText) {
            docs.push(concat(["// ", prefixText]));
        }

        if (renderedText) {
            if (docs.length > 0) {
                docs.push(hardline);
            }
            docs.push(concat(["// ", renderedText]));
        }

        if (docs.length === 0) {
            return "//";
        }

        return concat(docs);
    }

    if (options && typeof options.originalText === STRING_TYPE) {
        const hasNestedPreservedArguments = Array.isArray(node.arguments)
            ? node.arguments.some(
                  (argument) => argument?.preserveOriginalCallText === true
              )
            : false;
        const startIndex = Core.getNodeStartIndex(node);
        const endIndex = Core.getNodeEndIndex(node);

        if (
            typeof startIndex === NUMBER_TYPE &&
            typeof endIndex === NUMBER_TYPE &&
            endIndex > startIndex
        ) {
            const synthesizedText = synthesizeMissingCallArgumentSeparators(
                node,
                options.originalText,
                startIndex,
                endIndex
            );

            if (typeof synthesizedText === STRING_TYPE) {
                return normalizeCallTextNewlines(
                    synthesizedText,
                    options.endOfLine
                );
            }

            if (node.preserveOriginalCallText && !hasNestedPreservedArguments) {
                return normalizeCallTextNewlines(
                    options.originalText.slice(startIndex, endIndex),
                    options.endOfLine
                );
            }
        }
    }

    applyTrigonometricFunctionSimplification(path);
    let printedArgs;

    if (node.arguments.length === 0) {
        printedArgs = [printEmptyParens(path, options)];
    } else {
        const maxParamsPerLine = Number.isFinite(options?.maxParamsPerLine)
            ? options.maxParamsPerLine
            : 0;
        const elementsPerLineLimit =
            maxParamsPerLine > 0 ? maxParamsPerLine : Infinity;

        const callbackArguments = node.arguments.filter(
            (argument) =>
                argument?.type === FUNCTION_DECLARATION ||
                argument?.type === CONSTRUCTOR_DECLARATION
        );
        const structArguments = node.arguments.filter(
            (argument) => argument?.type === STRUCT_EXPRESSION
        );
        const structArgumentsToBreak = structArguments.filter((argument) =>
            shouldForceBreakStructArgument(argument)
        );

        structArgumentsToBreak.forEach((argument) => {
            forcedStructArgumentBreaks.set(
                argument,
                getStructAlignmentInfo(argument, options)
            );
        });

        const shouldFavorInlineArguments =
            maxParamsPerLine <= 0 &&
            callbackArguments.length === 0 &&
            structArguments.length === 0 &&
            node.arguments.every(
                (argument) => !isComplexArgumentNode(argument)
            );

        const effectiveElementsPerLineLimit = shouldFavorInlineArguments
            ? node.arguments.length
            : elementsPerLineLimit;

        const hasSingleCallExpressionArgument =
            maxParamsPerLine > 0 &&
            node.arguments.length === 1 &&
            node.arguments[0]?.type === CALL_EXPRESSION;

        const simplePrefixLength = countLeadingSimpleCallArguments(node);
        const shouldForceCallbackBreaks =
            callbackArguments.length > 0 && simplePrefixLength <= 1;

        const shouldForceBreakArguments =
            hasSingleCallExpressionArgument ||
            (maxParamsPerLine > 0 &&
                node.arguments.length > maxParamsPerLine) ||
            callbackArguments.length > 1 ||
            structArgumentsToBreak.length > 0 ||
            shouldForceCallbackBreaks;

        const shouldUseCallbackLayout = [
            node.arguments[0],
            node.arguments.at(-1)
        ].some(
            (argumentNode) =>
                argumentNode?.type === FUNCTION_DECLARATION ||
                argumentNode?.type === CONSTRUCTOR_DECLARATION ||
                argumentNode?.type === STRUCT_EXPRESSION
        );

        const shouldIncludeInlineVariant =
            shouldUseCallbackLayout &&
            !shouldForceBreakArguments &&
            simplePrefixLength > 1;

        const hasCallbackArguments = callbackArguments.length > 0;

        const { inlineDoc, multilineDoc } = buildCallArgumentsDocs(
            path,
            print,
            options,
            {
                forceBreak: shouldForceBreakArguments,
                maxElementsPerLine: effectiveElementsPerLineLimit,
                includeInlineVariant: shouldIncludeInlineVariant,
                hasCallbackArguments
            }
        );

        if (shouldUseCallbackLayout) {
            if (shouldForceBreakArguments) {
                printedArgs = [concat([breakParent, multilineDoc])];
            } else if (inlineDoc) {
                printedArgs = [conditionalGroup([inlineDoc, multilineDoc])];
            } else {
                printedArgs = [multilineDoc];
            }
        } else {
            printedArgs = shouldForceBreakArguments
                ? [concat([breakParent, multilineDoc])]
                : [multilineDoc];
        }
    }

    const calleeDoc = print(OBJECT_TYPE);

    return isInLValueChain(path)
        ? concat([calleeDoc, ...printedArgs])
        : group([calleeDoc, ...printedArgs]);
}

function printMemberDotExpressionNode(node, path, options, print) {
    if (isInLValueChain(path) && path.parent?.type === CALL_EXPRESSION) {
        const objectNode = path.getValue()?.object;
        const shouldAllowBreakBeforeDot =
            objectNode &&
            (objectNode.type === CALL_EXPRESSION ||
                objectNode.type === MEMBER_DOT_EXPRESSION ||
                objectNode.type === MEMBER_INDEX_EXPRESSION);

        if (shouldAllowBreakBeforeDot) {
            return concat([
                print(OBJECT_TYPE),
                softline,
                ".",
                print("property")
            ]);
        }

        return concat([print(OBJECT_TYPE), ".", print("property")]);
    } else {
        const objectDoc = print(OBJECT_TYPE);
        let propertyDoc = print("property");

        if (propertyDoc === undefined) {
            propertyDoc = printCommaSeparatedList(
                path,
                print,
                "property",
                "",
                "",
                options
            );
        }

        return concat([objectDoc, ".", propertyDoc]);
    }
}

function printMemberIndexExpressionNode(node, path, options, print) {
    const memberNode = path.getValue();
    let accessor = print("accessor");
    if (memberNode && typeof memberNode.accessor === "string") {
        accessor = memberNode.accessor;
    }

    if (Core.isNonEmptyString(accessor) && accessor.length > 1) {
        accessor = `${accessor} `;
    }
    const property = printCommaSeparatedList(
        path,
        print,
        "property",
        "",
        "",
        options
    );
    return concat([print(OBJECT_TYPE), accessor, group(indent(property)), "]"]);
}

function printStructExpressionNode(node, path, options, print) {
    if (node.properties.length === 0) {
        return concat(printEmptyBlock(path, options));
    }

    const shouldForceBreakStruct = forcedStructArgumentBreaks.has(node);
    const objectWrapOption = resolveObjectWrapOption(options);
    const shouldPreserveStructWrap =
        objectWrapOption === ObjectWrapOption.PRESERVE &&
        structLiteralHasLeadingLineBreak(node, options);

    return concat(
        printCommaSeparatedList(path, print, "properties", "{", "}", options, {
            forceBreak:
                node.hasTrailingComma ||
                shouldForceBreakStruct ||
                shouldPreserveStructWrap,
            // Keep struct literals flush with their braces for now; GameMaker's
            // runtime formatter and the official documentation render `{foo: 1}`
            // without extra internal padding, and our fixtures rely on that output.
            padding: ""
        })
    );
}

function printPropertyNode(node, path, options, print) {
    const parentNode =
        typeof path.getParentNode === "function" ? path.getParentNode() : null;
    const alignmentInfo = forcedStructArgumentBreaks.get(parentNode);
    const nameDoc = print("name");
    const valueDoc = print("value");
    const trailingCommentSuffix = buildStructPropertyCommentSuffix(
        path,
        options
    );

    if (alignmentInfo?.maxNameLength > 0) {
        const nameLength = getStructPropertyNameLength(node, options);
        const paddingWidth = Math.max(
            alignmentInfo.maxNameLength - nameLength + 1,
            1
        );
        const padding = " ".repeat(paddingWidth);

        return concat([
            nameDoc,
            padding,
            ": ",
            valueDoc,
            trailingCommentSuffix
        ]);
    }

    const originalPrefix = getStructPropertyPrefix(node, options);
    if (originalPrefix) {
        return concat([originalPrefix, valueDoc, trailingCommentSuffix]);
    }

    return concat([nameDoc, ": ", valueDoc, trailingCommentSuffix]);
}

function printArrayExpressionNode(node, path, options, print) {
    const allowTrailingComma = shouldAllowTrailingComma(options);
    return concat(
        printCommaSeparatedList(path, print, "elements", "[", "]", options, {
            allowTrailingDelimiter: allowTrailingComma,
            forceBreak: allowTrailingComma && node.hasTrailingComma
        })
    );
}

function printNewExpressionNode(node, path, options, print) {
    const argsPrinted =
        node.arguments.length === 0
            ? [printEmptyParens(path, options)]
            : [
                  printCommaSeparatedList(
                      path,
                      print,
                      "arguments",
                      "(",
                      ")",
                      options
                  )
              ];
    return concat(["new ", print("expression"), ...argsPrinted]);
}

function tryPrintDeclarationNode(node, path, options, print) {
    switch (node.type) {
        case "EnumDeclaration": {
            prepareEnumMembersForPrinting(node, Core.getNodeName);
            return concat([
                "enum ",
                print("name"),
                " ",
                printCommaSeparatedList(
                    path,
                    print,
                    "members",
                    "{",
                    "}",
                    options,
                    {
                        forceBreak: node.hasTrailingComma
                    }
                )
            ]);
        }
        case "ReturnStatement": {
            return node.argument
                ? concat(["return ", print("argument")])
                : concat("return");
        }
        case "ThrowStatement": {
            return node.argument
                ? concat(["throw ", print("argument")])
                : "throw";
        }
        case "IdentifierStatement": {
            return print("name");
        }
        case "MacroDeclaration": {
            const macroText =
                typeof node._featherMacroText === STRING_TYPE
                    ? node._featherMacroText
                    : (() => {
                          const { start: startIndex, end: endIndex } =
                              Core.getNodeRangeIndices(node);
                          if (
                              typeof startIndex === NUMBER_TYPE &&
                              typeof endIndex === NUMBER_TYPE
                          ) {
                              return options.originalText.slice(
                                  startIndex,
                                  endIndex
                              );
                          }
                          return "";
                      })();

            if (typeof node._featherMacroText === STRING_TYPE) {
                return concat(stripTrailingLineTerminators(macroText));
            }

            let textToPrint = macroText;

            const macroStartIndex = Core.getNodeStartIndex(node);
            const { start: nameStartIndex, end: nameEndIndex } =
                Core.getNodeRangeIndices(node.name);
            if (
                typeof macroStartIndex === NUMBER_TYPE &&
                typeof nameStartIndex === NUMBER_TYPE &&
                typeof nameEndIndex === NUMBER_TYPE &&
                nameStartIndex >= macroStartIndex &&
                nameEndIndex >= nameStartIndex
            ) {
                const renamed = getSemanticIdentifierCaseRenameForNode(
                    node.name,
                    options
                );
                if (Core.isNonEmptyString(renamed)) {
                    const relativeStart = nameStartIndex - macroStartIndex;
                    const relativeEnd = nameEndIndex - macroStartIndex;
                    const before = textToPrint.slice(0, relativeStart);
                    const after = textToPrint.slice(relativeEnd);
                    textToPrint = `${before}${renamed}${after}`;
                }
            }

            return concat(stripTrailingLineTerminators(textToPrint));
        }
        case "RegionStatement": {
            return concat(["#region", print("name")]);
        }
        case "EndRegionStatement": {
            return concat(["#endregion", print("name")]);
        }
        case "DefineStatement": {
            const directive =
                Core.getNormalizedDefineReplacementDirective(node) ??
                Core.DefineReplacementDirective.MACRO;
            const suffixDoc =
                typeof node.replacementSuffix === STRING_TYPE
                    ? node.replacementSuffix
                    : print("name");

            if (typeof suffixDoc === STRING_TYPE) {
                const needsSeparator =
                    suffixDoc.length > 0 && !/^\s/.test(suffixDoc);

                return needsSeparator
                    ? concat([directive, " ", suffixDoc])
                    : concat([directive, suffixDoc]);
            }

            return concat([directive, suffixDoc]);
        }
        case "DeleteStatement": {
            return concat(["delete ", print("argument")]);
        }
        case "BreakStatement": {
            return concat("break");
        }
        case "ExitStatement": {
            return concat("exit");
        }
        case "ContinueStatement": {
            return concat("continue");
        }
        case "EmptyStatement": {
            return concat("");
        }
    }
}

function tryPrintLiteralNode(node, path, options, print) {
    switch (node.type) {
        case "Literal": {
            let value = node.value;

            if (!value.startsWith('"')) {
                if (value.startsWith(".")) {
                    // Normalize shorthand decimals like `.5` to `0.5` so the printer
                    // mirrors GameMaker's own serialization rules
                    // (https://manual.gamemaker.io/monthly/en/#t=GameMaker_Language%2FGML_Overview%2FNumbers.htm).
                    // Without the guard the formatter would emit the bare `.5`, but the
                    // next save inside GameMaker (or any tooling that round-trips through
                    // its compiler) reintroduces the leading zero. That churn breaks the
                    // idempotence guarantees exercised by
                    // `src/plugin/test/fix-missing-decimal-zeroes-option.test.js` and
                    // causes needless diffs in format-on-save flows.
                    value = `0${value}`;
                }

                const decimalMatch = value.match(/^([-+]?\d+)\.(\d*)$/);
                if (decimalMatch) {
                    const [, integerPart, fractionalPart] = decimalMatch;
                    if (
                        fractionalPart.length === 0 ||
                        /^0+$/.test(fractionalPart)
                    ) {
                        // Collapse literals such as `1.` and `1.000` to `1` to keep the
                        // formatter stable with GameMaker's canonical output (see the
                        // numbers reference linked above). Leaving the dangling decimal
                        // segment would come back as a pure integer the moment the project
                        // is re-saved in the IDE, invalidating the doc snapshots and
                        // numeric literal regression tests that assert we emit the same
                        // text on every pass.
                        value = integerPart;
                    }
                }
            }
            return concat(value);
        }
        case "Identifier": {
            const prefix = shouldPrefixGlobalIdentifier(path) ? "global." : "";
            let identifierName = node.name;

            const argumentIndex =
                Core.getArgumentIndexFromIdentifier(identifierName);
            if (argumentIndex !== null) {
                const functionNode = findEnclosingFunctionDeclaration(path);
                const preferredArgumentName = resolvePreferredParameterName(
                    functionNode,
                    argumentIndex,
                    node.name,
                    options
                );
                if (Core.isNonEmptyString(preferredArgumentName)) {
                    identifierName = preferredArgumentName;
                }
            }

            const preferredParamName = getPreferredFunctionParameterName(
                path,
                node,
                options
            );
            if (Core.isNonEmptyString(preferredParamName)) {
                identifierName = preferredParamName;
            }

            const renamed = getSemanticIdentifierCaseRenameForNode(
                node,
                options
            );
            if (Core.isNonEmptyString(renamed)) {
                identifierName = renamed;
            }

            let extraPadding = 0;
            if (
                typeof path?.getParentNode === "function" &&
                typeof path?.getName === "function" &&
                path.getName() === "id"
            ) {
                const parentNode = path.getParentNode();
                if (
                    parentNode?.type === VARIABLE_DECLARATOR &&
                    typeof parentNode._alignAssignmentPadding === NUMBER_TYPE
                ) {
                    extraPadding = Math.max(
                        0,
                        parentNode._alignAssignmentPadding
                    );
                }
            }

            const docs = [prefix, identifierName];
            if (extraPadding > 0) {
                docs.push(" ".repeat(extraPadding));
            }

            if (shouldSynthesizeUndefinedDefaultForIdentifier(path, node)) {
                docs.push(" = undefined");
                return concat(docs);
            }

            return concat(docs);
        }
        case "TemplateStringText": {
            return concat(node.value);
        }
        case "MissingOptionalArgument": {
            return concat(UNDEFINED_TYPE);
        }
        case "EnumMember": {
            const extraPadding = getEnumNameAlignmentPadding(node);
            let nameDoc = print("name");
            if (extraPadding > 0) {
                nameDoc = concat([nameDoc, " ".repeat(extraPadding)]);
            }
            return concat(
                printSimpleDeclaration(nameDoc, print("initializer"))
            );
        }
        case "CatchClause": {
            const parts: any[] = [" catch "];
            if (node.param) {
                parts.push(["(", print("param"), ")"]);
            }
            if (node.body) {
                parts.push(" ", printInBlock(path, options, print, "body"));
            }
            return concat(parts);
        }
        case "Finalizer": {
            const parts: any[] = [" finally "];
            if (node.body) {
                parts.push(printInBlock(path, options, print, "body"));
            }
            return concat(parts);
        }
        case "TryStatement": {
            return concat([
                "try ",
                printInBlock(path, options, print, "block"),
                print("handler"),
                print("finalizer")
            ]);
        }
        case "TemplateStringExpression": {
            const hasAtomArray = Array.isArray(node.atoms);
            const atoms = hasAtomArray ? node.atoms : [];
            const literalTextParts = [];
            let shouldCollapseToLiteral = hasAtomArray;

            for (const atom of atoms) {
                if (atom?.type !== "TemplateStringText") {
                    shouldCollapseToLiteral = false;
                    break;
                }

                if (typeof atom.value !== STRING_TYPE) {
                    shouldCollapseToLiteral = false;
                    break;
                }

                literalTextParts.push(atom.value);
            }

            if (
                shouldCollapseToLiteral &&
                literalTextParts.length === atoms.length
            ) {
                const literalText = literalTextParts.join("");
                const stringLiteral = JSON.stringify(literalText);
                return concat(stringLiteral);
            }

            return concat(buildTemplateStringParts(atoms, path, print));
        }
        case "MalformedDocComment": {
            return print(node);
        }
    }
}

function printProgramNode(node, path, options, print) {
    if (node && node.__identifierCasePlanSnapshot) {
        try {
            if (
                Semantic &&
                typeof Semantic.applyIdentifierCasePlanSnapshot === "function"
            ) {
                Semantic.applyIdentifierCasePlanSnapshot(
                    node.__identifierCasePlanSnapshot,
                    options
                );
            }
        } catch {
            // Non-fatal: identifier case snapshot application is optional for printing.
            // If the Semantic API isn't available, continue without it.
        }
    }

    try {
        try {
            if (
                Semantic &&
                typeof Semantic.maybeReportIdentifierCaseDryRun === "function"
            ) {
                Semantic.maybeReportIdentifierCaseDryRun(options);
            }
        } catch {
            /* ignore */
        }

        if (node.body.length === 0) {
            return concat(
                printDanglingCommentsAsGroup(path, options, () => true)
            );
        }
        const bodyParts = printStatements(path, options, print, "body");

        // DEBUG: Check if comments are attached to Program
        // if (node.comments && node.comments.length > 0) {
        //     console.log(
        //         "[DEBUG] Program has comments:",
        //         JSON.stringify(node.comments, null, 2)
        //     );
        // } else {
        //     console.log("[DEBUG] Program has NO comments");
        // }

        const programComments = printDanglingCommentsAsGroup(
            path,
            options,
            () => true
        );

        return concat([programComments, concat(bodyParts)]);
    } finally {
        try {
            if (
                Semantic &&
                typeof Semantic.teardownIdentifierCaseEnvironment === "function"
            ) {
                Semantic.teardownIdentifierCaseEnvironment(options);
            }
        } catch {
            /* ignore */
        }
    }
}

function printBlockStatementNode(node, path, options, print) {
    if (node.body.length === 0) {
        return concat(printEmptyBlock(path, options));
    }

    let leadingDocs = [hardline];

    if (node._gmlForceInitialBlankLine) {
        leadingDocs = [hardline, hardline];
    }

    const sourceMetadata = resolvePrinterSourceMetadata(options);
    const { originalText } = sourceMetadata;
    const firstStatement = node.body[0];
    const constructorStartLine =
        node?.loc?.start?.line ?? node?.start?.line ?? null;
    const firstStatementStartLine =
        firstStatement?.loc?.start?.line ?? firstStatement?.start?.line ?? null;
    const constructorHasLineGap = isBlockWithinConstructor(path)
        ? typeof constructorStartLine === NUMBER_TYPE &&
          typeof firstStatementStartLine === NUMBER_TYPE &&
          firstStatementStartLine - constructorStartLine > 1
        : false;
    let shouldPreserveInitialBlankLine = constructorHasLineGap;

    if (firstStatement) {
        const { startIndex: firstStatementStartIndex } =
            resolveNodeIndexRangeWithSource(firstStatement, sourceMetadata);

        const preserveForConstructorText =
            originalText !== null &&
            typeof firstStatementStartIndex === NUMBER_TYPE &&
            isBlockWithinConstructor(path) &&
            isPreviousLineEmpty(originalText, firstStatementStartIndex);

        const preserveForLeadingComment = hasBlankLineBeforeLeadingComment(
            node,
            sourceMetadata,
            originalText,
            firstStatementStartIndex
        );

        shouldPreserveInitialBlankLine =
            shouldPreserveInitialBlankLine ||
            preserveForConstructorText ||
            preserveForLeadingComment;
    }

    if (shouldPreserveInitialBlankLine) {
        leadingDocs = [hardline, hardline, hardline];
    }

    const stmts = printStatements(path, options, print, "body");

    return concat([
        "{",
        printDanglingComments(
            path,
            options,
            (comment) => comment.attachToBrace
        ),
        indent([...leadingDocs, stmts]),
        hardline,
        "}"
    ]);
}

function printSwitchStatementNode(node, path, options, print) {
    const parts = [];
    const discriminantDoc = printWithoutExtraParens(
        path,
        print,
        "discriminant"
    );
    parts.push(["switch (", buildClauseGroup(discriminantDoc), ") "]);

    const braceIntro = [
        "{",
        printDanglingComments(path, options, (comment) => comment.attachToBrace)
    ];

    if (node.cases.length === 0) {
        parts.push(
            concat([
                ...braceIntro,
                printDanglingCommentsAsGroup(
                    path,
                    options,
                    (comment) => !comment.attachToBrace
                ),
                hardline,
                "}"
            ])
        );
    } else {
        parts.push(
            concat([
                ...braceIntro,
                indent([path.map(print, "cases")]),
                hardline,
                "}"
            ])
        );
    }

    return concat(parts);
}

function printSwitchCaseNode(node, path, options, print) {
    const caseText = node.test === null ? "default" : "case ";
    const parts = [[hardline, caseText, print("test"), ":"]];
    const caseBody = node.body;
    if (Core.isNonEmptyArray(caseBody)) {
        parts.push([
            indent([hardline, printStatements(path, options, print, "body")])
        ]);
    }
    return concat(parts);
}

// Sanitize the top-level doc returned by the inner print implementation
// so that any accidental `null` or `undefined` values nested inside raw
// arrays are coerced into safe string fragments. This prevents Prettier's
// doc traversal from encountering `null` and throwing `InvalidDocError`.
function _sanitizeDocOutput(doc) {
    if (doc === null) return "";
    if (Array.isArray(doc)) return doc.map(_sanitizeDocOutput);
    return doc;
}

export function print(path, options, print) {
    // console.log("print called. options.originalText length:", options.originalText?.length);
    const doc = _printImpl(path, options, print);
    return _sanitizeDocOutput(doc);
}

function getFeatherCommentCallText(node) {
    if (!node || node.type !== "CallExpression") {
        return "";
    }

    const calleeName = Core.getIdentifierText(node.object);

    if (!calleeName) {
        return "";
    }

    const args = Core.getCallExpressionArguments(node);

    if (!Core.isNonEmptyArray(args)) {
        return `${calleeName}()`;
    }

    const placeholderArgs = args.map(() => "...").join(", ");
    return `${calleeName}(${placeholderArgs})`;
}

function buildTemplateStringParts(atoms, path, print) {
    const parts: any[] = ['$"'];
    const length = atoms.length;

    for (let index = 0; index < length; index += 1) {
        const atom = atoms[index];

        if (
            atom?.type === TEMPLATE_STRING_TEXT &&
            typeof atom.value === STRING_TYPE
        ) {
            parts.push(atom.value);
            continue;
        }

        // Lazily print non-text atoms on demand so pure-text templates avoid
        // allocating the `printedAtoms` array. This helper runs inside the
        // printer's expression loop, so skipping the extra array and iterator
        // bookkeeping removes two allocations for mixed templates while keeping
        // the doc emission identical.
        const shouldBreak = atom.type !== IDENTIFIER && atom.type !== LITERAL;
        parts.push(
            group(
                concat([
                    "{",
                    indent(
                        concat([
                            shouldBreak ? softline : "",
                            path.call(print, "atoms", index)
                        ])
                    ),
                    shouldBreak ? softline : "",
                    "}"
                ])
            )
        );
    }

    parts.push('"');
    return parts;
}

function printDelimitedList(
    path,
    print,
    listKey,
    startChar,
    endChar,
    overrides: any = {}
) {
    const {
        delimiter = ",",
        allowTrailingDelimiter = false,
        leadingNewline = true,
        trailingNewline = true,
        forceBreak = false,
        padding = "",
        addIndent = true,
        groupId,
        forceInline = false,
        maxElementsPerLine = Infinity
    } = overrides;
    const lineBreak = forceBreak ? hardline : line;
    const finalDelimiter = allowTrailingDelimiter ? delimiter : "";

    const innerDoc = [
        ifBreak(leadingNewline ? lineBreak : "", padding),
        printElements(
            path,
            print,
            listKey,
            delimiter,
            lineBreak,
            maxElementsPerLine
        )
    ];

    const groupElements = [
        startChar,
        addIndent ? indent(innerDoc) : innerDoc,
        // always print a trailing delimiter if the list breaks
        ifBreak([finalDelimiter, trailingNewline ? lineBreak : ""], padding),
        endChar
    ];

    const groupElementsNoBreak = [
        startChar,
        padding,
        printElements(path, print, listKey, delimiter, " ", maxElementsPerLine),
        padding,
        endChar
    ];

    return forceInline
        ? groupElementsNoBreak
        : group(groupElements, { id: groupId });
}

function normalizeCallTextNewlines(text, endOfLineOption) {
    if (typeof text !== STRING_TYPE) {
        return text;
    }

    const normalized = text.replaceAll(/\r\n?/g, "\n");

    if (endOfLineOption === "crlf") {
        return normalized.replaceAll("\n", "\r\n");
    }

    return normalized;
}

function shouldAllowTrailingComma(options) {
    return options?.trailingComma === TRAILING_COMMA.ALL;
}

function buildCallArgumentsDocs(
    path,
    print,
    options,
    {
        forceBreak = false,
        maxElementsPerLine = Infinity,
        includeInlineVariant = false,
        hasCallbackArguments = false
    } = {}
) {
    const node = path.getValue();
    const simplePrefixLength = countLeadingSimpleCallArguments(node);
    const hasTrailingArguments =
        Array.isArray(node?.arguments) &&
        node.arguments.length > simplePrefixLength;

    if (
        simplePrefixLength > 1 &&
        hasTrailingArguments &&
        hasCallbackArguments &&
        maxElementsPerLine === Infinity
    ) {
        const inlineDoc = includeInlineVariant
            ? printCommaSeparatedList(
                  path,
                  print,
                  "arguments",
                  "(",
                  ")",
                  options,
                  {
                      addIndent: false,
                      forceInline: true,
                      leadingNewline: false,
                      trailingNewline: false,
                      maxElementsPerLine
                  }
              )
            : null;

        const multilineDoc = buildCallbackArgumentsWithSimplePrefix(
            path,
            print,
            simplePrefixLength
        );

        return { inlineDoc, multilineDoc };
    }

    const multilineDoc = printCommaSeparatedList(
        path,
        print,
        "arguments",
        "(",
        ")",
        options,
        {
            forceBreak,
            maxElementsPerLine
        }
    );

    const inlineDoc = includeInlineVariant
        ? printCommaSeparatedList(path, print, "arguments", "(", ")", options, {
              addIndent: false,
              forceInline: true,
              leadingNewline: false,
              trailingNewline: false,
              maxElementsPerLine
          })
        : null;

    return { inlineDoc, multilineDoc };
}

function buildFunctionParameterDocs(path, print, options, overrides: any = {}) {
    const forceInline = overrides.forceInline === true;

    const inlineDoc = printCommaSeparatedList(
        path,
        print,
        "params",
        "(",
        ")",
        options,
        {
            addIndent: false,
            allowTrailingDelimiter: false,
            forceInline: true,
            leadingNewline: false,
            trailingNewline: false
        }
    );

    const multilineDoc = forceInline
        ? inlineDoc
        : printCommaSeparatedList(path, print, "params", "(", ")", options, {
              allowTrailingDelimiter: false
          });

    return { inlineDoc, multilineDoc };
}

function shouldForceInlineFunctionParameters(path, options) {
    const node = path.getValue();

    if (!node || node.type !== "ConstructorDeclaration") {
        return false;
    }

    const parentNode = node.parent;
    if (!parentNode || parentNode.type !== "ConstructorParentClause") {
        return false;
    }

    if (!Core.isNonEmptyArray(node.params)) {
        return false;
    }

    if (node.params.some((param) => Core.hasComment(param))) {
        return false;
    }

    const originalText = getOriginalTextFromOptions(options);

    const firstParam = node.params[0];
    const lastParam = node.params.at(-1);
    const startIndex = Core.getNodeStartIndex(firstParam);
    const endIndex = Core.getNodeEndIndex(lastParam);

    const parameterSource = sliceOriginalText(
        originalText,
        startIndex,
        endIndex
    );

    if (parameterSource === null) {
        return false;
    }

    return !/[\r\n]/.test(parameterSource);
}

function maybePrintInlineDefaultParameterFunctionBody(path, print) {
    const node = path.getValue();
    const parentNode = path.parent;

    if (!node || node.type !== "FunctionDeclaration") {
        return null;
    }

    if (!parentNode || parentNode.type !== "DefaultParameter") {
        return null;
    }

    if (Core.isNonEmptyArray(node.docComments)) {
        return null;
    }

    if (Core.hasComment(node)) {
        return null;
    }

    const bodyNode = node.body;
    const onlyStatement = Core.getSingleBodyStatement(bodyNode);
    if (!onlyStatement) {
        return null;
    }

    if (onlyStatement.type !== "CallExpression") {
        return null;
    }

    const statementDoc = path.call(
        (bodyPath) => bodyPath.call(print, "body", 0),
        "body"
    );

    if (!statementDoc || willBreak(statementDoc)) {
        return null;
    }

    const semicolon = optionalSemicolon(onlyStatement.type);
    return group(["{ ", statementDoc, semicolon, " }"]);
}

function printCommaSeparatedList(
    path,
    print,
    listKey,
    startChar,
    endChar,
    options,
    overrides: any = {}
) {
    const allowTrailingDelimiter =
        overrides.allowTrailingDelimiter === undefined
            ? shouldAllowTrailingComma(options)
            : overrides.allowTrailingDelimiter;

    // console.log(`[DEBUG] printCommaSeparatedList result type: ${typeof result}`);
    return printDelimitedList(path, print, listKey, startChar, endChar, {
        delimiter: ",",
        ...overrides,
        allowTrailingDelimiter
    });
}

// Force statement-shaped children into explicit `{}` blocks so every call site
// that relies on this helper inherits the same guard rails. The printer uses it
// for `if`, loop, and struct bodies where we always emit braces regardless of
// how the source was written. Centralizing the wrapping ensures semicolon
// bookkeeping stays wired through `optionalSemicolon`, keeps synthetic doc
// comments anchored to the block node they describe, and prevents individual
// callers from drifting in how they indent or collapse single-statement bodies.
// When we experimented with open-coding the wrapping logic in each printer, it
// was easy to miss one of those responsibilities and regress either the
// formatter's brace guarantees or the doc comment synthesis covered by the
// synthetic doc comment integration tests
// (`src/plugin/test/synthetic-doc-comments.test.js`).
function printInBlock(path, options, print, expressionKey) {
    const parentNode = path.getValue();
    const node = parentNode[expressionKey];

    if (node.type === BLOCK_STATEMENT) {
        return [print(expressionKey), optionalSemicolon(node.type)];
    }

    const inlineCommentDocs = printDanglingCommentsAsGroup(
        path,
        options,
        (comment) => comment.attachToClauseBody === true
    );

    const hasInlineComments = Core.isNonEmptyArray(inlineCommentDocs);
    const introParts = ["{"];

    if (hasInlineComments) {
        introParts.push(...inlineCommentDocs);
    } else {
        introParts.push(" ");
    }

    return [
        ...introParts,
        indent([hardline, print(expressionKey), optionalSemicolon(node.type)]),
        hardline,
        "}"
    ];
}

function shouldPrintBlockAlternateAsElseIf(node) {
    if (!node || node.type !== "BlockStatement") {
        return false;
    }

    if (Core.hasComment(node)) {
        return false;
    }

    const body = Core.getBodyStatements(node);
    if (body.length !== 1) {
        return false;
    }

    const [onlyStatement] = body;
    return onlyStatement?.type === IF_STATEMENT;
}

// print a delimited sequence of elements
// handles the case where a trailing comment follows a delimiter
function printElements(
    path,
    print,
    listKey,
    delimiter,
    lineBreak,
    maxElementsPerLine = Infinity
) {
    const node = path.getValue();
    const finalIndex = node[listKey].length - 1;
    let itemsSinceLastBreak = 0;
    return path.map((childPath, index) => {
        const parts: any[] = [];
        const printed = print();
        const separator = index === finalIndex ? "" : delimiter;

        if (docHasTrailingComment(printed)) {
            printed.splice(-1, 0, separator);
            parts.push(printed);
        } else {
            parts.push(printed, separator);
        }

        if (index !== finalIndex) {
            const hasLimit =
                Number.isFinite(maxElementsPerLine) && maxElementsPerLine > 0;
            itemsSinceLastBreak += 1;
            if (hasLimit) {
                const childNode = childPath.getValue();
                const nextNode =
                    index < finalIndex ? node[listKey][index + 1] : null;
                const shouldBreakAfter =
                    isComplexArgumentNode(childNode) ||
                    isComplexArgumentNode(nextNode) ||
                    itemsSinceLastBreak >= maxElementsPerLine;

                if (shouldBreakAfter) {
                    parts.push(hardline);
                    itemsSinceLastBreak = 0;
                } else {
                    parts.push(" ");
                }
            } else {
                parts.push(lineBreak);
            }
        }

        return parts;
    }, listKey);
}

function isSimpleCallExpression(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (!Core.getCallExpressionIdentifier(node)) {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);
    if (args.length === 0) {
        return true;
    }

    if (args.length > 1) {
        return false;
    }

    const [onlyArgument] = args;
    const argumentType = Core.getNodeType(onlyArgument);

    if (
        argumentType === "FunctionDeclaration" ||
        argumentType === "StructExpression" ||
        argumentType === "CallExpression"
    ) {
        return false;
    }

    if (Core.hasComment(onlyArgument)) {
        return false;
    }

    return true;
}

function isComplexArgumentNode(node) {
    const nodeType = Core.getNodeType(node);
    if (!nodeType) {
        return false;
    }

    if (nodeType === "CallExpression") {
        return !isSimpleCallExpression(node);
    }

    return (
        nodeType === "FunctionDeclaration" ||
        nodeType === "ConstructorDeclaration" ||
        nodeType === "StructExpression"
    );
}

const SIMPLE_CALL_ARGUMENT_TYPES = new Set([
    "Identifier",
    "Literal",
    "MemberDotExpression",
    "MemberIndexExpression",
    "ThisExpression",
    "BooleanLiteral",
    "UndefinedLiteral"
]);

function isSimpleCallArgument(node) {
    const nodeType = Core.getNodeType(node);
    if (!nodeType) {
        return false;
    }

    if (isComplexArgumentNode(node)) {
        return false;
    }

    if (SIMPLE_CALL_ARGUMENT_TYPES.has(nodeType)) {
        return true;
    }

    if (nodeType === "Literal" && typeof node.value === STRING_TYPE) {
        const literalValue = node.value.toLowerCase();
        if (literalValue === UNDEFINED_TYPE || literalValue === "noone") {
            return true;
        }
    }

    return false;
}

function countLeadingSimpleCallArguments(node) {
    if (!node || !Array.isArray(node.arguments)) {
        return 0;
    }

    let count = 0;
    for (const argument of node.arguments) {
        if (!isSimpleCallArgument(argument)) {
            break;
        }

        count += 1;
    }

    return count;
}

function buildCallbackArgumentsWithSimplePrefix(
    path,
    print,
    simplePrefixLength
) {
    const node = path.getValue();
    const args = Core.asArray(node?.arguments);
    const parts: any[] = [];
    const trailingArguments = args.slice(simplePrefixLength);
    const isCallbackArgument = (argument) => {
        const argumentType = argument?.type;
        return (
            argumentType === "FunctionDeclaration" ||
            argumentType === "ConstructorDeclaration" ||
            argumentType === "StructExpression"
        );
    };
    const firstCallbackIndex = trailingArguments.findIndex(isCallbackArgument);
    const hasTrailingNonCallbackArgument =
        firstCallbackIndex !== -1 &&
        trailingArguments
            .slice(firstCallbackIndex + 1)
            .some((argument) => !isCallbackArgument(argument));
    const shouldForcePrefixBreaks =
        simplePrefixLength > 1 && hasTrailingNonCallbackArgument;

    for (let index = 0; index < args.length; index++) {
        parts.push(path.call(print, "arguments", index));

        if (index >= args.length - 1) {
            continue;
        }

        parts.push(",");

        if (index < simplePrefixLength - 1 && !shouldForcePrefixBreaks) {
            parts.push(" ");
            continue;
        }

        parts.push(line);
    }

    const argumentGroup = group([
        "(",
        indent([softline, ...parts]),
        softline,
        ")"
    ]);

    return shouldForcePrefixBreaks
        ? concat([breakParent, argumentGroup])
        : argumentGroup;
}

function shouldForceBreakStructArgument(argument) {
    if (!argument || argument.type !== "StructExpression") {
        return false;
    }

    if (Core.hasComment(argument)) {
        return true;
    }

    const properties = Core.asArray(argument.properties);
    if (properties.length === 0) {
        return false;
    }

    if (
        properties.some(
            (property) =>
                Core.hasComment(property) ||
                (property as any)?._hasTrailingInlineComment
        )
    ) {
        return true;
    }

    return properties.length > 2;
}

function buildStructPropertyCommentSuffix(path, options) {
    const node =
        path && typeof path.getValue === "function" ? path.getValue() : null;
    const comments = Core.asArray(node?._structTrailingComments);
    if (comments.length === 0) {
        return "";
    }

    const commentDocs = [];

    for (const comment of comments) {
        if ((comment as any)?._structPropertyTrailing === true) {
            const formatted = Core.formatLineComment(comment, {
                ...Core.resolveLineCommentOptions(options),
                originalText: options.originalText
            });
            if (formatted) {
                commentDocs.push(formatted);
            }
            (comment as any)._structPropertyHandled = true;
            (comment as any).printed = true;
        }
    }

    const filteredCommentDocs = commentDocs.filter(
        (doc) => typeof doc === "string" && doc.trim() !== "/// @description"
    );

    if (filteredCommentDocs.length === 0) {
        return "";
    }

    const commentDoc =
        filteredCommentDocs.length === 1
            ? filteredCommentDocs[0]
            : join(hardline, filteredCommentDocs);

    return lineSuffix([lineSuffixBoundary, " ", commentDoc]);
}

function getStructAlignmentInfo(structNode, options) {
    if (!structNode || structNode.type !== "StructExpression") {
        return null;
    }

    const properties = Core.asArray(structNode.properties);

    let maxNameLength = 0;

    for (const property of properties) {
        const nameLength = getStructPropertyNameLength(property, options);
        if (nameLength > maxNameLength) {
            maxNameLength = nameLength;
        }
    }

    if (maxNameLength <= 0) {
        return { maxNameLength: 0 };
    }

    return { maxNameLength };
}

function getStructPropertyNameLength(property, options) {
    if (!property) {
        return 0;
    }

    const nameNode = property.name ?? property.key;
    if (typeof nameNode === STRING_TYPE) {
        return nameNode.length;
    }

    if (!nameNode) {
        return 0;
    }

    if (nameNode.type === IDENTIFIER) {
        const identifierText = Core.getIdentifierText(nameNode);
        return typeof identifierText === STRING_TYPE
            ? identifierText.length
            : 0;
    }

    const source = getSourceTextForNode(nameNode, options);
    return typeof source === STRING_TYPE ? source.length : 0;
}

function printStatements(path, options, print, childrenAttribute) {
    let previousNodeHadNewlineAddedAfter = false; // tracks newline added after the previous node

    const parentNode = path.getValue();
    // Determine the top-level Program node for robust program-scoped
    // comment access. `parentNode` may be a block or other container; we
    // prefer to pass the true Program root to helpers that scan the
    // program-level `comments` bag.
    let programNode = null;
    try {
        for (let depth = 0; ; depth += 1) {
            const p =
                typeof path.getParentNode === "function"
                    ? path.getParentNode(depth)
                    : null;
            if (!p) break;
            programNode = p.type === PROGRAM ? p : programNode;
        }
    } catch {
        // If the path doesn't expose getParentNode with a depth signature
        // (defensive), fall back to the parentNode value so callers still
        // receive a usable object.
        programNode = parentNode;
    }
    if (!programNode && parentNode?.type === PROGRAM) {
        programNode = parentNode;
    }
    const containerNode =
        typeof path.getParentNode === "function" ? path.getParentNode() : null;
    const statements =
        parentNode && Array.isArray(parentNode[childrenAttribute])
            ? parentNode[childrenAttribute]
            : null;
    if (statements) {
        applyAssignmentAlignment(statements, options, path, childrenAttribute);
    }

    // Cache frequently used option lookups to avoid re-evaluating them in the tight map loop.
    const sourceMetadata = resolvePrinterSourceMetadata(options);
    const originalTextCache =
        sourceMetadata.originalText ?? options?.originalText ?? null;

    let syntheticDocByNode = new Map();

    syntheticDocByNode = new Map();
    if (statements) {
        for (const statement of statements) {
            const docComment =
                getSyntheticDocCommentForStaticVariable(
                    statement,
                    options,
                    programNode,
                    originalTextCache
                ) ??
                getSyntheticDocCommentForFunctionAssignment(
                    statement,
                    options,
                    programNode,
                    originalTextCache
                );
            if (docComment) {
                syntheticDocByNode.set(statement, docComment);
            }
        }
    }

    return path.map((childPath, index) => {
        const result = buildStatementPartsForPrinter({
            childPath,
            index,
            print,
            options,
            originalTextCache,
            syntheticDocByNode,
            sourceMetadata,
            statements,
            containerNode,
            previousNodeHadNewlineAddedAfter
        });
        previousNodeHadNewlineAddedAfter =
            result.previousNodeHadNewlineAddedAfter;
        return result.parts;
    }, childrenAttribute);
}

function buildStatementPartsForPrinter({
    childPath,
    index,
    print,
    options,
    originalTextCache,
    syntheticDocByNode,
    sourceMetadata,
    statements,
    containerNode,
    previousNodeHadNewlineAddedAfter
}) {
    const parts: any[] = [];
    const node = childPath.getValue();
    // Defensive: some transforms may leave holes or null entries in the
    // statements array. Skip nullish nodes rather than attempting to
    // dereference their type (which previously caused a TypeError).
    if (!node) {
        return { parts, previousNodeHadNewlineAddedAfter };
    }
    const isTopLevel = childPath.parent?.type === PROGRAM;
    const printed = print();

    if (printed == null || printed === "") {
        return { parts, previousNodeHadNewlineAddedAfter };
    }

    let semi = optionalSemicolon(node.type);
    const { startIndex: nodeStartIndex, endIndex: nodeEndIndex } =
        resolveNodeIndexRangeWithSource(node, sourceMetadata);

    const currentNodeRequiresNewline =
        shouldAddNewlinesAroundStatement(node) && isTopLevel;

    if (isTopLevel && index === 0 && Core.isFunctionAssignmentStatement(node)) {
        parts.push(hardline);
    }

    addLeadingStatementSpacing({
        parts,
        currentNodeRequiresNewline,
        previousNodeHadNewlineAddedAfter,
        isTopLevel,
        index,
        options,
        originalTextCache,
        nodeStartIndex
    });

    const syntheticDocRecord = syntheticDocByNode.get(node);
    const syntheticDocComment = syntheticDocRecord
        ? syntheticDocRecord.doc
        : null;
    const syntheticPlainLeadingLines = syntheticDocRecord
        ? syntheticDocRecord.plainLeadingLines
        : [];
    appendSyntheticDocCommentParts({
        parts,
        syntheticDocComment,
        syntheticPlainLeadingLines
    });

    const textForSemicolons = originalTextCache || "";
    let hasTerminatingSemicolon = false;
    if (nodeEndIndex !== null) {
        let cursor = nodeEndIndex;
        while (
            cursor < textForSemicolons.length &&
            isSkippableSemicolonWhitespace(textForSemicolons.charCodeAt(cursor))
        ) {
            cursor++;
        }
        hasTerminatingSemicolon = textForSemicolons[cursor] === ";";
    }

    const isVariableDeclaration = node.type === VARIABLE_DECLARATION;
    const isStaticDeclaration = isVariableDeclaration && node.kind === "static";
    const hasFunctionInitializer =
        isVariableDeclaration &&
        Array.isArray(node.declarations) &&
        node.declarations.some((declaration) => {
            const initType = declaration?.init?.type;
            return (
                initType === FUNCTION_EXPRESSION ||
                initType === FUNCTION_DECLARATION
            );
        });

    const isFirstStatementInBlock =
        index === 0 && childPath.parent?.type !== PROGRAM;

    const suppressFollowingEmptyLine =
        node?._featherSuppressFollowingEmptyLine === true ||
        node?._gmlSuppressFollowingEmptyLine === true;

    if (
        isFirstStatementInBlock &&
        isStaticDeclaration &&
        !syntheticDocComment
    ) {
        const hasExplicitBlankLineBeforeStatic =
            typeof originalTextCache === STRING_TYPE &&
            typeof nodeStartIndex === NUMBER_TYPE &&
            isPreviousLineEmpty(originalTextCache, nodeStartIndex);
        const blockAncestor =
            typeof childPath.getParentNode === "function"
                ? childPath.getParentNode()
                : (childPath.parent ?? null);
        const constructorAncestor =
            typeof childPath.getParentNode === "function"
                ? childPath.getParentNode(1)
                : (blockAncestor?.parent ?? null);
        const shouldForceConstructorPadding =
            blockAncestor?.type === "BlockStatement" &&
            constructorAncestor?.type === "ConstructorDeclaration";

        if (hasExplicitBlankLineBeforeStatic || shouldForceConstructorPadding) {
            parts.push(hardline);
        }
    }

    semi = normalizeStatementSemicolon({
        node,
        semi,
        childPath,
        hasTerminatingSemicolon,
        syntheticDocRecord,
        syntheticDocComment,
        isStaticDeclaration
    });

    // Preserve the `statement; // trailing comment` shape that GameMaker
    // authors rely on. When the child doc ends with a trailing comment token
    // we cannot blindly append the semicolon because Prettier would render
    // `statement // comment;`, effectively moving the comment past the
    // terminator. Inserting the semicolon right before the comment keeps the
    // formatter's "always add the final `;`" guarantee intact without
    // rewriting author comments or dropping the semicolon entirely—a
    // regression we previously hit when normalising legacy `#define`
    // assignments.
    const manualMathRatio = getManualMathRatio(node);
    const manualMathOriginalComment =
        typeof node._gmlManualMathOriginalComment === STRING_TYPE
            ? node._gmlManualMathOriginalComment
            : null;

    if (docHasTrailingComment(printed)) {
        printed.splice(-1, 0, semi);
        parts.push(printed);
        if (manualMathOriginalComment) {
            parts.push(" // ", manualMathOriginalComment);
        }
        if (manualMathRatio) {
            parts.push(" ", manualMathRatio);
        }
    } else {
        parts.push(printed, semi);
        if (manualMathOriginalComment) {
            parts.push(" // ", manualMathOriginalComment);
        }
        if (manualMathRatio) {
            parts.push(" ", manualMathRatio);
        }
    }

    // Clear the state flag that signals whether the previous statement in
    // the loop emitted trailing whitespace. This reset ensures each
    // statement begins evaluation with a clean slate: if the current node
    // determines it needs a leading blank line (via the "BEFORE" check
    // above), that decision will not be incorrectly suppressed by stale
    // state from an earlier iteration. The flag is then conditionally set
    // to `true` in the "AFTER" logic below whenever this statement
    // contributes a trailing hardline, allowing the next iteration to
    // coordinate spacing without doubling up blank lines.
    const nextPreviousNodeHadNewlineAddedAfter = applyTrailingSpacing({
        childPath,
        parts,
        statements,
        index,
        node,
        isTopLevel,
        options,
        syntheticDocByNode,
        hardline,
        currentNodeRequiresNewline,
        nodeEndIndex,
        suppressFollowingEmptyLine,
        syntheticDocComment,
        isStaticDeclaration,
        hasFunctionInitializer,
        containerNode
    });

    return {
        parts,
        previousNodeHadNewlineAddedAfter: nextPreviousNodeHadNewlineAddedAfter
    };
}

function addLeadingStatementSpacing({
    parts,
    currentNodeRequiresNewline,
    previousNodeHadNewlineAddedAfter,
    isTopLevel,
    index,
    options,
    originalTextCache,
    nodeStartIndex
}) {
    if (!currentNodeRequiresNewline || previousNodeHadNewlineAddedAfter) {
        return;
    }

    const hasLeadingComment = isTopLevel
        ? Core.hasCommentImmediatelyBefore(originalTextCache, nodeStartIndex)
        : false;

    if (
        isTopLevel &&
        index > 0 &&
        !isPreviousLineEmpty(options.originalText, nodeStartIndex) &&
        !hasLeadingComment
    ) {
        parts.push(hardline);
    }
}

function appendSyntheticDocCommentParts({
    parts,
    syntheticDocComment,
    syntheticPlainLeadingLines
}) {
    if (syntheticPlainLeadingLines.length > 0) {
        parts.push(join(hardline, syntheticPlainLeadingLines));
        if (!syntheticDocComment) {
            parts.push(hardline);
        }
    }
    if (syntheticDocComment) {
        parts.push(syntheticDocComment, hardline);
    }
}

function normalizeStatementSemicolon({
    node,
    semi,
    childPath,
    hasTerminatingSemicolon,
    syntheticDocRecord,
    syntheticDocComment,
    isStaticDeclaration
}) {
    if (semi !== ";") {
        return semi;
    }

    const initializerIsFunctionExpression =
        node.type === VARIABLE_DECLARATION &&
        Array.isArray(node.declarations) &&
        node.declarations.length === 1 &&
        (node.declarations[0]?.init?.type === FUNCTION_EXPRESSION ||
            node.declarations[0]?.init?.type === FUNCTION_DECLARATION);

    if (initializerIsFunctionExpression && !hasTerminatingSemicolon) {
        // Normalized legacy `#define` directives used to omit trailing
        // semicolons when rewriting to function expressions. The
        // formatter now standardizes those assignments so they always
        // emit an explicit semicolon, matching the golden fixtures and
        // keeping the output consistent regardless of the original
        // source style.
        return ";";
    }

    if (
        !hasTerminatingSemicolon &&
        node.type === ASSIGNMENT_EXPRESSION &&
        isInsideConstructorFunction(childPath)
    ) {
        return "";
    }

    const assignmentExpressionForSemicolonCheck =
        node.type === ASSIGNMENT_EXPRESSION
            ? node
            : node.type === EXPRESSION_STATEMENT &&
                node.expression?.type === ASSIGNMENT_EXPRESSION
              ? node.expression
              : null;

    const isFunctionAssignmentExpression =
        assignmentExpressionForSemicolonCheck?.operator === "=" &&
        assignmentExpressionForSemicolonCheck?.right?.type ===
            "FunctionDeclaration";

    if (isFunctionAssignmentExpression && !hasTerminatingSemicolon) {
        // Preserve the explicit terminator when normalizing anonymous
        // function assignments so the formatter emits `= function () {};`
        // instead of silently dropping the semicolon. The semicolon is part
        // of the statement boundary rather than the function expression
        // itself, so we add it whenever the source omitted one and rely on the
        // caller to elide it when the original text already contained a
        // trailing `;`.
        return semi;
    }

    const shouldOmitSemicolon =
        !hasTerminatingSemicolon &&
        syntheticDocComment &&
        !(syntheticDocRecord?.hasExistingDocLines ?? false) &&
        isLastStatement(childPath) &&
        !isStaticDeclaration;

    if (shouldOmitSemicolon) {
        return "";
    }

    return semi;
}

function applyTrailingSpacing({
    childPath,
    parts,
    statements,
    index,
    node,
    isTopLevel,
    options,
    syntheticDocByNode,
    hardline,
    currentNodeRequiresNewline,
    nodeEndIndex,
    suppressFollowingEmptyLine,
    syntheticDocComment,
    isStaticDeclaration,
    hasFunctionInitializer,
    containerNode
}) {
    if (!isLastStatement(childPath)) {
        return handleIntermediateTrailingSpacing({
            parts,
            statements,
            index,
            node,
            options,
            syntheticDocByNode,
            hardline,
            currentNodeRequiresNewline,
            nodeEndIndex,
            suppressFollowingEmptyLine
        });
    }

    if (isTopLevel) {
        parts.push(hardline);
        return false;
    }

    return handleTerminalTrailingSpacing({
        childPath,
        parts,
        node,
        options,
        hardline,
        nodeEndIndex,
        suppressFollowingEmptyLine,
        syntheticDocComment,
        isStaticDeclaration,
        hasFunctionInitializer,
        containerNode
    });
}

function handleIntermediateTrailingSpacing({
    parts,
    statements,
    index,
    node,
    options,
    syntheticDocByNode,
    hardline,
    currentNodeRequiresNewline,
    nodeEndIndex,
    suppressFollowingEmptyLine
}) {
    let previousNodeHadNewlineAddedAfter = false;
    const nextNode = statements ? statements[index + 1] : null;
    const shouldSuppressExtraEmptyLine = shouldSuppressEmptyLineBetween(
        node,
        nextNode
    );
    const nextNodeIsMacro = Core.isMacroLikeStatement(nextNode);
    const shouldSkipStandardHardline =
        shouldSuppressExtraEmptyLine &&
        Core.isMacroLikeStatement(node) &&
        !nextNodeIsMacro;

    if (!shouldSkipStandardHardline) {
        parts.push(hardline);
    }

    const nextHasSyntheticDoc = nextNode
        ? syntheticDocByNode.has(nextNode)
        : false;
    const nextLineProbeIndex =
        node?.type === DEFINE_STATEMENT || node?.type === MACRO_DECLARATION
            ? nodeEndIndex
            : nodeEndIndex + 1;

    const suppressLeadingEmptyLine =
        nextNode?._featherSuppressLeadingEmptyLine === true;
    const forceFollowingEmptyLine =
        node?._featherForceFollowingEmptyLine === true ||
        node?._gmlForceFollowingEmptyLine === true;

    const nextLineEmpty =
        suppressFollowingEmptyLine || suppressLeadingEmptyLine
            ? false
            : isNextLineEmpty(options.originalText, nextLineProbeIndex);

    const isSanitizedMacro =
        node?.type === MACRO_DECLARATION &&
        typeof node._featherMacroText === STRING_TYPE;
    const sanitizedMacroHasExplicitBlankLine =
        isSanitizedMacro &&
        macroTextHasExplicitTrailingBlankLine(node._featherMacroText);

    const isMacroLikeNode = Core.isMacroLikeStatement(node);
    const isDefineMacroReplacement =
        Core.getNormalizedDefineReplacementDirective(node) ===
        Core.DefineReplacementDirective.MACRO;
    const shouldForceMacroPadding =
        isMacroLikeNode &&
        !isDefineMacroReplacement &&
        !nextNodeIsMacro &&
        !nextLineEmpty &&
        !shouldSuppressExtraEmptyLine &&
        !sanitizedMacroHasExplicitBlankLine;
    const isLoopStatement =
        node?.type === FOR_STATEMENT ||
        node?.type === WHILE_STATEMENT ||
        node?.type === REPEAT_STATEMENT ||
        node?.type === DO_UNTIL_STATEMENT ||
        node?.type === WITH_STATEMENT;
    const nextNodeIsLoop =
        nextNode?.type === FOR_STATEMENT ||
        nextNode?.type === WHILE_STATEMENT ||
        nextNode?.type === REPEAT_STATEMENT ||
        nextNode?.type === DO_UNTIL_STATEMENT ||
        nextNode?.type === WITH_STATEMENT;
    const nextNodeIsVariableDeclaration =
        nextNode?.type === VARIABLE_DECLARATION;
    const shouldForceLoopSectionPadding =
        !suppressFollowingEmptyLine &&
        isLoopStatement &&
        (nextNodeIsVariableDeclaration || nextNodeIsLoop) &&
        !nextLineEmpty &&
        !shouldSuppressExtraEmptyLine &&
        !sanitizedMacroHasExplicitBlankLine;
    const shouldForceEarlyReturnPadding =
        !suppressFollowingEmptyLine &&
        shouldForceBlankLineBetweenReturnPaths(node, nextNode);

    const shouldAddForcedPadding =
        shouldForceMacroPadding ||
        shouldForceLoopSectionPadding ||
        (forceFollowingEmptyLine &&
            !nextLineEmpty &&
            !shouldSuppressExtraEmptyLine &&
            !sanitizedMacroHasExplicitBlankLine) ||
        (shouldForceEarlyReturnPadding &&
            !nextLineEmpty &&
            !shouldSuppressExtraEmptyLine &&
            !sanitizedMacroHasExplicitBlankLine);

    const shouldAddPaddingWithNewline =
        shouldAddForcedPadding ||
        (currentNodeRequiresNewline && !nextLineEmpty);

    if (shouldAddPaddingWithNewline) {
        parts.push(hardline);
        previousNodeHadNewlineAddedAfter = true;
    } else if (
        nextLineEmpty &&
        !nextHasSyntheticDoc &&
        !shouldSuppressExtraEmptyLine &&
        !sanitizedMacroHasExplicitBlankLine
    ) {
        parts.push(hardline);
    }

    return previousNodeHadNewlineAddedAfter;
}

function handleTerminalTrailingSpacing({
    childPath,
    parts,
    node,
    options,
    hardline,
    nodeEndIndex,
    suppressFollowingEmptyLine,
    syntheticDocComment,
    isStaticDeclaration,
    hasFunctionInitializer,
    containerNode
}) {
    let previousNodeHadNewlineAddedAfter = false;
    const parentNode = childPath.parent;
    const trailingProbeIndex =
        node?.type === DEFINE_STATEMENT || node?.type === MACRO_DECLARATION
            ? nodeEndIndex
            : nodeEndIndex + 1;
    const enforceTrailingPadding = shouldAddNewlinesAroundStatement(node);
    const blockParent =
        typeof childPath.getParentNode === "function"
            ? childPath.getParentNode()
            : childPath.parent;
    const constructorAncestor =
        typeof childPath.getParentNode === "function"
            ? childPath.getParentNode(1)
            : (blockParent?.parent ?? null);
    const isConstructorBlock =
        blockParent?.type === "BlockStatement" &&
        constructorAncestor?.type === "ConstructorDeclaration";
    const shouldPreserveConstructorStaticPadding =
        isStaticDeclaration && hasFunctionInitializer && isConstructorBlock;
    let shouldPreserveTrailingBlankLine = false;
    const hasAttachedDocComment =
        node?.[DOC_COMMENT_OUTPUT_FLAG] === true ||
        Core.isNonEmptyArray(node?.docComments) ||
        Boolean(syntheticDocComment);
    const requiresTrailingPadding =
        enforceTrailingPadding &&
        parentNode?.type === "BlockStatement" &&
        !suppressFollowingEmptyLine;

    if (parentNode?.type === "BlockStatement" && !suppressFollowingEmptyLine) {
        const originalText =
            typeof options.originalText === STRING_TYPE
                ? options.originalText
                : null;
        const trailingBlankLineCount =
            originalText === null
                ? 0
                : countTrailingBlankLines(originalText, trailingProbeIndex);
        const hasExplicitTrailingBlankLine = trailingBlankLineCount > 0;
        const shouldCollapseExcessBlankLines = trailingBlankLineCount > 1;

        if (enforceTrailingPadding) {
            shouldPreserveTrailingBlankLine =
                node?.type === "FunctionDeclaration"
                    ? true
                    : hasExplicitTrailingBlankLine;
        } else if (
            shouldPreserveConstructorStaticPadding &&
            hasExplicitTrailingBlankLine &&
            !shouldCollapseExcessBlankLines
        ) {
            shouldPreserveTrailingBlankLine = true;
        } else if (hasExplicitTrailingBlankLine && originalText !== null) {
            const textLength = originalText.length;
            let scanIndex = trailingProbeIndex;
            let nextCharacter = null;

            while (scanIndex < textLength) {
                nextCharacter = getNextNonWhitespaceCharacter(
                    originalText,
                    scanIndex
                );

                if (nextCharacter === ";") {
                    if (hasFunctionInitializer) {
                        break;
                    }

                    const semicolonIndex = originalText.indexOf(";", scanIndex);
                    if (semicolonIndex === -1) {
                        nextCharacter = null;
                        break;
                    }

                    scanIndex = semicolonIndex + 1;
                    continue;
                }

                break;
            }

            const shouldPreserve =
                nextCharacter === null ? false : nextCharacter !== "}";

            shouldPreserveTrailingBlankLine = shouldCollapseExcessBlankLines
                ? false
                : shouldPreserve;
        }
    }

    if (!shouldPreserveTrailingBlankLine && !suppressFollowingEmptyLine) {
        if (
            shouldForceTrailingBlankLineForNestedFunction(
                node,
                parentNode,
                containerNode
            )
        ) {
            shouldPreserveTrailingBlankLine = true;
        } else if (
            hasAttachedDocComment &&
            blockParent?.type === "BlockStatement"
        ) {
            const isFunctionLike = Core.isFunctionLikeDeclaration(node);
            if (isFunctionLike) {
                shouldPreserveTrailingBlankLine = true;
            }
        }
    }

    if (shouldPreserveTrailingBlankLine || requiresTrailingPadding) {
        parts.push(hardline);
        previousNodeHadNewlineAddedAfter = true;
    }

    return previousNodeHadNewlineAddedAfter;
}

export function applyAssignmentAlignment(
    statements,
    options,
    path = null,
    childrenAttribute = null
) {
    const minGroupSize = getAssignmentAlignmentMinimum(options);
    /** @type {Array<{ node: any, nameLength: number, prefixLength: number, assignmentType: string }>} */
    const currentGroup = [];
    let currentGroupMaxLength = 0;
    let currentGroupHasAlias = false;

    const { originalText, locStart, locEnd } =
        resolvePrinterSourceMetadata(options);

    const insideFunctionBody = isPathInsideFunctionBody(
        path,
        childrenAttribute
    );
    const functionNode = insideFunctionBody
        ? findEnclosingFunctionNode(path)
        : null;
    const functionParameterNames = insideFunctionBody
        ? getFunctionParameterNameSetFromPath(path)
        : null;

    let previousEntry = null;

    const resetGroup = () => {
        currentGroup.length = 0;
        currentGroupMaxLength = 0;
        currentGroupHasAlias = false;
    };

    const flushGroup = () => {
        if (currentGroup.length === 0) {
            resetGroup();
            return;
        }

        const groupEntries = [...currentGroup];
        const groupAssignmentType =
            groupEntries.length > 0
                ? groupEntries[0].assignmentType
                : "assignment";
        const meetsAlignmentThreshold =
            groupAssignmentType === "declaration"
                ? minGroupSize > 0 && groupEntries.length >= minGroupSize
                : minGroupSize > 0
                  ? groupEntries.length >= minGroupSize
                  : groupEntries.length >= 2;
        const canAlign = meetsAlignmentThreshold && currentGroupHasAlias;

        if (!canAlign) {
            for (const { node } of groupEntries) {
                node._alignAssignmentPadding = 0;
            }
            resetGroup();
            return;
        }

        const targetLength = currentGroupMaxLength;
        for (const { node, nameLength, prefixLength } of groupEntries) {
            node._alignAssignmentPadding =
                targetLength - (nameLength + prefixLength);
        }

        resetGroup();
    };

    for (const statement of statements) {
        const entry = getSimpleAssignmentLikeEntry(
            statement,
            insideFunctionBody,
            functionParameterNames,
            functionNode,
            options
        );

        if (entry) {
            const typeChanged =
                Boolean(previousEntry) &&
                entry.assignmentType !== previousEntry.assignmentType;

            if (previousEntry) {
                if (typeChanged) {
                    flushGroup();
                } else if (
                    previousEntry.skipBreakAfter !== true &&
                    shouldBreakAssignmentAlignment(
                        previousEntry.locationNode,
                        entry.locationNode,
                        originalText,
                        locStart,
                        locEnd
                    )
                ) {
                    flushGroup();
                }
            }

            const prefixLength = entry.prefixLength ?? 0;
            currentGroup.push({
                node: entry.paddingTarget,
                nameLength: entry.nameLength,
                prefixLength,
                assignmentType: entry.assignmentType
            });
            const printedWidth = entry.nameLength + prefixLength;
            if (printedWidth > currentGroupMaxLength) {
                currentGroupMaxLength = printedWidth;
            }
            if (entry.enablesAlignment) {
                currentGroupHasAlias = true;
            }

            previousEntry = entry;
        } else {
            flushGroup();
            previousEntry = null;
        }
    }

    flushGroup();
}

function isPathInsideFunctionBody(path, childrenAttribute) {
    if (childrenAttribute !== "body") {
        return false;
    }

    const containerNode = callPathMethod(path, "getValue", {
        defaultValue: null
    });
    if (!containerNode || containerNode.type !== "BlockStatement") {
        return false;
    }

    const functionNode = findEnclosingFunctionNode(path);
    if (!functionNode || !functionNode.body) {
        return false;
    }

    if (functionNode.body === containerNode) {
        return true;
    }

    const getParentNode = path?.getParentNode;
    if (typeof getParentNode !== "function") {
        return false;
    }

    for (let depth = 0; ; depth += 1) {
        const ancestor =
            depth === 0
                ? getParentNode.call(path)
                : getParentNode.call(path, depth);
        if (!ancestor) {
            break;
        }

        if (ancestor === functionNode.body) {
            return true;
        }

        if (ancestor === functionNode) {
            break;
        }
    }

    return false;
}

export interface AssignmentLikeEntry {
    locationNode: any;
    paddingTarget: any;
    nameLength: number;
    enablesAlignment: boolean;
    prefixLength: number;
    skipBreakAfter?: boolean;
    assignmentType: "assignment" | "declaration";
}

export function getSimpleAssignmentLikeEntry(
    statement: any,
    insideFunctionBody: any,
    functionParameterNames: any,
    functionNode: any,
    options: any
): AssignmentLikeEntry | null {
    const memberLength = getMemberAssignmentLength(statement);
    if (typeof memberLength === NUMBER_TYPE) {
        return {
            locationNode: statement,
            paddingTarget: statement,
            nameLength: memberLength,
            enablesAlignment: true,
            prefixLength: 0,
            assignmentType: "assignment"
        };
    }

    if (isSimpleAssignment(statement)) {
        const identifier = statement.left;
        if (!identifier || typeof identifier.name !== STRING_TYPE) {
            return null;
        }

        if (
            options?.preserveGlobalVarStatements === false &&
            identifier.isGlobalIdentifier
        ) {
            return null;
        }

        return {
            locationNode: statement,
            paddingTarget: statement,
            nameLength: identifier.name.length,
            enablesAlignment: true,
            prefixLength: 0,
            assignmentType: "assignment"
        };
    }

    const declarator = Core.getSingleVariableDeclarator(statement);
    if (!declarator) {
        return null;
    }

    const id = declarator.id;
    if (!id || id.type !== "Identifier" || typeof id.name !== STRING_TYPE) {
        return null;
    }

    const init = declarator.init;
    if (!init) {
        return null;
    }

    let enablesAlignment = false;
    if (init.type === "Identifier" && typeof init.name === STRING_TYPE) {
        const argumentIndex = Core.getArgumentIndexFromIdentifier(init.name);

        if (!insideFunctionBody && argumentIndex !== null) {
            return null;
        }

        if (insideFunctionBody) {
            const hasNamedParameters =
                functionParameterNames && functionParameterNames.size > 0;

            if (argumentIndex !== null) {
                if (!options?.applyFeatherFixes || hasNamedParameters) {
                    enablesAlignment = true;
                }
            } else if (functionParameterNames?.has(init.name)) {
                enablesAlignment = true;
            }
        }
    }

    const skipBreakAfter = shouldOmitParameterAlias(
        declarator,
        functionNode,
        options
    );

    const keyword =
        typeof statement.kind === STRING_TYPE && statement.kind.length > 0
            ? statement.kind
            : "var";
    const prefixLength = keyword.length + 1;

    const shouldEnableVarAlignment = keyword === "var";

    return {
        locationNode: statement,
        paddingTarget: declarator,
        nameLength: (id.name as string).length,
        enablesAlignment: enablesAlignment || shouldEnableVarAlignment,
        skipBreakAfter,
        prefixLength,
        assignmentType: "declaration"
    };
}

function getFunctionParameterNameSetFromPath(path) {
    const functionNode = findEnclosingFunctionNode(path);
    if (!functionNode) {
        return null;
    }

    const params = getFunctionParams(functionNode);
    if (params.length === 0) {
        return null;
    }

    const names = new Set();
    for (const param of params) {
        const identifier = Core.getIdentifierFromParameterNode(param);
        if (
            identifier &&
            typeof identifier.name === STRING_TYPE &&
            identifier.name.length > 0
        ) {
            names.add(identifier.name);
        }
    }

    return names.size > 0 ? names : null;
}

function getMemberAssignmentLength(statement) {
    if (
        !statement ||
        statement.type !== "AssignmentExpression" ||
        statement.operator !== "="
    ) {
        return null;
    }

    return getMemberExpressionLength(statement.left);
}

function getMemberExpressionLength(expression) {
    if (!expression) {
        return null;
    }

    if (expression.type === "MemberDotExpression") {
        let length = 0;
        let current = expression;

        while (current && current.type === "MemberDotExpression") {
            const { property, object } = current;
            if (
                !property ||
                property.type !== "Identifier" ||
                typeof property.name !== STRING_TYPE
            ) {
                return null;
            }

            length += property.name.length + 1; // include the separating dot

            if (!object) {
                return null;
            }

            if (object.type === "Identifier") {
                length += object.name.length;
                return length;
            }

            if (object.type !== "MemberDotExpression") {
                return null;
            }

            current = object;
        }

        return null;
    }

    if (expression.type === "MemberIndexExpression") {
        const objectLength =
            getMemberExpressionLength(expression.object) ??
            (expression.object?.type === "Identifier"
                ? typeof expression.object.name === STRING_TYPE
                    ? expression.object.name.length
                    : null
                : null);

        if (typeof objectLength !== NUMBER_TYPE) {
            return null;
        }

        const propertyEntry =
            Core.getSingleMemberIndexPropertyEntry(expression);
        if (!propertyEntry) {
            return null;
        }

        let propertyLength = null;
        if (
            propertyEntry.type === "Identifier" &&
            typeof propertyEntry.name === STRING_TYPE
        ) {
            const propertyName = propertyEntry.name;
            if (typeof propertyName === "string") {
                propertyLength = propertyName.length;
            }
        }

        if (typeof propertyLength !== NUMBER_TYPE) {
            return null;
        }

        const accessorRaw =
            typeof expression.accessor === STRING_TYPE
                ? expression.accessor
                : "";
        const accessorLength =
            accessorRaw.length > 1
                ? accessorRaw.length + 1
                : accessorRaw.length;

        return objectLength + accessorLength + propertyLength + 1; // closing bracket
    }

    return null;
}

function getAssignmentAlignmentMinimum(options) {
    return Core.coercePositiveIntegerOption(
        options?.alignAssignmentsMinGroupSize,
        3,
        {
            zeroReplacement: 0
        }
    );
}

function isSimpleAssignment(node) {
    return !!(
        node &&
        node.type === "AssignmentExpression" &&
        node.operator === "=" &&
        node.left &&
        node.left.type === "Identifier" &&
        typeof node.left.name === STRING_TYPE
    );
}

function shouldBreakAssignmentAlignment(
    previousNode,
    nextNode,
    originalText,
    locStart,
    locEnd
) {
    if (
        !originalText ||
        typeof originalText !== STRING_TYPE ||
        !previousNode ||
        !nextNode
    ) {
        return false;
    }

    const previousEnd = getNodeEndIndexForAlignment(previousNode, locEnd);
    const nextStart = getNodeStartIndexForAlignment(nextNode, locStart);

    if (
        !Number.isInteger(previousEnd) ||
        !Number.isInteger(nextStart) ||
        previousEnd >= nextStart
    ) {
        return false;
    }

    const between = originalText.slice(previousEnd + 1, nextStart);

    if (isArgumentAliasGap(between)) {
        return false;
    }

    if (/\n[^\S\r\n]*\n/.test(between)) {
        return true;
    }

    return /(?:^|\n)\s*(?:\/\/|\/\*)/.test(between);
}

function isArgumentAliasGap(text) {
    if (typeof text !== STRING_TYPE || text.length === 0) {
        return false;
    }

    const withoutBlock = text.replaceAll(/\/\*[\s\S]*?\*\//g, "");
    const withoutLine = withoutBlock.replaceAll(/\/\/[^\r\n]*/g, "");
    const trimmed = withoutLine.trim();
    if (trimmed.length === 0) {
        return false;
    }

    const statements = trimmed
        .split(";")
        .map((stmt) => stmt.trim())
        .filter((stmt) => stmt.length > 0);
    if (statements.length === 0) {
        return false;
    }

    return statements.every((statement) => {
        const match = statement.match(
            /^(?:var\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*(argument\d+)$/
        );
        return !!match && Core.GML_ARGUMENT_IDENTIFIER_PATTERN.test(match[1]);
    });
}

function getNodeStartIndexForAlignment(node, locStart) {
    if (!node) {
        return null;
    }

    if (typeof locStart === "function") {
        const resolved = locStart(node);
        if (Number.isInteger(resolved)) {
            return resolved;
        }
    }

    const startProp = node.start;
    if (typeof startProp === NUMBER_TYPE) {
        return startProp;
    }

    if (startProp && typeof startProp.index === NUMBER_TYPE) {
        return startProp.index;
    }

    return null;
}

function getNodeEndIndexForAlignment(node, locEnd) {
    if (!node) {
        return null;
    }

    if (typeof locEnd === "function") {
        const resolved = locEnd(node);
        if (Number.isInteger(resolved)) {
            return resolved - 1;
        }
    }

    const endProp = node.end;
    if (typeof endProp === NUMBER_TYPE) {
        return endProp;
    }

    if (endProp && typeof endProp.index === NUMBER_TYPE) {
        return endProp.index;
    }

    const startIndex = getNodeStartIndexForAlignment(node, null);
    return Number.isInteger(startIndex) ? startIndex : null;
}

/**
 * Detects when a call expression is missing separators between numeric arguments and
 * replays the original text while injecting synthetic commas to keep the formatter's
 * rewrites closer to what the user originally typed, preserving surrounding whitespace.
 *
 * @param node Call expression whose arguments should be inspected.
 * @param originalText Source text that produced {@link node}.
 * @param startIndex Inclusive start index of {@link node} within {@link originalText}.
 * @param endIndex Exclusive end index of {@link node} within {@link originalText}.
 * @returns {string | null} The restored call text with injected separators when a numeric gap was detected, or `null` if nothing needed to change.
 */
function synthesizeMissingCallArgumentSeparators(
    node,
    originalText,
    startIndex,
    endIndex
) {
    if (
        !node ||
        node.type !== "CallExpression" ||
        !Array.isArray(node.arguments) ||
        typeof originalText !== STRING_TYPE ||
        typeof startIndex !== NUMBER_TYPE ||
        typeof endIndex !== NUMBER_TYPE ||
        endIndex <= startIndex
    ) {
        return null;
    }

    let cursor = startIndex;
    let normalizedText = "";
    let insertedSeparator = false;

    // Cache array length to avoid repeated property access in loop condition.
    // Accessing .length on every iteration is unnecessary since the array
    // doesn't change. Precompute both the length and the last index for clarity.
    const argumentsLength = node.arguments.length;
    const lastArgumentIndex = argumentsLength - 1;

    for (let index = 0; index < argumentsLength; index += 1) {
        const argument = node.arguments[index];
        const argumentStart = Core.getNodeStartIndex(argument);
        const argumentEnd = Core.getNodeEndIndex(argument);

        if (
            typeof argumentStart !== NUMBER_TYPE ||
            typeof argumentEnd !== NUMBER_TYPE ||
            argumentStart < cursor ||
            argumentEnd > endIndex
        ) {
            return null;
        }

        normalizedText += originalText.slice(cursor, argumentStart);
        normalizedText += originalText.slice(argumentStart, argumentEnd);
        cursor = argumentEnd;

        if (index >= lastArgumentIndex) {
            continue;
        }

        const nextArgument = node.arguments[index + 1];
        const nextStart = Core.getNodeStartIndex(nextArgument);

        if (typeof nextStart !== NUMBER_TYPE || nextStart < cursor) {
            return null;
        }

        const between = originalText.slice(cursor, nextStart);

        if (between.includes(",")) {
            normalizedText += between;
            cursor = nextStart;
            continue;
        }

        const trimmedBetween = between.trim();

        if (trimmedBetween.length === 0) {
            const previousChar =
                cursor > startIndex ? originalText[cursor - 1] : "";
            const nextChar =
                nextStart < originalText.length ? originalText[nextStart] : "";

            if (
                Core.isNumericLiteralBoundaryCharacter(previousChar) &&
                Core.isNumericLiteralBoundaryCharacter(nextChar)
            ) {
                normalizedText += `,${between}`;
                cursor = nextStart;
                insertedSeparator = true;
                continue;
            }
        }

        normalizedText += between;
        cursor = nextStart;
    }

    normalizedText += originalText.slice(cursor, endIndex);

    return insertedSeparator ? normalizedText : null;
}

function getPreferredFunctionParameterName(path, node, options) {
    const context = findFunctionParameterContext(path);
    if (context) {
        const { functionNode, paramIndex } = context;
        if (!functionNode || !Number.isInteger(paramIndex) || paramIndex < 0) {
            return null;
        }

        const params = getFunctionParams(functionNode);
        if (paramIndex >= params.length) {
            return null;
        }

        const identifier = Core.getIdentifierFromParameterNode(paramIndex);
        const currentName =
            (identifier && typeof identifier.name === STRING_TYPE
                ? identifier.name
                : null) ??
            (node && typeof node.name === STRING_TYPE ? node.name : null);

        const preferredName = resolvePreferredParameterName(
            functionNode,
            paramIndex,
            currentName,
            options
        );

        if (Core.isNonEmptyString(preferredName)) {
            return preferredName;
        }

        return null;
    }

    if (!node || typeof node.name !== STRING_TYPE) {
        return null;
    }

    const argumentIndex = Core.getArgumentIndexFromIdentifier(node.name);
    if (!Number.isInteger(argumentIndex) || argumentIndex < 0) {
        return null;
    }

    const functionNode = findEnclosingFunctionNode(path);
    if (!functionNode) {
        return null;
    }

    const preferredName = resolvePreferredParameterName(
        functionNode,
        argumentIndex,
        node.name,
        options
    );

    if (Core.isNonEmptyString(preferredName)) {
        return preferredName;
    }

    const params = getFunctionParams(functionNode);
    if (argumentIndex >= params.length) {
        return null;
    }

    const identifier = Core.getIdentifierFromParameterNode(
        params[argumentIndex]
    );
    if (!identifier || typeof identifier.name !== STRING_TYPE) {
        return null;
    }

    const normalizedIdentifier = normalizePreferredParameterName(
        identifier.name
    );
    if (
        normalizedIdentifier &&
        normalizedIdentifier !== node.name &&
        isValidIdentifierName(normalizedIdentifier)
    ) {
        return normalizedIdentifier;
    }

    return null;
}

function resolvePreferredParameterName(
    functionNode,
    paramIndex,
    currentName,
    options
) {
    if (!functionNode || !Number.isInteger(paramIndex) || paramIndex < 0) {
        return null;
    }

    const params = getFunctionParams(functionNode);
    if (paramIndex >= params.length) {
        return null;
    }

    const functionTagName = getFunctionTagParamName(
        functionNode,
        paramIndex,
        options
    );
    const hasRenamableCurrentName =
        typeof currentName === STRING_TYPE &&
        Core.getArgumentIndexFromIdentifier(currentName) !== null;

    if (!hasRenamableCurrentName) {
        return null;
    }

    const preferredSource = resolvePreferredParameterSource(
        functionNode,
        paramIndex,
        currentName,
        options,
        functionTagName
    );

    const normalizedName = normalizePreferredParameterName(preferredSource);
    if (!normalizedName || normalizedName === currentName) {
        return null;
    }

    return isValidIdentifierName(normalizedName) ? normalizedName : null;
}

function resolvePreferredParameterSource(
    functionNode,
    paramIndex,
    currentName,
    options,
    functionTagName
) {
    if (Core.isNonEmptyString(functionTagName)) {
        return functionTagName;
    }

    const docPreferences = Core.preferredParamDocNamesByNode.get(functionNode);
    if (docPreferences?.has(paramIndex)) {
        return docPreferences.get(paramIndex) ?? null;
    }

    const implicitEntries = Core.collectImplicitArgumentDocNames(
        functionNode,
        options
    );
    if (!Array.isArray(implicitEntries)) {
        return null;
    }

    const implicitEntry = implicitEntries.find(
        (entry) => entry && entry.index === paramIndex
    );
    if (!implicitEntry) {
        return null;
    }

    if (implicitEntry.canonical) {
        return implicitEntry.name || implicitEntry.canonical;
    }

    if (implicitEntry.name && implicitEntry.name !== currentName) {
        return implicitEntry.name;
    }

    return null;
}

function getFunctionTagParamName(functionNode, paramIndex, options) {
    if (!functionNode || !Number.isInteger(paramIndex) || paramIndex < 0) {
        return null;
    }

    const orderedParamNames = Array.isArray(
        functionNode?._functionTagParamNames
    )
        ? functionNode._functionTagParamNames
        : null;
    if (
        orderedParamNames &&
        paramIndex < orderedParamNames.length &&
        Core.isNonEmptyString(orderedParamNames[paramIndex])
    ) {
        return orderedParamNames[paramIndex];
    }

    const docComments = Array.isArray(functionNode.docComments)
        ? functionNode.docComments
        : Array.isArray(functionNode.comments)
          ? functionNode.comments
          : null;
    if (!Array.isArray(docComments) || docComments.length === 0) {
        return null;
    }

    const lineCommentOptions = Core.resolveLineCommentOptions(options);
    const formattingOptions = {
        ...lineCommentOptions,
        originalText: options?.originalText
    };

    for (const comment of docComments) {
        const formatted = Core.formatLineComment(comment, formattingOptions);
        const rawValue =
            formatted ??
            (typeof comment?.value === "string" ? comment.value : null);
        if (!Core.isNonEmptyString(rawValue)) {
            continue;
        }

        const params = Core.extractFunctionTagParams(rawValue);
        if (params.length === 0) {
            continue;
        }

        return paramIndex < params.length ? params[paramIndex] : null;
    }

    const originalText = options?.originalText;
    if (typeof originalText === STRING_TYPE) {
        const functionStart = Core.getNodeStartIndex(functionNode);
        if (typeof functionStart === NUMBER_TYPE) {
            const prefix = originalText.slice(0, functionStart);
            const lastDocIndex = prefix.lastIndexOf("///");
            if (lastDocIndex !== -1) {
                const docBlock = prefix.slice(lastDocIndex);
                const lines = docBlock.split(/\r\n|\n|\r/);
                for (const line of lines) {
                    const params = Core.extractFunctionTagParams(line);
                    if (params.length > 0) {
                        return paramIndex < params.length
                            ? params[paramIndex]
                            : null;
                    }
                }
            }
        }
    }

    return null;
}

function findEnclosingFunctionNode(path) {
    if (!path || typeof path.getParentNode !== "function") {
        return null;
    }

    for (let depth = 0; ; depth += 1) {
        const parent =
            depth === 0 ? path.getParentNode() : path.getParentNode(depth);
        if (!parent) {
            break;
        }

        if (Core.isFunctionLikeDeclaration(parent)) {
            return parent;
        }
    }

    return null;
}

function findFunctionParameterContext(path) {
    if (!path || typeof path.getParentNode !== "function") {
        return null;
    }

    let candidate = path.getValue();
    for (let depth = 0; ; depth += 1) {
        const parent =
            depth === 0 ? path.getParentNode() : path.getParentNode(depth);
        if (!parent) {
            break;
        }

        if (parent.type === "DefaultParameter") {
            candidate = parent;
            continue;
        }

        if (
            parent.type === "FunctionDeclaration" ||
            parent.type === "ConstructorDeclaration"
        ) {
            const params = Core.toMutableArray(parent.params);
            const index = params.indexOf(candidate);
            if (index !== -1) {
                return { functionNode: parent, paramIndex: index };
            }
        }

        candidate = parent;
    }

    return null;
}

function shouldOmitParameterAlias(declarator, functionNode, options) {
    if (
        !declarator ||
        declarator.type !== "VariableDeclarator" ||
        !declarator.id ||
        declarator.id.type !== "Identifier" ||
        !declarator.init ||
        declarator.init.type !== "Identifier"
    ) {
        return false;
    }

    const argumentIndex = Core.getArgumentIndexFromIdentifier(
        declarator.init.name
    );
    if (argumentIndex === null) {
        return false;
    }

    const preferredName = resolvePreferredParameterName(
        functionNode,
        argumentIndex,
        declarator.init.name,
        options
    );

    const normalizedAlias = normalizePreferredParameterName(declarator.id.name);
    if (!normalizedAlias) {
        return false;
    }

    if (!functionNode) {
        return false;
    }

    const params = getFunctionParams(functionNode);
    if (argumentIndex < 0 || argumentIndex >= params.length) {
        return false;
    }

    const identifier = Core.getIdentifierFromParameterNode(
        params[argumentIndex]
    );
    if (!identifier || typeof identifier.name !== STRING_TYPE) {
        return false;
    }

    const normalizedParamName = normalizePreferredParameterName(
        identifier.name
    );

    if (
        typeof normalizedParamName === STRING_TYPE &&
        normalizedParamName.length > 0 &&
        normalizedParamName === normalizedAlias
    ) {
        return true;
    }

    const normalizedPreferred = preferredName
        ? normalizePreferredParameterName(preferredName)
        : null;

    if (normalizedPreferred && normalizedPreferred === normalizedAlias) {
        return true;
    }

    return false;
}

function isInsideConstructorFunction(path) {
    if (!path || typeof path.getParentNode !== "function") {
        return false;
    }

    let functionAncestorDepth = null;

    for (let depth = 0; ; depth += 1) {
        const ancestor =
            depth === 0 ? path.getParentNode() : path.getParentNode(depth);
        if (!ancestor) {
            break;
        }

        if (
            functionAncestorDepth === null &&
            ancestor.type === "FunctionDeclaration"
        ) {
            const functionParent = path.getParentNode(depth + 1);
            if (!functionParent || functionParent.type !== "BlockStatement") {
                return false;
            }

            functionAncestorDepth = depth;
            continue;
        }

        if (ancestor.type === "ConstructorDeclaration") {
            return functionAncestorDepth !== null;
        }
    }

    return false;
}

function findEnclosingFunctionDeclaration(path) {
    if (!path || typeof path.getParentNode !== "function") {
        return null;
    }

    for (let depth = 0; ; depth += 1) {
        const parent =
            depth === 0 ? path.getParentNode() : path.getParentNode(depth);
        if (!parent) {
            break;
        }

        if (parent.type === "FunctionDeclaration") {
            return parent;
        }
    }

    return null;
}

function shouldSynthesizeUndefinedDefaultForIdentifier(path, node) {
    if (!node || Core.synthesizedUndefinedDefaultParameters.has(node)) {
        return false;
    }

    if (!path || typeof path.getParentNode !== "function") {
        return false;
    }

    const parent = path.getParentNode();
    if (!parent || parent.type !== "FunctionDeclaration") {
        return false;
    }

    const params = getFunctionParams(parent);
    return params.includes(node);
}

function normalizePreferredParameterName(name) {
    if (typeof name !== STRING_TYPE || name.length === 0) {
        return null;
    }

    const canonical = Core.getCanonicalParamNameFromText(name);
    if (canonical && canonical.length > 0) {
        return canonical;
    }

    const normalizedValue = Core.normalizeDocMetadataName(name);
    if (typeof normalizedValue !== STRING_TYPE) {
        return null;
    }

    const normalized = (normalizedValue as string).trim();
    return normalized.length === 0 ? null : normalized;
}

function isValidIdentifierName(name) {
    return (
        typeof name === STRING_TYPE && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)
    );
}

// Collects index/reference bookkeeping for implicit `arguments[index]` usages
// within a function. The traversal tracks alias declarations, direct
// references, and the set of indices that require doc entries so the caller
// can format them without dipping into low-level mutation logic.

function getSourceTextForNode(node, options) {
    if (!node) {
        return null;
    }

    const { originalText, locStart, locEnd } =
        resolvePrinterSourceMetadata(options);

    if (originalText === null) {
        return null;
    }

    const startIndex =
        typeof locStart === "function"
            ? locStart(node)
            : Core.getNodeStartIndex(node);
    const endIndex =
        typeof locEnd === "function"
            ? locEnd(node)
            : Core.getNodeEndIndex(node);

    if (typeof startIndex !== NUMBER_TYPE || typeof endIndex !== NUMBER_TYPE) {
        return null;
    }

    if (endIndex <= startIndex) {
        return null;
    }

    return originalText.slice(startIndex, endIndex).trim();
}

// Convert parser-side `param.default` assignments into explicit
// DefaultParameter nodes so downstream printing and doc-synthesis logic
// sees the parameter as defaulted. The parser transform `preprocessFunctionArgumentDefaults`
// sets `param.default` on Identifier params; materialize those here.
function materializeParamDefaultsFromParamDefault(functionNode) {
    if (!functionNode || functionNode.type !== "FunctionDeclaration") {
        return;
    }

    if (
        !Array.isArray(functionNode.params) ||
        functionNode.params.length === 0
    ) {
        return;
    }

    for (let i = 0; i < functionNode.params.length; i += 1) {
        const param = functionNode.params[i];
        if (!param || typeof param !== OBJECT_TYPE) {
            continue;
        }

        // If the parser stored a `.default` on an Identifier param, convert
        // it into a DefaultParameter node that the printer already knows how
        // to consume. Avoid touching nodes that are already DefaultParameter.
        if (param.type === "Identifier" && param.default !== null) {
            try {
                const defaultExpr = param.default;
                const defaultNode = {
                    type: "DefaultParameter",
                    left: param,
                    right: defaultExpr
                };
                if (param.leadingComments) {
                    (defaultNode as any).leadingComments =
                        param.leadingComments;
                }
                if (param.trailingComments) {
                    (defaultNode as any).trailingComments =
                        param.trailingComments;
                }

                // Preserve parser/transforms-provided marker if present. Also
                // explicitly mark parameters whose default expression is an
                // `undefined` sentinel as optional so downstream omission
                // heuristics prefer to preserve the explicit `= undefined`
                // form in printed signatures.
                try {
                    // Preserve parser/transforms-provided marker if present.
                    // Do NOT automatically mark a parameter optional just because
                    // its default expression is the `undefined` sentinel here;
                    // the parser transform is the authoritative source of that
                    // intent. Only propagate an existing marker from the
                    // original param node.
                    if (param._featherOptionalParameter === true) {
                        (defaultNode as any)._featherOptionalParameter = true;
                    }
                } catch {
                    // Ignore errors when copying the optional parameter marker.
                    // If the marker property is absent or inaccessible, the printer
                    // proceeds without marking the parameter as optional. This defensive
                    // behavior prevents the optional-parameter detection logic from
                    // crashing on AST nodes that lack the _featherOptionalParameter
                    // metadata while still propagating the marker when it exists.
                }

                functionNode.params[i] = defaultNode;
            } catch {
                // Non-fatal: if conversion fails, leave param alone.
            }
        }

        // Fallback: if the parser did not provide a `.default` but a prior
        // parameter to the left contains an explicit non-`undefined` default
        // (AssignmentPattern or DefaultParameter with non-undefined RHS),
        // treat this identifier as implicitly optional and materialize an
        // explicit `= undefined` DefaultParameter node. This mirrors the
        // conservative parser transform behaviour but acts as a local
        // safeguard when the parser pipeline didn't materialize the node.
        if (
            param.type === "Identifier" &&
            param.default == null &&
            hasExplicitDefaultToLeft(functionNode, i)
        ) {
            const defaultNode = {
                type: "DefaultParameter",
                left: { type: "Identifier", name: param.name },
                // Use a Literal sentinel here so the printed shape
                // and downstream checks observe `value: "undefined"`.
                right: { type: "Literal", value: "undefined" }
            };
            // Do not mark synthesized trailing `= undefined` defaults as optional
            // here. Optionality markers should originate from the parser's transform
            // pipeline or from explicit JSDoc @param annotations, not from the
            // printer's fallback logic. Keeping the optionality decision upstream
            // ensures that downstream heuristics (doc comment generation, Feather
            // fixes, etc.) observe a consistent model of which parameters are truly
            // optional versus which are merely receiving fallback defaults.
            functionNode.params[i] = defaultNode;
        }

        // If the parser already created a DefaultParameter but left the `right`
        // slot null (common when the parser emits an in-body argument_count
        // fallback rather than materializing the default expression), try to
        // locate the fallback in the function body and fill it in so the
        // printer and doc synthesizer can observe the default value.
        if (param.type === "DefaultParameter" && param.right == null) {
            try {
                const paramName =
                    param.left && param.left.type === "Identifier"
                        ? param.left.name
                        : null;
                if (!paramName) continue;

                const body = functionNode.body;
                if (
                    !body ||
                    body.type !== "BlockStatement" ||
                    !Array.isArray(body.body)
                ) {
                    continue;
                }

                const fallback = locateDefaultParameterFallback(
                    body.body,
                    paramName
                );
                if (!fallback) {
                    continue;
                }

                // Fill in the missing right side of the DefaultParameter
                param.right = fallback.fallback;
                if (fallback.fallback && fallback.fallback.end !== null) {
                    param.end = fallback.fallback.end;
                }
                // Do NOT set the _featherOptionalParameter marker here.
                // The parser-transform is the authoritative source for
                // optional parameter intent. If the parser produced
                // the marker it will already be present on the param
                // (and copied when materialized above).
                // Remove the matched statement from the body
                const idx = body.body.indexOf(fallback.statement);
                if (idx !== -1) {
                    body.body.splice(idx, 1);
                }
            } catch {
                // Non-fatal — leave the param as-is.
            }
        }
    }
}

function locateDefaultParameterFallback(
    statements: Array<any>,
    paramName: string
): {
    fallback: any;
    statement: any;
} | null {
    for (const stmt of statements) {
        const guard = describeArgumentGuard(stmt);
        if (!guard) {
            continue;
        }

        if (
            !hasArgumentAssignment(guard.consequent, paramName, guard.argIndex)
        ) {
            continue;
        }

        const fallback = findFallbackAssignment(guard.alternate, paramName);
        if (!fallback) {
            continue;
        }

        return { fallback, statement: stmt };
    }

    return null;
}

function describeArgumentGuard(stmt: any) {
    if (!stmt || stmt.type !== "IfStatement") {
        return null;
    }

    const test = getGuardBinaryExpression(stmt.test);
    if (!test) {
        return null;
    }

    const argIndex = deriveArgumentIndex(test);
    if (!Number.isInteger(argIndex) || argIndex < 0) {
        return null;
    }

    return {
        argIndex,
        consequent: flattenStatementList(stmt.consequent),
        alternate: flattenStatementList(stmt.alternate)
    };
}

function getGuardBinaryExpression(test: any) {
    if (!test) {
        return null;
    }

    if (test.type === "BinaryExpression") {
        return test;
    }

    if (
        test.type === "ParenthesizedExpression" &&
        test.expression &&
        test.expression.type === "BinaryExpression"
    ) {
        return test.expression;
    }

    return null;
}

function deriveArgumentIndex(test: any) {
    if (!test || test.type !== "BinaryExpression") {
        return null;
    }

    const right = test.right;
    if (!right || right.type !== "Literal") {
        return null;
    }

    const rightNumber = Number(String(right.value));
    if (!Number.isInteger(rightNumber)) {
        return null;
    }

    switch (test.operator) {
        case ">": {
            return rightNumber;
        }
        case "<": {
            return rightNumber - 1;
        }
        case "==":
        case "===": {
            return rightNumber;
        }
        default: {
            return null;
        }
    }
}

function flattenStatementList(node: any) {
    if (!node) {
        return [];
    }

    if (node.type === "BlockStatement") {
        return Array.isArray(node.body) ? node.body : [];
    }

    return [node];
}

function hasArgumentAssignment(
    statements: Array<any>,
    paramName: string,
    argIndex: number
) {
    for (const statement of statements) {
        const assign = getAssignmentExpression(statement);
        if (!assign) {
            continue;
        }

        if (isArgumentAssignment(assign, paramName, argIndex)) {
            return true;
        }
    }

    return false;
}

function findFallbackAssignment(statements: Array<any>, paramName: string) {
    for (const statement of statements) {
        const assign = getAssignmentExpression(statement);
        if (!assign) {
            continue;
        }

        if (
            assign.left &&
            assign.left.type === "Identifier" &&
            assign.left.name === paramName &&
            (!assign.right || assign.right.type !== "MemberIndexExpression")
        ) {
            return assign.right ?? null;
        }
    }

    return null;
}

function getAssignmentExpression(node: any) {
    if (!node) {
        return null;
    }

    if (
        node.type === "ExpressionStatement" &&
        node.expression &&
        node.expression.type === "AssignmentExpression"
    ) {
        return node.expression;
    }

    if (node.type === "AssignmentExpression") {
        return node;
    }

    return null;
}

function isArgumentAssignment(
    assign: any,
    paramName: string,
    argIndex: number
) {
    const left = assign.left;
    if (!left || left.type !== "Identifier" || left.name !== paramName) {
        return false;
    }

    const rightExpr = assign.right;
    if (!rightExpr || rightExpr.type !== "MemberIndexExpression") {
        return false;
    }

    if (
        rightExpr.object?.type !== "Identifier" ||
        rightExpr.object.name !== "argument"
    ) {
        return false;
    }

    if (!Array.isArray(rightExpr.property)) {
        return false;
    }

    if (rightExpr.property.length !== 1) {
        return false;
    }

    const literal = rightExpr.property[0];
    if (!literal || literal.type !== "Literal") {
        return false;
    }

    const parsed = Number.parseInt(literal.value, 10);
    return Number.isInteger(parsed) && parsed === argIndex;
}

function shouldPreserveCompactUpdateAssignmentSpacing(path, options) {
    if (
        !path ||
        typeof path.getValue !== "function" ||
        typeof path.getParentNode !== "function"
    ) {
        return false;
    }

    const node = path.getValue();
    if (!node || node.type !== "AssignmentExpression") {
        return false;
    }

    if (node.operator === "=") {
        return false;
    }

    const parent = path.getParentNode();
    if (parent?.type !== "ForStatement") {
        return false;
    }

    if (callPathMethod(path, "getName") !== "update") {
        return false;
    }

    const source = getSourceTextForNode(node, options);
    if (typeof source !== STRING_TYPE || source.length === 0) {
        return false;
    }

    const operatorIndex = source.indexOf(node.operator);
    if (operatorIndex <= 0) {
        return false;
    }

    const beforeChar = source[operatorIndex - 1] ?? "";
    if (/\s/.test(beforeChar)) {
        return false;
    }

    const afterChar = source[operatorIndex + node.operator.length] ?? "";
    if (/\s/.test(afterChar)) {
        return false;
    }

    return true;
}

function structLiteralHasLeadingLineBreak(node, options) {
    if (!node) {
        return false;
    }

    const originalText = getOriginalTextFromOptions(options);

    if (!Core.isNonEmptyArray(node.properties)) {
        return false;
    }

    const { start, end } = Core.getNodeRangeIndices(node);
    const source = sliceOriginalText(originalText, start, end);
    if (source === null) {
        return false;
    }
    const openBraceIndex = source.indexOf("{");
    if (openBraceIndex === -1) {
        return false;
    }

    for (let index = openBraceIndex + 1; index < source.length; index += 1) {
        const character = source[index];

        if (character === "\n") {
            return true;
        }

        if (character === "\r") {
            if (source[index + 1] === "\n") {
                return true;
            }
            return true;
        }

        if (character.trim() === "") {
            continue;
        }

        if (character === "/") {
            const lookahead = source[index + 1];

            if (lookahead === "/") {
                const result = consumeSingleLineComment(source, index + 2);
                if (result.foundLineBreak) {
                    return true;
                }
                index = result.index;
                continue;
            }

            if (lookahead === "*") {
                const result = consumeBlockComment(source, index + 2);
                if (result.foundLineBreak) {
                    return true;
                }
                index = result.index;
                continue;
            }
        }

        if (character === "}") {
            return false;
        }

        return false;
    }

    return false;
}

function consumeSingleLineComment(source, startIndex) {
    let current = startIndex;
    while (current < source.length) {
        const commentChar = source[current];
        if (commentChar === "\n") {
            return { index: current, foundLineBreak: true };
        }
        if (commentChar === "\r") {
            return { index: current + 1, foundLineBreak: true };
        }

        current += 1;
    }

    return { index: current, foundLineBreak: false };
}

function consumeBlockComment(source, startIndex) {
    let current = startIndex;
    while (current < source.length - 1) {
        const commentChar = source[current];
        if (commentChar === "\n") {
            return { index: current, foundLineBreak: true };
        }
        if (commentChar === "\r") {
            return { index: current + 1, foundLineBreak: true };
        }

        if (commentChar === "*" && source[current + 1] === "/") {
            return { index: current + 1, foundLineBreak: false };
        }

        current += 1;
    }

    return { index: current, foundLineBreak: false };
}

function getStructPropertyPrefix(node, options) {
    if (!node) {
        return null;
    }

    const originalText = getOriginalTextFromOptions(options);

    const propertyStart = Core.getNodeStartIndex(node);
    const valueStart = Core.getNodeStartIndex(node?.value);

    const prefix = sliceOriginalText(originalText, propertyStart, valueStart);

    if (!prefix || !prefix.includes(":")) {
        return null;
    }

    const colonIndex = prefix.indexOf(":");
    const beforeColon = prefix.slice(0, colonIndex);
    const afterColon = prefix.slice(colonIndex + 1);
    const hasWhitespaceBefore = /\s$/.test(beforeColon);
    const hasWhitespaceAfter = /^\s/.test(afterColon);

    if (!hasWhitespaceBefore && !hasWhitespaceAfter) {
        return null;
    }

    return prefix;
}

function shouldOmitDefaultValueForParameter(path, options) {
    const node = path.getValue();
    if (!node || node.type !== "DefaultParameter") {
        return false;
    }

    // If original source text is available, prefer explicit doc comment
    // cues directly preceding the function declaration. A doc-line
    // `/// @param name` (without brackets) should cause an accompanying
    // `= undefined` default to be omitted; if the doc-line marks the
    // parameter as optional (e.g. `/// @param [name]`) preserve it.
    const functionNode = findEnclosingFunctionDeclaration(path);
    if (functionNode) {
        if (
            Array.isArray(functionNode.docComments) &&
            functionNode.docComments.length > 0
        ) {
            const lines = functionNode.docComments.flatMap((comment) => {
                const value = comment.value || "";
                if (comment.type === "CommentBlock") {
                    return value
                        .split(/\r\n|\n|\r/)
                        .map((line) => `/// ${  line}`);
                }
                return `/// ${  value}`;
            });

            const paramName =
                node.left && node.left.name ? node.left.name : null;
            if (paramName) {
                const optionalDocFlag = getDocParamOptionality(
                    lines,
                    paramName
                );
                if (optionalDocFlag !== null) {
                    return !optionalDocFlag;
                }
            }
        }

        const originalText = getOriginalTextFromOptions(options);
        if (typeof originalText === STRING_TYPE && originalText.length > 0) {
            const fnStart = Core.getNodeStartIndex(functionNode) ?? 0;
            const prefix = originalText.slice(0, fnStart);
            // Scan backwards for doc comments, handling mixed styles and block comments
            const lines = prefix.split(/\r\n|\n|\r/);
            const docLines = [];

            for (let i = lines.length - 1; i >= 0; i--) {
                const line = lines[i].trim();
                if (line === "") {
                    continue;
                }

                if (line.startsWith("///")) {
                    docLines.unshift(line);
                } else if (line.startsWith("/*") && line.endsWith("*/")) {
                    const content = line.slice(2, -2).trim();
                    docLines.unshift(`/// ${  content}`);
                } else if (line.startsWith("//")) {
                    if (line.includes("@param") || line.includes("@function")) {
                        docLines.unshift(
                            `/// ${  line.replace(/^\/+/, "").trim()}`
                        );
                    }
                } else {
                    break;
                }
            }

            if (docLines.length > 0) {
                const paramName =
                    node.left && node.left.name ? node.left.name : null;
                if (paramName) {
                    const optionalDocFlag = getDocParamOptionality(
                        docLines,
                        paramName
                    );
                    if (optionalDocFlag !== null) {
                        return !optionalDocFlag;
                    }
                }
            }
        }
    }

    // If the parameter currently has no `right` expression it is a parser-
    // side placeholder for a default. Treat this as an explicit undefined
    // default for printing purposes so the signature remains explicit.
    if (node.right == null) {
        return false;
    }

    // Preserve synthesized materialized trailing `undefined` defaults in
    // signatures even when docs are conservative about optionality. The
    // parser marks materialized trailing undefined defaults with
    // `_featherMaterializedTrailingUndefined`. When present, prefer to
    // keep the explicit `= undefined` signature rather than omitting it.
    try {
        if (node._featherMaterializedTrailingUndefined === true) {
            return false;
        }
    } catch {
        // swallow
    }

    if (
        !Core.isUndefinedSentinel(node.right) ||
        typeof path.getParentNode !== "function"
    ) {
        return false;
    }

    // fallback: follow the existing ancestor-based heuristic when no
    // explicit doc cue is available. If a parameter was explicitly marked
    // by parser-side transforms as optional, preserve it.
    if (node._featherOptionalParameter === true) {
        return false;
    }

    let depth = 0;
    while (true) {
        const ancestor =
            depth === 0 ? path.getParentNode() : path.getParentNode(depth);
        if (!ancestor) {
            break;
        }

        if (shouldOmitUndefinedDefaultForFunctionNode(ancestor)) {
            // Omit undefined defaults for plain function declarations by
            // default unless they were intentionally preserved via parser
            // intent (the `_featherOptionalParameter` marker handled above)
            return true;
        }

        depth += 1;
    }

    return false;
}

function getDocParamOptionality(lines, paramName) {
    for (let i = lines.length - 1; i >= 0; i -= 1) {
        const line = lines[i];
        const match = line.match(
            /\/{3,}\s*@param\s*(?:\{[^}]+\}\s*)?(\[[^\]]+\]|\S+)/i
        );
        if (!match) {
            continue;
        }
        const raw = match[1];
        const normalized = normalizeDocParamNameFromRaw(raw);
        console.log(
            `Checking param: ${paramName}, raw: ${raw}, normalized: ${normalized}`
        );
        if (normalized === paramName) {
            return (
                /^\[.*\]$/.test(raw) || raw.endsWith("*") || raw.startsWith("*")
            );
        }
    }
    return null;
}

function normalizeDocParamNameFromRaw(raw) {
    let name = raw;
    if (name.startsWith("[")) {
        name = name.slice(1);
    }
    if (name.endsWith("]")) {
        name = name.slice(0, -1);
    }
    if (name.endsWith("*")) {
        name = name.slice(0, -1);
    }
    if (name.startsWith("*")) {
        name = name.slice(1);
    }
    return name.trim();
}

function hasExplicitDefaultToLeft(functionNode, paramIndex) {
    if (
        !functionNode ||
        !Array.isArray(functionNode.params) ||
        !Number.isInteger(paramIndex) ||
        paramIndex <= 0
    ) {
        return false;
    }

    for (let index = 0; index < paramIndex; index += 1) {
        const candidate = functionNode.params[index];
        if (!candidate) {
            continue;
        }

        if (candidate.type === "DefaultParameter") {
            const isUndefined =
                typeof Core.isUndefinedSentinel === "function"
                    ? Core.isUndefinedSentinel(candidate.right)
                    : false;

            if (!isUndefined) {
                return true;
            }

            continue;
        }

        if (candidate.type === "AssignmentPattern") {
            return true;
        }
    }

    return false;
}

function shouldOmitUndefinedDefaultForFunctionNode(functionNode) {
    if (!functionNode || !functionNode.type) {
        return false;
    }

    if (
        functionNode.type === "ConstructorDeclaration" ||
        functionNode.type === "ConstructorParentClause"
    ) {
        return false;
    }

    return functionNode.type === "FunctionDeclaration";
}

function printBooleanReturnIf(path, print) {
    const node = path.getValue();
    if (
        !node ||
        node.type !== "IfStatement" ||
        !node.consequent ||
        !node.alternate ||
        Core.hasComment(node)
    ) {
        return null;
    }

    const consequentReturn = getBooleanReturnBranch(node.consequent);
    const alternateReturn = getBooleanReturnBranch(node.alternate);

    if (!consequentReturn || !alternateReturn) {
        return null;
    }

    if (consequentReturn.value === alternateReturn.value) {
        return null;
    }

    const conditionDoc = printWithoutExtraParens(path, print, "test");
    const conditionNode = node.test;

    const argumentDoc =
        consequentReturn.value === "true"
            ? conditionDoc
            : negateExpressionDoc(conditionDoc, conditionNode);

    return concat([
        "return ",
        argumentDoc,
        optionalSemicolon("ReturnStatement")
    ]);
}

function getBooleanReturnBranch(branchNode) {
    if (!branchNode) {
        return null;
    }

    if (branchNode.type === "BlockStatement") {
        const onlyStatement = Core.getSingleBodyStatement(branchNode);
        if (!onlyStatement || onlyStatement.type !== "ReturnStatement") {
            return null;
        }

        return getBooleanReturnStatementInfo(onlyStatement);
    }

    if (branchNode.type === "ReturnStatement") {
        return getBooleanReturnStatementInfo(branchNode);
    }

    return null;
}

/**
 * Builds the document representation for an if statement, ensuring that the
 * orchestration logic in the main printer delegates the clause assembly and
 * alternate handling to a single abstraction layer.
 */
function buildIfStatementDoc(path, options, print, node) {
    const parts: any[] = [
        printSingleClauseStatement(
            path,
            options,
            print,
            "if",
            "test",
            "consequent"
        )
    ];

    const elseDoc = buildIfAlternateDoc(path, options, print, node);
    if (elseDoc) {
        parts.push([" else ", elseDoc]);
    }

    return concat(parts);
}

function buildIfAlternateDoc(path, options, print, node) {
    if (!node || node.alternate === null) {
        return null;
    }

    const alternateNode = node.alternate;

    if (alternateNode.type === "IfStatement") {
        // Keep chained `else if` statements unwrapped. Printing the alternate
        // with braces would produce `else { if (...) ... }`, which breaks the
        // cascade that GameMaker expects, introduces an extra block for the
        // runtime to evaluate, and diverges from the control-structure style
        // documented in the GameMaker manual (see https://manual.gamemaker.io/monthly/en/#t=GML_Overview%2FGML_Syntax.htm%23ElseIf).
        // By delegating directly to the child printer we preserve the
        // flattened `else if` ladder that authors wrote and that downstream
        // tools rely on when parsing the control flow.
        return print("alternate");
    }

    if (shouldPrintBlockAlternateAsElseIf(alternateNode)) {
        return path.call(
            (alternatePath) => alternatePath.call(print, "body", 0),
            "alternate"
        );
    }

    return printInBlock(path, options, print, "alternate");
}

function getBooleanReturnStatementInfo(returnNode) {
    if (!returnNode || Core.hasComment(returnNode)) {
        return null;
    }

    const argument = returnNode.argument;
    if (
        !argument ||
        Core.hasComment(argument) ||
        !Core.isBooleanLiteral(argument)
    ) {
        return null;
    }

    return { value: argument.value.toLowerCase() };
}

function simplifyBooleanBinaryExpression(path, print, node) {
    if (!node) {
        return null;
    }

    if (node.operator !== "==" && node.operator !== "!=") {
        return null;
    }

    const leftBoolean = Core.isBooleanLiteral(node.left);
    const rightBoolean = Core.isBooleanLiteral(node.right);

    if (!leftBoolean && !rightBoolean) {
        return null;
    }

    const booleanNode = leftBoolean ? node.left : node.right;
    const expressionKey = leftBoolean ? "right" : "left";
    const expressionNode = leftBoolean ? node.right : node.left;
    const expressionDoc = printWithoutExtraParens(path, print, expressionKey);
    const isEquality = node.operator === "==";
    const isTrue = booleanNode.value.toLowerCase() === "true";

    if (isTrue) {
        return isEquality
            ? expressionDoc
            : negateExpressionDoc(expressionDoc, expressionNode);
    }

    return isEquality
        ? negateExpressionDoc(expressionDoc, expressionNode)
        : expressionDoc;
}

function applyTrigonometricFunctionSimplification(path) {
    const node = path.getValue();
    if (!node || node.type !== "CallExpression") {
        return;
    }

    simplifyTrigonometricCall(node);
}

function simplifyTrigonometricCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (Core.hasComment(node)) {
        return false;
    }

    const identifierName = Core.getIdentifierText(node.object);
    if (!identifierName) {
        return false;
    }

    const normalizedName = identifierName.toLowerCase();

    if (applyInnerDegreeWrapperConversion(node, normalizedName)) {
        return true;
    }

    if (normalizedName === "degtorad") {
        return applyOuterTrigConversion(node, DEGREE_TO_RADIAN_CONVERSIONS);
    }

    if (normalizedName === "radtodeg") {
        return applyOuterTrigConversion(node, RADIAN_TO_DEGREE_CONVERSIONS);
    }

    return false;
}

function applyInnerDegreeWrapperConversion(node, functionName) {
    const mapping = RADIAN_TRIG_TO_DEGREE.get(functionName);
    if (!mapping) {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);
    if (args.length !== 1) {
        return false;
    }

    const [firstArg] = args;
    if (
        !Core.isCallExpressionIdentifierMatch(firstArg, "degtorad", {
            caseInsensitive: true
        })
    ) {
        return false;
    }

    if (Core.hasComment(firstArg)) {
        return false;
    }

    const wrappedArgs = Core.getCallExpressionArguments(firstArg);
    if (wrappedArgs.length !== 1) {
        return false;
    }

    updateCallExpressionNameAndArgs(node, mapping, wrappedArgs);
    return true;
}

function applyOuterTrigConversion(node, conversionMap) {
    const args = Core.getCallExpressionArguments(node);
    if (args.length !== 1) {
        return false;
    }

    const [firstArg] = args;
    if (!firstArg || firstArg.type !== "CallExpression") {
        return false;
    }

    if (Core.hasComment(firstArg)) {
        return false;
    }

    const innerName = Core.getIdentifierText(firstArg.object);
    if (typeof innerName !== STRING_TYPE) {
        return false;
    }

    const mapping = conversionMap.get(innerName.toLowerCase());
    if (!mapping) {
        return false;
    }

    const innerArgs = Core.getCallExpressionArguments(firstArg);
    if (
        typeof mapping.expectedArgs === NUMBER_TYPE &&
        innerArgs.length !== mapping.expectedArgs
    ) {
        return false;
    }

    updateCallExpressionNameAndArgs(node, mapping.name, innerArgs);
    return true;
}

function updateCallExpressionNameAndArgs(node, newName, newArgs) {
    if (!node || node.type !== "CallExpression") {
        return;
    }

    if (!node.object || node.object.type !== "Identifier") {
        node.object = { type: "Identifier", name: newName };
    } else {
        node.object.name = newName;
    }

    node.arguments = Core.toMutableArray(newArgs, { clone: true });
}

function negateExpressionDoc(expressionDoc, expressionNode) {
    if (needsParensForNegation(expressionNode)) {
        return group(["!", "(", expressionDoc, ")"]);
    }
    return group(["!", expressionDoc]);
}

function needsParensForNegation(node) {
    if (!node) {
        return true;
    }

    if (node.type === "ParenthesizedExpression") {
        return needsParensForNegation(node.expression);
    }

    return [
        "BinaryExpression",
        "AssignmentExpression",
        "TernaryExpression",
        "LogicalExpression"
    ].includes(node.type);
}

function shouldPrefixGlobalIdentifier(path) {
    const node = path.getValue();
    if (!node || !node.isGlobalIdentifier) return false;

    const parent = path.getParentNode();
    if (!parent) return true;

    const type = parent.type;

    if (type === "MemberDotExpression" && parent.property === node)
        return false;
    if ((type === "Property" || type === "EnumMember") && parent.name === node)
        return false;
    if (
        (type === "VariableDeclarator" ||
            type === "FunctionDeclaration" ||
            type === "ConstructorDeclaration" ||
            type === "ConstructorParentClause") &&
        parent.id === node
    ) {
        return false;
    }

    return true;
}

function docHasTrailingComment(doc) {
    if (Core.isNonEmptyArray(doc)) {
        const lastItem = doc.at(-1);
        if (Core.isNonEmptyArray(lastItem)) {
            const commentArr = lastItem[0];
            if (Core.isNonEmptyArray(commentArr)) {
                return commentArr.some((item) => {
                    return (
                        typeof item === STRING_TYPE &&
                        (item.startsWith("//") || item.startsWith("/*"))
                    );
                });
            }
        }
    }
    return false;
}

function getManualMathRatio(node) {
    if (!node || typeof node !== OBJECT_TYPE) {
        return null;
    }

    const direct = node._gmlManualMathRatio;
    if (typeof direct === STRING_TYPE && direct.length > 0) {
        return direct;
    }

    switch (node.type) {
        case "VariableDeclaration": {
            const declarations = Array.isArray(node.declarations)
                ? node.declarations
                : [];

            for (const declarator of declarations) {
                const ratio = getManualMathRatio(declarator);
                if (ratio) {
                    return ratio;
                }
            }
            break;
        }
        case "VariableDeclarator": {
            return getManualMathRatio(node.init);
        }
        case "ExpressionStatement": {
            return getManualMathRatio(node.expression);
        }
        case "BinaryExpression": {
            return getManualMathRatio(node.right);
        }
        case "Literal": {
            if (typeof node._gmlManualMathRatio === STRING_TYPE) {
                return node._gmlManualMathRatio;
            }
            break;
        }
        default: {
            break;
        }
    }

    return null;
}

function printWithoutExtraParens(path, print, ...keys) {
    return path.call(
        (childPath) => unwrapParenthesizedExpression(childPath, print),
        ...keys
    );
}

function getBinaryOperatorInfo(operator) {
    return operator === undefined
        ? undefined
        : BINARY_OPERATOR_INFO.get(operator);
}

function shouldOmitSyntheticParens(path) {
    const node = callPathMethod(path, "getValue", { defaultValue: null });
    if (!node || node.type !== "ParenthesizedExpression") {
        return false;
    }

    // Focus on synthetic parentheses (those inserted by the parser or formatter for
    // precedence disambiguation) rather than explicit parentheses written by the
    // user. Removing user-written parentheses could alter intended grouping or
    // emphasis, while synthetic ones exist solely to clarify operator precedence
    // and can be safely omitted when the context makes precedence unambiguous.
    const isSynthetic = node.synthetic === true;

    const parent = callPathMethod(path, "getParentNode", {
        defaultValue: null
    });
    if (!parent) {
        return false;
    }

    const parentKey = callPathMethod(path, "getName");
    const expression = node.expression;

    if (
        shouldStripStandaloneAdditiveParentheses(parent, parentKey, expression)
    ) {
        return true;
    }

    // For ternary expressions, omit unnecessary parentheses around simple
    // identifiers or member expressions in the test position
    if (parent.type === "TernaryExpression") {
        if (
            parentKey === "test" && // Trim redundant parentheses when the ternary guard is just a bare
            // identifier or property lookup. The parser faithfully records the
            // author-supplied parens as a `ParenthesizedExpression`, so without
            // this branch the printer would emit `(foo) ?` style guards that look
            // like extra precedence handling. The formatter's ternary examples in
            // README.md#formatter-at-a-glance promise minimal grouping, and
            // teams lean on that contract when reviewing formatter diffs. We keep
            // the removal scoped to trivially safe shapes so we do not second-
            // guess parentheses that communicate evaluation order for compound
            // boolean logic or arithmetic.
            (expression?.type === "Identifier" ||
                expression?.type === "MemberDotExpression" ||
                expression?.type === "MemberIndexExpression")
        ) {
            return true;
        }
        return false;
    }

    // For non-ternary cases, only process synthetic parentheses
    if (!isSynthetic) {
        return shouldFlattenMultiplicationChain(parent, expression, path);
    }

    if (parent.type === "CallExpression") {
        if (
            !isSyntheticParenFlatteningEnabled(path) ||
            !isNumericCallExpression(parent)
        ) {
            return false;
        }

        if (expression?.type !== "BinaryExpression") {
            return false;
        }

        if (!isNumericComputationNode(expression)) {
            return false;
        }

        if (binaryExpressionContainsString(expression)) {
            return false;
        }

        const sanitizedMacroNames = getSanitizedMacroNames(path);
        if (
            sanitizedMacroNames &&
            expressionReferencesSanitizedMacro(expression, sanitizedMacroNames)
        ) {
            return false;
        }

        return true;
    }

    if (parent.type !== "BinaryExpression") {
        return false;
    }

    if (!isSyntheticParenFlatteningEnabled(path)) {
        return false;
    }

    const parentInfo = getBinaryOperatorInfo(parent.operator);
    if (
        expression?.type === "BinaryExpression" &&
        shouldFlattenSyntheticBinary(parent, expression, path)
    ) {
        return true;
    }

    if (expression?.type === "BinaryExpression" && parentInfo !== undefined) {
        const childInfo = getBinaryOperatorInfo(expression.operator);

        if (
            childInfo !== undefined &&
            childInfo.precedence > parentInfo.precedence
        ) {
            if (
                (parent.operator === "&&" ||
                    parent.operator === "and" ||
                    parent.operator === "||" ||
                    parent.operator === "or") &&
                Core.isComparisonBinaryOperator(expression.operator) &&
                isControlFlowLogicalTest(path)
            ) {
                return true;
            }

            if (isNumericComputationNode(expression)) {
                if (parent.operator === "+" || parent.operator === "-") {
                    const childOperator = expression.operator;
                    const flatteningForced =
                        childOperator === "*"
                            ? isSyntheticParenFlatteningForced(path)
                            : false;

                    if (
                        childOperator === "/" ||
                        childOperator === "div" ||
                        childOperator === "%" ||
                        childOperator === "mod" ||
                        (childOperator === "*" &&
                            !flatteningForced &&
                            !isWithinNumericCallArgument(path) &&
                            !isSelfMultiplicationExpression(expression))
                    ) {
                        return false;
                    }

                    if (
                        parent.operator === "-" &&
                        childOperator === "*" &&
                        !flatteningForced
                    ) {
                        return false;
                    }

                    const sanitizedMacroNames = getSanitizedMacroNames(path);

                    if (
                        sanitizedMacroNames &&
                        (expressionReferencesSanitizedMacro(
                            parent,
                            sanitizedMacroNames
                        ) ||
                            expressionReferencesSanitizedMacro(
                                expression,
                                sanitizedMacroNames
                            ))
                    ) {
                        return false;
                    }

                    return true;
                }

                if (expression.operator === "*") {
                    if (
                        Core.isComparisonBinaryOperator(parent.operator) &&
                        isSelfMultiplicationExpression(expression) &&
                        isComparisonWithinLogicalChain(path)
                    ) {
                        return true;
                    }

                    return false;
                }
            }
        }

        if (shouldFlattenMultiplicationChain(parent, expression, path)) {
            return true;
        }
    }

    if (parent.operator !== "+") {
        return false;
    }

    if (!binaryExpressionContainsString(parent)) {
        return false;
    }

    let depth = 1;
    while (true) {
        const ancestor =
            depth === 1 ? path.getParentNode() : path.getParentNode(depth - 1);
        if (!ancestor) {
            return false;
        }

        if (
            ancestor.type === "ParenthesizedExpression" &&
            ancestor.synthetic !== true
        ) {
            return true;
        }

        depth += 1;
    }
}

function isControlFlowLogicalTest(path) {
    if (!path || typeof path.getParentNode !== "function") {
        return false;
    }

    let depth = 1;
    let currentNode = path.getValue();

    while (true) {
        const ancestor =
            depth === 1 ? path.getParentNode() : path.getParentNode(depth - 1);

        if (!ancestor) {
            return false;
        }

        if (
            ancestor.type === "ParenthesizedExpression" ||
            ancestor.type === "BinaryExpression"
        ) {
            currentNode = ancestor;
            depth += 1;
            continue;
        }

        if (ancestor.type === "IfStatement" && ancestor.test === currentNode) {
            return true;
        }

        if (
            ancestor.type === "WhileStatement" &&
            ancestor.test === currentNode
        ) {
            return true;
        }

        if (
            ancestor.type === "DoUntilStatement" &&
            ancestor.test === currentNode
        ) {
            return true;
        }

        if (
            ancestor.type === "RepeatStatement" &&
            ancestor.test === currentNode
        ) {
            return true;
        }

        if (
            ancestor.type === "WithStatement" &&
            ancestor.test === currentNode
        ) {
            return true;
        }

        if (ancestor.type === "ForStatement" && ancestor.test === currentNode) {
            return true;
        }

        return false;
    }
}

function isComparisonWithinLogicalChain(path) {
    if (!path || typeof path.getParentNode !== "function") {
        return false;
    }

    let depth = 1;
    let currentNode = path.getValue();

    while (true) {
        const ancestor =
            depth === 1 ? path.getParentNode() : path.getParentNode(depth - 1);

        if (!ancestor) {
            return false;
        }

        if (ancestor.type === "ParenthesizedExpression") {
            currentNode = ancestor;
            depth += 1;
            continue;
        }

        if (
            ancestor.type === "BinaryExpression" &&
            Core.isComparisonBinaryOperator(ancestor.operator)
        ) {
            currentNode = ancestor;
            depth += 1;
            continue;
        }

        if (
            ancestor.type === "BinaryExpression" &&
            (ancestor.operator === "&&" ||
                ancestor.operator === "and" ||
                ancestor.operator === "||" ||
                ancestor.operator === "or")
        ) {
            return (
                ancestor.left === currentNode || ancestor.right === currentNode
            );
        }

        return false;
    }
}

function shouldWrapTernaryExpression(path) {
    const parent = callPathMethod(path, "getParentNode", {
        defaultValue: null
    });
    if (!parent) {
        return false;
    }

    if (parent.type === "ParenthesizedExpression") {
        return false;
    }

    const parentKey = callPathMethod(path, "getName");

    if (parent.type === "VariableDeclarator" && parentKey === "init") {
        return true;
    }

    if (parent.type === "AssignmentExpression" && parentKey === "right") {
        return true;
    }

    if (parent.type === "TemplateStringExpression") {
        return true;
    }

    return false;
}

function printTernaryExpressionNode(node, path, options, print) {
    const testDoc = path.call(print, "test");
    const consequentDoc = path.call(print, "consequent");
    const alternateDoc = path.call(print, "alternate");

    const ternaryDoc = group([
        testDoc,
        indent([line, "? ", consequentDoc, line, ": ", alternateDoc])
    ]);

    return shouldWrapTernaryExpression(path)
        ? concat(["(", ternaryDoc, ")"])
        : ternaryDoc;
}

function shouldFlattenSyntheticBinary(parent, expression, path) {
    const parentInfo = getBinaryOperatorInfo(parent.operator);
    const childInfo = getBinaryOperatorInfo(expression.operator);

    if (!parentInfo || !childInfo) {
        return false;
    }

    if (parentInfo.associativity !== "left") {
        return false;
    }

    const parentOperator = parent.operator;
    const childOperator = expression.operator;
    const isAdditivePair =
        (parentOperator === "+" || parentOperator === "-") &&
        (childOperator === "+" || childOperator === "-");
    const isMultiplicativePair =
        parentOperator === "*" && childOperator === "*";
    const isLogicalAndPair =
        (parentOperator === "&&" || parentOperator === "and") &&
        (childOperator === "&&" || childOperator === "and");
    const isLogicalOrPair =
        (parentOperator === "||" || parentOperator === "or") &&
        (childOperator === "||" || childOperator === "or");

    if (
        !isAdditivePair &&
        !isMultiplicativePair &&
        !isLogicalAndPair &&
        !isLogicalOrPair
    ) {
        return false;
    }

    if (
        !isLogicalAndPair &&
        !isLogicalOrPair &&
        (!isNumericComputationNode(parent) ||
            !isNumericComputationNode(expression))
    ) {
        return false;
    }

    if (
        isAdditivePair &&
        (binaryExpressionContainsString(parent) ||
            binaryExpressionContainsString(expression))
    ) {
        return false;
    }

    if (isAdditivePair) {
        const sanitizedMacroNames = getSanitizedMacroNames(path);
        if (
            sanitizedMacroNames &&
            (expressionReferencesSanitizedMacro(parent, sanitizedMacroNames) ||
                expressionReferencesSanitizedMacro(
                    expression,
                    sanitizedMacroNames
                ))
        ) {
            return false;
        }
    }

    const operandName = callPathMethod(path, "getName");
    const isLeftOperand = operandName === "left";
    const isRightOperand = operandName === "right";

    if (!isLeftOperand && !isRightOperand) {
        return false;
    }

    if (childInfo.precedence !== parentInfo.precedence) {
        return false;
    }

    if (isLeftOperand) {
        return true;
    }

    if (
        parentOperator === "+" &&
        (childOperator === "+" || childOperator === "-")
    ) {
        return true;
    }

    if (parentOperator === "*" && childOperator === "*") {
        return true;
    }

    if (
        (parentOperator === "&&" || parentOperator === "and") &&
        (childOperator === "&&" || childOperator === "and")
    ) {
        return true;
    }

    if (
        (parentOperator === "||" || parentOperator === "or") &&
        (childOperator === "||" || childOperator === "or")
    ) {
        return true;
    }

    return false;
}

/**
 * Traverse ancestors to determine if synthetic parenthesis flattening is
 * permitted. Function/constructor declarations with `_flattenSyntheticNumericParens`
 * set to `true` explicitly enable flattening. For Program nodes, the behaviour
 * depends on the {@link requireExplicit} flag:
 *
 * - When `false` (the default), flattening is enabled unless the Program
 *   explicitly disables it via `_flattenSyntheticNumericParens === false`.
 * - When `true`, flattening is only enabled if the Program has the flag
 *   explicitly set to `true`.
 *
 * @param {import("prettier").AstPath} path - AST path to traverse.
 * @param {boolean} [requireExplicit=false] - Whether to require explicit flattening.
 * @returns {boolean} `true` when synthetic paren flattening is permitted.
 */
function checkSyntheticParenFlattening(path, requireExplicit = false) {
    let depth = 1;
    while (true) {
        const ancestor = callPathMethod(path, "getParentNode", {
            args: depth === 1 ? [] : [depth - 1],
            defaultValue: null
        });

        if (!ancestor) {
            return false;
        }

        if (
            ancestor.type === "FunctionDeclaration" ||
            ancestor.type === "ConstructorDeclaration"
        ) {
            if (ancestor._flattenSyntheticNumericParens === true) {
                return true;
            }
        } else if (ancestor.type === "Program") {
            return requireExplicit
                ? ancestor._flattenSyntheticNumericParens === true
                : ancestor._flattenSyntheticNumericParens !== false;
        }

        depth += 1;
    }
}

function isSyntheticParenFlatteningEnabled(path) {
    return checkSyntheticParenFlattening(path);
}

function isSyntheticParenFlatteningForced(path) {
    return checkSyntheticParenFlattening(path, true);
}

function isWithinNumericCallArgument(path) {
    let depth = 1;
    let currentNode = callPathMethod(path, "getValue", { defaultValue: null });

    while (true) {
        const ancestor = callPathMethod(path, "getParentNode", {
            args: depth === 1 ? [] : [depth - 1],
            defaultValue: null
        });

        if (!ancestor) {
            return false;
        }

        if (ancestor.type === "CallExpression") {
            if (
                Array.isArray(ancestor.arguments) &&
                ancestor.arguments.includes(currentNode)
            ) {
                return isNumericCallExpression(ancestor);
            }

            return false;
        }

        currentNode = ancestor;
        depth += 1;
    }
}

function isSelfMultiplicationExpression(expression) {
    if (
        !expression ||
        expression.type !== "BinaryExpression" ||
        expression.operator !== "*"
    ) {
        return false;
    }

    return areNumericExpressionsEquivalent(expression.left, expression.right);
}

function areNumericExpressionsEquivalent(left, right) {
    if (!left || !right || left.type !== right.type) {
        return false;
    }

    switch (left.type) {
        case "Identifier": {
            return left.name === right.name;
        }
        case "Literal": {
            return left.value === right.value;
        }
        case "ParenthesizedExpression": {
            return areNumericExpressionsEquivalent(
                left.expression,
                right.expression
            );
        }
        case "MemberDotExpression": {
            return (
                areNumericExpressionsEquivalent(left.object, right.object) &&
                areNumericExpressionsEquivalent(left.property, right.property)
            );
        }
        case "MemberIndexExpression": {
            if (!areNumericExpressionsEquivalent(left.object, right.object)) {
                return false;
            }

            const leftProps = Core.asArray(left.property);
            const rightProps = Core.asArray(right.property);

            if (leftProps.length !== rightProps.length) {
                return false;
            }

            for (const [index, leftProp] of leftProps.entries()) {
                if (
                    !areNumericExpressionsEquivalent(
                        leftProp,
                        rightProps[index]
                    )
                ) {
                    return false;
                }
            }

            return left.accessor === right.accessor;
        }
        default: {
            return false;
        }
    }
}

function shouldFlattenMultiplicationChain(parent, expression, path) {
    if (
        !parent ||
        !expression ||
        expression.type !== "BinaryExpression" ||
        expression.operator !== "*"
    ) {
        return false;
    }

    if (parent.type !== "BinaryExpression" || parent.operator !== "*") {
        return false;
    }

    if (
        !isNumericComputationNode(expression) ||
        isSelfMultiplicationExpression(expression)
    ) {
        return false;
    }

    const sanitizedMacroNames = getSanitizedMacroNames(path);

    if (
        sanitizedMacroNames &&
        (expressionReferencesSanitizedMacro(parent, sanitizedMacroNames) ||
            expressionReferencesSanitizedMacro(expression, sanitizedMacroNames))
    ) {
        return false;
    }

    return true;
}

const MULTIPLICATIVE_BINARY_OPERATORS = new Set(["*", "/", "div", "%", "mod"]);

function shouldStripStandaloneAdditiveParentheses(
    parent,
    parentKey,
    expression
) {
    if (!parent || !expression) {
        return false;
    }

    if (!isNumericComputationNode(expression)) {
        return false;
    }

    const isBinaryExpression = expression.type === "BinaryExpression";
    if (isBinaryExpression && binaryExpressionContainsString(expression)) {
        return false;
    }

    const operatorText =
        isBinaryExpression && typeof expression.operator === "string"
            ? expression.operator.toLowerCase()
            : null;
    const isMultiplicativeExpression =
        isBinaryExpression &&
        operatorText !== null &&
        MULTIPLICATIVE_BINARY_OPERATORS.has(operatorText);

    switch (parent.type) {
        case "VariableDeclarator": {
            return parentKey === "init";
        }
        case "AssignmentExpression": {
            return parentKey === "right";
        }
        case "ExpressionStatement": {
            return parentKey === "expression";
        }
        case "ReturnStatement":
        case "ThrowStatement": {
            return parentKey === "argument";
        }
        case "BinaryExpression": {
            if (isMultiplicativeExpression) {
                return false;
            }
            if (parent.operator === "+") {
                return parentKey === "left" || parentKey === "right";
            }

            if (parent.operator === "-") {
                return parentKey === "left";
            }

            return false;
        }
        default: {
            return false;
        }
    }
}

function getSanitizedMacroNames(path) {
    let depth = 1;
    while (true) {
        const ancestor = callPathMethod(path, "getParentNode", {
            args: depth === 1 ? [] : [depth - 1],
            defaultValue: null
        });

        if (!ancestor) {
            return null;
        }

        if (ancestor.type === "Program") {
            const { _featherSanitizedMacroNames: names } = ancestor;

            if (!names) {
                return null;
            }

            const registry = Core.ensureSet(names);

            if (registry !== names) {
                ancestor._featherSanitizedMacroNames = registry;
            }

            return registry.size > 0 ? registry : null;
        }

        depth += 1;
    }
}

function expressionReferencesSanitizedMacro(node, sanitizedMacroNames) {
    if (!sanitizedMacroNames || sanitizedMacroNames.size === 0) {
        return false;
    }

    const stack = [node];

    while (stack.length > 0) {
        const current = stack.pop();

        if (!current || typeof current !== OBJECT_TYPE) {
            continue;
        }

        if (
            current.type === "Identifier" &&
            typeof current.name === STRING_TYPE &&
            sanitizedMacroNames.has(current.name)
        ) {
            return true;
        }

        if (current.type === "CallExpression") {
            const calleeName = Core.getIdentifierText(current.object);
            if (
                typeof calleeName === STRING_TYPE &&
                sanitizedMacroNames.has(calleeName)
            ) {
                return true;
            }
        }

        for (const value of Object.values(current)) {
            if (!value || typeof value !== OBJECT_TYPE) {
                continue;
            }

            if (Array.isArray(value)) {
                for (const entry of value) {
                    if (entry && typeof entry === OBJECT_TYPE) {
                        stack.push(entry);
                    }
                }
                continue;
            }

            if ((value as any).type) {
                stack.push(value);
            }
        }
    }

    return false;
}

// Synthetic parenthesis flattening only treats select call expressions as
// numeric so we avoid unwrapping macro invocations that expand to complex
// expressions. The list is intentionally small and can be extended as other
// numeric helpers require the same treatment.
const NUMERIC_CALL_IDENTIFIERS = new Set(["sqr", "sqrt"]);

function isNumericCallExpression(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    const calleeName = Core.getIdentifierText(node.object);

    if (typeof calleeName !== STRING_TYPE) {
        return false;
    }

    return NUMERIC_CALL_IDENTIFIERS.has(calleeName.toLowerCase());
}

function isNumericComputationNode(node) {
    if (!node || typeof node !== OBJECT_TYPE) {
        return false;
    }

    switch (node.type) {
        case "Literal": {
            const value = Core.toTrimmedString(node.value);
            if (value === "") {
                return false;
            }

            const numericValue = Number(value);
            return Number.isFinite(numericValue);
        }
        case "UnaryExpression": {
            if (node.operator === "+" || node.operator === "-") {
                return isNumericComputationNode(node.argument);
            }

            return false;
        }
        case "Identifier": {
            return true;
        }
        case "ParenthesizedExpression": {
            return isNumericComputationNode(node.expression);
        }
        case "BinaryExpression": {
            if (!Core.isArithmeticBinaryOperator(node.operator)) {
                return false;
            }

            return (
                isNumericComputationNode(node.left) &&
                isNumericComputationNode(node.right)
            );
        }
        case "MemberIndexExpression": {
            return true;
        }
        case "MemberDotExpression": {
            return true;
        }
        case "CallExpression": {
            if (expressionIsStringLike(node)) {
                return false;
            }

            return true;
        }
        default: {
            return false;
        }
    }
}

function binaryExpressionContainsString(node) {
    if (!node || node.type !== "BinaryExpression") {
        return false;
    }

    if (node.operator !== "+") {
        return false;
    }

    return (
        expressionIsStringLike(node.left) || expressionIsStringLike(node.right)
    );
}

function expressionIsStringLike(node) {
    if (!node || typeof node !== OBJECT_TYPE) {
        return false;
    }

    if (node.type === "Literal") {
        if (typeof node.value === STRING_TYPE && /^\".*\"$/.test(node.value)) {
            return true;
        }

        return false;
    }

    if (node.type === "ParenthesizedExpression") {
        return expressionIsStringLike(node.expression);
    }

    if (node.type === "BinaryExpression" && node.operator === "+") {
        return (
            expressionIsStringLike(node.left) ||
            expressionIsStringLike(node.right)
        );
    }

    if (node.type === "CallExpression") {
        const calleeName = Core.getIdentifierText(node.object);
        if (typeof calleeName === STRING_TYPE) {
            const normalized = calleeName.toLowerCase();
            if (
                normalized === STRING_TYPE ||
                normalized.startsWith("string_")
            ) {
                return true;
            }
        }
    }

    return false;
}

function shouldOmitUnaryPlus(argument) {
    const candidate = unwrapUnaryPlusCandidate(argument);

    if (!candidate || typeof candidate !== OBJECT_TYPE) {
        return false;
    }

    return candidate.type === "Identifier";
}

function unwrapUnaryPlusCandidate(node) {
    let current = node;

    while (
        current &&
        typeof current === OBJECT_TYPE &&
        current.type === "ParenthesizedExpression" &&
        current.expression
    ) {
        current = current.expression;
    }

    return current;
}

const RADIAN_TRIG_TO_DEGREE = new Map([
    ["sin", "dsin"],
    ["cos", "dcos"],
    ["tan", "dtan"]
]);

const DEGREE_TO_RADIAN_CONVERSIONS = new Map([
    ["dsin", { name: "sin", expectedArgs: 1 }],
    ["dcos", { name: "cos", expectedArgs: 1 }],
    ["dtan", { name: "tan", expectedArgs: 1 }],
    ["darcsin", { name: "arcsin", expectedArgs: 1 }],
    ["darccos", { name: "arccos", expectedArgs: 1 }],
    ["darctan", { name: "arctan", expectedArgs: 1 }],
    ["darctan2", { name: "arctan2", expectedArgs: 2 }]
]);

const RADIAN_TO_DEGREE_CONVERSIONS = new Map([
    ["arcsin", { name: "darcsin", expectedArgs: 1 }],
    ["arccos", { name: "darccos", expectedArgs: 1 }],
    ["arctan", { name: "darctan", expectedArgs: 1 }],
    ["arctan2", { name: "darctan2", expectedArgs: 2 }]
]);

function unwrapParenthesizedExpression(childPath, print) {
    const childNode = childPath.getValue();
    if (childNode?.type === "ParenthesizedExpression") {
        return childPath.call(
            (innerPath) => unwrapParenthesizedExpression(innerPath, print),
            "expression"
        );
    }

    return print();
}

function getInnermostClauseExpression(node) {
    let current = node;

    while (current?.type === "ParenthesizedExpression") {
        current = current.expression;
    }

    return current;
}

function buildClauseGroup(doc) {
    return group([indent([ifBreak(line), doc]), ifBreak(line)]);
}

const INLINEABLE_SINGLE_STATEMENT_TYPES = new Set([
    "ReturnStatement",
    "ExitStatement",
    "ExpressionStatement",
    "CallExpression"
]);

function shouldInlineGuardWhenDisabled(path, options, bodyNode) {
    if (
        !path ||
        typeof path.getValue !== "function" ||
        typeof path.getParentNode !== "function"
    ) {
        return false;
    }

    const node = path.getValue();
    if (!node || node.type !== "IfStatement") {
        return false;
    }

    if (node.alternate) {
        return false;
    }

    let inlineCandidate = bodyNode ?? null;

    if (inlineCandidate?.type === "BlockStatement") {
        if (
            !Array.isArray(inlineCandidate.body) ||
            inlineCandidate.body.length !== 1
        ) {
            return false;
        }

        const [onlyStatement] = inlineCandidate.body;
        if (!INLINEABLE_SINGLE_STATEMENT_TYPES.has(onlyStatement?.type)) {
            return false;
        }

        if (Core.hasComment(onlyStatement)) {
            return false;
        }

        const blockStartLine = inlineCandidate.start?.line;
        const blockEndLine = inlineCandidate.end?.line;
        if (
            blockStartLine === null ||
            blockEndLine === null ||
            blockStartLine !== blockEndLine
        ) {
            return false;
        }

        const blockSource = getSourceTextForNode(bodyNode, options);
        if (typeof blockSource !== STRING_TYPE || !blockSource.includes(";")) {
            return false;
        }

        inlineCandidate = onlyStatement;
    }

    if (!INLINEABLE_SINGLE_STATEMENT_TYPES.has(inlineCandidate?.type)) {
        return false;
    }

    if (Core.hasComment(bodyNode)) {
        return false;
    }

    if (
        inlineCandidate?.type === "ReturnStatement" &&
        inlineCandidate.argument !== undefined &&
        inlineCandidate.argument !== null
    ) {
        return false;
    }

    const parentNode = path.getParentNode();
    if (!parentNode || parentNode.type === "Program") {
        return false;
    }

    if (!findEnclosingFunctionForPath(path)) {
        return false;
    }

    const statementSource = getSourceTextForNode(node, options);
    if (
        typeof statementSource === STRING_TYPE &&
        (statementSource.includes("\n") || statementSource.includes("\r"))
    ) {
        return false;
    }

    return true;
}

function wrapInClauseParens(path, print, clauseKey) {
    const clauseNode = path.getValue()?.[clauseKey];
    const clauseDoc = printWithoutExtraParens(path, print, clauseKey);

    const clauseExpressionNode = getInnermostClauseExpression(clauseNode);

    if (
        clauseExpressionNode?.type === "CallExpression" &&
        clauseExpressionNode.preserveOriginalCallText
    ) {
        return concat(["(", clauseDoc, ")"]);
    }

    return concat(["(", buildClauseGroup(clauseDoc), ")"]);
}

// prints any statement that matches the structure [keyword, clause, statement]
function printSingleClauseStatement(
    path,
    options,
    print,
    keyword,
    clauseKey,
    bodyKey
) {
    const node = path.getValue();
    const clauseNode = node?.[clauseKey];
    const clauseExpressionNode = getInnermostClauseExpression(clauseNode);
    const clauseDoc = wrapInClauseParens(path, print, clauseKey);
    const bodyNode = node?.[bodyKey];
    const allowSingleLineIfStatements =
        options?.allowSingleLineIfStatements ?? false;
    const clauseIsPreservedCall =
        clauseExpressionNode?.type === "CallExpression" &&
        clauseExpressionNode.preserveOriginalCallText === true;

    const allowCollapsedGuard =
        bodyNode &&
        !clauseIsPreservedCall &&
        (allowSingleLineIfStatements ||
            shouldInlineGuardWhenDisabled(path, options, bodyNode));

    if (allowCollapsedGuard) {
        let inlineReturnDoc = null;
        let inlineStatementType = null;

        if (
            INLINEABLE_SINGLE_STATEMENT_TYPES.has(bodyNode.type) &&
            !Core.hasComment(bodyNode)
        ) {
            inlineReturnDoc = print(bodyKey);
            inlineStatementType = bodyNode.type;
        } else if (
            bodyNode.type === "BlockStatement" &&
            !Core.hasComment(bodyNode) &&
            Array.isArray(bodyNode.body) &&
            bodyNode.body.length === 1
        ) {
            const [onlyStatement] = bodyNode.body;
            if (
                onlyStatement &&
                INLINEABLE_SINGLE_STATEMENT_TYPES.has(onlyStatement.type) &&
                !Core.hasComment(onlyStatement)
            ) {
                const startLine = bodyNode.start?.line;
                const endLine = bodyNode.end?.line;
                const blockSource = getSourceTextForNode(bodyNode, options);
                const blockContainsSemicolon =
                    typeof blockSource === STRING_TYPE &&
                    blockSource.includes(";");
                const canInlineBlock =
                    onlyStatement.type === "ExitStatement" ||
                    (startLine !== undefined &&
                        endLine !== undefined &&
                        startLine === endLine);

                if (blockContainsSemicolon && canInlineBlock) {
                    inlineReturnDoc = path.call(
                        (childPath) => childPath.call(print, "body", 0),
                        bodyKey
                    );
                    inlineStatementType = onlyStatement.type;
                }
            }
        }

        if (inlineReturnDoc) {
            return group([
                keyword,
                " ",
                clauseDoc,
                " { ",
                inlineReturnDoc,
                optionalSemicolon(inlineStatementType ?? "ReturnStatement"),
                " }"
            ]);
        }
    }

    const preserveBraceAdjacency = shouldPreserveClauseBlockAdjacency(
        options,
        clauseNode,
        bodyNode
    );

    return concat([
        keyword,
        " ",
        clauseDoc,
        preserveBraceAdjacency ? "" : " ",
        printInBlock(path, options, print, bodyKey)
    ]);
}

function shouldPreserveClauseBlockAdjacency(options, clauseNode, bodyNode) {
    if (!clauseNode || !bodyNode || bodyNode.type !== "BlockStatement") {
        return false;
    }

    const clauseEndIndex = Core.getNodeEndIndex(clauseNode);
    const bodyStartIndex = Core.getNodeStartIndex(bodyNode);

    if (
        typeof clauseEndIndex !== NUMBER_TYPE ||
        typeof bodyStartIndex !== NUMBER_TYPE ||
        bodyStartIndex < clauseEndIndex
    ) {
        return false;
    }

    if (bodyStartIndex !== clauseEndIndex) {
        return false;
    }

    return isLogicalComparisonClause(clauseNode);
}

function isLogicalComparisonClause(node) {
    const clauseExpression = unwrapLogicalClause(node);
    if (clauseExpression?.type !== "BinaryExpression") {
        return false;
    }

    if (!isLogicalOrOperator(clauseExpression.operator)) {
        return false;
    }

    return (
        isComparisonAndConjunction(clauseExpression.left) &&
        isComparisonAndConjunction(clauseExpression.right)
    );
}

function isComparisonAndConjunction(node) {
    const expression = unwrapLogicalClause(node);
    if (expression?.type !== "BinaryExpression") {
        return false;
    }

    if (!isLogicalAndOperator(expression.operator)) {
        return false;
    }

    if (!isComparisonExpression(expression.left)) {
        return false;
    }

    return isSimpleLogicalOperand(expression.right);
}

function isComparisonExpression(node) {
    const expression = unwrapLogicalClause(node);
    return (
        expression?.type === "BinaryExpression" &&
        Core.isComparisonBinaryOperator(expression.operator)
    );
}

function isSimpleLogicalOperand(node) {
    const expression = unwrapLogicalClause(node);
    if (!expression) {
        return false;
    }

    if (expression.type === "Identifier") {
        return true;
    }

    if (expression.type === "Literal") {
        return true;
    }

    if (expression.type === "UnaryExpression") {
        return isSimpleLogicalOperand(expression.argument);
    }

    return isComparisonExpression(expression);
}

function unwrapLogicalClause(node) {
    let current = node;
    while (current?.type === "ParenthesizedExpression") {
        current = current.expression;
    }
    return current ?? null;
}

function isLogicalOrOperator(operator) {
    return operator === "or" || operator === "||";
}

function isLogicalAndOperator(operator) {
    return operator === "and" || operator === "&&";
}

function printSimpleDeclaration(leftDoc, rightDoc) {
    return rightDoc ? [leftDoc, " = ", rightDoc] : leftDoc;
}

function resolveArgumentAliasInitializerDoc(path) {
    const node = path.getValue();
    if (!node || node.type !== "VariableDeclarator") {
        return null;
    }

    const initializer = node.init;
    if (!initializer || initializer.type !== "Identifier") {
        return null;
    }

    const match = Core.GML_ARGUMENT_IDENTIFIER_PATTERN.exec(
        initializer.name ?? ""
    );
    if (!match) {
        return null;
    }

    const aliasIdentifier = node.id;
    if (!aliasIdentifier || aliasIdentifier.type !== "Identifier") {
        return null;
    }

    const aliasName = aliasIdentifier.name;
    if (!Core.isNonEmptyString(aliasName)) {
        return null;
    }

    const argumentIndex = Number.parseInt(match[1]);
    if (!Number.isInteger(argumentIndex) || argumentIndex < 0) {
        return null;
    }

    const functionNode = findEnclosingFunctionForPath(path);
    if (!functionNode) {
        return null;
    }

    const docPreferences = Core.preferredParamDocNamesByNode.get(functionNode);
    let parameterName = null;

    if (docPreferences && docPreferences.has(argumentIndex)) {
        const preferred = docPreferences.get(argumentIndex);
        if (Core.isNonEmptyString(preferred)) {
            parameterName = preferred;
        }
    }

    if (!parameterName) {
        parameterName = getFunctionParameterNameByIndex(
            functionNode,
            argumentIndex
        );
    }

    if (
        !parameterName ||
        parameterName === aliasName ||
        parameterName === initializer.name
    ) {
        return null;
    }

    return parameterName;
}

function findEnclosingFunctionForPath(path) {
    if (!path || typeof path.getParentNode !== "function") {
        return null;
    }

    for (let depth = 0; ; depth += 1) {
        const parent =
            depth === 0 ? path.getParentNode() : path.getParentNode(depth);
        if (!parent) {
            break;
        }

        if (Core.isFunctionLikeNode(parent)) {
            return parent;
        }
    }

    return null;
}

function getFunctionParameterNameByIndex(functionNode, index) {
    if (!functionNode || typeof functionNode !== OBJECT_TYPE) {
        return null;
    }

    const params = getFunctionParams(functionNode);

    if (!Number.isInteger(index) || index < 0 || index >= params.length) {
        return null;
    }

    const param = params[index];
    if (!param || typeof param !== OBJECT_TYPE) {
        return null;
    }

    if (param.type === "Identifier" && typeof param.name === STRING_TYPE) {
        return param.name;
    }

    if (
        param.type === "DefaultParameter" &&
        param.left?.type === "Identifier" &&
        typeof param.left.name === STRING_TYPE
    ) {
        return param.left.name;
    }

    return null;
}

function getFunctionParams(functionNode) {
    if (!functionNode || typeof functionNode !== OBJECT_TYPE) {
        return [];
    }

    const { params } = functionNode;
    if (!Array.isArray(params)) {
        return [];
    }

    return params;
}

// prints empty parens with dangling comments
function printEmptyParens(path, options) {
    return group(
        [
            "(",
            indent([
                printDanglingCommentsAsGroup(
                    path,
                    options,
                    (comment) => !comment.attachToBrace
                )
            ]),
            ifBreak(line, "", { groupId: Symbol.for("emptyparen") }),
            ")"
        ],
        { id: Symbol.for("emptyparen") }
    );
}

// prints an empty block with dangling comments
function printEmptyBlock(path, options) {
    const node = path.getValue();
    const inlineCommentDoc = maybePrintInlineEmptyBlockComment(path, options);

    if (inlineCommentDoc) {
        return inlineCommentDoc;
    }

    const comments = Core.getCommentArray(node);
    const hasPrintableComments = comments.some(Core.isCommentNode as any);

    if (hasPrintableComments) {
        const sourceMetadata = resolvePrinterSourceMetadata(options);
        const shouldAddTrailingBlankLine =
            sourceMetadata.originalText !== null &&
            hasBlankLineBetweenLastCommentAndClosingBrace(
                node,
                sourceMetadata,
                sourceMetadata.originalText
            );

        const trailingDocs = [hardline, "}"];
        if (shouldAddTrailingBlankLine) {
            trailingDocs.unshift(lineSuffixBoundary as any, hardline as any);
        }

        // an empty block with comments
        return [
            "{",
            printDanglingComments(
                path,
                options,
                (comment) => comment.attachToBrace
            ),
            printDanglingCommentsAsGroup(
                path,
                options,
                (comment) => !comment.attachToBrace
            ),
            ...trailingDocs
        ];
    } else {
        return "{}";
    }
}

function maybePrintInlineEmptyBlockComment(path, options) {
    const node = path.getValue();
    if (!node) {
        return null;
    }

    const comments = Core.getCommentArray(node);
    if (comments.length === 0) {
        return null;
    }

    const inlineIndex = findInlineBlockCommentIndex(comments);

    if (inlineIndex < 0) {
        return null;
    }

    const comment = comments[inlineIndex];
    const leadingSpacing = getInlineBlockCommentSpacing(comment.leadingWS, " ");
    const trailingSpacing = getInlineBlockCommentSpacing(
        comment.trailingWS,
        " "
    );

    return [
        "{",
        leadingSpacing,
        path.call(
            (commentPath) => printComment(commentPath, options),
            "comments",
            inlineIndex
        ),
        trailingSpacing,
        "}"
    ];
}

function findInlineBlockCommentIndex(comments) {
    let inlineIndex = -1;

    for (const [index, comment] of comments.entries()) {
        if (!Core.isCommentNode(comment)) {
            continue;
        }

        if (!isInlineEmptyBlockComment(comment)) {
            return -1;
        }

        if (inlineIndex !== -1) {
            return -1;
        }

        inlineIndex = index;
    }

    return inlineIndex;
}

function isInlineEmptyBlockComment(comment) {
    if (!comment || comment.type !== "CommentBlock") {
        return false;
    }

    if (hasLineBreak(comment.leadingWS) || hasLineBreak(comment.trailingWS)) {
        return false;
    }

    if (typeof comment.lineCount === NUMBER_TYPE && comment.lineCount > 1) {
        return false;
    }

    if (typeof comment.value === STRING_TYPE && hasLineBreak(comment.value)) {
        return false;
    }

    return true;
}

function getInlineBlockCommentSpacing(text, fallback) {
    if (typeof text !== STRING_TYPE || text.length === 0) {
        return fallback;
    }

    return hasLineBreak(text) ? fallback : text;
}

function hasLineBreak(text) {
    return typeof text === STRING_TYPE && /[\r\n\u2028\u2029]/.test(text);
}

function isInLValueChain(path) {
    if (!path || typeof path.getParentNode !== "function") {
        return false;
    }

    const node = path.getValue();
    const parent = path.getParentNode();

    if (!parent || typeof parent.type !== STRING_TYPE) {
        return false;
    }

    if (
        parent.type === "CallExpression" &&
        Array.isArray(parent.arguments) &&
        parent.arguments.includes(node)
    ) {
        return false;
    }

    if (parent.type === "CallExpression" && parent.object === node) {
        const grandparent = path.getParentNode(1);

        if (!grandparent || typeof grandparent.type !== STRING_TYPE) {
            return false;
        }

        return isLValueExpression(grandparent.type);
    }

    return isLValueExpression(parent.type);
}

function isLValueExpression(nodeType) {
    return (
        nodeType === "MemberIndexExpression" ||
        nodeType === "CallExpression" ||
        nodeType === "MemberDotExpression"
    );
}
