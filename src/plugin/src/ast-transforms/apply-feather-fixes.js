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

        if (diagnosticId === "GM1011") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = ensureImplicitBoolComparisonsAreExplicit({
                    ast,
                    diagnostic
                });

                if (Array.isArray(fixes) && fixes.length > 0) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
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

function ensureImplicitBoolComparisonsAreExplicit({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property, ancestors) => {
        if (!node) {
            return;
        }

        const ancestorStack = parent
            ? [...(ancestors ?? []), { node: parent, property }]
            : ancestors ?? [];

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index, ancestorStack);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        const fix = ensureConditionalExpressionIsExplicit({
            node,
            diagnostic,
            context: { parent, property, ancestors: ancestorStack }
        });

        if (fix) {
            fixes.push(fix);
        }

        const entries = Object.entries(node);

        for (const [key, value] of entries) {
            if (value && typeof value === "object") {
                visit(value, node, key, ancestorStack);
            }
        }
    };

    visit(ast, null, null, []);

    return fixes;
}

function ensureConditionalExpressionIsExplicit({ node, diagnostic, context }) {
    if (!isConditionalStatement(node)) {
        return null;
    }

    const test = node.test;

    if (!test) {
        return null;
    }

    const { expression: rawExpression, container: parenthesized } =
        unwrapParenthesizedExpression(test);

    if (!rawExpression || rawExpression.type !== "Identifier") {
        return null;
    }

    const identifierName = rawExpression.name;

    if (!identifierName) {
        return null;
    }

    const inferredType = inferIdentifierType(identifierName, context);

    if (!shouldAutoFixImplicitBoolType(inferredType)) {
        return null;
    }

    const rangeTarget = parenthesized ?? rawExpression;
    const rangeStart = getNodeStartIndex(rangeTarget);
    const rangeEnd = getNodeEndIndex(rangeTarget);

    const literalUndefined = createLiteral("undefined");

    const replacementExpression = {
        type: "BinaryExpression",
        operator: "!=",
        left: rawExpression,
        right: literalUndefined
    };

    if (Object.prototype.hasOwnProperty.call(rawExpression, "start")) {
        replacementExpression.start = cloneLocation(rawExpression.start);
    } else if (Object.prototype.hasOwnProperty.call(rangeTarget, "start")) {
        replacementExpression.start = cloneLocation(rangeTarget.start);
    }

    if (Object.prototype.hasOwnProperty.call(rawExpression, "end")) {
        replacementExpression.end = cloneLocation(rawExpression.end);
    } else if (Object.prototype.hasOwnProperty.call(rangeTarget, "end")) {
        replacementExpression.end = cloneLocation(rangeTarget.end);
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: identifierName ?? null,
        range:
            typeof rangeStart === "number" && typeof rangeEnd === "number"
                ? { start: rangeStart, end: rangeEnd }
                : null
    });

    if (!fixDetail) {
        return null;
    }

    if (!parenthesized) {
        node.test = replacementExpression;
    } else {
        parenthesized.expression = replacementExpression;
    }

    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

function isConditionalStatement(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    switch (node.type) {
        case "IfStatement":
        case "WhileStatement":
        case "DoWhileStatement":
        case "ForStatement":
            return true;
        default:
            return false;
    }
}

function unwrapParenthesizedExpression(node) {
    if (!node || typeof node !== "object") {
        return { expression: null, container: null };
    }

    let current = node;
    let container = null;

    while (current && current.type === "ParenthesizedExpression") {
        container = current;
        current = current.expression;
    }

    return { expression: current ?? null, container };
}

const IMPLICIT_BOOL_UNDEFINED_TYPES = new Set(["Array", "Struct", "Function", "String"]);

function shouldAutoFixImplicitBoolType(type) {
    if (!type) {
        return false;
    }

    return IMPLICIT_BOOL_UNDEFINED_TYPES.has(type);
}

function inferIdentifierType(identifierName, context) {
    if (!identifierName) {
        return null;
    }

    const ancestors = Array.isArray(context?.ancestors) ? context.ancestors : [];

    for (let index = ancestors.length - 1; index >= 0; index -= 1) {
        const entry = ancestors[index];
        const container = entry?.node;
        const property = entry?.property;

        if (Array.isArray(container) && typeof property === "number") {
            const inferred = inferTypeFromSiblingStatements(container, property, identifierName);

            if (inferred) {
                return inferred;
            }
        }

        if (container && typeof container === "object") {
            const inferred = inferTypeFromParentNode(container, identifierName);

            if (inferred) {
                return inferred;
            }
        }
    }

    return null;
}

function inferTypeFromSiblingStatements(siblings, uptoIndex, identifierName) {
    if (!Array.isArray(siblings) || typeof uptoIndex !== "number") {
        return null;
    }

    for (let index = uptoIndex - 1; index >= 0; index -= 1) {
        const statement = siblings[index];
        const inferred = inferTypeFromStatement(statement, identifierName);

        if (inferred) {
            return inferred;
        }
    }

    return null;
}

function inferTypeFromParentNode(node, identifierName) {
    if (!node || typeof node !== "object") {
        return null;
    }

    if (node.type === "ForStatement") {
        const inferred = inferTypeFromStatement(node.init, identifierName);

        if (inferred) {
            return inferred;
        }
    }

    return null;
}

function inferTypeFromStatement(statement, identifierName) {
    if (!statement || typeof statement !== "object") {
        return null;
    }

    if (statement.type === "VariableDeclaration") {
        return inferTypeFromVariableDeclaration(statement, identifierName);
    }

    if (statement.type === "AssignmentExpression") {
        return inferTypeFromAssignment(statement, identifierName);
    }

    if (statement.type === "ExpressionStatement") {
        return inferTypeFromStatement(statement.expression, identifierName);
    }

    return null;
}

function isLocalVariableDeclaration(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    const kind = node.kind;

    return kind === "var" || kind === "static";
}

function inferTypeFromVariableDeclaration(declaration, identifierName) {
    if (!isLocalVariableDeclaration(declaration)) {
        return null;
    }

    const declarators = Array.isArray(declaration.declarations) ? declaration.declarations : [];

    for (const declarator of declarators) {
        if (!declarator || typeof declarator !== "object") {
            continue;
        }

        const id = declarator.id;

        if (!id || id.type !== "Identifier" || id.name !== identifierName) {
            continue;
        }

        return inferExpressionType(declarator.init);
    }

    return null;
}

function inferTypeFromAssignment(statement, identifierName) {
    if (statement.operator !== "=") {
        return null;
    }

    const left = statement.left;

    if (!left || left.type !== "Identifier" || left.name !== identifierName) {
        return null;
    }

    return inferExpressionType(statement.right);
}

function inferExpressionType(expression) {
    if (!expression || typeof expression !== "object") {
        return null;
    }

    if (expression.type === "ParenthesizedExpression") {
        return inferExpressionType(expression.expression);
    }

    switch (expression.type) {
        case "ArrayExpression":
            return "Array";
        case "StructExpression":
            return "Struct";
        case "FunctionDeclaration":
            return "Function";
        case "Literal":
            return inferLiteralType(expression);
        default:
            return null;
    }
}

function inferLiteralType(literal) {
    const value = literal?.value;

    if (typeof value === "number") {
        return "Real";
    }

    if (typeof value !== "string") {
        return null;
    }

    const normalized = value.trim();

    if (normalized === "true" || normalized === "false") {
        return "Bool";
    }

    if (normalized === "undefined") {
        return "Undefined";
    }

    if (isQuotedString(normalized)) {
        return "String";
    }

    if (!Number.isNaN(Number(normalized))) {
        return "Real";
    }

    return null;
}

function isQuotedString(value) {
    if (typeof value !== "string" || value.length === 0) {
        return false;
    }

    if (value.startsWith("@\"")) {
        return true;
    }

    const firstChar = value[0];
    const lastChar = value[value.length - 1];

    if (firstChar === '"' && lastChar === '"') {
        return true;
    }

    if (firstChar === "'" && lastChar === "'") {
        return true;
    }

    return false;
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

