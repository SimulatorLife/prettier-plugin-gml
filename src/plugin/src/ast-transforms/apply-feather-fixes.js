import { getNodeEndIndex, getNodeStartIndex } from "../../../shared/ast-locations.js";
import { getFeatherDiagnostics } from "../../../shared/feather/metadata.js";

const FEATHER_FIX_IMPLEMENTATIONS = buildFeatherFixImplementations();
const FEATHER_DIAGNOSTIC_FIXERS = buildFeatherDiagnosticFixers();
const TRAILING_MACRO_SEMICOLON_PATTERN = new RegExp(
    ";(?=[^\\S\\r\\n]*(?:(?:\\/\\/[^\\r\\n]*|\\/\\*[\\s\\S]*?\\*\/)[^\\S\\r\\n]*)*(?:\\r?\\n|$))"
);
const MANUAL_FIX_TRACKING_KEY = Symbol("manualFeatherFixes");

export function getFeatherDiagnosticFixers() {
    return new Map(FEATHER_DIAGNOSTIC_FIXERS);
}

export function applyFeatherFixes(ast, { sourceText } = {}) {
    if (!ast || typeof ast !== "object") {
        return ast;
    }

    const appliedFixes = [];

    for (const entry of FEATHER_DIAGNOSTIC_FIXERS.values()) {
        const fixes = entry.applyFix(ast, { sourceText });

        if (Array.isArray(fixes) && fixes.length > 0) {
            appliedFixes.push(...fixes);
        }
    }

    if (appliedFixes.length > 0) {
        attachFeatherFixMetadata(ast, appliedFixes);
    }

    return ast;
}

function buildFeatherDiagnosticFixers() {
    const diagnostics = getFeatherDiagnostics();
    const registry = new Map();

    for (const diagnostic of diagnostics) {
        const diagnosticId = diagnostic?.id;

        if (!diagnosticId || registry.has(diagnosticId)) {
            continue;
        }

        const applyFix = createFixerForDiagnostic(diagnostic);

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

function createFixerForDiagnostic(diagnostic) {
    const implementationFactory = FEATHER_FIX_IMPLEMENTATIONS.get(diagnostic?.id);

    if (typeof implementationFactory === "function") {
        const implementation = implementationFactory(diagnostic);

        if (typeof implementation === "function") {
            return (ast, context) => {
                const fixes = implementation({
                    ast,
                    sourceText: context?.sourceText
                });

                return Array.isArray(fixes) ? fixes : [];
            };
        }
    }

    return createNoOpFixer();
}

function createNoOpFixer() {
    return () => [];
}

function buildFeatherFixImplementations() {
    const registry = new Map();
    const diagnostics = getFeatherDiagnostics();

    for (const diagnostic of diagnostics) {
        const diagnosticId = diagnostic?.id;

        if (!diagnosticId) {
            continue;
        }

        if (diagnosticId === "GM1051") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast, sourceText }) => {
                const fixes = removeTrailingMacroSemicolons({
                    ast,
                    sourceText,
                    diagnostic
                });

                if (Array.isArray(fixes) && fixes.length > 0) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM1042") {
            registerFeatherFixer(
                registry,
                diagnosticId,
                () => ({ ast, sourceText }) => {
                    const fixes = alignJsDocParameterNamesWithFunctionParameters({
                        ast,
                        sourceText,
                        diagnostic
                    });

                    if (Array.isArray(fixes) && fixes.length > 0) {
                        return fixes;
                    }

                    return registerManualFeatherFix({ ast, diagnostic });
                }
            );
            continue;
        }

        if (diagnosticId === "GM2020") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = convertAllDotAssignmentsToWithStatements({ ast, diagnostic });

                if (Array.isArray(fixes) && fixes.length > 0) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM2054") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = ensureAlphaTestRefIsReset({ ast, diagnostic });

                if (Array.isArray(fixes) && fixes.length > 0) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
            continue;
        }

        registerFeatherFixer(registry, diagnosticId, () => ({ ast }) =>
            registerManualFeatherFix({ ast, diagnostic })
        );
    }

    return registry;
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

function removeTrailingMacroSemicolons({ ast, sourceText, diagnostic }) {
    if (!diagnostic || typeof sourceText !== "string" || sourceText.length === 0) {
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

function sanitizeMacroDeclaration(node, sourceText, diagnostic) {
    if (!node || typeof node !== "object") {
        return null;
    }

    const tokens = Array.isArray(node.tokens) ? node.tokens : null;
    if (!tokens || tokens.length === 0) {
        return null;
    }

    const lastToken = tokens[tokens.length - 1];
    if (lastToken !== ";") {
        return null;
    }

    const startIndex = node.start?.index;
    const endIndex = node.end?.index;

    if (typeof startIndex !== "number" || typeof endIndex !== "number") {
        return null;
    }

    const originalText = sourceText.slice(startIndex, endIndex + 1);

    // Only strip semicolons that appear at the end of the macro definition.
    const sanitizedText = originalText.replace(TRAILING_MACRO_SEMICOLON_PATTERN, "");

    if (sanitizedText === originalText) {
        return null;
    }

    node.tokens = tokens.slice(0, tokens.length - 1);
    node._featherMacroText = sanitizedText;

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: node.name?.name ?? null,
        range: {
            start: getNodeStartIndex(node),
            end: getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

function convertAllDotAssignmentsToWithStatements({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
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

function convertAllAssignment(node, parent, property, diagnostic) {
    if (!Array.isArray(parent) || typeof property !== "number") {
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
        left: cloneIdentifier(propertyIdentifier),
        right: node.right,
        start: cloneLocation(node.start),
        end: cloneLocation(node.end)
    };

    const blockStatement = {
        type: "BlockStatement",
        body: [normalizedAssignment],
        start: cloneLocation(node.start),
        end: cloneLocation(node.end)
    };

    const parenthesizedExpression = {
        type: "ParenthesizedExpression",
        expression: cloneIdentifier(object),
        start: cloneLocation(object?.start ?? node.start),
        end: cloneLocation(object?.end ?? node.end)
    };

    const withStatement = {
        type: "WithStatement",
        test: parenthesizedExpression,
        body: blockStatement,
        start: cloneLocation(node.start),
        end: cloneLocation(node.end)
    };

    copyCommentMetadata(node, withStatement);

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: propertyIdentifier?.name ?? null,
        range: {
            start: getNodeStartIndex(node),
            end: getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    parent[property] = withStatement;
    attachFeatherFixMetadata(withStatement, [fixDetail]);

    return fixDetail;
}

function ensureAlphaTestRefIsReset({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
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

function ensureAlphaTestRefResetAfterCall(node, parent, property, diagnostic) {
    if (!Array.isArray(parent) || typeof property !== "number") {
        return null;
    }

    if (!node || node.type !== "CallExpression") {
        return null;
    }

    if (!isIdentifierWithName(node.object, "gpu_set_alphatestref")) {
        return null;
    }

    const args = Array.isArray(node.arguments) ? node.arguments : [];

    if (args.length === 0) {
        return null;
    }

    if (isLiteralZero(args[0])) {
        return null;
    }

    const siblings = parent;
    const nextNode = siblings[property + 1];

    if (isAlphaTestRefResetCall(nextNode)) {
        return null;
    }

    const resetCall = createAlphaTestRefResetCall(node);

    if (!resetCall) {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: node.object?.name ?? null,
        range: {
            start: getNodeStartIndex(node),
            end: getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    siblings.splice(property + 1, 0, resetCall);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
}

function cloneIdentifier(node) {
    if (!node || node.type !== "Identifier") {
        return null;
    }

    const cloned = {
        type: "Identifier",
        name: node.name
    };

    if (Object.prototype.hasOwnProperty.call(node, "start")) {
        cloned.start = cloneLocation(node.start);
    }

    if (Object.prototype.hasOwnProperty.call(node, "end")) {
        cloned.end = cloneLocation(node.end);
    }

    return cloned;
}

function cloneLocation(location) {
    if (typeof location === "number") {
        return location;
    }

    if (location && typeof location === "object") {
        return { ...location };
    }

    return location ?? undefined;
}

function copyCommentMetadata(source, target) {
    if (!source || !target) {
        return;
    }

    ["leadingComments", "trailingComments", "innerComments", "comments"].forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            target[key] = source[key];
        }
    });
}

function isIdentifierWithName(node, name) {
    if (!node || node.type !== "Identifier") {
        return false;
    }

    return node.name === name;
}

function isLiteralZero(node) {
    if (!node || node.type !== "Literal") {
        return false;
    }

    return node.value === "0" || node.value === 0;
}

function isAlphaTestRefResetCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (!isIdentifierWithName(node.object, "gpu_set_alphatestref")) {
        return false;
    }

    const args = Array.isArray(node.arguments) ? node.arguments : [];

    if (args.length === 0) {
        return false;
    }

    return isLiteralZero(args[0]);
}

function createAlphaTestRefResetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = cloneIdentifier(template.object);

    if (!identifier || identifier.name !== "gpu_set_alphatestref") {
        return null;
    }

    const literalZero = createLiteral("0", template.arguments?.[0]);

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: [literalZero]
    };

    if (Object.prototype.hasOwnProperty.call(template, "start")) {
        callExpression.start = cloneLocation(template.start);
    }

    if (Object.prototype.hasOwnProperty.call(template, "end")) {
        callExpression.end = cloneLocation(template.end);
    }

    return callExpression;
}

function createLiteral(value, template) {
    const literalValue = typeof value === "number" ? String(value) : value;

    const literal = {
        type: "Literal",
        value: literalValue
    };

    if (template && typeof template === "object") {
        if (Object.prototype.hasOwnProperty.call(template, "start")) {
            literal.start = cloneLocation(template.start);
        }

        if (Object.prototype.hasOwnProperty.call(template, "end")) {
            literal.end = cloneLocation(template.end);
        }
    }

    return literal;
}


function alignJsDocParameterNamesWithFunctionParameters({ ast, sourceText, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    if (typeof sourceText !== "string" || sourceText.length === 0) {
        return [];
    }

    const comments = Array.isArray(ast.comments) ? ast.comments : [];
    if (comments.length === 0) {
        return [];
    }

    const fixes = [];

    const visit = (node) => {
        if (!node || typeof node !== "object") {
            return;
        }

        if (Array.isArray(node)) {
            for (const entry of node) {
                visit(entry);
            }
            return;
        }

        if (node.type === "FunctionDeclaration") {
            const fix = alignFunctionDocComment({
                node,
                sourceText,
                diagnostic,
                comments
            });

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

function alignFunctionDocComment({ node, sourceText, diagnostic, comments }) {
    const startIndex = getNodeStartIndex(node);
    const functionName = typeof node?.id === "string" ? node.id : null;
    if (startIndex == null) {
        return null;
    }

    const paramNames = getFunctionParameterNames(node);
    if (!paramNames) {
        return null;
    }

    const docComments = findLeadingJsDocComments({
        comments,
        boundaryStart: startIndex,
        sourceText
    });

    if (docComments.length === 0) {
        return null;
    }

    let changed = false;

    for (const entry of docComments) {
        const rawText = getCommentRawText(entry).trim();
        const tagMatch = rawText.match(/^\/\/\/\s*@([a-z]+)/i);
        if (!tagMatch) {
            continue;
        }

        const tag = tagMatch[1].toLowerCase();
        if (tag === "func" || tag === "function") {
            if (updateFunctionDocSignature(entry, rawText, paramNames)) {
                changed = true;
            }
        }
    }

    let ordinal = 0;
    for (const entry of docComments) {
        if (ordinal >= paramNames.length) {
            break;
        }

        const rawText = getCommentRawText(entry).trim();
        const tagMatch = rawText.match(/^\/\/\/\s*@([a-z]+)/i);
        if (!tagMatch) {
            continue;
        }

        const tag = tagMatch[1].toLowerCase();
        if (tag === "arg" || tag === "argument" || tag === "param") {
            if (updateFunctionDocParameter(entry, rawText, paramNames[ordinal])) {
                changed = true;
            }
            ordinal += 1;
        }
    }

    if (!changed) {
        return null;
    }

    const firstComment = docComments[0];
    const lastComment = docComments[docComments.length - 1];
    const rangeStart = getNodeStartIndex(firstComment);
    const rangeEnd = getNodeEndIndex(lastComment);

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: functionName,
        range:
            typeof rangeStart === "number" && typeof rangeEnd === "number"
                ? { start: rangeStart, end: rangeEnd }
                : null
    });

    if (!fixDetail) {
        return null;
    }

    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

function getFunctionParameterNames(node) {
    const params = Array.isArray(node?.params) ? node.params : [];
    const names = [];

    for (const param of params) {
        const name = extractParameterName(param);
        if (!name) {
            return null;
        }
        names.push(name);
    }

    return names;
}

function extractParameterName(param) {
    if (!param || typeof param !== "object") {
        return null;
    }

    if (param.type === "Identifier" && typeof param.name === "string") {
        return param.name;
    }

    if (param.type === "DefaultParameter") {
        return extractParameterName(param.left);
    }

    return null;
}

function findLeadingJsDocComments({ comments, boundaryStart, sourceText }) {
    if (!Array.isArray(comments) || comments.length === 0) {
        return [];
    }

    const docComments = [];
    let boundary = boundaryStart;

    for (let index = comments.length - 1; index >= 0; index -= 1) {
        const comment = comments[index];
        if (!isDocCommentLine(comment)) {
            continue;
        }

        const commentEnd = getNodeEndIndex(comment);
        const commentStart = getNodeStartIndex(comment);
        if (commentStart == null || commentEnd == null) {
            continue;
        }

        if (commentEnd > boundary) {
            continue;
        }

        const between = sourceText.slice(commentEnd + 1, boundary);
        if (between.trim() !== "") {
            if (commentEnd < boundaryStart) {
                break;
            }
            continue;
        }

        docComments.unshift(comment);
        boundary = commentStart;

        if (commentStart <= 0) {
            break;
        }
    }

    if (docComments.length === 0) {
        return [];
    }

    return docComments;
}

function isDocCommentLine(comment) {
    if (!comment || typeof comment !== "object") {
        return false;
    }

    if (comment.type !== "CommentLine") {
        return false;
    }

    const value = typeof comment.value === "string" ? comment.value : "";
    const trimmed = value.trim();

    return /^\/\s*@/i.test(trimmed);
}

function getCommentRawText(comment) {
    if (!comment || typeof comment !== "object") {
        return "";
    }

    if (typeof comment.leadingText === "string") {
        return comment.leadingText;
    }

    if (typeof comment.raw === "string") {
        return comment.raw;
    }

    const value = typeof comment.value === "string" ? comment.value : "";
    return `//${value}`;
}

function updateFunctionDocSignature(comment, rawText, paramNames) {
    const match = rawText.match(/^(\s*\/\/\/\s*@(?:func|function)\s+[^()]*\()([^)]*)(\)\s*;?.*)$/i);
    if (!match) {
        return false;
    }

    const [, prefix, paramsSection, suffix] = match;
    const leadingSpaceMatch = paramsSection.match(/^\s*/);
    const trailingSpaceMatch = paramsSection.match(/\s*$/);
    const leading = leadingSpaceMatch ? leadingSpaceMatch[0] : "";
    const trailing = trailingSpaceMatch ? trailingSpaceMatch[0] : "";
    const delimiterMatch = paramsSection.match(/,\s*/);
    const delimiter = delimiterMatch ? delimiterMatch[0] : ", ";
    const joinedParams = paramNames.length > 0 ? paramNames.join(delimiter) : "";
    const newParams = paramNames.length > 0 ? `${leading}${joinedParams}${trailing}` : "";
    const updatedRaw = `${prefix}${newParams}${suffix}`;

    if (updatedRaw === rawText) {
        return false;
    }

    comment.value = updatedRaw.slice(2);
    return true;
}

function updateFunctionDocParameter(comment, rawText, paramName) {
    if (typeof paramName !== "string" || paramName.length === 0) {
        return false;
    }

    const regex = /^(\s*\/\/\/\s*@(?:arg|argument|param)\s*)(\{[^}]*\}\s*)?([^\s]+)(.*)$/i;
    const match = rawText.match(regex);
    if (!match) {
        return false;
    }

    const [, prefix, typeSection = "", , remainder] = match;
    const updatedRaw = `${prefix}${typeSection ?? ""}${paramName}${remainder}`;

    if (updatedRaw === rawText) {
        return false;
    }

    comment.value = updatedRaw.slice(2);
    return true;
}

function registerManualFeatherFix({ ast, diagnostic }) {
    if (!ast || typeof ast !== "object" || !diagnostic?.id) {
        return [];
    }

    const manualFixIds = getManualFeatherFixRegistry(ast);

    if (manualFixIds.has(diagnostic.id)) {
        return [];
    }

    manualFixIds.add(diagnostic.id);

    const fixDetail = createFeatherFixDetail(diagnostic, {
        automatic: false,
        range: null,
        target: null
    });

    return [fixDetail];
}

function getManualFeatherFixRegistry(ast) {
    let registry = ast[MANUAL_FIX_TRACKING_KEY];

    if (registry instanceof Set) {
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

function createFeatherFixDetail(diagnostic, { target = null, range = null, automatic = true } = {}) {
    if (!diagnostic) {
        return null;
    }

    return {
        id: diagnostic.id ?? null,
        title: diagnostic.title ?? null,
        description: diagnostic.description ?? null,
        correction: diagnostic.correction ?? null,
        target,
        range,
        automatic
    };
}

function attachFeatherFixMetadata(target, fixes) {
    if (!target || typeof target !== "object" || !Array.isArray(fixes) || fixes.length === 0) {
        return;
    }

    const key = "_appliedFeatherDiagnostics";

    if (!Array.isArray(target[key])) {
        Object.defineProperty(target, key, {
            configurable: true,
            enumerable: false,
            writable: true,
            value: []
        });
    }

    target[key].push(...fixes);
}

