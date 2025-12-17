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
        if (args.length !== 1) {
            return `sqrt(${args.join(", ")})`;
        }
        return `Math.sqrt(${args[0]})`;
    },
    sqr(args) {
        if (args.length !== 1) {
            return `sqr(${args.join(", ")})`;
        }
        return `Math.pow(${args[0]}, 2)`;
    },
    power(args) {
        if (args.length !== 2) {
            return `power(${args.join(", ")})`;
        }
        return `Math.pow(${args[0]}, ${args[1]})`;
    },
    exp(args) {
        if (args.length !== 1) {
            return `exp(${args.join(", ")})`;
        }
        return `Math.exp(${args[0]})`;
    },
    ln(args) {
        if (args.length !== 1) {
            return `ln(${args.join(", ")})`;
        }
        return `Math.log(${args[0]})`;
    },
    log2(args) {
        if (args.length !== 1) {
            return `log2(${args.join(", ")})`;
        }
        return `Math.log2(${args[0]})`;
    },
    log10(args) {
        if (args.length !== 1) {
            return `log10(${args.join(", ")})`;
        }
        return `Math.log10(${args[0]})`;
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
        if (args.length !== 1) {
            return `arcsin(${args.join(", ")})`;
        }
        return `Math.asin(${args[0]})`;
    },
    arccos(args) {
        if (args.length !== 1) {
            return `arccos(${args.join(", ")})`;
        }
        return `Math.acos(${args[0]})`;
    },
    arctan(args) {
        if (args.length !== 1) {
            return `arctan(${args.join(", ")})`;
        }
        return `Math.atan(${args[0]})`;
    },
    arctan2(args) {
        if (args.length !== 2) {
            return `arctan2(${args.join(", ")})`;
        }
        return `Math.atan2(${args[0]}, ${args[1]})`;
    },
    degtorad(args) {
        if (args.length !== 1) {
            return `degtorad(${args.join(", ")})`;
        }
        return `((${args[0]}) * Math.PI / 180)`;
    },
    radtodeg(args) {
        if (args.length !== 1) {
            return `radtodeg(${args.join(", ")})`;
        }
        return `((${args[0]}) * 180 / Math.PI)`;
    },
    sign(args) {
        if (args.length !== 1) {
            return `sign(${args.join(", ")})`;
        }
        return `Math.sign(${args[0]})`;
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
