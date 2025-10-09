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
const IDENTIFIER_TOKEN_PATTERN = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;
const RESERVED_IDENTIFIER_NAMES = new Set([
    "and",
    "break",
    "case",
    "continue",
    "constructor",
    "create",
    "default",
    "delete",
    "do",
    "else",
    "enum",
    "event",
    "for",
    "function",
    "globalvar",
    "if",
    "macro",
    "not",
    "or",
    "repeat",
    "return",
    "step",
    "switch",
    "until",
    "var",
    "while",
    "with"
]);
const DEPRECATED_BUILTIN_VARIABLE_REPLACEMENTS = buildDeprecatedBuiltinVariableReplacements();

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

        if (diagnosticId === "GM1024") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = replaceDeprecatedBuiltinVariables({ ast, diagnostic });

                if (Array.isArray(fixes) && fixes.length > 0) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
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

function replaceDeprecatedBuiltinVariables({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    if (DEPRECATED_BUILTIN_VARIABLE_REPLACEMENTS.size === 0) {
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

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key, node, key);
            }
        }
    };

    visit(ast, null, null, null, null);

    return fixes;
}

function replaceDeprecatedIdentifier(node, parent, property, owner, ownerKey, diagnostic) {
    if (!node || node.type !== "Identifier") {
        return null;
    }

    const normalizedName = typeof node.name === "string" ? node.name.toLowerCase() : null;

    if (!normalizedName || normalizedName.length === 0) {
        return null;
    }

    const replacementEntry = getDeprecatedBuiltinReplacementEntry(normalizedName);

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

    if (Array.isArray(parent)) {
        if (ownerKey === "params") {
            const ownerType = owner?.type;

            if (
                ownerType === "FunctionDeclaration" ||
                ownerType === "FunctionExpression" ||
                ownerType === "ConstructorDeclaration"
            ) {
                return true;
            }
        }
    }

    return false;
}

function buildDeprecatedBuiltinVariableReplacements() {
    const replacements = new Map();
    const diagnostic = getFeatherDiagnosticById("GM1024");

    if (!diagnostic) {
        return replacements;
    }

    const entries = deriveDeprecatedBuiltinVariableReplacementsFromExamples(
        diagnostic.badExample,
        diagnostic.goodExample
    );

    for (const entry of entries) {
        if (!replacements.has(entry.normalized)) {
            replacements.set(entry.normalized, entry);
        }
    }

    return replacements;
}

function deriveDeprecatedBuiltinVariableReplacementsFromExamples(badExample, goodExample) {
    const entries = [];
    const badTokens = extractIdentifierTokens(badExample);
    const goodTokens = extractIdentifierTokens(goodExample);

    if (badTokens.length === 0 || goodTokens.length === 0) {
        return entries;
    }

    const goodTokenSet = new Set(goodTokens.map((token) => token.normalized));
    const deprecatedTokens = badTokens.filter((token) => !goodTokenSet.has(token.normalized));

    if (deprecatedTokens.length === 0) {
        return entries;
    }

    const badTokenSet = new Set(badTokens.map((token) => token.normalized));
    const replacementTokens = goodTokens.filter((token) => !badTokenSet.has(token.normalized));

    const pairCount = Math.min(deprecatedTokens.length, replacementTokens.length);

    for (let index = 0; index < pairCount; index += 1) {
        const deprecatedToken = deprecatedTokens[index];
        const replacementToken = replacementTokens[index];

        if (!deprecatedToken || !replacementToken) {
            continue;
        }

        entries.push({
            normalized: deprecatedToken.normalized,
            deprecated: deprecatedToken.token,
            replacement: replacementToken.token
        });
    }

    return entries;
}

function extractIdentifierTokens(text) {
    if (typeof text !== "string" || text.length === 0) {
        return [];
    }

    const matches = text.match(IDENTIFIER_TOKEN_PATTERN) ?? [];
    const tokens = [];
    const seen = new Set();

    for (const match of matches) {
        const normalized = match.toLowerCase();

        if (RESERVED_IDENTIFIER_NAMES.has(normalized)) {
            continue;
        }

        if (seen.has(normalized)) {
            continue;
        }

        seen.add(normalized);
        tokens.push({ token: match, normalized });
    }

    return tokens;
}

function getDeprecatedBuiltinReplacementEntry(name) {
    if (!name) {
        return null;
    }

    return DEPRECATED_BUILTIN_VARIABLE_REPLACEMENTS.get(name) ?? null;
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

