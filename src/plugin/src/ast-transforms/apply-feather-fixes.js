import { getNodeEndIndex, getNodeStartIndex } from "../../../shared/ast-locations.js";
import {
    getFeatherDiagnosticById,
    getFeatherDiagnostics
} from "../../../shared/feather/metadata.js";

const FEATHER_FIX_IMPLEMENTATIONS = buildFeatherFixImplementations();
const FEATHER_DIAGNOSTIC_FIXERS = buildFeatherDiagnosticFixers();
const TRAILING_MACRO_SEMICOLON_PATTERN = new RegExp(
    ";(?=[^\\S\\r\\n]*(?:(?:\\/\\/[^\\r\\n]*|\\/\\*[\\s\\S]*?\\*\/)[^\\S\\r\\n]*)*(?:\\r?\\n|$))"
);
const MANUAL_FIX_TRACKING_KEY = Symbol("manualFeatherFixes");
const GM1022_LONE_IDENTIFIER_PATTERN =
    /^[^\S\r\n]*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)[^\S\r\n]*;?[^\S\r\n]*(?:(\/\/[^\r\n]*))?[^\S\r\n]*$/gm;
const GM1022_RESERVED_IDENTIFIERS = new Set(["break", "continue", "exit", "return"]);
const GM1022_COMPOUND_ASSIGNMENT_OPERATORS = [
    "+=",
    "-=",
    "*=",
    "/=",
    "%=",
    "^=",
    "|=",
    "&=",
    "<<=",
    ">>=",
    "??="
];

export function getFeatherDiagnosticFixers() {
    return new Map(FEATHER_DIAGNOSTIC_FIXERS);
}

export function applyFeatherFixes(
    ast,
    { sourceText, preAppliedFixes = [], skipManualFixIds } = {}
) {
    if (!ast || typeof ast !== "object") {
        return ast;
    }

    const appliedFixes = [];
    if (Array.isArray(preAppliedFixes) && preAppliedFixes.length > 0) {
        appliedFixes.push(...preAppliedFixes);
    }

    const manualSkipSet = createFeatherFixSkipSet(skipManualFixIds);

    for (const entry of FEATHER_DIAGNOSTIC_FIXERS.values()) {
        const fixes = entry.applyFix(ast, {
            sourceText,
            skipManualFixIds: manualSkipSet
        });

        if (Array.isArray(fixes) && fixes.length > 0) {
            appliedFixes.push(...fixes);
        }
    }

    if (appliedFixes.length > 0) {
        attachFeatherFixMetadata(ast, appliedFixes);
    }

    return ast;
}

export function preprocessSourceTextForFeatherFixes(sourceText) {
    if (typeof sourceText !== "string" || sourceText.length === 0) {
        return {
            text: sourceText,
            appliedFixes: [],
            skipManualFixIds: new Set()
        };
    }

    let sanitizedText = sourceText;
    const appliedFixes = [];
    const skipManualFixIds = new Set();

    const gm1022Result = preprocessGM1022LoneIdentifiers(sourceText);

    if (gm1022Result) {
        sanitizedText = gm1022Result.text;

        if (Array.isArray(gm1022Result.fixes) && gm1022Result.fixes.length > 0) {
            appliedFixes.push(...gm1022Result.fixes);
            skipManualFixIds.add("GM1022");
        }
    }

    return {
        text: sanitizedText,
        appliedFixes,
        skipManualFixIds
    };
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
                    sourceText: context?.sourceText,
                    context
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

        if (diagnosticId === "GM1022") {
            registerFeatherFixer(
                registry,
                diagnosticId,
                () => ({ ast, context }) => {
                    const fixes = removeDanglingIdentifierStatements({ ast, diagnostic });

                    if (Array.isArray(fixes) && fixes.length > 0) {
                        return fixes;
                    }

                    return registerManualFeatherFix({ ast, diagnostic, context });
                }
            );
            continue;
        }

        if (diagnosticId === "GM1051") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast, sourceText, context }) => {
                const fixes = removeTrailingMacroSemicolons({
                    ast,
                    sourceText,
                    diagnostic
                });

                if (Array.isArray(fixes) && fixes.length > 0) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic, context });
            });
            continue;
        }

        if (diagnosticId === "GM2020") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast, context }) => {
                const fixes = convertAllDotAssignmentsToWithStatements({ ast, diagnostic });

                if (Array.isArray(fixes) && fixes.length > 0) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic, context });
            });
            continue;
        }

        if (diagnosticId === "GM2054") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast, context }) => {
                const fixes = ensureAlphaTestRefIsReset({ ast, diagnostic });

                if (Array.isArray(fixes) && fixes.length > 0) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic, context });
            });
            continue;
        }

        registerFeatherFixer(registry, diagnosticId, () => ({ ast, context }) =>
            registerManualFeatherFix({ ast, diagnostic, context })
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

function preprocessGM1022LoneIdentifiers(sourceText) {
    if (typeof sourceText !== "string" || sourceText.length === 0) {
        return null;
    }

    const diagnostic = getFeatherDiagnosticById("GM1022");

    if (!diagnostic) {
        return null;
    }

    const fixes = [];
    const sanitizedSegments = [];
    let searchIndex = 0;

    GM1022_LONE_IDENTIFIER_PATTERN.lastIndex = 0;

    let match;
    while ((match = GM1022_LONE_IDENTIFIER_PATTERN.exec(sourceText)) !== null) {
        const fullMatch = match[0];
        const identifier = match[1];

        if (!identifier) {
            continue;
        }

        if (GM1022_RESERVED_IDENTIFIERS.has(identifier)) {
            continue;
        }

        const matchStart = match.index;
        const matchEnd = matchStart + fullMatch.length;

        if (shouldSkipGM1022Candidate(sourceText, matchStart, matchEnd)) {
            continue;
        }

        sanitizedSegments.push(sourceText.slice(searchIndex, matchStart));
        searchIndex = matchEnd;

        const leadingWhitespace = fullMatch.match(/^[^\S\r\n]*/);
        const leadingLength = Array.isArray(leadingWhitespace)
            ? leadingWhitespace[0]?.length ?? 0
            : 0;
        const rangeStart = matchStart + leadingLength;
        const rangeEnd = rangeStart + identifier.length;

        const fixDetail = createFeatherFixDetail(diagnostic, {
            target: identifier,
            range: { start: rangeStart, end: rangeEnd }
        });

        if (fixDetail) {
            fixes.push(fixDetail);
        }
    }

    if (fixes.length === 0) {
        return null;
    }

    sanitizedSegments.push(sourceText.slice(searchIndex));

    return {
        text: sanitizedSegments.join(""),
        fixes
    };
}

function shouldSkipGM1022Candidate(sourceText, matchStart, matchEnd) {
    const length = typeof sourceText === "string" ? sourceText.length : 0;

    if (length === 0) {
        return false;
    }

    let index = matchEnd;

    while (index < length) {
        const char = sourceText[index];

        if (char === " " || char === "\t" || char === "\f" || char === "\v") {
            index += 1;
            continue;
        }

        if (char === "\r") {
            if (sourceText[index + 1] === "\n") {
                index += 2;
            } else {
                index += 1;
            }
            continue;
        }

        if (char === "\n") {
            index += 1;
            continue;
        }

        if (char === "/" && sourceText[index + 1] === "/") {
            index += 2;
            while (index < length) {
                const commentChar = sourceText[index];
                if (commentChar === "\n" || commentChar === "\r") {
                    break;
                }
                index += 1;
            }
            continue;
        }

        if (char === "/" && sourceText[index + 1] === "*") {
            index += 2;
            while (index < length) {
                if (sourceText[index] === "*" && sourceText[index + 1] === "/") {
                    index += 2;
                    break;
                }
                index += 1;
            }
            continue;
        }

        break;
    }

    if (index >= length) {
        return false;
    }

    if (sourceText[index] === "=") {
        return true;
    }

    for (const operator of GM1022_COMPOUND_ASSIGNMENT_OPERATORS) {
        if (sourceText.startsWith(operator, index)) {
            return true;
        }
    }

    return false;
}

function removeDanglingIdentifierStatements({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];

    const visitNode = (node, containerInfo) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            visitArray(node, containerInfo);
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        for (const [key, value] of Object.entries(node)) {
            if (Array.isArray(value)) {
                visitArray(value, { container: node, property: key });
                continue;
            }

            if (value && typeof value === "object") {
                visitNode(value, { container: node, property: key });
            }
        }
    };

    const visitArray = (array, containerInfo) => {
        if (!Array.isArray(array)) {
            return;
        }

        const representsStatements = isStatementArrayContainer(containerInfo);

        for (let index = 0; index < array.length; ) {
            const element = array[index];

            if (representsStatements && isDanglingIdentifierNode(element)) {
                const identifierName = getIdentifierNameForGM1022(element);
                const range = getNodeRange(element);
                const fixDetail = createFeatherFixDetail(diagnostic, {
                    target: identifierName,
                    range
                });

                if (fixDetail) {
                    fixes.push(fixDetail);
                }

                array.splice(index, 1);
                continue;
            }

            visitNode(element, containerInfo);
            index += 1;
        }
    };

    visitNode(ast, null);

    return fixes;
}

function isStatementArrayContainer(info) {
    if (!info || typeof info !== "object") {
        return false;
    }

    const property = info.property;
    const container = info.container;

    if (typeof property !== "string" || !container || typeof container !== "object") {
        return false;
    }

    if (property === "body") {
        return true;
    }

    if (container?.type === "SwitchCase" && property === "consequent") {
        return true;
    }

    return false;
}

function isDanglingIdentifierNode(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    if (node.type === "Identifier") {
        return true;
    }

    if (node.type === "MemberDotExpression") {
        return isDanglingIdentifierNode(node.object) && isDanglingIdentifierNode(node.property);
    }

    return false;
}

function getIdentifierNameForGM1022(node) {
    if (!node || typeof node !== "object") {
        return null;
    }

    if (node.type === "Identifier") {
        return typeof node.name === "string" ? node.name : null;
    }

    if (node.type === "MemberDotExpression") {
        const objectName = getIdentifierNameForGM1022(node.object);
        const propertyName = getIdentifierNameForGM1022(node.property);

        if (objectName && propertyName) {
            return `${objectName}.${propertyName}`;
        }

        return null;
    }

    return null;
}

function getNodeRange(node) {
    const startIndex = getNodeStartIndex(node);
    const endIndex = getNodeEndIndex(node);

    if (typeof startIndex === "number" && typeof endIndex === "number") {
        return { start: startIndex, end: endIndex };
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

function createFeatherFixSkipSet(value) {
    if (value instanceof Set) {
        return new Set(value);
    }

    if (Array.isArray(value)) {
        return new Set(value);
    }

    if (value && typeof value === "string") {
        return new Set([value]);
    }

    return new Set();
}

function registerManualFeatherFix({ ast, diagnostic, context }) {
    if (!ast || typeof ast !== "object" || !diagnostic?.id) {
        return [];
    }

    const skipSet = context?.skipManualFixIds;

    if (skipSet instanceof Set && skipSet.has(diagnostic.id)) {
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

    return fixDetail ? [fixDetail] : [];
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

