import { GameMakerLanguageParserVisitorBase } from "../generated-bindings.js";

const DEFAULT_VISIT_CHILDREN_DELEGATE = ({ fallback }) => fallback();

const PARSE_TREE_VISITOR_PROTOTYPE = Object.getPrototypeOf(
    GameMakerLanguageParserVisitorBase.prototype
);

// Methods exposed by antlr4's ParseTreeVisitor that we still need to provide on
// our compositional wrapper. We delegate to the original prototype so consumer
// code continues to observe the same behaviour without inheriting directly.
const INHERITED_METHOD_NAMES = Object.freeze(
    Object.getOwnPropertyNames(PARSE_TREE_VISITOR_PROTOTYPE).filter(
        (name) =>
            name !== "constructor" &&
            typeof PARSE_TREE_VISITOR_PROTOTYPE[name] === "function"
    )
);

const WRAPPER_INSTANCE_MARKER = Symbol.for(
    "prettier.gml.GameMakerLanguageParserVisitor.wrapper"
);

const HAS_INSTANCE_PATCHED_MARKER = Symbol.for(
    "prettier.gml.GameMakerLanguageParserVisitor.hasInstancePatched"
);

// Generated parser code performs `instanceof GameMakerLanguageParserVisitor`
// checks against the original class. Mark wrapper instances with a dedicated
// symbol and teach the generated constructor to recognise those instances so we
// can compose behaviour without subclassing.
function ensureBaseHasInstancePatched(BaseVisitor) {
    if (BaseVisitor[HAS_INSTANCE_PATCHED_MARKER]) {
        return;
    }

    const originalHasInstance = BaseVisitor[Symbol.hasInstance];
    const basePrototype = BaseVisitor.prototype;

    Object.defineProperty(BaseVisitor, Symbol.hasInstance, {
        configurable: true,
        value(instance) {
            if (instance?.[WRAPPER_INSTANCE_MARKER]) {
                return true;
            }

            if (typeof originalHasInstance === "function") {
                return originalHasInstance.call(this, instance);
            }

            return basePrototype.isPrototypeOf(instance);
        }
    });

    BaseVisitor[HAS_INSTANCE_PATCHED_MARKER] = true;
}

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

function callInheritedVisitChildren(instance, ctx) {
    return PARSE_TREE_VISITOR_PROTOTYPE.visitChildren.call(instance, ctx);
}

ensureBaseHasInstancePatched(GameMakerLanguageParserVisitorBase);

export default class GameMakerLanguageParserVisitor {
    #visitChildrenDelegate;

    constructor(options = {}) {
        const delegate = options?.visitChildrenDelegate;
        this.#visitChildrenDelegate =
            typeof delegate === "function"
                ? delegate
                : DEFAULT_VISIT_CHILDREN_DELEGATE;
        this[WRAPPER_INSTANCE_MARKER] = true;
    }

    _visitUsingDelegate(methodName, ctx) {
        return this.#visitChildrenDelegate({
            methodName,
            ctx,
            fallback: () => callInheritedVisitChildren(this, ctx)
        });
    }
}

for (const methodName of INHERITED_METHOD_NAMES) {
    Object.defineProperty(
        GameMakerLanguageParserVisitor.prototype,
        methodName,
        {
            value(...args) {
                return PARSE_TREE_VISITOR_PROTOTYPE[methodName].apply(
                    this,
                    args
                );
            },
            writable: true,
            configurable: true
        }
    );
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
