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

        if (diagnosticId === "GM1045") {
            registerFeatherFixer(
                registry,
                diagnosticId,
                () => ({ ast, sourceText }) => {
                    const fixes = synchronizeJsDocReturnTypes({
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

function synchronizeJsDocReturnTypes({ ast, sourceText, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object" || typeof sourceText !== "string") {
        return [];
    }

    const fixes = [];
    const comments = Array.isArray(ast.comments) ? ast.comments : [];

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

        if (node.type === "FunctionDeclaration" || node.type === "ConstructorDeclaration") {
            const functionFixes = updateFunctionDocReturnType({
                node,
                sourceText,
                diagnostic,
                comments
            });

            if (Array.isArray(functionFixes) && functionFixes.length > 0) {
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

function updateFunctionDocReturnType({ node, sourceText, diagnostic, comments }) {
    if (!node || typeof node !== "object") {
        return [];
    }

    const docComments = collectDocCommentBlockBeforeNode({
        node,
        comments,
        sourceText
    });

    if (docComments.length === 0) {
        return [];
    }

    const inferredType = inferFunctionReturnType(node, sourceText);

    if (!inferredType) {
        return [];
    }

    const fixes = [];

    for (const comment of docComments) {
        if (!comment || comment.type !== "CommentLine") {
            continue;
        }

        const fixApplied = updateReturnTypeInComment({ comment, inferredType });

        if (!fixApplied) {
            continue;
        }

        const fixDetail = createFeatherFixDetail(diagnostic, {
            target: getFunctionNodeName(node),
            range: {
                start: getNodeStartIndex(comment),
                end: getNodeEndIndex(comment)
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

function collectDocCommentBlockBeforeNode({ node, comments, sourceText }) {
    if (!Array.isArray(comments) || comments.length === 0) {
        return [];
    }

    const nodeStart = getNodeStartIndex(node);

    if (nodeStart == null) {
        return [];
    }

    let lastIndex = -1;

    for (let index = 0; index < comments.length; index += 1) {
        const commentEnd = getNodeEndIndex(comments[index]);

        if (commentEnd != null && commentEnd <= nodeStart) {
            lastIndex = index;
        }
    }

    if (lastIndex === -1) {
        return [];
    }

    const block = [];
    let boundary = nodeStart;

    for (let index = lastIndex; index >= 0; index -= 1) {
        const comment = comments[index];

        if (!comment || comment.type !== "CommentLine") {
            break;
        }

        const commentEnd = getNodeEndIndex(comment);
        const commentStart = getNodeStartIndex(comment);

        if (commentEnd == null || commentStart == null || commentEnd > boundary) {
            break;
        }

        const betweenText = sourceText.slice(commentEnd, boundary);

        if (/[^\s]/.test(betweenText)) {
            break;
        }

        block.unshift(comment);
        boundary = commentStart;
    }

    if (block.length === 0) {
        return [];
    }

    return block.filter(isReturnsDocComment);
}

function isReturnsDocComment(comment) {
    if (!comment || typeof comment.value !== "string") {
        return false;
    }

    const commentText = `//${comment.value}`;
    return /\/\/\/\s*@returns\b/i.test(commentText);
}

function updateReturnTypeInComment({ comment, inferredType }) {
    if (!comment || typeof comment.value !== "string" || typeof inferredType !== "string") {
        return false;
    }

    const commentText = `//${comment.value}`;
    const typePattern = /(\/\/\/\s*@returns\s*\{)([^}]+)(\})/i;
    const match = commentText.match(typePattern);

    if (!match) {
        return false;
    }

    const currentType = match[2]?.trim();

    if (shouldSkipDocTypeReplacement(currentType)) {
        return false;
    }

    if (typesAreEquivalent(currentType, inferredType)) {
        return false;
    }

    const updatedCommentText = commentText.replace(typePattern, `$1${inferredType}$3`);

    if (updatedCommentText === commentText) {
        return false;
    }

    comment.value = updatedCommentText.slice(2);
    return true;
}

function shouldSkipDocTypeReplacement(typeText) {
    if (typeof typeText !== "string") {
        return true;
    }

    const trimmed = typeText.trim();

    if (trimmed.length === 0) {
        return true;
    }

    if (/[|&,<>{}]/.test(trimmed)) {
        return true;
    }

    return false;
}

function typesAreEquivalent(docType, inferredType) {
    const normalizedDoc = normalizeTypeForComparison(docType);
    const normalizedInferred = normalizeTypeForComparison(inferredType);

    return normalizedDoc === normalizedInferred;
}

function normalizeTypeForComparison(typeText) {
    if (typeof typeText !== "string") {
        return null;
    }

    return typeText.replace(/\s+/g, "").toLowerCase();
}

function inferFunctionReturnType(node, sourceText) {
    if (!node || typeof node !== "object" || typeof sourceText !== "string") {
        return null;
    }

    const body = node.body;

    if (!body) {
        return null;
    }

    const returnStatements = [];
    collectReturnStatements(body, returnStatements);

    if (returnStatements.length === 0) {
        return null;
    }

    const inferredTypes = new Set();

    for (const statement of returnStatements) {
        const returnType = inferReturnStatementType(statement, sourceText);

        if (!returnType) {
            return null;
        }

        inferredTypes.add(returnType);

        if (inferredTypes.size > 1) {
            return null;
        }
    }

    return inferredTypes.size === 1 ? inferredTypes.values().next().value : null;
}

function collectReturnStatements(node, results) {
    if (!node || !results) {
        return;
    }

    if (Array.isArray(node)) {
        for (const item of node) {
            collectReturnStatements(item, results);
        }
        return;
    }

    if (typeof node !== "object") {
        return;
    }

    if (node.type === "ReturnStatement") {
        results.push(node);
        return;
    }

    if (node.type === "FunctionDeclaration" || node.type === "ConstructorDeclaration") {
        return;
    }

    for (const value of Object.values(node)) {
        if (value && typeof value === "object") {
            collectReturnStatements(value, results);
        }
    }
}

function inferReturnStatementType(statement, sourceText) {
    if (!statement || statement.type !== "ReturnStatement") {
        return null;
    }

    const argument = statement.argument;

    if (!argument) {
        return "undefined";
    }

    return inferExpressionType(argument, sourceText);
}

function inferExpressionType(node, sourceText) {
    if (!node || typeof node !== "object") {
        return null;
    }

    if (node.type === "ParenthesizedExpression") {
        return inferExpressionType(node.expression, sourceText);
    }

    if (node.type === "UnaryExpression" && (node.operator === "+" || node.operator === "-")) {
        return inferExpressionType(node.argument, sourceText);
    }

    if (node.type === "Literal") {
        const literalText = extractSourceText(node, sourceText);

        if (!literalText) {
            return null;
        }

        const trimmed = literalText.trim();

        if (/^".*"$/s.test(trimmed) || /^'.*'$/s.test(trimmed)) {
            return "string";
        }

        if (/^(true|false)$/i.test(trimmed)) {
            return "bool";
        }

        if (isNumericLiteral(trimmed)) {
            return "real";
        }

        if (/^undefined$/i.test(trimmed)) {
            return "undefined";
        }

        return null;
    }

    if (node.type === "ArrayExpression") {
        return "array";
    }

    if (node.type === "StructExpression") {
        return "struct";
    }

    return null;
}

function isNumericLiteral(text) {
    if (typeof text !== "string") {
        return false;
    }

    const trimmed = text.trim();

    if (trimmed.length === 0) {
        return false;
    }

    const decimalPattern = /^[-+]?\d*(?:\.\d+)?(?:e[-+]?\d+)?$/i;
    const hexPattern = /^[-+]?0x[0-9a-f]+$/i;
    const binaryPattern = /^[-+]?0b[01]+$/i;
    const octalPattern = /^[-+]?0o[0-7]+$/i;

    return (
        decimalPattern.test(trimmed) ||
        hexPattern.test(trimmed) ||
        binaryPattern.test(trimmed) ||
        octalPattern.test(trimmed)
    );
}

function extractSourceText(node, sourceText) {
    if (!node || typeof sourceText !== "string") {
        return null;
    }

    const start = getNodeStartIndex(node);
    const end = getNodeEndIndex(node);

    if (start == null || end == null || start >= end) {
        return null;
    }

    return sourceText.slice(start, end);
}

function getFunctionNodeName(node) {
    if (!node || typeof node !== "object") {
        return null;
    }

    if (typeof node.id === "string" && node.id.length > 0) {
        return node.id;
    }

    if (node.id && typeof node.id.name === "string") {
        return node.id.name;
    }

    return null;
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

