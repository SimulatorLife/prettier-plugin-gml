import { Core } from "@gml-modules/core";
import type { ParserContext, VisitorOptions, VisitorPayload } from "../types/index.js";
import {
    collectPrototypeMethodNames,
    collectVisitMethodNames,
    createWrapperSymbols,
    definePrototypeMethods,
    ensureHasInstancePatched
} from "./parse-tree-helpers.js";
import {
    getParseTreeVisitorPrototype,
    getParserVisitorBase,
    type ParserVisitorBaseConstructor,
    type ParserVisitorPrototype
} from "./generated-bindings.js";

const DEFAULT_VISIT_CHILDREN_DELEGATE = ({ fallback }: VisitorPayload) => fallback();

const GameMakerLanguageParserVisitorBase: ParserVisitorBaseConstructor = getParserVisitorBase();
const PARSE_TREE_VISITOR_PROTOTYPE: ParserVisitorPrototype = getParseTreeVisitorPrototype();

const { instance: WRAPPER_INSTANCE_MARKER, patchFlag: HAS_INSTANCE_PATCHED_MARKER } = createWrapperSymbols(
    "GameMakerLanguageParserVisitor"
);

// Methods exposed by antlr4's ParseTreeVisitor that we still need to provide on
// our compositional wrapper. We delegate to the original prototype so consumer
// code continues to observe the same behaviour without inheriting directly.
const INHERITED_METHOD_NAMES = Object.freeze(collectPrototypeMethodNames(PARSE_TREE_VISITOR_PROTOTYPE));

export const VISIT_METHOD_NAMES = Object.freeze(collectVisitMethodNames(GameMakerLanguageParserVisitorBase));

function callInheritedVisitChildren(instance: ParserVisitorPrototype, ctx: ParserContext) {
    return (
        PARSE_TREE_VISITOR_PROTOTYPE.visitChildren as (this: ParserVisitorPrototype, ctx: ParserContext) => unknown
    ).call(instance, ctx) as unknown;
}

ensureHasInstancePatched(GameMakerLanguageParserVisitorBase, {
    markerSymbol: WRAPPER_INSTANCE_MARKER,
    patchFlagSymbol: HAS_INSTANCE_PATCHED_MARKER
});

export default class GameMakerLanguageParserVisitor extends GameMakerLanguageParserVisitorBase {
    #visitChildrenDelegate: (payload: VisitorPayload) => unknown;

    constructor(options: VisitorOptions = {}) {
        super();
        const delegate = options?.visitChildrenDelegate;
        this.#visitChildrenDelegate = typeof delegate === "function" ? delegate : DEFAULT_VISIT_CHILDREN_DELEGATE;
        this[WRAPPER_INSTANCE_MARKER] = true;
    }

    _visitUsingDelegate(methodName: string, ctx: ParserContext) {
        return this.#visitChildrenDelegate({
            methodName,
            ctx,
            fallback: () => callInheritedVisitChildren(this, ctx)
        });
    }
}

definePrototypeMethods(GameMakerLanguageParserVisitor.prototype, INHERITED_METHOD_NAMES, (methodName: string) => {
    const inherited =
        typeof PARSE_TREE_VISITOR_PROTOTYPE[methodName] === "function"
            ? (PARSE_TREE_VISITOR_PROTOTYPE[methodName] as (
                  this: ParserVisitorPrototype,
                  ...args: unknown[]
              ) => unknown)
            : Core.noop;
    return function (this: GameMakerLanguageParserVisitor, ...args: unknown[]) {
        return inherited.call(this, ...args) as unknown;
    };
});

definePrototypeMethods(
    GameMakerLanguageParserVisitor.prototype,
    VISIT_METHOD_NAMES,
    (methodName: string) =>
        function (this: GameMakerLanguageParserVisitor, ctx: ParserContext) {
            return this._visitUsingDelegate(methodName, ctx);
        }
);
