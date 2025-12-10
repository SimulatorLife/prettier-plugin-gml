import { createEnvConfiguredValueWithFallback } from "../../../utils/environment.js";
import { toFiniteNumber } from "../../../utils/number.js";

const DOC_COMMENT_MAX_WRAP_WIDTH_ENV_VAR =
    "PRETTIER_PLUGIN_GML_DOC_COMMENT_MAX_WRAP_WIDTH";
const DOC_COMMENT_MAX_WRAP_WIDTH_BASELINE = 100;
const MIN_DOC_COMMENT_WRAP_WIDTH = 1;

export const docCommentMaxWrapWidthConfig =
    createEnvConfiguredValueWithFallback({
        defaultValue: DOC_COMMENT_MAX_WRAP_WIDTH_BASELINE,
        envVar: DOC_COMMENT_MAX_WRAP_WIDTH_ENV_VAR,
        resolve: (raw) => {
            if (raw === "Infinity" || raw === Infinity) {
                return Infinity;
            }
            const num = toFiniteNumber(raw);
            return num !== null && num >= MIN_DOC_COMMENT_WRAP_WIDTH
                ? num
                : null;
        }
    });

export function resolveDocCommentWrapWidth(options: any) {
    const candidate = options?.docCommentMaxWrapWidth;
    if (typeof candidate === "number") {
        return candidate;
    }

    if (candidate === Infinity) {
        return Infinity;
    }

    return docCommentMaxWrapWidthConfig.get();
}
