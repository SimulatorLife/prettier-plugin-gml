import {
  getNodeEndIndex,
  getNodeStartIndex,
  cloneLocation,
} from "../../../shared/ast-locations.js";
import {
  getFeatherDiagnostics,
  getFeatherMetadata,
} from "../feather/metadata.js";

const FEATHER_DIAGNOSTICS = getFeatherDiagnostics();
const FEATHER_FIX_IMPLEMENTATIONS =
  buildFeatherFixImplementations(FEATHER_DIAGNOSTICS);
const FEATHER_DIAGNOSTIC_FIXERS = buildFeatherDiagnosticFixers(
  FEATHER_DIAGNOSTICS,
  FEATHER_FIX_IMPLEMENTATIONS,
);
const TRAILING_MACRO_SEMICOLON_PATTERN = new RegExp(
  ";(?=[^\\S\\r\\n]*(?:(?:\\/\\/[^\\r\\n]*|\\/\\*[\\s\\S]*?\\*\/)[^\\S\\r\\n]*)*(?:\\r?\\n|$))",
);
const ALLOWED_DELETE_MEMBER_TYPES = new Set([
  "MemberDotExpression",
  "MemberIndexExpression",
]);
const MANUAL_FIX_TRACKING_KEY = Symbol("manualFeatherFixes");
const GM1041_CALL_ARGUMENT_TARGETS = new Map([
  ["instance_create_depth", [3]],
  ["instance_create_layer", [3]],
  ["instance_create_layer_depth", [4]],
  ["layer_instance_create", [3]],
]);
const FUNCTION_LIKE_TYPES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "LambdaExpression",
  "ConstructorDeclaration",
  "MethodDeclaration",
  "StructFunctionDeclaration",
  "StructDeclaration",
]);
const IDENTIFIER_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FEATHER_TYPE_SYSTEM_INFO = buildFeatherTypeSystemInfo();

export function preprocessSourceForFeatherFixes(sourceText) {
  if (typeof sourceText !== "string" || sourceText.length === 0) {
    return {
      sourceText,
      metadata: null,
    };
  }

  const gm1100Metadata = [];
  const gm1016Metadata = [];
  const sanitizedParts = [];
  const newlinePattern = /\r?\n/g;
  let lastIndex = 0;
  let lineNumber = 1;
  let pendingGM1100Context = null;

  const processLine = (line) => {
    const indentationMatch = line.match(/^\s*/);
    const indentation = indentationMatch ? indentationMatch[0] : "";
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      return { line, context: pendingGM1100Context };
    }

    const booleanLiteralMatch = line.match(/^(\s*)(true|false)\s*;?\s*$/);

    if (booleanLiteralMatch) {
      const leadingWhitespace = booleanLiteralMatch[1] ?? "";
      const sanitizedRemainder = " ".repeat(
        Math.max(0, line.length - leadingWhitespace.length),
      );
      const sanitizedLine = `${leadingWhitespace}${sanitizedRemainder}`;
      const trimmedRightLength = line.replace(/\s+$/, "").length;
      const startColumn = leadingWhitespace.length;
      const endColumn = Math.max(startColumn, trimmedRightLength - 1);
      const lineStartIndex = lastIndex;

      gm1016Metadata.push({
        start: {
          line: lineNumber,
          column: startColumn,
          index: lineStartIndex + startColumn,
        },
        end: {
          line: lineNumber,
          column: endColumn,
          index: lineStartIndex + endColumn,
        },
      });

      return { line: sanitizedLine, context: null };
    }

    const varMatch = line.match(/^\s*var\s+([A-Za-z_][A-Za-z0-9_]*)\b/);

    if (varMatch) {
      const identifier = varMatch[1];
      const remainder = line.slice(varMatch[0].length);
      const trimmedRemainder = remainder.replace(/^\s*/, "");

      if (trimmedRemainder.startsWith("*")) {
        const leadingWhitespaceLength =
          remainder.length - trimmedRemainder.length;
        const leadingWhitespace =
          leadingWhitespaceLength > 0
            ? remainder.slice(0, leadingWhitespaceLength)
            : "";
        const sanitizedLine = [
          line.slice(0, varMatch[0].length),
          leadingWhitespace,
          "=",
          trimmedRemainder.slice(1),
        ].join("");

        gm1100Metadata.push({
          type: "declaration",
          line: lineNumber,
          identifier,
        });

        return {
          line: sanitizedLine,
          context: {
            identifier,
            indentation,
          },
        };
      }
    }

    if (trimmed.startsWith("=") && pendingGM1100Context?.identifier) {
      const rawRemainder = line.slice(indentation.length);
      const identifier = pendingGM1100Context.identifier;

      gm1100Metadata.push({
        type: "assignment",
        line: lineNumber,
        identifier,
      });

      const sanitizedLine = `${indentation}${" ".repeat(
        Math.max(0, rawRemainder.length),
      )}`;

      return { line: sanitizedLine, context: null };
    }

    if (trimmed.startsWith("/") || trimmed.startsWith("*")) {
      return { line, context: pendingGM1100Context };
    }

    return { line, context: null };
  };

  let match;

  while ((match = newlinePattern.exec(sourceText)) !== null) {
    const lineEnd = match.index;
    const line = sourceText.slice(lastIndex, lineEnd);
    const newline = match[0];
    const { line: sanitizedLine, context } = processLine(line);

    sanitizedParts.push(sanitizedLine, newline);
    pendingGM1100Context = context;
    lastIndex = match.index + newline.length;
    lineNumber += 1;
  }

  const finalLine = sourceText.slice(lastIndex);
  if (
    finalLine.length > 0 ||
    sourceText.endsWith("\n") ||
    sourceText.endsWith("\r")
  ) {
    const { line: sanitizedLine, context } = processLine(finalLine);
    sanitizedParts.push(sanitizedLine);
    pendingGM1100Context = context;
  }

  const sanitizedSourceText = sanitizedParts.join("");
  const metadata = {};

  if (gm1100Metadata.length > 0) {
    metadata.GM1100 = gm1100Metadata;
  }

  if (gm1016Metadata.length > 0) {
    metadata.GM1016 = gm1016Metadata;
  }

  if (Object.keys(metadata).length === 0) {
    return {
      sourceText,
      metadata: null,
    };
  }

  return {
    sourceText: sanitizedSourceText,
    metadata,
  };
}

export function getFeatherDiagnosticFixers() {
  return new Map(FEATHER_DIAGNOSTIC_FIXERS);
}

export function applyFeatherFixes(
  ast,
  { sourceText, preprocessedFixMetadata, options } = {},
) {
  if (!ast || typeof ast !== "object") {
    return ast;
  }

  const appliedFixes = [];

  for (const entry of FEATHER_DIAGNOSTIC_FIXERS.values()) {
    const fixes = entry.applyFix(ast, {
      sourceText,
      preprocessedFixMetadata,
      options,
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

function buildFeatherDiagnosticFixers(diagnostics, implementationRegistry) {
  const registry = new Map();

  for (const diagnostic of Array.isArray(diagnostics) ? diagnostics : []) {
    const diagnosticId = diagnostic?.id;

    if (!diagnosticId || registry.has(diagnosticId)) {
      continue;
    }

    const applyFix = createFixerForDiagnostic(
      diagnostic,
      implementationRegistry,
    );

    if (typeof applyFix !== "function") {
      continue;
    }

    registry.set(diagnosticId, {
      diagnostic,
      applyFix,
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
    });

    return Array.isArray(fixes) ? fixes : [];
  };
}

function createNoOpFixer() {
  return () => [];
}

function buildFeatherFixImplementations(diagnostics) {
  const registry = new Map();

  for (const diagnostic of Array.isArray(diagnostics) ? diagnostics : []) {
    const diagnosticId = diagnostic?.id;

    if (!diagnosticId) {
      continue;
    }

    if (diagnosticId === "GM1034") {
      registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
        const fixes = relocateArgumentReferencesInsideFunctions({
          ast,
          diagnostic,
        });

        if (Array.isArray(fixes) && fixes.length > 0) {
          return fixes;
        }

        return registerManualFeatherFix({ ast, diagnostic });
      });
      continue;
    }

    if (diagnosticId === "GM1036") {
      registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
        const fixes = normalizeMultidimensionalArrayIndexing({
          ast,
          diagnostic,
        });

        if (Array.isArray(fixes) && fixes.length > 0) {
          return fixes;
        }

        return registerManualFeatherFix({ ast, diagnostic });
      });
      continue;
    }

    if (diagnosticId === "GM1038") {
      registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
        const fixes = removeDuplicateMacroDeclarations({ ast, diagnostic });

        if (Array.isArray(fixes) && fixes.length > 0) {
          return fixes;
        }

        return registerManualFeatherFix({ ast, diagnostic });
      });
      continue;
    }

    if (diagnosticId === "GM1051") {
      registerFeatherFixer(
        registry,
        diagnosticId,
        () =>
          ({ ast, sourceText }) => {
            const fixes = removeTrailingMacroSemicolons({
              ast,
              sourceText,
              diagnostic,
            });

            if (Array.isArray(fixes) && fixes.length > 0) {
              return fixes;
            }

            return registerManualFeatherFix({ ast, diagnostic });
          },
      );
      continue;
    }

    if (diagnosticId === "GM1016") {
      registerFeatherFixer(
        registry,
        diagnosticId,
        () =>
          ({ ast, preprocessedFixMetadata }) => {
            const fixes = removeBooleanLiteralStatements({
              ast,
              diagnostic,
              metadata: preprocessedFixMetadata,
            });

            if (Array.isArray(fixes) && fixes.length > 0) {
              return fixes;
            }

            return registerManualFeatherFix({ ast, diagnostic });
          },
      );
      continue;
    }

    if (diagnosticId === "GM1041") {
      registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
        const fixes = convertAssetArgumentStringsToIdentifiers({
          ast,
          diagnostic,
        });

        if (Array.isArray(fixes) && fixes.length > 0) {
          return fixes;
        }

        return registerManualFeatherFix({ ast, diagnostic });
      });
      continue;
    }

    if (diagnosticId === "GM1051") {
      registerFeatherFixer(
        registry,
        diagnosticId,
        () =>
          ({ ast, sourceText }) => {
            const fixes = removeTrailingMacroSemicolons({
              ast,
              sourceText,
              diagnostic,
            });

            if (Array.isArray(fixes) && fixes.length > 0) {
              return fixes;
            }

            return registerManualFeatherFix({ ast, diagnostic });
          },
      );
      continue;
    }

    if (diagnosticId === "GM1100") {
      registerFeatherFixer(
        registry,
        diagnosticId,
        () =>
          ({ ast, preprocessedFixMetadata }) => {
            const fixes = normalizeObviousSyntaxErrors({
              ast,
              diagnostic,
              metadata: preprocessedFixMetadata,
            });

            if (Array.isArray(fixes) && fixes.length > 0) {
              return fixes;
            }

            return registerManualFeatherFix({ ast, diagnostic });
          },
      );
      continue;
    }

    if (diagnosticId === "GM1058") {
      registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
        const fixes = ensureConstructorDeclarationsForNewExpressions({
          ast,
          diagnostic,
        });

        if (Array.isArray(fixes) && fixes.length > 0) {
          return fixes;
        }

        return registerManualFeatherFix({ ast, diagnostic });
      });
      continue;
    }
    if (diagnosticId === "GM1054") {
      registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
        const fixes = ensureConstructorParentsExist({ ast, diagnostic });

        if (Array.isArray(fixes) && fixes.length > 0) {
          return fixes;
        }

        return registerManualFeatherFix({ ast, diagnostic });
      });
      continue;
    }

    if (diagnosticId === "GM1059") {
      registerFeatherFixer(registry, diagnosticId, () => ({ ast, options }) => {
        const fixes = renameDuplicateFunctionParameters({
          ast,
          diagnostic,
          options,
        });

        if (Array.isArray(fixes) && fixes.length > 0) {
          return fixes;
        }

        return registerManualFeatherFix({ ast, diagnostic });
      });
      continue;
    }

    if (diagnosticId === "GM1062") {
      registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
        const fixes = sanitizeMalformedJsDocTypes({
          ast,
          diagnostic,
          typeSystemInfo: FEATHER_TYPE_SYSTEM_INFO,
        });

        if (Array.isArray(fixes) && fixes.length > 0) {
          return fixes;
        }

        return registerManualFeatherFix({ ast, diagnostic });
      });
      continue;
    }

    if (diagnosticId === "GM1056") {
      registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
        const fixes = reorderOptionalParameters({ ast, diagnostic });

        if (Array.isArray(fixes) && fixes.length > 0) {
          return fixes;
        }

        return registerManualFeatherFix({ ast, diagnostic });
      });
      continue;
    }

    if (diagnosticId === "GM1052") {
      registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
        const fixes = replaceInvalidDeleteStatements({ ast, diagnostic });

        if (Array.isArray(fixes) && fixes.length > 0) {
          return fixes;
        }

        return registerManualFeatherFix({ ast, diagnostic });
      });
      continue;
    }

    if (diagnosticId === "GM2020") {
      registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
        const fixes = convertAllDotAssignmentsToWithStatements({
          ast,
          diagnostic,
        });

        if (Array.isArray(fixes) && fixes.length > 0) {
          return fixes;
        }

        return registerManualFeatherFix({ ast, diagnostic });
      });
      continue;
    }

    if (diagnosticId === "GM2032") {
      registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
        const fixes = ensureFileFindFirstBeforeClose({ ast, diagnostic });

        if (Array.isArray(fixes) && fixes.length > 0) {
          return fixes;
        }

        return registerManualFeatherFix({ ast, diagnostic });
      });
      continue;
    }

    if (diagnosticId === "GM2031") {
      registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
        const fixes = ensureFileFindSearchesAreSerialized({ ast, diagnostic });

        if (Array.isArray(fixes) && fixes.length > 0) {
          return fixes;
        }

        return registerManualFeatherFix({ ast, diagnostic });
      });
      continue;
    }

    if (diagnosticId === "GM2023") {
      registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
        const fixes = normalizeFunctionCallArgumentOrder({ ast, diagnostic });

        if (Array.isArray(fixes) && fixes.length > 0) {
          return fixes;
        }

        return registerManualFeatherFix({ ast, diagnostic });
      });
      continue;
    }

    if (diagnosticId === "GM1063") {
      registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
        const fixes = harmonizeTexturePointerTernaries({ ast, diagnostic });

        if (Array.isArray(fixes) && fixes.length > 0) {
          return fixes;
        }

        return registerManualFeatherFix({ ast, diagnostic });
      });
      continue;
    }

    if (diagnosticId === "GM2044") {
      registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
        const fixes = deduplicateLocalVariableDeclarations({ ast, diagnostic });

        if (Array.isArray(fixes) && fixes.length > 0) {
          return fixes;
        }

        return registerManualFeatherFix({ ast, diagnostic });
      });
      continue;
    }

    if (diagnosticId === "GM2048") {
      registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
        const fixes = ensureBlendEnableIsReset({ ast, diagnostic });

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

    if (diagnosticId === "GM2056") {
      registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
        const fixes = ensureTextureRepeatIsReset({ ast, diagnostic });

        if (Array.isArray(fixes) && fixes.length > 0) {
          return fixes;
        }

        return registerManualFeatherFix({ ast, diagnostic });
      });
      continue;
    }

    if (diagnosticId === "GM2064") {
      registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
        const fixes = annotateInstanceVariableStructAssignments({
          ast,
          diagnostic,
        });

        if (Array.isArray(fixes) && fixes.length > 0) {
          return fixes;
        }

        return registerManualFeatherFix({ ast, diagnostic });
      });
      continue;
    }

    registerFeatherFixer(
      registry,
      diagnosticId,
      () =>
        ({ ast }) =>
          registerManualFeatherFix({ ast, diagnostic }),
    );
  }

  return registry;
}

function convertAssetArgumentStringsToIdentifiers({ ast, diagnostic }) {
  if (!diagnostic || !ast || typeof ast !== "object") {
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
      const calleeName =
        node.object?.type === "Identifier" ? node.object.name : null;

      if (
        typeof calleeName === "string" &&
        GM1041_CALL_ARGUMENT_TARGETS.has(calleeName)
      ) {
        const argumentIndexes =
          GM1041_CALL_ARGUMENT_TARGETS.get(calleeName) ?? [];
        const args = Array.isArray(node.arguments) ? node.arguments : [];

        for (const argumentIndex of argumentIndexes) {
          if (
            typeof argumentIndex !== "number" ||
            argumentIndex < 0 ||
            argumentIndex >= args.length
          ) {
            continue;
          }

          const fixDetail = convertStringLiteralArgumentToIdentifier({
            argument: args[argumentIndex],
            container: args,
            index: argumentIndex,
            diagnostic,
          });

          if (fixDetail) {
            fixes.push(fixDetail);
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

function convertStringLiteralArgumentToIdentifier({
  argument,
  container,
  index,
  diagnostic,
}) {
  if (!Array.isArray(container) || typeof index !== "number") {
    return null;
  }

  if (
    !argument ||
    argument.type !== "Literal" ||
    typeof argument.value !== "string"
  ) {
    return null;
  }

  const identifierName = extractIdentifierNameFromLiteral(argument.value);
  if (!identifierName) {
    return null;
  }

  const identifierNode = {
    type: "Identifier",
    name: identifierName,
  };

  if (Object.hasOwn(argument, "start")) {
    identifierNode.start = cloneLocation(argument.start);
  }

  if (Object.hasOwn(argument, "end")) {
    identifierNode.end = cloneLocation(argument.end);
  }

  copyCommentMetadata(argument, identifierNode);

  const fixDetail = createFeatherFixDetail(diagnostic, {
    target: identifierName,
    range: {
      start: getNodeStartIndex(argument),
      end: getNodeEndIndex(argument),
    },
  });

  if (!fixDetail) {
    return null;
  }

  container[index] = identifierNode;
  attachFeatherFixMetadata(identifierNode, [fixDetail]);

  return fixDetail;
}

function buildFeatherTypeSystemInfo() {
  const metadata = getFeatherMetadata();
  const typeSystem = metadata?.typeSystem;

  const baseTypes = new Set();
  const baseTypesLowercase = new Set();
  const specifierBaseTypes = new Set();

  const entries = Array.isArray(typeSystem?.baseTypes)
    ? typeSystem.baseTypes
    : [];

  for (const entry of entries) {
    const name = typeof entry?.name === "string" ? entry.name.trim() : "";

    if (!name) {
      continue;
    }

    baseTypes.add(name);
    baseTypesLowercase.add(name.toLowerCase());

    const specifierExamples = Array.isArray(entry?.specifierExamples)
      ? entry.specifierExamples
      : [];
    const hasDotSpecifier = specifierExamples.some((example) => {
      if (typeof example !== "string") {
        return false;
      }

      return example.trim().startsWith(".");
    });

    const description =
      typeof entry?.description === "string" ? entry.description : "";
    const requiresSpecifier =
      /requires specifiers/i.test(description) ||
      /constructor/i.test(description);

    if (hasDotSpecifier || requiresSpecifier) {
      specifierBaseTypes.add(name.toLowerCase());
    }
  }

  return {
    baseTypeNames: [...baseTypes],
    baseTypeNamesLower: baseTypesLowercase,
    specifierBaseTypeNamesLower: specifierBaseTypes,
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

function removeDuplicateMacroDeclarations({ ast, diagnostic }) {
  if (!diagnostic || !ast || typeof ast !== "object") {
    return [];
  }

  const fixes = [];
  const seenMacros = new Set();

  const visit = (node, parent, property) => {
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
          start: getNodeStartIndex(node),
          end: getNodeEndIndex(node),
        },
      });

      if (!fixDetail) {
        return false;
      }

      parent.splice(property, 1);
      fixes.push(fixDetail);

      return true;
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

function normalizeMultidimensionalArrayIndexing({ ast, diagnostic }) {
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

    if (node.type === "MemberIndexExpression") {
      const fix = convertMultidimensionalMemberIndex(
        node,
        parent,
        property,
        diagnostic,
      );

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

function convertMultidimensionalMemberIndex(
  node,
  parent,
  property,
  diagnostic,
) {
  if (
    !Array.isArray(parent) &&
    (typeof parent !== "object" || parent === null)
  ) {
    return null;
  }

  if (property === undefined || property === null) {
    return null;
  }

  if (!node || node.type !== "MemberIndexExpression") {
    return null;
  }

  const indices = Array.isArray(node.property) ? node.property : null;

  if (!indices || indices.length <= 1) {
    return null;
  }

  const nestedExpression = buildNestedMemberIndexExpression({
    object: node.object,
    indices,
    template: node,
  });

  if (!nestedExpression) {
    return null;
  }

  const fixDetail = createFeatherFixDetail(diagnostic, {
    target: getMemberExpressionRootIdentifier(node) ?? null,
    range: {
      start: getNodeStartIndex(node),
      end: getNodeEndIndex(node),
    },
  });

  if (!fixDetail) {
    return null;
  }

  copyCommentMetadata(node, nestedExpression);

  if (Array.isArray(parent)) {
    parent[property] = nestedExpression;
  } else if (typeof parent === "object" && parent !== null) {
    parent[property] = nestedExpression;
  }

  attachFeatherFixMetadata(nestedExpression, [fixDetail]);

  return fixDetail;
}

function buildNestedMemberIndexExpression({ object, indices, template }) {
  if (!object || !Array.isArray(indices) || indices.length === 0) {
    return null;
  }

  const [firstIndex, ...remaining] = indices;
  const accessor = template?.accessor ?? "[";

  let current = {
    type: "MemberIndexExpression",
    object,
    property: [firstIndex],
    accessor,
  };

  if (Object.hasOwn(template, "start")) {
    current.start = cloneLocation(template.start);
  }

  if (remaining.length === 0 && Object.hasOwn(template, "end")) {
    current.end = cloneLocation(template.end);
  }

  for (let index = 0; index < remaining.length; index += 1) {
    const propertyNode = remaining[index];

    const next = {
      type: "MemberIndexExpression",
      object: current,
      property: [propertyNode],
      accessor,
    };

    if (Object.hasOwn(template, "start")) {
      next.start = cloneLocation(template.start);
    }

    if (index === remaining.length - 1 && Object.hasOwn(template, "end")) {
      next.end = cloneLocation(template.end);
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

  if (
    node.type === "MemberDotExpression" ||
    node.type === "MemberIndexExpression"
  ) {
    return getMemberExpressionRootIdentifier(node.object);
  }

  if (node.type === "CallExpression") {
    return getMemberExpressionRootIdentifier(node.object);
  }

  return null;
}

function normalizeObviousSyntaxErrors({ ast, diagnostic, metadata }) {
  if (!diagnostic || !ast || typeof ast !== "object") {
    return [];
  }

  const gm1100Entries = Array.isArray(metadata?.GM1100) ? metadata.GM1100 : [];

  if (gm1100Entries.length === 0) {
    return [];
  }

  const nodeIndex = collectGM1100Candidates(ast);
  const handledNodes = new Set();
  const fixes = [];

  for (const entry of gm1100Entries) {
    const lineNumber = entry?.line;

    if (typeof lineNumber !== "number") {
      continue;
    }

    const candidates = nodeIndex.get(lineNumber) ?? [];
    let node = null;

    if (entry.type === "declaration") {
      node =
        candidates.find(
          (candidate) => candidate?.type === "VariableDeclaration",
        ) ?? null;
    } else if (entry.type === "assignment") {
      node =
        candidates.find(
          (candidate) => candidate?.type === "AssignmentExpression",
        ) ?? null;
    }

    if (!node || handledNodes.has(node)) {
      continue;
    }

    handledNodes.add(node);

    const fixDetail = createFeatherFixDetail(diagnostic, {
      target: entry?.identifier ?? null,
      range: {
        start: getNodeStartIndex(node),
        end: getNodeEndIndex(node),
      },
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
  if (
    !diagnostic ||
    typeof sourceText !== "string" ||
    sourceText.length === 0
  ) {
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

function removeBooleanLiteralStatements({ ast, diagnostic, metadata }) {
  if (!diagnostic || !ast || typeof ast !== "object") {
    return [];
  }

  const fixes = [];
  const gm1016MetadataEntries = extractFeatherPreprocessMetadata(
    metadata,
    "GM1016",
  );

  for (const entry of gm1016MetadataEntries) {
    const range = normalizePreprocessedRange(entry);

    if (!range) {
      continue;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
      target: null,
      range,
    });

    if (!fixDetail) {
      continue;
    }

    const owner = findInnermostBlockForRange(
      ast,
      range.start.index,
      range.end.index,
    );

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

      if (
        item &&
        typeof item === "object" &&
        item.type === "ExpressionStatement"
      ) {
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

  function removeBooleanLiteralExpression(
    node,
    parentArray = null,
    index = -1,
  ) {
    if (!parentArray || !Array.isArray(parentArray) || index < 0) {
      return null;
    }

    const expression = node.expression;

    if (!isBooleanLiteral(expression)) {
      return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
      target: null,
      range: {
        start: getNodeStartIndex(node),
        end: getNodeEndIndex(node),
      },
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

function extractFeatherPreprocessMetadata(metadata, key) {
  if (!metadata || typeof metadata !== "object") {
    return [];
  }

  const entries = metadata[key];

  return Array.isArray(entries) ? entries.filter(Boolean) : [];
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

  const startLocation = { index: startIndex };
  const endLocation = { index: endIndex };

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

    const nodeStart = getNodeStartIndex(node);
    const nodeEnd = getNodeEndIndex(node);

    if (
      typeof nodeStart !== "number" ||
      typeof nodeEnd !== "number" ||
      nodeStart > startIndex ||
      nodeEnd < endIndex
    ) {
      return;
    }

    if (node.type === "BlockStatement") {
      if (!bestMatch) {
        bestMatch = node;
      } else {
        const bestStart = getNodeStartIndex(bestMatch);
        const bestEnd = getNodeEndIndex(bestMatch);

        if (
          typeof bestStart === "number" &&
          typeof bestEnd === "number" &&
          (nodeStart > bestStart || nodeEnd < bestEnd)
        ) {
          bestMatch = node;
        }
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

function isBooleanLiteral(node) {
  if (!node || typeof node !== "object") {
    return false;
  }

  if (node.type !== "Literal") {
    return false;
  }

  return (
    node.value === true ||
    node.value === false ||
    node.value === "true" ||
    node.value === "false"
  );
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
  const sanitizedText = originalText.replace(
    TRAILING_MACRO_SEMICOLON_PATTERN,
    "",
  );

  if (sanitizedText === originalText) {
    return null;
  }

  node.tokens = tokens.slice(0, tokens.length - 1);
  node._featherMacroText = sanitizedText;

  const fixDetail = createFeatherFixDetail(diagnostic, {
    target: node.name?.name ?? null,
    range: {
      start: getNodeStartIndex(node),
      end: getNodeEndIndex(node),
    },
  });

  if (!fixDetail) {
    return null;
  }

  attachFeatherFixMetadata(node, [fixDetail]);

  return fixDetail;
}

function ensureConstructorDeclarationsForNewExpressions({ ast, diagnostic }) {
  if (!diagnostic || !ast || typeof ast !== "object") {
    return [];
  }

  const fixes = [];
  const functionDeclarations = new Map();

  const collectFunctions = (node) => {
    if (!node) {
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        collectFunctions(item);
      }
      return;
    }

    if (typeof node !== "object") {
      return;
    }

    if (node.type === "FunctionDeclaration") {
      const functionName =
        typeof node.id === "string" && node.id.length > 0 ? node.id : null;

      if (functionName && !functionDeclarations.has(functionName)) {
        functionDeclarations.set(functionName, node);
      }
    }

    for (const value of Object.values(node)) {
      if (value && typeof value === "object") {
        collectFunctions(value);
      }
    }
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
        expression?.type === "Identifier" && typeof expression.name === "string"
          ? expression.name
          : null;

      if (constructorName) {
        const functionNode = functionDeclarations.get(constructorName);

        if (
          functionNode &&
          functionNode.type === "FunctionDeclaration" &&
          !convertedFunctions.has(functionNode)
        ) {
          const fix = convertFunctionDeclarationToConstructor(
            functionNode,
            diagnostic,
          );

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
      start: getNodeStartIndex(functionNode),
      end: getNodeEndIndex(functionNode),
    },
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
  if (!diagnostic || !ast || typeof ast !== "object") {
    return [];
  }

  const fixes = [];
  const scopeStack = [];

  const pushScope = (initialNames = []) => {
    const scope = new Map();

    if (Array.isArray(initialNames)) {
      for (const name of initialNames) {
        if (typeof name === "string" && name.length > 0) {
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
    if (typeof name !== "string" || name.length === 0) {
      return true;
    }

    const scope = scopeStack[scopeStack.length - 1];

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
    const declarations = Array.isArray(node.declarations)
      ? node.declarations
      : [];

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

    if (!Array.isArray(parent) || typeof property !== "number") {
      return [];
    }

    const fixDetails = [];
    const assignments = [];

    for (const declarator of duplicates) {
      const name = getVariableDeclaratorName(declarator);

      const fixDetail = createFeatherFixDetail(diagnostic, {
        target: name,
        range: {
          start: getNodeStartIndex(declarator),
          end: getNodeEndIndex(declarator),
        },
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

    if (isFunctionLikeNode(node)) {
      const paramNames = getFunctionParameterNames(node);

      pushScope(paramNames);

      const params = Array.isArray(node.params) ? node.params : [];
      for (const param of params) {
        visit(param, node, "params");
      }

      visit(node.body, node, "body");
      popScope();
      return;
    }

    if (node.type === "VariableDeclaration" && node.kind === "var") {
      const fixDetails = handleVariableDeclaration(node, parent, property);

      if (Array.isArray(fixDetails) && fixDetails.length > 0) {
        fixes.push(...fixDetails);
      }
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === "body" && isFunctionLikeNode(node)) {
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

function renameDuplicateFunctionParameters({ ast, diagnostic, options }) {
  if (!diagnostic || !ast || typeof ast !== "object") {
    return [];
  }

  const fixes = [];

  const visit = (node) => {
    if (!node) {
      return;
    }

    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    if (typeof node !== "object") {
      return;
    }

    if (
      node.type === "FunctionDeclaration" ||
      node.type === "ConstructorDeclaration"
    ) {
      const functionFixes = renameDuplicateParametersInFunction(
        node,
        diagnostic,
        options,
      );
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

    const hasIdentifier =
      identifier &&
      typeof identifier.name === "string" &&
      identifier.name.length > 0;

    if (!hasIdentifier) {
      continue;
    }

    const originalName = identifier.name;

    if (!seenNames.has(originalName)) {
      seenNames.add(originalName);
      continue;
    }

    const range = {
      start: getNodeStartIndex(identifier),
      end: getNodeEndIndex(identifier),
    };

    const fixDetail = createFeatherFixDetail(diagnostic, {
      target: originalName,
      range,
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

    if (node.type === "DeleteStatement") {
      const fix = convertDeleteStatementToUndefinedAssignment(
        node,
        parent,
        property,
        diagnostic,
      );

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

function convertDeleteStatementToUndefinedAssignment(
  node,
  parent,
  property,
  diagnostic,
) {
  if (!node || node.type !== "DeleteStatement" || !diagnostic) {
    return null;
  }

  if (!isValidDeleteTarget(node.argument)) {
    return null;
  }

  const targetName = getDeleteTargetName(node.argument);
  const assignment = {
    type: "AssignmentExpression",
    operator: "=",
    left: node.argument,
    right: createLiteral("undefined"),
    start: cloneLocation(node.start),
    end: cloneLocation(node.end),
  };

  copyCommentMetadata(node, assignment);

  const fixDetail = createFeatherFixDetail(diagnostic, {
    target: targetName,
    range: {
      start: getNodeStartIndex(node),
      end: getNodeEndIndex(node),
    },
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

  if (isIdentifierNode(node)) {
    return true;
  }

  return ALLOWED_DELETE_MEMBER_TYPES.has(node.type);
}

function isIdentifierNode(node) {
  return (
    node &&
    node.type === "Identifier" &&
    typeof node.name === "string" &&
    node.name.length > 0
  );
}

function getDeleteTargetName(node) {
  if (!node || typeof node !== "object") {
    return null;
  }

  if (isIdentifierNode(node)) {
    return node.name;
  }

  if (node.type === "MemberDotExpression") {
    return node.property?.name ?? null;
  }

  return null;
}

function replaceNodeInParent(parent, property, replacement) {
  if (Array.isArray(parent)) {
    if (
      typeof property !== "number" ||
      property < 0 ||
      property >= parent.length
    ) {
      return false;
    }

    parent[property] = replacement;
    return true;
  }

  if (parent && typeof parent === "object" && property != null) {
    parent[property] = replacement;
    return true;
  }

  return false;
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

function normalizeFunctionCallArgumentOrder({ ast, diagnostic }) {
  if (!diagnostic || !ast || typeof ast !== "object") {
    return [];
  }

  const fixes = [];
  const state = {
    counter: 0,
  };

  const visit = (node, parent, property, ancestors) => {
    if (!node) {
      return;
    }

    const nextAncestors = Array.isArray(ancestors)
      ? ancestors.concat([{ node, parent, property }])
      : [{ node, parent, property }];

    if (Array.isArray(node)) {
      for (let index = 0; index < node.length; index += 1) {
        visit(node[index], node, index, nextAncestors);
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
        parent,
        property,
        diagnostic,
        ancestors: nextAncestors,
        state,
      });

      if (fix) {
        fixes.push(fix);
      }
    }
  };

  visit(ast, null, null, []);

  return fixes;
}

function normalizeCallExpressionArguments({
  node,
  parent,
  property,
  diagnostic,
  ancestors,
  state,
}) {
  if (!node || node.type !== "CallExpression") {
    return null;
  }

  const args = Array.isArray(node.arguments) ? node.arguments : [];
  if (args.length === 0) {
    return null;
  }

  const callArgumentInfos = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (!argument || argument.type !== "CallExpression") {
      continue;
    }

    callArgumentInfos.push({
      argument,
      index,
    });
  }

  if (callArgumentInfos.length < 2) {
    return null;
  }

  const statementContext = findStatementContext(ancestors);

  if (!statementContext) {
    return null;
  }

  const temporaryDeclarations = [];

  for (const { argument, index } of callArgumentInfos) {
    const tempName = buildTemporaryIdentifierName(state);
    const tempIdentifier = createIdentifier(tempName, argument);

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
      identifier: tempIdentifier,
    });
  }

  if (temporaryDeclarations.length !== callArgumentInfos.length) {
    return null;
  }

  const fixDetail = createFeatherFixDetail(diagnostic, {
    target: node.object?.name ?? null,
    range: {
      start: getNodeStartIndex(node),
      end: getNodeEndIndex(node),
    },
  });

  if (!fixDetail) {
    return null;
  }

  for (const { declaration, index, identifier } of temporaryDeclarations) {
    node.arguments[index] = createIdentifier(identifier.name, identifier);
  }

  statementContext.statements.splice(
    statementContext.index,
    0,
    ...temporaryDeclarations.map(({ declaration }) => declaration),
  );

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

  const id = createIdentifier(name, init);

  if (!id) {
    return null;
  }

  const declarator = {
    type: "VariableDeclarator",
    id,
    init,
    start: cloneLocation(init.start),
    end: cloneLocation(init.end),
  };

  const declaration = {
    type: "VariableDeclaration",
    declarations: [declarator],
    kind: "var",
    start: cloneLocation(init.start),
    end: cloneLocation(init.end),
  };

  return declaration;
}

function findStatementContext(ancestors) {
  if (!Array.isArray(ancestors)) {
    return null;
  }

  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const entry = ancestors[index];

    if (
      !entry ||
      !Array.isArray(entry.parent) ||
      typeof entry.property !== "number"
    ) {
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
      index: entry.property,
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

  return (
    parentType === "Program" ||
    parentType === "BlockStatement" ||
    parentType === "SwitchCase"
  );
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
    end: cloneLocation(node.end),
  };

  const blockStatement = {
    type: "BlockStatement",
    body: [normalizedAssignment],
    start: cloneLocation(node.start),
    end: cloneLocation(node.end),
  };

  const parenthesizedExpression = {
    type: "ParenthesizedExpression",
    expression: cloneIdentifier(object),
    start: cloneLocation(object?.start ?? node.start),
    end: cloneLocation(object?.end ?? node.end),
  };

  const withStatement = {
    type: "WithStatement",
    test: parenthesizedExpression,
    body: blockStatement,
    start: cloneLocation(node.start),
    end: cloneLocation(node.end),
  };

  copyCommentMetadata(node, withStatement);

  const fixDetail = createFeatherFixDetail(diagnostic, {
    target: propertyIdentifier?.name ?? null,
    range: {
      start: getNodeStartIndex(node),
      end: getNodeEndIndex(node),
    },
  });

  if (!fixDetail) {
    return null;
  }

  parent[property] = withStatement;
  attachFeatherFixMetadata(withStatement, [fixDetail]);

  return fixDetail;
}

function ensureBlendEnableIsReset({ ast, diagnostic }) {
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
      const fix = ensureBlendEnableResetAfterCall(
        node,
        parent,
        property,
        diagnostic,
      );

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
  if (!Array.isArray(parent) || typeof property !== "number") {
    return null;
  }

  if (!node || node.type !== "CallExpression") {
    return null;
  }

  if (!isIdentifierWithName(node.object, "gpu_set_blendenable")) {
    return null;
  }

  const args = Array.isArray(node.arguments) ? node.arguments : [];

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

  const fixDetail = createFeatherFixDetail(diagnostic, {
    target: node.object?.name ?? null,
    range: {
      start: getNodeStartIndex(node),
      end: getNodeEndIndex(node),
    },
  });

  if (!fixDetail) {
    return null;
  }

  const previousSibling = siblings[insertionIndex - 1] ?? node;
  const nextSibling = siblings[insertionIndex] ?? null;
  const needsSeparator =
    insertionIndex > property + 1 &&
    !isTriviallyIgnorableStatement(previousSibling) &&
    !hasOriginalBlankLineBetween(previousSibling, nextSibling);

  if (needsSeparator) {
    siblings.splice(
      insertionIndex,
      0,
      createEmptyStatementLike(previousSibling),
    );
    insertionIndex += 1;
  }

  siblings.splice(insertionIndex, 0, resetCall);
  attachFeatherFixMetadata(resetCall, [fixDetail]);

  return fixDetail;
}

function ensureFileFindFirstBeforeClose({ ast, diagnostic }) {
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
      const fix = ensureFileFindFirstBeforeCloseCall(
        node,
        parent,
        property,
        diagnostic,
      );

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

function ensureFileFindFirstBeforeCloseCall(
  node,
  parent,
  property,
  diagnostic,
) {
  if (!Array.isArray(parent) || typeof property !== "number") {
    return null;
  }

  if (!node || node.type !== "CallExpression") {
    return null;
  }

  if (!isIdentifierWithName(node.object, "file_find_close")) {
    return null;
  }

  const diagnosticMetadata = Array.isArray(node._appliedFeatherDiagnostics)
    ? node._appliedFeatherDiagnostics
    : [];

  const insertedForSerializedSearch = diagnosticMetadata.some(
    (entry) => entry?.id === "GM2031",
  );

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

  const fileFindFirstCall = createFileFindFirstCall(node);

  if (!fileFindFirstCall) {
    return null;
  }

  const fixDetail = createFeatherFixDetail(diagnostic, {
    target: node.object?.name ?? null,
    range: {
      start: getNodeStartIndex(node),
      end: getNodeEndIndex(node),
    },
  });

  if (!fixDetail) {
    return null;
  }

  siblings.splice(property, 0, fileFindFirstCall);
  attachFeatherFixMetadata(fileFindFirstCall, [fixDetail]);

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

  if (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression"
  ) {
    return false;
  }

  if (
    node.type === "CallExpression" &&
    isIdentifierWithName(node.object, "file_find_first")
  ) {
    return true;
  }

  for (const value of Object.values(node)) {
    if (value && typeof value === "object") {
      if (containsFileFindFirstCall(value)) {
        return true;
      }
    }
  }

  return false;
}

function createFileFindFirstCall(template) {
  const identifier = createIdentifier("file_find_first", template?.object);

  if (!identifier) {
    return null;
  }

  const searchPattern = createLiteral('""', null);
  const attributes = createIdentifier("fa_none", null);

  const callExpression = {
    type: "CallExpression",
    object: identifier,
    arguments: [],
  };

  if (searchPattern) {
    callExpression.arguments.push(searchPattern);
  }

  if (attributes) {
    callExpression.arguments.push(attributes);
  }

  if (Object.hasOwn(template, "start")) {
    callExpression.start = cloneLocation(template.start);
  }

  if (Object.hasOwn(template, "end")) {
    callExpression.end = cloneLocation(template.end);
  }

  return callExpression;
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
      const fix = ensureAlphaTestRefResetAfterCall(
        node,
        parent,
        property,
        diagnostic,
      );

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
  if (!diagnostic || !ast || typeof ast !== "object") {
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
    } else if (
      node.type === "FunctionDeclaration" &&
      typeof node.id === "string"
    ) {
      if (!functions.has(node.id)) {
        functions.set(node.id, node);
      }
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

        if (typeof parentName === "string" && parentName.length > 0) {
          if (!constructors.has(parentName)) {
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
                  start: getNodeStartIndex(fallback),
                  end: getNodeEndIndex(fallback),
                },
              });

              if (fixDetail) {
                attachFeatherFixMetadata(fallback, [fixDetail]);
                fixes.push(fixDetail);
              }
            } else {
              const fixDetail = createFeatherFixDetail(diagnostic, {
                target: parentName,
                range: {
                  start: getNodeStartIndex(parentClause),
                  end: getNodeEndIndex(parentClause),
                },
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

  const fixDetail = createFeatherFixDetail(diagnostic, {
    target: node.object?.name ?? null,
    range: {
      start: getNodeStartIndex(node),
      end: getNodeEndIndex(node),
    },
  });

  if (!fixDetail) {
    return null;
  }

  const previousSibling = siblings[insertionIndex - 1] ?? node;
  const nextSibling = siblings[insertionIndex] ?? null;
  const needsSeparator =
    insertionIndex > property + 1 &&
    !isTriviallyIgnorableStatement(previousSibling) &&
    !hasOriginalBlankLineBetween(previousSibling, nextSibling);

  if (needsSeparator) {
    siblings.splice(
      insertionIndex,
      0,
      createEmptyStatementLike(previousSibling),
    );
    insertionIndex += 1;
  }

  siblings.splice(insertionIndex, 0, resetCall);
  attachFeatherFixMetadata(resetCall, [fixDetail]);

  return fixDetail;
}

function ensureTextureRepeatIsReset({ ast, diagnostic }) {
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
      const fix = ensureTextureRepeatResetAfterCall(
        node,
        parent,
        property,
        diagnostic,
      );

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

  if (!isIdentifierWithName(node.object, "gpu_set_texrepeat")) {
    return null;
  }

  const args = Array.isArray(node.arguments) ? node.arguments : [];

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

  const fixDetail = createFeatherFixDetail(diagnostic, {
    target: node.object?.name ?? null,
    range: {
      start: getNodeStartIndex(node),
      end: getNodeEndIndex(node),
    },
  });

  if (!fixDetail) {
    return null;
  }

  const previousSibling = siblings[insertionIndex - 1] ?? node;
  const nextSibling = siblings[insertionIndex] ?? null;
  const needsSeparator =
    insertionIndex > property + 1 &&
    !isTriviallyIgnorableStatement(previousSibling) &&
    !hasOriginalBlankLineBetween(previousSibling, nextSibling);

  if (needsSeparator) {
    siblings.splice(
      insertionIndex,
      0,
      createEmptyStatementLike(previousSibling),
    );
    insertionIndex += 1;
  }

  siblings.splice(insertionIndex, 0, resetCall);
  attachFeatherFixMetadata(resetCall, [fixDetail]);

  return fixDetail;
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

  if (template && typeof template === "object") {
    if (Object.hasOwn(template, "start")) {
      empty.start = cloneLocation(template.start);
    }

    if (Object.hasOwn(template, "end")) {
      empty.end = cloneLocation(template.end);
    }
  }

  return empty;
}

function hasOriginalBlankLineBetween(beforeNode, afterNode) {
  const beforeEndLine =
    typeof beforeNode?.end?.line === "number" ? beforeNode.end.line : null;
  const afterStartLine =
    typeof afterNode?.start?.line === "number" ? afterNode.start.line : null;

  if (beforeEndLine == null || afterStartLine == null) {
    return false;
  }

  return afterStartLine > beforeEndLine + 1;
}

function ensureFileFindSearchesAreSerialized({ ast, diagnostic }) {
  if (!diagnostic || !ast || typeof ast !== "object") {
    return [];
  }

  const fixes = [];
  const state = createFileFindState();

  processStatementBlock(getProgramStatements(ast), state);

  return fixes;

  function processStatementBlock(statements, currentState) {
    if (
      !Array.isArray(statements) ||
      statements.length === 0 ||
      !currentState
    ) {
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
        const insertion = insertFileFindCloseBefore(
          statements,
          index,
          callNode,
        );

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
      default:
        break;
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

    return Array.isArray(target.body) ? target.body : [];
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
        start: getNodeStartIndex(callNode),
        end: getNodeEndIndex(callNode),
      },
    });

    if (!fixDetail) {
      return null;
    }

    attachFeatherFixMetadata(closeCall, [fixDetail]);
    statements.splice(index, 0, closeCall);

    return {
      fixDetail,
      insertedBefore: 1,
    };
  }

  function getFileFindFirstCallFromStatement(statement) {
    if (!statement || typeof statement !== "object") {
      return null;
    }

    switch (statement.type) {
      case "CallExpression":
        return isIdentifierWithName(statement.object, "file_find_first")
          ? statement
          : null;
      case "AssignmentExpression":
        return getFileFindFirstCallFromExpression(statement.right);
      case "VariableDeclaration": {
        const declarations = Array.isArray(statement.declarations)
          ? statement.declarations
          : [];

        for (const declarator of declarations) {
          const call = getFileFindFirstCallFromExpression(declarator?.init);
          if (call) {
            return call;
          }
        }
        return null;
      }
      case "ReturnStatement":
      case "ThrowStatement":
        return getFileFindFirstCallFromExpression(statement.argument);
      case "ExpressionStatement":
        return getFileFindFirstCallFromExpression(statement.expression);
      default:
        return null;
    }
  }

  function getFileFindFirstCallFromExpression(expression) {
    if (!expression || typeof expression !== "object") {
      return null;
    }

    if (expression.type === "CallExpression") {
      return isIdentifierWithName(expression.object, "file_find_first")
        ? expression
        : null;
    }

    if (expression.type === "ParenthesizedExpression") {
      return getFileFindFirstCallFromExpression(expression.expression);
    }

    if (expression.type === "AssignmentExpression") {
      return getFileFindFirstCallFromExpression(expression.right);
    }

    if (expression.type === "SequenceExpression") {
      const expressions = Array.isArray(expression.expressions)
        ? expression.expressions
        : [];

      for (const item of expressions) {
        const call = getFileFindFirstCallFromExpression(item);
        if (call) {
          return call;
        }
      }
    }

    if (
      expression.type === "BinaryExpression" ||
      expression.type === "LogicalExpression"
    ) {
      const leftCall = getFileFindFirstCallFromExpression(expression.left);
      if (leftCall) {
        return leftCall;
      }

      return getFileFindFirstCallFromExpression(expression.right);
    }

    if (
      expression.type === "ConditionalExpression" ||
      expression.type === "TernaryExpression"
    ) {
      const consequentCall = getFileFindFirstCallFromExpression(
        expression.consequent,
      );
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
      return isIdentifierWithName(statement.object, "file_find_close");
    }

    if (statement.type === "ExpressionStatement") {
      return isFileFindCloseStatement(statement.expression);
    }

    if (
      statement.type === "ReturnStatement" ||
      statement.type === "ThrowStatement"
    ) {
      return isFileFindCloseStatement(statement.argument);
    }

    return false;
  }

  function getProgramStatements(node) {
    if (!node || typeof node !== "object") {
      return [];
    }

    if (Array.isArray(node.body)) {
      return node.body;
    }

    if (node.body && Array.isArray(node.body.body)) {
      return node.body.body;
    }

    return [];
  }

  function createFileFindState() {
    return {
      openCount: 0,
    };
  }

  function cloneFileFindState(existing) {
    if (!existing || typeof existing !== "object") {
      return createFileFindState();
    }

    return {
      openCount: existing.openCount ?? 0,
    };
  }

  function createFileFindCloseCall(template) {
    const identifier = createIdentifier(
      "file_find_close",
      template?.object ?? template,
    );

    if (!identifier) {
      return null;
    }

    const callExpression = {
      type: "CallExpression",
      object: identifier,
      arguments: [],
    };

    if (Object.hasOwn(template, "start")) {
      callExpression.start = cloneLocation(template.start);
    }

    if (Object.hasOwn(template, "end")) {
      callExpression.end = cloneLocation(template.end);
    }

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
      body: [statement],
    };

    if (Object.hasOwn(statement, "start")) {
      block.start = cloneLocation(statement.start);
    }

    if (Object.hasOwn(statement, "end")) {
      block.end = cloneLocation(statement.end);
    }

    parent[key] = block;

    return block;
  }
}

function harmonizeTexturePointerTernaries({ ast, diagnostic }) {
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

    if (node.type === "TernaryExpression") {
      const fix = harmonizeTexturePointerTernary(
        node,
        parent,
        property,
        diagnostic,
      );

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
  "instance_create_z",
]);

function annotateInstanceVariableStructAssignments({ ast, diagnostic }) {
  if (!diagnostic || !ast || typeof ast !== "object") {
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

      if (Array.isArray(callFixes) && callFixes.length > 0) {
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
  if (!node || node.type !== "Identifier") {
    return false;
  }

  if (INSTANCE_CREATE_FUNCTION_NAMES.has(node.name)) {
    return true;
  }

  return node.name?.startsWith?.("instance_create_") ?? false;
}

function findStructArgument(args) {
  if (!Array.isArray(args) || args.length === 0) {
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

function annotateVariableStructProperties(structExpression, diagnostic) {
  if (!structExpression || structExpression.type !== "StructExpression") {
    return [];
  }

  const properties = Array.isArray(structExpression.properties)
    ? structExpression.properties
    : [];

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
      start: getNodeStartIndex(property),
      end: getNodeEndIndex(property),
    },
    automatic: false,
  });

  if (!fixDetail) {
    return null;
  }

  attachFeatherFixMetadata(property, [fixDetail]);

  return fixDetail;
}

function harmonizeTexturePointerTernary(node, parent, property, diagnostic) {
  if (!node || node.type !== "TernaryExpression") {
    return null;
  }

  if (
    !parent ||
    parent.type !== "AssignmentExpression" ||
    property !== "right"
  ) {
    return null;
  }

  if (!isSpriteGetTextureCall(node.consequent)) {
    return null;
  }

  const alternate = node.alternate;

  if (!isNegativeOneLiteral(alternate)) {
    return null;
  }

  const pointerIdentifier = createIdentifier("pointer_null", alternate);

  if (!pointerIdentifier) {
    return null;
  }

  copyCommentMetadata(alternate, pointerIdentifier);
  node.alternate = pointerIdentifier;

  const fixDetail = createFeatherFixDetail(diagnostic, {
    target: isIdentifier(parent.left) ? parent.left.name : null,
    range: {
      start: getNodeStartIndex(node),
      end: getNodeEndIndex(node),
    },
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

  if (!isIdentifier(identifier)) {
    return null;
  }

  if (!declarator.init) {
    return null;
  }

  const assignment = {
    type: "AssignmentExpression",
    operator: "=",
    left: cloneIdentifier(identifier),
    right: declarator.init,
    start: cloneLocation(declarator.start ?? declarationNode?.start),
    end: cloneLocation(declarator.end ?? declarationNode?.end),
  };

  copyCommentMetadata(declarator, assignment);

  return assignment;
}

function isFunctionLikeNode(node) {
  if (!node || typeof node !== "object") {
    return false;
  }

  if (typeof node.type !== "string") {
    return false;
  }

  return FUNCTION_LIKE_TYPES.has(node.type);
}

function getFunctionParameterNames(node) {
  const params = Array.isArray(node?.params) ? node.params : [];
  const names = [];

  for (const param of params) {
    if (!param || typeof param !== "object") {
      continue;
    }

    if (isIdentifier(param)) {
      if (param.name) {
        names.push(param.name);
      }
      continue;
    }

    if (param.type === "DefaultParameter" && isIdentifier(param.left)) {
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

  if (!isIdentifier(identifier)) {
    return null;
  }

  return identifier.name ?? null;
}

function cloneIdentifier(node) {
  if (!node || node.type !== "Identifier") {
    return null;
  }

  const cloned = {
    type: "Identifier",
    name: node.name,
  };

  if (Object.hasOwn(node, "start")) {
    cloned.start = cloneLocation(node.start);
  }

  if (Object.hasOwn(node, "end")) {
    cloned.end = cloneLocation(node.end);
  }

  return cloned;
}

function copyCommentMetadata(source, target) {
  if (!source || !target) {
    return;
  }

  ["leadingComments", "trailingComments", "innerComments", "comments"].forEach(
    (key) => {
      if (Object.hasOwn(source, key)) {
        target[key] = source[key];
      }
    },
  );
}

function extractIdentifierNameFromLiteral(value) {
  if (typeof value !== "string") {
    return null;
  }

  const stripped = stripStringQuotes(value);
  if (!stripped) {
    return null;
  }

  if (!IDENTIFIER_NAME_PATTERN.test(stripped)) {
    return null;
  }

  return stripped;
}

function stripStringQuotes(value) {
  if (typeof value !== "string" || value.length < 2) {
    return null;
  }

  const firstChar = value[0];
  const lastChar = value[value.length - 1];

  if ((firstChar === '"' || firstChar === "'") && firstChar === lastChar) {
    return value.slice(1, -1);
  }

  return null;
}

function isIdentifierWithName(node, name) {
  if (!node || node.type !== "Identifier") {
    return false;
  }

  return node.name === name;
}

function isIdentifier(node) {
  return !!node && node.type === "Identifier";
}

function isLiteralZero(node) {
  if (!node || node.type !== "Literal") {
    return false;
  }

  return node.value === "0" || node.value === 0;
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

function isAlphaTestDisableCall(node) {
  if (!node || node.type !== "CallExpression") {
    return false;
  }

  if (!isIdentifierWithName(node.object, "gpu_set_alphatestenable")) {
    return false;
  }

  const args = Array.isArray(node.arguments) ? node.arguments : [];

  if (args.length === 0) {
    return false;
  }

  const [argument] = args;

  return isLiteralFalse(argument) || isLiteralZero(argument);
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
    arguments: [literalZero],
  };

  if (Object.hasOwn(template, "start")) {
    callExpression.start = cloneLocation(template.start);
  }

  if (Object.hasOwn(template, "end")) {
    callExpression.end = cloneLocation(template.end);
  }

  return callExpression;
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

  if (!isIdentifierWithName(node.object, "gpu_set_texrepeat")) {
    return false;
  }

  const args = Array.isArray(node.arguments) ? node.arguments : [];

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

  const identifier = cloneIdentifier(template.object);

  if (!identifier || identifier.name !== "gpu_set_texrepeat") {
    return null;
  }

  const literalFalse = createLiteral("false", template.arguments?.[0]);

  const callExpression = {
    type: "CallExpression",
    object: identifier,
    arguments: [literalFalse],
  };

  if (Object.hasOwn(template, "start")) {
    callExpression.start = cloneLocation(template.start);
  }

  if (Object.hasOwn(template, "end")) {
    callExpression.end = cloneLocation(template.end);
  }

  return callExpression;
}

function isBlendEnableResetCall(node) {
  if (!node || node.type !== "CallExpression") {
    return false;
  }

  if (!isIdentifierWithName(node.object, "gpu_set_blendenable")) {
    return false;
  }

  const args = Array.isArray(node.arguments) ? node.arguments : [];

  if (args.length === 0) {
    return false;
  }

  const [argument] = args;

  return isLiteralTrue(argument) || isLiteralOne(argument);
}

function createBlendEnableResetCall(template) {
  if (!template || template.type !== "CallExpression") {
    return null;
  }

  const identifier = cloneIdentifier(template.object);

  if (!identifier || identifier.name !== "gpu_set_blendenable") {
    return null;
  }

  const literalTrue = createLiteral("true", template.arguments?.[0]);

  const callExpression = {
    type: "CallExpression",
    object: identifier,
    arguments: [literalTrue],
  };

  if (Object.hasOwn(template, "start")) {
    callExpression.start = cloneLocation(template.start);
  }

  if (Object.hasOwn(template, "end")) {
    callExpression.end = cloneLocation(template.end);
  }

  return callExpression;
}

function createLiteral(value, template) {
  const literalValue = typeof value === "number" ? String(value) : value;

  const literal = {
    type: "Literal",
    value: literalValue,
  };

  if (template && typeof template === "object") {
    if (Object.hasOwn(template, "start")) {
      literal.start = cloneLocation(template.start);
    }

    if (Object.hasOwn(template, "end")) {
      literal.end = cloneLocation(template.end);
    }
  }

  return literal;
}

function reorderOptionalParameters({ ast, diagnostic }) {
  if (!diagnostic || !ast || typeof ast !== "object") {
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
      const fix = reorderFunctionOptionalParameters(node, diagnostic);

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

function reorderFunctionOptionalParameters(node, diagnostic) {
  if (!node || node.type !== "FunctionDeclaration") {
    return null;
  }

  const params = Array.isArray(node.params) ? node.params : null;

  if (!params || params.length === 0) {
    return null;
  }

  let encounteredOptional = false;
  let needsReordering = false;

  for (const param of params) {
    if (isOptionalParameter(param)) {
      encounteredOptional = true;
    } else if (encounteredOptional) {
      needsReordering = true;
      break;
    }
  }

  if (!needsReordering) {
    return null;
  }

  const requiredParams = [];
  const optionalParams = [];

  for (const param of params) {
    if (isOptionalParameter(param)) {
      optionalParams.push(param);
    } else {
      requiredParams.push(param);
    }
  }

  const reorderedParams = requiredParams.concat(optionalParams);

  if (reorderedParams.length !== params.length) {
    return null;
  }

  node.params = reorderedParams;

  const fixDetail = createFeatherFixDetail(diagnostic, {
    target: getFunctionIdentifierName(node),
    range: {
      start: getNodeStartIndex(node),
      end: getNodeEndIndex(node),
    },
  });

  if (!fixDetail) {
    return null;
  }

  attachFeatherFixMetadata(node, [fixDetail]);

  return fixDetail;
}

function isOptionalParameter(parameter) {
  return parameter?.type === "DefaultParameter";
}

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

function sanitizeMalformedJsDocTypes({ ast, diagnostic, typeSystemInfo }) {
  if (!diagnostic || !ast || typeof ast !== "object") {
    return [];
  }

  const comments = collectCommentNodes(ast);

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
        start: getNodeStartIndex(comment),
        end: getNodeEndIndex(comment),
      },
    });

    if (!fixDetail) {
      continue;
    }

    attachFeatherFixMetadata(comment, [fixDetail]);
    fixes.push(fixDetail);
  }

  return fixes;
}

function collectCommentNodes(root) {
  if (!root || typeof root !== "object") {
    return [];
  }

  const comments = [];
  const stack = [root];
  const visited = new WeakSet();

  while (stack.length > 0) {
    const current = stack.pop();

    if (!current || typeof current !== "object") {
      continue;
    }

    if (visited.has(current)) {
      continue;
    }

    visited.add(current);

    if (Array.isArray(current)) {
      for (const item of current) {
        stack.push(item);
      }
      continue;
    }

    if (current.type === "CommentLine" || current.type === "CommentBlock") {
      comments.push(current);
    }

    for (const value of Object.values(current)) {
      if (value && typeof value === "object") {
        stack.push(value);
      }
    }
  }

  return comments;
}

function sanitizeDocCommentType(comment, typeSystemInfo) {
  if (!comment || comment.type !== "CommentLine") {
    return null;
  }

  const rawValue = typeof comment.value === "string" ? comment.value : "";

  if (
    !rawValue ||
    rawValue.indexOf("@") === -1 ||
    rawValue.indexOf("{") === -1
  ) {
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

  const target =
    tagName === "param"
      ? extractParameterNameFromDocRemainder(remainder)
      : null;

  return {
    target,
  };
}

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

  const trimmedType = typeof typeText === "string" ? typeText.trim() : "";

  return {
    beforeBrace,
    typeText: trimmedType,
    remainder,
    hadClosingBrace,
  };
}

function splitTypeAndRemainder(text) {
  if (typeof text !== "string") {
    return { type: "", remainder: "" };
  }

  let depthSquare = 0;
  let depthAngle = 0;
  let depthParen = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === "[") {
      depthSquare += 1;
    } else if (char === "]") {
      depthSquare = Math.max(0, depthSquare - 1);
    } else if (char === "<") {
      depthAngle += 1;
    } else if (char === ">") {
      depthAngle = Math.max(0, depthAngle - 1);
    } else if (char === "(") {
      depthParen += 1;
    } else if (char === ")") {
      depthParen = Math.max(0, depthParen - 1);
    }

    if (
      WHITESPACE_PATTERN.test(char) &&
      depthSquare === 0 &&
      depthAngle === 0 &&
      depthParen === 0
    ) {
      const typePart = text.slice(0, index).trimEnd();
      const remainder = text.slice(index);
      return { type: typePart, remainder };
    }
  }

  return {
    type: text.trim(),
    remainder: "",
  };
}

const WHITESPACE_PATTERN = /\s/;

function sanitizeTypeAnnotationText(typeText, typeSystemInfo) {
  if (typeof typeText !== "string" || typeText.length === 0) {
    return typeText ?? "";
  }

  const normalized = typeText.trim();
  const balanced = balanceTypeAnnotationDelimiters(normalized);

  const specifierSanitized = fixSpecifierSpacing(
    balanced,
    typeSystemInfo?.specifierBaseTypeNamesLower,
  );

  return fixTypeUnionSpacing(
    specifierSanitized,
    typeSystemInfo?.baseTypeNamesLower,
  );
}

function balanceTypeAnnotationDelimiters(typeText) {
  if (typeof typeText !== "string" || typeText.length === 0) {
    return typeText ?? "";
  }

  const stack = [];

  for (const char of typeText) {
    if (char === "[") {
      stack.push("]");
    } else if (char === "<") {
      stack.push(">");
    } else if (char === "(") {
      stack.push(")");
    } else if (char === "]" || char === ">" || char === ")") {
      if (stack.length > 0 && stack[stack.length - 1] === char) {
        stack.pop();
      }
    }
  }

  if (stack.length === 0) {
    return typeText;
  }

  return typeText + stack.reverse().join("");
}

function fixSpecifierSpacing(typeText, specifierBaseTypes) {
  if (typeof typeText !== "string" || typeText.length === 0) {
    return typeText ?? "";
  }

  if (!(specifierBaseTypes instanceof Set) || specifierBaseTypes.size === 0) {
    return typeText;
  }

  const patternSource = [...specifierBaseTypes]
    .map((name) => escapeRegExp(name))
    .join("|");

  if (!patternSource) {
    return typeText;
  }

  const regex = new RegExp(`\\b(${patternSource})\\b`, "gi");
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
      if (specifierInfo.needsDot) {
        result += `.${specifierInfo.token}`;
      } else {
        result += remainder.slice(0, specifierInfo.consumedLength);
      }

      regex.lastIndex = matchEnd + specifierInfo.consumedLength;
      lastIndex = regex.lastIndex;
    } else {
      lastIndex = matchEnd;
    }
  }

  result += typeText.slice(lastIndex);
  return result;
}

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

  if (
    !firstChar ||
    firstChar === "." ||
    firstChar === "," ||
    firstChar === "|" ||
    firstChar === "}"
  ) {
    return {
      consumedLength: offset,
      needsDot: false,
    };
  }

  let consumed = offset;
  let token = "";
  let depthSquare = 0;
  let depthAngle = 0;
  let depthParen = 0;

  while (consumed < text.length) {
    const char = text[consumed];

    if (
      WHITESPACE_PATTERN.test(char) &&
      depthSquare === 0 &&
      depthAngle === 0 &&
      depthParen === 0
    ) {
      break;
    }

    if (
      (char === "," || char === "|" || char === "}") &&
      depthSquare === 0 &&
      depthAngle === 0 &&
      depthParen === 0
    ) {
      break;
    }

    if (char === "[") {
      depthSquare += 1;
    } else if (char === "]") {
      depthSquare = Math.max(0, depthSquare - 1);
    } else if (char === "<") {
      depthAngle += 1;
    } else if (char === ">") {
      depthAngle = Math.max(0, depthAngle - 1);
    } else if (char === "(") {
      depthParen += 1;
    } else if (char === ")") {
      depthParen = Math.max(0, depthParen - 1);
    }

    token += char;
    consumed += 1;
  }

  if (token.length === 0) {
    return {
      consumedLength: offset,
      needsDot: false,
    };
  }

  return {
    consumedLength: consumed,
    token,
    needsDot: true,
  };
}

function fixTypeUnionSpacing(typeText, baseTypesLower) {
  if (typeof typeText !== "string" || typeText.length === 0) {
    return typeText ?? "";
  }

  if (!(baseTypesLower instanceof Set) || baseTypesLower.size === 0) {
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

  const trimmedSegments = segments
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

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

function splitTypeSegments(text) {
  const segments = [];
  let current = "";
  let depthSquare = 0;
  let depthAngle = 0;
  let depthParen = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === "[") {
      depthSquare += 1;
    } else if (char === "]") {
      depthSquare = Math.max(0, depthSquare - 1);
    } else if (char === "<") {
      depthAngle += 1;
    } else if (char === ">") {
      depthAngle = Math.max(0, depthAngle - 1);
    } else if (char === "(") {
      depthParen += 1;
    } else if (char === ")") {
      depthParen = Math.max(0, depthParen - 1);
    }

    if (
      (WHITESPACE_PATTERN.test(char) || char === "," || char === "|") &&
      depthSquare === 0 &&
      depthAngle === 0 &&
      depthParen === 0
    ) {
      if (current.trim().length > 0) {
        segments.push(current.trim());
      }
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim().length > 0) {
    segments.push(current.trim());
  }

  return segments;
}

function hasDelimiterOutsideNesting(text, delimiters) {
  if (typeof text !== "string" || text.length === 0) {
    return false;
  }

  const delimiterSet = new Set(delimiters ?? []);
  let depthSquare = 0;
  let depthAngle = 0;
  let depthParen = 0;

  for (const char of text) {
    if (char === "[") {
      depthSquare += 1;
    } else if (char === "]") {
      depthSquare = Math.max(0, depthSquare - 1);
    } else if (char === "<") {
      depthAngle += 1;
    } else if (char === ">") {
      depthAngle = Math.max(0, depthAngle - 1);
    } else if (char === "(") {
      depthParen += 1;
    } else if (char === ")") {
      depthParen = Math.max(0, depthParen - 1);
    }

    if (
      delimiterSet.has(char) &&
      depthSquare === 0 &&
      depthAngle === 0 &&
      depthParen === 0
    ) {
      return true;
    }
  }

  return false;
}

function createIdentifier(name, template) {
  if (!name) {
    return null;
  }

  const identifier = {
    type: "Identifier",
    name,
  };

  if (template && typeof template === "object") {
    if (Object.hasOwn(template, "start")) {
      identifier.start = cloneLocation(template.start);
    }

    if (Object.hasOwn(template, "end")) {
      identifier.end = cloneLocation(template.end);
    }
  }

  return identifier;
}

function isSpriteGetTextureCall(node) {
  if (!node || node.type !== "CallExpression") {
    return false;
  }

  return isIdentifierWithName(node.object, "sprite_get_texture");
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

function extractBaseTypeName(segment) {
  if (typeof segment !== "string") {
    return null;
  }

  const match = segment.match(/^[A-Za-z_][A-Za-z0-9_]*/);

  return match ? match[0] : null;
}

function extractParameterNameFromDocRemainder(remainder) {
  if (typeof remainder !== "string") {
    return null;
  }

  const match = remainder.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)/);

  return match ? match[1] : null;
}

function escapeRegExp(text) {
  if (typeof text !== "string") {
    return "";
  }

  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    target: null,
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
    value: registry,
  });

  return registry;
}

function createFeatherFixDetail(
  diagnostic,
  { target = null, range = null, automatic = true } = {},
) {
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
    automatic,
  };
}

function attachFeatherFixMetadata(target, fixes) {
  if (
    !target ||
    typeof target !== "object" ||
    !Array.isArray(fixes) ||
    fixes.length === 0
  ) {
    return;
  }

  const key = "_appliedFeatherDiagnostics";

  if (!Array.isArray(target[key])) {
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: false,
      writable: true,
      value: [],
    });
  }

  target[key].push(...fixes);
}

const ARGUMENT_BUILTINS = new Set([
  "argument",
  "argument_relative",
  "argument_count",
  ...Array.from({ length: 16 }, (_, index) => `argument${index}`),
]);

function relocateArgumentReferencesInsideFunctions({ ast, diagnostic }) {
  if (!diagnostic || !ast || typeof ast !== "object") {
    return [];
  }

  const programBody = Array.isArray(ast.body) ? ast.body : null;

  if (!programBody || programBody.length === 0) {
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

    let nextIndex = index + 1;

    while (nextIndex < programBody.length) {
      const candidate = programBody[nextIndex];

      if (!candidate || typeof candidate !== "object") {
        break;
      }

      if (isFunctionDeclaration(candidate)) {
        break;
      }

      const argumentReference =
        findArgumentReferenceOutsideFunctions(candidate);

      if (!argumentReference) {
        break;
      }

      programBody.splice(nextIndex, 1);
      block.body.push(candidate);

      const fixDetail = createFeatherFixDetail(diagnostic, {
        target: argumentReference?.name ?? null,
        range: {
          start: getNodeStartIndex(candidate),
          end: getNodeEndIndex(candidate),
        },
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

    if (!isRoot && isFunctionLikeNode(current)) {
      return;
    }

    if (current.type === "Identifier") {
      const builtin = getArgumentBuiltinName(current.name);

      if (builtin) {
        match = { name: builtin };
        return;
      }
    }

    if (
      current.type === "MemberIndexExpression" &&
      isIdentifierWithName(current.object, "argument")
    ) {
      match = { name: "argument" };
      return;
    }

    if (
      current.type === "MemberDotExpression" &&
      isIdentifierWithName(current.object, "argument")
    ) {
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

function getNodeStartLine(node) {
  const location = node?.start;

  if (
    location &&
    typeof location === "object" &&
    typeof location.line === "number"
  ) {
    return location.line;
  }

  return undefined;
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
      (candidate.type === "VariableDeclaration" ||
        candidate.type === "AssignmentExpression") &&
      typeof getNodeStartLine(candidate) === "number"
    ) {
      const line = getNodeStartLine(candidate);

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
