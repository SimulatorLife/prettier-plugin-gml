export declare const ROOM_NAVIGATION_DIRECTION: Readonly<{
    NEXT: "next";
    PREVIOUS: "previous";
}>;
export declare function getRoomNavigationHelpers(direction: any): any;
export declare function preprocessSourceForFeatherFixes(sourceText: any):
    | {
          sourceText: any;
          metadata: any;
          indexAdjustments?: undefined;
      }
    | {
          sourceText: any;
          metadata: {};
          indexAdjustments: any;
      };
export declare function applyRemovedIndexAdjustments(
    target: any,
    adjustments: any
): void;
export declare function getFeatherDiagnosticFixers(): Map<any, any>;
export declare function applyFeatherFixes(
    ast: any,
    { sourceText, preprocessedFixMetadata, options }?: {}
): any;
