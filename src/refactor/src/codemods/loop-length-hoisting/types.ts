export type LoopLengthHoistFunctionSuffixes = Readonly<Record<string, string | null>>;

/**
 * Options for the loop-length hoisting codemod.
 */
export type LoopLengthHoistingCodemodOptions = Readonly<{
    functionSuffixes?: LoopLengthHoistFunctionSuffixes;
}>;

/**
 * Structured edit produced by the loop-length hoisting codemod.
 */
export type LoopLengthHoistingEdit = Readonly<{
    start: number;
    end: number;
    text: string;
}>;

/**
 * Result payload returned after applying the loop-length hoisting codemod.
 */
export type LoopLengthHoistingCodemodResult = Readonly<{
    changed: boolean;
    outputText: string;
    appliedEdits: ReadonlyArray<LoopLengthHoistingEdit>;
    diagnosticOffsets: ReadonlyArray<number>;
}>;
