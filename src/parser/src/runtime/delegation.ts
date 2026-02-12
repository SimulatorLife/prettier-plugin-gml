import { Core } from "@gml-modules/core";

export function toDelegate<T extends (...args: unknown[]) => unknown>(value: unknown, fallback: T = Core.noop as T): T {
    return typeof value === "function" ? (value as T) : fallback;
}
