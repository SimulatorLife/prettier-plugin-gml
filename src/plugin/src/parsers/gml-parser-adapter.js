// Thin adapter that bridges the Prettier parser contract to the GameMaker
// parser implementation. Keeping this logic in one place avoids sprinkling
// knowledge of the parser's option shape and location metadata across the
// rest of the plugin configuration.
import { util } from "prettier";
import GMLParser from "gamemaker-language-parser";
import { consolidateStructAssignments } from "../ast-transforms/consolidate-struct-assignments.js";
import {
  applyFeatherFixes,
  preprocessSourceForFeatherFixes,
} from "../ast-transforms/apply-feather-fixes.js";
import { preprocessFunctionArgumentDefaults } from "../ast-transforms/preprocess-function-argument-defaults.js";
import { getStartIndex, getEndIndex } from "../../../shared/ast-locations.js";

const { addTrailingComment } = util;

function parse(text, options) {
  let parseSource = text;
  let preprocessedFixMetadata = null;

  if (options?.applyFeatherFixes) {
    const preprocessResult = preprocessSourceForFeatherFixes(text);

    if (preprocessResult && typeof preprocessResult.sourceText === "string") {
      parseSource = preprocessResult.sourceText;
    }

    preprocessedFixMetadata = preprocessResult?.metadata ?? null;
  }

  const ast = GMLParser.parse(parseSource, {
    getLocations: true,
    simplifyLocations: false,
  });

  if (!ast || typeof ast !== "object") {
    throw new Error(
      "GameMaker parser returned no AST for the provided source.",
    );
  }

  if (options?.condenseStructAssignments ?? true) {
    consolidateStructAssignments(ast, { addTrailingComment });
  }

  if (options?.applyFeatherFixes) {
    applyFeatherFixes(ast, {
      sourceText: parseSource,
      preprocessedFixMetadata,
    });
  }

  preprocessFunctionArgumentDefaults(ast);

  return ast;
}

function locStart(node) {
  const startIndex = getStartIndex(node);
  return typeof startIndex === "number" ? startIndex : 0;
}

function locEnd(node) {
  const endIndex = getEndIndex(node);
  if (typeof endIndex === "number") {
    return endIndex + 1;
  }

  const fallbackStart = getStartIndex(node);
  return typeof fallbackStart === "number" ? fallbackStart : 0;
}

export const gmlParserAdapter = {
  parse,
  astFormat: "gml-ast",
  locStart,
  locEnd,
};
