import { createTranspiler as createGmlTranspiler } from "gamemaker-language-transpiler";

/**
 * Creates a transpiler instance for CLI workflows using the public transpiler API.
 *
 * This indirection prevents CLI commands from reaching into the transpiler's
 * internal file layout. Should the transpiler implementation move, only this
 * adapter needs updating while consumers remain stable.
 *
 * @param {object} [dependencies] - Optional dependencies for the transpiler
 * @returns {import("gamemaker-language-transpiler").GmlTranspiler}
 */
export function createCliTranspiler(dependencies) {
    return createGmlTranspiler(dependencies);
}
