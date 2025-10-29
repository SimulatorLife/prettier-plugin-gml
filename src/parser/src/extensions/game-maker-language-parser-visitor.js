import { GameMakerLanguageParserVisitorBase } from "../generated-bindings.js";

const DEFAULT_VISIT_CHILDREN_DELEGATE = ({ fallback }) => fallback();

function createVisitMethodList(BaseVisitor) {
    const prototype = BaseVisitor?.prototype ?? Object.prototype;
    return Object.getOwnPropertyNames(prototype).filter((name) => {
        if (!name.startsWith("visit")) {
            return false;
        }
        return (
            name !== "visit" &&
            name !== "visitChildren" &&
            name !== "visitTerminal" &&
            name !== "visitErrorNode"
        );
    });
}

export const VISIT_METHOD_NAMES = Object.freeze(
    createVisitMethodList(GameMakerLanguageParserVisitorBase)
);

export default class GameMakerLanguageParserVisitor extends GameMakerLanguageParserVisitorBase {
    #visitChildrenDelegate;

    constructor(options = {}) {
        super();
        const delegate = options?.visitChildrenDelegate;
        this.#visitChildrenDelegate =
            typeof delegate === "function"
                ? delegate
                : DEFAULT_VISIT_CHILDREN_DELEGATE;
    }

    _visitUsingDelegate(methodName, ctx) {
        return this.#visitChildrenDelegate({
            methodName,
            ctx,
            fallback: () => super.visitChildren(ctx)
        });
    }
}

for (const methodName of VISIT_METHOD_NAMES) {
    Object.defineProperty(
        GameMakerLanguageParserVisitor.prototype,
        methodName,
        {
            value(ctx) {
                return this._visitUsingDelegate(methodName, ctx);
            },
            writable: true,
            configurable: true
        }
    );
}
