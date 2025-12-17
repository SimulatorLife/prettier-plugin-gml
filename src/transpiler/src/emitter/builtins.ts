export type BuiltInEmitter = (args: ReadonlyArray<string>) => string;

export const builtInFunctions: Record<string, BuiltInEmitter> = Object.freeze({
    point_distance(args) {
        if (args.length !== 4) {
            return `point_distance(${args.join(", ")})`;
        }
        return `Math.sqrt(Math.pow(${args[2]} - ${args[0]}, 2) + Math.pow(${args[3]} - ${args[1]}, 2))`;
    },
    abs(args) {
        return `Math.abs(${args.join(", ")})`;
    },
    round(args) {
        return `Math.round(${args.join(", ")})`;
    },
    floor(args) {
        return `Math.floor(${args.join(", ")})`;
    },
    ceil(args) {
        return `Math.ceil(${args.join(", ")})`;
    },
    sqrt(args) {
        return `Math.sqrt(${args.join(", ")})`;
    },
    sqr(args) {
        return `Math.pow(${args.join(", ")}, 2)`;
    },
    power(args) {
        return `Math.pow(${args.join(", ")})`;
    },
    exp(args) {
        return `Math.exp(${args.join(", ")})`;
    },
    ln(args) {
        return `Math.log(${args.join(", ")})`;
    },
    log2(args) {
        return `Math.log2(${args.join(", ")})`;
    },
    log10(args) {
        return `Math.log10(${args.join(", ")})`;
    },
    sin(args) {
        return `Math.sin(${args.join(", ")})`;
    },
    cos(args) {
        return `Math.cos(${args.join(", ")})`;
    },
    tan(args) {
        return `Math.tan(${args.join(", ")})`;
    },
    arcsin(args) {
        return `Math.asin(${args.join(", ")})`;
    },
    arccos(args) {
        return `Math.acos(${args.join(", ")})`;
    },
    arctan(args) {
        return `Math.atan(${args.join(", ")})`;
    },
    arctan2(args) {
        return `Math.atan2(${args.join(", ")})`;
    },
    degtorad(args) {
        return `((${args.join(", ")}) * Math.PI / 180)`;
    },
    radtodeg(args) {
        return `((${args.join(", ")}) * 180 / Math.PI)`;
    },
    sign(args) {
        return `Math.sign(${args.join(", ")})`;
    },
    clamp(args) {
        if (args.length !== 3) {
            return `clamp(${args.join(", ")})`;
        }
        return `Math.max(${args[1]}, Math.min(${args[2]}, ${args[0]}))`;
    },
    min(args) {
        return `Math.min(${args.join(", ")})`;
    },
    max(args) {
        return `Math.max(${args.join(", ")})`;
    }
});
