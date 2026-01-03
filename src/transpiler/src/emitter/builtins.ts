import * as Core from "@gml-modules/core";

export type BuiltInEmitter = (args: ReadonlyArray<string>) => string;

const runtimeBuiltinFunctions: Record<string, BuiltInEmitter> = {};

for (const builtinName of Core.Core.loadManualFunctionNames()) {
    runtimeBuiltinFunctions[builtinName] = (args) => `${builtinName}(${args.join(", ")})`;
}

export const builtInFunctions: Record<string, BuiltInEmitter> = Object.freeze(runtimeBuiltinFunctions);
