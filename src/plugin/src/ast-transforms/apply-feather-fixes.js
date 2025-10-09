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

        if (diagnosticId === "GM1013") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = resolveWithOtherVariableReferences({ ast, diagnostic });

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

function resolveWithOtherVariableReferences({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
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

        if (node.type === "VariableDeclaration" && node.kind === "var") {
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

    visit(ast, null, null, null, null, { insideWithOther: false, withBodies: [] });

    return fixes;
}

function recordVariableDeclaration(registry, context) {
    if (!registry || !context) {
        return;
    }

    const { declaration, parent, property, owner } = context;

    if (!Array.isArray(parent) || typeof property !== "number") {
        return;
    }

    const declarations = Array.isArray(declaration?.declarations)
        ? declaration.declarations
        : [];

    if (declarations.length !== 1) {
        return;
    }

    const declarator = declarations[0];

    if (!declarator || declarator.id?.type !== "Identifier" || !declarator.init) {
        return;
    }

    const name = declarator.id.name;

    if (!name) {
        return;
    }

    const startIndex = getNodeStartIndex(declaration);
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

    if (!Array.isArray(candidates) || candidates.length === 0) {
        return;
    }

    const withBodies = Array.isArray(context?.withBodies) ? context.withBodies : [];
    const identifierStart = getNodeStartIndex(identifier);
    const identifierEnd = getNodeEndIndex(identifier);

    let matchedContext = null;

    for (let index = candidates.length - 1; index >= 0; index -= 1) {
        const candidate = candidates[index];

        if (!candidate || candidate.invalid) {
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

    if (!matchedContext) {
        return;
    }

    if (!matchedContext.replaced) {
        const assignment = promoteVariableDeclaration(matchedContext, diagnostic, fixes);

        if (!assignment) {
            matchedContext.invalid = true;
            return;
        }
    }

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
        target: identifier.name ?? null,
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

    const assignment = {
        type: "AssignmentExpression",
        operator: "=",
        left: cloneIdentifier(declarator.id),
        right: declarator.init,
        start: cloneLocation(declaration.start),
        end: cloneLocation(declaration.end)
    };

    copyCommentMetadata(declaration, assignment);

    context.parent[context.property] = assignment;

    const startIndex = getNodeStartIndex(declaration);
    const endIndex = getNodeEndIndex(declaration);
    const range =
        typeof startIndex === "number" && typeof endIndex === "number"
            ? { start: startIndex, end: endIndex }
            : null;

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

function isWithStatementTargetingOther(node) {
    if (!node || node.type !== "WithStatement") {
        return false;
    }

    const testExpression =
        node.test?.type === "ParenthesizedExpression" ? node.test.expression : node.test;

    return isIdentifierWithName(testExpression, "other");
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

    if (parent.type === "FunctionDeclaration" || parent.type === "FunctionExpression") {
        if (property === "name" || property === "id") {
            return false;
        }
    }

    if (parent.type === "StructLiteralMember" && property === "key") {
        return false;
    }

    return true;
}

function createOtherMemberExpression(identifier) {
    const memberExpression = {
        type: "MemberDotExpression",
        object: createIdentifier("other"),
        property: cloneIdentifier(identifier)
    };

    if (Object.prototype.hasOwnProperty.call(identifier, "start")) {
        memberExpression.start = cloneLocation(identifier.start);
    }

    if (Object.prototype.hasOwnProperty.call(identifier, "end")) {
        memberExpression.end = cloneLocation(identifier.end);
    }

    return memberExpression;
}

function createIdentifier(name, template) {
    if (!name) {
        return null;
    }

    const identifier = {
        type: "Identifier",
        name
    };

    if (template && typeof template === "object") {
        if (Object.prototype.hasOwnProperty.call(template, "start")) {
            identifier.start = cloneLocation(template.start);
        }

        if (Object.prototype.hasOwnProperty.call(template, "end")) {
            identifier.end = cloneLocation(template.end);
        }
    }

    return identifier;
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

