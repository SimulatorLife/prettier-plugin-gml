// Generated from GameMakerLanguageParser.g4 by ANTLR 4.12.0
// jshint ignore: start
import antlr4 from "antlr4";
import GameMakerLanguageParserVisitor from "./GameMakerLanguageParserVisitor.js";

const serializedATN = [4,1,114,678,2,0,7,0,2,1,7,1,2,2,7,2,2,3,7,3,2,4,7,
    4,2,5,7,5,2,6,7,6,2,7,7,7,2,8,7,8,2,9,7,9,2,10,7,10,2,11,7,11,2,12,7,12,
    2,13,7,13,2,14,7,14,2,15,7,15,2,16,7,16,2,17,7,17,2,18,7,18,2,19,7,19,2,
    20,7,20,2,21,7,21,2,22,7,22,2,23,7,23,2,24,7,24,2,25,7,25,2,26,7,26,2,27,
    7,27,2,28,7,28,2,29,7,29,2,30,7,30,2,31,7,31,2,32,7,32,2,33,7,33,2,34,7,
    34,2,35,7,35,2,36,7,36,2,37,7,37,2,38,7,38,2,39,7,39,2,40,7,40,2,41,7,41,
    2,42,7,42,2,43,7,43,2,44,7,44,2,45,7,45,2,46,7,46,2,47,7,47,2,48,7,48,2,
    49,7,49,2,50,7,50,2,51,7,51,2,52,7,52,2,53,7,53,2,54,7,54,2,55,7,55,2,56,
    7,56,2,57,7,57,2,58,7,58,2,59,7,59,2,60,7,60,2,61,7,61,2,62,7,62,2,63,7,
    63,2,64,7,64,2,65,7,65,2,66,7,66,1,0,3,0,136,8,0,1,0,1,0,1,1,4,1,141,8,1,
    11,1,12,1,142,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,
    2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,3,2,167,8,2,1,2,3,2,170,8,2,1,3,1,3,3,3,174,
    8,3,1,3,1,3,1,4,1,4,1,4,3,4,181,8,4,1,4,1,4,1,4,3,4,186,8,4,1,5,1,5,1,5,
    1,5,1,5,1,5,1,5,1,5,1,5,1,5,1,5,1,5,1,5,3,5,201,8,5,1,5,1,5,3,5,205,8,5,
    1,5,1,5,3,5,209,8,5,1,5,1,5,1,5,1,5,1,5,1,5,3,5,217,8,5,1,6,1,6,1,6,1,6,
    1,7,1,7,1,7,1,7,1,8,1,8,1,9,1,9,1,10,1,10,1,11,1,11,1,12,1,12,3,12,237,8,
    12,1,12,1,12,3,12,241,8,12,3,12,243,8,12,1,12,1,12,1,13,4,13,248,8,13,11,
    13,12,13,249,1,14,1,14,1,14,1,14,3,14,256,8,14,1,15,1,15,1,15,3,15,261,8,
    15,1,16,1,16,1,16,1,17,1,17,1,17,1,17,3,17,270,8,17,1,17,3,17,273,8,17,1,
    18,1,18,1,18,3,18,278,8,18,1,18,3,18,281,8,18,1,18,1,18,1,19,1,19,1,19,1,
    20,1,20,3,20,290,8,20,1,21,1,21,1,21,1,22,1,22,1,22,1,22,1,23,1,23,1,23,
    1,23,5,23,303,8,23,10,23,12,23,306,9,23,1,24,4,24,309,8,24,11,24,12,24,310,
    1,24,3,24,314,8,24,1,25,1,25,1,25,3,25,319,8,25,1,26,1,26,1,26,1,26,5,26,
    325,8,26,10,26,12,26,328,9,26,1,26,1,26,1,27,1,27,1,27,1,27,1,28,1,28,3,
    28,338,8,28,1,29,1,29,5,29,342,8,29,10,29,12,29,345,9,29,1,29,3,29,348,8,
    29,1,30,1,30,1,30,1,30,1,30,1,30,1,30,3,30,357,8,30,1,31,1,31,1,31,1,31,
    1,31,1,31,3,31,365,8,31,1,32,1,32,1,32,5,32,370,8,32,10,32,12,32,373,9,32,
    1,33,1,33,3,33,377,8,33,1,33,1,33,1,33,1,33,3,33,383,8,33,1,34,1,34,1,34,
    1,34,1,34,1,34,1,34,1,34,1,34,1,34,1,34,1,34,1,34,1,34,1,34,3,34,400,8,34,
    1,34,1,34,1,34,1,34,1,34,1,34,1,34,1,34,1,34,1,34,1,34,1,34,1,34,1,34,1,
    34,1,34,1,34,1,34,1,34,1,34,1,34,1,34,1,34,1,34,1,34,1,34,1,34,1,34,1,34,
    1,34,1,34,1,34,1,34,1,34,1,34,1,34,1,34,1,34,1,34,1,34,1,34,1,34,5,34,444,
    8,34,10,34,12,34,447,9,34,1,35,1,35,1,35,1,35,1,35,1,35,5,35,455,8,35,10,
    35,12,35,458,9,35,1,36,1,36,1,36,1,36,3,36,464,8,36,1,36,1,36,3,36,468,8,
    36,1,37,1,37,1,37,1,37,1,37,3,37,475,8,37,1,38,1,38,1,39,1,39,1,39,1,39,
    5,39,483,8,39,10,39,12,39,486,9,39,1,39,3,39,489,8,39,3,39,491,8,39,1,39,
    1,39,1,40,1,40,1,41,1,41,1,41,1,41,1,41,1,41,1,41,1,41,1,41,1,41,1,41,1,
    41,3,41,509,8,41,1,42,1,42,5,42,513,8,42,10,42,12,42,516,9,42,1,42,1,42,
    1,43,1,43,1,43,1,43,1,43,3,43,525,8,43,1,44,1,44,1,44,1,44,1,45,5,45,532,
    8,45,10,45,12,45,535,9,45,1,45,3,45,538,8,45,1,45,4,45,541,8,45,11,45,12,
    45,542,1,45,5,45,546,8,45,10,45,12,45,549,9,45,1,45,3,45,552,8,45,1,46,1,
    46,1,46,1,46,5,46,558,8,46,10,46,12,46,561,9,46,1,46,3,46,564,8,46,3,46,
    566,8,46,1,46,1,46,1,47,1,47,1,47,1,47,1,48,1,48,1,48,3,48,577,8,48,1,49,
    1,49,3,49,581,8,49,1,49,1,49,3,49,585,8,49,1,49,1,49,1,50,1,50,1,50,3,50,
    592,8,50,1,50,1,50,1,51,1,51,1,51,1,51,5,51,600,8,51,10,51,12,51,603,9,51,
    1,51,3,51,606,8,51,3,51,608,8,51,1,51,1,51,1,52,1,52,1,52,3,52,615,8,52,
    1,53,1,53,3,53,619,8,53,1,54,1,54,1,54,1,54,3,54,625,8,54,1,54,1,54,1,55,
    1,55,1,55,5,55,632,8,55,10,55,12,55,635,9,55,1,55,3,55,638,8,55,1,56,1,56,
    1,56,3,56,643,8,56,1,57,1,57,1,57,4,57,648,8,57,11,57,12,57,649,1,57,1,57,
    1,58,1,58,1,58,1,58,1,59,1,59,3,59,660,8,59,1,59,1,59,1,60,1,60,1,61,1,61,
    1,62,1,62,1,63,1,63,1,64,1,64,1,65,1,65,1,66,1,66,1,66,0,2,68,70,67,0,2,
    4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36,38,40,42,44,46,48,50,52,
    54,56,58,60,62,64,66,68,70,72,74,76,78,80,82,84,86,88,90,92,94,96,98,100,
    102,104,106,108,110,112,114,116,118,120,122,124,126,128,130,132,0,15,1,0,
    28,31,1,0,24,25,1,0,36,37,2,0,19,19,42,43,1,0,38,41,1,0,22,23,1,0,3,8,3,
    0,19,19,35,35,50,59,2,0,66,66,68,69,1,1,108,108,1,1,111,111,1,0,101,102,
    2,0,12,12,15,15,2,0,14,14,16,16,4,0,3,97,99,99,103,106,112,114,733,0,135,
    1,0,0,0,2,140,1,0,0,0,4,166,1,0,0,0,6,171,1,0,0,0,8,177,1,0,0,0,10,216,1,
    0,0,0,12,218,1,0,0,0,14,222,1,0,0,0,16,226,1,0,0,0,18,228,1,0,0,0,20,230,
    1,0,0,0,22,232,1,0,0,0,24,234,1,0,0,0,26,247,1,0,0,0,28,251,1,0,0,0,30,257,
    1,0,0,0,32,262,1,0,0,0,34,265,1,0,0,0,36,274,1,0,0,0,38,284,1,0,0,0,40,287,
    1,0,0,0,42,291,1,0,0,0,44,294,1,0,0,0,46,298,1,0,0,0,48,313,1,0,0,0,50,315,
    1,0,0,0,52,320,1,0,0,0,54,331,1,0,0,0,56,337,1,0,0,0,58,339,1,0,0,0,60,356,
    1,0,0,0,62,364,1,0,0,0,64,366,1,0,0,0,66,382,1,0,0,0,68,399,1,0,0,0,70,448,
    1,0,0,0,72,467,1,0,0,0,74,474,1,0,0,0,76,476,1,0,0,0,78,478,1,0,0,0,80,494,
    1,0,0,0,82,508,1,0,0,0,84,510,1,0,0,0,86,524,1,0,0,0,88,526,1,0,0,0,90,533,
    1,0,0,0,92,553,1,0,0,0,94,569,1,0,0,0,96,576,1,0,0,0,98,578,1,0,0,0,100,
    591,1,0,0,0,102,595,1,0,0,0,104,611,1,0,0,0,106,618,1,0,0,0,108,620,1,0,
    0,0,110,628,1,0,0,0,112,639,1,0,0,0,114,644,1,0,0,0,116,653,1,0,0,0,118,
    657,1,0,0,0,120,663,1,0,0,0,122,665,1,0,0,0,124,667,1,0,0,0,126,669,1,0,
    0,0,128,671,1,0,0,0,130,673,1,0,0,0,132,675,1,0,0,0,134,136,3,2,1,0,135,
    134,1,0,0,0,135,136,1,0,0,0,136,137,1,0,0,0,137,138,5,0,0,1,138,1,1,0,0,
    0,139,141,3,4,2,0,140,139,1,0,0,0,141,142,1,0,0,0,142,140,1,0,0,0,142,143,
    1,0,0,0,143,3,1,0,0,0,144,167,3,6,3,0,145,167,3,22,11,0,146,167,3,8,4,0,
    147,167,3,46,23,0,148,167,3,10,5,0,149,167,3,16,8,0,150,167,3,18,9,0,151,
    167,3,40,20,0,152,167,3,12,6,0,153,167,3,14,7,0,154,167,3,34,17,0,155,167,
    3,32,16,0,156,167,3,20,10,0,157,167,3,114,57,0,158,167,3,116,58,0,159,167,
    3,118,59,0,160,167,3,108,54,0,161,167,3,52,26,0,162,167,3,44,22,0,163,167,
    3,74,37,0,164,167,3,70,35,0,165,167,3,98,49,0,166,144,1,0,0,0,166,145,1,
    0,0,0,166,146,1,0,0,0,166,147,1,0,0,0,166,148,1,0,0,0,166,149,1,0,0,0,166,
    150,1,0,0,0,166,151,1,0,0,0,166,152,1,0,0,0,166,153,1,0,0,0,166,154,1,0,
    0,0,166,155,1,0,0,0,166,156,1,0,0,0,166,157,1,0,0,0,166,158,1,0,0,0,166,
    159,1,0,0,0,166,160,1,0,0,0,166,161,1,0,0,0,166,162,1,0,0,0,166,163,1,0,
    0,0,166,164,1,0,0,0,166,165,1,0,0,0,167,169,1,0,0,0,168,170,3,130,65,0,169,
    168,1,0,0,0,169,170,1,0,0,0,170,5,1,0,0,0,171,173,3,126,63,0,172,174,3,2,
    1,0,173,172,1,0,0,0,173,174,1,0,0,0,174,175,1,0,0,0,175,176,3,128,64,0,176,
    7,1,0,0,0,177,178,5,90,0,0,178,180,3,68,34,0,179,181,5,91,0,0,180,179,1,
    0,0,0,180,181,1,0,0,0,181,182,1,0,0,0,182,185,3,4,2,0,183,184,5,74,0,0,184,
    186,3,4,2,0,185,183,1,0,0,0,185,186,1,0,0,0,186,9,1,0,0,0,187,188,5,72,0,
    0,188,189,3,4,2,0,189,190,5,85,0,0,190,191,3,68,34,0,191,217,1,0,0,0,192,
    193,5,84,0,0,193,194,3,68,34,0,194,195,3,4,2,0,195,217,1,0,0,0,196,197,5,
    82,0,0,197,200,5,10,0,0,198,201,3,46,23,0,199,201,3,44,22,0,200,198,1,0,
    0,0,200,199,1,0,0,0,200,201,1,0,0,0,201,202,1,0,0,0,202,204,5,17,0,0,203,
    205,3,68,34,0,204,203,1,0,0,0,204,205,1,0,0,0,205,206,1,0,0,0,206,208,5,
    17,0,0,207,209,3,4,2,0,208,207,1,0,0,0,208,209,1,0,0,0,209,210,1,0,0,0,210,
    211,5,11,0,0,211,217,3,4,2,0,212,213,5,86,0,0,213,214,3,68,34,0,214,215,
    3,4,2,0,215,217,1,0,0,0,216,187,1,0,0,0,216,192,1,0,0,0,216,196,1,0,0,0,
    216,212,1,0,0,0,217,11,1,0,0,0,218,219,5,88,0,0,219,220,3,68,34,0,220,221,
    3,4,2,0,221,13,1,0,0,0,222,223,5,83,0,0,223,224,3,68,34,0,224,225,3,24,12,
    0,225,15,1,0,0,0,226,227,5,81,0,0,227,17,1,0,0,0,228,229,5,70,0,0,229,19,
    1,0,0,0,230,231,5,71,0,0,231,21,1,0,0,0,232,233,5,17,0,0,233,23,1,0,0,0,
    234,236,3,126,63,0,235,237,3,26,13,0,236,235,1,0,0,0,236,237,1,0,0,0,237,
    242,1,0,0,0,238,240,3,30,15,0,239,241,3,26,13,0,240,239,1,0,0,0,240,241,
    1,0,0,0,241,243,1,0,0,0,242,238,1,0,0,0,242,243,1,0,0,0,243,244,1,0,0,0,
    244,245,3,128,64,0,245,25,1,0,0,0,246,248,3,28,14,0,247,246,1,0,0,0,248,
    249,1,0,0,0,249,247,1,0,0,0,249,250,1,0,0,0,250,27,1,0,0,0,251,252,5,73,
    0,0,252,253,3,68,34,0,253,255,5,20,0,0,254,256,3,2,1,0,255,254,1,0,0,0,255,
    256,1,0,0,0,256,29,1,0,0,0,257,258,5,89,0,0,258,260,5,20,0,0,259,261,3,2,
    1,0,260,259,1,0,0,0,260,261,1,0,0,0,261,31,1,0,0,0,262,263,5,92,0,0,263,
    264,3,68,34,0,264,33,1,0,0,0,265,266,5,94,0,0,266,272,3,4,2,0,267,269,3,
    36,18,0,268,270,3,38,19,0,269,268,1,0,0,0,269,270,1,0,0,0,270,273,1,0,0,
    0,271,273,3,38,19,0,272,267,1,0,0,0,272,271,1,0,0,0,273,35,1,0,0,0,274,280,
    5,78,0,0,275,277,5,10,0,0,276,278,3,106,53,0,277,276,1,0,0,0,277,278,1,0,
    0,0,278,279,1,0,0,0,279,281,5,11,0,0,280,275,1,0,0,0,280,281,1,0,0,0,281,
    282,1,0,0,0,282,283,3,4,2,0,283,37,1,0,0,0,284,285,5,79,0,0,285,286,3,4,
    2,0,286,39,1,0,0,0,287,289,5,80,0,0,288,290,3,68,34,0,289,288,1,0,0,0,289,
    290,1,0,0,0,290,41,1,0,0,0,291,292,5,93,0,0,292,293,3,68,34,0,293,43,1,0,
    0,0,294,295,3,58,29,0,295,296,3,80,40,0,296,297,3,66,33,0,297,45,1,0,0,0,
    298,299,3,48,24,0,299,304,3,50,25,0,300,301,5,18,0,0,301,303,3,50,25,0,302,
    300,1,0,0,0,303,306,1,0,0,0,304,302,1,0,0,0,304,305,1,0,0,0,305,47,1,0,0,
    0,306,304,1,0,0,0,307,309,5,76,0,0,308,307,1,0,0,0,309,310,1,0,0,0,310,308,
    1,0,0,0,310,311,1,0,0,0,311,314,1,0,0,0,312,314,5,97,0,0,313,308,1,0,0,0,
    313,312,1,0,0,0,314,49,1,0,0,0,315,318,3,106,53,0,316,317,5,19,0,0,317,319,
    3,66,33,0,318,316,1,0,0,0,318,319,1,0,0,0,319,51,1,0,0,0,320,321,5,77,0,
    0,321,326,3,106,53,0,322,323,5,18,0,0,323,325,3,106,53,0,324,322,1,0,0,0,
    325,328,1,0,0,0,326,324,1,0,0,0,326,327,1,0,0,0,327,329,1,0,0,0,328,326,
    1,0,0,0,329,330,5,17,0,0,330,53,1,0,0,0,331,332,5,75,0,0,332,333,3,106,53,
    0,333,334,3,78,39,0,334,55,1,0,0,0,335,338,3,106,53,0,336,338,3,54,27,0,
    337,335,1,0,0,0,337,336,1,0,0,0,338,57,1,0,0,0,339,347,3,56,28,0,340,342,
    3,60,30,0,341,340,1,0,0,0,342,345,1,0,0,0,343,341,1,0,0,0,343,344,1,0,0,
    0,344,346,1,0,0,0,345,343,1,0,0,0,346,348,3,62,31,0,347,343,1,0,0,0,347,
    348,1,0,0,0,348,59,1,0,0,0,349,350,3,76,38,0,350,351,3,64,32,0,351,352,5,
    9,0,0,352,357,1,0,0,0,353,354,5,21,0,0,354,357,3,106,53,0,355,357,3,78,39,
    0,356,349,1,0,0,0,356,353,1,0,0,0,356,355,1,0,0,0,357,61,1,0,0,0,358,359,
    3,76,38,0,359,360,3,64,32,0,360,361,5,9,0,0,361,365,1,0,0,0,362,363,5,21,
    0,0,363,365,3,106,53,0,364,358,1,0,0,0,364,362,1,0,0,0,365,63,1,0,0,0,366,
    371,3,68,34,0,367,368,5,18,0,0,368,370,3,68,34,0,369,367,1,0,0,0,370,373,
    1,0,0,0,371,369,1,0,0,0,371,372,1,0,0,0,372,65,1,0,0,0,373,371,1,0,0,0,374,
    377,3,68,34,0,375,377,3,98,49,0,376,374,1,0,0,0,376,375,1,0,0,0,377,383,
    1,0,0,0,378,379,5,10,0,0,379,380,3,66,33,0,380,381,5,11,0,0,381,383,1,0,
    0,0,382,376,1,0,0,0,382,378,1,0,0,0,383,67,1,0,0,0,384,385,6,34,-1,0,385,
    400,3,74,37,0,386,400,3,58,29,0,387,400,3,70,35,0,388,389,5,25,0,0,389,400,
    3,68,34,18,390,391,5,26,0,0,391,400,3,68,34,17,392,393,5,27,0,0,393,400,
    3,68,34,16,394,400,3,82,41,0,395,396,5,10,0,0,396,397,3,68,34,0,397,398,
    5,11,0,0,398,400,1,0,0,0,399,384,1,0,0,0,399,386,1,0,0,0,399,387,1,0,0,0,
    399,388,1,0,0,0,399,390,1,0,0,0,399,392,1,0,0,0,399,394,1,0,0,0,399,395,
    1,0,0,0,400,445,1,0,0,0,401,402,10,15,0,0,402,403,7,0,0,0,403,444,3,68,34,
    16,404,405,10,14,0,0,405,406,7,1,0,0,406,444,3,68,34,15,407,408,10,13,0,
    0,408,409,5,34,0,0,409,444,3,68,34,14,410,411,10,12,0,0,411,412,7,2,0,0,
    412,444,3,68,34,13,413,414,10,11,0,0,414,415,5,48,0,0,415,444,3,68,34,12,
    416,417,10,10,0,0,417,418,5,47,0,0,418,444,3,68,34,11,419,420,10,9,0,0,420,
    421,5,49,0,0,421,444,3,68,34,10,422,423,10,8,0,0,423,424,7,3,0,0,424,444,
    3,68,34,9,425,426,10,7,0,0,426,427,7,4,0,0,427,444,3,68,34,8,428,429,10,
    6,0,0,429,430,5,44,0,0,430,444,3,68,34,7,431,432,10,5,0,0,432,433,5,46,0,
    0,433,444,3,68,34,6,434,435,10,4,0,0,435,436,5,45,0,0,436,444,3,68,34,5,
    437,438,10,3,0,0,438,439,5,33,0,0,439,440,3,68,34,0,440,441,5,20,0,0,441,
    442,3,68,34,4,442,444,1,0,0,0,443,401,1,0,0,0,443,404,1,0,0,0,443,407,1,
    0,0,0,443,410,1,0,0,0,443,413,1,0,0,0,443,416,1,0,0,0,443,419,1,0,0,0,443,
    422,1,0,0,0,443,425,1,0,0,0,443,428,1,0,0,0,443,431,1,0,0,0,443,434,1,0,
    0,0,443,437,1,0,0,0,444,447,1,0,0,0,445,443,1,0,0,0,445,446,1,0,0,0,446,
    69,1,0,0,0,447,445,1,0,0,0,448,449,6,35,-1,0,449,450,3,72,36,0,450,451,3,
    78,39,0,451,456,1,0,0,0,452,453,10,1,0,0,453,455,3,78,39,0,454,452,1,0,0,
    0,455,458,1,0,0,0,456,454,1,0,0,0,456,457,1,0,0,0,457,71,1,0,0,0,458,456,
    1,0,0,0,459,468,3,58,29,0,460,463,5,10,0,0,461,464,3,98,49,0,462,464,3,72,
    36,0,463,461,1,0,0,0,463,462,1,0,0,0,464,465,1,0,0,0,465,466,5,11,0,0,466,
    468,1,0,0,0,467,459,1,0,0,0,467,460,1,0,0,0,468,73,1,0,0,0,469,470,7,5,0,
    0,470,475,3,58,29,0,471,472,3,58,29,0,472,473,7,5,0,0,473,475,1,0,0,0,474,
    469,1,0,0,0,474,471,1,0,0,0,475,75,1,0,0,0,476,477,7,6,0,0,477,77,1,0,0,
    0,478,490,5,10,0,0,479,484,3,66,33,0,480,481,5,18,0,0,481,483,3,66,33,0,
    482,480,1,0,0,0,483,486,1,0,0,0,484,482,1,0,0,0,484,485,1,0,0,0,485,488,
    1,0,0,0,486,484,1,0,0,0,487,489,5,18,0,0,488,487,1,0,0,0,488,489,1,0,0,0,
    489,491,1,0,0,0,490,479,1,0,0,0,490,491,1,0,0,0,491,492,1,0,0,0,492,493,
    5,11,0,0,493,79,1,0,0,0,494,495,7,7,0,0,495,81,1,0,0,0,496,509,5,63,0,0,
    497,509,5,64,0,0,498,509,5,65,0,0,499,509,5,104,0,0,500,509,5,106,0,0,501,
    509,3,84,42,0,502,509,5,69,0,0,503,509,5,68,0,0,504,509,5,67,0,0,505,509,
    5,66,0,0,506,509,3,88,44,0,507,509,3,92,46,0,508,496,1,0,0,0,508,497,1,0,
    0,0,508,498,1,0,0,0,508,499,1,0,0,0,508,500,1,0,0,0,508,501,1,0,0,0,508,
    502,1,0,0,0,508,503,1,0,0,0,508,504,1,0,0,0,508,505,1,0,0,0,508,506,1,0,
    0,0,508,507,1,0,0,0,509,83,1,0,0,0,510,514,5,105,0,0,511,513,3,86,43,0,512,
    511,1,0,0,0,513,516,1,0,0,0,514,512,1,0,0,0,514,515,1,0,0,0,515,517,1,0,
    0,0,516,514,1,0,0,0,517,518,5,112,0,0,518,85,1,0,0,0,519,525,5,114,0,0,520,
    521,5,113,0,0,521,522,3,68,34,0,522,523,5,13,0,0,523,525,1,0,0,0,524,519,
    1,0,0,0,524,520,1,0,0,0,525,87,1,0,0,0,526,527,5,3,0,0,527,528,3,90,45,0,
    528,529,5,9,0,0,529,89,1,0,0,0,530,532,5,18,0,0,531,530,1,0,0,0,532,535,
    1,0,0,0,533,531,1,0,0,0,533,534,1,0,0,0,534,537,1,0,0,0,535,533,1,0,0,0,
    536,538,3,66,33,0,537,536,1,0,0,0,537,538,1,0,0,0,538,547,1,0,0,0,539,541,
    5,18,0,0,540,539,1,0,0,0,541,542,1,0,0,0,542,540,1,0,0,0,542,543,1,0,0,0,
    543,544,1,0,0,0,544,546,3,66,33,0,545,540,1,0,0,0,546,549,1,0,0,0,547,545,
    1,0,0,0,547,548,1,0,0,0,548,551,1,0,0,0,549,547,1,0,0,0,550,552,5,18,0,0,
    551,550,1,0,0,0,551,552,1,0,0,0,552,91,1,0,0,0,553,565,3,126,63,0,554,559,
    3,94,47,0,555,556,5,18,0,0,556,558,3,94,47,0,557,555,1,0,0,0,558,561,1,0,
    0,0,559,557,1,0,0,0,559,560,1,0,0,0,560,563,1,0,0,0,561,559,1,0,0,0,562,
    564,5,18,0,0,563,562,1,0,0,0,563,564,1,0,0,0,564,566,1,0,0,0,565,554,1,0,
    0,0,565,566,1,0,0,0,566,567,1,0,0,0,567,568,3,128,64,0,568,93,1,0,0,0,569,
    570,3,96,48,0,570,571,5,20,0,0,571,572,3,66,33,0,572,95,1,0,0,0,573,577,
    5,103,0,0,574,577,3,122,61,0,575,577,3,124,62,0,576,573,1,0,0,0,576,574,
    1,0,0,0,576,575,1,0,0,0,577,97,1,0,0,0,578,580,5,87,0,0,579,581,5,103,0,
    0,580,579,1,0,0,0,580,581,1,0,0,0,581,582,1,0,0,0,582,584,3,102,51,0,583,
    585,3,100,50,0,584,583,1,0,0,0,584,585,1,0,0,0,585,586,1,0,0,0,586,587,3,
    6,3,0,587,99,1,0,0,0,588,589,5,20,0,0,589,590,5,103,0,0,590,592,3,102,51,
    0,591,588,1,0,0,0,591,592,1,0,0,0,592,593,1,0,0,0,593,594,5,96,0,0,594,101,
    1,0,0,0,595,607,5,10,0,0,596,601,3,104,52,0,597,598,5,18,0,0,598,600,3,104,
    52,0,599,597,1,0,0,0,600,603,1,0,0,0,601,599,1,0,0,0,601,602,1,0,0,0,602,
    605,1,0,0,0,603,601,1,0,0,0,604,606,5,18,0,0,605,604,1,0,0,0,605,606,1,0,
    0,0,606,608,1,0,0,0,607,596,1,0,0,0,607,608,1,0,0,0,608,609,1,0,0,0,609,
    610,5,11,0,0,610,103,1,0,0,0,611,614,3,106,53,0,612,613,5,19,0,0,613,615,
    3,66,33,0,614,612,1,0,0,0,614,615,1,0,0,0,615,105,1,0,0,0,616,619,5,103,
    0,0,617,619,3,122,61,0,618,616,1,0,0,0,618,617,1,0,0,0,619,107,1,0,0,0,620,
    621,5,95,0,0,621,622,3,106,53,0,622,624,3,126,63,0,623,625,3,110,55,0,624,
    623,1,0,0,0,624,625,1,0,0,0,625,626,1,0,0,0,626,627,3,128,64,0,627,109,1,
    0,0,0,628,633,3,112,56,0,629,630,5,18,0,0,630,632,3,112,56,0,631,629,1,0,
    0,0,632,635,1,0,0,0,633,631,1,0,0,0,633,634,1,0,0,0,634,637,1,0,0,0,635,
    633,1,0,0,0,636,638,5,18,0,0,637,636,1,0,0,0,637,638,1,0,0,0,638,111,1,0,
    0,0,639,642,3,106,53,0,640,641,5,19,0,0,641,643,7,8,0,0,642,640,1,0,0,0,
    642,643,1,0,0,0,643,113,1,0,0,0,644,645,5,98,0,0,645,647,3,106,53,0,646,
    648,3,132,66,0,647,646,1,0,0,0,648,649,1,0,0,0,649,647,1,0,0,0,649,650,1,
    0,0,0,650,651,1,0,0,0,651,652,7,9,0,0,652,115,1,0,0,0,653,654,5,100,0,0,
    654,655,5,110,0,0,655,656,7,10,0,0,656,117,1,0,0,0,657,659,7,11,0,0,658,
    660,5,110,0,0,659,658,1,0,0,0,659,660,1,0,0,0,660,661,1,0,0,0,661,662,7,
    10,0,0,662,119,1,0,0,0,663,664,3,106,53,0,664,121,1,0,0,0,665,666,5,96,0,
    0,666,123,1,0,0,0,667,668,5,64,0,0,668,125,1,0,0,0,669,670,7,12,0,0,670,
    127,1,0,0,0,671,672,7,13,0,0,672,129,1,0,0,0,673,674,5,17,0,0,674,131,1,
    0,0,0,675,676,7,14,0,0,676,133,1,0,0,0,71,135,142,166,169,173,180,185,200,
    204,208,216,236,240,242,249,255,260,269,272,277,280,289,304,310,313,318,
    326,337,343,347,356,364,371,376,382,399,443,445,456,463,467,474,484,488,
    490,508,514,524,533,537,542,547,551,559,563,565,576,580,584,591,601,605,
    607,614,618,624,633,637,642,649,659];


const atn = new antlr4.atn.ATNDeserializer().deserialize(serializedATN);

const decisionsToDFA = atn.decisionToState.map( (ds, index) => new antlr4.dfa.DFA(ds, index) );

const sharedContextCache = new antlr4.atn.PredictionContextCache();

export default class GameMakerLanguageParser extends antlr4.Parser {

    static grammarFileName = "GameMakerLanguageParser.g4";
    static literalNames = [ null, null, null, "'['", "'[|'", "'[?'", "'[#'", 
        "'[@'", "'[$'", "']'", "'('", "')'", null, null, 
        "'}'", "'begin'", "'end'", "';'", "','", null, 
        "':'", "'.'", "'++'", "'--'", "'+'", "'-'", 
        "'~'", null, "'*'", "'/'", "'div'", null, "'**'", 
        "'?'", "'??'", "'??='", "'>>'", "'<<'", "'<'", 
        "'>'", "'<='", "'>='", "'=='", null, "'&'", 
        "'^'", "'|'", null, null, null, "'*='", "'/='", 
        "'+='", "'-='", "'%='", "'<<='", "'>>='", "'&='", 
        "'^='", "'|='", "'#'", "'$'", "'@'", "'undefined'", 
        "'noone'", null, null, null, null, null, "'break'", 
        "'exit'", "'do'", "'case'", "'else'", "'new'", 
        "'var'", "'globalvar'", "'catch'", "'finally'", 
        "'return'", "'continue'", "'for'", "'switch'", 
        "'while'", "'until'", "'repeat'", "'function'", 
        "'with'", "'default'", "'if'", "'then'", "'throw'", 
        "'delete'", "'try'", "'enum'", "'constructor'", 
        "'static'", "'#macro'", "'\\'", "'#define'", 
        "'#region'", "'#endregion'" ];
    static symbolicNames = [ null, "MultiLineComment", "SingleLineComment", 
        "OpenBracket", "ListAccessor", "MapAccessor", 
        "GridAccessor", "ArrayAccessor", "StructAccessor", 
        "CloseBracket", "OpenParen", "CloseParen", 
        "OpenBrace", "TemplateStringEndExpression", 
        "CloseBrace", "Begin", "End", "SemiColon", 
        "Comma", "Assign", "Colon", "Dot", "PlusPlus", 
        "MinusMinus", "Plus", "Minus", "BitNot", "Not", 
        "Multiply", "Divide", "IntegerDivide", "Modulo", 
        "Power", "QuestionMark", "NullCoalesce", "NullCoalescingAssign", 
        "RightShiftArithmetic", "LeftShiftArithmetic", 
        "LessThan", "MoreThan", "LessThanEquals", "GreaterThanEquals", 
        "Equals_", "NotEquals", "BitAnd", "BitXOr", 
        "BitOr", "And", "Or", "Xor", "MultiplyAssign", 
        "DivideAssign", "PlusAssign", "MinusAssign", 
        "ModulusAssign", "LeftShiftArithmeticAssign", 
        "RightShiftArithmeticAssign", "BitAndAssign", 
        "BitXorAssign", "BitOrAssign", "NumberSign", 
        "DollarSign", "AtSign", "UndefinedLiteral", 
        "NoOneLiteral", "BooleanLiteral", "IntegerLiteral", 
        "DecimalLiteral", "BinaryLiteral", "HexIntegerLiteral", 
        "Break", "Exit", "Do", "Case", "Else", "New", 
        "Var", "GlobalVar", "Catch", "Finally", "Return", 
        "Continue", "For", "Switch", "While", "Until", 
        "Repeat", "Function_", "With", "Default", "If", 
        "Then", "Throw", "Delete", "Try", "Enum", "Constructor", 
        "Static", "Macro", "EscapedNewLine", "Define", 
        "Region", "EndRegion", "Identifier", "StringLiteral", 
        "TemplateStringStart", "VerbatimStringLiteral", 
        "WhiteSpaces", "LineTerminator", "UnexpectedCharacter", 
        "RegionCharacters", "RegionEOL", "TemplateStringEnd", 
        "TemplateStringStartExpression", "TemplateStringText" ];
    static ruleNames = [ "program", "statementList", "statement", "block", 
        "ifStatement", "iterationStatement", "withStatement", 
        "switchStatement", "continueStatement", "breakStatement", 
        "exitStatement", "emptyStatement", "caseBlock", 
        "caseClauses", "caseClause", "defaultClause", "throwStatement", 
        "tryStatement", "catchProduction", "finallyProduction", 
        "returnStatement", "deleteStatement", "assignmentExpression", 
        "variableDeclarationList", "varModifier", "variableDeclaration", 
        "globalVarStatement", "newExpression", "lValueStartExpression", 
        "lValueExpression", "lValueChainOperator", "lValueFinalOperator", 
        "expressionSequence", "expressionOrFunction", "expression", 
        "callStatement", "callableExpression", "incDecStatement", 
        "accessor", "arguments", "assignmentOperator", 
        "literal", "templateStringLiteral", "templateStringAtom", 
        "arrayLiteral", "elementList", "structLiteral", 
        "propertyAssignment", "propertyIdentifier", "functionDeclaration", 
        "constructorClause", "parameterList", "parameterArgument", 
        "identifier", "enumeratorDeclaration", "enumeratorList", 
        "enumerator", "macroStatement", "defineStatement", 
        "regionStatement", "identifierStatement", "softKeyword", 
        "propertySoftKeyword", "openBlock", "closeBlock", 
        "eos", "macroToken" ];

    constructor(input) {
        super(input);
        this._interp = new antlr4.atn.ParserATNSimulator(this, atn, decisionsToDFA, sharedContextCache);
        this.ruleNames = GameMakerLanguageParser.ruleNames;
        this.literalNames = GameMakerLanguageParser.literalNames;
        this.symbolicNames = GameMakerLanguageParser.symbolicNames;
    }

    sempred(localctx, ruleIndex, predIndex) {
    	switch(ruleIndex) {
    	case 34:
    	    		return this.expression_sempred(localctx, predIndex);
    	case 35:
    	    		return this.callStatement_sempred(localctx, predIndex);
            default:
                throw "No predicate with index:" + ruleIndex;
        }
    }

    expression_sempred(localctx, predIndex) {
    	switch(predIndex) {
    		case 0:
    			return this.precpred(this._ctx, 15);
    		case 1:
    			return this.precpred(this._ctx, 14);
    		case 2:
    			return this.precpred(this._ctx, 13);
    		case 3:
    			return this.precpred(this._ctx, 12);
    		case 4:
    			return this.precpred(this._ctx, 11);
    		case 5:
    			return this.precpred(this._ctx, 10);
    		case 6:
    			return this.precpred(this._ctx, 9);
    		case 7:
    			return this.precpred(this._ctx, 8);
    		case 8:
    			return this.precpred(this._ctx, 7);
    		case 9:
    			return this.precpred(this._ctx, 6);
    		case 10:
    			return this.precpred(this._ctx, 5);
    		case 11:
    			return this.precpred(this._ctx, 4);
    		case 12:
    			return this.precpred(this._ctx, 3);
    		default:
    			throw "No predicate with index:" + predIndex;
    	}
    }

    callStatement_sempred(localctx, predIndex) {
    	switch(predIndex) {
    		case 13:
    			return this.precpred(this._ctx, 1);
    		default:
    			throw "No predicate with index:" + predIndex;
    	}
    }




    program() {
	    let localctx = new ProgramContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 0, GameMakerLanguageParser.RULE_program);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 135;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if((((_la) & ~0x1f) === 0 && ((1 << _la) & 12751872) !== 0) || ((((_la - 70)) & ~0x1f) === 0 && ((1 << (_la - 70)) & 3747052775) !== 0) || _la===102 || _la===103) {
	            this.state = 134;
	            this.statementList();
	        }

	        this.state = 137;
	        this.match(GameMakerLanguageParser.EOF);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    statementList() {
	    let localctx = new StatementListContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 2, GameMakerLanguageParser.RULE_statementList);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 140; 
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        do {
	            this.state = 139;
	            this.statement();
	            this.state = 142; 
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	        } while((((_la) & ~0x1f) === 0 && ((1 << _la) & 12751872) !== 0) || ((((_la - 70)) & ~0x1f) === 0 && ((1 << (_la - 70)) & 3747052775) !== 0) || _la===102 || _la===103);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    statement() {
	    let localctx = new StatementContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 4, GameMakerLanguageParser.RULE_statement);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 166;
	        this._errHandler.sync(this);
	        var la_ = this._interp.adaptivePredict(this._input,2,this._ctx);
	        switch(la_) {
	        case 1:
	            this.state = 144;
	            this.block();
	            break;

	        case 2:
	            this.state = 145;
	            this.emptyStatement();
	            break;

	        case 3:
	            this.state = 146;
	            this.ifStatement();
	            break;

	        case 4:
	            this.state = 147;
	            this.variableDeclarationList();
	            break;

	        case 5:
	            this.state = 148;
	            this.iterationStatement();
	            break;

	        case 6:
	            this.state = 149;
	            this.continueStatement();
	            break;

	        case 7:
	            this.state = 150;
	            this.breakStatement();
	            break;

	        case 8:
	            this.state = 151;
	            this.returnStatement();
	            break;

	        case 9:
	            this.state = 152;
	            this.withStatement();
	            break;

	        case 10:
	            this.state = 153;
	            this.switchStatement();
	            break;

	        case 11:
	            this.state = 154;
	            this.tryStatement();
	            break;

	        case 12:
	            this.state = 155;
	            this.throwStatement();
	            break;

	        case 13:
	            this.state = 156;
	            this.exitStatement();
	            break;

	        case 14:
	            this.state = 157;
	            this.macroStatement();
	            break;

	        case 15:
	            this.state = 158;
	            this.defineStatement();
	            break;

	        case 16:
	            this.state = 159;
	            this.regionStatement();
	            break;

	        case 17:
	            this.state = 160;
	            this.enumeratorDeclaration();
	            break;

	        case 18:
	            this.state = 161;
	            this.globalVarStatement();
	            break;

	        case 19:
	            this.state = 162;
	            this.assignmentExpression();
	            break;

	        case 20:
	            this.state = 163;
	            this.incDecStatement();
	            break;

	        case 21:
	            this.state = 164;
	            this.callStatement(0);
	            break;

	        case 22:
	            this.state = 165;
	            this.functionDeclaration();
	            break;

	        }
	        this.state = 169;
	        this._errHandler.sync(this);
	        var la_ = this._interp.adaptivePredict(this._input,3,this._ctx);
	        if(la_===1) {
	            this.state = 168;
	            this.eos();

	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    block() {
	    let localctx = new BlockContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 6, GameMakerLanguageParser.RULE_block);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 171;
	        this.openBlock();
	        this.state = 173;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if((((_la) & ~0x1f) === 0 && ((1 << _la) & 12751872) !== 0) || ((((_la - 70)) & ~0x1f) === 0 && ((1 << (_la - 70)) & 3747052775) !== 0) || _la===102 || _la===103) {
	            this.state = 172;
	            this.statementList();
	        }

	        this.state = 175;
	        this.closeBlock();
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    ifStatement() {
	    let localctx = new IfStatementContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 8, GameMakerLanguageParser.RULE_ifStatement);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 177;
	        this.match(GameMakerLanguageParser.If);
	        this.state = 178;
	        this.expression(0);
	        this.state = 180;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===91) {
	            this.state = 179;
	            this.match(GameMakerLanguageParser.Then);
	        }

	        this.state = 182;
	        this.statement();
	        this.state = 185;
	        this._errHandler.sync(this);
	        var la_ = this._interp.adaptivePredict(this._input,6,this._ctx);
	        if(la_===1) {
	            this.state = 183;
	            this.match(GameMakerLanguageParser.Else);
	            this.state = 184;
	            this.statement();

	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    iterationStatement() {
	    let localctx = new IterationStatementContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 10, GameMakerLanguageParser.RULE_iterationStatement);
	    var _la = 0;
	    try {
	        this.state = 216;
	        this._errHandler.sync(this);
	        switch(this._input.LA(1)) {
	        case 72:
	            localctx = new DoStatementContext(this, localctx);
	            this.enterOuterAlt(localctx, 1);
	            this.state = 187;
	            this.match(GameMakerLanguageParser.Do);
	            this.state = 188;
	            this.statement();
	            this.state = 189;
	            this.match(GameMakerLanguageParser.Until);
	            this.state = 190;
	            this.expression(0);
	            break;
	        case 84:
	            localctx = new WhileStatementContext(this, localctx);
	            this.enterOuterAlt(localctx, 2);
	            this.state = 192;
	            this.match(GameMakerLanguageParser.While);
	            this.state = 193;
	            this.expression(0);
	            this.state = 194;
	            this.statement();
	            break;
	        case 82:
	            localctx = new ForStatementContext(this, localctx);
	            this.enterOuterAlt(localctx, 3);
	            this.state = 196;
	            this.match(GameMakerLanguageParser.For);
	            this.state = 197;
	            this.match(GameMakerLanguageParser.OpenParen);
	            this.state = 200;
	            this._errHandler.sync(this);
	            switch (this._input.LA(1)) {
	            case 76:
	            case 97:
	            	this.state = 198;
	            	this.variableDeclarationList();
	            	break;
	            case 75:
	            case 96:
	            case 103:
	            	this.state = 199;
	            	this.assignmentExpression();
	            	break;
	            case 17:
	            	break;
	            default:
	            	break;
	            }
	            this.state = 202;
	            this.match(GameMakerLanguageParser.SemiColon);
	            this.state = 204;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	            if((((_la) & ~0x1f) === 0 && ((1 << _la) & 247501832) !== 0) || ((((_la - 63)) & ~0x1f) === 0 && ((1 << (_la - 63)) & 4223) !== 0) || ((((_la - 96)) & ~0x1f) === 0 && ((1 << (_la - 96)) & 1921) !== 0)) {
	                this.state = 203;
	                this.expression(0);
	            }

	            this.state = 206;
	            this.match(GameMakerLanguageParser.SemiColon);
	            this.state = 208;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	            if((((_la) & ~0x1f) === 0 && ((1 << _la) & 12751872) !== 0) || ((((_la - 70)) & ~0x1f) === 0 && ((1 << (_la - 70)) & 3747052775) !== 0) || _la===102 || _la===103) {
	                this.state = 207;
	                this.statement();
	            }

	            this.state = 210;
	            this.match(GameMakerLanguageParser.CloseParen);
	            this.state = 211;
	            this.statement();
	            break;
	        case 86:
	            localctx = new RepeatStatementContext(this, localctx);
	            this.enterOuterAlt(localctx, 4);
	            this.state = 212;
	            this.match(GameMakerLanguageParser.Repeat);
	            this.state = 213;
	            this.expression(0);
	            this.state = 214;
	            this.statement();
	            break;
	        default:
	            throw new antlr4.error.NoViableAltException(this);
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    withStatement() {
	    let localctx = new WithStatementContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 12, GameMakerLanguageParser.RULE_withStatement);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 218;
	        this.match(GameMakerLanguageParser.With);
	        this.state = 219;
	        this.expression(0);
	        this.state = 220;
	        this.statement();
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    switchStatement() {
	    let localctx = new SwitchStatementContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 14, GameMakerLanguageParser.RULE_switchStatement);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 222;
	        this.match(GameMakerLanguageParser.Switch);
	        this.state = 223;
	        this.expression(0);
	        this.state = 224;
	        this.caseBlock();
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    continueStatement() {
	    let localctx = new ContinueStatementContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 16, GameMakerLanguageParser.RULE_continueStatement);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 226;
	        this.match(GameMakerLanguageParser.Continue);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    breakStatement() {
	    let localctx = new BreakStatementContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 18, GameMakerLanguageParser.RULE_breakStatement);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 228;
	        this.match(GameMakerLanguageParser.Break);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    exitStatement() {
	    let localctx = new ExitStatementContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 20, GameMakerLanguageParser.RULE_exitStatement);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 230;
	        this.match(GameMakerLanguageParser.Exit);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    emptyStatement() {
	    let localctx = new EmptyStatementContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 22, GameMakerLanguageParser.RULE_emptyStatement);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 232;
	        this.match(GameMakerLanguageParser.SemiColon);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    caseBlock() {
	    let localctx = new CaseBlockContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 24, GameMakerLanguageParser.RULE_caseBlock);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 234;
	        this.openBlock();
	        this.state = 236;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===73) {
	            this.state = 235;
	            this.caseClauses();
	        }

	        this.state = 242;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===89) {
	            this.state = 238;
	            this.defaultClause();
	            this.state = 240;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	            if(_la===73) {
	                this.state = 239;
	                this.caseClauses();
	            }

	        }

	        this.state = 244;
	        this.closeBlock();
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    caseClauses() {
	    let localctx = new CaseClausesContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 26, GameMakerLanguageParser.RULE_caseClauses);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 247; 
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        do {
	            this.state = 246;
	            this.caseClause();
	            this.state = 249; 
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	        } while(_la===73);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    caseClause() {
	    let localctx = new CaseClauseContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 28, GameMakerLanguageParser.RULE_caseClause);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 251;
	        this.match(GameMakerLanguageParser.Case);
	        this.state = 252;
	        this.expression(0);
	        this.state = 253;
	        this.match(GameMakerLanguageParser.Colon);
	        this.state = 255;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if((((_la) & ~0x1f) === 0 && ((1 << _la) & 12751872) !== 0) || ((((_la - 70)) & ~0x1f) === 0 && ((1 << (_la - 70)) & 3747052775) !== 0) || _la===102 || _la===103) {
	            this.state = 254;
	            this.statementList();
	        }

	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    defaultClause() {
	    let localctx = new DefaultClauseContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 30, GameMakerLanguageParser.RULE_defaultClause);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 257;
	        this.match(GameMakerLanguageParser.Default);
	        this.state = 258;
	        this.match(GameMakerLanguageParser.Colon);
	        this.state = 260;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if((((_la) & ~0x1f) === 0 && ((1 << _la) & 12751872) !== 0) || ((((_la - 70)) & ~0x1f) === 0 && ((1 << (_la - 70)) & 3747052775) !== 0) || _la===102 || _la===103) {
	            this.state = 259;
	            this.statementList();
	        }

	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    throwStatement() {
	    let localctx = new ThrowStatementContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 32, GameMakerLanguageParser.RULE_throwStatement);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 262;
	        this.match(GameMakerLanguageParser.Throw);
	        this.state = 263;
	        this.expression(0);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    tryStatement() {
	    let localctx = new TryStatementContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 34, GameMakerLanguageParser.RULE_tryStatement);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 265;
	        this.match(GameMakerLanguageParser.Try);
	        this.state = 266;
	        this.statement();
	        this.state = 272;
	        this._errHandler.sync(this);
	        switch(this._input.LA(1)) {
	        case 78:
	            this.state = 267;
	            this.catchProduction();
	            this.state = 269;
	            this._errHandler.sync(this);
	            var la_ = this._interp.adaptivePredict(this._input,17,this._ctx);
	            if(la_===1) {
	                this.state = 268;
	                this.finallyProduction();

	            }
	            break;
	        case 79:
	            this.state = 271;
	            this.finallyProduction();
	            break;
	        default:
	            throw new antlr4.error.NoViableAltException(this);
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    catchProduction() {
	    let localctx = new CatchProductionContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 36, GameMakerLanguageParser.RULE_catchProduction);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 274;
	        this.match(GameMakerLanguageParser.Catch);
	        this.state = 280;
	        this._errHandler.sync(this);
	        var la_ = this._interp.adaptivePredict(this._input,20,this._ctx);
	        if(la_===1) {
	            this.state = 275;
	            this.match(GameMakerLanguageParser.OpenParen);
	            this.state = 277;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	            if(_la===96 || _la===103) {
	                this.state = 276;
	                this.identifier();
	            }

	            this.state = 279;
	            this.match(GameMakerLanguageParser.CloseParen);

	        }
	        this.state = 282;
	        this.statement();
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    finallyProduction() {
	    let localctx = new FinallyProductionContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 38, GameMakerLanguageParser.RULE_finallyProduction);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 284;
	        this.match(GameMakerLanguageParser.Finally);
	        this.state = 285;
	        this.statement();
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    returnStatement() {
	    let localctx = new ReturnStatementContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 40, GameMakerLanguageParser.RULE_returnStatement);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 287;
	        this.match(GameMakerLanguageParser.Return);
	        this.state = 289;
	        this._errHandler.sync(this);
	        var la_ = this._interp.adaptivePredict(this._input,21,this._ctx);
	        if(la_===1) {
	            this.state = 288;
	            this.expression(0);

	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    deleteStatement() {
	    let localctx = new DeleteStatementContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 42, GameMakerLanguageParser.RULE_deleteStatement);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 291;
	        this.match(GameMakerLanguageParser.Delete);
	        this.state = 292;
	        this.expression(0);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    assignmentExpression() {
	    let localctx = new AssignmentExpressionContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 44, GameMakerLanguageParser.RULE_assignmentExpression);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 294;
	        this.lValueExpression();
	        this.state = 295;
	        this.assignmentOperator();
	        this.state = 296;
	        this.expressionOrFunction();
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    variableDeclarationList() {
	    let localctx = new VariableDeclarationListContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 46, GameMakerLanguageParser.RULE_variableDeclarationList);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 298;
	        this.varModifier();
	        this.state = 299;
	        this.variableDeclaration();
	        this.state = 304;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        while(_la===18) {
	            this.state = 300;
	            this.match(GameMakerLanguageParser.Comma);
	            this.state = 301;
	            this.variableDeclaration();
	            this.state = 306;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    varModifier() {
	    let localctx = new VarModifierContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 48, GameMakerLanguageParser.RULE_varModifier);
	    var _la = 0;
	    try {
	        this.state = 313;
	        this._errHandler.sync(this);
	        switch(this._input.LA(1)) {
	        case 76:
	            this.enterOuterAlt(localctx, 1);
	            this.state = 308; 
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	            do {
	                this.state = 307;
	                this.match(GameMakerLanguageParser.Var);
	                this.state = 310; 
	                this._errHandler.sync(this);
	                _la = this._input.LA(1);
	            } while(_la===76);
	            break;
	        case 97:
	            this.enterOuterAlt(localctx, 2);
	            this.state = 312;
	            this.match(GameMakerLanguageParser.Static);
	            break;
	        default:
	            throw new antlr4.error.NoViableAltException(this);
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    variableDeclaration() {
	    let localctx = new VariableDeclarationContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 50, GameMakerLanguageParser.RULE_variableDeclaration);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 315;
	        this.identifier();
	        this.state = 318;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===19) {
	            this.state = 316;
	            this.match(GameMakerLanguageParser.Assign);
	            this.state = 317;
	            this.expressionOrFunction();
	        }

	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    globalVarStatement() {
	    let localctx = new GlobalVarStatementContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 52, GameMakerLanguageParser.RULE_globalVarStatement);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 320;
	        this.match(GameMakerLanguageParser.GlobalVar);
	        this.state = 321;
	        this.identifier();
	        this.state = 326;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        while(_la===18) {
	            this.state = 322;
	            this.match(GameMakerLanguageParser.Comma);
	            this.state = 323;
	            this.identifier();
	            this.state = 328;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	        }
	        this.state = 329;
	        this.match(GameMakerLanguageParser.SemiColon);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    newExpression() {
	    let localctx = new NewExpressionContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 54, GameMakerLanguageParser.RULE_newExpression);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 331;
	        this.match(GameMakerLanguageParser.New);
	        this.state = 332;
	        this.identifier();
	        this.state = 333;
	        this.arguments();
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    lValueStartExpression() {
	    let localctx = new LValueStartExpressionContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 56, GameMakerLanguageParser.RULE_lValueStartExpression);
	    try {
	        this.state = 337;
	        this._errHandler.sync(this);
	        switch(this._input.LA(1)) {
	        case 96:
	        case 103:
	            localctx = new IdentifierLValueContext(this, localctx);
	            this.enterOuterAlt(localctx, 1);
	            this.state = 335;
	            this.identifier();
	            break;
	        case 75:
	            localctx = new NewLValueContext(this, localctx);
	            this.enterOuterAlt(localctx, 2);
	            this.state = 336;
	            this.newExpression();
	            break;
	        default:
	            throw new antlr4.error.NoViableAltException(this);
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    lValueExpression() {
	    let localctx = new LValueExpressionContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 58, GameMakerLanguageParser.RULE_lValueExpression);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 339;
	        this.lValueStartExpression();
	        this.state = 347;
	        this._errHandler.sync(this);
	        var la_ = this._interp.adaptivePredict(this._input,29,this._ctx);
	        if(la_===1) {
	            this.state = 343;
	            this._errHandler.sync(this);
	            var _alt = this._interp.adaptivePredict(this._input,28,this._ctx);
	            while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
	                if(_alt===1) {
	                    this.state = 340;
	                    this.lValueChainOperator(); 
	                }
	                this.state = 345;
	                this._errHandler.sync(this);
	                _alt = this._interp.adaptivePredict(this._input,28,this._ctx);
	            }

	            this.state = 346;
	            this.lValueFinalOperator();

	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    lValueChainOperator() {
	    let localctx = new LValueChainOperatorContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 60, GameMakerLanguageParser.RULE_lValueChainOperator);
	    try {
	        this.state = 356;
	        this._errHandler.sync(this);
	        switch(this._input.LA(1)) {
	        case 3:
	        case 4:
	        case 5:
	        case 6:
	        case 7:
	        case 8:
	            localctx = new MemberIndexLValueContext(this, localctx);
	            this.enterOuterAlt(localctx, 1);
	            this.state = 349;
	            this.accessor();
	            this.state = 350;
	            this.expressionSequence();
	            this.state = 351;
	            this.match(GameMakerLanguageParser.CloseBracket);
	            break;
	        case 21:
	            localctx = new MemberDotLValueContext(this, localctx);
	            this.enterOuterAlt(localctx, 2);
	            this.state = 353;
	            this.match(GameMakerLanguageParser.Dot);
	            this.state = 354;
	            this.identifier();
	            break;
	        case 10:
	            localctx = new CallLValueContext(this, localctx);
	            this.enterOuterAlt(localctx, 3);
	            this.state = 355;
	            this.arguments();
	            break;
	        default:
	            throw new antlr4.error.NoViableAltException(this);
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    lValueFinalOperator() {
	    let localctx = new LValueFinalOperatorContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 62, GameMakerLanguageParser.RULE_lValueFinalOperator);
	    try {
	        this.state = 364;
	        this._errHandler.sync(this);
	        switch(this._input.LA(1)) {
	        case 3:
	        case 4:
	        case 5:
	        case 6:
	        case 7:
	        case 8:
	            localctx = new MemberIndexLValueFinalContext(this, localctx);
	            this.enterOuterAlt(localctx, 1);
	            this.state = 358;
	            this.accessor();
	            this.state = 359;
	            this.expressionSequence();
	            this.state = 360;
	            this.match(GameMakerLanguageParser.CloseBracket);
	            break;
	        case 21:
	            localctx = new MemberDotLValueFinalContext(this, localctx);
	            this.enterOuterAlt(localctx, 2);
	            this.state = 362;
	            this.match(GameMakerLanguageParser.Dot);
	            this.state = 363;
	            this.identifier();
	            break;
	        default:
	            throw new antlr4.error.NoViableAltException(this);
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    expressionSequence() {
	    let localctx = new ExpressionSequenceContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 64, GameMakerLanguageParser.RULE_expressionSequence);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 366;
	        this.expression(0);
	        this.state = 371;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        while(_la===18) {
	            this.state = 367;
	            this.match(GameMakerLanguageParser.Comma);
	            this.state = 368;
	            this.expression(0);
	            this.state = 373;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    expressionOrFunction() {
	    let localctx = new ExpressionOrFunctionContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 66, GameMakerLanguageParser.RULE_expressionOrFunction);
	    try {
	        this.state = 382;
	        this._errHandler.sync(this);
	        var la_ = this._interp.adaptivePredict(this._input,34,this._ctx);
	        switch(la_) {
	        case 1:
	            this.enterOuterAlt(localctx, 1);
	            this.state = 376;
	            this._errHandler.sync(this);
	            switch(this._input.LA(1)) {
	            case 3:
	            case 10:
	            case 12:
	            case 15:
	            case 22:
	            case 23:
	            case 25:
	            case 26:
	            case 27:
	            case 63:
	            case 64:
	            case 65:
	            case 66:
	            case 67:
	            case 68:
	            case 69:
	            case 75:
	            case 96:
	            case 103:
	            case 104:
	            case 105:
	            case 106:
	                this.state = 374;
	                this.expression(0);
	                break;
	            case 87:
	                this.state = 375;
	                this.functionDeclaration();
	                break;
	            default:
	                throw new antlr4.error.NoViableAltException(this);
	            }
	            break;

	        case 2:
	            this.enterOuterAlt(localctx, 2);
	            this.state = 378;
	            this.match(GameMakerLanguageParser.OpenParen);
	            this.state = 379;
	            this.expressionOrFunction();
	            this.state = 380;
	            this.match(GameMakerLanguageParser.CloseParen);
	            break;

	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }


    expression(_p) {
        if(_p===undefined) {
		    _p = 0;
        }
	    const _parentctx = this._ctx;
	    const _parentState = this.state;
	    let localctx = new ExpressionContext(this, this._ctx, _parentState);
	    let _prevctx = localctx;
	    const _startState = 68;
	    this.enterRecursionRule(localctx, 68, GameMakerLanguageParser.RULE_expression, _p);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 399;
	        this._errHandler.sync(this);
	        var la_ = this._interp.adaptivePredict(this._input,35,this._ctx);
	        switch(la_) {
	        case 1:
	            localctx = new IncDecExpressionContext(this, localctx);
	            this._ctx = localctx;
	            _prevctx = localctx;

	            this.state = 385;
	            this.incDecStatement();
	            break;

	        case 2:
	            localctx = new VariableExpressionContext(this, localctx);
	            this._ctx = localctx;
	            _prevctx = localctx;
	            this.state = 386;
	            this.lValueExpression();
	            break;

	        case 3:
	            localctx = new CallExpressionContext(this, localctx);
	            this._ctx = localctx;
	            _prevctx = localctx;
	            this.state = 387;
	            this.callStatement(0);
	            break;

	        case 4:
	            localctx = new UnaryMinusExpressionContext(this, localctx);
	            this._ctx = localctx;
	            _prevctx = localctx;
	            this.state = 388;
	            this.match(GameMakerLanguageParser.Minus);
	            this.state = 389;
	            this.expression(18);
	            break;

	        case 5:
	            localctx = new BitNotExpressionContext(this, localctx);
	            this._ctx = localctx;
	            _prevctx = localctx;
	            this.state = 390;
	            this.match(GameMakerLanguageParser.BitNot);
	            this.state = 391;
	            this.expression(17);
	            break;

	        case 6:
	            localctx = new NotExpressionContext(this, localctx);
	            this._ctx = localctx;
	            _prevctx = localctx;
	            this.state = 392;
	            this.match(GameMakerLanguageParser.Not);
	            this.state = 393;
	            this.expression(16);
	            break;

	        case 7:
	            localctx = new LiteralExpressionContext(this, localctx);
	            this._ctx = localctx;
	            _prevctx = localctx;
	            this.state = 394;
	            this.literal();
	            break;

	        case 8:
	            localctx = new ParenthesizedExpressionContext(this, localctx);
	            this._ctx = localctx;
	            _prevctx = localctx;
	            this.state = 395;
	            this.match(GameMakerLanguageParser.OpenParen);
	            this.state = 396;
	            this.expression(0);
	            this.state = 397;
	            this.match(GameMakerLanguageParser.CloseParen);
	            break;

	        }
	        this._ctx.stop = this._input.LT(-1);
	        this.state = 445;
	        this._errHandler.sync(this);
	        var _alt = this._interp.adaptivePredict(this._input,37,this._ctx);
	        while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
	            if(_alt===1) {
	                if(this._parseListeners!==null) {
	                    this.triggerExitRuleEvent();
	                }
	                _prevctx = localctx;
	                this.state = 443;
	                this._errHandler.sync(this);
	                var la_ = this._interp.adaptivePredict(this._input,36,this._ctx);
	                switch(la_) {
	                case 1:
	                    localctx = new MultiplicativeExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, GameMakerLanguageParser.RULE_expression);
	                    this.state = 401;
	                    if (!( this.precpred(this._ctx, 15))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 15)");
	                    }
	                    this.state = 402;
	                    _la = this._input.LA(1);
	                    if(!((((_la) & ~0x1f) === 0 && ((1 << _la) & 4026531840) !== 0))) {
	                    this._errHandler.recoverInline(this);
	                    }
	                    else {
	                    	this._errHandler.reportMatch(this);
	                        this.consume();
	                    }
	                    this.state = 403;
	                    this.expression(16);
	                    break;

	                case 2:
	                    localctx = new AdditiveExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, GameMakerLanguageParser.RULE_expression);
	                    this.state = 404;
	                    if (!( this.precpred(this._ctx, 14))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 14)");
	                    }
	                    this.state = 405;
	                    _la = this._input.LA(1);
	                    if(!(_la===24 || _la===25)) {
	                    this._errHandler.recoverInline(this);
	                    }
	                    else {
	                    	this._errHandler.reportMatch(this);
	                        this.consume();
	                    }
	                    this.state = 406;
	                    this.expression(15);
	                    break;

	                case 3:
	                    localctx = new CoalesceExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, GameMakerLanguageParser.RULE_expression);
	                    this.state = 407;
	                    if (!( this.precpred(this._ctx, 13))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 13)");
	                    }
	                    this.state = 408;
	                    this.match(GameMakerLanguageParser.NullCoalesce);
	                    this.state = 409;
	                    this.expression(14);
	                    break;

	                case 4:
	                    localctx = new BitShiftExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, GameMakerLanguageParser.RULE_expression);
	                    this.state = 410;
	                    if (!( this.precpred(this._ctx, 12))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 12)");
	                    }
	                    this.state = 411;
	                    _la = this._input.LA(1);
	                    if(!(_la===36 || _la===37)) {
	                    this._errHandler.recoverInline(this);
	                    }
	                    else {
	                    	this._errHandler.reportMatch(this);
	                        this.consume();
	                    }
	                    this.state = 412;
	                    this.expression(13);
	                    break;

	                case 5:
	                    localctx = new LogicalOrExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, GameMakerLanguageParser.RULE_expression);
	                    this.state = 413;
	                    if (!( this.precpred(this._ctx, 11))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 11)");
	                    }
	                    this.state = 414;
	                    this.match(GameMakerLanguageParser.Or);
	                    this.state = 415;
	                    this.expression(12);
	                    break;

	                case 6:
	                    localctx = new LogicalAndExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, GameMakerLanguageParser.RULE_expression);
	                    this.state = 416;
	                    if (!( this.precpred(this._ctx, 10))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 10)");
	                    }
	                    this.state = 417;
	                    this.match(GameMakerLanguageParser.And);
	                    this.state = 418;
	                    this.expression(11);
	                    break;

	                case 7:
	                    localctx = new LogicalXorExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, GameMakerLanguageParser.RULE_expression);
	                    this.state = 419;
	                    if (!( this.precpred(this._ctx, 9))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 9)");
	                    }
	                    this.state = 420;
	                    this.match(GameMakerLanguageParser.Xor);
	                    this.state = 421;
	                    this.expression(10);
	                    break;

	                case 8:
	                    localctx = new EqualityExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, GameMakerLanguageParser.RULE_expression);
	                    this.state = 422;
	                    if (!( this.precpred(this._ctx, 8))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 8)");
	                    }
	                    this.state = 423;
	                    _la = this._input.LA(1);
	                    if(!(((((_la - 19)) & ~0x1f) === 0 && ((1 << (_la - 19)) & 25165825) !== 0))) {
	                    this._errHandler.recoverInline(this);
	                    }
	                    else {
	                    	this._errHandler.reportMatch(this);
	                        this.consume();
	                    }
	                    this.state = 424;
	                    this.expression(9);
	                    break;

	                case 9:
	                    localctx = new RelationalExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, GameMakerLanguageParser.RULE_expression);
	                    this.state = 425;
	                    if (!( this.precpred(this._ctx, 7))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 7)");
	                    }
	                    this.state = 426;
	                    _la = this._input.LA(1);
	                    if(!(((((_la - 38)) & ~0x1f) === 0 && ((1 << (_la - 38)) & 15) !== 0))) {
	                    this._errHandler.recoverInline(this);
	                    }
	                    else {
	                    	this._errHandler.reportMatch(this);
	                        this.consume();
	                    }
	                    this.state = 427;
	                    this.expression(8);
	                    break;

	                case 10:
	                    localctx = new BitAndExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, GameMakerLanguageParser.RULE_expression);
	                    this.state = 428;
	                    if (!( this.precpred(this._ctx, 6))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 6)");
	                    }
	                    this.state = 429;
	                    this.match(GameMakerLanguageParser.BitAnd);
	                    this.state = 430;
	                    this.expression(7);
	                    break;

	                case 11:
	                    localctx = new BitOrExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, GameMakerLanguageParser.RULE_expression);
	                    this.state = 431;
	                    if (!( this.precpred(this._ctx, 5))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 5)");
	                    }
	                    this.state = 432;
	                    this.match(GameMakerLanguageParser.BitOr);
	                    this.state = 433;
	                    this.expression(6);
	                    break;

	                case 12:
	                    localctx = new BitXOrExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, GameMakerLanguageParser.RULE_expression);
	                    this.state = 434;
	                    if (!( this.precpred(this._ctx, 4))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 4)");
	                    }
	                    this.state = 435;
	                    this.match(GameMakerLanguageParser.BitXOr);
	                    this.state = 436;
	                    this.expression(5);
	                    break;

	                case 13:
	                    localctx = new TernaryExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, GameMakerLanguageParser.RULE_expression);
	                    this.state = 437;
	                    if (!( this.precpred(this._ctx, 3))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 3)");
	                    }
	                    this.state = 438;
	                    this.match(GameMakerLanguageParser.QuestionMark);
	                    this.state = 439;
	                    this.expression(0);
	                    this.state = 440;
	                    this.match(GameMakerLanguageParser.Colon);
	                    this.state = 441;
	                    this.expression(4);
	                    break;

	                } 
	            }
	            this.state = 447;
	            this._errHandler.sync(this);
	            _alt = this._interp.adaptivePredict(this._input,37,this._ctx);
	        }

	    } catch( error) {
	        if(error instanceof antlr4.error.RecognitionException) {
		        localctx.exception = error;
		        this._errHandler.reportError(this, error);
		        this._errHandler.recover(this, error);
		    } else {
		    	throw error;
		    }
	    } finally {
	        this.unrollRecursionContexts(_parentctx);
	    }
	    return localctx;
    }


    callStatement(_p) {
        if(_p===undefined) {
		    _p = 0;
        }
	    const _parentctx = this._ctx;
	    const _parentState = this.state;
	    let localctx = new CallStatementContext(this, this._ctx, _parentState);
	    let _prevctx = localctx;
	    const _startState = 70;
	    this.enterRecursionRule(localctx, 70, GameMakerLanguageParser.RULE_callStatement, _p);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 449;
	        this.callableExpression();
	        this.state = 450;
	        this.arguments();
	        this._ctx.stop = this._input.LT(-1);
	        this.state = 456;
	        this._errHandler.sync(this);
	        var _alt = this._interp.adaptivePredict(this._input,38,this._ctx);
	        while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
	            if(_alt===1) {
	                if(this._parseListeners!==null) {
	                    this.triggerExitRuleEvent();
	                }
	                _prevctx = localctx;
	                localctx = new CallStatementContext(this, _parentctx, _parentState);
	                this.pushNewRecursionContext(localctx, _startState, GameMakerLanguageParser.RULE_callStatement);
	                this.state = 452;
	                if (!( this.precpred(this._ctx, 1))) {
	                    throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 1)");
	                }
	                this.state = 453;
	                this.arguments(); 
	            }
	            this.state = 458;
	            this._errHandler.sync(this);
	            _alt = this._interp.adaptivePredict(this._input,38,this._ctx);
	        }

	    } catch( error) {
	        if(error instanceof antlr4.error.RecognitionException) {
		        localctx.exception = error;
		        this._errHandler.reportError(this, error);
		        this._errHandler.recover(this, error);
		    } else {
		    	throw error;
		    }
	    } finally {
	        this.unrollRecursionContexts(_parentctx);
	    }
	    return localctx;
    }



    callableExpression() {
	    let localctx = new CallableExpressionContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 72, GameMakerLanguageParser.RULE_callableExpression);
	    try {
	        this.state = 467;
	        this._errHandler.sync(this);
	        switch(this._input.LA(1)) {
	        case 75:
	        case 96:
	        case 103:
	            this.enterOuterAlt(localctx, 1);
	            this.state = 459;
	            this.lValueExpression();
	            break;
	        case 10:
	            this.enterOuterAlt(localctx, 2);
	            this.state = 460;
	            this.match(GameMakerLanguageParser.OpenParen);
	            this.state = 463;
	            this._errHandler.sync(this);
	            switch(this._input.LA(1)) {
	            case 87:
	                this.state = 461;
	                this.functionDeclaration();
	                break;
	            case 10:
	            case 75:
	            case 96:
	            case 103:
	                this.state = 462;
	                this.callableExpression();
	                break;
	            default:
	                throw new antlr4.error.NoViableAltException(this);
	            }
	            this.state = 465;
	            this.match(GameMakerLanguageParser.CloseParen);
	            break;
	        default:
	            throw new antlr4.error.NoViableAltException(this);
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    incDecStatement() {
	    let localctx = new IncDecStatementContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 74, GameMakerLanguageParser.RULE_incDecStatement);
	    var _la = 0;
	    try {
	        this.state = 474;
	        this._errHandler.sync(this);
	        switch(this._input.LA(1)) {
	        case 22:
	        case 23:
	            localctx = new PreIncDecExpressionContext(this, localctx);
	            this.enterOuterAlt(localctx, 1);
	            this.state = 469;
	            _la = this._input.LA(1);
	            if(!(_la===22 || _la===23)) {
	            this._errHandler.recoverInline(this);
	            }
	            else {
	            	this._errHandler.reportMatch(this);
	                this.consume();
	            }
	            this.state = 470;
	            this.lValueExpression();
	            break;
	        case 75:
	        case 96:
	        case 103:
	            localctx = new PostIncDecExpressionContext(this, localctx);
	            this.enterOuterAlt(localctx, 2);
	            this.state = 471;
	            this.lValueExpression();
	            this.state = 472;
	            _la = this._input.LA(1);
	            if(!(_la===22 || _la===23)) {
	            this._errHandler.recoverInline(this);
	            }
	            else {
	            	this._errHandler.reportMatch(this);
	                this.consume();
	            }
	            break;
	        default:
	            throw new antlr4.error.NoViableAltException(this);
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    accessor() {
	    let localctx = new AccessorContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 76, GameMakerLanguageParser.RULE_accessor);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 476;
	        _la = this._input.LA(1);
	        if(!((((_la) & ~0x1f) === 0 && ((1 << _la) & 504) !== 0))) {
	        this._errHandler.recoverInline(this);
	        }
	        else {
	        	this._errHandler.reportMatch(this);
	            this.consume();
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    arguments() {
	    let localctx = new ArgumentsContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 78, GameMakerLanguageParser.RULE_arguments);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 478;
	        this.match(GameMakerLanguageParser.OpenParen);
	        this.state = 490;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if((((_la) & ~0x1f) === 0 && ((1 << _la) & 247501832) !== 0) || ((((_la - 63)) & ~0x1f) === 0 && ((1 << (_la - 63)) & 16781439) !== 0) || ((((_la - 96)) & ~0x1f) === 0 && ((1 << (_la - 96)) & 1921) !== 0)) {
	            this.state = 479;
	            this.expressionOrFunction();
	            this.state = 484;
	            this._errHandler.sync(this);
	            var _alt = this._interp.adaptivePredict(this._input,42,this._ctx);
	            while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
	                if(_alt===1) {
	                    this.state = 480;
	                    this.match(GameMakerLanguageParser.Comma);
	                    this.state = 481;
	                    this.expressionOrFunction(); 
	                }
	                this.state = 486;
	                this._errHandler.sync(this);
	                _alt = this._interp.adaptivePredict(this._input,42,this._ctx);
	            }

	            this.state = 488;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	            if(_la===18) {
	                this.state = 487;
	                this.match(GameMakerLanguageParser.Comma);
	            }

	        }

	        this.state = 492;
	        this.match(GameMakerLanguageParser.CloseParen);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    assignmentOperator() {
	    let localctx = new AssignmentOperatorContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 80, GameMakerLanguageParser.RULE_assignmentOperator);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 494;
	        _la = this._input.LA(1);
	        if(!(_la===19 || ((((_la - 35)) & ~0x1f) === 0 && ((1 << (_la - 35)) & 33521665) !== 0))) {
	        this._errHandler.recoverInline(this);
	        }
	        else {
	        	this._errHandler.reportMatch(this);
	            this.consume();
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    literal() {
	    let localctx = new LiteralContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 82, GameMakerLanguageParser.RULE_literal);
	    try {
	        this.state = 508;
	        this._errHandler.sync(this);
	        switch(this._input.LA(1)) {
	        case 63:
	            this.enterOuterAlt(localctx, 1);
	            this.state = 496;
	            this.match(GameMakerLanguageParser.UndefinedLiteral);
	            break;
	        case 64:
	            this.enterOuterAlt(localctx, 2);
	            this.state = 497;
	            this.match(GameMakerLanguageParser.NoOneLiteral);
	            break;
	        case 65:
	            this.enterOuterAlt(localctx, 3);
	            this.state = 498;
	            this.match(GameMakerLanguageParser.BooleanLiteral);
	            break;
	        case 104:
	            this.enterOuterAlt(localctx, 4);
	            this.state = 499;
	            this.match(GameMakerLanguageParser.StringLiteral);
	            break;
	        case 106:
	            this.enterOuterAlt(localctx, 5);
	            this.state = 500;
	            this.match(GameMakerLanguageParser.VerbatimStringLiteral);
	            break;
	        case 105:
	            this.enterOuterAlt(localctx, 6);
	            this.state = 501;
	            this.templateStringLiteral();
	            break;
	        case 69:
	            this.enterOuterAlt(localctx, 7);
	            this.state = 502;
	            this.match(GameMakerLanguageParser.HexIntegerLiteral);
	            break;
	        case 68:
	            this.enterOuterAlt(localctx, 8);
	            this.state = 503;
	            this.match(GameMakerLanguageParser.BinaryLiteral);
	            break;
	        case 67:
	            this.enterOuterAlt(localctx, 9);
	            this.state = 504;
	            this.match(GameMakerLanguageParser.DecimalLiteral);
	            break;
	        case 66:
	            this.enterOuterAlt(localctx, 10);
	            this.state = 505;
	            this.match(GameMakerLanguageParser.IntegerLiteral);
	            break;
	        case 3:
	            this.enterOuterAlt(localctx, 11);
	            this.state = 506;
	            this.arrayLiteral();
	            break;
	        case 12:
	        case 15:
	            this.enterOuterAlt(localctx, 12);
	            this.state = 507;
	            this.structLiteral();
	            break;
	        default:
	            throw new antlr4.error.NoViableAltException(this);
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    templateStringLiteral() {
	    let localctx = new TemplateStringLiteralContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 84, GameMakerLanguageParser.RULE_templateStringLiteral);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 510;
	        this.match(GameMakerLanguageParser.TemplateStringStart);
	        this.state = 514;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        while(_la===113 || _la===114) {
	            this.state = 511;
	            this.templateStringAtom();
	            this.state = 516;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	        }
	        this.state = 517;
	        this.match(GameMakerLanguageParser.TemplateStringEnd);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    templateStringAtom() {
	    let localctx = new TemplateStringAtomContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 86, GameMakerLanguageParser.RULE_templateStringAtom);
	    try {
	        this.state = 524;
	        this._errHandler.sync(this);
	        switch(this._input.LA(1)) {
	        case 114:
	            this.enterOuterAlt(localctx, 1);
	            this.state = 519;
	            this.match(GameMakerLanguageParser.TemplateStringText);
	            break;
	        case 113:
	            this.enterOuterAlt(localctx, 2);
	            this.state = 520;
	            this.match(GameMakerLanguageParser.TemplateStringStartExpression);
	            this.state = 521;
	            this.expression(0);
	            this.state = 522;
	            this.match(GameMakerLanguageParser.TemplateStringEndExpression);
	            break;
	        default:
	            throw new antlr4.error.NoViableAltException(this);
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    arrayLiteral() {
	    let localctx = new ArrayLiteralContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 88, GameMakerLanguageParser.RULE_arrayLiteral);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 526;
	        this.match(GameMakerLanguageParser.OpenBracket);
	        this.state = 527;
	        this.elementList();
	        this.state = 528;
	        this.match(GameMakerLanguageParser.CloseBracket);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    elementList() {
	    let localctx = new ElementListContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 90, GameMakerLanguageParser.RULE_elementList);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 533;
	        this._errHandler.sync(this);
	        var _alt = this._interp.adaptivePredict(this._input,48,this._ctx);
	        while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
	            if(_alt===1) {
	                this.state = 530;
	                this.match(GameMakerLanguageParser.Comma); 
	            }
	            this.state = 535;
	            this._errHandler.sync(this);
	            _alt = this._interp.adaptivePredict(this._input,48,this._ctx);
	        }

	        this.state = 537;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if((((_la) & ~0x1f) === 0 && ((1 << _la) & 247501832) !== 0) || ((((_la - 63)) & ~0x1f) === 0 && ((1 << (_la - 63)) & 16781439) !== 0) || ((((_la - 96)) & ~0x1f) === 0 && ((1 << (_la - 96)) & 1921) !== 0)) {
	            this.state = 536;
	            this.expressionOrFunction();
	        }

	        this.state = 547;
	        this._errHandler.sync(this);
	        var _alt = this._interp.adaptivePredict(this._input,51,this._ctx);
	        while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
	            if(_alt===1) {
	                this.state = 540; 
	                this._errHandler.sync(this);
	                _la = this._input.LA(1);
	                do {
	                    this.state = 539;
	                    this.match(GameMakerLanguageParser.Comma);
	                    this.state = 542; 
	                    this._errHandler.sync(this);
	                    _la = this._input.LA(1);
	                } while(_la===18);
	                this.state = 544;
	                this.expressionOrFunction(); 
	            }
	            this.state = 549;
	            this._errHandler.sync(this);
	            _alt = this._interp.adaptivePredict(this._input,51,this._ctx);
	        }

	        this.state = 551;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===18) {
	            this.state = 550;
	            this.match(GameMakerLanguageParser.Comma);
	        }

	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    structLiteral() {
	    let localctx = new StructLiteralContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 92, GameMakerLanguageParser.RULE_structLiteral);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 553;
	        this.openBlock();
	        this.state = 565;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===64 || _la===96 || _la===103) {
	            this.state = 554;
	            this.propertyAssignment();
	            this.state = 559;
	            this._errHandler.sync(this);
	            var _alt = this._interp.adaptivePredict(this._input,53,this._ctx);
	            while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
	                if(_alt===1) {
	                    this.state = 555;
	                    this.match(GameMakerLanguageParser.Comma);
	                    this.state = 556;
	                    this.propertyAssignment(); 
	                }
	                this.state = 561;
	                this._errHandler.sync(this);
	                _alt = this._interp.adaptivePredict(this._input,53,this._ctx);
	            }

	            this.state = 563;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	            if(_la===18) {
	                this.state = 562;
	                this.match(GameMakerLanguageParser.Comma);
	            }

	        }

	        this.state = 567;
	        this.closeBlock();
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    propertyAssignment() {
	    let localctx = new PropertyAssignmentContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 94, GameMakerLanguageParser.RULE_propertyAssignment);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 569;
	        this.propertyIdentifier();
	        this.state = 570;
	        this.match(GameMakerLanguageParser.Colon);
	        this.state = 571;
	        this.expressionOrFunction();
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    propertyIdentifier() {
	    let localctx = new PropertyIdentifierContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 96, GameMakerLanguageParser.RULE_propertyIdentifier);
	    try {
	        this.state = 576;
	        this._errHandler.sync(this);
	        switch(this._input.LA(1)) {
	        case 103:
	            this.enterOuterAlt(localctx, 1);
	            this.state = 573;
	            this.match(GameMakerLanguageParser.Identifier);
	            break;
	        case 96:
	            this.enterOuterAlt(localctx, 2);
	            this.state = 574;
	            this.softKeyword();
	            break;
	        case 64:
	            this.enterOuterAlt(localctx, 3);
	            this.state = 575;
	            this.propertySoftKeyword();
	            break;
	        default:
	            throw new antlr4.error.NoViableAltException(this);
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    functionDeclaration() {
	    let localctx = new FunctionDeclarationContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 98, GameMakerLanguageParser.RULE_functionDeclaration);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 578;
	        this.match(GameMakerLanguageParser.Function_);
	        this.state = 580;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===103) {
	            this.state = 579;
	            this.match(GameMakerLanguageParser.Identifier);
	        }

	        this.state = 582;
	        this.parameterList();
	        this.state = 584;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===20 || _la===96) {
	            this.state = 583;
	            this.constructorClause();
	        }

	        this.state = 586;
	        this.block();
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    constructorClause() {
	    let localctx = new ConstructorClauseContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 100, GameMakerLanguageParser.RULE_constructorClause);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 591;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===20) {
	            this.state = 588;
	            this.match(GameMakerLanguageParser.Colon);
	            this.state = 589;
	            this.match(GameMakerLanguageParser.Identifier);
	            this.state = 590;
	            this.parameterList();
	        }

	        this.state = 593;
	        this.match(GameMakerLanguageParser.Constructor);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    parameterList() {
	    let localctx = new ParameterListContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 102, GameMakerLanguageParser.RULE_parameterList);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 595;
	        this.match(GameMakerLanguageParser.OpenParen);
	        this.state = 607;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===96 || _la===103) {
	            this.state = 596;
	            this.parameterArgument();
	            this.state = 601;
	            this._errHandler.sync(this);
	            var _alt = this._interp.adaptivePredict(this._input,60,this._ctx);
	            while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
	                if(_alt===1) {
	                    this.state = 597;
	                    this.match(GameMakerLanguageParser.Comma);
	                    this.state = 598;
	                    this.parameterArgument(); 
	                }
	                this.state = 603;
	                this._errHandler.sync(this);
	                _alt = this._interp.adaptivePredict(this._input,60,this._ctx);
	            }

	            this.state = 605;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	            if(_la===18) {
	                this.state = 604;
	                this.match(GameMakerLanguageParser.Comma);
	            }

	        }

	        this.state = 609;
	        this.match(GameMakerLanguageParser.CloseParen);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    parameterArgument() {
	    let localctx = new ParameterArgumentContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 104, GameMakerLanguageParser.RULE_parameterArgument);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 611;
	        this.identifier();
	        this.state = 614;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===19) {
	            this.state = 612;
	            this.match(GameMakerLanguageParser.Assign);
	            this.state = 613;
	            this.expressionOrFunction();
	        }

	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    identifier() {
	    let localctx = new IdentifierContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 106, GameMakerLanguageParser.RULE_identifier);
	    try {
	        this.state = 618;
	        this._errHandler.sync(this);
	        switch(this._input.LA(1)) {
	        case 103:
	            this.enterOuterAlt(localctx, 1);
	            this.state = 616;
	            this.match(GameMakerLanguageParser.Identifier);
	            break;
	        case 96:
	            this.enterOuterAlt(localctx, 2);
	            this.state = 617;
	            this.softKeyword();
	            break;
	        default:
	            throw new antlr4.error.NoViableAltException(this);
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    enumeratorDeclaration() {
	    let localctx = new EnumeratorDeclarationContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 108, GameMakerLanguageParser.RULE_enumeratorDeclaration);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 620;
	        this.match(GameMakerLanguageParser.Enum);
	        this.state = 621;
	        this.identifier();
	        this.state = 622;
	        this.openBlock();
	        this.state = 624;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===96 || _la===103) {
	            this.state = 623;
	            this.enumeratorList();
	        }

	        this.state = 626;
	        this.closeBlock();
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    enumeratorList() {
	    let localctx = new EnumeratorListContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 110, GameMakerLanguageParser.RULE_enumeratorList);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 628;
	        this.enumerator();
	        this.state = 633;
	        this._errHandler.sync(this);
	        var _alt = this._interp.adaptivePredict(this._input,66,this._ctx);
	        while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
	            if(_alt===1) {
	                this.state = 629;
	                this.match(GameMakerLanguageParser.Comma);
	                this.state = 630;
	                this.enumerator(); 
	            }
	            this.state = 635;
	            this._errHandler.sync(this);
	            _alt = this._interp.adaptivePredict(this._input,66,this._ctx);
	        }

	        this.state = 637;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===18) {
	            this.state = 636;
	            this.match(GameMakerLanguageParser.Comma);
	        }

	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    enumerator() {
	    let localctx = new EnumeratorContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 112, GameMakerLanguageParser.RULE_enumerator);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 639;
	        this.identifier();
	        this.state = 642;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===19) {
	            this.state = 640;
	            this.match(GameMakerLanguageParser.Assign);
	            this.state = 641;
	            _la = this._input.LA(1);
	            if(!(((((_la - 66)) & ~0x1f) === 0 && ((1 << (_la - 66)) & 13) !== 0))) {
	            this._errHandler.recoverInline(this);
	            }
	            else {
	            	this._errHandler.reportMatch(this);
	                this.consume();
	            }
	        }

	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    macroStatement() {
	    let localctx = new MacroStatementContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 114, GameMakerLanguageParser.RULE_macroStatement);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 644;
	        this.match(GameMakerLanguageParser.Macro);
	        this.state = 645;
	        this.identifier();
	        this.state = 647; 
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        do {
	            this.state = 646;
	            this.macroToken();
	            this.state = 649; 
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	        } while((((_la) & ~0x1f) === 0 && ((1 << _la) & 4294967288) !== 0) || ((((_la - 32)) & ~0x1f) === 0 && ((1 << (_la - 32)) & 4294967295) !== 0) || ((((_la - 64)) & ~0x1f) === 0 && ((1 << (_la - 64)) & 4294967295) !== 0) || ((((_la - 96)) & ~0x1f) === 0 && ((1 << (_la - 96)) & 460683) !== 0));
	        this.state = 651;
	        _la = this._input.LA(1);
	        if(!(_la===-1 || _la===108)) {
	        this._errHandler.recoverInline(this);
	        }
	        else {
	        	this._errHandler.reportMatch(this);
	            this.consume();
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    defineStatement() {
	    let localctx = new DefineStatementContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 116, GameMakerLanguageParser.RULE_defineStatement);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 653;
	        this.match(GameMakerLanguageParser.Define);
	        this.state = 654;
	        this.match(GameMakerLanguageParser.RegionCharacters);
	        this.state = 655;
	        _la = this._input.LA(1);
	        if(!(_la===-1 || _la===111)) {
	        this._errHandler.recoverInline(this);
	        }
	        else {
	        	this._errHandler.reportMatch(this);
	            this.consume();
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    regionStatement() {
	    let localctx = new RegionStatementContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 118, GameMakerLanguageParser.RULE_regionStatement);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 657;
	        _la = this._input.LA(1);
	        if(!(_la===101 || _la===102)) {
	        this._errHandler.recoverInline(this);
	        }
	        else {
	        	this._errHandler.reportMatch(this);
	            this.consume();
	        }
	        this.state = 659;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===110) {
	            this.state = 658;
	            this.match(GameMakerLanguageParser.RegionCharacters);
	        }

	        this.state = 661;
	        _la = this._input.LA(1);
	        if(!(_la===-1 || _la===111)) {
	        this._errHandler.recoverInline(this);
	        }
	        else {
	        	this._errHandler.reportMatch(this);
	            this.consume();
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    identifierStatement() {
	    let localctx = new IdentifierStatementContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 120, GameMakerLanguageParser.RULE_identifierStatement);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 663;
	        this.identifier();
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    softKeyword() {
	    let localctx = new SoftKeywordContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 122, GameMakerLanguageParser.RULE_softKeyword);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 665;
	        this.match(GameMakerLanguageParser.Constructor);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    propertySoftKeyword() {
	    let localctx = new PropertySoftKeywordContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 124, GameMakerLanguageParser.RULE_propertySoftKeyword);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 667;
	        this.match(GameMakerLanguageParser.NoOneLiteral);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    openBlock() {
	    let localctx = new OpenBlockContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 126, GameMakerLanguageParser.RULE_openBlock);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 669;
	        _la = this._input.LA(1);
	        if(!(_la===12 || _la===15)) {
	        this._errHandler.recoverInline(this);
	        }
	        else {
	        	this._errHandler.reportMatch(this);
	            this.consume();
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    closeBlock() {
	    let localctx = new CloseBlockContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 128, GameMakerLanguageParser.RULE_closeBlock);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 671;
	        _la = this._input.LA(1);
	        if(!(_la===14 || _la===16)) {
	        this._errHandler.recoverInline(this);
	        }
	        else {
	        	this._errHandler.reportMatch(this);
	            this.consume();
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    eos() {
	    let localctx = new EosContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 130, GameMakerLanguageParser.RULE_eos);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 673;
	        this.match(GameMakerLanguageParser.SemiColon);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }



    macroToken() {
	    let localctx = new MacroTokenContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 132, GameMakerLanguageParser.RULE_macroToken);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 675;
	        _la = this._input.LA(1);
	        if(!((((_la) & ~0x1f) === 0 && ((1 << _la) & 4294967288) !== 0) || ((((_la - 32)) & ~0x1f) === 0 && ((1 << (_la - 32)) & 4294967295) !== 0) || ((((_la - 64)) & ~0x1f) === 0 && ((1 << (_la - 64)) & 4294967295) !== 0) || ((((_la - 96)) & ~0x1f) === 0 && ((1 << (_la - 96)) & 460683) !== 0))) {
	        this._errHandler.recoverInline(this);
	        }
	        else {
	        	this._errHandler.reportMatch(this);
	            this.consume();
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
    }


}

GameMakerLanguageParser.EOF = antlr4.Token.EOF;
GameMakerLanguageParser.MultiLineComment = 1;
GameMakerLanguageParser.SingleLineComment = 2;
GameMakerLanguageParser.OpenBracket = 3;
GameMakerLanguageParser.ListAccessor = 4;
GameMakerLanguageParser.MapAccessor = 5;
GameMakerLanguageParser.GridAccessor = 6;
GameMakerLanguageParser.ArrayAccessor = 7;
GameMakerLanguageParser.StructAccessor = 8;
GameMakerLanguageParser.CloseBracket = 9;
GameMakerLanguageParser.OpenParen = 10;
GameMakerLanguageParser.CloseParen = 11;
GameMakerLanguageParser.OpenBrace = 12;
GameMakerLanguageParser.TemplateStringEndExpression = 13;
GameMakerLanguageParser.CloseBrace = 14;
GameMakerLanguageParser.Begin = 15;
GameMakerLanguageParser.End = 16;
GameMakerLanguageParser.SemiColon = 17;
GameMakerLanguageParser.Comma = 18;
GameMakerLanguageParser.Assign = 19;
GameMakerLanguageParser.Colon = 20;
GameMakerLanguageParser.Dot = 21;
GameMakerLanguageParser.PlusPlus = 22;
GameMakerLanguageParser.MinusMinus = 23;
GameMakerLanguageParser.Plus = 24;
GameMakerLanguageParser.Minus = 25;
GameMakerLanguageParser.BitNot = 26;
GameMakerLanguageParser.Not = 27;
GameMakerLanguageParser.Multiply = 28;
GameMakerLanguageParser.Divide = 29;
GameMakerLanguageParser.IntegerDivide = 30;
GameMakerLanguageParser.Modulo = 31;
GameMakerLanguageParser.Power = 32;
GameMakerLanguageParser.QuestionMark = 33;
GameMakerLanguageParser.NullCoalesce = 34;
GameMakerLanguageParser.NullCoalescingAssign = 35;
GameMakerLanguageParser.RightShiftArithmetic = 36;
GameMakerLanguageParser.LeftShiftArithmetic = 37;
GameMakerLanguageParser.LessThan = 38;
GameMakerLanguageParser.MoreThan = 39;
GameMakerLanguageParser.LessThanEquals = 40;
GameMakerLanguageParser.GreaterThanEquals = 41;
GameMakerLanguageParser.Equals_ = 42;
GameMakerLanguageParser.NotEquals = 43;
GameMakerLanguageParser.BitAnd = 44;
GameMakerLanguageParser.BitXOr = 45;
GameMakerLanguageParser.BitOr = 46;
GameMakerLanguageParser.And = 47;
GameMakerLanguageParser.Or = 48;
GameMakerLanguageParser.Xor = 49;
GameMakerLanguageParser.MultiplyAssign = 50;
GameMakerLanguageParser.DivideAssign = 51;
GameMakerLanguageParser.PlusAssign = 52;
GameMakerLanguageParser.MinusAssign = 53;
GameMakerLanguageParser.ModulusAssign = 54;
GameMakerLanguageParser.LeftShiftArithmeticAssign = 55;
GameMakerLanguageParser.RightShiftArithmeticAssign = 56;
GameMakerLanguageParser.BitAndAssign = 57;
GameMakerLanguageParser.BitXorAssign = 58;
GameMakerLanguageParser.BitOrAssign = 59;
GameMakerLanguageParser.NumberSign = 60;
GameMakerLanguageParser.DollarSign = 61;
GameMakerLanguageParser.AtSign = 62;
GameMakerLanguageParser.UndefinedLiteral = 63;
GameMakerLanguageParser.NoOneLiteral = 64;
GameMakerLanguageParser.BooleanLiteral = 65;
GameMakerLanguageParser.IntegerLiteral = 66;
GameMakerLanguageParser.DecimalLiteral = 67;
GameMakerLanguageParser.BinaryLiteral = 68;
GameMakerLanguageParser.HexIntegerLiteral = 69;
GameMakerLanguageParser.Break = 70;
GameMakerLanguageParser.Exit = 71;
GameMakerLanguageParser.Do = 72;
GameMakerLanguageParser.Case = 73;
GameMakerLanguageParser.Else = 74;
GameMakerLanguageParser.New = 75;
GameMakerLanguageParser.Var = 76;
GameMakerLanguageParser.GlobalVar = 77;
GameMakerLanguageParser.Catch = 78;
GameMakerLanguageParser.Finally = 79;
GameMakerLanguageParser.Return = 80;
GameMakerLanguageParser.Continue = 81;
GameMakerLanguageParser.For = 82;
GameMakerLanguageParser.Switch = 83;
GameMakerLanguageParser.While = 84;
GameMakerLanguageParser.Until = 85;
GameMakerLanguageParser.Repeat = 86;
GameMakerLanguageParser.Function_ = 87;
GameMakerLanguageParser.With = 88;
GameMakerLanguageParser.Default = 89;
GameMakerLanguageParser.If = 90;
GameMakerLanguageParser.Then = 91;
GameMakerLanguageParser.Throw = 92;
GameMakerLanguageParser.Delete = 93;
GameMakerLanguageParser.Try = 94;
GameMakerLanguageParser.Enum = 95;
GameMakerLanguageParser.Constructor = 96;
GameMakerLanguageParser.Static = 97;
GameMakerLanguageParser.Macro = 98;
GameMakerLanguageParser.EscapedNewLine = 99;
GameMakerLanguageParser.Define = 100;
GameMakerLanguageParser.Region = 101;
GameMakerLanguageParser.EndRegion = 102;
GameMakerLanguageParser.Identifier = 103;
GameMakerLanguageParser.StringLiteral = 104;
GameMakerLanguageParser.TemplateStringStart = 105;
GameMakerLanguageParser.VerbatimStringLiteral = 106;
GameMakerLanguageParser.WhiteSpaces = 107;
GameMakerLanguageParser.LineTerminator = 108;
GameMakerLanguageParser.UnexpectedCharacter = 109;
GameMakerLanguageParser.RegionCharacters = 110;
GameMakerLanguageParser.RegionEOL = 111;
GameMakerLanguageParser.TemplateStringEnd = 112;
GameMakerLanguageParser.TemplateStringStartExpression = 113;
GameMakerLanguageParser.TemplateStringText = 114;

GameMakerLanguageParser.RULE_program = 0;
GameMakerLanguageParser.RULE_statementList = 1;
GameMakerLanguageParser.RULE_statement = 2;
GameMakerLanguageParser.RULE_block = 3;
GameMakerLanguageParser.RULE_ifStatement = 4;
GameMakerLanguageParser.RULE_iterationStatement = 5;
GameMakerLanguageParser.RULE_withStatement = 6;
GameMakerLanguageParser.RULE_switchStatement = 7;
GameMakerLanguageParser.RULE_continueStatement = 8;
GameMakerLanguageParser.RULE_breakStatement = 9;
GameMakerLanguageParser.RULE_exitStatement = 10;
GameMakerLanguageParser.RULE_emptyStatement = 11;
GameMakerLanguageParser.RULE_caseBlock = 12;
GameMakerLanguageParser.RULE_caseClauses = 13;
GameMakerLanguageParser.RULE_caseClause = 14;
GameMakerLanguageParser.RULE_defaultClause = 15;
GameMakerLanguageParser.RULE_throwStatement = 16;
GameMakerLanguageParser.RULE_tryStatement = 17;
GameMakerLanguageParser.RULE_catchProduction = 18;
GameMakerLanguageParser.RULE_finallyProduction = 19;
GameMakerLanguageParser.RULE_returnStatement = 20;
GameMakerLanguageParser.RULE_deleteStatement = 21;
GameMakerLanguageParser.RULE_assignmentExpression = 22;
GameMakerLanguageParser.RULE_variableDeclarationList = 23;
GameMakerLanguageParser.RULE_varModifier = 24;
GameMakerLanguageParser.RULE_variableDeclaration = 25;
GameMakerLanguageParser.RULE_globalVarStatement = 26;
GameMakerLanguageParser.RULE_newExpression = 27;
GameMakerLanguageParser.RULE_lValueStartExpression = 28;
GameMakerLanguageParser.RULE_lValueExpression = 29;
GameMakerLanguageParser.RULE_lValueChainOperator = 30;
GameMakerLanguageParser.RULE_lValueFinalOperator = 31;
GameMakerLanguageParser.RULE_expressionSequence = 32;
GameMakerLanguageParser.RULE_expressionOrFunction = 33;
GameMakerLanguageParser.RULE_expression = 34;
GameMakerLanguageParser.RULE_callStatement = 35;
GameMakerLanguageParser.RULE_callableExpression = 36;
GameMakerLanguageParser.RULE_incDecStatement = 37;
GameMakerLanguageParser.RULE_accessor = 38;
GameMakerLanguageParser.RULE_arguments = 39;
GameMakerLanguageParser.RULE_assignmentOperator = 40;
GameMakerLanguageParser.RULE_literal = 41;
GameMakerLanguageParser.RULE_templateStringLiteral = 42;
GameMakerLanguageParser.RULE_templateStringAtom = 43;
GameMakerLanguageParser.RULE_arrayLiteral = 44;
GameMakerLanguageParser.RULE_elementList = 45;
GameMakerLanguageParser.RULE_structLiteral = 46;
GameMakerLanguageParser.RULE_propertyAssignment = 47;
GameMakerLanguageParser.RULE_propertyIdentifier = 48;
GameMakerLanguageParser.RULE_functionDeclaration = 49;
GameMakerLanguageParser.RULE_constructorClause = 50;
GameMakerLanguageParser.RULE_parameterList = 51;
GameMakerLanguageParser.RULE_parameterArgument = 52;
GameMakerLanguageParser.RULE_identifier = 53;
GameMakerLanguageParser.RULE_enumeratorDeclaration = 54;
GameMakerLanguageParser.RULE_enumeratorList = 55;
GameMakerLanguageParser.RULE_enumerator = 56;
GameMakerLanguageParser.RULE_macroStatement = 57;
GameMakerLanguageParser.RULE_defineStatement = 58;
GameMakerLanguageParser.RULE_regionStatement = 59;
GameMakerLanguageParser.RULE_identifierStatement = 60;
GameMakerLanguageParser.RULE_softKeyword = 61;
GameMakerLanguageParser.RULE_propertySoftKeyword = 62;
GameMakerLanguageParser.RULE_openBlock = 63;
GameMakerLanguageParser.RULE_closeBlock = 64;
GameMakerLanguageParser.RULE_eos = 65;
GameMakerLanguageParser.RULE_macroToken = 66;

class ProgramContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_program;
    }

    EOF() {
	    return this.getToken(GameMakerLanguageParser.EOF, 0);
    }

    statementList() {
	    return this.getTypedRuleContext(StatementListContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitProgram(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class StatementListContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_statementList;
    }

    statement = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(StatementContext);
	    } else {
	        return this.getTypedRuleContext(StatementContext,i);
	    }
    };

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitStatementList(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class StatementContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_statement;
    }

    block() {
	    return this.getTypedRuleContext(BlockContext,0);
    }

    emptyStatement() {
	    return this.getTypedRuleContext(EmptyStatementContext,0);
    }

    ifStatement() {
	    return this.getTypedRuleContext(IfStatementContext,0);
    }

    variableDeclarationList() {
	    return this.getTypedRuleContext(VariableDeclarationListContext,0);
    }

    iterationStatement() {
	    return this.getTypedRuleContext(IterationStatementContext,0);
    }

    continueStatement() {
	    return this.getTypedRuleContext(ContinueStatementContext,0);
    }

    breakStatement() {
	    return this.getTypedRuleContext(BreakStatementContext,0);
    }

    returnStatement() {
	    return this.getTypedRuleContext(ReturnStatementContext,0);
    }

    withStatement() {
	    return this.getTypedRuleContext(WithStatementContext,0);
    }

    switchStatement() {
	    return this.getTypedRuleContext(SwitchStatementContext,0);
    }

    tryStatement() {
	    return this.getTypedRuleContext(TryStatementContext,0);
    }

    throwStatement() {
	    return this.getTypedRuleContext(ThrowStatementContext,0);
    }

    exitStatement() {
	    return this.getTypedRuleContext(ExitStatementContext,0);
    }

    macroStatement() {
	    return this.getTypedRuleContext(MacroStatementContext,0);
    }

    defineStatement() {
	    return this.getTypedRuleContext(DefineStatementContext,0);
    }

    regionStatement() {
	    return this.getTypedRuleContext(RegionStatementContext,0);
    }

    enumeratorDeclaration() {
	    return this.getTypedRuleContext(EnumeratorDeclarationContext,0);
    }

    globalVarStatement() {
	    return this.getTypedRuleContext(GlobalVarStatementContext,0);
    }

    assignmentExpression() {
	    return this.getTypedRuleContext(AssignmentExpressionContext,0);
    }

    incDecStatement() {
	    return this.getTypedRuleContext(IncDecStatementContext,0);
    }

    callStatement() {
	    return this.getTypedRuleContext(CallStatementContext,0);
    }

    functionDeclaration() {
	    return this.getTypedRuleContext(FunctionDeclarationContext,0);
    }

    eos() {
	    return this.getTypedRuleContext(EosContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitStatement(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class BlockContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_block;
    }

    openBlock() {
	    return this.getTypedRuleContext(OpenBlockContext,0);
    }

    closeBlock() {
	    return this.getTypedRuleContext(CloseBlockContext,0);
    }

    statementList() {
	    return this.getTypedRuleContext(StatementListContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitBlock(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class IfStatementContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_ifStatement;
    }

    If() {
	    return this.getToken(GameMakerLanguageParser.If, 0);
    }

    expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
    }

    statement = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(StatementContext);
	    } else {
	        return this.getTypedRuleContext(StatementContext,i);
	    }
    };

    Then() {
	    return this.getToken(GameMakerLanguageParser.Then, 0);
    }

    Else() {
	    return this.getToken(GameMakerLanguageParser.Else, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitIfStatement(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class IterationStatementContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_iterationStatement;
    }


	 
    copyFrom(ctx) {
        super.copyFrom(ctx);
    }

}


class DoStatementContext extends IterationStatementContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    Do() {
	    return this.getToken(GameMakerLanguageParser.Do, 0);
    }

    statement() {
	    return this.getTypedRuleContext(StatementContext,0);
    }

    Until() {
	    return this.getToken(GameMakerLanguageParser.Until, 0);
    }

    expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitDoStatement(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.DoStatementContext = DoStatementContext;

class WhileStatementContext extends IterationStatementContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    While() {
	    return this.getToken(GameMakerLanguageParser.While, 0);
    }

    expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
    }

    statement() {
	    return this.getTypedRuleContext(StatementContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitWhileStatement(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.WhileStatementContext = WhileStatementContext;

class ForStatementContext extends IterationStatementContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    For() {
	    return this.getToken(GameMakerLanguageParser.For, 0);
    }

    OpenParen() {
	    return this.getToken(GameMakerLanguageParser.OpenParen, 0);
    }

    SemiColon = function(i) {
        if(i===undefined) {
            i = null;
        }
	    if(i===null) {
	        return this.getTokens(GameMakerLanguageParser.SemiColon);
	    } else {
	        return this.getToken(GameMakerLanguageParser.SemiColon, i);
	    }
    };


    CloseParen() {
	    return this.getToken(GameMakerLanguageParser.CloseParen, 0);
    }

    statement = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(StatementContext);
	    } else {
	        return this.getTypedRuleContext(StatementContext,i);
	    }
    };

    variableDeclarationList() {
	    return this.getTypedRuleContext(VariableDeclarationListContext,0);
    }

    assignmentExpression() {
	    return this.getTypedRuleContext(AssignmentExpressionContext,0);
    }

    expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitForStatement(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.ForStatementContext = ForStatementContext;

class RepeatStatementContext extends IterationStatementContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    Repeat() {
	    return this.getToken(GameMakerLanguageParser.Repeat, 0);
    }

    expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
    }

    statement() {
	    return this.getTypedRuleContext(StatementContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitRepeatStatement(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.RepeatStatementContext = RepeatStatementContext;

class WithStatementContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_withStatement;
    }

    With() {
	    return this.getToken(GameMakerLanguageParser.With, 0);
    }

    expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
    }

    statement() {
	    return this.getTypedRuleContext(StatementContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitWithStatement(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class SwitchStatementContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_switchStatement;
    }

    Switch() {
	    return this.getToken(GameMakerLanguageParser.Switch, 0);
    }

    expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
    }

    caseBlock() {
	    return this.getTypedRuleContext(CaseBlockContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitSwitchStatement(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class ContinueStatementContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_continueStatement;
    }

    Continue() {
	    return this.getToken(GameMakerLanguageParser.Continue, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitContinueStatement(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class BreakStatementContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_breakStatement;
    }

    Break() {
	    return this.getToken(GameMakerLanguageParser.Break, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitBreakStatement(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class ExitStatementContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_exitStatement;
    }

    Exit() {
	    return this.getToken(GameMakerLanguageParser.Exit, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitExitStatement(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class EmptyStatementContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_emptyStatement;
    }

    SemiColon() {
	    return this.getToken(GameMakerLanguageParser.SemiColon, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitEmptyStatement(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class CaseBlockContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_caseBlock;
    }

    openBlock() {
	    return this.getTypedRuleContext(OpenBlockContext,0);
    }

    closeBlock() {
	    return this.getTypedRuleContext(CloseBlockContext,0);
    }

    caseClauses = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(CaseClausesContext);
	    } else {
	        return this.getTypedRuleContext(CaseClausesContext,i);
	    }
    };

    defaultClause() {
	    return this.getTypedRuleContext(DefaultClauseContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitCaseBlock(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class CaseClausesContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_caseClauses;
    }

    caseClause = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(CaseClauseContext);
	    } else {
	        return this.getTypedRuleContext(CaseClauseContext,i);
	    }
    };

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitCaseClauses(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class CaseClauseContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_caseClause;
    }

    Case() {
	    return this.getToken(GameMakerLanguageParser.Case, 0);
    }

    expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
    }

    Colon() {
	    return this.getToken(GameMakerLanguageParser.Colon, 0);
    }

    statementList() {
	    return this.getTypedRuleContext(StatementListContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitCaseClause(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class DefaultClauseContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_defaultClause;
    }

    Default() {
	    return this.getToken(GameMakerLanguageParser.Default, 0);
    }

    Colon() {
	    return this.getToken(GameMakerLanguageParser.Colon, 0);
    }

    statementList() {
	    return this.getTypedRuleContext(StatementListContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitDefaultClause(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class ThrowStatementContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_throwStatement;
    }

    Throw() {
	    return this.getToken(GameMakerLanguageParser.Throw, 0);
    }

    expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitThrowStatement(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class TryStatementContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_tryStatement;
    }

    Try() {
	    return this.getToken(GameMakerLanguageParser.Try, 0);
    }

    statement() {
	    return this.getTypedRuleContext(StatementContext,0);
    }

    catchProduction() {
	    return this.getTypedRuleContext(CatchProductionContext,0);
    }

    finallyProduction() {
	    return this.getTypedRuleContext(FinallyProductionContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitTryStatement(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class CatchProductionContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_catchProduction;
    }

    Catch() {
	    return this.getToken(GameMakerLanguageParser.Catch, 0);
    }

    statement() {
	    return this.getTypedRuleContext(StatementContext,0);
    }

    OpenParen() {
	    return this.getToken(GameMakerLanguageParser.OpenParen, 0);
    }

    CloseParen() {
	    return this.getToken(GameMakerLanguageParser.CloseParen, 0);
    }

    identifier() {
	    return this.getTypedRuleContext(IdentifierContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitCatchProduction(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class FinallyProductionContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_finallyProduction;
    }

    Finally() {
	    return this.getToken(GameMakerLanguageParser.Finally, 0);
    }

    statement() {
	    return this.getTypedRuleContext(StatementContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitFinallyProduction(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class ReturnStatementContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_returnStatement;
    }

    Return() {
	    return this.getToken(GameMakerLanguageParser.Return, 0);
    }

    expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitReturnStatement(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class DeleteStatementContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_deleteStatement;
    }

    Delete() {
	    return this.getToken(GameMakerLanguageParser.Delete, 0);
    }

    expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitDeleteStatement(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class AssignmentExpressionContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_assignmentExpression;
    }

    lValueExpression() {
	    return this.getTypedRuleContext(LValueExpressionContext,0);
    }

    assignmentOperator() {
	    return this.getTypedRuleContext(AssignmentOperatorContext,0);
    }

    expressionOrFunction() {
	    return this.getTypedRuleContext(ExpressionOrFunctionContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitAssignmentExpression(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class VariableDeclarationListContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_variableDeclarationList;
    }

    varModifier() {
	    return this.getTypedRuleContext(VarModifierContext,0);
    }

    variableDeclaration = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(VariableDeclarationContext);
	    } else {
	        return this.getTypedRuleContext(VariableDeclarationContext,i);
	    }
    };

    Comma = function(i) {
        if(i===undefined) {
            i = null;
        }
	    if(i===null) {
	        return this.getTokens(GameMakerLanguageParser.Comma);
	    } else {
	        return this.getToken(GameMakerLanguageParser.Comma, i);
	    }
    };


    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitVariableDeclarationList(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class VarModifierContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_varModifier;
    }

    Var = function(i) {
        if(i===undefined) {
            i = null;
        }
	    if(i===null) {
	        return this.getTokens(GameMakerLanguageParser.Var);
	    } else {
	        return this.getToken(GameMakerLanguageParser.Var, i);
	    }
    };


    Static() {
	    return this.getToken(GameMakerLanguageParser.Static, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitVarModifier(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class VariableDeclarationContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_variableDeclaration;
    }

    identifier() {
	    return this.getTypedRuleContext(IdentifierContext,0);
    }

    Assign() {
	    return this.getToken(GameMakerLanguageParser.Assign, 0);
    }

    expressionOrFunction() {
	    return this.getTypedRuleContext(ExpressionOrFunctionContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitVariableDeclaration(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class GlobalVarStatementContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_globalVarStatement;
    }

    GlobalVar() {
	    return this.getToken(GameMakerLanguageParser.GlobalVar, 0);
    }

    identifier = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(IdentifierContext);
	    } else {
	        return this.getTypedRuleContext(IdentifierContext,i);
	    }
    };

    SemiColon() {
	    return this.getToken(GameMakerLanguageParser.SemiColon, 0);
    }

    Comma = function(i) {
        if(i===undefined) {
            i = null;
        }
	    if(i===null) {
	        return this.getTokens(GameMakerLanguageParser.Comma);
	    } else {
	        return this.getToken(GameMakerLanguageParser.Comma, i);
	    }
    };


    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitGlobalVarStatement(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class NewExpressionContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_newExpression;
    }

    New() {
	    return this.getToken(GameMakerLanguageParser.New, 0);
    }

    identifier() {
	    return this.getTypedRuleContext(IdentifierContext,0);
    }

    arguments() {
	    return this.getTypedRuleContext(ArgumentsContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitNewExpression(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class LValueStartExpressionContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_lValueStartExpression;
    }


	 
    copyFrom(ctx) {
        super.copyFrom(ctx);
    }

}


class NewLValueContext extends LValueStartExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    newExpression() {
	    return this.getTypedRuleContext(NewExpressionContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitNewLValue(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.NewLValueContext = NewLValueContext;

class IdentifierLValueContext extends LValueStartExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    identifier() {
	    return this.getTypedRuleContext(IdentifierContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitIdentifierLValue(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.IdentifierLValueContext = IdentifierLValueContext;

class LValueExpressionContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_lValueExpression;
    }

    lValueStartExpression() {
	    return this.getTypedRuleContext(LValueStartExpressionContext,0);
    }

    lValueFinalOperator() {
	    return this.getTypedRuleContext(LValueFinalOperatorContext,0);
    }

    lValueChainOperator = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(LValueChainOperatorContext);
	    } else {
	        return this.getTypedRuleContext(LValueChainOperatorContext,i);
	    }
    };

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitLValueExpression(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class LValueChainOperatorContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_lValueChainOperator;
    }


	 
    copyFrom(ctx) {
        super.copyFrom(ctx);
    }

}


class MemberDotLValueContext extends LValueChainOperatorContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    Dot() {
	    return this.getToken(GameMakerLanguageParser.Dot, 0);
    }

    identifier() {
	    return this.getTypedRuleContext(IdentifierContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitMemberDotLValue(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.MemberDotLValueContext = MemberDotLValueContext;

class CallLValueContext extends LValueChainOperatorContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    arguments() {
	    return this.getTypedRuleContext(ArgumentsContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitCallLValue(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.CallLValueContext = CallLValueContext;

class MemberIndexLValueContext extends LValueChainOperatorContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    accessor() {
	    return this.getTypedRuleContext(AccessorContext,0);
    }

    expressionSequence() {
	    return this.getTypedRuleContext(ExpressionSequenceContext,0);
    }

    CloseBracket() {
	    return this.getToken(GameMakerLanguageParser.CloseBracket, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitMemberIndexLValue(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.MemberIndexLValueContext = MemberIndexLValueContext;

class LValueFinalOperatorContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_lValueFinalOperator;
    }


	 
    copyFrom(ctx) {
        super.copyFrom(ctx);
    }

}


class MemberDotLValueFinalContext extends LValueFinalOperatorContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    Dot() {
	    return this.getToken(GameMakerLanguageParser.Dot, 0);
    }

    identifier() {
	    return this.getTypedRuleContext(IdentifierContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitMemberDotLValueFinal(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.MemberDotLValueFinalContext = MemberDotLValueFinalContext;

class MemberIndexLValueFinalContext extends LValueFinalOperatorContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    accessor() {
	    return this.getTypedRuleContext(AccessorContext,0);
    }

    expressionSequence() {
	    return this.getTypedRuleContext(ExpressionSequenceContext,0);
    }

    CloseBracket() {
	    return this.getToken(GameMakerLanguageParser.CloseBracket, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitMemberIndexLValueFinal(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.MemberIndexLValueFinalContext = MemberIndexLValueFinalContext;

class ExpressionSequenceContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_expressionSequence;
    }

    expression = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(ExpressionContext);
	    } else {
	        return this.getTypedRuleContext(ExpressionContext,i);
	    }
    };

    Comma = function(i) {
        if(i===undefined) {
            i = null;
        }
	    if(i===null) {
	        return this.getTokens(GameMakerLanguageParser.Comma);
	    } else {
	        return this.getToken(GameMakerLanguageParser.Comma, i);
	    }
    };


    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitExpressionSequence(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class ExpressionOrFunctionContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_expressionOrFunction;
    }

    expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
    }

    functionDeclaration() {
	    return this.getTypedRuleContext(FunctionDeclarationContext,0);
    }

    OpenParen() {
	    return this.getToken(GameMakerLanguageParser.OpenParen, 0);
    }

    expressionOrFunction() {
	    return this.getTypedRuleContext(ExpressionOrFunctionContext,0);
    }

    CloseParen() {
	    return this.getToken(GameMakerLanguageParser.CloseParen, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitExpressionOrFunction(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class ExpressionContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_expression;
    }


	 
    copyFrom(ctx) {
        super.copyFrom(ctx);
    }

}


class ParenthesizedExpressionContext extends ExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    OpenParen() {
	    return this.getToken(GameMakerLanguageParser.OpenParen, 0);
    }

    expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
    }

    CloseParen() {
	    return this.getToken(GameMakerLanguageParser.CloseParen, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitParenthesizedExpression(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.ParenthesizedExpressionContext = ParenthesizedExpressionContext;

class AdditiveExpressionContext extends ExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    expression = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(ExpressionContext);
	    } else {
	        return this.getTypedRuleContext(ExpressionContext,i);
	    }
    };

    Plus() {
	    return this.getToken(GameMakerLanguageParser.Plus, 0);
    }

    Minus() {
	    return this.getToken(GameMakerLanguageParser.Minus, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitAdditiveExpression(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.AdditiveExpressionContext = AdditiveExpressionContext;

class RelationalExpressionContext extends ExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    expression = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(ExpressionContext);
	    } else {
	        return this.getTypedRuleContext(ExpressionContext,i);
	    }
    };

    LessThan() {
	    return this.getToken(GameMakerLanguageParser.LessThan, 0);
    }

    MoreThan() {
	    return this.getToken(GameMakerLanguageParser.MoreThan, 0);
    }

    LessThanEquals() {
	    return this.getToken(GameMakerLanguageParser.LessThanEquals, 0);
    }

    GreaterThanEquals() {
	    return this.getToken(GameMakerLanguageParser.GreaterThanEquals, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitRelationalExpression(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.RelationalExpressionContext = RelationalExpressionContext;

class TernaryExpressionContext extends ExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    expression = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(ExpressionContext);
	    } else {
	        return this.getTypedRuleContext(ExpressionContext,i);
	    }
    };

    QuestionMark() {
	    return this.getToken(GameMakerLanguageParser.QuestionMark, 0);
    }

    Colon() {
	    return this.getToken(GameMakerLanguageParser.Colon, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitTernaryExpression(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.TernaryExpressionContext = TernaryExpressionContext;

class LogicalAndExpressionContext extends ExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    expression = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(ExpressionContext);
	    } else {
	        return this.getTypedRuleContext(ExpressionContext,i);
	    }
    };

    And() {
	    return this.getToken(GameMakerLanguageParser.And, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitLogicalAndExpression(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.LogicalAndExpressionContext = LogicalAndExpressionContext;

class BitNotExpressionContext extends ExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    BitNot() {
	    return this.getToken(GameMakerLanguageParser.BitNot, 0);
    }

    expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitBitNotExpression(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.BitNotExpressionContext = BitNotExpressionContext;

class LiteralExpressionContext extends ExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    literal() {
	    return this.getTypedRuleContext(LiteralContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitLiteralExpression(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.LiteralExpressionContext = LiteralExpressionContext;

class LogicalOrExpressionContext extends ExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    expression = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(ExpressionContext);
	    } else {
	        return this.getTypedRuleContext(ExpressionContext,i);
	    }
    };

    Or() {
	    return this.getToken(GameMakerLanguageParser.Or, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitLogicalOrExpression(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.LogicalOrExpressionContext = LogicalOrExpressionContext;

class VariableExpressionContext extends ExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    lValueExpression() {
	    return this.getTypedRuleContext(LValueExpressionContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitVariableExpression(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.VariableExpressionContext = VariableExpressionContext;

class NotExpressionContext extends ExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    Not() {
	    return this.getToken(GameMakerLanguageParser.Not, 0);
    }

    expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitNotExpression(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.NotExpressionContext = NotExpressionContext;

class UnaryMinusExpressionContext extends ExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    Minus() {
	    return this.getToken(GameMakerLanguageParser.Minus, 0);
    }

    expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitUnaryMinusExpression(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.UnaryMinusExpressionContext = UnaryMinusExpressionContext;

class BitAndExpressionContext extends ExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    expression = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(ExpressionContext);
	    } else {
	        return this.getTypedRuleContext(ExpressionContext,i);
	    }
    };

    BitAnd() {
	    return this.getToken(GameMakerLanguageParser.BitAnd, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitBitAndExpression(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.BitAndExpressionContext = BitAndExpressionContext;

class LogicalXorExpressionContext extends ExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    expression = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(ExpressionContext);
	    } else {
	        return this.getTypedRuleContext(ExpressionContext,i);
	    }
    };

    Xor() {
	    return this.getToken(GameMakerLanguageParser.Xor, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitLogicalXorExpression(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.LogicalXorExpressionContext = LogicalXorExpressionContext;

class BitOrExpressionContext extends ExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    expression = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(ExpressionContext);
	    } else {
	        return this.getTypedRuleContext(ExpressionContext,i);
	    }
    };

    BitOr() {
	    return this.getToken(GameMakerLanguageParser.BitOr, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitBitOrExpression(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.BitOrExpressionContext = BitOrExpressionContext;

class IncDecExpressionContext extends ExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    incDecStatement() {
	    return this.getTypedRuleContext(IncDecStatementContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitIncDecExpression(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.IncDecExpressionContext = IncDecExpressionContext;

class EqualityExpressionContext extends ExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    expression = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(ExpressionContext);
	    } else {
	        return this.getTypedRuleContext(ExpressionContext,i);
	    }
    };

    Equals_() {
	    return this.getToken(GameMakerLanguageParser.Equals_, 0);
    }

    Assign() {
	    return this.getToken(GameMakerLanguageParser.Assign, 0);
    }

    NotEquals() {
	    return this.getToken(GameMakerLanguageParser.NotEquals, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitEqualityExpression(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.EqualityExpressionContext = EqualityExpressionContext;

class BitXOrExpressionContext extends ExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    expression = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(ExpressionContext);
	    } else {
	        return this.getTypedRuleContext(ExpressionContext,i);
	    }
    };

    BitXOr() {
	    return this.getToken(GameMakerLanguageParser.BitXOr, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitBitXOrExpression(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.BitXOrExpressionContext = BitXOrExpressionContext;

class CallExpressionContext extends ExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    callStatement() {
	    return this.getTypedRuleContext(CallStatementContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitCallExpression(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.CallExpressionContext = CallExpressionContext;

class MultiplicativeExpressionContext extends ExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    expression = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(ExpressionContext);
	    } else {
	        return this.getTypedRuleContext(ExpressionContext,i);
	    }
    };

    Multiply() {
	    return this.getToken(GameMakerLanguageParser.Multiply, 0);
    }

    Divide() {
	    return this.getToken(GameMakerLanguageParser.Divide, 0);
    }

    Modulo() {
	    return this.getToken(GameMakerLanguageParser.Modulo, 0);
    }

    IntegerDivide() {
	    return this.getToken(GameMakerLanguageParser.IntegerDivide, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitMultiplicativeExpression(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.MultiplicativeExpressionContext = MultiplicativeExpressionContext;

class CoalesceExpressionContext extends ExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    expression = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(ExpressionContext);
	    } else {
	        return this.getTypedRuleContext(ExpressionContext,i);
	    }
    };

    NullCoalesce() {
	    return this.getToken(GameMakerLanguageParser.NullCoalesce, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitCoalesceExpression(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.CoalesceExpressionContext = CoalesceExpressionContext;

class BitShiftExpressionContext extends ExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    expression = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(ExpressionContext);
	    } else {
	        return this.getTypedRuleContext(ExpressionContext,i);
	    }
    };

    LeftShiftArithmetic() {
	    return this.getToken(GameMakerLanguageParser.LeftShiftArithmetic, 0);
    }

    RightShiftArithmetic() {
	    return this.getToken(GameMakerLanguageParser.RightShiftArithmetic, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitBitShiftExpression(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.BitShiftExpressionContext = BitShiftExpressionContext;

class CallStatementContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_callStatement;
    }

    callableExpression() {
	    return this.getTypedRuleContext(CallableExpressionContext,0);
    }

    arguments() {
	    return this.getTypedRuleContext(ArgumentsContext,0);
    }

    callStatement() {
	    return this.getTypedRuleContext(CallStatementContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitCallStatement(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class CallableExpressionContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_callableExpression;
    }

    lValueExpression() {
	    return this.getTypedRuleContext(LValueExpressionContext,0);
    }

    OpenParen() {
	    return this.getToken(GameMakerLanguageParser.OpenParen, 0);
    }

    CloseParen() {
	    return this.getToken(GameMakerLanguageParser.CloseParen, 0);
    }

    functionDeclaration() {
	    return this.getTypedRuleContext(FunctionDeclarationContext,0);
    }

    callableExpression() {
	    return this.getTypedRuleContext(CallableExpressionContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitCallableExpression(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class IncDecStatementContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_incDecStatement;
    }


	 
    copyFrom(ctx) {
        super.copyFrom(ctx);
    }

}


class PostIncDecExpressionContext extends IncDecStatementContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    lValueExpression() {
	    return this.getTypedRuleContext(LValueExpressionContext,0);
    }

    PlusPlus() {
	    return this.getToken(GameMakerLanguageParser.PlusPlus, 0);
    }

    MinusMinus() {
	    return this.getToken(GameMakerLanguageParser.MinusMinus, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitPostIncDecExpression(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.PostIncDecExpressionContext = PostIncDecExpressionContext;

class PreIncDecExpressionContext extends IncDecStatementContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

    lValueExpression() {
	    return this.getTypedRuleContext(LValueExpressionContext,0);
    }

    PlusPlus() {
	    return this.getToken(GameMakerLanguageParser.PlusPlus, 0);
    }

    MinusMinus() {
	    return this.getToken(GameMakerLanguageParser.MinusMinus, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitPreIncDecExpression(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}

GameMakerLanguageParser.PreIncDecExpressionContext = PreIncDecExpressionContext;

class AccessorContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_accessor;
    }

    OpenBracket() {
	    return this.getToken(GameMakerLanguageParser.OpenBracket, 0);
    }

    ListAccessor() {
	    return this.getToken(GameMakerLanguageParser.ListAccessor, 0);
    }

    MapAccessor() {
	    return this.getToken(GameMakerLanguageParser.MapAccessor, 0);
    }

    GridAccessor() {
	    return this.getToken(GameMakerLanguageParser.GridAccessor, 0);
    }

    ArrayAccessor() {
	    return this.getToken(GameMakerLanguageParser.ArrayAccessor, 0);
    }

    StructAccessor() {
	    return this.getToken(GameMakerLanguageParser.StructAccessor, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitAccessor(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class ArgumentsContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_arguments;
    }

    OpenParen() {
	    return this.getToken(GameMakerLanguageParser.OpenParen, 0);
    }

    CloseParen() {
	    return this.getToken(GameMakerLanguageParser.CloseParen, 0);
    }

    expressionOrFunction = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(ExpressionOrFunctionContext);
	    } else {
	        return this.getTypedRuleContext(ExpressionOrFunctionContext,i);
	    }
    };

    Comma = function(i) {
        if(i===undefined) {
            i = null;
        }
	    if(i===null) {
	        return this.getTokens(GameMakerLanguageParser.Comma);
	    } else {
	        return this.getToken(GameMakerLanguageParser.Comma, i);
	    }
    };


    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitArguments(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class AssignmentOperatorContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_assignmentOperator;
    }

    MultiplyAssign() {
	    return this.getToken(GameMakerLanguageParser.MultiplyAssign, 0);
    }

    DivideAssign() {
	    return this.getToken(GameMakerLanguageParser.DivideAssign, 0);
    }

    ModulusAssign() {
	    return this.getToken(GameMakerLanguageParser.ModulusAssign, 0);
    }

    PlusAssign() {
	    return this.getToken(GameMakerLanguageParser.PlusAssign, 0);
    }

    MinusAssign() {
	    return this.getToken(GameMakerLanguageParser.MinusAssign, 0);
    }

    LeftShiftArithmeticAssign() {
	    return this.getToken(GameMakerLanguageParser.LeftShiftArithmeticAssign, 0);
    }

    RightShiftArithmeticAssign() {
	    return this.getToken(GameMakerLanguageParser.RightShiftArithmeticAssign, 0);
    }

    BitAndAssign() {
	    return this.getToken(GameMakerLanguageParser.BitAndAssign, 0);
    }

    BitXorAssign() {
	    return this.getToken(GameMakerLanguageParser.BitXorAssign, 0);
    }

    BitOrAssign() {
	    return this.getToken(GameMakerLanguageParser.BitOrAssign, 0);
    }

    NullCoalescingAssign() {
	    return this.getToken(GameMakerLanguageParser.NullCoalescingAssign, 0);
    }

    Assign() {
	    return this.getToken(GameMakerLanguageParser.Assign, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitAssignmentOperator(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class LiteralContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_literal;
    }

    UndefinedLiteral() {
	    return this.getToken(GameMakerLanguageParser.UndefinedLiteral, 0);
    }

    NoOneLiteral() {
	    return this.getToken(GameMakerLanguageParser.NoOneLiteral, 0);
    }

    BooleanLiteral() {
	    return this.getToken(GameMakerLanguageParser.BooleanLiteral, 0);
    }

    StringLiteral() {
	    return this.getToken(GameMakerLanguageParser.StringLiteral, 0);
    }

    VerbatimStringLiteral() {
	    return this.getToken(GameMakerLanguageParser.VerbatimStringLiteral, 0);
    }

    templateStringLiteral() {
	    return this.getTypedRuleContext(TemplateStringLiteralContext,0);
    }

    HexIntegerLiteral() {
	    return this.getToken(GameMakerLanguageParser.HexIntegerLiteral, 0);
    }

    BinaryLiteral() {
	    return this.getToken(GameMakerLanguageParser.BinaryLiteral, 0);
    }

    DecimalLiteral() {
	    return this.getToken(GameMakerLanguageParser.DecimalLiteral, 0);
    }

    IntegerLiteral() {
	    return this.getToken(GameMakerLanguageParser.IntegerLiteral, 0);
    }

    arrayLiteral() {
	    return this.getTypedRuleContext(ArrayLiteralContext,0);
    }

    structLiteral() {
	    return this.getTypedRuleContext(StructLiteralContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitLiteral(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class TemplateStringLiteralContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_templateStringLiteral;
    }

    TemplateStringStart() {
	    return this.getToken(GameMakerLanguageParser.TemplateStringStart, 0);
    }

    TemplateStringEnd() {
	    return this.getToken(GameMakerLanguageParser.TemplateStringEnd, 0);
    }

    templateStringAtom = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(TemplateStringAtomContext);
	    } else {
	        return this.getTypedRuleContext(TemplateStringAtomContext,i);
	    }
    };

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitTemplateStringLiteral(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class TemplateStringAtomContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_templateStringAtom;
    }

    TemplateStringText() {
	    return this.getToken(GameMakerLanguageParser.TemplateStringText, 0);
    }

    TemplateStringStartExpression() {
	    return this.getToken(GameMakerLanguageParser.TemplateStringStartExpression, 0);
    }

    expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
    }

    TemplateStringEndExpression() {
	    return this.getToken(GameMakerLanguageParser.TemplateStringEndExpression, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitTemplateStringAtom(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class ArrayLiteralContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_arrayLiteral;
    }

    OpenBracket() {
	    return this.getToken(GameMakerLanguageParser.OpenBracket, 0);
    }

    elementList() {
	    return this.getTypedRuleContext(ElementListContext,0);
    }

    CloseBracket() {
	    return this.getToken(GameMakerLanguageParser.CloseBracket, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitArrayLiteral(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class ElementListContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_elementList;
    }

    Comma = function(i) {
        if(i===undefined) {
            i = null;
        }
	    if(i===null) {
	        return this.getTokens(GameMakerLanguageParser.Comma);
	    } else {
	        return this.getToken(GameMakerLanguageParser.Comma, i);
	    }
    };


    expressionOrFunction = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(ExpressionOrFunctionContext);
	    } else {
	        return this.getTypedRuleContext(ExpressionOrFunctionContext,i);
	    }
    };

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitElementList(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class StructLiteralContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_structLiteral;
    }

    openBlock() {
	    return this.getTypedRuleContext(OpenBlockContext,0);
    }

    closeBlock() {
	    return this.getTypedRuleContext(CloseBlockContext,0);
    }

    propertyAssignment = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(PropertyAssignmentContext);
	    } else {
	        return this.getTypedRuleContext(PropertyAssignmentContext,i);
	    }
    };

    Comma = function(i) {
        if(i===undefined) {
            i = null;
        }
	    if(i===null) {
	        return this.getTokens(GameMakerLanguageParser.Comma);
	    } else {
	        return this.getToken(GameMakerLanguageParser.Comma, i);
	    }
    };


    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitStructLiteral(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class PropertyAssignmentContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_propertyAssignment;
    }

    propertyIdentifier() {
	    return this.getTypedRuleContext(PropertyIdentifierContext,0);
    }

    Colon() {
	    return this.getToken(GameMakerLanguageParser.Colon, 0);
    }

    expressionOrFunction() {
	    return this.getTypedRuleContext(ExpressionOrFunctionContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitPropertyAssignment(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class PropertyIdentifierContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_propertyIdentifier;
    }

    Identifier() {
	    return this.getToken(GameMakerLanguageParser.Identifier, 0);
    }

    softKeyword() {
	    return this.getTypedRuleContext(SoftKeywordContext,0);
    }

    propertySoftKeyword() {
	    return this.getTypedRuleContext(PropertySoftKeywordContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitPropertyIdentifier(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class FunctionDeclarationContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_functionDeclaration;
    }

    Function_() {
	    return this.getToken(GameMakerLanguageParser.Function_, 0);
    }

    parameterList() {
	    return this.getTypedRuleContext(ParameterListContext,0);
    }

    block() {
	    return this.getTypedRuleContext(BlockContext,0);
    }

    Identifier() {
	    return this.getToken(GameMakerLanguageParser.Identifier, 0);
    }

    constructorClause() {
	    return this.getTypedRuleContext(ConstructorClauseContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitFunctionDeclaration(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class ConstructorClauseContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_constructorClause;
    }

    Constructor() {
	    return this.getToken(GameMakerLanguageParser.Constructor, 0);
    }

    Colon() {
	    return this.getToken(GameMakerLanguageParser.Colon, 0);
    }

    Identifier() {
	    return this.getToken(GameMakerLanguageParser.Identifier, 0);
    }

    parameterList() {
	    return this.getTypedRuleContext(ParameterListContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitConstructorClause(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class ParameterListContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_parameterList;
    }

    OpenParen() {
	    return this.getToken(GameMakerLanguageParser.OpenParen, 0);
    }

    CloseParen() {
	    return this.getToken(GameMakerLanguageParser.CloseParen, 0);
    }

    parameterArgument = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(ParameterArgumentContext);
	    } else {
	        return this.getTypedRuleContext(ParameterArgumentContext,i);
	    }
    };

    Comma = function(i) {
        if(i===undefined) {
            i = null;
        }
	    if(i===null) {
	        return this.getTokens(GameMakerLanguageParser.Comma);
	    } else {
	        return this.getToken(GameMakerLanguageParser.Comma, i);
	    }
    };


    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitParameterList(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class ParameterArgumentContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_parameterArgument;
    }

    identifier() {
	    return this.getTypedRuleContext(IdentifierContext,0);
    }

    Assign() {
	    return this.getToken(GameMakerLanguageParser.Assign, 0);
    }

    expressionOrFunction() {
	    return this.getTypedRuleContext(ExpressionOrFunctionContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitParameterArgument(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class IdentifierContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_identifier;
    }

    Identifier() {
	    return this.getToken(GameMakerLanguageParser.Identifier, 0);
    }

    softKeyword() {
	    return this.getTypedRuleContext(SoftKeywordContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitIdentifier(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class EnumeratorDeclarationContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_enumeratorDeclaration;
    }

    Enum() {
	    return this.getToken(GameMakerLanguageParser.Enum, 0);
    }

    identifier() {
	    return this.getTypedRuleContext(IdentifierContext,0);
    }

    openBlock() {
	    return this.getTypedRuleContext(OpenBlockContext,0);
    }

    closeBlock() {
	    return this.getTypedRuleContext(CloseBlockContext,0);
    }

    enumeratorList() {
	    return this.getTypedRuleContext(EnumeratorListContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitEnumeratorDeclaration(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class EnumeratorListContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_enumeratorList;
    }

    enumerator = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(EnumeratorContext);
	    } else {
	        return this.getTypedRuleContext(EnumeratorContext,i);
	    }
    };

    Comma = function(i) {
        if(i===undefined) {
            i = null;
        }
	    if(i===null) {
	        return this.getTokens(GameMakerLanguageParser.Comma);
	    } else {
	        return this.getToken(GameMakerLanguageParser.Comma, i);
	    }
    };


    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitEnumeratorList(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class EnumeratorContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_enumerator;
    }

    identifier() {
	    return this.getTypedRuleContext(IdentifierContext,0);
    }

    Assign() {
	    return this.getToken(GameMakerLanguageParser.Assign, 0);
    }

    IntegerLiteral() {
	    return this.getToken(GameMakerLanguageParser.IntegerLiteral, 0);
    }

    HexIntegerLiteral() {
	    return this.getToken(GameMakerLanguageParser.HexIntegerLiteral, 0);
    }

    BinaryLiteral() {
	    return this.getToken(GameMakerLanguageParser.BinaryLiteral, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitEnumerator(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class MacroStatementContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_macroStatement;
    }

    Macro() {
	    return this.getToken(GameMakerLanguageParser.Macro, 0);
    }

    identifier() {
	    return this.getTypedRuleContext(IdentifierContext,0);
    }

    LineTerminator() {
	    return this.getToken(GameMakerLanguageParser.LineTerminator, 0);
    }

    EOF() {
	    return this.getToken(GameMakerLanguageParser.EOF, 0);
    }

    macroToken = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(MacroTokenContext);
	    } else {
	        return this.getTypedRuleContext(MacroTokenContext,i);
	    }
    };

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitMacroStatement(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class DefineStatementContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_defineStatement;
    }

    Define() {
	    return this.getToken(GameMakerLanguageParser.Define, 0);
    }

    RegionCharacters() {
	    return this.getToken(GameMakerLanguageParser.RegionCharacters, 0);
    }

    RegionEOL() {
	    return this.getToken(GameMakerLanguageParser.RegionEOL, 0);
    }

    EOF() {
	    return this.getToken(GameMakerLanguageParser.EOF, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitDefineStatement(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class RegionStatementContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_regionStatement;
    }

    Region() {
	    return this.getToken(GameMakerLanguageParser.Region, 0);
    }

    EndRegion() {
	    return this.getToken(GameMakerLanguageParser.EndRegion, 0);
    }

    RegionEOL() {
	    return this.getToken(GameMakerLanguageParser.RegionEOL, 0);
    }

    EOF() {
	    return this.getToken(GameMakerLanguageParser.EOF, 0);
    }

    RegionCharacters() {
	    return this.getToken(GameMakerLanguageParser.RegionCharacters, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitRegionStatement(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class IdentifierStatementContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_identifierStatement;
    }

    identifier() {
	    return this.getTypedRuleContext(IdentifierContext,0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitIdentifierStatement(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class SoftKeywordContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_softKeyword;
    }

    Constructor() {
	    return this.getToken(GameMakerLanguageParser.Constructor, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitSoftKeyword(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class PropertySoftKeywordContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_propertySoftKeyword;
    }

    NoOneLiteral() {
	    return this.getToken(GameMakerLanguageParser.NoOneLiteral, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitPropertySoftKeyword(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class OpenBlockContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_openBlock;
    }

    OpenBrace() {
	    return this.getToken(GameMakerLanguageParser.OpenBrace, 0);
    }

    Begin() {
	    return this.getToken(GameMakerLanguageParser.Begin, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitOpenBlock(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class CloseBlockContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_closeBlock;
    }

    CloseBrace() {
	    return this.getToken(GameMakerLanguageParser.CloseBrace, 0);
    }

    End() {
	    return this.getToken(GameMakerLanguageParser.End, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitCloseBlock(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class EosContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_eos;
    }

    SemiColon() {
	    return this.getToken(GameMakerLanguageParser.SemiColon, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitEos(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}



class MacroTokenContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_macroToken;
    }

    EscapedNewLine() {
	    return this.getToken(GameMakerLanguageParser.EscapedNewLine, 0);
    }

    OpenBracket() {
	    return this.getToken(GameMakerLanguageParser.OpenBracket, 0);
    }

    CloseBracket() {
	    return this.getToken(GameMakerLanguageParser.CloseBracket, 0);
    }

    OpenParen() {
	    return this.getToken(GameMakerLanguageParser.OpenParen, 0);
    }

    CloseParen() {
	    return this.getToken(GameMakerLanguageParser.CloseParen, 0);
    }

    OpenBrace() {
	    return this.getToken(GameMakerLanguageParser.OpenBrace, 0);
    }

    CloseBrace() {
	    return this.getToken(GameMakerLanguageParser.CloseBrace, 0);
    }

    Begin() {
	    return this.getToken(GameMakerLanguageParser.Begin, 0);
    }

    End() {
	    return this.getToken(GameMakerLanguageParser.End, 0);
    }

    SemiColon() {
	    return this.getToken(GameMakerLanguageParser.SemiColon, 0);
    }

    Comma() {
	    return this.getToken(GameMakerLanguageParser.Comma, 0);
    }

    Assign() {
	    return this.getToken(GameMakerLanguageParser.Assign, 0);
    }

    Colon() {
	    return this.getToken(GameMakerLanguageParser.Colon, 0);
    }

    Dot() {
	    return this.getToken(GameMakerLanguageParser.Dot, 0);
    }

    PlusPlus() {
	    return this.getToken(GameMakerLanguageParser.PlusPlus, 0);
    }

    MinusMinus() {
	    return this.getToken(GameMakerLanguageParser.MinusMinus, 0);
    }

    Plus() {
	    return this.getToken(GameMakerLanguageParser.Plus, 0);
    }

    Minus() {
	    return this.getToken(GameMakerLanguageParser.Minus, 0);
    }

    BitNot() {
	    return this.getToken(GameMakerLanguageParser.BitNot, 0);
    }

    Not() {
	    return this.getToken(GameMakerLanguageParser.Not, 0);
    }

    Multiply() {
	    return this.getToken(GameMakerLanguageParser.Multiply, 0);
    }

    Divide() {
	    return this.getToken(GameMakerLanguageParser.Divide, 0);
    }

    IntegerDivide() {
	    return this.getToken(GameMakerLanguageParser.IntegerDivide, 0);
    }

    Modulo() {
	    return this.getToken(GameMakerLanguageParser.Modulo, 0);
    }

    Power() {
	    return this.getToken(GameMakerLanguageParser.Power, 0);
    }

    QuestionMark() {
	    return this.getToken(GameMakerLanguageParser.QuestionMark, 0);
    }

    NullCoalesce() {
	    return this.getToken(GameMakerLanguageParser.NullCoalesce, 0);
    }

    NullCoalescingAssign() {
	    return this.getToken(GameMakerLanguageParser.NullCoalescingAssign, 0);
    }

    RightShiftArithmetic() {
	    return this.getToken(GameMakerLanguageParser.RightShiftArithmetic, 0);
    }

    LeftShiftArithmetic() {
	    return this.getToken(GameMakerLanguageParser.LeftShiftArithmetic, 0);
    }

    LessThan() {
	    return this.getToken(GameMakerLanguageParser.LessThan, 0);
    }

    MoreThan() {
	    return this.getToken(GameMakerLanguageParser.MoreThan, 0);
    }

    LessThanEquals() {
	    return this.getToken(GameMakerLanguageParser.LessThanEquals, 0);
    }

    GreaterThanEquals() {
	    return this.getToken(GameMakerLanguageParser.GreaterThanEquals, 0);
    }

    Equals_() {
	    return this.getToken(GameMakerLanguageParser.Equals_, 0);
    }

    NotEquals() {
	    return this.getToken(GameMakerLanguageParser.NotEquals, 0);
    }

    BitAnd() {
	    return this.getToken(GameMakerLanguageParser.BitAnd, 0);
    }

    BitXOr() {
	    return this.getToken(GameMakerLanguageParser.BitXOr, 0);
    }

    BitOr() {
	    return this.getToken(GameMakerLanguageParser.BitOr, 0);
    }

    And() {
	    return this.getToken(GameMakerLanguageParser.And, 0);
    }

    Or() {
	    return this.getToken(GameMakerLanguageParser.Or, 0);
    }

    Xor() {
	    return this.getToken(GameMakerLanguageParser.Xor, 0);
    }

    MultiplyAssign() {
	    return this.getToken(GameMakerLanguageParser.MultiplyAssign, 0);
    }

    DivideAssign() {
	    return this.getToken(GameMakerLanguageParser.DivideAssign, 0);
    }

    PlusAssign() {
	    return this.getToken(GameMakerLanguageParser.PlusAssign, 0);
    }

    MinusAssign() {
	    return this.getToken(GameMakerLanguageParser.MinusAssign, 0);
    }

    ModulusAssign() {
	    return this.getToken(GameMakerLanguageParser.ModulusAssign, 0);
    }

    LeftShiftArithmeticAssign() {
	    return this.getToken(GameMakerLanguageParser.LeftShiftArithmeticAssign, 0);
    }

    RightShiftArithmeticAssign() {
	    return this.getToken(GameMakerLanguageParser.RightShiftArithmeticAssign, 0);
    }

    BitAndAssign() {
	    return this.getToken(GameMakerLanguageParser.BitAndAssign, 0);
    }

    BitXorAssign() {
	    return this.getToken(GameMakerLanguageParser.BitXorAssign, 0);
    }

    BitOrAssign() {
	    return this.getToken(GameMakerLanguageParser.BitOrAssign, 0);
    }

    NumberSign() {
	    return this.getToken(GameMakerLanguageParser.NumberSign, 0);
    }

    DollarSign() {
	    return this.getToken(GameMakerLanguageParser.DollarSign, 0);
    }

    AtSign() {
	    return this.getToken(GameMakerLanguageParser.AtSign, 0);
    }

    UndefinedLiteral() {
	    return this.getToken(GameMakerLanguageParser.UndefinedLiteral, 0);
    }

    NoOneLiteral() {
	    return this.getToken(GameMakerLanguageParser.NoOneLiteral, 0);
    }

    BooleanLiteral() {
	    return this.getToken(GameMakerLanguageParser.BooleanLiteral, 0);
    }

    IntegerLiteral() {
	    return this.getToken(GameMakerLanguageParser.IntegerLiteral, 0);
    }

    DecimalLiteral() {
	    return this.getToken(GameMakerLanguageParser.DecimalLiteral, 0);
    }

    BinaryLiteral() {
	    return this.getToken(GameMakerLanguageParser.BinaryLiteral, 0);
    }

    HexIntegerLiteral() {
	    return this.getToken(GameMakerLanguageParser.HexIntegerLiteral, 0);
    }

    Break() {
	    return this.getToken(GameMakerLanguageParser.Break, 0);
    }

    Exit() {
	    return this.getToken(GameMakerLanguageParser.Exit, 0);
    }

    Do() {
	    return this.getToken(GameMakerLanguageParser.Do, 0);
    }

    Case() {
	    return this.getToken(GameMakerLanguageParser.Case, 0);
    }

    Else() {
	    return this.getToken(GameMakerLanguageParser.Else, 0);
    }

    New() {
	    return this.getToken(GameMakerLanguageParser.New, 0);
    }

    Var() {
	    return this.getToken(GameMakerLanguageParser.Var, 0);
    }

    GlobalVar() {
	    return this.getToken(GameMakerLanguageParser.GlobalVar, 0);
    }

    Catch() {
	    return this.getToken(GameMakerLanguageParser.Catch, 0);
    }

    Finally() {
	    return this.getToken(GameMakerLanguageParser.Finally, 0);
    }

    Return() {
	    return this.getToken(GameMakerLanguageParser.Return, 0);
    }

    Continue() {
	    return this.getToken(GameMakerLanguageParser.Continue, 0);
    }

    For() {
	    return this.getToken(GameMakerLanguageParser.For, 0);
    }

    Switch() {
	    return this.getToken(GameMakerLanguageParser.Switch, 0);
    }

    While() {
	    return this.getToken(GameMakerLanguageParser.While, 0);
    }

    Until() {
	    return this.getToken(GameMakerLanguageParser.Until, 0);
    }

    Repeat() {
	    return this.getToken(GameMakerLanguageParser.Repeat, 0);
    }

    Function_() {
	    return this.getToken(GameMakerLanguageParser.Function_, 0);
    }

    With() {
	    return this.getToken(GameMakerLanguageParser.With, 0);
    }

    Default() {
	    return this.getToken(GameMakerLanguageParser.Default, 0);
    }

    If() {
	    return this.getToken(GameMakerLanguageParser.If, 0);
    }

    Then() {
	    return this.getToken(GameMakerLanguageParser.Then, 0);
    }

    Throw() {
	    return this.getToken(GameMakerLanguageParser.Throw, 0);
    }

    Delete() {
	    return this.getToken(GameMakerLanguageParser.Delete, 0);
    }

    Try() {
	    return this.getToken(GameMakerLanguageParser.Try, 0);
    }

    Enum() {
	    return this.getToken(GameMakerLanguageParser.Enum, 0);
    }

    Constructor() {
	    return this.getToken(GameMakerLanguageParser.Constructor, 0);
    }

    Static() {
	    return this.getToken(GameMakerLanguageParser.Static, 0);
    }

    Identifier() {
	    return this.getToken(GameMakerLanguageParser.Identifier, 0);
    }

    StringLiteral() {
	    return this.getToken(GameMakerLanguageParser.StringLiteral, 0);
    }

    VerbatimStringLiteral() {
	    return this.getToken(GameMakerLanguageParser.VerbatimStringLiteral, 0);
    }

    TemplateStringStart() {
	    return this.getToken(GameMakerLanguageParser.TemplateStringStart, 0);
    }

    TemplateStringEnd() {
	    return this.getToken(GameMakerLanguageParser.TemplateStringEnd, 0);
    }

    TemplateStringText() {
	    return this.getToken(GameMakerLanguageParser.TemplateStringText, 0);
    }

    TemplateStringStartExpression() {
	    return this.getToken(GameMakerLanguageParser.TemplateStringStartExpression, 0);
    }

    TemplateStringEndExpression() {
	    return this.getToken(GameMakerLanguageParser.TemplateStringEndExpression, 0);
    }

    ListAccessor() {
	    return this.getToken(GameMakerLanguageParser.ListAccessor, 0);
    }

    MapAccessor() {
	    return this.getToken(GameMakerLanguageParser.MapAccessor, 0);
    }

    GridAccessor() {
	    return this.getToken(GameMakerLanguageParser.GridAccessor, 0);
    }

    ArrayAccessor() {
	    return this.getToken(GameMakerLanguageParser.ArrayAccessor, 0);
    }

    StructAccessor() {
	    return this.getToken(GameMakerLanguageParser.StructAccessor, 0);
    }

    accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitMacroToken(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
    }


}




GameMakerLanguageParser.ProgramContext = ProgramContext; 
GameMakerLanguageParser.StatementListContext = StatementListContext; 
GameMakerLanguageParser.StatementContext = StatementContext; 
GameMakerLanguageParser.BlockContext = BlockContext; 
GameMakerLanguageParser.IfStatementContext = IfStatementContext; 
GameMakerLanguageParser.IterationStatementContext = IterationStatementContext; 
GameMakerLanguageParser.WithStatementContext = WithStatementContext; 
GameMakerLanguageParser.SwitchStatementContext = SwitchStatementContext; 
GameMakerLanguageParser.ContinueStatementContext = ContinueStatementContext; 
GameMakerLanguageParser.BreakStatementContext = BreakStatementContext; 
GameMakerLanguageParser.ExitStatementContext = ExitStatementContext; 
GameMakerLanguageParser.EmptyStatementContext = EmptyStatementContext; 
GameMakerLanguageParser.CaseBlockContext = CaseBlockContext; 
GameMakerLanguageParser.CaseClausesContext = CaseClausesContext; 
GameMakerLanguageParser.CaseClauseContext = CaseClauseContext; 
GameMakerLanguageParser.DefaultClauseContext = DefaultClauseContext; 
GameMakerLanguageParser.ThrowStatementContext = ThrowStatementContext; 
GameMakerLanguageParser.TryStatementContext = TryStatementContext; 
GameMakerLanguageParser.CatchProductionContext = CatchProductionContext; 
GameMakerLanguageParser.FinallyProductionContext = FinallyProductionContext; 
GameMakerLanguageParser.ReturnStatementContext = ReturnStatementContext; 
GameMakerLanguageParser.DeleteStatementContext = DeleteStatementContext; 
GameMakerLanguageParser.AssignmentExpressionContext = AssignmentExpressionContext; 
GameMakerLanguageParser.VariableDeclarationListContext = VariableDeclarationListContext; 
GameMakerLanguageParser.VarModifierContext = VarModifierContext; 
GameMakerLanguageParser.VariableDeclarationContext = VariableDeclarationContext; 
GameMakerLanguageParser.GlobalVarStatementContext = GlobalVarStatementContext; 
GameMakerLanguageParser.NewExpressionContext = NewExpressionContext; 
GameMakerLanguageParser.LValueStartExpressionContext = LValueStartExpressionContext; 
GameMakerLanguageParser.LValueExpressionContext = LValueExpressionContext; 
GameMakerLanguageParser.LValueChainOperatorContext = LValueChainOperatorContext; 
GameMakerLanguageParser.LValueFinalOperatorContext = LValueFinalOperatorContext; 
GameMakerLanguageParser.ExpressionSequenceContext = ExpressionSequenceContext; 
GameMakerLanguageParser.ExpressionOrFunctionContext = ExpressionOrFunctionContext; 
GameMakerLanguageParser.ExpressionContext = ExpressionContext; 
GameMakerLanguageParser.CallStatementContext = CallStatementContext; 
GameMakerLanguageParser.CallableExpressionContext = CallableExpressionContext; 
GameMakerLanguageParser.IncDecStatementContext = IncDecStatementContext; 
GameMakerLanguageParser.AccessorContext = AccessorContext; 
GameMakerLanguageParser.ArgumentsContext = ArgumentsContext; 
GameMakerLanguageParser.AssignmentOperatorContext = AssignmentOperatorContext; 
GameMakerLanguageParser.LiteralContext = LiteralContext; 
GameMakerLanguageParser.TemplateStringLiteralContext = TemplateStringLiteralContext; 
GameMakerLanguageParser.TemplateStringAtomContext = TemplateStringAtomContext; 
GameMakerLanguageParser.ArrayLiteralContext = ArrayLiteralContext; 
GameMakerLanguageParser.ElementListContext = ElementListContext; 
GameMakerLanguageParser.StructLiteralContext = StructLiteralContext; 
GameMakerLanguageParser.PropertyAssignmentContext = PropertyAssignmentContext; 
GameMakerLanguageParser.PropertyIdentifierContext = PropertyIdentifierContext; 
GameMakerLanguageParser.FunctionDeclarationContext = FunctionDeclarationContext; 
GameMakerLanguageParser.ConstructorClauseContext = ConstructorClauseContext; 
GameMakerLanguageParser.ParameterListContext = ParameterListContext; 
GameMakerLanguageParser.ParameterArgumentContext = ParameterArgumentContext; 
GameMakerLanguageParser.IdentifierContext = IdentifierContext; 
GameMakerLanguageParser.EnumeratorDeclarationContext = EnumeratorDeclarationContext; 
GameMakerLanguageParser.EnumeratorListContext = EnumeratorListContext; 
GameMakerLanguageParser.EnumeratorContext = EnumeratorContext; 
GameMakerLanguageParser.MacroStatementContext = MacroStatementContext; 
GameMakerLanguageParser.DefineStatementContext = DefineStatementContext; 
GameMakerLanguageParser.RegionStatementContext = RegionStatementContext; 
GameMakerLanguageParser.IdentifierStatementContext = IdentifierStatementContext; 
GameMakerLanguageParser.SoftKeywordContext = SoftKeywordContext; 
GameMakerLanguageParser.PropertySoftKeywordContext = PropertySoftKeywordContext; 
GameMakerLanguageParser.OpenBlockContext = OpenBlockContext; 
GameMakerLanguageParser.CloseBlockContext = CloseBlockContext; 
GameMakerLanguageParser.EosContext = EosContext; 
GameMakerLanguageParser.MacroTokenContext = MacroTokenContext; 
