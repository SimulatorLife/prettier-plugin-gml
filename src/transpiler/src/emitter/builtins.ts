export type BuiltInEmitter = (args: ReadonlyArray<string>) => string;

const runtimeBuiltinNames = [
    "point_distance",
    "abs",
    "round",
    "floor",
    "ceil",
    "sqrt",
    "sqr",
    "power",
    "exp",
    "ln",
    "log2",
    "log10",
    "sin",
    "cos",
    "tan",
    "arcsin",
    "arccos",
    "arctan",
    "arctan2",
    "degtorad",
    "radtodeg",
    "sign",
    "clamp",
    "min",
    "max",
    "string_length",
    "string_char_at",
    "string_ord_at",
    "string_byte_at",
    "string_byte_length",
    "string_pos",
    "string_last_pos",
    "string_copy",
    "string_delete",
    "string_insert",
    "string_replace",
    "string_replace_all",
    "string_count",
    "string_upper",
    "string_lower",
    "string_repeat",
    "string_letters",
    "string_digits",
    "string_lettersdigits",
    "string_format",
    "chr",
    "ansi_char",
    "ord",
    "real",
    "string",
    "random",
    "random_range",
    "irandom",
    "irandom_range",
    "choose",
    "lerp",
    "median",
    "mean"
] as const;

const runtimeBuiltinFunctions: Record<string, BuiltInEmitter> = Object.create(
    null
);

for (const builtinName of runtimeBuiltinNames) {
    runtimeBuiltinFunctions[builtinName] = (args) =>
        `${builtinName}(${args.join(", ")})`;
}

export const builtInFunctions: Record<string, BuiltInEmitter> = Object.freeze(
    runtimeBuiltinFunctions
);
