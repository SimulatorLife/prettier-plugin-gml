import { default as GameMakerLanguageParserListenerBase } from "../../generated/GameMakerLanguageParserListener.js";
export declare const LISTENER_METHOD_NAMES: readonly any[];
export default class GameMakerLanguageParserListener extends GameMakerLanguageParserListenerBase {
    #private;
    constructor(options?: {});
    _dispatch(methodName: any, ctx: any): any;
}
