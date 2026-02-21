type BinaryOperatorAssoc = "left" | "right";
type BinaryOperatorType = "unary" | "arithmetic" | "bitwise" | "comparison" | "logical" | "assign";

interface BinaryOperatorInfo {
    prec: number;
    assoc: BinaryOperatorAssoc;
    type: BinaryOperatorType;
}

export const OPERATOR_ALIAS_PAIRS = [
    ["&&", "and"],
    ["||", "or"],
    ["%", "mod"],
    ["^^", "xor"],
    ["<>", "!="]
];

export const OPERATOR_ALIAS_MAP = Object.fromEntries(
    OPERATOR_ALIAS_PAIRS.flatMap(([symbol, keyword]) => [
        [symbol, { symbol, keyword }],
        [keyword, { symbol, keyword }]
    ])
);

export const BINARY_OPERATORS: Record<string, BinaryOperatorInfo> = {
    // Highest Precedence
    // Track whether `++` is parsed as a prefix or suffix operator. The
    // parser currently funnels both variants through the same precedence entry,
    // which keeps the visitor traversals simple but hides whether the operand
    // should be evaluated before or after the increment. Downstream
    // transformations such as the identifier role tracker and the
    // apply-feather-fixes pipeline depend on that nuance to distinguish between
    // pure reads and reads-with-writeback. The GameMaker manual spells out the
    // differing semantics (https://manual.gamemaker.io/monthly/en/#t=GameMaker_Language%2FGML_Reference%2FOperators%2FIncrement_and_Decrement.htm),
    // so once the builder exposes the mode we should emit richer AST nodes
    // instead of treating them as interchangeable unary operators.
    "++": { prec: 15, assoc: "right", type: "unary" },
    // Track the decrement operator with the same prefix/suffix semantics as
    // the increment operator (see the comment above for `++`). GameMaker's
    // runtime distinguishes between `--value` (prefix) and `value--` (postfix),
    // emitting different bytecode for each form. Prefix decrements modify the
    // variable before its value is read, while postfix decrements return the
    // original value and modify afterward. Treating these as interchangeable
    // unary operators would allow downstream optimizations (such as the Feather
    // fixer or identifier role tracker) to incorrectly assume `value--` has no
    // side effects, leading to mis-scheduled hoists or duplicate writes when
    // the formatter rewrites identifier usages.
    "--": { prec: 15, assoc: "right", type: "unary" },
    "~": { prec: 14, assoc: "right", type: "unary" },
    "!": { prec: 14, assoc: "right", type: "unary" },
    // "-": { prec: 14, assoc: "left", type: "unary" }, // Negate
    "*": { prec: 13, assoc: "left", type: "arithmetic" },
    "/": { prec: 13, assoc: "left", type: "arithmetic" },
    div: { prec: 13, assoc: "left", type: "arithmetic" },
    "%": { prec: 13, assoc: "left", type: "arithmetic" },
    mod: { prec: 13, assoc: "left", type: "arithmetic" },
    "+": { prec: 12, assoc: "left", type: "arithmetic" }, // Addition
    "-": { prec: 12, assoc: "left", type: "arithmetic" }, // Subtraction
    "<<": { prec: 12, assoc: "left", type: "bitwise" },
    ">>": { prec: 12, assoc: "left", type: "bitwise" },
    "&": { prec: 11, assoc: "left", type: "bitwise" },
    "^": { prec: 10, assoc: "left", type: "bitwise" },
    "|": { prec: 9, assoc: "left", type: "bitwise" },
    "<": { prec: 8, assoc: "left", type: "comparison" },
    "<=": { prec: 8, assoc: "left", type: "comparison" },
    ">": { prec: 8, assoc: "left", type: "comparison" },
    ">=": { prec: 8, assoc: "left", type: "comparison" },
    "==": { prec: 7, assoc: "left", type: "comparison" },
    "!=": { prec: 7, assoc: "left", type: "comparison" },
    "<>": { prec: 7, assoc: "left", type: "comparison" },
    "&&": { prec: 6, assoc: "left", type: "logical" },
    and: { prec: 6, assoc: "left", type: "logical" },
    "^^": { prec: 5, assoc: "left", type: "logical" },
    xor: { prec: 5, assoc: "left", type: "logical" },
    "||": { prec: 4, assoc: "left", type: "logical" },
    or: { prec: 4, assoc: "left", type: "logical" },
    "??": { prec: 4, assoc: "right", type: "logical" }, // Nullish coalescing
    "*=": { prec: 1, assoc: "right", type: "assign" },
    ":=": { prec: 1, assoc: "right", type: "assign" }, // Equivalent to "=" in GML
    "=": { prec: 1, assoc: "right", type: "assign" }, // Also handles single-equals comparisons (normalized to "==")
    "/=": { prec: 1, assoc: "right", type: "assign" },
    "%=": { prec: 1, assoc: "right", type: "assign" },
    "+=": { prec: 1, assoc: "right", type: "assign" },
    "-=": { prec: 1, assoc: "right", type: "assign" },
    "<<=": { prec: 1, assoc: "right", type: "assign" },
    ">>=": { prec: 1, assoc: "right", type: "assign" },
    "&=": { prec: 1, assoc: "right", type: "assign" },
    "^=": { prec: 1, assoc: "right", type: "assign" },
    "|=": { prec: 1, assoc: "right", type: "assign" },
    "??=": { prec: 1, assoc: "right", type: "assign" } // Nullish coalescing assignment
};