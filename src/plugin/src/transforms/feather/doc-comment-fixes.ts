/**
 * JSDoc and doc-comment sanitization for Feather diagnostics.
 *
 * This module handles JSDoc type annotation corrections, @function tag updates,
 * @param name resolution, and comment metadata management for GML code.
 *
 * ARCHITECTURE: Extracted from apply-feather-fixes.ts to reduce file size and
 * improve maintainability. These functions deal exclusively with doc comment
 * parsing, validation, and normalization.
 */

import { Core } from "@gml-modules/core";

import { getStartFromNode } from "./ast-traversal.js";
import { attachFeatherFixMetadata, createFeatherFixDetail, hasFeatherDiagnosticContext } from "./utils.js";

function updateStaticFunctionDocComments(ast: any) {
    const allComments = ast.comments || [];

    Core.walkAst(ast, (node) => {
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
                commentsToSearch = collectPrecedingFunctionComments(node, allComments);
            }

            if (commentsToSearch.length > 0) {
                updateFunctionTagName(commentsToSearch, functionName);
            }
        }
    });
}

function collectPrecedingFunctionComments(node: any, allComments: Array<any>): Array<any> {
    const nodeStart = getStartFromNode(node);
    if (nodeStart === undefined) {
        return [];
    }

    // We only care about the closest block of comments that end before this node.
    // It's unlikely that another @function block exists between the comment and
    // the node we're analyzing, so we just pick the most recent candidates.
    return allComments.filter((comment) => comment.end <= nodeStart).toSorted((a: any, b: any) => b.end - a.end);
}

function updateFunctionTagName(comments: Array<any>, functionName: string) {
    for (const comment of comments) {
        const value = comment.value;
        const match = /(@function\s+)([A-Za-z_][A-Za-z0-9_]*)/.exec(value);
        if (!match) {
            continue;
        }

        const currentTagName = match[2];
        if (currentTagName !== functionName) {
            comment.value = value.replace(/(@function\s+)[A-Za-z_][A-Za-z0-9_]*/, `$1${functionName}`);
            delete comment.start;
            delete comment.end;
            delete comment.loc;
        }

        break;
    }
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

/**
 * Scans the AST for malformed JSDoc type annotations and attempts to fix them.
 *
 * LOCATION SMELL: JSDoc type parsing, validation, and normalization should live in the
 * Core doc-comment service, not in the Feather-fixes file. The doc-comment
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
 * Adds space between base types and their generic/specifier syntax (e.g., Array<T>).
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

/**
 * Extracts the base type name from a type segment.
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

function updateJSDocParamName(node: any, oldName: string, newName: string, collectionService: any) {
    if (!node) {
        return;
    }

    const comments = collectionService ? collectionService.getComments(node) : node.comments;

    if (!Array.isArray(comments)) {
        return;
    }

    const escapedOld = Core.escapeRegExp(oldName);
    const regex = new RegExp(String.raw`\b${escapedOld}\b`, "g");

    for (const comment of comments) {
        if (typeof comment.value === "string" && comment.value.includes("@param")) {
            comment.value = comment.value.replace(regex, newName);
        }
    }
}

export {
    applyOrderedDocNamesToImplicitEntries,
    cacheFunctionTagParams,
    collectPrecedingFunctionComments,
    findFunctionTagParamsFromSource,
    resolveFunctionTagParamList,
    sanitizeMalformedJsDocTypes,
    updateFunctionTagName,
    updateJSDocParamName,
    updateStaticFunctionDocComments};
