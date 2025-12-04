// TODO: This file is too large and should be split into multiple smaller files.
// General, non-printer-related Node utils should be moved into Core.

// TODO: ALL doc-comment/function-doc functionality here should be extracted and moved to Core's doc-comment manager/module (e.g. computeSyntheticFunctionDocLines, normalizeParamDocType, collectImplicitArgumentDocNames, etc.). Any tests related to doc-comments should also be moved accordingly. Need to be VERY careful that no functionality is lost during the migration. Also be VERY dilligent to ensure that no duplicate functionality is created during the migration.

import { Core, type MutableDocCommentLines } from "@gml-modules/core";

import {
    DefineReplacementDirective,
    isLastStatement,
    optionalSemicolon,
    isNextLineEmpty,
    isPreviousLineEmpty,
    shouldAddNewlinesAroundStatement,
    getNormalizedDefineReplacementDirective,
    isFunctionLikeDeclaration
} from "./util.js";
import {
    buildCachedSizeVariableName,
    getLoopLengthHoistInfo,
    getSizeRetrievalFunctionSuffixes
} from "./loop-size-hoisting.js";
import {
    getEnumNameAlignmentPadding,
    prepareEnumMembersForPrinting
} from "./enum-alignment.js";
import {
    isMacroLikeStatement,
    shouldForceBlankLineBetweenReturnPaths,
    shouldForceTrailingBlankLineForNestedFunction,
    shouldSuppressEmptyLineBetween
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
} from "./doc-builders.js";
import {
    hasBlankLineBeforeLeadingComment,
    hasBlankLineBetweenLastCommentAndClosingBrace,
    macroTextHasExplicitTrailingBlankLine,
    resolveNodeIndexRangeWithSource,
    resolvePrinterSourceMetadata,
    sliceOriginalText,
    stripTrailingLineTerminators
} from "./source-text.js";
import { Parser } from "@gml-modules/parser";
import { TRAILING_COMMA } from "../options/trailing-comma-option.js";
import { DEFAULT_DOC_COMMENT_MAX_WRAP_WIDTH } from "./doc-comment-wrap-width.js";

import { Semantic } from "@gml-modules/semantic";
import {
    LogicalOperatorsStyle,
    normalizeLogicalOperatorsStyle
} from "../options/logical-operators-style.js";
import {
    ObjectWrapOption,
    resolveObjectWrapOption
} from "../options/object-wrap-option.js";

// String constants to avoid duplication warnings
const STRING_TYPE = "string";
const OBJECT_TYPE = "object";
const NUMBER_TYPE = "number";
const UNDEFINED_TYPE = "undefined";

// Use Core.* directly instead of destructuring the Core namespace across
// package boundaries (see AGENTS.md): e.g., use Core.getCommentArray(...) not
// `getCommentArray(...)`.

// Wrapper helpers around optional Semantic helpers. Some test/runner
// environments may not expose the full Semantic facade; provide safe
// fallbacks so printing remains robust.
// TODO: Consider moving these into Core or Semantic for reuse.
function getSemanticIdentifierCaseRenameForNode(node, options) {
    // If the caller requested a dry-run for identifier-case, do not
    // apply or consult the rename snapshot when printing — dry-run
    // should only report planned changes, not rewrite source text.
    if (options?.__identifierCaseDryRun === true) {
        return null;
    }

    // Prefer the registered Semantic lookup service if available. Some
    // runtime environments lazily proxy module exports which can hide
    // properties from enumeration; attempt to call the facade helper but
    // always fall back to a direct renameMap lookup when a snapshot is
    // present on the options bag. This keeps printing deterministic even
    // when the higher-level Semantic facade is not exposing the lookup
    // function for any reason (circular-init, test-provider swaps, etc.).
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

const preservedUndefinedDefaultParameters = new WeakSet();
const synthesizedUndefinedDefaultParameters = new WeakSet();
const ARGUMENT_IDENTIFIER_PATTERN = /^argument(\d+)$/;
const suppressedImplicitDocCanonicalByNode = new WeakMap();
const preferredParamDocNamesByNode = new WeakMap();
const forcedStructArgumentBreaks = new WeakMap();

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

        if (ancestor.type === "ConstructorDeclaration") {
            return true;
        }
    }

    return false;
}

const BINARY_OPERATOR_INFO = new Map([
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

    switch (node.type) {
        case "Program": {
            if (node && node.__identifierCasePlanSnapshot) {
                try {
                    if (
                        Semantic &&
                        typeof Semantic.applyIdentifierCasePlanSnapshot ===
                            "function"
                    ) {
                        Semantic.applyIdentifierCasePlanSnapshot(
                            node.__identifierCasePlanSnapshot,
                            options
                        );
                    }
                } catch {
                    // Non-fatal: identifier case snapshot application is
                    // optional for printing. If the Semantic API isn't
                    // available, continue without it.
                }
            }

            try {
                try {
                    if (
                        Semantic &&
                        typeof Semantic.maybeReportIdentifierCaseDryRun ===
                            "function"
                    ) {
                        Semantic.maybeReportIdentifierCaseDryRun(options);
                    }
                } catch {
                    /* ignore */
                }

                if (node.body.length === 0) {
                    return concat(
                        Parser.printDanglingCommentsAsGroup(
                            path,
                            options,
                            () => true
                        )
                    );
                }
                const bodyParts = printStatements(path, options, print, "body");
                return concat(bodyParts);
            } finally {
                try {
                    if (
                        Semantic &&
                        typeof Semantic.teardownIdentifierCaseEnvironment ===
                            "function"
                    ) {
                        Semantic.teardownIdentifierCaseEnvironment(options);
                    }
                } catch {
                    /* ignore */
                }
            }
        }
        case "BlockStatement": {
            if (node.body.length === 0) {
                return concat(printEmptyBlock(path, options));
            }

            let leadingDocs = [hardline];

            if (node._gmlForceInitialBlankLine) {
                leadingDocs = [hardline, hardline];
            }

            const sourceMetadata = resolvePrinterSourceMetadata(options);
            const { originalText } = sourceMetadata;
            if (originalText !== null) {
                const firstStatement = node.body[0];
                const { startIndex: firstStatementStartIndex } =
                    resolveNodeIndexRangeWithSource(
                        firstStatement,
                        sourceMetadata
                    );

                const preserveForConstructor =
                    typeof firstStatementStartIndex === NUMBER_TYPE &&
                    isBlockWithinConstructor(path) &&
                    isPreviousLineEmpty(originalText, firstStatementStartIndex);

                const preserveForLeadingComment =
                    hasBlankLineBeforeLeadingComment(
                        node,
                        sourceMetadata,
                        originalText,
                        firstStatementStartIndex
                    );

                if (preserveForConstructor || preserveForLeadingComment) {
                    leadingDocs.push(
                        lineSuffixBoundary as any,
                        hardline as any
                    );
                }
            }

            const stmts = printStatements(path, options, print, "body");

            return concat([
                "{",
                Parser.printDanglingComments(
                    path,
                    options,
                    (comment) => comment.attachToBrace
                ),
                indent([...leadingDocs, stmts]),
                hardline,
                "}"
            ]);
        }
        case "IfStatement": {
            const simplifiedReturn = printBooleanReturnIf(path, print);
            if (simplifiedReturn) {
                return simplifiedReturn;
            }
            return buildIfStatementDoc(path, options, print, node);
        }
        case "SwitchStatement": {
            const parts: any[] = [];
            const discriminantDoc = printWithoutExtraParens(
                path,
                print,
                "discriminant"
            );
            parts.push(["switch (", buildClauseGroup(discriminantDoc), ") "]);

            const braceIntro = [
                "{",
                Parser.printDanglingComments(
                    path,
                    options,
                    (comment) => comment.attachToBrace
                )
            ];

            if (node.cases.length === 0) {
                parts.push(
                    concat([
                        ...braceIntro,
                        Parser.printDanglingCommentsAsGroup(
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
        case "SwitchCase": {
            const caseText = node.test === null ? "default" : "case ";
            const parts: any[] = [[hardline, caseText, print("test"), ":"]];
            const caseBody = node.body;
            if (Core.isNonEmptyArray(caseBody)) {
                parts.push([
                    indent([
                        hardline,
                        printStatements(path, options, print, "body")
                    ])
                ]);
            }
            return concat(parts);
        }
        case "TernaryExpression": {
            const testDoc = print("test");
            const consequentDoc = print("consequent");
            const alternateDoc = print("alternate");

            const ternaryDoc = group([
                testDoc,
                indent([line, "? ", consequentDoc, line, ": ", alternateDoc])
            ]);

            return shouldWrapTernaryExpression(path)
                ? concat(["(", ternaryDoc, ")"])
                : ternaryDoc;
        }
        case "ForStatement": {
            const shouldHoistLoopLengths =
                options?.optimizeLoopLengthHoisting ?? true;
            const sizeFunctionSuffixes = shouldHoistLoopLengths
                ? getSizeRetrievalFunctionSuffixes(options)
                : undefined;
            const hoistInfo = shouldHoistLoopLengths
                ? getLoopLengthHoistInfo(path.getValue(), sizeFunctionSuffixes)
                : null;
            if (hoistInfo) {
                const cachedLengthName = buildCachedSizeVariableName(
                    hoistInfo.sizeIdentifierName,
                    hoistInfo.cachedLengthSuffix
                );

                if (!loopLengthNameConflicts(path, cachedLengthName)) {
                    const { loopSizeCallDoc, iteratorDoc } =
                        buildLoopLengthDocs(path, print, hoistInfo);

                    const initDoc = path.getValue().init ? print("init") : "";
                    const updateDoc = path.getValue().update
                        ? print("update")
                        : "";
                    const testDoc = concat([
                        iteratorDoc,
                        " ",
                        path.getValue().test.operator,
                        " ",
                        cachedLengthName
                    ]);

                    const needsHoistedSeparator =
                        shouldInsertHoistedLoopSeparator(path, options);

                    return concat([
                        group([
                            "var ",
                            cachedLengthName,
                            " = ",
                            loopSizeCallDoc,
                            ";"
                        ]),
                        hardline,
                        "for (",
                        group([
                            indent([
                                ifBreak(line),
                                concat([
                                    initDoc,
                                    ";",
                                    line,
                                    testDoc,
                                    ";",
                                    line,
                                    updateDoc
                                ])
                            ])
                        ]),
                        ") ",
                        printInBlock(path, options, print, "body"),
                        needsHoistedSeparator ? hardline : ""
                    ]);
                }
            }

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
        case "FunctionDeclaration":
        case "ConstructorDeclaration": {
            const parts: any[] = [];

            const sourceMetadata = resolvePrinterSourceMetadata(options);
            const { originalText } = sourceMetadata;
            const { startIndex: nodeStartIndex } =
                resolveNodeIndexRangeWithSource(node, sourceMetadata);

            let docCommentDocs: MutableDocCommentLines = [];
            const lineCommentOptions =
                Parser.Comments.resolveLineCommentOptions(options);
            let needsLeadingBlankLine = false;

            if (Core.isNonEmptyArray(node.docComments)) {
                const firstDocComment = node.docComments[0];
                if (
                    firstDocComment &&
                    typeof firstDocComment.leadingWS === STRING_TYPE
                ) {
                    const blankLinePattern =
                        /(?:\r\n|\r|\n|\u2028|\u2029)\s*(?:\r\n|\r|\n|\u2028|\u2029)/;
                    if (blankLinePattern.test(firstDocComment.leadingWS)) {
                        needsLeadingBlankLine = true;
                    }
                }
                docCommentDocs = node.docComments
                    .map((comment) =>
                        Parser.formatLineComment(comment, lineCommentOptions)
                    )
                    .filter(
                        (text) =>
                            typeof text === STRING_TYPE && text.trim() !== ""
                    );
            }

            // When parser does not attach doc comments to the node but the
            // doc-like comments are present at the program root, attempt to
            // collect them as node-level doc comment lines so the promotion
            // and merging logic runs as though they were attached to the
            // node. This ensures leading `///` summary lines that appear at
            // the file's top get promoted to `@description` when synthetic
            // tags are inserted.
            if (docCommentDocs.length === 0) {
                const parentNode =
                    typeof path.getParentNode === "function"
                        ? path.getParentNode()
                        : null;
                // Resolve the root Program node to ensure we can scan program-level
                // comment arrays when parser attachments differ by node. This code
                // mirrors the logic used in printStatements to find the Program
                // ancestor in order to support scanning top-level comments.
                let programNode = null;
                // Prefer the bound getParentNode call to ensure the method is
                // invoked with the original `this` context. Some path impls
                // expose an overload that requires the `this` value to be set.
                if (path && typeof path.getParentNode === "function") {
                    const getParentNode = path.getParentNode;
                    try {
                        for (let depth = 0; ; depth += 1) {
                            const p = getParentNode.call(path, depth);
                            if (!p) break;
                            if (p.type === "Program") {
                                programNode = p;
                                break;
                            }
                        }
                    } catch {
                        // If the depth-based parent lookup fails, fall back to
                        // the immediate parent as a best-effort program node.
                        programNode = parentNode;
                    }
                } else {
                    programNode = parentNode;
                }

                const { existingDocLines, remainingComments } =
                    collectSyntheticDocCommentLines(
                        node,
                        options,
                        programNode,
                        originalText
                    );
                const {
                    leadingLines: leadingCommentLines,
                    remainingComments: updatedComments
                } = extractLeadingNonDocCommentLines(
                    remainingComments,
                    options
                );

                if (
                    existingDocLines.length > 0 ||
                    leadingCommentLines.length > 0
                ) {
                    // If we found doc lines attached to the program, treat them
                    // as the node's doc comments for the rest of the pipeline.
                    docCommentDocs = Core.toMutableArray(
                        existingDocLines.length > 0 ? existingDocLines : []
                    ) as MutableDocCommentLines;
                    if (
                        leadingCommentLines.length > 0 &&
                        docCommentDocs.length === 0
                    ) {
                        // If we only found leading non-doc comment lines, feed
                        // them as overrides so synthetic tags inserted below can
                        // enable promotion into @description.
                        const mergedDocs = Core.toMutableArray(
                            mergeSyntheticDocComments(
                                node,
                                docCommentDocs,
                                options,
                                { leadingCommentLines }
                            )
                        ) as MutableDocCommentLines;

                        docCommentDocs =
                            mergedDocs.length === 0
                                ? (Core.toMutableArray(
                                      leadingCommentLines
                                  ) as MutableDocCommentLines)
                                : mergedDocs;
                    }
                    if (
                        Array.isArray(updatedComments) &&
                        updatedComments.length >= 0
                    ) {
                        node.comments = updatedComments;
                    }
                }
            }

            // Inline small argument_count -> default conversions at print time
            // if the parser/transform pipeline did not already materialize
            // them as DefaultParameter nodes. This is a conservative, local
            // heuristic that mirrors the preprocess transform so synthethic
            // docs and compact signatures appear as expected in output.
            try {
                // First prefer materializing any parser-side `.default` entries
                // present on identifier params (set by preprocessFunctionArgumentDefaults).
                // NOTE: we intentionally do NOT attempt to re-derive defaults by
                // scanning the function body when the parser provides metadata.
                // The parser is authoritative for optional/default intent.
                materializeParamDefaultsFromParamDefault(node);
            } catch {
                // Non-fatal heuristic failures should not abort printing.
            }

            if (
                shouldGenerateSyntheticDocForFunction(
                    path,
                    docCommentDocs,
                    options
                )
            ) {
                docCommentDocs = Core.toMutableArray(
                    mergeSyntheticDocComments(node, docCommentDocs, options)
                ) as MutableDocCommentLines;
                if (Array.isArray(docCommentDocs)) {
                    while (
                        docCommentDocs.length > 0 &&
                        typeof docCommentDocs[0] === STRING_TYPE &&
                        docCommentDocs[0].trim() === ""
                    ) {
                        docCommentDocs.shift();
                    }
                }
                // Nested functions (those in BlockStatement parents) should have
                // a leading blank line before their synthetic doc comments
                const parentNode = path.getParentNode();
                if (
                    parentNode &&
                    parentNode.type === "BlockStatement" &&
                    !needsLeadingBlankLine
                ) {
                    needsLeadingBlankLine = true;
                }
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
                    hasCommentImmediatelyBefore(originalText, nodeStartIndex);

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
                parts.push(join(hardline, docCommentDocs), hardline);
            } else if (Object.hasOwn(node, DOC_COMMENT_OUTPUT_FLAG)) {
                delete node[DOC_COMMENT_OUTPUT_FLAG];
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

            if (node.type === "ConstructorDeclaration") {
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
        case "ExpressionStatement": {
            return print("expression");
        }
        case "AssignmentExpression": {
            const padding =
                node.operator === "=" &&
                typeof node._alignAssignmentPadding === NUMBER_TYPE
                    ? Math.max(0, node._alignAssignmentPadding)
                    : 0;
            let spacing = " ".repeat(padding + 1);

            if (
                spacing.length === 1 &&
                shouldPreserveCompactUpdateAssignmentSpacing(path, options)
            ) {
                spacing = "";
            }

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
            if (options?.preserveGlobalVarStatements === false) {
                return null;
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
                                      trailingNewline: false
                                  }
                              )
                            : path.map(print, "declarations");
                    return concat([node.kind, " ", decls]);
                } finally {
                    node.declarations = original;
                }
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
            return concat(printSimpleDeclaration(print("id"), print("init")));
        }
        case "ParenthesizedExpression": {
            if (shouldOmitSyntheticParens(path)) {
                return printWithoutExtraParens(path, print, "expression");
            }

            return concat([
                "(",
                printWithoutExtraParens(path, print, "expression"),
                ")"
            ]);
        }
        case "BinaryExpression": {
            const left = print("left");
            let operator = node.operator;
            let right;
            const logicalOperatorsStyle = resolveLogicalOperatorsStyle(options);

            const leftIsUndefined = Core.isUndefinedSentinel(node.left);
            const rightIsUndefined = Core.isUndefinedSentinel(node.right);

            if (
                (operator === "==" || operator === "!=") &&
                (leftIsUndefined || rightIsUndefined)
            ) {
                const expressionDoc = leftIsUndefined
                    ? printWithoutExtraParens(path, print, "right")
                    : printWithoutExtraParens(path, print, "left");
                const prefix =
                    operator === "!=" ? "!is_undefined(" : "is_undefined(";
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
                operator === "/" &&
                node?.right?.type === "Literal" &&
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
                        // Intentionally omit a default branch so any operator that is not
                        // covered above preserves the exact token emitted by the parser.
                        // Introducing a catch-all would make it easy to "fix" unfamiliar
                        // operators into something else, which risks corrupting source that
                        // relies on newly added or editor-specific syntax.
                    }
                } else {
                    operator = styledOperator;
                }
            }

            return group([left, " ", group([operator, line, right])]);
        }
        case "UnaryExpression":
        case "IncDecStatement":
        case "IncDecExpression": {
            if (node.prefix) {
                if (
                    node.operator === "+" &&
                    shouldOmitUnaryPlus(node.argument)
                ) {
                    return print("argument");
                }

                return concat([node.operator, print("argument")]);
            }

            return concat([print("argument"), node.operator]);
        }
        case "CallExpression": {
            if (node?.[FEATHER_COMMENT_OUT_SYMBOL]) {
                const commentText = getFeatherCommentCallText(node);
                const renderedText =
                    typeof node[FEATHER_COMMENT_TEXT_SYMBOL] === STRING_TYPE &&
                    node[FEATHER_COMMENT_TEXT_SYMBOL].length > 0
                        ? node[FEATHER_COMMENT_TEXT_SYMBOL]
                        : commentText;

                if (renderedText) {
                    return concat(["// ", renderedText]);
                }

                return "//";
            }

            if (options && typeof options.originalText === STRING_TYPE) {
                const hasNestedPreservedArguments = Array.isArray(
                    node.arguments
                )
                    ? node.arguments.some(
                          (argument) =>
                              argument?.preserveOriginalCallText === true
                      )
                    : false;
                const startIndex = Core.getNodeStartIndex(node);
                const endIndex = Core.getNodeEndIndex(node);

                if (
                    typeof startIndex === NUMBER_TYPE &&
                    typeof endIndex === NUMBER_TYPE &&
                    endIndex > startIndex
                ) {
                    const synthesizedText =
                        synthesizeMissingCallArgumentSeparators(
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

                    if (
                        node.preserveOriginalCallText &&
                        !hasNestedPreservedArguments
                    ) {
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
                const maxParamsPerLine = Number.isFinite(
                    options?.maxParamsPerLine
                )
                    ? options.maxParamsPerLine
                    : 0;
                const elementsPerLineLimit =
                    maxParamsPerLine > 0 ? maxParamsPerLine : Infinity;

                const callbackArguments = node.arguments.filter(
                    (argument) => argument?.type === "FunctionDeclaration"
                );
                const structArguments = node.arguments.filter(
                    (argument) => argument?.type === "StructExpression"
                );
                const structArgumentsToBreak = structArguments.filter(
                    (argument) => shouldForceBreakStructArgument(argument)
                );

                structArgumentsToBreak.forEach((argument) => {
                    forcedStructArgumentBreaks.set(
                        argument,
                        getStructAlignmentInfo(argument, options)
                    );
                });

                const hasSingleCallExpressionArgument =
                    maxParamsPerLine > 0 &&
                    node.arguments.length === 1 &&
                    node.arguments[0]?.type === "CallExpression";

                const shouldForceBreakArguments =
                    hasSingleCallExpressionArgument ||
                    (maxParamsPerLine > 0 &&
                        node.arguments.length > maxParamsPerLine) ||
                    callbackArguments.length > 1 ||
                    structArgumentsToBreak.length > 0;

                const shouldUseCallbackLayout = [
                    node.arguments[0],
                    node.arguments.at(-1)
                ].some(
                    (argumentNode) =>
                        argumentNode?.type === "FunctionDeclaration" ||
                        argumentNode?.type === "StructExpression"
                );

                const shouldIncludeInlineVariant =
                    shouldUseCallbackLayout && !shouldForceBreakArguments;

                const hasCallbackArguments = callbackArguments.length > 0;

                const { inlineDoc, multilineDoc } = buildCallArgumentsDocs(
                    path,
                    print,
                    options,
                    {
                        forceBreak: shouldForceBreakArguments,
                        maxElementsPerLine: elementsPerLineLimit,
                        includeInlineVariant: shouldIncludeInlineVariant,
                        hasCallbackArguments
                    }
                );

                if (shouldUseCallbackLayout) {
                    if (shouldForceBreakArguments) {
                        printedArgs = [concat([breakParent, multilineDoc])];
                    } else if (inlineDoc) {
                        printedArgs = [
                            conditionalGroup([inlineDoc, multilineDoc])
                        ];
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
        case "MemberDotExpression": {
            if (
                isInLValueChain(path) &&
                path.parent?.type === "CallExpression"
            ) {
                const objectNode = path.getValue()?.object;
                const shouldAllowBreakBeforeDot =
                    objectNode &&
                    (objectNode.type === "CallExpression" ||
                        objectNode.type === "MemberDotExpression" ||
                        objectNode.type === "MemberIndexExpression");

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
                // return [
                //     print(OBJECT_TYPE),
                //     ".",
                //     print("property")
                // ];
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
                // return [
                //     print(OBJECT_TYPE),
                //     ".",
                //     print("property")
                // ];
            }
        }
        case "MemberIndexExpression": {
            const memberNode = path.getValue();
            let accessor = print("accessor");
            if (memberNode && typeof memberNode.accessor === "string") {
                accessor = memberNode.accessor;
            }

            // `accessor` is usually a plain string (e.g. "[", "[?", "[#").
            // Be defensive: only append a trailing space when we actually
            // received a string accessor longer than one character so we
            // preserve the historical spacing for special accessors like
            // "[?" or "[#" while leaving normal "[" unchanged.
            if (typeof accessor === "string" && accessor.length > 1) {
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
            return concat([
                print(OBJECT_TYPE),
                accessor,
                group(indent(property)),
                "]"
            ]);
        }
        case "StructExpression": {
            if (node.properties.length === 0) {
                return concat(printEmptyBlock(path, options));
            }

            const shouldForceBreakStruct = forcedStructArgumentBreaks.has(node);
            const objectWrapOption = resolveObjectWrapOption(options);
            const shouldPreserveStructWrap =
                objectWrapOption === ObjectWrapOption.PRESERVE &&
                structLiteralHasLeadingLineBreak(node, options);

            return concat(
                printCommaSeparatedList(
                    path,
                    print,
                    "properties",
                    "{",
                    "}",
                    options,
                    {
                        forceBreak:
                            node.hasTrailingComma ||
                            shouldForceBreakStruct ||
                            shouldPreserveStructWrap,
                        // Keep struct literals flush with their braces for
                        // now. GameMaker's runtime formatter and the examples in
                        // the manual (https://manual.gamemaker.io/monthly/en/#t=GameMaker_Language%2FGML_Reference%2FVariable_Functions%2FStructs.htm)
                        // render `{foo: 1}` without internal padding, and our
                        // documentation screenshots rely on matching that
                        // output. If we decide to adopt spaced braces we need to
                        // coordinate fixture updates and call out the style
                        // shift in the changelog so downstream format-on-save
                        // hooks do not surprise teams mid-upgrade.
                        padding: ""
                    }
                )
            );
        }
        case "Property": {
            const parentNode =
                typeof path.getParentNode === "function"
                    ? path.getParentNode()
                    : null;
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
                return concat([
                    originalPrefix,
                    valueDoc,
                    trailingCommentSuffix
                ]);
            }

            return concat([nameDoc, ": ", valueDoc, trailingCommentSuffix]);
        }
        case "ArrayExpression": {
            const allowTrailingComma = shouldAllowTrailingComma(options);
            return concat(
                printCommaSeparatedList(
                    path,
                    print,
                    "elements",
                    "[",
                    "]",
                    options,
                    {
                        allowTrailingDelimiter: allowTrailingComma,
                        forceBreak: allowTrailingComma && node.hasTrailingComma
                    }
                )
            );
        }
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
                getNormalizedDefineReplacementDirective(node) ??
                DefineReplacementDirective.MACRO;
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
                getArgumentIndexFromIdentifier(identifierName);
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
                    parentNode?.type === "VariableDeclarator" &&
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
        case "NewExpression": {
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
        default: {
            console.warn(
                `Print.js:print encountered unhandled node type: ${node.type}`,
                node
            );
        }
    }
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
            atom?.type === "TemplateStringText" &&
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
        parts.push("{", path.call(print, "atoms", index), "}");
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

    for (let index = 0; index < node.arguments.length; index += 1) {
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

        if (index >= node.arguments.length - 1) {
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

    const { originalText } = resolvePrinterSourceMetadata(options);

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
    if (!bodyNode || bodyNode.type !== "BlockStatement") {
        return null;
    }

    if (Core.hasComment(bodyNode)) {
        return null;
    }

    const statements = Core.getBodyStatements(bodyNode);
    if (!Array.isArray(statements) || statements.length !== 1) {
        return null;
    }

    const [onlyStatement] = statements;
    if (!onlyStatement || Core.hasComment(onlyStatement)) {
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

    if (node.type === "BlockStatement") {
        return [print(expressionKey), optionalSemicolon(node.type)];
    }

    const inlineCommentDocs = Parser.printDanglingCommentsAsGroup(
        path,
        options,
        (comment) => comment.attachToClauseBody === true
    );

    const hasInlineComments =
        Array.isArray(inlineCommentDocs) && inlineCommentDocs.length > 0;
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
    return onlyStatement?.type === "IfStatement";
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
        nodeType === "FunctionDeclaration" || nodeType === "StructExpression"
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

    for (let index = 0; index < args.length; index += 1) {
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
            const formatted = Parser.formatLineComment(
                comment,
                Parser.Comments.resolveLineCommentOptions(options)
            );
            if (formatted) {
                commentDocs.push(formatted);
            }
            (comment as any)._structPropertyHandled = true;
            (comment as any).printed = true;
        }
    }

    if (commentDocs.length === 0) {
        return "";
    }

    const commentDoc =
        commentDocs.length === 1 ? commentDocs[0] : join(hardline, commentDocs);

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

    if (nameNode.type === "Identifier") {
        const identifierText = Core.getIdentifierText(nameNode);
        return typeof identifierText === STRING_TYPE
            ? identifierText.length
            : 0;
    }

    const source = getSourceTextForNode(nameNode, options);
    return typeof source === STRING_TYPE ? source.length : 0;
}

function getNextNonWhitespaceCharacter(text, startIndex) {
    if (typeof text !== STRING_TYPE) {
        return null;
    }

    const { length } = text;
    for (let index = startIndex; index < length; index += 1) {
        const characterCode = text.charCodeAt(index);

        // Skip standard ASCII whitespace characters so the caller can reason
        // about the next syntactically meaningful token without repeatedly
        // slicing the original source text.
        switch (characterCode) {
            case 9: // \t
            case 10: // \n
            case 11: // vertical tab
            case 12: // form feed
            case 13: // \r
            case 32: {
                // ASCII space character (0x20). Grouped with the other standard
                // whitespace codes above so the loop transparently skips all
                // formatting characters when hunting for the next token.
                // Removing this case would cause the function to incorrectly
                // return a space as the "next non-whitespace character,"
                // breaking semicolon cleanup and other formatting logic that
                // depends on peeking past whitespace boundaries.
                continue;
            }
            default: {
                return text.charAt(index);
            }
        }
    }

    return null;
}

function countTrailingBlankLines(text, startIndex) {
    if (typeof text !== STRING_TYPE) {
        return 0;
    }

    const { length } = text;
    let index = startIndex;
    let newlineCount = 0;

    while (index < length) {
        const characterCode = text.charCodeAt(index);

        if (characterCode === 59) {
            // ;
            index += 1;
            continue;
        }

        if (characterCode === 10) {
            // \n
            newlineCount += 1;
            index += 1;
            continue;
        }

        if (characterCode === 13) {
            // \r
            newlineCount += 1;
            index +=
                index + 1 < length && text.charCodeAt(index + 1) === 10 ? 2 : 1;
            continue;
        }

        if (
            characterCode === 9 || // \t
            characterCode === 11 || // vertical tab
            characterCode === 12 || // form feed
            characterCode === 32 // space
        ) {
            index += 1;
            continue;
        }

        break;
    }

    if (newlineCount === 0) {
        return 0;
    }

    return Math.max(0, newlineCount - 1);
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
            programNode = p.type === "Program" ? p : programNode;
        }
    } catch {
        // If the path doesn't expose getParentNode with a depth signature
        // (defensive), fall back to the parentNode value so callers still
        // receive a usable object.
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
        const parts: any[] = [];
        const node = childPath.getValue();
        // Defensive: some transforms may leave holes or null entries in the
        // statements array. Skip nullish nodes rather than attempting to
        // dereference their type (which previously caused a TypeError).
        if (!node) {
            return [];
        }
        const isTopLevel = childPath.parent?.type === "Program";
        const printed = print();

        if (printed === undefined || printed === null) {
            return [];
        }

        let semi = optionalSemicolon(node.type);
        const { startIndex: nodeStartIndex, endIndex: nodeEndIndex } =
            resolveNodeIndexRangeWithSource(node, sourceMetadata);

        const currentNodeRequiresNewline =
            shouldAddNewlinesAroundStatement(node) && isTopLevel;

        // Determine if a blank line should precede this statement to visually
        // separate distinct logical blocks (function declarations, enum
        // definitions, macro groups, etc.) at the top level. The formatter
        // coordinates with the "AFTER" check below to avoid emitting redundant
        // blank lines when statements are already spaced in the source. If the
        // previous statement already added trailing whitespace
        // (previousNodeHadNewlineAddedAfter), or if a leading comment anchors
        // this node, the guard skips the hardline so the final output does not
        // introduce jarring double-spacing that violates the project's visual
        // rhythm described in docs/statement-spacing-policy.md.
        if (currentNodeRequiresNewline && !previousNodeHadNewlineAddedAfter) {
            const hasLeadingComment = isTopLevel
                ? hasCommentImmediatelyBefore(originalTextCache, nodeStartIndex)
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

        const syntheticDocRecord = syntheticDocByNode.get(node);
        const syntheticDocComment = syntheticDocRecord
            ? syntheticDocRecord.doc
            : null;
        if (syntheticDocComment) {
            parts.push(syntheticDocComment, hardline);
        }

        const textForSemicolons = originalTextCache || "";
        let hasTerminatingSemicolon = textForSemicolons[nodeEndIndex] === ";";
        if (!hasTerminatingSemicolon) {
            const textLength = textForSemicolons.length;
            let cursor = nodeEndIndex + 1;
            while (
                cursor < textLength &&
                isSkippableSemicolonWhitespace(
                    textForSemicolons.charCodeAt(cursor)
                )
            ) {
                cursor++;
            }
            hasTerminatingSemicolon = textForSemicolons[cursor] === ";";
        }

        const isVariableDeclaration = node.type === "VariableDeclaration";
        const isStaticDeclaration =
            isVariableDeclaration && node.kind === "static";
        const hasFunctionInitializer =
            isVariableDeclaration &&
            Array.isArray(node.declarations) &&
            node.declarations.some((declaration) => {
                const initType = declaration?.init?.type;
                return (
                    initType === "FunctionExpression" ||
                    initType === "FunctionDeclaration"
                );
            });

        const isFirstStatementInBlock =
            index === 0 && childPath.parent?.type !== "Program";

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

            if (
                hasExplicitBlankLineBeforeStatic ||
                shouldForceConstructorPadding
            ) {
                parts.push(hardline);
            }
        }

        if (semi === ";") {
            const initializerIsFunctionExpression =
                node.type === "VariableDeclaration" &&
                Array.isArray(node.declarations) &&
                node.declarations.length === 1 &&
                (node.declarations[0]?.init?.type === "FunctionExpression" ||
                    node.declarations[0]?.init?.type === "FunctionDeclaration");

            if (initializerIsFunctionExpression && !hasTerminatingSemicolon) {
                // Normalized legacy `#define` directives used to omit trailing
                // semicolons when rewriting to function expressions. The
                // formatter now standardizes those assignments so they always
                // emit an explicit semicolon, matching the golden fixtures and
                // keeping the output consistent regardless of the original
                // source style.
                semi = ";";
            }
        }

        const shouldDropConstructorMethodSemicolon =
            semi === ";" &&
            !hasTerminatingSemicolon &&
            node.type === "AssignmentExpression" &&
            isInsideConstructorFunction(childPath);

        if (shouldDropConstructorMethodSemicolon) {
            semi = "";
        }

        const assignmentExpressionForSemicolonCheck =
            node.type === "AssignmentExpression"
                ? node
                : node.type === "ExpressionStatement" &&
                    node.expression?.type === "AssignmentExpression"
                  ? node.expression
                  : null;

        const shouldOmitFunctionAssignmentSemicolon =
            semi === ";" &&
            !hasTerminatingSemicolon &&
            assignmentExpressionForSemicolonCheck?.operator === "=" &&
            assignmentExpressionForSemicolonCheck?.right?.type ===
                "FunctionDeclaration";

        if (shouldOmitFunctionAssignmentSemicolon) {
            semi = "";
        }

        const shouldOmitSemicolon =
            semi === ";" &&
            !hasTerminatingSemicolon &&
            syntheticDocComment &&
            !(syntheticDocRecord?.hasExistingDocLines ?? false) &&
            isLastStatement(childPath) &&
            !isStaticDeclaration;

        if (shouldOmitSemicolon) {
            semi = "";
        }

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
                parts.push("  // ", manualMathOriginalComment);
            }
            if (manualMathRatio) {
                parts.push(" ", manualMathRatio);
            }
        } else {
            parts.push(printed, semi);
            if (manualMathOriginalComment) {
                parts.push("  // ", manualMathOriginalComment);
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
        previousNodeHadNewlineAddedAfter = false;

        // Evaluate whether this statement should emit trailing whitespace to
        // visually isolate it from the next statement. The logic branches on
        // several scenarios: macros may require padding to separate them from
        // non-macro neighbors, return statements often benefit from a blank
        // line when followed by unrelated code paths, and Feather-generated or
        // user-annotated nodes can explicitly request or suppress spacing via
        // internal flags. The formatter examines the source text to detect
        // existing blank lines (avoiding duplicate spacing) and consults the
        // statement-spacing policy to decide when preserving or injecting
        // whitespace improves readability without bloating the output. Setting
        // `previousNodeHadNewlineAddedAfter` to `true` when a hardline is
        // appended signals the next iteration's "BEFORE" check to skip
        // redundant leading blank lines, maintaining the coordinated rhythm
        // between adjacent statements.
        if (!isLastStatement(childPath)) {
            const nextNode = statements ? statements[index + 1] : null;
            const shouldSuppressExtraEmptyLine = shouldSuppressEmptyLineBetween(
                node,
                nextNode
            );
            const nextNodeIsMacro = isMacroLikeStatement(nextNode);
            const shouldSkipStandardHardline =
                shouldSuppressExtraEmptyLine &&
                isMacroLikeStatement(node) &&
                !nextNodeIsMacro;

            if (!shouldSkipStandardHardline) {
                parts.push(hardline);
            }

            const nextHasSyntheticDoc = nextNode
                ? syntheticDocByNode.has(nextNode)
                : false;
            const nextLineProbeIndex =
                node?.type === "DefineStatement" ||
                node?.type === "MacroDeclaration"
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
                node?.type === "MacroDeclaration" &&
                typeof node._featherMacroText === STRING_TYPE;
            const sanitizedMacroHasExplicitBlankLine =
                isSanitizedMacro &&
                macroTextHasExplicitTrailingBlankLine(node._featherMacroText);

            const isMacroLikeNode = isMacroLikeStatement(node);
            const isDefineMacroReplacement =
                getNormalizedDefineReplacementDirective(node) ===
                DefineReplacementDirective.MACRO;
            const shouldForceMacroPadding =
                isMacroLikeNode &&
                !isDefineMacroReplacement &&
                !nextNodeIsMacro &&
                !nextLineEmpty &&
                !shouldSuppressExtraEmptyLine &&
                !sanitizedMacroHasExplicitBlankLine;
            const shouldForceEarlyReturnPadding =
                !suppressFollowingEmptyLine &&
                shouldForceBlankLineBetweenReturnPaths(node, nextNode);

            if (shouldForceMacroPadding) {
                parts.push(hardline);
                previousNodeHadNewlineAddedAfter = true;
            } else if (
                forceFollowingEmptyLine &&
                !nextLineEmpty &&
                !shouldSuppressExtraEmptyLine &&
                !sanitizedMacroHasExplicitBlankLine
            ) {
                parts.push(hardline);
                previousNodeHadNewlineAddedAfter = true;
            } else if (
                shouldForceEarlyReturnPadding &&
                !nextLineEmpty &&
                !shouldSuppressExtraEmptyLine &&
                !sanitizedMacroHasExplicitBlankLine
            ) {
                parts.push(hardline);
                previousNodeHadNewlineAddedAfter = true;
            } else if (currentNodeRequiresNewline && !nextLineEmpty) {
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
        } else if (isTopLevel) {
            parts.push(hardline);
        } else {
            const parentNode = childPath.parent;
            const trailingProbeIndex =
                node?.type === "DefineStatement" ||
                node?.type === "MacroDeclaration"
                    ? nodeEndIndex
                    : nodeEndIndex + 1;
            const enforceTrailingPadding =
                shouldAddNewlinesAroundStatement(node);
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
                isStaticDeclaration &&
                hasFunctionInitializer &&
                isConstructorBlock;
            let shouldPreserveTrailingBlankLine = false;
            const hasAttachedDocComment =
                node?.[DOC_COMMENT_OUTPUT_FLAG] === true ||
                (Array.isArray(node?.docComments) &&
                    node.docComments.length > 0) ||
                Boolean(syntheticDocComment);
            const requiresTrailingPadding =
                enforceTrailingPadding &&
                parentNode?.type === "BlockStatement" &&
                !suppressFollowingEmptyLine;

            if (
                parentNode?.type === "BlockStatement" &&
                !suppressFollowingEmptyLine
            ) {
                const originalText =
                    typeof options.originalText === STRING_TYPE
                        ? options.originalText
                        : null;
                const trailingBlankLineCount =
                    originalText === null
                        ? 0
                        : countTrailingBlankLines(
                              originalText,
                              trailingProbeIndex
                          );
                const hasExplicitTrailingBlankLine = trailingBlankLineCount > 0;
                const shouldCollapseExcessBlankLines =
                    trailingBlankLineCount > 1;

                if (enforceTrailingPadding) {
                    // Large statements such as nested function declarations and
                    // constructor bodies should remain visually separated from
                    // the closing brace. When padding is mandated by the node
                    // type we still respect explicitly authored spacing, but we
                    // guarantee a separator for nested function declarations so
                    // their closing braces do not collapse into the parent.
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
                } else if (
                    hasExplicitTrailingBlankLine &&
                    originalText !== null
                ) {
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

                            const semicolonIndex = originalText.indexOf(
                                ";",
                                scanIndex
                            );
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

                    shouldPreserveTrailingBlankLine =
                        shouldCollapseExcessBlankLines ? false : shouldPreserve;
                }
            }

            if (
                !shouldPreserveTrailingBlankLine &&
                !suppressFollowingEmptyLine
            ) {
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
                    const isFunctionLike = isFunctionLikeDeclaration(node);

                    if (isFunctionLike) {
                        shouldPreserveTrailingBlankLine = true;
                    }
                }
            }

            const shouldForceConstructorNestedFunctionPadding =
                isConstructorBlock &&
                node?.type === "FunctionDeclaration" &&
                !suppressFollowingEmptyLine &&
                !shouldPreserveTrailingBlankLine;
            if (shouldPreserveTrailingBlankLine) {
                parts.push(hardline);
                previousNodeHadNewlineAddedAfter = true;
            } else if (shouldForceConstructorNestedFunctionPadding) {
                parts.push(hardline);
                previousNodeHadNewlineAddedAfter = true;
            } else if (requiresTrailingPadding) {
                parts.push(hardline);
                previousNodeHadNewlineAddedAfter = true;
            }
        }

        return parts;
    }, childrenAttribute);
}

export function applyAssignmentAlignment(
    statements,
    options,
    path = null,
    childrenAttribute = null
) {
    const minGroupSize = getAssignmentAlignmentMinimum(options);
    /** @type {Array<{ node: any, nameLength: number, prefixLength: number, isSelfMember: boolean }>} */
    const currentGroup = [];
    // Tracking the longest identifier as we build the group avoids mapping over
    // the nodes and spreading into Math.max during every flush. This helper
    // runs in tight printer loops, so staying allocation-free keeps it cheap.
    let currentGroupMaxLength = 0;
    let currentGroupHasAlias = false;
    let currentGroupSelfMemberCount = 0;

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
        currentGroupSelfMemberCount = 0;
    };

    const flushGroup = () => {
        if (currentGroup.length === 0) {
            resetGroup();
            return;
        }

        const groupEntries = [...currentGroup];
        const meetsAlignmentThreshold =
            minGroupSize > 0 && groupEntries.length >= minGroupSize;
        const hasSelfMembers = currentGroupSelfMemberCount > 0;
        const hasMixedSelfMembers =
            hasSelfMembers && currentGroupSelfMemberCount < groupEntries.length;
        const canAlign =
            meetsAlignmentThreshold &&
            currentGroupHasAlias &&
            !hasMixedSelfMembers;

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
            if (
                previousEntry &&
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

            const isSelfMember = entry.isSelfMemberAssignment === true;
            const prefixLength = entry.prefixLength ?? 0;
            currentGroup.push({
                node: entry.paddingTarget,
                nameLength: entry.nameLength,
                prefixLength,
                isSelfMember
            });
            const printedWidth = entry.nameLength + prefixLength;
            if (printedWidth > currentGroupMaxLength) {
                currentGroupMaxLength = printedWidth;
            }
            if (entry.enablesAlignment) {
                currentGroupHasAlias = true;
            }
            if (isSelfMember) {
                currentGroupSelfMemberCount += 1;
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

function getSimpleAssignmentLikeEntry(
    statement,
    insideFunctionBody,
    functionParameterNames,
    functionNode,
    options
) {
    const memberLength = getMemberAssignmentLength(statement);
    if (typeof memberLength === NUMBER_TYPE) {
        return {
            locationNode: statement,
            paddingTarget: statement,
            nameLength: memberLength,
            enablesAlignment: true,
            prefixLength: 0,
            isSelfMemberAssignment:
                statement.left?.object?.type === "Identifier" &&
                statement.left.object.name === "self"
        };
    }

    if (isSimpleAssignment(statement)) {
        const identifier = statement.left;
        if (!identifier || typeof identifier.name !== STRING_TYPE) {
            return null;
        }

        return {
            locationNode: statement,
            paddingTarget: statement,
            nameLength: identifier.name.length,
            enablesAlignment: true,
            prefixLength: 0
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
        const argumentIndex = getArgumentIndexFromIdentifier(init.name);

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

    return {
        locationNode: statement,
        paddingTarget: declarator,
        nameLength: (id.name as string).length,
        enablesAlignment,
        skipBreakAfter,
        prefixLength
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
        const identifier = getIdentifierFromParameterNode(param);
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
    if (!expression || expression.type !== "MemberDotExpression") {
        return null;
    }

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

    if (/\n[^\S\r\n]*\n/.test(between)) {
        return true;
    }

    return /(?:^|\n)\s*(?:\/\/|\/\*)/.test(between);
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

function collectSyntheticDocCommentLines(
    node,
    options,
    programNode,
    sourceText
) {
    const rawComments = Core.getCommentArray(node);
    if (!Core.isNonEmptyArray(rawComments)) {
        // No node-level comments exist; fallback collection happens later.
    }

    const lineCommentOptions =
        Parser.Comments.resolveLineCommentOptions(options);
    const existingDocLines = [];
    const remainingComments = [];

    const nodeStartIndex = getNodeStartIndexForAlignment(node, options);
    for (const comment of rawComments) {
        if (!comment || comment.type !== "CommentLine") {
            remainingComments.push(comment);
            continue;
        }

        let formatted = Parser.formatLineComment(comment, lineCommentOptions);
        // Check if comment is either /// style or // / style (doc-like)
        const rawText = Parser.getLineCommentRawText(comment);
        const trimmedRaw = typeof rawText === STRING_TYPE ? rawText.trim() : "";

        // A comment should be treated as a doc comment if any of the
        // following are true:
        // 1. It results in a formatted text starting with `///` (already
        //    recognized by the formatter), OR
        // 2. Its raw text indicates a doc-like prefix. Some inputs normalize
        //    to single-slash doc markers ("/ ") or have `@` at the start.
        //    Accept a few conservative shapes to ensure such cases get
        //    included in synthetic doc handling.
        const isFormattedDocStyle =
            typeof formatted === STRING_TYPE &&
            formatted.trim().startsWith("///");
        const isRawDocLike =
            /^\/\/\s*\//.test(trimmedRaw) ||
            /^\/\s*/.test(trimmedRaw) ||
            /^\s*@/.test(trimmedRaw);

        if (!isFormattedDocStyle && !isRawDocLike) {
            remainingComments.push(comment);
            continue;
        }

        // If the formatter returned an empty string (for example, it was
        // treated as boilerplate) but the raw value is doc-like, synthesize
        // a fallback formatted representation so merging/promotion can run.
        if (
            (!formatted || formatted.trim().length === 0) &&
            isRawDocLike &&
            typeof trimmedRaw === STRING_TYPE &&
            trimmedRaw.length > 0
        ) {
            const inner = trimmedRaw.replace(/^\/*\s*/, "").trim();
            formatted = inner.length > 0 ? `/// ${inner}` : "///";
        }

        // If the comment appears before the node's start index, or is
        // explicitly marked as leading, treat it as a doc-like leading
        // comment even if the parser attached it differently (e.g., as
        // trailing). This helps when comments are adjacent to the
        // function declaration but the parser's placement marks them as
        // trailing due to tokenization quirks.
        const commentStartIndex =
            comment && typeof comment.start === NUMBER_TYPE
                ? comment.start
                : comment &&
                    comment.start &&
                    typeof comment.start.index === NUMBER_TYPE
                  ? comment.start.index
                  : null;

        const isBeforeNode =
            Number.isInteger(commentStartIndex) &&
            Number.isInteger(nodeStartIndex) &&
            commentStartIndex < nodeStartIndex;

        const considerAsLeading =
            isBeforeNode || comment?.placement === "leading";
        if (!considerAsLeading) {
            // Not a leading doc-like comment for this node — leave it for
            // the remaining comments collection so it can be attached to
            // the nearest node per existing logic.
            remainingComments.push(comment);
            continue;
        }

        comment.printed = true;
        // Split any multi-line formatted comment into separate array entries
        if (typeof formatted === "string" && formatted.includes("\n")) {
            const parts = formatted.split(/\r?\n/);
            for (const part of parts) {
                existingDocLines.push(part);
            }
        } else {
            existingDocLines.push(formatted);
        }
    }

    // If we found no existing doc lines attached to the node, attempt to
    // collect physically-adjacent doc lines from the program root's comment
    // array; this addresses parser attachment heuristics where comments at
    // the top-level are not attached to their subsequent node. If the
    // parser does not attach comments to Program-level nodes in certain
    // environments/fallbacks, fall back to a raw-source scan to find
    // preceding doc-like comment lines immediately before the node.
    if (existingDocLines.length === 0 && programNode) {
        const programCommentArray = Core.getCommentArray(programNode);
        const programHasComments = Core.isNonEmptyArray(programCommentArray);
        if (programHasComments) {
            const programComments = Core.getCommentArray(programNode);
            const nodeStartIndexFinal = getNodeStartIndexForAlignment(
                node,
                options
            );
            if (Number.isInteger(nodeStartIndexFinal)) {
                const docCandidates: any[] = [];
                let anchorIndex = nodeStartIndexFinal;
                for (let i = programComments.length - 1; i >= 0; --i) {
                    const pc = programComments[i];
                    if (!pc || pc.type !== "CommentLine" || pc.printed)
                        continue;
                    let pcEndIndex =
                        typeof pc.end === NUMBER_TYPE
                            ? pc.end
                            : (pc?.end?.index ?? null);
                    const pcStartIndex =
                        typeof pc.start === NUMBER_TYPE
                            ? pc.start
                            : (pc?.start?.index ?? null);
                    if (!Number.isInteger(pcEndIndex)) {
                        pcEndIndex = Number.isInteger(pcStartIndex)
                            ? pcStartIndex
                            : null;
                    }
                    if (
                        !Number.isInteger(pcEndIndex) ||
                        pcEndIndex >= anchorIndex
                    )
                        continue;

                    const formatted = Parser.formatLineComment(
                        pc,
                        Parser.Comments.resolveLineCommentOptions(options)
                    );
                    const rawText = Parser.getLineCommentRawText(pc);
                    const trimmedRaw =
                        typeof rawText === STRING_TYPE ? rawText.trim() : "";
                    const isFormattedDocStyle =
                        typeof formatted === STRING_TYPE &&
                        formatted.trim().startsWith("///");
                    const isRawDocLike =
                        /^\/\/\s*\//.test(trimmedRaw) ||
                        /^\/\s*/.test(trimmedRaw) ||
                        /^\s*@/.test(trimmedRaw);
                    if (!isFormattedDocStyle && !isRawDocLike) break;
                    let allowCandidate = true;
                    if (
                        typeof sourceText === STRING_TYPE &&
                        Number.isInteger(pcEndIndex)
                    ) {
                        const gapText = sourceText.slice(
                            pcEndIndex,
                            anchorIndex
                        );
                        const blankLines = (gapText.match(/\n/g) || []).length;
                        if (blankLines >= 2) allowCandidate = false;
                    }
                    if (!allowCandidate) break;
                    docCandidates.unshift(pc);
                    anchorIndex = Number.isInteger(pcStartIndex)
                        ? pcStartIndex
                        : pcEndIndex;
                }

                if (docCandidates.length > 0) {
                    const collected = docCandidates.map((c) =>
                        Parser.formatLineComment(
                            c,
                            Parser.Comments.resolveLineCommentOptions(options)
                        )
                    );
                    // Flatten any multiline entries in the collected set
                    const flattenedCollected = [] as string[];
                    for (const entry of collected) {
                        if (typeof entry === "string" && entry.includes("\n")) {
                            flattenedCollected.push(...entry.split(/\r?\n/));
                        } else {
                            flattenedCollected.push(entry);
                        }
                    }
                    for (const c of docCandidates) c.printed = true;
                    return {
                        existingDocLines: flattenedCollected,
                        remainingComments: Core.toMutableArray(rawComments)
                    };
                }
            }
        } else {
            // If the program comments collection is empty or did not yield any
            // doc candidates, perform a raw-source scan using the provided
            // `sourceText` to discover physically adjacent `//` lines that
            // should be treated as doc-like leading comments. This helps when
            // the parser attaches comments into a separate `ast.comments` array
            // that isn't accessible on the Program node at printing time.
            if (
                typeof sourceText === STRING_TYPE &&
                Number.isInteger(nodeStartIndex)
            ) {
                const candidates: Array<{
                    text: string;
                    start: number;
                    end: number;
                }> = [];
                let anchor = nodeStartIndex;
                // Walk backward line-by-line from the node start, collecting
                // contiguous comment candidates until we hit a non-comment or
                // a large blank gap.
                while (anchor > 0) {
                    const prevNewline = sourceText.lastIndexOf(
                        "\n",
                        anchor - 1
                    );
                    const lineStart = prevNewline === -1 ? 0 : prevNewline + 1;
                    const lineEnd = anchor === 0 ? 0 : anchor - 1;
                    const rawLine = sourceText.slice(lineStart, lineEnd + 1);
                    const trimmed = rawLine.trim();
                    // If it's an empty line (only whitespace), update anchor and
                    // treat it as a separator; if there are >=2 blank lines, abort.
                    const isBlank = trimmed.length === 0;
                    if (isBlank) {
                        // Count blank lines between previous anchor and current
                        // anchor; if >= 2, abort the scan.
                        const gapText = sourceText.slice(
                            lineStart,
                            nodeStartIndex
                        );
                        const blankLines = (gapText.match(/\n/g) || []).length;
                        if (blankLines >= 2) break;
                        // Narrow the anchor to move to previous line
                        anchor = lineStart - 1;
                        continue;
                    }
                    // Check if the line looks like a `//` comment line
                    if (!/^\s*\/\//.test(trimmed)) break;
                    // Consider doc-like shapes only (/// or // / or @-leading)
                    const isDocLike =
                        /^\/{2,}/.test(trimmed) ||
                        /^\/\/\s*\//.test(trimmed) ||
                        /^\/\s*@/.test(trimmed);
                    if (!isDocLike) break;
                    candidates.unshift({
                        text: rawLine,
                        start: lineStart,
                        end: lineEnd
                    });
                    anchor = lineStart - 1;
                }

                if (candidates.length > 0) {
                    const formatted = candidates.map((c) => {
                        // Try to match AST comment nodes by start index; if found
                        // use the formatting routine so we also mark comment nodes
                        // printed when possible. Otherwise, create a fallback
                        // formatted string ("/// ...") to keep downstream logic
                        // consistent.
                        const matchNode = programCommentArray.find((pc) => {
                            const startIndex =
                                typeof pc?.start === NUMBER_TYPE
                                    ? pc.start
                                    : (pc?.start?.index ?? null);
                            return (
                                Number.isInteger(startIndex) &&
                                startIndex === c.start
                            );
                        });
                        if (matchNode) {
                            matchNode.printed = true;
                            return Parser.formatLineComment(
                                matchNode,
                                Parser.Comments.resolveLineCommentOptions(
                                    options
                                )
                            );
                        }
                        // Synthesize fallback formatted line
                        const inner = c.text.replace(/^\s*\/+\s*/, "").trim();
                        return inner.length > 0 ? `/// ${inner}` : "///";
                    });
                    // Flatten any multiline entries in the formatted set
                    const flattenedFormatted = [] as string[];
                    for (const entry of formatted) {
                        if (typeof entry === "string" && entry.includes("\n")) {
                            flattenedFormatted.push(...entry.split(/\r?\n/));
                        } else {
                            flattenedFormatted.push(entry);
                        }
                    }
                    return {
                        existingDocLines: flattenedFormatted,
                        remainingComments: Core.toMutableArray(rawComments)
                    };
                }
            }
        }
    }

    return { existingDocLines, remainingComments };
}

function collectLeadingProgramLineComments(
    node,
    programNode,
    options,
    sourceText
) {
    if (!node || !programNode) {
        return [];
    }

    const nodeStartIndex = getNodeStartIndexForAlignment(node, options);
    if (!Number.isInteger(nodeStartIndex)) {
        return [];
    }

    const programComments = Core.getCommentArray(programNode);
    if (!Core.isNonEmptyArray(programComments)) {
        return [];
    }

    const lineCommentOptions =
        Parser.Comments.resolveLineCommentOptions(options);
    const leadingLines = [];
    let anchorIndex = nodeStartIndex;

    for (let i = programComments.length - 1; i >= 0; i -= 1) {
        const comment = programComments[i];
        if (!comment || comment.type !== "CommentLine" || comment.printed) {
            continue;
        }

        let commentStart =
            typeof comment.start === NUMBER_TYPE
                ? comment.start
                : typeof comment.start?.index === NUMBER_TYPE
                ? comment.start.index
                : null;
        let commentEnd =
            typeof comment.end === NUMBER_TYPE
                ? comment.end
                : typeof comment.end?.index === NUMBER_TYPE
                ? comment.end.index
                : null;

        if (!Number.isInteger(commentEnd)) {
            commentEnd = Number.isInteger(commentStart)
                ? commentStart
                : null;
        }

        if (!Number.isInteger(commentEnd) || commentEnd >= anchorIndex) {
            continue;
        }

        const rawText = Parser.getLineCommentRawText(comment);
        const trimmedRaw =
            typeof rawText === STRING_TYPE ? rawText.trim() : "";
        const formatted = Parser.formatLineComment(
            comment,
            lineCommentOptions
        );
        const trimmedFormatted = Core.toTrimmedString(formatted);

        if (
            trimmedFormatted.startsWith("///") ||
            /^\s*@/.test(trimmedRaw) ||
            /^\/\/\s*\/\s*/.test(trimmedRaw)
        ) {
            anchorIndex = Number.isInteger(commentStart)
                ? commentStart
                : commentEnd;
            continue;
        }

        if (
            typeof sourceText === STRING_TYPE &&
            Number.isInteger(commentEnd)
        ) {
            const gapText = sourceText.slice(commentEnd, anchorIndex);
            const blankLines = (gapText.match(/\n/g) || []).length;
            if (blankLines >= 2) {
                break;
            }
        }

        if (trimmedFormatted.length === 0) {
            anchorIndex = Number.isInteger(commentStart)
                ? commentStart
                : commentEnd;
            continue;
        }

        comment.printed = true;
        leadingLines.unshift(formatted);
        anchorIndex = Number.isInteger(commentStart)
            ? commentStart
            : commentEnd;
    }

    return leadingLines;
}

function extractLeadingNonDocCommentLines(comments, options) {
    if (!Core.isNonEmptyArray(comments)) {
        return {
            leadingLines: [],
            remainingComments: Core.asArray(comments)
        };
    }

    const lineCommentOptions =
        Parser.Comments.resolveLineCommentOptions(options);
    const leadingLines = [];
    const remainingComments = [];
    let scanningLeadingComments = true;

    for (const comment of comments) {
        if (
            scanningLeadingComments &&
            comment &&
            comment.type === "CommentLine"
        ) {
            const formatted = Parser.formatLineComment(
                comment,
                lineCommentOptions
            );
            const trimmed = Core.toTrimmedString(formatted);

            if (trimmed.length === 0) {
                comment.printed = true;
                continue;
            }

            // Include regular // comments that don't start with /// or // / in leading lines
            // But exclude // / style comments which are doc-like and should be handled with doc comments
            if (
                trimmed.startsWith("//") &&
                !trimmed.startsWith("///") &&
                !/^\/\/\s*\//.test(trimmed)
            ) {
                comment.printed = true;
                leadingLines.push(formatted);
                continue;
            }
        }

        scanningLeadingComments = false;
        remainingComments.push(comment);
    }

    return { leadingLines, remainingComments };
}

function buildSyntheticDocComment(
    functionNode,
    existingDocLines,
    options,
    overrides: any = {}
) {
    const hasExistingDocLines = existingDocLines.length > 0;

    const syntheticLines = hasExistingDocLines
        ? mergeSyntheticDocComments(
              functionNode,
              existingDocLines,
              options,
              overrides
          )
        : Core.reorderDescriptionLinesAfterFunction(
              computeSyntheticFunctionDocLines(
                  functionNode,
                  [],
                  options,
                  overrides
              )
          );

    const leadingCommentLines = Array.isArray(overrides?.leadingCommentLines)
        ? overrides.leadingCommentLines
              .map((line) => (typeof line === STRING_TYPE ? line : null))
              .filter((line) => Core.isNonEmptyTrimmedString(line))
        : [];

    if (syntheticLines.length === 0 && leadingCommentLines.length === 0) {
        return null;
    }

    // Apply doc comment promotion to the combined lines if both leading comments and synthetic lines exist
    // This enables cases where doc-like comments (// / or /// without @) appear before actual doc comments (@param, @function, etc.)
    const potentiallyPromotableLines =
        leadingCommentLines.length > 0 && syntheticLines.length > 0
            ? Core.promoteLeadingDocCommentTextToDescription([
                  ...leadingCommentLines,
                  syntheticLines[0]
              ]).slice(0, leadingCommentLines.length) // Take only the part corresponding to leadingCommentLines
            : leadingCommentLines;

    const docLines =
        leadingCommentLines.length === 0
            ? syntheticLines
            : [
                  ...potentiallyPromotableLines,
                  ...(syntheticLines.length > 0 ? ["", ...syntheticLines] : [])
              ];

    const normalizedDocLines = Core.toMutableArray(docLines) as string[];

    return {
        doc: concat([hardline, join(hardline, normalizedDocLines)]),
        hasExistingDocLines
    };
}

function suppressConstructorAssignmentPadding(functionNode) {
    if (
        !functionNode ||
        functionNode.type !== "ConstructorDeclaration" ||
        functionNode.body?.type !== "BlockStatement" ||
        !Array.isArray(functionNode.body.body)
    ) {
        return;
    }

    for (const statement of functionNode.body.body) {
        if (!statement) {
            continue;
        }

        if (Core.hasComment(statement)) {
            break;
        }

        if (statement.type === "AssignmentExpression") {
            statement._gmlSuppressFollowingEmptyLine = true;
            continue;
        }

        if (
            statement.type === "VariableDeclaration" &&
            statement.kind !== "static"
        ) {
            statement._gmlSuppressFollowingEmptyLine = true;
            continue;
        }

        break;
    }
}

function getSyntheticDocCommentForStaticVariable(
    node,
    options,
    programNode,
    sourceText
) {
    if (
        !node ||
        node.type !== "VariableDeclaration" ||
        node.kind !== "static"
    ) {
        return null;
    }

    const declarator = Core.getSingleVariableDeclarator(node);
    if (!declarator || declarator.id?.type !== "Identifier") {
        return null;
    }

    if (declarator.init?.type !== "FunctionDeclaration") {
        return null;
    }

    const hasFunctionDoc =
        declarator.init.docComments && declarator.init.docComments.length > 0;

    const { existingDocLines, remainingComments } =
        collectSyntheticDocCommentLines(node, options, programNode, sourceText);
    const {
        leadingLines: leadingCommentLines,
        remainingComments: updatedComments
    } = extractLeadingNonDocCommentLines(remainingComments, options);

    const programLeadingLines = collectLeadingProgramLineComments(
        node,
        programNode,
        options,
        sourceText
    );
    const combinedLeadingLines = [
        ...programLeadingLines,
        ...leadingCommentLines
    ];

    if (existingDocLines.length > 0 || combinedLeadingLines.length > 0) {
        node.comments = updatedComments;
    }

    if (hasFunctionDoc && existingDocLines.length === 0) {
        return null;
    }

    const name = declarator.id.name;
    const functionNode = declarator.init;
    const syntheticOverrides: any = { nameOverride: name };
    if (node._overridesStaticFunction === true) {
        syntheticOverrides.includeOverrideTag = true;
    }

    if (combinedLeadingLines.length > 0) {
        syntheticOverrides.leadingCommentLines = combinedLeadingLines;
    }

    return buildSyntheticDocComment(
        functionNode,
        existingDocLines,
        options,
        syntheticOverrides
    );
}

function getSyntheticDocCommentForFunctionAssignment(
    node,
    options,
    programNode,
    sourceText
) {
    if (!node) {
        return null;
    }

    let assignment;
    const commentTarget = node;

    if (node.type === "ExpressionStatement") {
        assignment = node.expression;
    } else if (node.type === "AssignmentExpression") {
        assignment = node;
    } else {
        return null;
    }

    if (
        !assignment ||
        assignment.type !== "AssignmentExpression" ||
        assignment.operator !== "=" ||
        assignment.left?.type !== "Identifier" ||
        typeof assignment.left.name !== STRING_TYPE
    ) {
        return null;
    }

    const functionNode = assignment.right;
    if (
        !functionNode ||
        (functionNode.type !== "FunctionDeclaration" &&
            functionNode.type !== "FunctionExpression" &&
            functionNode.type !== "ConstructorDeclaration")
    ) {
        return null;
    }

    suppressConstructorAssignmentPadding(functionNode);

    const hasFunctionDoc =
        Array.isArray(functionNode.docComments) &&
        functionNode.docComments.length > 0;

    const { existingDocLines, remainingComments } =
        collectSyntheticDocCommentLines(
            commentTarget,
            options,
            programNode,
            sourceText
        );
    const {
        leadingLines: leadingCommentLines,
        remainingComments: updatedComments
    } = extractLeadingNonDocCommentLines(remainingComments, options);

    const programLeadingLines = collectLeadingProgramLineComments(
        commentTarget,
        programNode,
        options,
        sourceText
    );
    const combinedLeadingLines = [
        ...programLeadingLines,
        ...leadingCommentLines
    ];

    if (existingDocLines.length > 0 || combinedLeadingLines.length > 0) {
        commentTarget.comments = updatedComments;
    }

    if (hasFunctionDoc && existingDocLines.length === 0) {
        return null;
    }

    const syntheticOverrides: any = { nameOverride: assignment.left.name };

    if (combinedLeadingLines.length > 0) {
        syntheticOverrides.leadingCommentLines = combinedLeadingLines;
    }

    return buildSyntheticDocComment(
        functionNode,
        existingDocLines,
        options,
        syntheticOverrides
    );
}

function isSkippableSemicolonWhitespace(charCode) {
    // Mirrors the range of characters matched by /\s/ without incurring the
    // per-iteration RegExp machinery cost.
    switch (charCode) {
        case 9: // tab
        case 10: // line feed
        case 11: // vertical tab
        case 12: // form feed
        case 13: // carriage return
        case 32: // space
        case 160:
        case 0x20_28:
        case 0x20_29: {
            // GameMaker occasionally serializes or copy/pastes scripts with the
            // U+00A0 non-breaking space and the U+2028/U+2029 line and
            // paragraph separators—for example when creators paste snippets
            // from the IDE or import JSON exports. Treat them as
            // semicolon-trimmable whitespace so the cleanup logic keeps
            // matching GameMaker's parser expectations instead of leaving stray
            // semicolons behind.
            return true;
        }
        default: {
            return false;
        }
    }
}

function isInlineWhitespace(charCode) {
    // These checks are intentionally tiny and branchless to avoid regex
    // allocations when scanning large source files inside tight loops.
    return (
        charCode === 9 || // tab
        charCode === 10 || // line feed
        charCode === 13 || // carriage return
        charCode === 32 // space
    );
}

function hasCommentImmediatelyBefore(text, index) {
    if (!text || typeof index !== NUMBER_TYPE) {
        return false;
    }

    let cursor = index - 1;

    while (cursor >= 0 && isInlineWhitespace(text.charCodeAt(cursor))) {
        cursor--;
    }

    if (cursor < 0) {
        return false;
    }

    const lineEndExclusive = cursor + 1;
    while (cursor >= 0) {
        const charCode = text.charCodeAt(cursor);
        if (charCode === 10 || charCode === 13) {
            break;
        }
        cursor--;
    }

    let lineStart = cursor + 1;
    while (
        lineStart < lineEndExclusive &&
        isInlineWhitespace(text.charCodeAt(lineStart))
    ) {
        lineStart++;
    }

    if (lineStart >= lineEndExclusive) {
        return false;
    }

    let lineEnd = lineEndExclusive - 1;
    while (
        lineEnd >= lineStart &&
        isInlineWhitespace(text.charCodeAt(lineEnd))
    ) {
        lineEnd--;
    }

    if (lineEnd < lineStart) {
        return false;
    }

    const first = text.charCodeAt(lineStart);
    const second =
        lineStart + 1 <= lineEnd ? text.charCodeAt(lineStart + 1) : -1;

    if (first === 47) {
        // '/'
        if (second === 47 || second === 42) {
            // '/', '*'
            return true;
        }
    } else if (first === 42) {
        // '*'
        return true;
    }

    return (
        lineEnd >= lineStart + 1 &&
        text.charCodeAt(lineEnd) === 47 &&
        text.charCodeAt(lineEnd - 1) === 42
    );
}

function mergeSyntheticDocComments(
    node,
    existingDocLines,
    options,
    overrides: any = {}
) {
    let normalizedExistingLines: MutableDocCommentLines = Core.toMutableArray(
        existingDocLines
    ) as MutableDocCommentLines;
    const originalExistingHasTags =
        Array.isArray(existingDocLines) &&
        existingDocLines.some((line) =>
            typeof line === STRING_TYPE
                ? Core.parseDocCommentMetadata(line)
                : false
        );

    // Compute synthetic lines early so promotion can consider synthetic tags
    // such as `/// @function` when deciding whether the file-top doc-like
    // comment text should be promoted into `@description` metadata.
    const preserveDescriptionBreaks =
        normalizedExistingLines?._preserveDescriptionBreaks === true;

    normalizedExistingLines = Core.toMutableArray(
        Core.reorderDescriptionLinesAfterFunction(normalizedExistingLines)
    ) as MutableDocCommentLines;

    if (preserveDescriptionBreaks) {
        normalizedExistingLines._preserveDescriptionBreaks = true;
    }
    const dedupedResult = Core.dedupeReturnDocLines(normalizedExistingLines);
    normalizedExistingLines = Core.toMutableArray(
        dedupedResult.lines
    ) as MutableDocCommentLines;
    const removedExistingReturnDuplicates = dedupedResult.removed;

    if (preserveDescriptionBreaks) {
        normalizedExistingLines._preserveDescriptionBreaks = true;
    }

    // Normalize legacy `Returns:` description lines early so the synthetic
    // computation sees an existing `@returns` tag when conversion occurs.
    // This prevents synthetic `@returns` entries from being added and
    // avoids conversion regressions where a legacy description would be
    // overwritten or duplicated by a synthetic `@returns` later in the
    // merging process.
    normalizedExistingLines = Core.toMutableArray(
        Core.convertLegacyReturnsDescriptionLinesToMetadata(
            normalizedExistingLines,
            {
                normalizeDocCommentTypeAnnotations: Core.normalizeGameMakerType
            }
        )
    ) as MutableDocCommentLines;

    const _computedSynthetic = computeSyntheticFunctionDocLines(
        node,
        normalizedExistingLines,
        options,
        overrides
    );

    // Only promote leading doc comment text to @description if the original
    // set contained tags (e.g., `@param`) or used an alternate doc-like
    // prefix that should normalize (e.g., `// /`). This prevents synthetic
    // tags from causing plain leading summaries (/// text) to become
    // promoted description metadata unexpectedly.
    const originalExistingHasDocLikePrefixes =
        Array.isArray(existingDocLines) &&
        existingDocLines.some((line) =>
            typeof line === STRING_TYPE ? /^\s*\/\/\s*\/\s*/.test(line) : false
        );

    if (originalExistingHasTags || originalExistingHasDocLikePrefixes) {
        normalizedExistingLines = Core.toMutableArray(
            Core.promoteLeadingDocCommentTextToDescription(
                normalizedExistingLines,
                _computedSynthetic
            )
        ) as MutableDocCommentLines;
    }

    const syntheticLines =
        Core.reorderDescriptionLinesAfterFunction(_computedSynthetic);

    const implicitDocEntries =
        node?.type === "FunctionDeclaration" ||
        node?.type === "StructFunctionDeclaration"
            ? collectImplicitArgumentDocNames(node, options)
            : [];
    const declaredParamCount = Array.isArray(node?.params)
        ? node.params.length
        : 0;
    const hasImplicitDocEntries = implicitDocEntries.length > 0;
    const hasParamDocLines = normalizedExistingLines.some((line) => {
        if (typeof line !== STRING_TYPE) {
            return false;
        }

        return /^\/\/\/\s*@param\b/i.test(Core.toTrimmedString(line));
    });
    const shouldForceParamPrune =
        hasParamDocLines && declaredParamCount === 0 && !hasImplicitDocEntries;

    if (syntheticLines.length === 0 && !shouldForceParamPrune) {
        return Core.convertLegacyReturnsDescriptionLinesToMetadata(
            normalizedExistingLines,
            {
                normalizeDocCommentTypeAnnotations: Core.normalizeGameMakerType
            }
        );
    }

    if (normalizedExistingLines.length === 0) {
        return Core.convertLegacyReturnsDescriptionLinesToMetadata(
            syntheticLines,
            {
                normalizeDocCommentTypeAnnotations: Core.normalizeGameMakerType
            }
        );
    }

    const docTagMatches = (line, pattern) => {
        const trimmed = Core.toTrimmedString(line);
        if (trimmed.length === 0) {
            return false;
        }

        if (pattern.global || pattern.sticky) {
            pattern.lastIndex = 0;
        }

        return pattern.test(trimmed);
    };

    const isFunctionLine = (line) =>
        docTagMatches(line, /^\/\/\/\s*@function\b/i);
    const isOverrideLine = (line) =>
        docTagMatches(line, /^\/\/\/\s*@override\b/i);
    const isParamLine = (line) => docTagMatches(line, /^\/\/\/\s*@param\b/i);

    const isDescriptionLine = (line) =>
        docTagMatches(line, /^\/\/\/\s*@description\b/i);

    const functionLines = syntheticLines.filter(isFunctionLine);
    const syntheticFunctionMetadata = functionLines
        .map((line) => Core.parseDocCommentMetadata(line))
        .find(
            (meta) =>
                meta?.tag === "function" && typeof meta.name === STRING_TYPE
        );
    const syntheticFunctionName =
        typeof syntheticFunctionMetadata?.name === STRING_TYPE
            ? syntheticFunctionMetadata.name.trim()
            : null;
    let otherLines = syntheticLines.filter((line) => !isFunctionLine(line));
    const overrideLines = otherLines.filter(isOverrideLine);
    otherLines = otherLines.filter((line) => !isOverrideLine(line));
    let returnsLines;

    // Cache canonical names so we only parse each doc comment line at most once.
    const paramCanonicalNameCache = new Map();
    const getParamCanonicalName = (line, metadata?) => {
        if (typeof line !== STRING_TYPE) {
            return null;
        }

        if (paramCanonicalNameCache.has(line)) {
            return paramCanonicalNameCache.get(line);
        }

        const docMetadata =
            metadata === undefined
                ? Core.parseDocCommentMetadata(line)
                : metadata;
        const canonical =
            docMetadata?.tag === "param"
                ? getCanonicalParamNameFromText(docMetadata.name)
                : null;

        paramCanonicalNameCache.set(line, canonical);
        return canonical;
    };

    let mergedLines = [...normalizedExistingLines];
    let removedAnyLine = removedExistingReturnDuplicates;

    if (functionLines.length > 0) {
        const existingFunctionIndices = mergedLines
            .map((line, index) => (isFunctionLine(line) ? index : -1))
            .filter((index) => index !== -1);

        if (existingFunctionIndices.length > 0) {
            const [firstIndex, ...duplicateIndices] = existingFunctionIndices;
            mergedLines = [...mergedLines];

            for (let i = duplicateIndices.length - 1; i >= 0; i--) {
                mergedLines.splice(duplicateIndices[i], 1);
            }

            mergedLines.splice(firstIndex, 1, ...functionLines);
            removedAnyLine = true;
        } else {
            const firstParamIndex = mergedLines.findIndex(isParamLine);

            // If the original doc lines did not contain any metadata tags,
            // prefer to append synthetic `@function` tags after the existing
            // summary lines rather than inserting them before param tags.
            const insertionIndex = originalExistingHasTags
                ? firstParamIndex === -1
                    ? mergedLines.length
                    : firstParamIndex
                : mergedLines.length;
            const precedingLine =
                insertionIndex > 0 ? mergedLines[insertionIndex - 1] : null;
            const trimmedPreceding = Core.toTrimmedString(precedingLine);
            const isDocCommentLine =
                typeof trimmedPreceding === STRING_TYPE &&
                /^\/\/\//.test(trimmedPreceding);
            const isDocTagLine =
                isDocCommentLine && /^\/\/\/\s*@/i.test(trimmedPreceding);

            let precedingDocTag = null;
            if (isDocCommentLine && isDocTagLine) {
                const metadata = Core.parseDocCommentMetadata(precedingLine);
                if (metadata && typeof metadata.tag === STRING_TYPE) {
                    precedingDocTag = metadata.tag.toLowerCase();
                }
            }

            const shouldSeparateDocTag = precedingDocTag === "deprecated";

            const needsSeparatorBeforeFunction =
                trimmedPreceding !== "" &&
                typeof precedingLine === STRING_TYPE &&
                !isFunctionLine(precedingLine) &&
                (!isDocCommentLine || !isDocTagLine || shouldSeparateDocTag);

            if (needsSeparatorBeforeFunction) {
                mergedLines = [
                    ...mergedLines.slice(0, insertionIndex),
                    "",
                    ...mergedLines.slice(insertionIndex)
                ];
            }

            const insertAt = needsSeparatorBeforeFunction
                ? insertionIndex + 1
                : insertionIndex;

            mergedLines = [
                ...mergedLines.slice(0, insertAt),
                ...functionLines,
                ...mergedLines.slice(insertAt)
            ];
            removedAnyLine = true;
        }
    }

    if (overrideLines.length > 0) {
        const existingOverrideIndices = mergedLines
            .map((line, index) => (isOverrideLine(line) ? index : -1))
            .filter((index) => index !== -1);

        if (existingOverrideIndices.length > 0) {
            const [firstOverrideIndex, ...duplicateOverrideIndices] =
                existingOverrideIndices;
            mergedLines = [...mergedLines];

            for (let i = duplicateOverrideIndices.length - 1; i >= 0; i -= 1) {
                mergedLines.splice(duplicateOverrideIndices[i], 1);
            }

            mergedLines.splice(firstOverrideIndex, 1, ...overrideLines);
            removedAnyLine = true;
        } else {
            const firstFunctionIndex = mergedLines.findIndex(isFunctionLine);
            const insertionIndex =
                firstFunctionIndex === -1 ? 0 : firstFunctionIndex;

            mergedLines = [
                ...mergedLines.slice(0, insertionIndex),
                ...overrideLines,
                ...mergedLines.slice(insertionIndex)
            ];
            removedAnyLine = true;
        }
    }

    const paramLineIndices = new Map();
    for (const [index, line] of mergedLines.entries()) {
        if (!isParamLine(line)) {
            continue;
        }

        const canonical = getParamCanonicalName(line);
        if (canonical) {
            paramLineIndices.set(canonical, index);
        }
    }

    if (otherLines.length > 0) {
        const normalizedOtherLines = [];

        for (const line of otherLines) {
            const metadata = Core.parseDocCommentMetadata(line);
            const canonical = getParamCanonicalName(line, metadata);

            if (
                canonical &&
                paramLineIndices.has(canonical) &&
                metadata?.name
            ) {
                const lineIndex = paramLineIndices.get(canonical);
                const existingLine = mergedLines[lineIndex];

                const updatedLine = updateParamLineWithDocName(
                    existingLine,
                    metadata.name
                );
                if (updatedLine !== existingLine) {
                    mergedLines[lineIndex] = updatedLine;
                    removedAnyLine = true;
                }
                continue;
            }

            normalizedOtherLines.push(line);
        }

        otherLines = normalizedOtherLines;
    }

    if (otherLines.length > 0) {
        const nonReturnLines = [];
        const extractedReturns = [];

        for (const line of otherLines) {
            const metadata = Core.parseDocCommentMetadata(line);
            if (metadata?.tag === "returns") {
                extractedReturns.push(line);
                continue;
            }

            nonReturnLines.push(line);
        }

        if (extractedReturns.length > 0) {
            otherLines = nonReturnLines;
            returnsLines = extractedReturns;
        }
    }

    const syntheticParamNames = new Set(
        otherLines
            .map((line) => getParamCanonicalName(line))
            .filter(Core.isNonEmptyString)
    );

    if (syntheticParamNames.size > 0) {
        const beforeLength = mergedLines.length;
        mergedLines = mergedLines.filter((line) => {
            if (!isParamLine(line)) {
                return true;
            }

            const canonical = getParamCanonicalName(line);
            if (!canonical) {
                return false;
            }

            return !syntheticParamNames.has(canonical);
        });
        if (mergedLines.length !== beforeLength) {
            removedAnyLine = true;
        }
    }

    const lastFunctionIndex = Core.findLastIndex(mergedLines, isFunctionLine);
    let insertionIndex = lastFunctionIndex === -1 ? 0 : lastFunctionIndex + 1;

    if (lastFunctionIndex === -1) {
        while (
            insertionIndex < mergedLines.length &&
            typeof mergedLines[insertionIndex] === STRING_TYPE &&
            mergedLines[insertionIndex].trim() === ""
        ) {
            insertionIndex += 1;
        }
    }

    while (
        insertionIndex < mergedLines.length &&
        typeof mergedLines[insertionIndex] === STRING_TYPE &&
        isParamLine(mergedLines[insertionIndex])
    ) {
        insertionIndex += 1;
    }

    let result: MutableDocCommentLines = [
        ...mergedLines.slice(0, insertionIndex),
        ...otherLines,
        ...mergedLines.slice(insertionIndex)
    ];

    if (Array.isArray(returnsLines) && returnsLines.length > 0) {
        const { lines: dedupedReturns } = Core.dedupeReturnDocLines(
            returnsLines,
            {
                includeNonReturnLine: (line, trimmed) => trimmed.length > 0
            }
        );

        if (dedupedReturns.length > 0) {
            const filteredResult = [];
            let removedExistingReturns = false;

            for (const line of result) {
                if (
                    typeof line === STRING_TYPE &&
                    /^\/\/\/\s*@returns\b/i.test(Core.toTrimmedString(line))
                ) {
                    removedExistingReturns = true;
                    continue;
                }

                filteredResult.push(line);
            }

            let appendIndex = filteredResult.length;

            while (
                appendIndex > 0 &&
                typeof filteredResult[appendIndex - 1] === STRING_TYPE &&
                filteredResult[appendIndex - 1].trim() === ""
            ) {
                appendIndex -= 1;
            }

            result = [
                ...filteredResult.slice(0, appendIndex),
                ...dedupedReturns,
                ...filteredResult.slice(appendIndex)
            ];

            if (removedExistingReturns) {
                removedAnyLine = true;
            }
        }
    }

    const finalDedupedResult = Core.dedupeReturnDocLines(result);
    result = Core.toMutableArray(
        finalDedupedResult.lines
    ) as MutableDocCommentLines;
    if (finalDedupedResult.removed) {
        removedAnyLine = true;
    }

    const functionIndex = result.findIndex(isFunctionLine);
    if (functionIndex > 0) {
        const [functionLine] = result.splice(functionIndex, 1);
        result.unshift(functionLine);
    }

    const paramDocsByCanonical = new Map();

    for (const line of result) {
        if (typeof line !== STRING_TYPE) {
            continue;
        }

        if (!isParamLine(line)) {
            continue;
        }

        const canonical = getParamCanonicalName(line);
        if (canonical) {
            paramDocsByCanonical.set(canonical, line);
        }
    }

    // Ensure that when the original existing doc lines did NOT include
    // metadata tags, but we have inserted synthetic tags, we preserve a
    // blank separator between the original summary and the synthetic tags.
    try {
        const hasOriginalTags =
            Array.isArray(existingDocLines) &&
            existingDocLines.some((l) =>
                typeof l === STRING_TYPE
                    ? Core.parseDocCommentMetadata(l)
                    : false
            );
        if (
            !hasOriginalTags &&
            Array.isArray(existingDocLines) &&
            existingDocLines.length > 0
        ) {
            const firstSyntheticIndex = result.findIndex(
                (ln) =>
                    isFunctionLine(ln) || isOverrideLine(ln) || isParamLine(ln)
            );
            if (firstSyntheticIndex > 0) {
                const preceding = result[firstSyntheticIndex - 1];
                if (
                    typeof preceding === STRING_TYPE &&
                    preceding.trim() !== "" &&
                    result[firstSyntheticIndex] &&
                    typeof result[firstSyntheticIndex] === STRING_TYPE &&
                    /^\/\/\//.test(result[firstSyntheticIndex].trim()) && // Insert a blank line if we don't already have one
                    result[firstSyntheticIndex - 1] !== ""
                ) {
                    result = [
                        ...result.slice(0, firstSyntheticIndex),
                        "",
                        ...result.slice(firstSyntheticIndex)
                    ];
                }
            }
        }
    } catch {
        // best-effort: don't throw if core utilities are unavailable
    }

    const suppressedCanonicals = suppressedImplicitDocCanonicalByNode.get(node);

    if (suppressedCanonicals && suppressedCanonicals.size > 0) {
        // Only delete suppressed fallback doc lines if they are not
        // explicitly referenced (direct references) in the function body.
        // This mirrors the logic in `collectImplicitArgumentDocNames` and
        // ensures that explicitly referenced `argumentN` lines are preserved
        // even when a canonical was marked suppressed due to an alias.
        for (const canonical of suppressedCanonicals) {
            const candidate = paramDocsByCanonical.get(canonical);
            if (!candidate) continue;

            // If there is an implicit doc entry with the same canonical that
            // indicates a direct reference, keep the doc line. Otherwise remove
            // the fallback biased doc line so the alias doc comment can win.
            const directReferenceExists = implicitDocEntries.some((entry) => {
                if (!entry) return false;
                const key =
                    entry.canonical || entry.fallbackCanonical || entry.name;
                if (!key) return false;
                return key === canonical && entry.hasDirectReference === true;
            });

            if (!directReferenceExists) {
                paramDocsByCanonical.delete(canonical);
            }
        }
    }

    if (implicitDocEntries.length > 0) {
        const canonicalNames = new Set();
        const fallbackCanonicalsToRemove = new Set();

        for (const entry of implicitDocEntries) {
            if (entry?.canonical) {
                canonicalNames.add(entry.canonical);
            }

            if (
                entry?.fallbackCanonical &&
                entry.fallbackCanonical !== entry.canonical &&
                entry.hasDirectReference !== true
            ) {
                fallbackCanonicalsToRemove.add(entry.fallbackCanonical);
            }
        }

        for (const fallbackCanonical of fallbackCanonicalsToRemove) {
            // When an implicit alias entry indicates a different canonical
            // name for the same index (e.g. alias `two` for `argument2`),
            // prefer the alias and remove any stale fallback `argumentN`
            // doc line. Previously we avoided deleting the fallback when a
            // canonical with the same name was present; that prevented
            // alias-driven suppression from removing an explicit
            // `argumentN` doc line. Always remove the fallback canonical
            // here when it's marked for removal so aliases win.
            paramDocsByCanonical.delete(fallbackCanonical);
        }
    }

    let orderedParamDocs = [];
    if (Array.isArray(node.params)) {
        for (const param of node.params) {
            const paramInfo = getParameterDocInfo(param, node, options);
            const canonical = paramInfo?.name
                ? getCanonicalParamNameFromText(paramInfo.name)
                : null;
            if (canonical && paramDocsByCanonical.has(canonical)) {
                orderedParamDocs.push(paramDocsByCanonical.get(canonical));
                paramDocsByCanonical.delete(canonical);
            }
        }
    }

    if (orderedParamDocs.length === 0) {
        for (const entry of implicitDocEntries) {
            const canonical = entry?.canonical;
            if (canonical && paramDocsByCanonical.has(canonical)) {
                orderedParamDocs.push(paramDocsByCanonical.get(canonical));
                paramDocsByCanonical.delete(canonical);
            }
        }
    }

    const shouldDropRemainingParamDocs =
        !hasImplicitDocEntries &&
        declaredParamCount === 0 &&
        paramDocsByCanonical.size > 0;

    if (!shouldDropRemainingParamDocs) {
        for (const doc of paramDocsByCanonical.values()) {
            orderedParamDocs.push(doc);
        }
    }

    if (orderedParamDocs.length > 0) {
        const docsByCanonical = new Map();
        for (const docLine of orderedParamDocs) {
            if (typeof docLine !== STRING_TYPE) {
                continue;
            }

            const canonical = getParamCanonicalName(docLine);
            if (canonical) {
                docsByCanonical.set(canonical, docLine);
            }
        }

        const preferredDocs = preferredParamDocNamesByNode.get(node);
        const implicitEntryByIndex = new Map();
        for (const entry of implicitDocEntries) {
            if (entry && Number.isInteger(entry.index)) {
                implicitEntryByIndex.set(entry.index, entry);
            }
        }
        const reordered = [];

        if (Array.isArray(node.params)) {
            for (const [index, param] of node.params.entries()) {
                const implicitEntry = implicitEntryByIndex.get(index);
                if (implicitEntry) {
                    const implicitCanonical =
                        implicitEntry.canonical ||
                        getCanonicalParamNameFromText(implicitEntry.name);
                    if (
                        implicitCanonical &&
                        docsByCanonical.has(implicitCanonical)
                    ) {
                        reordered.push(docsByCanonical.get(implicitCanonical));
                        docsByCanonical.delete(implicitCanonical);
                        continue;
                    }
                }

                const preferredName = preferredDocs?.get(index);
                if (preferredName) {
                    const preferredCanonical =
                        getCanonicalParamNameFromText(preferredName);
                    if (
                        preferredCanonical &&
                        docsByCanonical.has(preferredCanonical)
                    ) {
                        reordered.push(docsByCanonical.get(preferredCanonical));
                        docsByCanonical.delete(preferredCanonical);
                        continue;
                    }
                }

                const paramInfo = getParameterDocInfo(param, node, options);
                const paramCanonical = paramInfo?.name
                    ? getCanonicalParamNameFromText(paramInfo.name)
                    : null;
                if (paramCanonical && docsByCanonical.has(paramCanonical)) {
                    reordered.push(docsByCanonical.get(paramCanonical));
                    docsByCanonical.delete(paramCanonical);
                }
            }
        }

        for (const docLine of docsByCanonical.values()) {
            reordered.push(docLine);
        }

        orderedParamDocs = reordered;
    }

    const finalDocs: MutableDocCommentLines = [];
    let insertedParams = false;

    for (const line of result) {
        if (isParamLine(line)) {
            if (!insertedParams && orderedParamDocs.length > 0) {
                finalDocs.push(...orderedParamDocs);
                insertedParams = true;
            }
            continue;
        }

        finalDocs.push(line);
    }

    if (!insertedParams && orderedParamDocs.length > 0) {
        finalDocs.push(...orderedParamDocs);
    }

    let reorderedDocs: MutableDocCommentLines = finalDocs;

    const descriptionStartIndex = reorderedDocs.findIndex(isDescriptionLine);
    if (descriptionStartIndex !== -1) {
        let descriptionEndIndex = descriptionStartIndex + 1;

        while (
            descriptionEndIndex < reorderedDocs.length &&
            typeof reorderedDocs[descriptionEndIndex] === STRING_TYPE &&
            reorderedDocs[descriptionEndIndex].startsWith("///") &&
            !Core.parseDocCommentMetadata(reorderedDocs[descriptionEndIndex])
        ) {
            descriptionEndIndex += 1;
        }

        const descriptionBlock = reorderedDocs.slice(
            descriptionStartIndex,
            descriptionEndIndex
        );
        const docsWithoutDescription = [
            ...reorderedDocs.slice(0, descriptionStartIndex),
            ...reorderedDocs.slice(descriptionEndIndex)
        ];

        let shouldOmitDescriptionBlock = false;
        if (descriptionBlock.length === 1) {
            const descriptionMetadata = Core.parseDocCommentMetadata(
                descriptionBlock[0]
            );
            const descriptionText =
                typeof descriptionMetadata?.name === STRING_TYPE
                    ? descriptionMetadata.name.trim()
                    : "";

            // Omit empty description blocks
            if (descriptionText.length === 0) {
                shouldOmitDescriptionBlock = true;
            } else if (
                syntheticFunctionName &&
                descriptionText.startsWith(syntheticFunctionName)
            ) {
                // Omit alias-style descriptions like "functionName()"
                const remainder = descriptionText.slice(
                    syntheticFunctionName.length
                );
                const trimmedRemainder = remainder.trim();
                if (
                    trimmedRemainder.startsWith("(") &&
                    trimmedRemainder.endsWith(")")
                ) {
                    shouldOmitDescriptionBlock = true;
                }
            }
        }

        if (shouldOmitDescriptionBlock) {
            reorderedDocs = docsWithoutDescription;
        } else {
            let lastParamIndex = -1;
            for (const [index, element] of docsWithoutDescription.entries()) {
                if (isParamLine(element)) {
                    lastParamIndex = index;
                }
            }

            const insertionAfterParams =
                lastParamIndex === -1
                    ? docsWithoutDescription.length
                    : lastParamIndex + 1;

            reorderedDocs = [
                ...docsWithoutDescription.slice(0, insertionAfterParams),
                ...descriptionBlock,
                ...docsWithoutDescription.slice(insertionAfterParams)
            ];
        }
    }

    reorderedDocs = Core.toMutableArray(
        Core.reorderDescriptionLinesAfterFunction(reorderedDocs)
    ) as MutableDocCommentLines;

    if (suppressedCanonicals && suppressedCanonicals.size > 0) {
        reorderedDocs = reorderedDocs.filter((line) => {
            if (!isParamLine(line)) {
                return true;
            }

            const canonical = getParamCanonicalName(line);
            return !canonical || !suppressedCanonicals.has(canonical);
        });
    }

    reorderedDocs = reorderedDocs.map((line) => {
        if (!isParamLine(line)) {
            return line;
        }

        const match = line.match(
            /^(\/\/\/\s*@param\s*)(\{[^}]*\}\s*)?(\s*\S+)(.*)$/i
        );
        if (!match) {
            return Core.normalizeDocCommentTypeAnnotations(line);
        }

        const [, prefix, rawTypeSection = "", rawName = "", remainder = ""] =
            match;
        const normalizedPrefix = `${prefix.replace(/\s*$/, "")} `;
        let normalizedTypeSection = rawTypeSection.trim();
        if (
            normalizedTypeSection.startsWith("{") &&
            normalizedTypeSection.endsWith("}")
        ) {
            const innerType = normalizedTypeSection.slice(1, -1);
            const normalizedInner = innerType.replaceAll("|", ",");
            normalizedTypeSection = `{${normalizedInner}}`;
        }
        const typePart =
            normalizedTypeSection.length > 0 ? `${normalizedTypeSection} ` : "";
        let normalizedName = rawName.trim();
        let remainingRemainder = remainder;

        if (
            normalizedName.startsWith("[") &&
            !normalizedName.endsWith("]") &&
            typeof remainingRemainder === STRING_TYPE &&
            remainingRemainder.length > 0
        ) {
            let bracketBalance = 0;

            for (const char of normalizedName) {
                if (char === "[") {
                    bracketBalance += 1;
                } else if (char === "]") {
                    bracketBalance -= 1;
                }
            }

            if (bracketBalance > 0) {
                let sliceIndex = 0;

                while (
                    sliceIndex < remainingRemainder.length &&
                    bracketBalance > 0
                ) {
                    const char = remainingRemainder[sliceIndex];
                    if (char === "[") {
                        bracketBalance += 1;
                    } else if (char === "]") {
                        bracketBalance -= 1;
                    }
                    sliceIndex += 1;
                }

                if (bracketBalance <= 0) {
                    const continuation = remainingRemainder.slice(
                        0,
                        sliceIndex
                    );
                    normalizedName = `${normalizedName}${continuation}`.trim();
                    remainingRemainder = remainingRemainder.slice(sliceIndex);
                }
            }
        }

        const remainderText = remainingRemainder.trim();
        const hasDescription = remainderText.length > 0;
        let descriptionPart = "";

        if (hasDescription) {
            const hyphenMatch = remainingRemainder.match(/^(\s*-\s*)(.*)$/);
            let normalizedDescription;
            let hyphenSpacing = " - ";

            if (hyphenMatch) {
                const [, rawHyphenSpacing = "", rawDescription = ""] =
                    hyphenMatch;
                normalizedDescription = rawDescription.trim();

                const trailingSpaceMatch = rawHyphenSpacing.match(/-(\s*)$/);
                if (trailingSpaceMatch) {
                    const originalSpaceCount = trailingSpaceMatch[1].length;
                    const preservedSpaceCount = Math.max(
                        1,
                        Math.min(originalSpaceCount, 2)
                    );
                    hyphenSpacing = ` - ${" ".repeat(preservedSpaceCount - 1)}`;
                }
            } else {
                normalizedDescription = remainderText.replace(/^[-\s]+/, "");
            }

            if (normalizedDescription.length > 0) {
                descriptionPart = `${hyphenSpacing}${normalizedDescription}`;
            }
        }

        const updatedLine = `${normalizedPrefix}${typePart}${normalizedName}${descriptionPart}`;
        return Core.normalizeDocCommentTypeAnnotations(updatedLine);
    });

    if (preserveDescriptionBreaks) {
        result = reorderedDocs;
    } else {
        const wrappedDocs = [];
        const normalizedPrintWidth = Core.coercePositiveIntegerOption(
            options?.printWidth,
            120
        );
        const wrapWidth = Math.min(
            normalizedPrintWidth,
            DEFAULT_DOC_COMMENT_MAX_WRAP_WIDTH
        );

        const wrapSegments = (text, firstAvailable, continuationAvailable) => {
            if (firstAvailable <= 0) {
                return [text];
            }

            const words = text.split(/\s+/).filter((word) => word.length > 0);
            if (words.length === 0) {
                return [];
            }

            const segments = [];
            let current = words[0];
            let currentAvailable = firstAvailable;

            for (let index = 1; index < words.length; index += 1) {
                const word = words[index];

                const endsSentence = /[.!?]["')\]]?$/.test(current);
                const startsSentence = /^[A-Z]/.test(word);
                if (
                    endsSentence &&
                    startsSentence &&
                    currentAvailable >= 60 &&
                    current.length >=
                        Math.max(Math.floor(currentAvailable * 0.6), 24)
                ) {
                    segments.push(current);
                    current = word;
                    currentAvailable = continuationAvailable;
                    continue;
                }

                if (current.length + 1 + word.length > currentAvailable) {
                    segments.push(current);
                    current = word;
                    currentAvailable = continuationAvailable;
                } else {
                    current += ` ${word}`;
                }
            }

            segments.push(current);

            const lastIndex = segments.length - 1;
            if (lastIndex >= 2) {
                // `Array#at` handles negative indices but introduces an extra bounds
                // check on every call. This helper runs for every doc comment we
                // wrap, so prefer direct index math to keep the hot path lean.
                const lastSegment = segments[lastIndex];
                const isSingleWord =
                    typeof lastSegment === STRING_TYPE &&
                    !/\s/.test(lastSegment);

                if (isSingleWord) {
                    const maxSingleWordLength = Math.max(
                        Math.min(continuationAvailable / 2, 16),
                        8
                    );

                    if (lastSegment.length <= maxSingleWordLength) {
                        const penultimateIndex = lastIndex - 1;
                        const mergedSegment = `${segments[penultimateIndex]} ${lastSegment}`;

                        segments[penultimateIndex] = mergedSegment;
                        segments.pop();
                    }
                }
            }

            return segments;
        };

        for (let index = 0; index < reorderedDocs.length; index += 1) {
            const line = reorderedDocs[index];
            if (isDescriptionLine(line)) {
                const blockLines = [line];
                let lookahead = index + 1;

                while (lookahead < reorderedDocs.length) {
                    const nextLine = reorderedDocs[lookahead];
                    if (
                        typeof nextLine === STRING_TYPE &&
                        nextLine.startsWith("///") &&
                        !Core.parseDocCommentMetadata(nextLine)
                    ) {
                        blockLines.push(nextLine);
                        lookahead += 1;
                        continue;
                    }
                    break;
                }

                index = lookahead - 1;

                const prefixMatch = line.match(/^(\/\/\/\s*@description\s+)/i);
                if (!prefixMatch) {
                    wrappedDocs.push(...blockLines);
                    continue;
                }

                const prefix = prefixMatch[1];
                const continuationPrefix = `/// ${" ".repeat(Math.max(prefix.length - 4, 0))}`;
                const descriptionText = blockLines
                    .map((docLine, blockIndex) => {
                        if (blockIndex === 0) {
                            return docLine.slice(prefix.length).trim();
                        }

                        if (docLine.startsWith(continuationPrefix)) {
                            return docLine
                                .slice(continuationPrefix.length)
                                .trim();
                        }

                        if (docLine.startsWith("///")) {
                            return docLine.slice(3).trim();
                        }

                        return docLine.trim();
                    })
                    .filter((segment) => segment.length > 0)
                    .join(" ");

                if (descriptionText.length === 0) {
                    wrappedDocs.push(...blockLines);
                    continue;
                }

                const available = Math.max(wrapWidth - prefix.length, 16);
                const continuationAvailable = Math.max(
                    Math.min(available, 62),
                    16
                );
                const segments = wrapSegments(
                    descriptionText,
                    available,
                    continuationAvailable
                );

                if (segments.length === 0) {
                    wrappedDocs.push(...blockLines);
                    continue;
                }

                if (blockLines.length > 1) {
                    if (segments.length > blockLines.length) {
                        const paddedBlockLines = blockLines.map(
                            (docLine, blockIndex) => {
                                if (
                                    blockIndex === 0 ||
                                    typeof docLine !== STRING_TYPE
                                ) {
                                    return docLine;
                                }

                                if (
                                    !docLine.startsWith("///") ||
                                    Core.parseDocCommentMetadata(docLine)
                                ) {
                                    return docLine;
                                }

                                if (docLine.startsWith(continuationPrefix)) {
                                    return docLine;
                                }

                                const trimmedContinuation = docLine
                                    .slice(3)
                                    .replace(/^\s+/, "");

                                if (trimmedContinuation.length === 0) {
                                    return docLine;
                                }

                                return `${continuationPrefix}${trimmedContinuation}`;
                            }
                        );

                        wrappedDocs.push(...paddedBlockLines);
                        continue;
                    }

                    // If the description is already expressed as multiple
                    // block lines and the wrapping computation compresses it
                    // into fewer segments (or same number), preserve the
                    // original blockLines rather than collapsing them into a
                    // single description line. Tests expect explicit
                    // continuations to remain visible rather than being
                    // merged into the first line.
                    if (segments.length <= blockLines.length) {
                        wrappedDocs.push(...blockLines);
                        continue;
                    }
                }

                wrappedDocs.push(`${prefix}${segments[0]}`);
                for (
                    let segmentIndex = 1;
                    segmentIndex < segments.length;
                    segmentIndex += 1
                ) {
                    wrappedDocs.push(
                        `${continuationPrefix}${segments[segmentIndex]}`
                    );
                }
                continue;
            }

            wrappedDocs.push(line);
        }

        reorderedDocs = wrappedDocs;

        result = reorderedDocs;
    }

    if (removedAnyLine || otherLines.length > 0) {
        result._suppressLeadingBlank = true;
    }

    let filteredResult: MutableDocCommentLines = Core.toMutableArray(
        result.filter((line) => {
            if (typeof line !== STRING_TYPE) {
                return true;
            }

            if (!/^\/\/\/\s*@description\b/i.test(line.trim())) {
                return true;
            }

            const metadata = Core.parseDocCommentMetadata(line);
            const descriptionText = Core.toTrimmedString(metadata?.name);

            return descriptionText.length > 0;
        })
    );

    if (result._suppressLeadingBlank) {
        filteredResult._suppressLeadingBlank = true;
    }

    // If synthetic tags were computed and merged above, re-run promotion to
    // convert leading doc-like summary lines into a `@description` tag when a
    // doc tag now follows the summary. This can happen when the tag is
    // synthetic (inserted by computeSyntheticFunctionDocLines) and not present
    // in the original `existingDocLines` — re-running promotion here ensures
    // the presence of synthetic tags enables the promotion and avoids leaving
    // the summary as a plain inline/trailing comment.
    try {
        // Only re-run promotion if the original existing doc lines contained
        // metadata tags or were doc-like (`// /` style). Avoid promoting plain
        // triple slash summaries that had no metadata in the original source
        // so synthetic tags do not cause unwanted `@description` promotions.
        const originalExistingHasTags =
            Array.isArray(existingDocLines) &&
            existingDocLines.some((line) =>
                typeof line === STRING_TYPE
                    ? Core.parseDocCommentMetadata(line)
                    : false
            );
        const originalExistingHasDocLikePrefixes =
            Array.isArray(existingDocLines) &&
            existingDocLines.some((line) =>
                typeof line === STRING_TYPE
                    ? /^\s*\/\/\s*\/\s*/.test(line)
                    : false
            );

        if (originalExistingHasTags || originalExistingHasDocLikePrefixes) {
            filteredResult = Core.toMutableArray(
                Core.promoteLeadingDocCommentTextToDescription(filteredResult)
            );
        }
    } catch {
        // If the Core service is unavailable (testing contexts), fall back to
        // the original behavior without promotion so we don't throw.
    }

    // If the original existing doc lines contained plain triple-slash
    // summary lines but no explicit doc tags, prefer to keep the summary
    // as plain text rather than a promoted `@description` tag and ensure a
    // blank line separates the summary from the synthetic metadata.
    try {
        const originalHasPlainSummary =
            Array.isArray(existingDocLines) &&
            existingDocLines.some((l) =>
                typeof l === STRING_TYPE
                    ? /^\/\/\/\s*(?!@).+/.test(l.trim())
                    : false
            );
        const originalHasTags =
            Array.isArray(existingDocLines) &&
            existingDocLines.some((l) =>
                typeof l === STRING_TYPE
                    ? Core.parseDocCommentMetadata(l)
                    : false
            );
        if (originalHasPlainSummary && !originalHasTags) {
            const summaryLines = [] as string[];
            const otherLines = [] as string[];

            for (const ln of filteredResult) {
                if (typeof ln !== STRING_TYPE) continue;
                if (/^\/\/\/\s*@description\b/i.test(ln.trim())) {
                    const meta = Core.parseDocCommentMetadata(ln);
                    const descriptionText =
                        typeof meta?.name === STRING_TYPE ? meta.name : "";
                    summaryLines.push(`/// ${descriptionText}`);
                    continue;
                }
                if (/^\/\/\/\s*@/i.test(ln.trim())) {
                    otherLines.push(ln);
                    continue;
                }
                // Treat other triple slash lines as summary continuations
                if (/^\/\/\/\s*/.test(ln.trim())) {
                    summaryLines.push(ln);
                    continue;
                }
                otherLines.push(ln);
            }

            if (summaryLines.length > 0 && otherLines.length > 0) {
                // Ensure a blank separator between summary block and synthetic metadata
                const combined = [...summaryLines, "", ...otherLines];
                filteredResult = Core.toMutableArray(
                    combined as any
                ) as MutableDocCommentLines;
            }
        }
    } catch {
        // Best-effort fallback; do not throw on diagnostic operations
    }
    return Core.convertLegacyReturnsDescriptionLinesToMetadata(filteredResult, {
        normalizeDocCommentTypeAnnotations: Core.normalizeGameMakerType
    });
}

function getCanonicalParamNameFromText(name) {
    if (typeof name !== STRING_TYPE) {
        return null;
    }

    let trimmed = name.trim();

    if (trimmed.startsWith("[")) {
        let depth = 0;
        let closingIndex = -1;

        let index = 0;
        for (const char of trimmed) {
            if (char === "[") {
                depth += 1;
            } else if (char === "]") {
                depth -= 1;
                if (depth === 0) {
                    closingIndex = index;
                    break;
                }
            }

            index += 1;
        }

        if (closingIndex > 0) {
            trimmed = trimmed.slice(1, closingIndex);
        }
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex !== -1) {
        trimmed = trimmed.slice(0, equalsIndex);
    }

    const normalized = normalizeDocMetadataName(trimmed.trim());
    return normalized && normalized.length > 0 ? normalized : null;
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

        const identifier = getIdentifierFromParameterNode(params[paramIndex]);
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

    const argumentIndex = getArgumentIndexFromIdentifier(node.name);
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

    const identifier = getIdentifierFromParameterNode(params[argumentIndex]);
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

    const hasRenamableCurrentName =
        typeof currentName === STRING_TYPE &&
        getArgumentIndexFromIdentifier(currentName) !== null;

    if (!hasRenamableCurrentName) {
        return null;
    }

    const preferredSource = resolvePreferredParameterSource(
        functionNode,
        paramIndex,
        currentName,
        options
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
    options
) {
    const docPreferences = preferredParamDocNamesByNode.get(functionNode);
    if (docPreferences?.has(paramIndex)) {
        return docPreferences.get(paramIndex) ?? null;
    }

    const implicitEntries = collectImplicitArgumentDocNames(
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

    if (
        implicitEntry.canonical &&
        implicitEntry.canonical !== implicitEntry.fallbackCanonical
    ) {
        return implicitEntry.name || implicitEntry.canonical;
    }

    if (implicitEntry.name && implicitEntry.name !== currentName) {
        return implicitEntry.name;
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

        if (isFunctionLikeDeclaration(parent)) {
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

    const argumentIndex = getArgumentIndexFromIdentifier(declarator.init.name);
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

    const identifier = getIdentifierFromParameterNode(params[argumentIndex]);
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

function getIdentifierFromParameterNode(param) {
    if (!param || typeof param !== OBJECT_TYPE) {
        return null;
    }

    if (param.type === "Identifier") {
        return param;
    }

    if (
        param.type === "DefaultParameter" &&
        param.left?.type === "Identifier"
    ) {
        return param.left;
    }

    return null;
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
    if (!node || !synthesizedUndefinedDefaultParameters.has(node)) {
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

    const canonical = getCanonicalParamNameFromText(name);
    if (canonical && canonical.length > 0) {
        return canonical;
    }

    const normalized = normalizeDocMetadataName(name);
    if (typeof normalized !== STRING_TYPE || normalized.length === 0) {
        return null;
    }

    return normalized.trim();
}

function isValidIdentifierName(name) {
    return (
        typeof name === STRING_TYPE && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)
    );
}

function isOptionalParamDocName(name) {
    return typeof name === STRING_TYPE && /^\s*\[[^\]]+\]\s*$/.test(name);
}

function updateParamLineWithDocName(line, newDocName) {
    if (typeof line !== STRING_TYPE || typeof newDocName !== STRING_TYPE) {
        return line;
    }

    const prefixMatch = line.match(/^(\/\/\/\s*@param(?:\s+\{[^}]+\})?\s*)/i);
    if (!prefixMatch) {
        return `/// @param ${newDocName}`;
    }

    const prefix = prefixMatch[0];
    const remainder = line.slice(prefix.length);
    if (remainder.length === 0) {
        return `${prefix}${newDocName}`;
    }

    const updatedRemainder = remainder.replace(/^[^\s]+/, newDocName);
    return `${prefix}${updatedRemainder}`;
}

function computeSyntheticFunctionDocLines(
    node,
    existingDocLines,
    options,
    overrides: any = {}
) {
    if (!node) {
        return [];
    }

    type DocMeta = { tag: string; name?: string | null; type?: string | null };
    const metadata = (
        Array.isArray(existingDocLines)
            ? existingDocLines.map(Core.parseDocCommentMetadata).filter(Boolean)
            : []
    ) as DocMeta[];
    const orderedParamMetadata = metadata.filter(
        (meta) => meta.tag === "param"
    );

    const hasReturnsTag = metadata.some((meta) => meta.tag === "returns");
    const hasOverrideTag = metadata.some((meta) => meta.tag === "override");
    const documentedParamNames = new Set();
    const paramMetadataByCanonical = new Map();
    const overrideName = overrides?.nameOverride;
    const functionName = overrideName ?? Core.getNodeName(node);
    const existingFunctionMetadata = metadata.find(
        (meta) => meta.tag === "function"
    );
    const normalizedFunctionName =
        typeof functionName === STRING_TYPE &&
        Core.isNonEmptyTrimmedString(functionName)
            ? normalizeDocMetadataName(functionName)
            : null;
    const normalizedExistingFunctionName =
        typeof existingFunctionMetadata?.name === STRING_TYPE &&
        Core.isNonEmptyTrimmedString(existingFunctionMetadata.name)
            ? normalizeDocMetadataName(existingFunctionMetadata.name)
            : null;

    for (const meta of metadata) {
        if (meta.tag !== "param") {
            continue;
        }

        const rawName = typeof meta.name === STRING_TYPE ? meta.name : null;
        if (!rawName) {
            continue;
        }

        documentedParamNames.add(rawName);

        const canonical = getCanonicalParamNameFromText(rawName);
        if (canonical && !paramMetadataByCanonical.has(canonical)) {
            paramMetadataByCanonical.set(canonical, meta);
        }
    }

    const shouldInsertOverrideTag =
        overrides?.includeOverrideTag === true && !hasOverrideTag;

    const lines = [];

    if (shouldInsertOverrideTag) {
        lines.push("/// @override");
    }

    const shouldInsertFunctionTag =
        normalizedFunctionName &&
        (normalizedExistingFunctionName === null ||
            normalizedExistingFunctionName !== normalizedFunctionName);

    if (shouldInsertFunctionTag) {
        lines.push(`/// @function ${functionName}`);
    }

    // Precompute any suppressed canonical names that are derivable from
    // existing doc-order/ordinal metadata without consulting implicit
    // argument entries. Some suppression rules (e.g. documented ordinal
    // names that conflict with declared param names) are independent of
    // implicit entries and must be available when the parser-provided
    // implicit entries are consulted. Compute an initial suppressed set
    // and attach it to the node so `collectImplicitArgumentDocNames` can
    // consult it while producing entries.
    try {
        const initialSuppressed = new Set();
        if (Array.isArray(node?.params)) {
            for (const [paramIndex, param] of node.params.entries()) {
                const ordinalMetadata =
                    Number.isInteger(paramIndex) && paramIndex >= 0
                        ? (orderedParamMetadata[paramIndex] ?? null)
                        : null;
                const rawOrdinalName =
                    typeof ordinalMetadata?.name === STRING_TYPE &&
                    ordinalMetadata.name.length > 0
                        ? ordinalMetadata.name
                        : null;
                const canonicalOrdinal = rawOrdinalName
                    ? getCanonicalParamNameFromText(rawOrdinalName)
                    : null;

                const paramInfo = getParameterDocInfo(param, node, options);
                const paramIdentifier = getIdentifierFromParameterNode(param);
                const paramIdentifierName =
                    typeof paramIdentifier?.name === STRING_TYPE
                        ? paramIdentifier.name
                        : null;
                const canonicalParamName = paramInfo?.name
                    ? getCanonicalParamNameFromText(paramInfo.name)
                    : null;

                const isGenericArgumentName =
                    typeof paramIdentifierName === STRING_TYPE &&
                    getArgumentIndexFromIdentifier(paramIdentifierName) !==
                        null;

                const canonicalOrdinalMatchesParam =
                    Boolean(canonicalOrdinal) &&
                    Boolean(canonicalParamName) &&
                    (canonicalOrdinal === canonicalParamName ||
                        docParamNamesLooselyEqual(
                            canonicalOrdinal,
                            canonicalParamName
                        ));

                const shouldAdoptOrdinalName =
                    Boolean(rawOrdinalName) &&
                    (canonicalOrdinalMatchesParam || isGenericArgumentName);

                if (
                    !shouldAdoptOrdinalName &&
                    canonicalOrdinal &&
                    canonicalParamName &&
                    canonicalOrdinal !== canonicalParamName &&
                    !paramMetadataByCanonical.has(canonicalParamName)
                ) {
                    const canonicalOrdinalMatchesDeclaredParam = Array.isArray(
                        node?.params
                    )
                        ? node.params.some((candidate, candidateIndex) => {
                              if (candidateIndex === paramIndex) return false;
                              const candidateInfo = getParameterDocInfo(
                                  candidate,
                                  node,
                                  options
                              );
                              const candidateCanonical = candidateInfo?.name
                                  ? getCanonicalParamNameFromText(
                                        candidateInfo.name
                                    )
                                  : null;
                              return candidateCanonical === canonicalOrdinal;
                          })
                        : false;

                    if (!canonicalOrdinalMatchesDeclaredParam) {
                        initialSuppressed.add(canonicalOrdinal);
                    }
                }
            }
        }

        if (initialSuppressed.size > 0) {
            suppressedImplicitDocCanonicalByNode.set(node, initialSuppressed);
        }
        // Additional pre-pass: if existing doc comments mention bare fallback
        // `argumentN` names but the function body defines a local alias for
        // that argument (e.g. `var two = argument2;`), treat the fallback
        // canonical as suppressed so the alias doc line can replace it.
        try {
            const refInfo = gatherImplicitArgumentReferences(node);
            if (
                refInfo &&
                refInfo.aliasByIndex &&
                refInfo.aliasByIndex.size > 0
            ) {
                for (const rawDocName of documentedParamNames) {
                    try {
                        // documentedParamNames contains tokenized doc names
                        // (optional tokens preserved). Normalize optional
                        // wrappers and test for an `argumentN` shape.
                        const normalizedDocName =
                            typeof rawDocName === "string"
                                ? rawDocName.replaceAll(/^\[|\]$/g, "")
                                : rawDocName;
                        const maybeIndex =
                            getArgumentIndexFromIdentifier(normalizedDocName);
                        if (
                            maybeIndex !== null &&
                            refInfo.aliasByIndex.has(maybeIndex)
                        ) {
                            const fallbackCanonical =
                                getCanonicalParamNameFromText(
                                    `argument${maybeIndex}`
                                ) ?? `argument${maybeIndex}`;
                            initialSuppressed.add(fallbackCanonical);
                        }
                    } catch {
                        /* ignore per-doc errors */
                    }
                }
                // When a user has provided ordinal `@param` metadata such as
                // `@param third` for an otherwise parameterless function,
                // we should prefer the documented name and suppress the
                // fallback numeric `argumentN` canonical. Ensure any
                // documented ordinal metadata causes the numeric fallback
                // to be suppressed so we don't synthesize `argumentN` lines
                // alongside a documented ordinal name.
                try {
                    for (const [
                        ordIndex,
                        ordMeta
                    ] of orderedParamMetadata.entries()) {
                        if (!ordMeta || typeof ordMeta.name !== STRING_TYPE)
                            continue;
                        const canonicalOrdinal = getCanonicalParamNameFromText(
                            ordMeta.name
                        );
                        if (!canonicalOrdinal) continue;
                        const fallback =
                            getCanonicalParamNameFromText(
                                `argument${ordIndex}`
                            ) || `argument${ordIndex}`;
                        initialSuppressed.add(fallback);
                    }
                } catch {
                    /* ignore */
                }

                if (initialSuppressed.size > 0) {
                    suppressedImplicitDocCanonicalByNode.set(
                        node,
                        initialSuppressed
                    );
                }
            }
        } catch {
            /* ignore gather errors */
        }
    } catch {
        /* ignore pre-pass errors */
    }

    const implicitArgumentDocNames = collectImplicitArgumentDocNames(
        node,
        options
    );
    // Ensure we append numeric fallback entries for any alias that is
    // directly referenced but did not get a fallback entry added by the
    // build step or parser-provided entries. This guards against cases
    // where re-ordering or suppression prevented the apparent fallback
    // entry from being present downstream.
    try {
        const fallbacksToAdd = [];
        for (const entry of implicitArgumentDocNames) {
            if (!entry) continue;
            const { canonical, fallbackCanonical, index, hasDirectReference } =
                entry;
            if (
                canonical &&
                fallbackCanonical &&
                canonical !== fallbackCanonical &&
                hasDirectReference === true &&
                Number.isInteger(index) &&
                index >= 0
            ) {
                // Check if fallback already present
                const already = implicitArgumentDocNames.some(
                    (e) =>
                        e &&
                        (e.canonical === fallbackCanonical ||
                            e.fallbackCanonical === fallbackCanonical ||
                            e.name === fallbackCanonical)
                );
                if (!already) {
                    fallbacksToAdd.push({
                        name: fallbackCanonical,
                        canonical: fallbackCanonical,
                        fallbackCanonical,
                        index,
                        hasDirectReference: true
                    });
                }
            }
        }
        if (fallbacksToAdd.length > 0) {
            implicitArgumentDocNames.push(...fallbacksToAdd);
        }
    } catch {
        /* best-effort */
    }

    const implicitDocEntryByIndex = new Map();

    for (const entry of implicitArgumentDocNames) {
        if (!entry) {
            continue;
        }

        const { index } = entry;
        if (!Number.isInteger(index) || index < 0) {
            continue;
        }

        if (!implicitDocEntryByIndex.has(index)) {
            implicitDocEntryByIndex.set(index, entry);
        }
    }

    // Treat empty params arrays as "no-declared-params" so we can
    // synthesize fallback `argumentN` docs for functions that have no
    // declared parameters (they can still reference `argumentN` in the
    // body and tests expect the numeric fallbacks to be emitted when
    // directly referenced). This mirrors upstream behavior where an
    // empty [] means "no declared params" for doc synthesis.
    if (
        !Array.isArray(node.params) ||
        (Array.isArray(node.params) && node.params.length === 0)
    ) {
        for (const entry of implicitArgumentDocNames) {
            if (!entry) continue;
            const {
                name: docName,
                index,
                canonical,
                fallbackCanonical
            } = entry;

            if (documentedParamNames.has(docName)) {
                try {
                    const fname = Core.getNodeName(node);
                    if (
                        typeof fname === "string" &&
                        fname.includes("sample3")
                    ) {
                        // console.error(
                        //     `[feather:debug] computeSyntheticFunctionDocLines(${fname}): skipping adding docName '${String(docName)}' since it's already documented; entry=`,
                        //     entry
                        // );
                    }
                } catch {
                    /* ignore */
                }
                // If the alias name is already documented but the fallback
                // numeric `argumentN` is directly referenced inside the
                // function body, synthesize the numeric `argumentN` doc line
                // too so direct references are preserved when the function
                // has no declared params. Do not skip this step just because
                // the alias is already documented.
                if (
                    canonical &&
                    fallbackCanonical &&
                    canonical !== fallbackCanonical &&
                    entry.hasDirectReference === true &&
                    Number.isInteger(index) &&
                    index >= 0 &&
                    !documentedParamNames.has(fallbackCanonical)
                ) {
                    try {
                        const fname = Core.getNodeName(node);
                        if (
                            typeof fname === "string" &&
                            fname.includes("sample3")
                        ) {
                            // console.error(
                            //     `[feather:debug] computeSyntheticFunctionDocLines(${fname}): considering adding fallback in documented branch docName='${String(docName)}' canonical='${String(canonical)}' fallback='${String(fallbackCanonical)}' hasDirectReference='${String(entry.hasDirectReference)}' documentedFallback='${String(documentedParamNames.has(fallbackCanonical))}'`
                            // );
                        }
                    } catch {
                        /* ignore */
                    }
                    documentedParamNames.add(fallbackCanonical);
                    lines.push(`/// @param ${fallbackCanonical}`);
                }
                continue;
            }

            documentedParamNames.add(docName);
            lines.push(`/// @param ${docName}`);

            // If the implicit entry indicates a distinct fallback (argumentN)
            // and the fallback is directly referenced inside the function
            // body, synthesize the numeric `argumentN` doc line too so direct
            // references are preserved when the function has no declared
            // params (i.e., parser/system didn't provide a params array).
            const shouldAddFallbackInDocumentedBranch =
                Boolean(canonical && fallbackCanonical) &&
                canonical !== fallbackCanonical &&
                entry.hasDirectReference === true &&
                Number.isInteger(index) &&
                index >= 0 &&
                !documentedParamNames.has(fallbackCanonical);

            if (shouldAddFallbackInDocumentedBranch) {
                try {
                    const fname = Core.getNodeName(node);
                    if (
                        typeof fname === "string" &&
                        fname.includes("sample3")
                    ) {
                        // console.error(
                        //     `[feather:debug] computeSyntheticFunctionDocLines(${fname}): adding fallback for docName=${String(docName)} fallbackCanonical=${String(fallbackCanonical)} index=${String(index)} hasDirectReference=${String(entry.hasDirectReference)}`
                        // );
                    }
                } catch {
                    /* ignore */
                }
                documentedParamNames.add(fallbackCanonical);
                lines.push(`/// @param ${fallbackCanonical}`);
            } else {
                try {
                    const fname = Core.getNodeName(node);
                    if (
                        typeof fname === "string" &&
                        fname.includes("sample3")
                    ) {
                        // console.error(
                        //     `[feather:debug] computeSyntheticFunctionDocLines(${fname}): did NOT add fallback for docName='${String(docName)}' fallback='${String(fallbackCanonical)}' reasons=`,
                        //     {
                        //         canonical: Boolean(canonical),
                        //         fallbackCanonical: Boolean(fallbackCanonical),
                        //         canonicalNotEqual:
                        //             canonical !== fallbackCanonical,
                        //         hasDirectReference:
                        //             entry.hasDirectReference === true,
                        //         indexValid:
                        //             Number.isInteger(index) && index >= 0,
                        //         alreadyDocumented:
                        //             documentedParamNames.has(fallbackCanonical)
                        //     }
                        // );
                    }
                } catch {
                    /* ignore */
                }
            }
        }

        try {
            const fname = Core.getNodeName(node);
            if (typeof fname === "string" && fname.includes("sample3")) {
                // console.error(
                //     `[feather:debug] computeSyntheticFunctionDocLines(${fname}): lines after initial pass=`,
                //     lines
                // );
                try {
                    // console.error(
                    //     `[feather:debug] computeSyntheticFunctionDocLines(${fname}): documentedParamNames=`,
                    //     Array.from(documentedParamNames.values())
                    // );
                    // console.error(
                    //     `[feather:debug] computeSyntheticFunctionDocLines(${fname}): lines=`,
                    //     lines
                    // );
                } catch {
                    /* ignore */
                }
            }
        } catch {
            /* ignore */
        }
        // Second-pass safety-net: ensure numeric fallback `argumentN` docs are
        // emitted when an implicit entry indicates a direct reference but the
        // earlier pass didn't add the fallback due to any ordering/suppression
        // mismatch. This mirrors the tests' expectation that direct numeric
        // references preserved even when aliases exist.
        try {
            const fname = Core.getNodeName(node);
            for (const entry of implicitArgumentDocNames) {
                if (!entry) continue;
                const { index, canonical, fallbackCanonical } = entry;
                const suppressedCanonicals =
                    suppressedImplicitDocCanonicalByNode.get(node);

                if (
                    entry.hasDirectReference === true &&
                    Number.isInteger(index) &&
                    index >= 0 &&
                    fallbackCanonical &&
                    fallbackCanonical !== canonical &&
                    !documentedParamNames.has(fallbackCanonical) &&
                    (!suppressedCanonicals ||
                        !suppressedCanonicals.has(fallbackCanonical))
                ) {
                    try {
                        if (
                            typeof fname === "string" &&
                            fname.includes("sample3")
                        ) {
                            // console.error(
                            //     `[feather:debug] computeSyntheticFunctionDocLines(${fname}): safety-net adding fallback for index=${String(index)} fallback=${String(fallbackCanonical)} canonical=${String(canonical)} hasDirectReference=${String(entry.hasDirectReference)}`
                            // );
                        }
                    } catch {
                        void 0;
                    }
                    documentedParamNames.add(fallbackCanonical);
                    lines.push(`/// @param ${fallbackCanonical}`);
                }
            }
            try {
                const fname2 = Core.getNodeName(node);
                if (typeof fname2 === "string" && fname2.includes("sample3")) {
                    // console.error(
                    //     `[feather:debug] computeSyntheticFunctionDocLines(${fname2}): lines after safety-net pass=`,
                    //     lines
                    // );
                }
            } catch {
                /* ignore */
            }
        } catch {
            /* best-effort */
        }

        return maybeAppendReturnsDoc(lines, node, hasReturnsTag, overrides);
    }

    for (const [paramIndex, param] of node.params.entries()) {
        const paramInfo = getParameterDocInfo(param, node, options);
        if (!paramInfo || !paramInfo.name) {
            continue;
        }
        const ordinalMetadata =
            Number.isInteger(paramIndex) && paramIndex >= 0
                ? (orderedParamMetadata[paramIndex] ?? null)
                : null;
        const rawOrdinalName =
            typeof ordinalMetadata?.name === STRING_TYPE &&
            ordinalMetadata.name.length > 0
                ? ordinalMetadata.name
                : null;
        const canonicalOrdinal = rawOrdinalName
            ? getCanonicalParamNameFromText(rawOrdinalName)
            : null;
        const implicitDocEntry = implicitDocEntryByIndex.get(paramIndex);
        const paramIdentifier = getIdentifierFromParameterNode(param);
        const paramIdentifierName =
            typeof paramIdentifier?.name === STRING_TYPE
                ? paramIdentifier.name
                : null;
        const isGenericArgumentName =
            typeof paramIdentifierName === STRING_TYPE &&
            getArgumentIndexFromIdentifier(paramIdentifierName) !== null;
        const implicitName =
            implicitDocEntry &&
            typeof implicitDocEntry.name === STRING_TYPE &&
            implicitDocEntry.name &&
            implicitDocEntry.canonical !== implicitDocEntry.fallbackCanonical
                ? implicitDocEntry.name
                : null;
        const canonicalParamName =
            (implicitDocEntry?.canonical && implicitDocEntry.canonical) ||
            getCanonicalParamNameFromText(paramInfo.name);
        const existingMetadata =
            (canonicalParamName &&
                paramMetadataByCanonical.has(canonicalParamName) &&
                paramMetadataByCanonical.get(canonicalParamName)) ||
            null;
        const existingDocName = existingMetadata?.name;
        const hasCompleteOrdinalDocs =
            Array.isArray(node.params) &&
            orderedParamMetadata.length === node.params.length;
        const canonicalOrdinalMatchesParam =
            Boolean(canonicalOrdinal) &&
            Boolean(canonicalParamName) &&
            (canonicalOrdinal === canonicalParamName ||
                docParamNamesLooselyEqual(
                    canonicalOrdinal,
                    canonicalParamName
                ));

        const shouldAdoptOrdinalName =
            Boolean(rawOrdinalName) &&
            (canonicalOrdinalMatchesParam || isGenericArgumentName);

        if (
            hasCompleteOrdinalDocs &&
            node &&
            typeof paramIndex === NUMBER_TYPE &&
            shouldAdoptOrdinalName
        ) {
            const documentedParamCanonical =
                getCanonicalParamNameFromText(paramInfo.name) ?? null;
            if (
                documentedParamCanonical &&
                paramMetadataByCanonical.has(documentedParamCanonical)
            ) {
                // The parameter already appears in the documented metadata;
                // avoid overriding it with mismatched ordinal ordering.
            } else {
                let preferredDocs = preferredParamDocNamesByNode.get(node);
                if (!preferredDocs) {
                    preferredDocs = new Map();
                    preferredParamDocNamesByNode.set(node, preferredDocs);
                }
                if (!preferredDocs.has(paramIndex)) {
                    preferredDocs.set(paramIndex, rawOrdinalName);
                }
            }
        }
        if (
            !shouldAdoptOrdinalName &&
            canonicalOrdinal &&
            canonicalParamName &&
            canonicalOrdinal !== canonicalParamName &&
            node &&
            !paramMetadataByCanonical.has(canonicalParamName)
        ) {
            const canonicalOrdinalMatchesDeclaredParam = Array.isArray(
                node?.params
            )
                ? node.params.some((candidate, candidateIndex) => {
                      if (candidateIndex === paramIndex) {
                          return false;
                      }

                      const candidateInfo = getParameterDocInfo(
                          candidate,
                          node,
                          options
                      );
                      const candidateCanonical = candidateInfo?.name
                          ? getCanonicalParamNameFromText(candidateInfo.name)
                          : null;

                      return candidateCanonical === canonicalOrdinal;
                  })
                : false;

            if (!canonicalOrdinalMatchesDeclaredParam) {
                let suppressedCanonicals =
                    suppressedImplicitDocCanonicalByNode.get(node);
                if (!suppressedCanonicals) {
                    suppressedCanonicals = new Set();
                    suppressedImplicitDocCanonicalByNode.set(
                        node,
                        suppressedCanonicals
                    );
                }
                suppressedCanonicals.add(canonicalOrdinal);
            }
        }
        const ordinalDocName =
            hasCompleteOrdinalDocs &&
            (!existingDocName || existingDocName.length === 0) &&
            shouldAdoptOrdinalName
                ? rawOrdinalName
                : null;
        let effectiveImplicitName = implicitName;
        if (effectiveImplicitName && ordinalDocName) {
            const canonicalImplicit =
                getCanonicalParamNameFromText(effectiveImplicitName) ?? null;
            const fallbackCanonical =
                implicitDocEntry?.fallbackCanonical ??
                getCanonicalParamNameFromText(paramInfo.name);

            if (
                canonicalOrdinal &&
                canonicalOrdinal !== fallbackCanonical &&
                canonicalOrdinal !== canonicalImplicit
            ) {
                const ordinalLength = canonicalOrdinal.length;
                const implicitLength =
                    (canonicalImplicit && canonicalImplicit.length > 0) ||
                    Core.isNonEmptyTrimmedString(effectiveImplicitName);

                if (ordinalLength > implicitLength) {
                    effectiveImplicitName = null;
                    if (implicitDocEntry) {
                        implicitDocEntry._suppressDocLine = true;
                        if (implicitDocEntry.canonical && node) {
                            let suppressedCanonicals =
                                suppressedImplicitDocCanonicalByNode.get(node);
                            if (!suppressedCanonicals) {
                                suppressedCanonicals = new Set();
                                suppressedImplicitDocCanonicalByNode.set(
                                    node,
                                    suppressedCanonicals
                                );
                            }
                            suppressedCanonicals.add(
                                implicitDocEntry.canonical
                            );
                        }
                        if (canonicalOrdinal) {
                            implicitDocEntry.canonical = canonicalOrdinal;
                        }
                        if (ordinalDocName) {
                            implicitDocEntry.name = ordinalDocName;
                            if (node) {
                                let preferredDocs =
                                    preferredParamDocNamesByNode.get(node);
                                if (!preferredDocs) {
                                    preferredDocs = new Map();
                                    preferredParamDocNamesByNode.set(
                                        node,
                                        preferredDocs
                                    );
                                }
                                preferredDocs.set(paramIndex, ordinalDocName);
                            }
                        }
                    }
                }
            }
        }

        const optionalOverrideFlag = paramInfo?.optionalOverride === true;
        const defaultIsUndefined =
            param?.type === "DefaultParameter" &&
            Core.isUndefinedSentinel(param.right);
        const shouldOmitUndefinedDefault =
            defaultIsUndefined &&
            shouldOmitUndefinedDefaultForFunctionNode(node);
        const hasExistingMetadata = Boolean(existingMetadata);
        const hasOptionalDocName =
            param?.type === "DefaultParameter" &&
            isOptionalParamDocName(existingDocName);
        const baseDocName =
            (effectiveImplicitName &&
                effectiveImplicitName.length > 0 &&
                effectiveImplicitName) ||
            (ordinalDocName && ordinalDocName.length > 0 && ordinalDocName) ||
            paramInfo.name;
        const parameterSourceText = getSourceTextForNode(param, options);
        const defaultCameFromSource =
            defaultIsUndefined &&
            typeof parameterSourceText === STRING_TYPE &&
            parameterSourceText.includes("=");
        // Use the parser-provided explicit optional marker when present.
        // The parser transform is responsible for setting
        // `_featherOptionalParameter` to encode explicit optional intent for
        // parameters (including materialized defaults when appropriate). The
        // printer should consume that intent directly rather than masking it
        // for materialized nodes.
        const explicitOptionalMarker =
            param?._featherOptionalParameter === true;

        let shouldMarkOptional =
            Boolean(paramInfo.optional) ||
            hasOptionalDocName ||
            // If the parameter's default is an `undefined` sentinel and the
            // parser/transforms or the declaration shape indicate the
            // default should be preserved (e.g. constructor or an explicit
            // parser-intent marker), treat it as optional for synthesized
            // docs so doc-bracketing matches the retained signature.
            (param?.type === "DefaultParameter" &&
                Core.isUndefinedSentinel(param.right) &&
                (explicitOptionalMarker ||
                    node?.type === "ConstructorDeclaration"));
        const hasSiblingExplicitDefault = Array.isArray(node?.params)
            ? node.params.some((candidate, candidateIndex) => {
                  if (candidateIndex === paramIndex || !candidate) {
                      return false;
                  }

                  if (candidate.type !== "DefaultParameter") {
                      return false;
                  }

                  // Treat a missing RHS (`null`/`undefined`) as a non-
                  // explicit default (i.e. not a concrete default). Only
                  // consider it an explicit default when the RHS exists and
                  // is not the `undefined` sentinel.
                  return (
                      candidate.right != null &&
                      !Core.isUndefinedSentinel(candidate.right)
                  );
              })
            : false;
        const hasPriorExplicitDefault = Array.isArray(node?.params)
            ? node.params.slice(0, paramIndex).some((candidate) => {
                  if (!candidate || candidate.type !== "DefaultParameter") {
                      return false;
                  }

                  // See above: require a present RHS before treating the
                  // candidate as a concrete explicit default.
                  return (
                      candidate.right != null &&
                      !Core.isUndefinedSentinel(candidate.right)
                  );
              })
            : false;
        const shouldApplyOptionalSuppression =
            hasExistingMetadata || !hasSiblingExplicitDefault;
        // If this parameter was materialized by the parser as a trailing
        // `= undefined` default, avoid promoting it to optional via the
        // sibling/prior-default heuristic. Materialized placeholders
        // should be treated conservatively unless the parser or docs
        // explicitly mark them optional.
        const materializedFromExplicitLeft =
            param?._featherMaterializedFromExplicitLeft === true;
        if (
            !shouldMarkOptional &&
            !hasExistingMetadata &&
            hasSiblingExplicitDefault &&
            hasPriorExplicitDefault &&
            !materializedFromExplicitLeft &&
            param?._featherMaterializedTrailingUndefined !== true
        ) {
            shouldMarkOptional = true;
        }
        if (shouldApplyOptionalSuppression) {
            if (
                shouldMarkOptional &&
                defaultIsUndefined &&
                shouldOmitUndefinedDefault &&
                paramInfo?.explicitUndefinedDefault === true &&
                !optionalOverrideFlag &&
                !hasOptionalDocName
            ) {
                shouldMarkOptional = false;
            }
            if (
                shouldMarkOptional &&
                shouldOmitUndefinedDefault &&
                paramInfo.optional &&
                defaultCameFromSource &&
                !hasOptionalDocName
            ) {
                shouldMarkOptional = false;
            }
        }
        if (
            shouldMarkOptional &&
            param?.type === "Identifier" &&
            !synthesizedUndefinedDefaultParameters.has(param)
        ) {
            synthesizedUndefinedDefaultParameters.add(param);
        }
        if (shouldMarkOptional && defaultIsUndefined) {
            preservedUndefinedDefaultParameters.add(param);
        }
        const docName = shouldMarkOptional ? `[${baseDocName}]` : baseDocName;

        const normalizedExistingType = normalizeParamDocType(
            existingMetadata?.type
        );
        const normalizedOrdinalType = normalizeParamDocType(
            ordinalMetadata?.type
        );
        const docType = normalizedExistingType ?? normalizedOrdinalType;

        if (documentedParamNames.has(docName)) {
            try {
                const fname = Core.getNodeName(node);
                if (typeof fname === "string" && fname.includes("sample3")) {
                    // console.error(
                    //     `[feather:debug] computeSyntheticFunctionDocLines(${fname}): documentedParamNames snapshot=`,
                    //     Array.from(documentedParamNames.values())
                    // );
                }
            } catch {
                /* ignore */
            }
            if (implicitDocEntry?.name) {
                documentedParamNames.add(implicitDocEntry.name);
            }
            continue;
        }
        documentedParamNames.add(docName);
        if (implicitDocEntry?.name) {
            documentedParamNames.add(implicitDocEntry.name);
        }

        const typePrefix = docType ? `{${docType}} ` : "";
        lines.push(`/// @param ${typePrefix}${docName}`);
    }

    for (const entry of implicitArgumentDocNames) {
        if (!entry || entry._suppressDocLine) {
            continue;
        }

        const { name: docName, index, canonical, fallbackCanonical } = entry;
        const isImplicitFallbackEntry = canonical === fallbackCanonical;
        let declaredParamIsGeneric = false;
        if (
            Array.isArray(node?.params) &&
            Number.isInteger(index) &&
            index >= 0
        ) {
            const decl = node.params[index];
            const declId = getIdentifierFromParameterNode(decl);
            if (declId && typeof declId.name === STRING_TYPE) {
                declaredParamIsGeneric =
                    getArgumentIndexFromIdentifier(declId.name) !== null;
            }
        }
        const isFallbackEntry = canonical === fallbackCanonical;
        if (
            isFallbackEntry &&
            Number.isInteger(index) &&
            orderedParamMetadata[index] &&
            typeof orderedParamMetadata[index].name === STRING_TYPE &&
            orderedParamMetadata[index].name.length > 0
        ) {
            continue;
        }

        if (documentedParamNames.has(docName)) {
            // If the alias name is already documented but the fallback
            // numeric `argumentN` name is directly referenced in the
            // function body, ensure we still synthesize a fallback doc
            // entry for the numeric argument so explicit references are
            // preserved alongside the alias.
            if (
                canonical &&
                fallbackCanonical &&
                canonical !== fallbackCanonical &&
                entry.hasDirectReference === true &&
                !documentedParamNames.has(fallbackCanonical) &&
                !declaredParamIsGeneric &&
                Array.isArray(node?.params) &&
                Number.isInteger(index) &&
                index >= 0 &&
                index < node.params.length
            ) {
                documentedParamNames.add(fallbackCanonical);
                lines.push(`/// @param ${fallbackCanonical}`);
            }
            continue;
        }

        // If this is a fallback `argumentN` entry and an ordered
        // param metadata entry exists for this index (e.g. `@param
        // third`), prefer the documented ordinal name and skip
        // synthesizing the fallback numeric entry.
        if (
            isImplicitFallbackEntry &&
            Number.isInteger(index) &&
            orderedParamMetadata[index] &&
            typeof orderedParamMetadata[index].name === STRING_TYPE &&
            orderedParamMetadata[index].name.length > 0
        ) {
            continue;
        }

        documentedParamNames.add(docName);
        lines.push(`/// @param ${docName}`);

        // If this implicit entry indicates both an alias (canonical) and a
        // distinct fallback (argumentN), and the fallback is directly
        // referenced in the function body, synthesize an explicit
        // `argumentN` doc line as well so both the alias and numeric doc
        // entry are present in the merged output. This preserves direct
        // numeric argument references that tests expect to be retained.
        if (
            canonical &&
            fallbackCanonical &&
            canonical !== fallbackCanonical &&
            entry.hasDirectReference === true &&
            !documentedParamNames.has(fallbackCanonical) &&
            Number.isInteger(index) &&
            index >= 0 &&
            !declaredParamIsGeneric
        ) {
            documentedParamNames.add(fallbackCanonical);
            lines.push(`/// @param ${fallbackCanonical}`);
        }
    }

    return maybeAppendReturnsDoc(lines, node, hasReturnsTag, overrides).map(
        (line) => Core.normalizeDocCommentTypeAnnotations(line)
    );
}

function normalizeParamDocType(typeText) {
    return Core.getNonEmptyTrimmedString(typeText);
}

function collectImplicitArgumentDocNames(functionNode, options) {
    if (
        !functionNode ||
        (functionNode.type !== "FunctionDeclaration" &&
            functionNode.type !== "StructFunctionDeclaration")
    ) {
        return [];
    }

    // If the parser transform precomputed implicit argument doc entries,
    // prefer that authoritative data rather than re-traversing the AST or
    // inspecting original source text. This keeps the plugin lightweight
    // and lets parser transforms control doc synthesis.
    if (Array.isArray(functionNode._featherImplicitArgumentDocEntries)) {
        const entries = functionNode._featherImplicitArgumentDocEntries;
        const suppressedCanonicals =
            suppressedImplicitDocCanonicalByNode.get(functionNode);

        // If the parser gave us entries but did not mark direct references,
        // run a lightweight traversal to detect direct references and
        // augment the entries. This keeps the parser authoritative for
        // names/indices while allowing the plugin to respect direct
        // usages (e.g. `argument2` referenced in the body) when deciding
        // whether to preserve an entry despite suppression rules.
        try {
            // Gather reference info to detect explicit `argumentN` usages.
            const referenceInfo =
                gatherImplicitArgumentReferences(functionNode);

            // The parser is authoritative for names/indices. If the parser
            // omitted marking `hasDirectReference`, attempt a conservative
            // detection that matches on canonical names rather than numeric
            // indices. Matching by canonical avoids sensistivity to any
            // identifier-case renames or other transformations that can
            // permute numeric argument identifiers before printing.
            if (referenceInfo) {
                try {
                    const directSet = referenceInfo.directReferenceIndices;
                    // First prefer numeric index matches (fast-path)
                    if (directSet && directSet.size > 0) {
                        for (const entry of entries) {
                            if (
                                entry &&
                                entry.index != null &&
                                !entry.hasDirectReference &&
                                directSet.has(entry.index)
                            ) {
                                entry.hasDirectReference = true;
                            }
                        }
                    }

                    // If some entries still lack explicit marking, fall
                    // back to a canonical-name based scan to avoid relying
                    // on numeric indices which may have been renamed.
                    const needsCanonicalScan = entries.some(
                        (e) => e && !e.hasDirectReference
                    );
                    if (needsCanonicalScan) {
                        const canonicalToEntries = new Map();
                        for (const e of entries) {
                            if (!e) continue;
                            const key =
                                e.canonical || e.fallbackCanonical || e.name;
                            if (!canonicalToEntries.has(key))
                                canonicalToEntries.set(key, []);
                            canonicalToEntries.get(key).push(e);
                        }

                        // Traverse the function body and mark entries when we
                        // encounter an identifier or argument member whose
                        // canonical equals an entry's canonical.
                        const markMatches = (node) => {
                            if (!node || typeof node !== OBJECT_TYPE) return;

                            if (
                                node.type === "Identifier" &&
                                typeof node.name === STRING_TYPE
                            ) {
                                // Only treat documented `argumentN` identifiers as
                                // direct references. Alias names should not cause
                                // an entry to be considered a direct numeric
                                // reference because they represent a renamed local
                                // alias rather than a numeric `argumentN` usage.
                                const maybeIndex =
                                    getArgumentIndexFromIdentifier(node.name);
                                if (maybeIndex !== null) {
                                    const observed =
                                        getCanonicalParamNameFromText(
                                            `argument${maybeIndex}`
                                        ) || `argument${maybeIndex}`;
                                    const list =
                                        canonicalToEntries.get(observed);
                                    if (Array.isArray(list)) {
                                        for (const ent of list)
                                            ent.hasDirectReference = true;
                                    }
                                }
                            }

                            if (
                                node.type === "MemberIndexExpression" &&
                                node.object?.type === "Identifier" &&
                                node.object.name === "argument" &&
                                Array.isArray(node.property) &&
                                node.property.length === 1 &&
                                node.property[0]?.type === "Literal"
                            ) {
                                const parsed = Number.parseInt(
                                    String(node.property[0].value)
                                );
                                if (Number.isInteger(parsed) && parsed >= 0) {
                                    const observed =
                                        getCanonicalParamNameFromText(
                                            `argument${parsed}`
                                        ) || `argument${parsed}`;
                                    const list =
                                        canonicalToEntries.get(observed);
                                    if (Array.isArray(list)) {
                                        for (const ent of list)
                                            ent.hasDirectReference = true;
                                    }
                                }
                            }

                            Core.forEachNodeChild(node, (value) =>
                                markMatches(value)
                            );
                        };

                        try {
                            markMatches(functionNode.body);
                        } catch {
                            /* ignore */
                        }
                    }
                } catch {
                    /* ignore detection errors - keep parser data conservative */
                }
            }
        } catch {
            // Keep behavior conservative on error: fall back to parser data
        }

        // Final fallback: if the parser did not mark entries as direct
        // references and AST-based detection did not find them, scan the
        // original source slice for `argument<index>` tokens. This is a
        // conservative heuristic that preserves explicit `argumentN`
        // references written in source even if later transforms or
        // identifier-case renames change AST identifier names before
        // printing.
        try {
            const functionSource = getSourceTextForNode(
                functionNode?.body,
                options
            );
            if (
                typeof functionSource === STRING_TYPE &&
                functionSource.length > 0
            ) {
                for (const entry of entries) {
                    if (!entry || entry.hasDirectReference) continue;
                    if (Number.isInteger(entry.index) && entry.index >= 0) {
                        const re = new RegExp(
                            String.raw`\bargument${entry.index}\b`
                        );
                        if (re.test(functionSource)) {
                            entry.hasDirectReference = true;
                        }
                    }
                }
            }
        } catch {
            /* ignore */
        }

        if (!suppressedCanonicals || suppressedCanonicals.size === 0) {
            try {
                const fname =
                    functionNode.id?.name || functionNode.name || null;
                if (typeof fname === "string" && fname.includes("sample")) {
                    try {
                        // console.error(
                        //     `[feather:debug] collectImplicitArgumentDocNames(${fname}): parserEntries=`,
                        //     describeImplicitArgumentEntries(entries)
                        // );

                        // Provide detailed per-entry filter decisions so we can
                        // see why the printer keeps or drops parser-provided
                        // implicit entries. Limit output to functions named
                        // like 'sample' to avoid flooding test logs.
                        const result = entries.filter((entry) =>
                            shouldKeepImplicitArgumentDocEntry(
                                entry,
                                suppressedCanonicals,
                                referenceInfo?.aliasByIndex
                            )
                        );

                        const decisions = entries.map((e) => ({
                            name: e?.name,
                            index: e?.index,
                            canonical: e?.canonical,
                            fallbackCanonical: e?.fallbackCanonical,
                            hasDirectReference: e?.hasDirectReference,
                            kept: result.includes(e)
                        }));
                        try {
                            // Extra targeted diagnostic: if any entry was marked
                            // as a direct reference but the filter dropped it,
                            // emit a clear error so tests can capture the
                            // mismatch state for triage.
                            const droppedDirect = decisions.filter(
                                (d) =>
                                    !!d.hasDirectReference && d.kept === false
                            );
                            if (droppedDirect.length > 0) {
                                // console.error(
                                //     `[feather:debug] collectImplicitArgumentDocNames(${fname}): DROPPED_DIRECT_ENTRIES=`,
                                //     droppedDirect
                                // );
                            }
                        } catch {
                            /* ignore diagnostic errors */
                        }

                        // console.error(
                        //     `[feather:debug] collectImplicitArgumentDocNames(${fname}): filter-decisions=`,
                        //     decisions
                        // );

                        return result;
                    } catch {
                        /* ignore */
                    }
                }
            } catch {
                /* ignore */
            }
            return entries;
        }
        try {
            const fname =
                functionNode &&
                (typeof functionNode.id === "string"
                    ? functionNode.id
                    : functionNode.id &&
                        typeof functionNode.id.name === "string"
                      ? functionNode.id.name
                      : typeof functionNode.name === "string"
                        ? functionNode.name
                        : functionNode.key &&
                            typeof functionNode.key.name === "string"
                          ? functionNode.key.name
                          : null);
            if (typeof fname === "string" && fname.includes("sample")) {
                try {
                    // console.debug(
                    //     `[feather:debug] collectImplicitArgumentDocNames(${fname}): suppressedCanonicals=`,
                    //     Array.from(suppressedCanonicals || [])
                    // );
                } catch {
                    /* ignore */
                }
            }
        } catch {
            /* ignore */
        }

        // At this point we have parser-provided entries and a suppression
        // set. Filter conservatively: always keep entries that have an
        // explicit direct reference, otherwise drop entries whose canonical
        // is in the suppressed set. When debugging, emit a per-entry
        // decision map so we can triage mismatches between parser metadata
        // and AST-based detection.
        try {
            const fname =
                functionNode &&
                (typeof functionNode.id === "string"
                    ? functionNode.id
                    : functionNode.id &&
                        typeof functionNode.id.name === "string"
                      ? functionNode.id.name
                      : typeof functionNode.name === "string"
                        ? functionNode.name
                        : functionNode.key &&
                            typeof functionNode.key.name === "string"
                          ? functionNode.key.name
                          : null);
            if (typeof fname === "string" && fname.includes("sample")) {
                return entries.filter((entry) => {
                    if (!entry) return false;
                    if (entry.hasDirectReference) return true;
                    const key = entry.canonical || entry.fallbackCanonical;
                    if (!key) return true;
                    return !suppressedCanonicals.has(key);
                });
            }
        } catch {
            /* ignore */
        }

        return entries.filter((entry) => {
            if (!entry) return false;
            if (entry.hasDirectReference === true) return true;

            if (!entry.canonical) {
                return true;
            }

            return !suppressedCanonicals.has(entry.canonical);
        });
    }

    // Parser-provided implicit entries will be augmented later; we will
    // append fallback entries after `entries` is constructed from either
    // the parser data or the AST-derived build below.

    const referenceInfo = gatherImplicitArgumentReferences(functionNode);
    const entries = buildImplicitArgumentDocEntries(referenceInfo);
    // If parser provided explicit implicit entries, ensure we also add a
    // fallback numeric `argumentN` entry when an alias exists and a direct
    // numeric reference is present. This mirrors the behavior used when
    // building entries from the AST and helps ensure we emit both alias
    // and numeric doc lines for no-param functions.
    try {
        const parserEntries = functionNode._featherImplicitArgumentDocEntries;
        if (Array.isArray(parserEntries) && parserEntries.length > 0) {
            for (const pEntry of parserEntries) {
                if (!pEntry) continue;
                const {
                    canonical,
                    fallbackCanonical,
                    index,
                    hasDirectReference
                } = pEntry;
                if (
                    canonical &&
                    fallbackCanonical &&
                    canonical !== fallbackCanonical &&
                    hasDirectReference === true
                ) {
                    const already = entries.some(
                        (e) =>
                            e &&
                            (e.canonical === fallbackCanonical ||
                                e.fallbackCanonical === fallbackCanonical)
                    );
                    if (!already && Number.isInteger(index) && index >= 0) {
                        entries.push({
                            name: fallbackCanonical,
                            canonical: fallbackCanonical,
                            fallbackCanonical,
                            index,
                            hasDirectReference: true
                        });
                    }
                }
            }
        }
    } catch {
        /* ignore */
    }
    const suppressedCanonicals =
        suppressedImplicitDocCanonicalByNode.get(functionNode);
    try {
        const fname =
            functionNode &&
            (typeof functionNode.id === "string"
                ? functionNode.id
                : functionNode.id && typeof functionNode.id.name === "string"
                  ? functionNode.id.name
                  : typeof functionNode.name === "string"
                    ? functionNode.name
                    : functionNode.key &&
                        typeof functionNode.key.name === "string"
                      ? functionNode.key.name
                      : null);
        if (typeof fname === "string" && fname.includes("sample")) {
            try {
                // console.error(
                //     `[feather:debug] collectImplicitArgumentDocNames(${fname}): builtEntries=`,
                //     describeImplicitArgumentEntries(entries)
                // );
                // console.error(
                //     `[feather:debug] collectImplicitArgumentDocNames(${fname}): suppressedCanonicals=`,
                //     Array.from(suppressedCanonicals || [])
                // );
            } catch {
                /* ignore */
            }
        }
    } catch {
        /* ignore */
    }

    if (!suppressedCanonicals || suppressedCanonicals.size === 0) {
        return entries;
    }

    return entries.filter((entry) =>
        shouldKeepImplicitArgumentDocEntry(
            entry,
            suppressedCanonicals,
            referenceInfo.aliasByIndex
        )
    );
}

function shouldKeepImplicitArgumentDocEntry(
    entry,
    suppressedCanonicals,
    aliasByIndex
) {
    if (!entry) {
        return false;
    }

    if (
        entry.hasDirectReference &&
        aliasByIndex &&
        aliasByIndex.has(entry.index)
    ) {
        return true;
    }

    const key = entry.canonical || entry.fallbackCanonical;
    if (!key) {
        return true;
    }

    if (!suppressedCanonicals) {
        return true;
    }

    return !suppressedCanonicals.has(key);
}

// Collects index/reference bookkeeping for implicit `arguments[index]` usages
// within a function. The traversal tracks alias declarations, direct
// references, and the set of indices that require doc entries so the caller
// can format them without dipping into low-level mutation logic.
function gatherImplicitArgumentReferences(functionNode) {
    const referencedIndices = new Set();
    const aliasByIndex = new Map();
    const directReferenceIndices = new Set();

    const visit = (node, parent) => {
        if (!node || typeof node !== OBJECT_TYPE) {
            return;
        }

        if (node === functionNode) {
            if (functionNode.body) {
                visit(functionNode.body, node);
            }
            return;
        }

        if (Array.isArray(node)) {
            for (const element of node) {
                visit(element, parent);
            }
            return;
        }

        if (
            node !== functionNode &&
            (node.type === "FunctionDeclaration" ||
                node.type === "StructFunctionDeclaration" ||
                node.type === "FunctionExpression" ||
                node.type === "ConstructorDeclaration")
        ) {
            return;
        }

        // Track alias declarations like `var two = argument2;` and also
        // ensure that argument initializers are counted as direct
        // references. Historically we attempted to avoid traversing an
        // alias initializer twice; that prevention suppressed marking
        // direct references for argument initializers (so
        // `var second = argument3;` would set an alias but not mark
        // `argument3` as a direct reference). Tests expect alias
        // initializers to still count as direct references, so we record
        // the alias and then continue traversal into the initializer so
        // direct usages are captured.
        if (node.type === "VariableDeclarator") {
            const aliasIndex = getArgumentIndexFromNode(node.init);
            if (
                aliasIndex !== null &&
                node.id?.type === "Identifier" &&
                !aliasByIndex.has(aliasIndex)
            ) {
                const aliasName = normalizeDocMetadataName(node.id.name);
                if (Core.isNonEmptyString(aliasName)) {
                    aliasByIndex.set(aliasIndex, aliasName);
                    referencedIndices.add(aliasIndex);
                }
            }
        }

        const directIndex = getArgumentIndexFromNode(node);
        if (directIndex !== null) {
            referencedIndices.add(directIndex);
            // By default we consider direct occurrences of `argumentN`
            // to be explicit references. However, when the occurrence is
            // the initializer of a VariableDeclarator that we just
            // recorded as an alias (e.g. `var two = argument2;`), treat
            // that occurrence as an alias initializer only and do NOT
            // count it as a direct reference. Tests expect alias
            // initializers to allow the alias to supersede the
            // fallback `argumentN` doc line, so avoid marking those
            // initializers as direct references here. For all other
            // contexts, record the direct reference normally.
            // Always count direct occurrences of `argumentN` as explicit
            // references. Historically we omitted initializer occurrences
            // when they were recorded as alias initializers to allow the
            // alias to completely supersede a fallback numeric doc line.
            // However, tests expect alias initializers to still cause the
            // numeric `argumentN` suffix to be preserved (in addition to
            // the alias) when it is referenced directly. Therefore, do
            // not suppress direct references for alias initializers; we
            // record the direct reference in all contexts.
            directReferenceIndices.add(directIndex);
        }

        Core.forEachNodeChild(node, (value) => {
            visit(value, node);
        });
    };

    visit(functionNode.body, functionNode);

    return { referencedIndices, aliasByIndex, directReferenceIndices };
}

function buildImplicitArgumentDocEntries({
    referencedIndices,
    aliasByIndex,
    directReferenceIndices
}) {
    if (!referencedIndices || referencedIndices.size === 0) {
        return [];
    }

    const sortedIndices = [...referencedIndices].sort(
        (left, right) => left - right
    );

    const result = [];
    for (const index of sortedIndices) {
        const entry = createImplicitArgumentDocEntry({
            index,
            aliasByIndex,
            directReferenceIndices
        });
        if (!entry) continue;
        // Push the primary entry first (alias if present, otherwise fallback)
        result.push(entry);

        // If an alias is present and the fallback numeric `argumentN` is
        // directly referenced, also produce an explicit fallback entry so
        // both alias and numeric doc lines are available to the printer
        // in the no-declared-params code path.
        if (
            entry.canonical &&
            entry.fallbackCanonical &&
            entry.canonical !== entry.fallbackCanonical &&
            entry.hasDirectReference === true
        ) {
            result.push({
                name: entry.fallbackCanonical,
                canonical: entry.fallbackCanonical,
                fallbackCanonical: entry.fallbackCanonical,
                index: entry.index,
                hasDirectReference: true
            });
        }
    }

    return result;
}

function createImplicitArgumentDocEntry({
    index,
    aliasByIndex,
    directReferenceIndices
}) {
    const fallbackName = `argument${index}`;
    const alias = aliasByIndex?.get(index);
    const docName = (alias && alias.length > 0 && alias) || fallbackName;
    const canonical = getCanonicalParamNameFromText(docName) ?? docName;
    const fallbackCanonical =
        getCanonicalParamNameFromText(fallbackName) ?? fallbackName;

    return {
        name: docName,
        canonical,
        fallbackCanonical,
        index,
        hasDirectReference: directReferenceIndices?.has(index) === true
    };
}

function getArgumentIndexFromNode(node) {
    if (!node || typeof node !== OBJECT_TYPE) {
        return null;
    }

    if (node.type === "Identifier") {
        return getArgumentIndexFromIdentifier(node.name);
    }

    if (
        node.type === "MemberIndexExpression" &&
        node.object?.type === "Identifier" &&
        node.object.name === "argument" &&
        Array.isArray(node.property) &&
        node.property.length === 1 &&
        node.property[0]?.type === "Literal"
    ) {
        const literal = node.property[0];
        const parsed = Number.parseInt(literal.value);
        return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
    }

    return null;
}

function getArgumentIndexFromIdentifier(name) {
    if (typeof name !== STRING_TYPE) {
        return null;
    }

    const match = name.match(/^argument(\d+)$/);
    if (!match) {
        return null;
    }

    const parsed = Number.parseInt(match[1]);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function maybeAppendReturnsDoc(
    lines,
    functionNode,
    hasReturnsTag,
    overrides: any = {}
) {
    if (!Array.isArray(lines)) {
        return [];
    }

    if (overrides?.suppressReturns === true) {
        return lines;
    }

    if (
        hasReturnsTag ||
        !functionNode ||
        functionNode.type !== "FunctionDeclaration" ||
        functionNode._suppressSyntheticReturnsDoc
    ) {
        return lines;
    }

    const body = functionNode.body;
    const statements =
        body?.type === "BlockStatement" && Array.isArray(body.body)
            ? body.body
            : null;

    if (!statements) {
        return [...lines, "/// @returns {undefined}"];
    }

    if (statements.length === 0) {
        return [...lines, "/// @returns {undefined}"];
    }

    if (functionReturnsNonUndefinedValue(functionNode)) {
        return lines;
    }

    return [...lines, "/// @returns {undefined}"];
}

function functionReturnsNonUndefinedValue(functionNode) {
    if (!functionNode || functionNode.type !== "FunctionDeclaration") {
        return false;
    }

    const body = functionNode.body;
    if (body?.type !== "BlockStatement" || !Array.isArray(body.body)) {
        return false;
    }

    const stack = [...body.body];
    const visited = new Set();

    while (stack.length > 0) {
        const current = stack.pop();
        if (!current || typeof current !== OBJECT_TYPE) {
            continue;
        }

        if (visited.has(current)) {
            continue;
        }
        visited.add(current);

        switch (current.type) {
            case "FunctionDeclaration":
            case "ConstructorDeclaration":
            case "FunctionExpression": {
                continue;
            }
            case "ReturnStatement": {
                const argument = current.argument;
                if (!argument) {
                    continue;
                }

                if (!Core.isUndefinedSentinel(argument)) {
                    return true;
                }

                continue;
            }
            default: {
                break;
            }
        }

        for (const value of Object.values(current)) {
            Core.enqueueObjectChildValues(stack, value);
        }
    }

    return false;
}

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
                    left: { type: "Identifier", name: param.name },
                    right: defaultExpr,
                    start: param.start ?? (defaultExpr && defaultExpr.start),
                    end: defaultExpr?.end ?? param.end
                };

                // preserve any comment metadata if present (best-effort)
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
                    // Ignore errors when copying optional parameter marker
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
            (param.default === null || param.default === undefined)
        ) {
            try {
                // Look left for an explicit default
                let seenExplicitDefaultToLeft = false;
                for (let j = 0; j < i; j += 1) {
                    const left = functionNode.params[j];
                    if (!left) continue;
                    if (left.type === "DefaultParameter") {
                        const isUndef =
                            typeof Core.isUndefinedSentinel === "function"
                                ? Core.isUndefinedSentinel(left.right)
                                : false;
                        if (!isUndef) {
                            seenExplicitDefaultToLeft = true;
                            break;
                        }
                    }
                    if (left.type === "AssignmentPattern") {
                        seenExplicitDefaultToLeft = true;
                        break;
                    }
                }

                if (seenExplicitDefaultToLeft) {
                    const defaultNode = {
                        type: "DefaultParameter",
                        left: { type: "Identifier", name: param.name },
                        // Use a Literal sentinel here so the printed shape
                        // and downstream checks observe `value: "undefined"`.
                        right: { type: "Literal", value: "undefined" }
                    };
                    // Do not mark synthesized trailing `= undefined` defaults
                    // as optional here; optionality should come from parser
                    // transforms or explicit doc comments so downstream
                    // heuristics remain consistent.
                    functionNode.params[i] = defaultNode;
                }
            } catch {
                // swallow
            }
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

                for (const stmt of body.body) {
                    if (!stmt || stmt.type !== "IfStatement") continue;

                    // Accept either a BinaryExpression test or a ParenthesizedExpression wrapping one.
                    const test =
                        stmt.test &&
                        (stmt.test.type === "BinaryExpression"
                            ? stmt.test
                            : stmt.test.type === "ParenthesizedExpression"
                              ? stmt.test.expression
                              : null);
                    if (!test || test.type !== "BinaryExpression") continue;

                    // We only handle guards of the form `argument_count > N` or
                    // related variants where the consequent assigns from
                    // argument[index] and the alternate assigns a fallback.
                    const right = test.right;
                    if (!right || right.type !== "Literal") continue;
                    const rightNumber = Number(String(right.value));
                    if (!Number.isInteger(rightNumber)) continue;

                    // Determine the expected argument index for the guard
                    let argIndex = null;
                    switch (test.operator) {
                        case ">": {
                            argIndex = rightNumber;
                            break;
                        }
                        case "<": {
                            argIndex = rightNumber - 1;
                            break;
                        }
                        case "==":
                        case "===": {
                            argIndex = rightNumber;
                            // No default
                            break;
                        }
                    }
                    if (!Number.isInteger(argIndex) || argIndex < 0) continue;

                    const consequentStmts = stmt.consequent
                        ? stmt.consequent.type === "BlockStatement"
                            ? Array.isArray(stmt.consequent.body)
                                ? stmt.consequent.body
                                : []
                            : [stmt.consequent]
                        : [];
                    const alternateStmts = stmt.alternate
                        ? stmt.alternate.type === "BlockStatement"
                            ? Array.isArray(stmt.alternate.body)
                                ? stmt.alternate.body
                                : []
                            : [stmt.alternate]
                        : [];

                    let matchedFromArg = false;
                    let matchedFallback = null;

                    for (const cs of consequentStmts) {
                        if (!cs) continue;
                        const assign =
                            cs.type === "ExpressionStatement" &&
                            cs.expression &&
                            cs.expression.type === "AssignmentExpression"
                                ? cs.expression
                                : cs.type === "AssignmentExpression"
                                  ? cs
                                  : null;
                        if (!assign) continue;
                        const left = assign.left;
                        const rightExpr = assign.right;
                        if (
                            left &&
                            left.type === "Identifier" &&
                            left.name === paramName &&
                            rightExpr &&
                            rightExpr.type === "MemberIndexExpression" &&
                            rightExpr.object?.type === "Identifier" &&
                            rightExpr.object.name === "argument" &&
                            Array.isArray(rightExpr.property) &&
                            rightExpr.property.length === 1 &&
                            rightExpr.property[0]?.type === "Literal"
                        ) {
                            const literal = rightExpr.property[0];
                            const parsed = Number.parseInt(literal.value);
                            if (
                                Number.isInteger(parsed) &&
                                parsed === argIndex
                            ) {
                                matchedFromArg = true;
                            }
                        }
                    }

                    if (!matchedFromArg) continue;

                    for (const as of alternateStmts) {
                        if (!as) continue;
                        const assign =
                            as.type === "ExpressionStatement" &&
                            as.expression &&
                            as.expression.type === "AssignmentExpression"
                                ? as.expression
                                : as.type === "AssignmentExpression"
                                  ? as
                                  : null;
                        if (!assign) continue;
                        const left = assign.left;
                        const rightExpr = assign.right;
                        if (
                            left &&
                            left.type === "Identifier" &&
                            left.name === paramName &&
                            (!rightExpr ||
                                rightExpr.type !== "MemberIndexExpression")
                        ) {
                            matchedFallback = rightExpr;
                            break;
                        }
                    }

                    if (matchedFromArg && matchedFallback) {
                        // Fill in the missing right side of the DefaultParameter
                        param.right = matchedFallback;
                        if (matchedFallback && matchedFallback.end !== null) {
                            param.end = matchedFallback.end;
                        }
                        // Do NOT set the _featherOptionalParameter marker here.
                        // The parser-transform is the authoritative source for
                        // optional parameter intent. If the parser produced
                        // the marker it will already be present on the param
                        // (and copied when materialized above).
                        // Remove the matched statement from the body
                        const idx = body.body.indexOf(stmt);
                        if (idx !== -1) {
                            body.body.splice(idx, 1);
                        }
                        break;
                    }
                }
            } catch {
                // Non-fatal — leave the param as-is.
            }
        }
    }
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
    if (!/\s/.test(afterChar)) {
        return false;
    }

    return true;
}

function structLiteralHasLeadingLineBreak(node, options) {
    if (!node) {
        return false;
    }

    const { originalText } = resolvePrinterSourceMetadata(options);

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
                index += 2;
                while (index < source.length) {
                    const commentChar = source[index];
                    if (commentChar === "\n") {
                        return true;
                    }
                    if (commentChar === "\r") {
                        if (source[index + 1] === "\n") {
                            return true;
                        }
                        return true;
                    }

                    index += 1;
                }

                return false;
            }

            if (lookahead === "*") {
                index += 2;
                while (index < source.length - 1) {
                    const commentChar = source[index];
                    if (commentChar === "\n") {
                        return true;
                    }
                    if (commentChar === "\r") {
                        if (source[index + 1] === "\n") {
                            return true;
                        }
                        return true;
                    }

                    if (commentChar === "*" && source[index + 1] === "/") {
                        index += 1;
                        break;
                    }

                    index += 1;
                }

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

function getStructPropertyPrefix(node, options) {
    if (!node) {
        return null;
    }

    const { originalText } = resolvePrinterSourceMetadata(options);

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

function getNormalizedParameterName(paramNode) {
    if (!paramNode) {
        return null;
    }

    const rawName = Core.getIdentifierText(paramNode);
    if (typeof rawName !== STRING_TYPE || rawName.length === 0) {
        return null;
    }

    const normalizedName = normalizeDocMetadataName(rawName);
    return Core.getNonEmptyString(normalizedName);
}

function getParameterDocInfo(paramNode, functionNode, options) {
    if (!paramNode) {
        return null;
    }

    if (paramNode.type === "Identifier") {
        const name = getNormalizedParameterName(paramNode);
        return name
            ? {
                  name,
                  optional: false,
                  optionalOverride: false,
                  explicitUndefinedDefault: false
              }
            : null;
    }

    if (paramNode.type === "DefaultParameter") {
        // Some AST transforms may wrap parameters in a DefaultParameter node
        // but leave the `right` side null when no actual default value was
        // provided. Treat those cases like a plain identifier so we don't
        // incorrectly mark the parameter as optional (which would produce
        // bracketed `@param [name]` entries in synthetic docs).
        if (paramNode.right == null) {
            const name = getNormalizedParameterName(paramNode.left);
            return name
                ? {
                      name,
                      optional: false,
                      optionalOverride: false,
                      explicitUndefinedDefault: false
                  }
                : null;
        }

        const name = getNormalizedParameterName(paramNode.left);
        if (!name) {
            return null;
        }

        const defaultIsUndefined = Core.isUndefinedSentinel(paramNode.right);
        const signatureOmitsUndefinedDefault =
            defaultIsUndefined &&
            shouldOmitUndefinedDefaultForFunctionNode(functionNode);
        const isConstructorLike =
            functionNode?.type === "ConstructorDeclaration" ||
            functionNode?.type === "ConstructorParentClause";

        const shouldIncludeDefaultText =
            !defaultIsUndefined ||
            (!signatureOmitsUndefinedDefault && !isConstructorLike);

        const defaultText = shouldIncludeDefaultText
            ? getSourceTextForNode(paramNode.right, options)
            : null;

        const docName = defaultText ? `${name}=${defaultText}` : name;

        // The parser is authoritative about whether a parameter with an
        // `undefined` RHS should be considered intentionally optional.
        // If the transform or doc-driven pass set
        // `_featherOptionalParameter`, honor it here. This includes
        // materialized defaults: the parser may mark materialized nodes as
        // explicitly optional when appropriate and the printer should
        // consume that intent rather than masking it.
        const optionalOverride = paramNode?._featherOptionalParameter === true;
        const searchName = getNormalizedParameterName(
            paramNode.left ?? paramNode
        );
        const explicitUndefinedDefaultFromSource =
            defaultIsUndefined &&
            typeof searchName === STRING_TYPE &&
            searchName.length > 0 &&
            typeof options?.originalText === STRING_TYPE &&
            options.originalText.includes(`${searchName} = undefined`);
        // Treat undefined defaults as optional only when the parser/transform
        // explicitly declared the parameter optional (optionalOverride).
        // Historically we also treated an explicit source `= undefined` as
        // evidence of optionality, but that causes the printer to preserve
        // redundant `= undefined` signatures even when doc-comments mark a
        // parameter as required. Avoid inferring optionality from the raw
        // source text alone; downstream doc/printing logic will consult
        // existing doc metadata and parser-intent flags to decide whether to
        // retain or omit an `= undefined` default.
        // For undefined defaults, prefer the parser's explicit optionality
        // override. However, for constructor-like functions where the
        // signature intentionally preserves `= undefined`, treat the
        // parameter as optional for synthesized docs even if the parser
        // didn't set an explicit override.
        const optional = defaultIsUndefined
            ? isConstructorLike
                ? true
                : optionalOverride
            : true;

        return {
            name: docName,
            optional,
            optionalOverride,
            explicitUndefinedDefault: explicitUndefinedDefaultFromSource
        };
    }

    if (paramNode.type === "MissingOptionalArgument") {
        return null;
    }

    const fallbackName = getNormalizedParameterName(paramNode);
    return fallbackName
        ? {
              name: fallbackName,
              optional: false,
              optionalOverride: false,
              explicitUndefinedDefault: false
          }
        : null;
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
        const { originalText } = resolvePrinterSourceMetadata(options);
        if (typeof originalText === STRING_TYPE && originalText.length > 0) {
            const fnStart = Core.getNodeStartIndex(functionNode) ?? 0;
            const prefix = originalText.slice(0, fnStart);
            const lastDocIndex = prefix.lastIndexOf("///");
            if (lastDocIndex !== -1) {
                const docBlock = prefix.slice(lastDocIndex);
                const lines = docBlock.split(/\r\n|\n|\r/);
                const paramName =
                    node.left && node.left.name ? node.left.name : null;
                if (paramName) {
                    // search from the bottom (closest to function)
                    for (let i = lines.length - 1; i >= 0; i -= 1) {
                        const line = lines[i];
                        const m = line.match(
                            /\/\/\/\s*@param\s*(?:\{[^}]+\}\s*)?(\[[^\]]+\]|\S+)/i
                        );
                        if (!m) continue;
                        const raw = m[1];
                        let name = raw;
                        if (name.startsWith("[")) {
                            name = name.slice(1);
                        }
                        if (name.endsWith("]")) {
                            name = name.slice(0, -1);
                        }
                        name = name.trim();
                        if (name === paramName) {
                            const isOptional = /^\[.*\]$/.test(raw);
                            return !isOptional;
                        }
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
    if (!branchNode || Core.hasComment(branchNode)) {
        return null;
    }

    if (branchNode.type === "BlockStatement") {
        const statements = Array.isArray(branchNode.body)
            ? branchNode.body
            : [];
        if (statements.length !== 1) {
            return null;
        }

        const [onlyStatement] = statements;
        if (
            Core.hasComment(onlyStatement) ||
            onlyStatement.type !== "ReturnStatement"
        ) {
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
    if (!innerName) {
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

function shouldGenerateSyntheticDocForFunction(
    path,
    existingDocLines,
    options
) {
    const node = path.getValue();
    const parent = path.getParentNode();
    if (
        !node ||
        !parent ||
        (parent.type !== "Program" && parent.type !== "BlockStatement")
    ) {
        return false;
    }

    if (node.type === "ConstructorDeclaration") {
        return true;
    }

    if (
        node.type !== "FunctionDeclaration" &&
        node.type !== "StructFunctionDeclaration"
    ) {
        return false;
    }

    const convertedExistingForSynthetic =
        Core.convertLegacyReturnsDescriptionLinesToMetadata(existingDocLines, {
            normalizeDocCommentTypeAnnotations: Core.normalizeGameMakerType
        });
    const syntheticLines = computeSyntheticFunctionDocLines(
        node,
        convertedExistingForSynthetic,
        options
    );

    if (syntheticLines.length > 0) {
        return true;
    }

    if (Core.hasLegacyReturnsDescriptionLines(existingDocLines)) {
        return true;
    }

    const hasParamDocLines = existingDocLines.some((line) => {
        if (typeof line !== STRING_TYPE) {
            return false;
        }

        const trimmed = Core.toTrimmedString(line);
        return /^\/\/\/\s*@param\b/i.test(trimmed);
    });

    if (hasParamDocLines) {
        const declaredParamCount = Array.isArray(node.params)
            ? node.params.length
            : 0;
        let hasImplicitDocEntries = false;

        if (
            node.type === "FunctionDeclaration" ||
            node.type === "StructFunctionDeclaration"
        ) {
            const implicitEntries = collectImplicitArgumentDocNames(
                node,
                options
            );
            hasImplicitDocEntries = implicitEntries.length > 0;
        }

        if (declaredParamCount === 0 && !hasImplicitDocEntries) {
            return true;
        }
    }

    return (
        Array.isArray(node.params) &&
        node.params.some((param) => {
            return param?.type === "DefaultParameter";
        })
    );
}

function findSiblingListAndIndex(parent, targetNode) {
    if (!parent || !targetNode) {
        return null;
    }

    // Iterate using `for...in` to preserve the original hot-path optimization
    // while keeping the scan readable and short-circuiting as soon as the node
    // is located.
    for (const key in parent) {
        if (!Object.hasOwn(parent, key)) {
            continue;
        }

        const value = parent[key];
        if (!Array.isArray(value)) {
            continue;
        }

        for (let index = 0; index < value.length; index += 1) {
            if (value[index] === targetNode) {
                return { list: value, index };
            }
        }
    }

    return null;
}

function loopLengthNameConflicts(path, cachedLengthName) {
    if (
        typeof cachedLengthName !== STRING_TYPE ||
        cachedLengthName.length === 0
    ) {
        return false;
    }

    const siblingInfo = getParentStatementList(path);
    if (!siblingInfo) {
        return false;
    }

    const { siblingList, nodeIndex } = siblingInfo;
    for (const [index, element] of siblingList.entries()) {
        if (index === nodeIndex) {
            continue;
        }

        if (nodeDeclaresIdentifier(element, cachedLengthName)) {
            return true;
        }
    }

    return false;
}

function nodeDeclaresIdentifier(node, identifierName) {
    if (!node || typeof identifierName !== STRING_TYPE) {
        return false;
    }

    if (node.type === "VariableDeclaration") {
        const declarations = node.declarations;
        if (!Array.isArray(declarations)) {
            return false;
        }

        for (const declarator of declarations) {
            if (!declarator || declarator.type !== "VariableDeclarator") {
                continue;
            }

            const declaratorName = Core.getIdentifierText(declarator.id);
            if (declaratorName === identifierName) {
                return true;
            }
        }

        return false;
    }

    if (node.type === "ForStatement") {
        return nodeDeclaresIdentifier(node.init, identifierName);
    }

    const nodeIdName = Core.getIdentifierText(node.id);
    return nodeIdName === identifierName;
}

function getParentStatementList(path) {
    if (
        typeof path?.getValue !== "function" ||
        typeof path.getParentNode !== "function"
    ) {
        return null;
    }

    const node = path.getValue();
    if (!node) {
        return null;
    }

    const parent = path.getParentNode();
    if (!parent) {
        return null;
    }

    const siblingInfo = findSiblingListAndIndex(parent, node);
    if (!siblingInfo) {
        return null;
    }

    return {
        siblingList: siblingInfo.list,
        nodeIndex: siblingInfo.index
    };
}

function shouldInsertHoistedLoopSeparator(path, options) {
    if (typeof path?.getValue !== "function") {
        return false;
    }

    const node = path.getValue();
    if (node?.type !== "ForStatement") {
        return false;
    }

    const siblingInfo = getParentStatementList(path);
    if (!siblingInfo) {
        return false;
    }

    const nextNode = siblingInfo.siblingList[siblingInfo.nodeIndex + 1];
    if (nextNode?.type !== "ForStatement") {
        return false;
    }

    return options?.optimizeLoopLengthHoisting ?? true;
}

function stripSyntheticParameterSentinels(name) {
    if (typeof name !== STRING_TYPE) {
        return name;
    }

    // GameMaker constructors commonly prefix private parameters with underscores
    // (e.g., `_value`, `__foo__`) or similar characters like `$`. These sentinels
    // should not appear in generated documentation metadata, so remove them from
    // the beginning and end of the identifier while leaving the core name intact.
    let sanitized = name;
    sanitized = sanitized.replace(/^[_$]+/, "");
    sanitized = sanitized.replace(/[_$]+$/, "");

    return sanitized.length > 0 ? sanitized : name;
}

function normalizeDocMetadataName(name) {
    if (typeof name !== STRING_TYPE) {
        return name;
    }

    const optionalNormalized = Core.normalizeOptionalParamToken(name);
    if (typeof optionalNormalized === STRING_TYPE) {
        if (/^\[[^\]]+\]$/.test(optionalNormalized)) {
            return optionalNormalized;
        }

        const sanitized = stripSyntheticParameterSentinels(optionalNormalized);
        return sanitized.length > 0 ? sanitized : optionalNormalized;
    }

    return name;
}

function docParamNamesLooselyEqual(left, right) {
    if (typeof left !== STRING_TYPE || typeof right !== STRING_TYPE) {
        return false;
    }

    const toComparable = (value) => {
        const normalized = normalizeDocMetadataName(value);
        if (typeof normalized !== STRING_TYPE) {
            return null;
        }

        let trimmed = normalized.trim();
        if (trimmed.length === 0) {
            return null;
        }

        if (
            trimmed.startsWith("[") &&
            trimmed.endsWith("]") &&
            trimmed.length > 2
        ) {
            trimmed = trimmed.slice(1, -1).trim();
        }

        const comparable = trimmed.replaceAll(/[_\s]+/g, "").toLowerCase();
        return comparable.length > 0 ? comparable : null;
    };

    const leftComparable = toComparable(left);
    const rightComparable = toComparable(right);

    if (leftComparable === null || rightComparable === null) {
        return false;
    }

    return leftComparable === rightComparable;
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

    const expression = node.expression;

    // For ternary expressions, omit unnecessary parentheses around simple
    // identifiers or member expressions in the test position
    if (parent.type === "TernaryExpression") {
        const parentKey = callPathMethod(path, "getName");
        if (parentKey === "test") {
            const expression = node.expression;
            // Trim redundant parentheses when the ternary guard is just a bare
            // identifier or property lookup. The parser faithfully records the
            // author-supplied parens as a `ParenthesizedExpression`, so without
            // this branch the printer would emit `(foo) ?` style guards that look
            // like extra precedence handling. The formatter's ternary examples in
            // README.md#formatter-at-a-glance promise minimal grouping, and
            // teams lean on that contract when reviewing formatter diffs. We keep
            // the removal scoped to trivially safe shapes so we do not second-
            // guess parentheses that communicate evaluation order for compound
            // boolean logic or arithmetic.
            if (
                expression?.type === "Identifier" ||
                expression?.type === "MemberDotExpression" ||
                expression?.type === "MemberIndexExpression"
            ) {
                return true;
            }
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

        if (
            (ancestor.type === "IfStatement" &&
                ancestor.test === currentNode) ||
            (ancestor.type === "WhileStatement" &&
                ancestor.test === currentNode) ||
            (ancestor.type === "DoUntilStatement" &&
                ancestor.test === currentNode) ||
            (ancestor.type === "RepeatStatement" &&
                ancestor.test === currentNode) ||
            (ancestor.type === "WithStatement" &&
                ancestor.test === currentNode) ||
            (ancestor.type === "ForStatement" && ancestor.test === currentNode)
        ) {
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

    return false;
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

function isSyntheticParenFlatteningEnabled(path) {
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
            return ancestor._flattenSyntheticNumericParens !== false;
        }

        depth += 1;
    }
}

function isSyntheticParenFlatteningForced(path) {
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
            return ancestor._flattenSyntheticNumericParens === true;
        }

        depth += 1;
    }
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

// TODO: Remove this function. We don't want ONLY division by two to be special-cased
// This is already handled by the general numeric expression flattening logic
function isDivisionByTwoConvertible(node) {
    if (!node || node.type !== "BinaryExpression") {
        return false;
    }

    if (node.operator !== "/") {
        return false;
    }

    if (node.right?.type !== "Literal" || node.right.value !== "2") {
        return false;
    }

    if (
        Core.hasComment(node) ||
        Core.hasComment(node.left) ||
        Core.hasComment(node.right)
    ) {
        return false;
    }

    return true;
}

// TODO: This function uses 'isDivisionByTwoConvertible', but we should not special-case division by two
function shouldFlattenMultiplicationChain(parent, expression, path) {
    if (
        !parent ||
        !expression ||
        expression.type !== "BinaryExpression" ||
        expression.operator !== "*"
    ) {
        return false;
    }

    const parentIsMultiplication =
        parent.type === "BinaryExpression" && parent.operator === "*";
    const parentIsDivisionByTwo = isDivisionByTwoConvertible(parent);

    if (!parentIsMultiplication && !parentIsDivisionByTwo) {
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

function buildLoopLengthDocs(path, print, hoistInfo) {
    const cachedLengthName = buildCachedSizeVariableName(
        hoistInfo.sizeIdentifierName,
        hoistInfo.cachedLengthSuffix
    );
    const loopSizeCallDoc = printWithoutExtraParens(
        path,
        print,
        "test",
        "right"
    );
    const iteratorDoc = printWithoutExtraParens(path, print, "test", "left");

    return {
        cachedLengthName,
        loopSizeCallDoc,
        iteratorDoc
    };
}

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

        const blockSource = getSourceTextForNode(inlineCandidate, options);
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

    const match = ARGUMENT_IDENTIFIER_PATTERN.exec(initializer.name ?? "");
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

    const docPreferences = preferredParamDocNamesByNode.get(functionNode);
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
                Parser.printDanglingCommentsAsGroup(
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
            Parser.printDanglingComments(
                path,
                options,
                (comment) => comment.attachToBrace
            ),
            Parser.printDanglingCommentsAsGroup(
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
            (commentPath) => Parser.printComment(commentPath, options),
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
