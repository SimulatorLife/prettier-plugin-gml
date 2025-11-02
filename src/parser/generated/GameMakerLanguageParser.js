// Generated from GameMakerLanguageParser.g4 by ANTLR 4.13.2
// jshint ignore: start
import antlr4 from 'antlr4';
import GameMakerLanguageParserListener from './GameMakerLanguageParserListener.js';
import GameMakerLanguageParserVisitor from './GameMakerLanguageParserVisitor.js';

const serializedATN = [4,1,114,729,2,0,7,0,2,1,7,1,2,2,7,2,2,3,7,3,2,4,7,
4,2,5,7,5,2,6,7,6,2,7,7,7,2,8,7,8,2,9,7,9,2,10,7,10,2,11,7,11,2,12,7,12,
2,13,7,13,2,14,7,14,2,15,7,15,2,16,7,16,2,17,7,17,2,18,7,18,2,19,7,19,2,
20,7,20,2,21,7,21,2,22,7,22,2,23,7,23,2,24,7,24,2,25,7,25,2,26,7,26,2,27,
7,27,2,28,7,28,2,29,7,29,2,30,7,30,2,31,7,31,2,32,7,32,2,33,7,33,2,34,7,
34,2,35,7,35,2,36,7,36,2,37,7,37,2,38,7,38,2,39,7,39,2,40,7,40,2,41,7,41,
2,42,7,42,2,43,7,43,2,44,7,44,2,45,7,45,2,46,7,46,2,47,7,47,2,48,7,48,2,
49,7,49,2,50,7,50,2,51,7,51,2,52,7,52,2,53,7,53,2,54,7,54,2,55,7,55,2,56,
7,56,2,57,7,57,2,58,7,58,2,59,7,59,2,60,7,60,2,61,7,61,2,62,7,62,2,63,7,
63,2,64,7,64,2,65,7,65,2,66,7,66,2,67,7,67,2,68,7,68,2,69,7,69,2,70,7,70,
2,71,7,71,2,72,7,72,1,0,3,0,148,8,0,1,0,1,0,1,1,4,1,153,8,1,11,1,12,1,154,
1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,
1,2,1,2,1,2,1,2,1,2,1,2,1,2,3,2,182,8,2,1,2,3,2,185,8,2,1,3,1,3,3,3,189,
8,3,1,3,1,3,1,4,1,4,1,4,3,4,196,8,4,1,4,1,4,1,4,3,4,201,8,4,1,5,1,5,1,5,
1,5,1,5,1,5,1,5,1,5,1,5,1,5,1,5,1,5,1,5,3,5,216,8,5,1,5,1,5,3,5,220,8,5,
1,5,1,5,3,5,224,8,5,1,5,1,5,1,5,1,5,1,5,1,5,3,5,232,8,5,1,6,1,6,1,6,1,6,
1,7,1,7,1,7,1,7,1,8,1,8,1,9,1,9,1,10,1,10,1,11,1,11,1,12,1,12,3,12,252,8,
12,1,12,1,12,3,12,256,8,12,3,12,258,8,12,1,12,1,12,1,13,4,13,263,8,13,11,
13,12,13,264,1,14,1,14,1,14,1,14,3,14,271,8,14,1,15,1,15,1,15,3,15,276,8,
15,1,16,1,16,1,16,1,17,1,17,1,17,1,17,3,17,285,8,17,1,17,3,17,288,8,17,1,
18,1,18,1,18,3,18,293,8,18,1,18,3,18,296,8,18,1,18,1,18,1,19,1,19,1,19,1,
20,1,20,3,20,305,8,20,1,21,1,21,1,21,1,22,1,22,1,23,1,23,1,23,1,23,1,24,
1,24,1,24,1,24,5,24,320,8,24,10,24,12,24,323,9,24,1,25,4,25,326,8,25,11,
25,12,25,327,1,25,3,25,331,8,25,1,26,1,26,1,26,3,26,336,8,26,1,27,1,27,1,
27,1,27,5,27,342,8,27,10,27,12,27,345,9,27,1,27,1,27,1,28,1,28,1,28,1,28,
1,29,1,29,1,29,1,29,1,29,1,29,3,29,359,8,29,1,30,1,30,5,30,363,8,30,10,30,
12,30,366,9,30,1,30,3,30,369,8,30,1,31,1,31,1,31,1,31,1,31,1,31,1,31,3,31,
378,8,31,1,32,1,32,1,32,1,32,1,32,1,32,3,32,386,8,32,1,33,1,33,1,33,5,33,
391,8,33,10,33,12,33,394,9,33,1,34,1,34,3,34,398,8,34,1,35,1,35,1,35,1,35,
1,35,1,35,1,35,1,35,1,35,1,35,1,35,1,35,1,35,1,35,1,35,1,35,3,35,416,8,35,
1,35,1,35,1,35,3,35,421,8,35,1,35,1,35,1,35,1,35,1,35,1,35,1,35,1,35,1,35,
1,35,1,35,1,35,1,35,1,35,1,35,1,35,1,35,1,35,1,35,1,35,1,35,1,35,1,35,1,
35,1,35,1,35,1,35,1,35,1,35,1,35,1,35,1,35,1,35,1,35,1,35,1,35,1,35,1,35,
1,35,1,35,1,35,1,35,5,35,465,8,35,10,35,12,35,468,9,35,1,36,1,36,1,36,1,
36,1,36,1,36,5,36,476,8,36,10,36,12,36,479,9,36,1,37,1,37,1,37,1,37,3,37,
485,8,37,1,37,1,37,3,37,489,8,37,1,38,1,38,1,38,1,39,1,39,1,39,1,40,1,40,
3,40,499,8,40,1,41,1,41,1,42,1,42,1,42,1,42,3,42,507,8,42,1,42,3,42,510,
8,42,1,42,3,42,513,8,42,1,43,1,43,1,43,1,43,5,43,519,8,43,10,43,12,43,522,
9,43,1,43,1,43,1,43,1,43,1,43,5,43,529,8,43,10,43,12,43,532,9,43,1,43,3,
43,535,8,43,1,44,1,44,1,44,3,44,540,8,44,1,45,1,45,1,46,1,46,1,47,1,47,1,
47,1,47,1,47,1,47,1,47,1,47,1,47,1,47,1,47,1,47,3,47,558,8,47,1,48,1,48,
5,48,562,8,48,10,48,12,48,565,9,48,1,48,1,48,1,49,1,49,1,49,1,49,1,49,3,
49,574,8,49,1,50,1,50,1,50,1,50,1,51,5,51,581,8,51,10,51,12,51,584,9,51,
1,51,3,51,587,8,51,1,51,4,51,590,8,51,11,51,12,51,591,1,51,5,51,595,8,51,
10,51,12,51,598,9,51,1,51,3,51,601,8,51,1,52,1,52,1,52,1,52,5,52,607,8,52,
10,52,12,52,610,9,52,1,52,3,52,613,8,52,3,52,615,8,52,1,52,1,52,1,53,1,53,
1,53,1,53,1,54,1,54,1,54,1,54,1,54,3,54,628,8,54,1,55,1,55,3,55,632,8,55,
1,55,1,55,3,55,636,8,55,1,55,1,55,1,56,1,56,1,56,3,56,643,8,56,1,56,1,56,
1,57,1,57,1,57,1,57,5,57,651,8,57,10,57,12,57,654,9,57,1,57,3,57,657,8,57,
3,57,659,8,57,1,57,1,57,1,58,1,58,1,58,3,58,666,8,58,1,59,1,59,3,59,670,
8,59,1,60,1,60,1,60,1,60,3,60,676,8,60,1,60,1,60,1,61,1,61,1,61,5,61,683,
8,61,10,61,12,61,686,9,61,1,61,3,61,689,8,61,1,62,1,62,1,62,3,62,694,8,62,
1,63,1,63,1,63,4,63,699,8,63,11,63,12,63,700,1,63,1,63,1,64,1,64,1,64,1,
64,1,65,1,65,3,65,711,8,65,1,65,1,65,1,66,1,66,1,67,1,67,1,68,1,68,1,69,
1,69,1,70,1,70,1,71,1,71,1,72,1,72,1,72,0,2,70,72,73,0,2,4,6,8,10,12,14,
16,18,20,22,24,26,28,30,32,34,36,38,40,42,44,46,48,50,52,54,56,58,60,62,
64,66,68,70,72,74,76,78,80,82,84,86,88,90,92,94,96,98,100,102,104,106,108,
110,112,114,116,118,120,122,124,126,128,130,132,134,136,138,140,142,144,
0,14,1,0,28,31,1,0,24,25,1,0,36,37,1,0,42,43,1,0,38,41,1,0,22,23,1,0,3,8,
3,0,19,19,35,35,50,59,1,1,108,108,1,1,111,111,1,0,101,102,2,0,12,12,15,15,
2,0,14,14,16,16,4,0,3,97,99,99,103,106,112,114,792,0,147,1,0,0,0,2,152,1,
0,0,0,4,181,1,0,0,0,6,186,1,0,0,0,8,192,1,0,0,0,10,231,1,0,0,0,12,233,1,
0,0,0,14,237,1,0,0,0,16,241,1,0,0,0,18,243,1,0,0,0,20,245,1,0,0,0,22,247,
1,0,0,0,24,249,1,0,0,0,26,262,1,0,0,0,28,266,1,0,0,0,30,272,1,0,0,0,32,277,
1,0,0,0,34,280,1,0,0,0,36,289,1,0,0,0,38,299,1,0,0,0,40,302,1,0,0,0,42,306,
1,0,0,0,44,309,1,0,0,0,46,311,1,0,0,0,48,315,1,0,0,0,50,330,1,0,0,0,52,332,
1,0,0,0,54,337,1,0,0,0,56,348,1,0,0,0,58,358,1,0,0,0,60,360,1,0,0,0,62,377,
1,0,0,0,64,385,1,0,0,0,66,387,1,0,0,0,68,397,1,0,0,0,70,420,1,0,0,0,72,469,
1,0,0,0,74,488,1,0,0,0,76,490,1,0,0,0,78,493,1,0,0,0,80,498,1,0,0,0,82,500,
1,0,0,0,84,512,1,0,0,0,86,534,1,0,0,0,88,539,1,0,0,0,90,541,1,0,0,0,92,543,
1,0,0,0,94,557,1,0,0,0,96,559,1,0,0,0,98,573,1,0,0,0,100,575,1,0,0,0,102,
582,1,0,0,0,104,602,1,0,0,0,106,618,1,0,0,0,108,627,1,0,0,0,110,629,1,0,
0,0,112,642,1,0,0,0,114,646,1,0,0,0,116,662,1,0,0,0,118,669,1,0,0,0,120,
671,1,0,0,0,122,679,1,0,0,0,124,690,1,0,0,0,126,695,1,0,0,0,128,704,1,0,
0,0,130,708,1,0,0,0,132,714,1,0,0,0,134,716,1,0,0,0,136,718,1,0,0,0,138,
720,1,0,0,0,140,722,1,0,0,0,142,724,1,0,0,0,144,726,1,0,0,0,146,148,3,2,
1,0,147,146,1,0,0,0,147,148,1,0,0,0,148,149,1,0,0,0,149,150,5,0,0,1,150,
1,1,0,0,0,151,153,3,4,2,0,152,151,1,0,0,0,153,154,1,0,0,0,154,152,1,0,0,
0,154,155,1,0,0,0,155,3,1,0,0,0,156,182,3,6,3,0,157,182,3,22,11,0,158,182,
3,8,4,0,159,182,3,48,24,0,160,182,3,10,5,0,161,182,3,16,8,0,162,182,3,18,
9,0,163,182,3,40,20,0,164,182,3,12,6,0,165,182,3,14,7,0,166,182,3,34,17,
0,167,182,3,32,16,0,168,182,3,20,10,0,169,182,3,126,63,0,170,182,3,128,64,
0,171,182,3,130,65,0,172,182,3,120,60,0,173,182,3,54,27,0,174,182,3,46,23,
0,175,182,3,80,40,0,176,182,3,72,36,0,177,182,3,110,55,0,178,182,3,42,21,
0,179,182,3,44,22,0,180,182,3,132,66,0,181,156,1,0,0,0,181,157,1,0,0,0,181,
158,1,0,0,0,181,159,1,0,0,0,181,160,1,0,0,0,181,161,1,0,0,0,181,162,1,0,
0,0,181,163,1,0,0,0,181,164,1,0,0,0,181,165,1,0,0,0,181,166,1,0,0,0,181,
167,1,0,0,0,181,168,1,0,0,0,181,169,1,0,0,0,181,170,1,0,0,0,181,171,1,0,
0,0,181,172,1,0,0,0,181,173,1,0,0,0,181,174,1,0,0,0,181,175,1,0,0,0,181,
176,1,0,0,0,181,177,1,0,0,0,181,178,1,0,0,0,181,179,1,0,0,0,181,180,1,0,
0,0,182,184,1,0,0,0,183,185,3,142,71,0,184,183,1,0,0,0,184,185,1,0,0,0,185,
5,1,0,0,0,186,188,3,138,69,0,187,189,3,2,1,0,188,187,1,0,0,0,188,189,1,0,
0,0,189,190,1,0,0,0,190,191,3,140,70,0,191,7,1,0,0,0,192,193,5,90,0,0,193,
195,3,70,35,0,194,196,5,91,0,0,195,194,1,0,0,0,195,196,1,0,0,0,196,197,1,
0,0,0,197,200,3,4,2,0,198,199,5,74,0,0,199,201,3,4,2,0,200,198,1,0,0,0,200,
201,1,0,0,0,201,9,1,0,0,0,202,203,5,72,0,0,203,204,3,4,2,0,204,205,5,85,
0,0,205,206,3,70,35,0,206,232,1,0,0,0,207,208,5,84,0,0,208,209,3,70,35,0,
209,210,3,4,2,0,210,232,1,0,0,0,211,212,5,82,0,0,212,215,5,10,0,0,213,216,
3,48,24,0,214,216,3,46,23,0,215,213,1,0,0,0,215,214,1,0,0,0,215,216,1,0,
0,0,216,217,1,0,0,0,217,219,5,17,0,0,218,220,3,70,35,0,219,218,1,0,0,0,219,
220,1,0,0,0,220,221,1,0,0,0,221,223,5,17,0,0,222,224,3,4,2,0,223,222,1,0,
0,0,223,224,1,0,0,0,224,225,1,0,0,0,225,226,5,11,0,0,226,232,3,4,2,0,227,
228,5,86,0,0,228,229,3,70,35,0,229,230,3,4,2,0,230,232,1,0,0,0,231,202,1,
0,0,0,231,207,1,0,0,0,231,211,1,0,0,0,231,227,1,0,0,0,232,11,1,0,0,0,233,
234,5,88,0,0,234,235,3,70,35,0,235,236,3,4,2,0,236,13,1,0,0,0,237,238,5,
83,0,0,238,239,3,70,35,0,239,240,3,24,12,0,240,15,1,0,0,0,241,242,5,81,0,
0,242,17,1,0,0,0,243,244,5,70,0,0,244,19,1,0,0,0,245,246,5,71,0,0,246,21,
1,0,0,0,247,248,5,17,0,0,248,23,1,0,0,0,249,251,3,138,69,0,250,252,3,26,
13,0,251,250,1,0,0,0,251,252,1,0,0,0,252,257,1,0,0,0,253,255,3,30,15,0,254,
256,3,26,13,0,255,254,1,0,0,0,255,256,1,0,0,0,256,258,1,0,0,0,257,253,1,
0,0,0,257,258,1,0,0,0,258,259,1,0,0,0,259,260,3,140,70,0,260,25,1,0,0,0,
261,263,3,28,14,0,262,261,1,0,0,0,263,264,1,0,0,0,264,262,1,0,0,0,264,265,
1,0,0,0,265,27,1,0,0,0,266,267,5,73,0,0,267,268,3,70,35,0,268,270,5,20,0,
0,269,271,3,2,1,0,270,269,1,0,0,0,270,271,1,0,0,0,271,29,1,0,0,0,272,273,
5,89,0,0,273,275,5,20,0,0,274,276,3,2,1,0,275,274,1,0,0,0,275,276,1,0,0,
0,276,31,1,0,0,0,277,278,5,92,0,0,278,279,3,70,35,0,279,33,1,0,0,0,280,281,
5,94,0,0,281,287,3,4,2,0,282,284,3,36,18,0,283,285,3,38,19,0,284,283,1,0,
0,0,284,285,1,0,0,0,285,288,1,0,0,0,286,288,3,38,19,0,287,282,1,0,0,0,287,
286,1,0,0,0,288,35,1,0,0,0,289,295,5,78,0,0,290,292,5,10,0,0,291,293,3,118,
59,0,292,291,1,0,0,0,292,293,1,0,0,0,293,294,1,0,0,0,294,296,5,11,0,0,295,
290,1,0,0,0,295,296,1,0,0,0,296,297,1,0,0,0,297,298,3,4,2,0,298,37,1,0,0,
0,299,300,5,79,0,0,300,301,3,4,2,0,301,39,1,0,0,0,302,304,5,80,0,0,303,305,
3,70,35,0,304,303,1,0,0,0,304,305,1,0,0,0,305,41,1,0,0,0,306,307,5,93,0,
0,307,308,3,70,35,0,308,43,1,0,0,0,309,310,3,94,47,0,310,45,1,0,0,0,311,
312,3,60,30,0,312,313,3,92,46,0,313,314,3,68,34,0,314,47,1,0,0,0,315,316,
3,50,25,0,316,321,3,52,26,0,317,318,5,18,0,0,318,320,3,52,26,0,319,317,1,
0,0,0,320,323,1,0,0,0,321,319,1,0,0,0,321,322,1,0,0,0,322,49,1,0,0,0,323,
321,1,0,0,0,324,326,5,76,0,0,325,324,1,0,0,0,326,327,1,0,0,0,327,325,1,0,
0,0,327,328,1,0,0,0,328,331,1,0,0,0,329,331,5,97,0,0,330,325,1,0,0,0,330,
329,1,0,0,0,331,51,1,0,0,0,332,335,3,118,59,0,333,334,5,19,0,0,334,336,3,
68,34,0,335,333,1,0,0,0,335,336,1,0,0,0,336,53,1,0,0,0,337,338,5,77,0,0,
338,343,3,118,59,0,339,340,5,18,0,0,340,342,3,118,59,0,341,339,1,0,0,0,342,
345,1,0,0,0,343,341,1,0,0,0,343,344,1,0,0,0,344,346,1,0,0,0,345,343,1,0,
0,0,346,347,5,17,0,0,347,55,1,0,0,0,348,349,5,75,0,0,349,350,3,118,59,0,
350,351,3,84,42,0,351,57,1,0,0,0,352,359,3,118,59,0,353,359,3,56,28,0,354,
355,5,10,0,0,355,356,3,60,30,0,356,357,5,11,0,0,357,359,1,0,0,0,358,352,
1,0,0,0,358,353,1,0,0,0,358,354,1,0,0,0,359,59,1,0,0,0,360,368,3,58,29,0,
361,363,3,62,31,0,362,361,1,0,0,0,363,366,1,0,0,0,364,362,1,0,0,0,364,365,
1,0,0,0,365,367,1,0,0,0,366,364,1,0,0,0,367,369,3,64,32,0,368,364,1,0,0,
0,368,369,1,0,0,0,369,61,1,0,0,0,370,371,3,82,41,0,371,372,3,66,33,0,372,
373,5,9,0,0,373,378,1,0,0,0,374,375,5,21,0,0,375,378,3,118,59,0,376,378,
3,84,42,0,377,370,1,0,0,0,377,374,1,0,0,0,377,376,1,0,0,0,378,63,1,0,0,0,
379,380,3,82,41,0,380,381,3,66,33,0,381,382,5,9,0,0,382,386,1,0,0,0,383,
384,5,21,0,0,384,386,3,118,59,0,385,379,1,0,0,0,385,383,1,0,0,0,386,65,1,
0,0,0,387,392,3,70,35,0,388,389,5,18,0,0,389,391,3,70,35,0,390,388,1,0,0,
0,391,394,1,0,0,0,392,390,1,0,0,0,392,393,1,0,0,0,393,67,1,0,0,0,394,392,
1,0,0,0,395,398,3,70,35,0,396,398,3,110,55,0,397,395,1,0,0,0,397,396,1,0,
0,0,398,69,1,0,0,0,399,400,6,35,-1,0,400,421,3,72,36,0,401,402,5,10,0,0,
402,403,3,70,35,0,403,404,5,11,0,0,404,421,1,0,0,0,405,406,5,24,0,0,406,
421,3,70,35,21,407,408,5,25,0,0,408,421,3,70,35,20,409,410,5,26,0,0,410,
421,3,70,35,19,411,412,5,27,0,0,412,421,3,70,35,18,413,416,3,76,38,0,414,
416,3,78,39,0,415,413,1,0,0,0,415,414,1,0,0,0,416,421,1,0,0,0,417,421,3,
60,30,0,418,421,3,110,55,0,419,421,3,94,47,0,420,399,1,0,0,0,420,401,1,0,
0,0,420,405,1,0,0,0,420,407,1,0,0,0,420,409,1,0,0,0,420,411,1,0,0,0,420,
415,1,0,0,0,420,417,1,0,0,0,420,418,1,0,0,0,420,419,1,0,0,0,421,466,1,0,
0,0,422,423,10,17,0,0,423,424,7,0,0,0,424,465,3,70,35,18,425,426,10,16,0,
0,426,427,7,1,0,0,427,465,3,70,35,17,428,429,10,15,0,0,429,430,7,2,0,0,430,
465,3,70,35,16,431,432,10,14,0,0,432,433,5,44,0,0,433,465,3,70,35,15,434,
435,10,13,0,0,435,436,5,45,0,0,436,465,3,70,35,14,437,438,10,12,0,0,438,
439,5,46,0,0,439,465,3,70,35,13,440,441,10,11,0,0,441,442,7,3,0,0,442,465,
3,70,35,12,443,444,10,10,0,0,444,445,7,4,0,0,445,465,3,70,35,11,446,447,
10,9,0,0,447,448,5,34,0,0,448,465,3,70,35,9,449,450,10,8,0,0,450,451,5,47,
0,0,451,465,3,70,35,9,452,453,10,7,0,0,453,454,5,48,0,0,454,465,3,70,35,
8,455,456,10,6,0,0,456,457,5,49,0,0,457,465,3,70,35,7,458,459,10,3,0,0,459,
460,5,33,0,0,460,461,3,70,35,0,461,462,5,20,0,0,462,463,3,70,35,3,463,465,
1,0,0,0,464,422,1,0,0,0,464,425,1,0,0,0,464,428,1,0,0,0,464,431,1,0,0,0,
464,434,1,0,0,0,464,437,1,0,0,0,464,440,1,0,0,0,464,443,1,0,0,0,464,446,
1,0,0,0,464,449,1,0,0,0,464,452,1,0,0,0,464,455,1,0,0,0,464,458,1,0,0,0,
465,468,1,0,0,0,466,464,1,0,0,0,466,467,1,0,0,0,467,71,1,0,0,0,468,466,1,
0,0,0,469,470,6,36,-1,0,470,471,3,74,37,0,471,472,3,84,42,0,472,477,1,0,
0,0,473,474,10,1,0,0,474,476,3,84,42,0,475,473,1,0,0,0,476,479,1,0,0,0,477,
475,1,0,0,0,477,478,1,0,0,0,478,73,1,0,0,0,479,477,1,0,0,0,480,489,3,60,
30,0,481,484,5,10,0,0,482,485,3,110,55,0,483,485,3,74,37,0,484,482,1,0,0,
0,484,483,1,0,0,0,485,486,1,0,0,0,486,487,5,11,0,0,487,489,1,0,0,0,488,480,
1,0,0,0,488,481,1,0,0,0,489,75,1,0,0,0,490,491,7,5,0,0,491,492,3,60,30,0,
492,77,1,0,0,0,493,494,3,60,30,0,494,495,7,5,0,0,495,79,1,0,0,0,496,499,
3,78,39,0,497,499,3,76,38,0,498,496,1,0,0,0,498,497,1,0,0,0,499,81,1,0,0,
0,500,501,7,6,0,0,501,83,1,0,0,0,502,503,5,10,0,0,503,513,5,11,0,0,504,506,
5,10,0,0,505,507,3,86,43,0,506,505,1,0,0,0,506,507,1,0,0,0,507,509,1,0,0,
0,508,510,3,90,45,0,509,508,1,0,0,0,509,510,1,0,0,0,510,511,1,0,0,0,511,
513,5,11,0,0,512,502,1,0,0,0,512,504,1,0,0,0,513,85,1,0,0,0,514,515,5,18,
0,0,515,520,3,88,44,0,516,517,5,18,0,0,517,519,3,88,44,0,518,516,1,0,0,0,
519,522,1,0,0,0,520,518,1,0,0,0,520,521,1,0,0,0,521,535,1,0,0,0,522,520,
1,0,0,0,523,524,3,88,44,0,524,525,5,18,0,0,525,530,3,88,44,0,526,527,5,18,
0,0,527,529,3,88,44,0,528,526,1,0,0,0,529,532,1,0,0,0,530,528,1,0,0,0,530,
531,1,0,0,0,531,535,1,0,0,0,532,530,1,0,0,0,533,535,3,88,44,0,534,514,1,
0,0,0,534,523,1,0,0,0,534,533,1,0,0,0,535,87,1,0,0,0,536,540,3,68,34,0,537,
540,5,63,0,0,538,540,1,0,0,0,539,536,1,0,0,0,539,537,1,0,0,0,539,538,1,0,
0,0,540,89,1,0,0,0,541,542,5,18,0,0,542,91,1,0,0,0,543,544,7,7,0,0,544,93,
1,0,0,0,545,558,5,63,0,0,546,558,5,64,0,0,547,558,5,65,0,0,548,558,5,104,
0,0,549,558,5,106,0,0,550,558,3,96,48,0,551,558,5,69,0,0,552,558,5,68,0,
0,553,558,5,67,0,0,554,558,5,66,0,0,555,558,3,100,50,0,556,558,3,104,52,
0,557,545,1,0,0,0,557,546,1,0,0,0,557,547,1,0,0,0,557,548,1,0,0,0,557,549,
1,0,0,0,557,550,1,0,0,0,557,551,1,0,0,0,557,552,1,0,0,0,557,553,1,0,0,0,
557,554,1,0,0,0,557,555,1,0,0,0,557,556,1,0,0,0,558,95,1,0,0,0,559,563,5,
105,0,0,560,562,3,98,49,0,561,560,1,0,0,0,562,565,1,0,0,0,563,561,1,0,0,
0,563,564,1,0,0,0,564,566,1,0,0,0,565,563,1,0,0,0,566,567,5,112,0,0,567,
97,1,0,0,0,568,574,5,114,0,0,569,570,5,113,0,0,570,571,3,70,35,0,571,572,
5,13,0,0,572,574,1,0,0,0,573,568,1,0,0,0,573,569,1,0,0,0,574,99,1,0,0,0,
575,576,5,3,0,0,576,577,3,102,51,0,577,578,5,9,0,0,578,101,1,0,0,0,579,581,
5,18,0,0,580,579,1,0,0,0,581,584,1,0,0,0,582,580,1,0,0,0,582,583,1,0,0,0,
583,586,1,0,0,0,584,582,1,0,0,0,585,587,3,68,34,0,586,585,1,0,0,0,586,587,
1,0,0,0,587,596,1,0,0,0,588,590,5,18,0,0,589,588,1,0,0,0,590,591,1,0,0,0,
591,589,1,0,0,0,591,592,1,0,0,0,592,593,1,0,0,0,593,595,3,68,34,0,594,589,
1,0,0,0,595,598,1,0,0,0,596,594,1,0,0,0,596,597,1,0,0,0,597,600,1,0,0,0,
598,596,1,0,0,0,599,601,5,18,0,0,600,599,1,0,0,0,600,601,1,0,0,0,601,103,
1,0,0,0,602,614,3,138,69,0,603,608,3,106,53,0,604,605,5,18,0,0,605,607,3,
106,53,0,606,604,1,0,0,0,607,610,1,0,0,0,608,606,1,0,0,0,608,609,1,0,0,0,
609,612,1,0,0,0,610,608,1,0,0,0,611,613,5,18,0,0,612,611,1,0,0,0,612,613,
1,0,0,0,613,615,1,0,0,0,614,603,1,0,0,0,614,615,1,0,0,0,615,616,1,0,0,0,
616,617,3,140,70,0,617,105,1,0,0,0,618,619,3,108,54,0,619,620,5,20,0,0,620,
621,3,68,34,0,621,107,1,0,0,0,622,628,5,103,0,0,623,628,3,134,67,0,624,628,
3,136,68,0,625,628,5,104,0,0,626,628,5,106,0,0,627,622,1,0,0,0,627,623,1,
0,0,0,627,624,1,0,0,0,627,625,1,0,0,0,627,626,1,0,0,0,628,109,1,0,0,0,629,
631,5,87,0,0,630,632,5,103,0,0,631,630,1,0,0,0,631,632,1,0,0,0,632,633,1,
0,0,0,633,635,3,114,57,0,634,636,3,112,56,0,635,634,1,0,0,0,635,636,1,0,
0,0,636,637,1,0,0,0,637,638,3,6,3,0,638,111,1,0,0,0,639,640,5,20,0,0,640,
641,5,103,0,0,641,643,3,84,42,0,642,639,1,0,0,0,642,643,1,0,0,0,643,644,
1,0,0,0,644,645,5,96,0,0,645,113,1,0,0,0,646,658,5,10,0,0,647,652,3,116,
58,0,648,649,5,18,0,0,649,651,3,116,58,0,650,648,1,0,0,0,651,654,1,0,0,0,
652,650,1,0,0,0,652,653,1,0,0,0,653,656,1,0,0,0,654,652,1,0,0,0,655,657,
5,18,0,0,656,655,1,0,0,0,656,657,1,0,0,0,657,659,1,0,0,0,658,647,1,0,0,0,
658,659,1,0,0,0,659,660,1,0,0,0,660,661,5,11,0,0,661,115,1,0,0,0,662,665,
3,118,59,0,663,664,5,19,0,0,664,666,3,68,34,0,665,663,1,0,0,0,665,666,1,
0,0,0,666,117,1,0,0,0,667,670,5,103,0,0,668,670,3,134,67,0,669,667,1,0,0,
0,669,668,1,0,0,0,670,119,1,0,0,0,671,672,5,95,0,0,672,673,3,118,59,0,673,
675,3,138,69,0,674,676,3,122,61,0,675,674,1,0,0,0,675,676,1,0,0,0,676,677,
1,0,0,0,677,678,3,140,70,0,678,121,1,0,0,0,679,684,3,124,62,0,680,681,5,
18,0,0,681,683,3,124,62,0,682,680,1,0,0,0,683,686,1,0,0,0,684,682,1,0,0,
0,684,685,1,0,0,0,685,688,1,0,0,0,686,684,1,0,0,0,687,689,5,18,0,0,688,687,
1,0,0,0,688,689,1,0,0,0,689,123,1,0,0,0,690,693,3,118,59,0,691,692,5,19,
0,0,692,694,3,70,35,0,693,691,1,0,0,0,693,694,1,0,0,0,694,125,1,0,0,0,695,
696,5,98,0,0,696,698,3,118,59,0,697,699,3,144,72,0,698,697,1,0,0,0,699,700,
1,0,0,0,700,698,1,0,0,0,700,701,1,0,0,0,701,702,1,0,0,0,702,703,7,8,0,0,
703,127,1,0,0,0,704,705,5,100,0,0,705,706,5,110,0,0,706,707,7,9,0,0,707,
129,1,0,0,0,708,710,7,10,0,0,709,711,5,110,0,0,710,709,1,0,0,0,710,711,1,
0,0,0,711,712,1,0,0,0,712,713,7,9,0,0,713,131,1,0,0,0,714,715,3,118,59,0,
715,133,1,0,0,0,716,717,5,96,0,0,717,135,1,0,0,0,718,719,5,64,0,0,719,137,
1,0,0,0,720,721,7,11,0,0,721,139,1,0,0,0,722,723,7,12,0,0,723,141,1,0,0,
0,724,725,5,17,0,0,725,143,1,0,0,0,726,727,7,13,0,0,727,145,1,0,0,0,75,147,
154,181,184,188,195,200,215,219,223,231,251,255,257,264,270,275,284,287,
292,295,304,321,327,330,335,343,358,364,368,377,385,392,397,415,420,464,
466,477,484,488,498,506,509,512,520,530,534,539,557,563,573,582,586,591,
596,600,608,612,614,627,631,635,642,652,656,658,665,669,675,684,688,693,
700,710];


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
                            "'>'", "'<='", "'>='", null, null, "'&'", "'^'", 
                            "'|'", null, null, null, "'*='", "'/='", "'+='", 
                            "'-='", "'%='", "'<<='", "'>>='", "'&='", "'^='", 
                            "'|='", "'#'", "'$'", "'@'", "'undefined'", 
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
                             "Equals", "NotEquals", "BitAnd", "BitXOr", 
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
                         "returnStatement", "deleteStatement", "literalStatement", 
                         "assignmentExpression", "variableDeclarationList", 
                         "varModifier", "variableDeclaration", "globalVarStatement", 
                         "newExpression", "lValueStartExpression", "lValueExpression", 
                         "lValueChainOperator", "lValueFinalOperator", "expressionSequence", 
                         "expressionOrFunction", "expression", "callStatement", 
                         "callableExpression", "preIncDecExpression", "postIncDecExpression", 
                         "incDecStatement", "accessor", "arguments", "argumentList", 
                         "argument", "trailingComma", "assignmentOperator", 
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
    	case 35:
    	    		return this.expression_sempred(localctx, predIndex);
    	case 36:
    	    		return this.callStatement_sempred(localctx, predIndex);
        default:
            throw "No predicate with index:" + ruleIndex;
       }
    }

    expression_sempred(localctx, predIndex) {
    	switch(predIndex) {
    		case 0:
    			return this.precpred(this._ctx, 17);
    		case 1:
    			return this.precpred(this._ctx, 16);
    		case 2:
    			return this.precpred(this._ctx, 15);
    		case 3:
    			return this.precpred(this._ctx, 14);
    		case 4:
    			return this.precpred(this._ctx, 13);
    		case 5:
    			return this.precpred(this._ctx, 12);
    		case 6:
    			return this.precpred(this._ctx, 11);
    		case 7:
    			return this.precpred(this._ctx, 10);
    		case 8:
    			return this.precpred(this._ctx, 9);
    		case 9:
    			return this.precpred(this._ctx, 8);
    		case 10:
    			return this.precpred(this._ctx, 7);
    		case 11:
    			return this.precpred(this._ctx, 6);
    		case 12:
    			return this.precpred(this._ctx, 3);
    		default:
    			throw "No predicate with index:" + predIndex;
    	}
    };

    callStatement_sempred(localctx, predIndex) {
    	switch(predIndex) {
    		case 13:
    			return this.precpred(this._ctx, 1);
    		default:
    			throw "No predicate with index:" + predIndex;
    	}
    };




	program() {
	    let localctx = new ProgramContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 0, GameMakerLanguageParser.RULE_program);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 147;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if((((_la) & ~0x1f) === 0 && ((1 << _la) & 12751880) !== 0) || ((((_la - 63)) & ~0x1f) === 0 && ((1 << (_la - 63)) & 3955127295) !== 0) || ((((_la - 95)) & ~0x1f) === 0 && ((1 << (_la - 95)) & 4079) !== 0)) {
	            this.state = 146;
	            this.statementList();
	        }

	        this.state = 149;
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
	        this.state = 152; 
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        do {
	            this.state = 151;
	            this.statement();
	            this.state = 154; 
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	        } while((((_la) & ~0x1f) === 0 && ((1 << _la) & 12751880) !== 0) || ((((_la - 63)) & ~0x1f) === 0 && ((1 << (_la - 63)) & 3955127295) !== 0) || ((((_la - 95)) & ~0x1f) === 0 && ((1 << (_la - 95)) & 4079) !== 0));
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
	        this.state = 181;
	        this._errHandler.sync(this);
	        var la_ = this._interp.adaptivePredict(this._input,2,this._ctx);
	        switch(la_) {
	        case 1:
	            this.state = 156;
	            this.block();
	            break;

	        case 2:
	            this.state = 157;
	            this.emptyStatement();
	            break;

	        case 3:
	            this.state = 158;
	            this.ifStatement();
	            break;

	        case 4:
	            this.state = 159;
	            this.variableDeclarationList();
	            break;

	        case 5:
	            this.state = 160;
	            this.iterationStatement();
	            break;

	        case 6:
	            this.state = 161;
	            this.continueStatement();
	            break;

	        case 7:
	            this.state = 162;
	            this.breakStatement();
	            break;

	        case 8:
	            this.state = 163;
	            this.returnStatement();
	            break;

	        case 9:
	            this.state = 164;
	            this.withStatement();
	            break;

	        case 10:
	            this.state = 165;
	            this.switchStatement();
	            break;

	        case 11:
	            this.state = 166;
	            this.tryStatement();
	            break;

	        case 12:
	            this.state = 167;
	            this.throwStatement();
	            break;

	        case 13:
	            this.state = 168;
	            this.exitStatement();
	            break;

	        case 14:
	            this.state = 169;
	            this.macroStatement();
	            break;

	        case 15:
	            this.state = 170;
	            this.defineStatement();
	            break;

	        case 16:
	            this.state = 171;
	            this.regionStatement();
	            break;

	        case 17:
	            this.state = 172;
	            this.enumeratorDeclaration();
	            break;

	        case 18:
	            this.state = 173;
	            this.globalVarStatement();
	            break;

	        case 19:
	            this.state = 174;
	            this.assignmentExpression();
	            break;

	        case 20:
	            this.state = 175;
	            this.incDecStatement();
	            break;

	        case 21:
	            this.state = 176;
	            this.callStatement(0);
	            break;

	        case 22:
	            this.state = 177;
	            this.functionDeclaration();
	            break;

	        case 23:
	            this.state = 178;
	            this.deleteStatement();
	            break;

	        case 24:
	            this.state = 179;
	            this.literalStatement();
	            break;

	        case 25:
	            this.state = 180;
	            this.identifierStatement();
	            break;

	        }
	        this.state = 184;
	        this._errHandler.sync(this);
	        var la_ = this._interp.adaptivePredict(this._input,3,this._ctx);
	        if(la_===1) {
	            this.state = 183;
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
	        this.state = 186;
	        this.openBlock();
	        this.state = 188;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if((((_la) & ~0x1f) === 0 && ((1 << _la) & 12751880) !== 0) || ((((_la - 63)) & ~0x1f) === 0 && ((1 << (_la - 63)) & 3955127295) !== 0) || ((((_la - 95)) & ~0x1f) === 0 && ((1 << (_la - 95)) & 4079) !== 0)) {
	            this.state = 187;
	            this.statementList();
	        }

	        this.state = 190;
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
	        this.state = 192;
	        this.match(GameMakerLanguageParser.If);
	        this.state = 193;
	        this.expression(0);
	        this.state = 195;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===91) {
	            this.state = 194;
	            this.match(GameMakerLanguageParser.Then);
	        }

	        this.state = 197;
	        this.statement();
	        this.state = 200;
	        this._errHandler.sync(this);
	        var la_ = this._interp.adaptivePredict(this._input,6,this._ctx);
	        if(la_===1) {
	            this.state = 198;
	            this.match(GameMakerLanguageParser.Else);
	            this.state = 199;
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
	        this.state = 231;
	        this._errHandler.sync(this);
	        switch(this._input.LA(1)) {
	        case 72:
	            localctx = new DoStatementContext(this, localctx);
	            this.enterOuterAlt(localctx, 1);
	            this.state = 202;
	            this.match(GameMakerLanguageParser.Do);
	            this.state = 203;
	            this.statement();
	            this.state = 204;
	            this.match(GameMakerLanguageParser.Until);
	            this.state = 205;
	            this.expression(0);
	            break;
	        case 84:
	            localctx = new WhileStatementContext(this, localctx);
	            this.enterOuterAlt(localctx, 2);
	            this.state = 207;
	            this.match(GameMakerLanguageParser.While);
	            this.state = 208;
	            this.expression(0);
	            this.state = 209;
	            this.statement();
	            break;
	        case 82:
	            localctx = new ForStatementContext(this, localctx);
	            this.enterOuterAlt(localctx, 3);
	            this.state = 211;
	            this.match(GameMakerLanguageParser.For);
	            this.state = 212;
	            this.match(GameMakerLanguageParser.OpenParen);
	            this.state = 215;
	            this._errHandler.sync(this);
	            switch (this._input.LA(1)) {
	            case 76:
	            case 97:
	            	this.state = 213;
	            	this.variableDeclarationList();
	            	break;
	            case 10:
	            case 75:
	            case 96:
	            case 103:
	            	this.state = 214;
	            	this.assignmentExpression();
	            	break;
	            case 17:
	            	break;
	            default:
	            	break;
	            }
	            this.state = 217;
	            this.match(GameMakerLanguageParser.SemiColon);
	            this.state = 219;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	            if((((_la) & ~0x1f) === 0 && ((1 << _la) & 264279048) !== 0) || ((((_la - 63)) & ~0x1f) === 0 && ((1 << (_la - 63)) & 16781439) !== 0) || ((((_la - 96)) & ~0x1f) === 0 && ((1 << (_la - 96)) & 1921) !== 0)) {
	                this.state = 218;
	                this.expression(0);
	            }

	            this.state = 221;
	            this.match(GameMakerLanguageParser.SemiColon);
	            this.state = 223;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	            if((((_la) & ~0x1f) === 0 && ((1 << _la) & 12751880) !== 0) || ((((_la - 63)) & ~0x1f) === 0 && ((1 << (_la - 63)) & 3955127295) !== 0) || ((((_la - 95)) & ~0x1f) === 0 && ((1 << (_la - 95)) & 4079) !== 0)) {
	                this.state = 222;
	                this.statement();
	            }

	            this.state = 225;
	            this.match(GameMakerLanguageParser.CloseParen);
	            this.state = 226;
	            this.statement();
	            break;
	        case 86:
	            localctx = new RepeatStatementContext(this, localctx);
	            this.enterOuterAlt(localctx, 4);
	            this.state = 227;
	            this.match(GameMakerLanguageParser.Repeat);
	            this.state = 228;
	            this.expression(0);
	            this.state = 229;
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
	        this.state = 233;
	        this.match(GameMakerLanguageParser.With);
	        this.state = 234;
	        this.expression(0);
	        this.state = 235;
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
	        this.state = 237;
	        this.match(GameMakerLanguageParser.Switch);
	        this.state = 238;
	        this.expression(0);
	        this.state = 239;
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
	        this.state = 241;
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
	        this.state = 243;
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
	        this.state = 245;
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
	        this.state = 247;
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
	        this.state = 249;
	        this.openBlock();
	        this.state = 251;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===73) {
	            this.state = 250;
	            this.caseClauses();
	        }

	        this.state = 257;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===89) {
	            this.state = 253;
	            this.defaultClause();
	            this.state = 255;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	            if(_la===73) {
	                this.state = 254;
	                this.caseClauses();
	            }

	        }

	        this.state = 259;
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
	        this.state = 262; 
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        do {
	            this.state = 261;
	            this.caseClause();
	            this.state = 264; 
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
	        this.state = 266;
	        this.match(GameMakerLanguageParser.Case);
	        this.state = 267;
	        this.expression(0);
	        this.state = 268;
	        this.match(GameMakerLanguageParser.Colon);
	        this.state = 270;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if((((_la) & ~0x1f) === 0 && ((1 << _la) & 12751880) !== 0) || ((((_la - 63)) & ~0x1f) === 0 && ((1 << (_la - 63)) & 3955127295) !== 0) || ((((_la - 95)) & ~0x1f) === 0 && ((1 << (_la - 95)) & 4079) !== 0)) {
	            this.state = 269;
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
	        this.state = 272;
	        this.match(GameMakerLanguageParser.Default);
	        this.state = 273;
	        this.match(GameMakerLanguageParser.Colon);
	        this.state = 275;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if((((_la) & ~0x1f) === 0 && ((1 << _la) & 12751880) !== 0) || ((((_la - 63)) & ~0x1f) === 0 && ((1 << (_la - 63)) & 3955127295) !== 0) || ((((_la - 95)) & ~0x1f) === 0 && ((1 << (_la - 95)) & 4079) !== 0)) {
	            this.state = 274;
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
	        this.state = 277;
	        this.match(GameMakerLanguageParser.Throw);
	        this.state = 278;
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
	        this.state = 280;
	        this.match(GameMakerLanguageParser.Try);
	        this.state = 281;
	        this.statement();
	        this.state = 287;
	        this._errHandler.sync(this);
	        switch(this._input.LA(1)) {
	        case 78:
	            this.state = 282;
	            this.catchProduction();
	            this.state = 284;
	            this._errHandler.sync(this);
	            var la_ = this._interp.adaptivePredict(this._input,17,this._ctx);
	            if(la_===1) {
	                this.state = 283;
	                this.finallyProduction();

	            }
	            break;
	        case 79:
	            this.state = 286;
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
	        this.state = 289;
	        this.match(GameMakerLanguageParser.Catch);
	        this.state = 295;
	        this._errHandler.sync(this);
	        var la_ = this._interp.adaptivePredict(this._input,20,this._ctx);
	        if(la_===1) {
	            this.state = 290;
	            this.match(GameMakerLanguageParser.OpenParen);
	            this.state = 292;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	            if(_la===96 || _la===103) {
	                this.state = 291;
	                this.identifier();
	            }

	            this.state = 294;
	            this.match(GameMakerLanguageParser.CloseParen);

	        }
	        this.state = 297;
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
	        this.state = 299;
	        this.match(GameMakerLanguageParser.Finally);
	        this.state = 300;
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
	        this.state = 302;
	        this.match(GameMakerLanguageParser.Return);
	        this.state = 304;
	        this._errHandler.sync(this);
	        var la_ = this._interp.adaptivePredict(this._input,21,this._ctx);
	        if(la_===1) {
	            this.state = 303;
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
	        this.state = 306;
	        this.match(GameMakerLanguageParser.Delete);
	        this.state = 307;
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



	literalStatement() {
	    let localctx = new LiteralStatementContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 44, GameMakerLanguageParser.RULE_literalStatement);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 309;
	        this.literal();
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
	    this.enterRule(localctx, 46, GameMakerLanguageParser.RULE_assignmentExpression);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 311;
	        this.lValueExpression();
	        this.state = 312;
	        this.assignmentOperator();
	        this.state = 313;
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
	    this.enterRule(localctx, 48, GameMakerLanguageParser.RULE_variableDeclarationList);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 315;
	        this.varModifier();
	        this.state = 316;
	        this.variableDeclaration();
	        this.state = 321;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        while(_la===18) {
	            this.state = 317;
	            this.match(GameMakerLanguageParser.Comma);
	            this.state = 318;
	            this.variableDeclaration();
	            this.state = 323;
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
	    this.enterRule(localctx, 50, GameMakerLanguageParser.RULE_varModifier);
	    var _la = 0;
	    try {
	        this.state = 330;
	        this._errHandler.sync(this);
	        switch(this._input.LA(1)) {
	        case 76:
	            this.enterOuterAlt(localctx, 1);
	            this.state = 325; 
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	            do {
	                this.state = 324;
	                this.match(GameMakerLanguageParser.Var);
	                this.state = 327; 
	                this._errHandler.sync(this);
	                _la = this._input.LA(1);
	            } while(_la===76);
	            break;
	        case 97:
	            this.enterOuterAlt(localctx, 2);
	            this.state = 329;
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
	    this.enterRule(localctx, 52, GameMakerLanguageParser.RULE_variableDeclaration);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 332;
	        this.identifier();
	        this.state = 335;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===19) {
	            this.state = 333;
	            this.match(GameMakerLanguageParser.Assign);
	            this.state = 334;
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
	    this.enterRule(localctx, 54, GameMakerLanguageParser.RULE_globalVarStatement);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 337;
	        this.match(GameMakerLanguageParser.GlobalVar);
	        this.state = 338;
	        this.identifier();
	        this.state = 343;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        while(_la===18) {
	            this.state = 339;
	            this.match(GameMakerLanguageParser.Comma);
	            this.state = 340;
	            this.identifier();
	            this.state = 345;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	        }
	        this.state = 346;
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
	    this.enterRule(localctx, 56, GameMakerLanguageParser.RULE_newExpression);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 348;
	        this.match(GameMakerLanguageParser.New);
	        this.state = 349;
	        this.identifier();
	        this.state = 350;
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
	    this.enterRule(localctx, 58, GameMakerLanguageParser.RULE_lValueStartExpression);
	    try {
	        this.state = 358;
	        this._errHandler.sync(this);
	        switch(this._input.LA(1)) {
	        case 96:
	        case 103:
	            localctx = new IdentifierLValueContext(this, localctx);
	            this.enterOuterAlt(localctx, 1);
	            this.state = 352;
	            this.identifier();
	            break;
	        case 75:
	            localctx = new NewLValueContext(this, localctx);
	            this.enterOuterAlt(localctx, 2);
	            this.state = 353;
	            this.newExpression();
	            break;
	        case 10:
	            localctx = new ParenthesizedLValueContext(this, localctx);
	            this.enterOuterAlt(localctx, 3);
	            this.state = 354;
	            this.match(GameMakerLanguageParser.OpenParen);
	            this.state = 355;
	            this.lValueExpression();
	            this.state = 356;
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



	lValueExpression() {
	    let localctx = new LValueExpressionContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 60, GameMakerLanguageParser.RULE_lValueExpression);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 360;
	        this.lValueStartExpression();
	        this.state = 368;
	        this._errHandler.sync(this);
	        var la_ = this._interp.adaptivePredict(this._input,29,this._ctx);
	        if(la_===1) {
	            this.state = 364;
	            this._errHandler.sync(this);
	            var _alt = this._interp.adaptivePredict(this._input,28,this._ctx)
	            while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
	                if(_alt===1) {
	                    this.state = 361;
	                    this.lValueChainOperator(); 
	                }
	                this.state = 366;
	                this._errHandler.sync(this);
	                _alt = this._interp.adaptivePredict(this._input,28,this._ctx);
	            }

	            this.state = 367;
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
	    this.enterRule(localctx, 62, GameMakerLanguageParser.RULE_lValueChainOperator);
	    try {
	        this.state = 377;
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
	            this.state = 370;
	            this.accessor();
	            this.state = 371;
	            this.expressionSequence();
	            this.state = 372;
	            this.match(GameMakerLanguageParser.CloseBracket);
	            break;
	        case 21:
	            localctx = new MemberDotLValueContext(this, localctx);
	            this.enterOuterAlt(localctx, 2);
	            this.state = 374;
	            this.match(GameMakerLanguageParser.Dot);
	            this.state = 375;
	            this.identifier();
	            break;
	        case 10:
	            localctx = new CallLValueContext(this, localctx);
	            this.enterOuterAlt(localctx, 3);
	            this.state = 376;
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
	    this.enterRule(localctx, 64, GameMakerLanguageParser.RULE_lValueFinalOperator);
	    try {
	        this.state = 385;
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
	            this.state = 379;
	            this.accessor();
	            this.state = 380;
	            this.expressionSequence();
	            this.state = 381;
	            this.match(GameMakerLanguageParser.CloseBracket);
	            break;
	        case 21:
	            localctx = new MemberDotLValueFinalContext(this, localctx);
	            this.enterOuterAlt(localctx, 2);
	            this.state = 383;
	            this.match(GameMakerLanguageParser.Dot);
	            this.state = 384;
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
	    this.enterRule(localctx, 66, GameMakerLanguageParser.RULE_expressionSequence);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 387;
	        this.expression(0);
	        this.state = 392;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        while(_la===18) {
	            this.state = 388;
	            this.match(GameMakerLanguageParser.Comma);
	            this.state = 389;
	            this.expression(0);
	            this.state = 394;
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
	    this.enterRule(localctx, 68, GameMakerLanguageParser.RULE_expressionOrFunction);
	    try {
	        this.state = 397;
	        this._errHandler.sync(this);
	        var la_ = this._interp.adaptivePredict(this._input,33,this._ctx);
	        switch(la_) {
	        case 1:
	            this.enterOuterAlt(localctx, 1);
	            this.state = 395;
	            this.expression(0);
	            break;

	        case 2:
	            this.enterOuterAlt(localctx, 2);
	            this.state = 396;
	            this.functionDeclaration();
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
	    const _startState = 70;
	    this.enterRecursionRule(localctx, 70, GameMakerLanguageParser.RULE_expression, _p);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 420;
	        this._errHandler.sync(this);
	        var la_ = this._interp.adaptivePredict(this._input,35,this._ctx);
	        switch(la_) {
	        case 1:
	            localctx = new CallExpressionContext(this, localctx);
	            this._ctx = localctx;
	            _prevctx = localctx;

	            this.state = 400;
	            this.callStatement(0);
	            break;

	        case 2:
	            localctx = new ParenthesizedExpressionContext(this, localctx);
	            this._ctx = localctx;
	            _prevctx = localctx;
	            this.state = 401;
	            this.match(GameMakerLanguageParser.OpenParen);
	            this.state = 402;
	            this.expression(0);
	            this.state = 403;
	            this.match(GameMakerLanguageParser.CloseParen);
	            break;

	        case 3:
	            localctx = new UnaryPlusExpressionContext(this, localctx);
	            this._ctx = localctx;
	            _prevctx = localctx;
	            this.state = 405;
	            this.match(GameMakerLanguageParser.Plus);
	            this.state = 406;
	            this.expression(21);
	            break;

	        case 4:
	            localctx = new UnaryMinusExpressionContext(this, localctx);
	            this._ctx = localctx;
	            _prevctx = localctx;
	            this.state = 407;
	            this.match(GameMakerLanguageParser.Minus);
	            this.state = 408;
	            this.expression(20);
	            break;

	        case 5:
	            localctx = new BitNotExpressionContext(this, localctx);
	            this._ctx = localctx;
	            _prevctx = localctx;
	            this.state = 409;
	            this.match(GameMakerLanguageParser.BitNot);
	            this.state = 410;
	            this.expression(19);
	            break;

	        case 6:
	            localctx = new NotExpressionContext(this, localctx);
	            this._ctx = localctx;
	            _prevctx = localctx;
	            this.state = 411;
	            this.match(GameMakerLanguageParser.Not);
	            this.state = 412;
	            this.expression(18);
	            break;

	        case 7:
	            localctx = new IncDecExpressionContext(this, localctx);
	            this._ctx = localctx;
	            _prevctx = localctx;
	            this.state = 415;
	            this._errHandler.sync(this);
	            switch(this._input.LA(1)) {
	            case 22:
	            case 23:
	                this.state = 413;
	                this.preIncDecExpression();
	                break;
	            case 10:
	            case 75:
	            case 96:
	            case 103:
	                this.state = 414;
	                this.postIncDecExpression();
	                break;
	            default:
	                throw new antlr4.error.NoViableAltException(this);
	            }
	            break;

	        case 8:
	            localctx = new VariableExpressionContext(this, localctx);
	            this._ctx = localctx;
	            _prevctx = localctx;
	            this.state = 417;
	            this.lValueExpression();
	            break;

	        case 9:
	            localctx = new FunctionExpressionContext(this, localctx);
	            this._ctx = localctx;
	            _prevctx = localctx;
	            this.state = 418;
	            this.functionDeclaration();
	            break;

	        case 10:
	            localctx = new LiteralExpressionContext(this, localctx);
	            this._ctx = localctx;
	            _prevctx = localctx;
	            this.state = 419;
	            this.literal();
	            break;

	        }
	        this._ctx.stop = this._input.LT(-1);
	        this.state = 466;
	        this._errHandler.sync(this);
	        var _alt = this._interp.adaptivePredict(this._input,37,this._ctx)
	        while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
	            if(_alt===1) {
	                if(this._parseListeners!==null) {
	                    this.triggerExitRuleEvent();
	                }
	                _prevctx = localctx;
	                this.state = 464;
	                this._errHandler.sync(this);
	                var la_ = this._interp.adaptivePredict(this._input,36,this._ctx);
	                switch(la_) {
	                case 1:
	                    localctx = new BinaryExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, GameMakerLanguageParser.RULE_expression);
	                    this.state = 422;
	                    if (!( this.precpred(this._ctx, 17))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 17)");
	                    }
	                    this.state = 423;
	                    _la = this._input.LA(1);
	                    if(!((((_la) & ~0x1f) === 0 && ((1 << _la) & 4026531840) !== 0))) {
	                    this._errHandler.recoverInline(this);
	                    }
	                    else {
	                    	this._errHandler.reportMatch(this);
	                        this.consume();
	                    }
	                    this.state = 424;
	                    this.expression(18);
	                    break;

	                case 2:
	                    localctx = new BinaryExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, GameMakerLanguageParser.RULE_expression);
	                    this.state = 425;
	                    if (!( this.precpred(this._ctx, 16))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 16)");
	                    }
	                    this.state = 426;
	                    _la = this._input.LA(1);
	                    if(!(_la===24 || _la===25)) {
	                    this._errHandler.recoverInline(this);
	                    }
	                    else {
	                    	this._errHandler.reportMatch(this);
	                        this.consume();
	                    }
	                    this.state = 427;
	                    this.expression(17);
	                    break;

	                case 3:
	                    localctx = new BinaryExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, GameMakerLanguageParser.RULE_expression);
	                    this.state = 428;
	                    if (!( this.precpred(this._ctx, 15))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 15)");
	                    }
	                    this.state = 429;
	                    _la = this._input.LA(1);
	                    if(!(_la===36 || _la===37)) {
	                    this._errHandler.recoverInline(this);
	                    }
	                    else {
	                    	this._errHandler.reportMatch(this);
	                        this.consume();
	                    }
	                    this.state = 430;
	                    this.expression(16);
	                    break;

	                case 4:
	                    localctx = new BinaryExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, GameMakerLanguageParser.RULE_expression);
	                    this.state = 431;
	                    if (!( this.precpred(this._ctx, 14))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 14)");
	                    }
	                    this.state = 432;
	                    this.match(GameMakerLanguageParser.BitAnd);
	                    this.state = 433;
	                    this.expression(15);
	                    break;

	                case 5:
	                    localctx = new BinaryExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, GameMakerLanguageParser.RULE_expression);
	                    this.state = 434;
	                    if (!( this.precpred(this._ctx, 13))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 13)");
	                    }
	                    this.state = 435;
	                    this.match(GameMakerLanguageParser.BitXOr);
	                    this.state = 436;
	                    this.expression(14);
	                    break;

	                case 6:
	                    localctx = new BinaryExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, GameMakerLanguageParser.RULE_expression);
	                    this.state = 437;
	                    if (!( this.precpred(this._ctx, 12))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 12)");
	                    }
	                    this.state = 438;
	                    this.match(GameMakerLanguageParser.BitOr);
	                    this.state = 439;
	                    this.expression(13);
	                    break;

	                case 7:
	                    localctx = new BinaryExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, GameMakerLanguageParser.RULE_expression);
	                    this.state = 440;
	                    if (!( this.precpred(this._ctx, 11))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 11)");
	                    }
	                    this.state = 441;
	                    _la = this._input.LA(1);
	                    if(!(_la===42 || _la===43)) {
	                    this._errHandler.recoverInline(this);
	                    }
	                    else {
	                    	this._errHandler.reportMatch(this);
	                        this.consume();
	                    }
	                    this.state = 442;
	                    this.expression(12);
	                    break;

	                case 8:
	                    localctx = new BinaryExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, GameMakerLanguageParser.RULE_expression);
	                    this.state = 443;
	                    if (!( this.precpred(this._ctx, 10))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 10)");
	                    }
	                    this.state = 444;
	                    _la = this._input.LA(1);
	                    if(!(((((_la - 38)) & ~0x1f) === 0 && ((1 << (_la - 38)) & 15) !== 0))) {
	                    this._errHandler.recoverInline(this);
	                    }
	                    else {
	                    	this._errHandler.reportMatch(this);
	                        this.consume();
	                    }
	                    this.state = 445;
	                    this.expression(11);
	                    break;

	                case 9:
	                    localctx = new BinaryExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, GameMakerLanguageParser.RULE_expression);
	                    this.state = 446;
	                    if (!( this.precpred(this._ctx, 9))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 9)");
	                    }
	                    this.state = 447;
	                    this.match(GameMakerLanguageParser.NullCoalesce);
	                    this.state = 448;
	                    this.expression(9);
	                    break;

	                case 10:
	                    localctx = new BinaryExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, GameMakerLanguageParser.RULE_expression);
	                    this.state = 449;
	                    if (!( this.precpred(this._ctx, 8))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 8)");
	                    }
	                    this.state = 450;
	                    this.match(GameMakerLanguageParser.And);
	                    this.state = 451;
	                    this.expression(9);
	                    break;

	                case 11:
	                    localctx = new BinaryExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, GameMakerLanguageParser.RULE_expression);
	                    this.state = 452;
	                    if (!( this.precpred(this._ctx, 7))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 7)");
	                    }
	                    this.state = 453;
	                    this.match(GameMakerLanguageParser.Or);
	                    this.state = 454;
	                    this.expression(8);
	                    break;

	                case 12:
	                    localctx = new BinaryExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, GameMakerLanguageParser.RULE_expression);
	                    this.state = 455;
	                    if (!( this.precpred(this._ctx, 6))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 6)");
	                    }
	                    this.state = 456;
	                    this.match(GameMakerLanguageParser.Xor);
	                    this.state = 457;
	                    this.expression(7);
	                    break;

	                case 13:
	                    localctx = new TernaryExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, GameMakerLanguageParser.RULE_expression);
	                    this.state = 458;
	                    if (!( this.precpred(this._ctx, 3))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 3)");
	                    }
	                    this.state = 459;
	                    this.match(GameMakerLanguageParser.QuestionMark);
	                    this.state = 460;
	                    this.expression(0);
	                    this.state = 461;
	                    this.match(GameMakerLanguageParser.Colon);
	                    this.state = 462;
	                    this.expression(3);
	                    break;

	                } 
	            }
	            this.state = 468;
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
	        this.unrollRecursionContexts(_parentctx)
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
	    const _startState = 72;
	    this.enterRecursionRule(localctx, 72, GameMakerLanguageParser.RULE_callStatement, _p);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 470;
	        this.callableExpression();
	        this.state = 471;
	        this.arguments();
	        this._ctx.stop = this._input.LT(-1);
	        this.state = 477;
	        this._errHandler.sync(this);
	        var _alt = this._interp.adaptivePredict(this._input,38,this._ctx)
	        while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
	            if(_alt===1) {
	                if(this._parseListeners!==null) {
	                    this.triggerExitRuleEvent();
	                }
	                _prevctx = localctx;
	                localctx = new CallStatementContext(this, _parentctx, _parentState);
	                this.pushNewRecursionContext(localctx, _startState, GameMakerLanguageParser.RULE_callStatement);
	                this.state = 473;
	                if (!( this.precpred(this._ctx, 1))) {
	                    throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 1)");
	                }
	                this.state = 474;
	                this.arguments(); 
	            }
	            this.state = 479;
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
	        this.unrollRecursionContexts(_parentctx)
	    }
	    return localctx;
	}



	callableExpression() {
	    let localctx = new CallableExpressionContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 74, GameMakerLanguageParser.RULE_callableExpression);
	    try {
	        this.state = 488;
	        this._errHandler.sync(this);
	        var la_ = this._interp.adaptivePredict(this._input,40,this._ctx);
	        switch(la_) {
	        case 1:
	            this.enterOuterAlt(localctx, 1);
	            this.state = 480;
	            this.lValueExpression();
	            break;

	        case 2:
	            this.enterOuterAlt(localctx, 2);
	            this.state = 481;
	            this.match(GameMakerLanguageParser.OpenParen);
	            this.state = 484;
	            this._errHandler.sync(this);
	            switch(this._input.LA(1)) {
	            case 87:
	                this.state = 482;
	                this.functionDeclaration();
	                break;
	            case 10:
	            case 75:
	            case 96:
	            case 103:
	                this.state = 483;
	                this.callableExpression();
	                break;
	            default:
	                throw new antlr4.error.NoViableAltException(this);
	            }
	            this.state = 486;
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



	preIncDecExpression() {
	    let localctx = new PreIncDecExpressionContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 76, GameMakerLanguageParser.RULE_preIncDecExpression);
	    var _la = 0;
	    try {
	        localctx = new PreIncDecStatementContext(this, localctx);
	        this.enterOuterAlt(localctx, 1);
	        this.state = 490;
	        _la = this._input.LA(1);
	        if(!(_la===22 || _la===23)) {
	        this._errHandler.recoverInline(this);
	        }
	        else {
	        	this._errHandler.reportMatch(this);
	            this.consume();
	        }
	        this.state = 491;
	        this.lValueExpression();
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



	postIncDecExpression() {
	    let localctx = new PostIncDecExpressionContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 78, GameMakerLanguageParser.RULE_postIncDecExpression);
	    var _la = 0;
	    try {
	        localctx = new PostIncDecStatementContext(this, localctx);
	        this.enterOuterAlt(localctx, 1);
	        this.state = 493;
	        this.lValueExpression();
	        this.state = 494;
	        _la = this._input.LA(1);
	        if(!(_la===22 || _la===23)) {
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



	incDecStatement() {
	    let localctx = new IncDecStatementContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 80, GameMakerLanguageParser.RULE_incDecStatement);
	    try {
	        this.state = 498;
	        this._errHandler.sync(this);
	        switch(this._input.LA(1)) {
	        case 10:
	        case 75:
	        case 96:
	        case 103:
	            this.enterOuterAlt(localctx, 1);
	            this.state = 496;
	            this.postIncDecExpression();
	            break;
	        case 22:
	        case 23:
	            this.enterOuterAlt(localctx, 2);
	            this.state = 497;
	            this.preIncDecExpression();
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
	    this.enterRule(localctx, 82, GameMakerLanguageParser.RULE_accessor);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 500;
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
	    this.enterRule(localctx, 84, GameMakerLanguageParser.RULE_arguments);
	    var _la = 0;
	    try {
	        this.state = 512;
	        this._errHandler.sync(this);
	        var la_ = this._interp.adaptivePredict(this._input,44,this._ctx);
	        switch(la_) {
	        case 1:
	            this.enterOuterAlt(localctx, 1);
	            this.state = 502;
	            this.match(GameMakerLanguageParser.OpenParen);
	            this.state = 503;
	            this.match(GameMakerLanguageParser.CloseParen);
	            break;

	        case 2:
	            this.enterOuterAlt(localctx, 2);
	            this.state = 504;
	            this.match(GameMakerLanguageParser.OpenParen);
	            this.state = 506;
	            this._errHandler.sync(this);
	            var la_ = this._interp.adaptivePredict(this._input,42,this._ctx);
	            if(la_===1) {
	                this.state = 505;
	                this.argumentList();

	            }
	            this.state = 509;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	            if(_la===18) {
	                this.state = 508;
	                this.trailingComma();
	            }

	            this.state = 511;
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



	argumentList() {
	    let localctx = new ArgumentListContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 86, GameMakerLanguageParser.RULE_argumentList);
	    try {
	        this.state = 534;
	        this._errHandler.sync(this);
	        var la_ = this._interp.adaptivePredict(this._input,47,this._ctx);
	        switch(la_) {
	        case 1:
	            this.enterOuterAlt(localctx, 1);
	            this.state = 514;
	            this.match(GameMakerLanguageParser.Comma);
	            this.state = 515;
	            this.argument();
	            this.state = 520;
	            this._errHandler.sync(this);
	            var _alt = this._interp.adaptivePredict(this._input,45,this._ctx)
	            while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
	                if(_alt===1) {
	                    this.state = 516;
	                    this.match(GameMakerLanguageParser.Comma);
	                    this.state = 517;
	                    this.argument(); 
	                }
	                this.state = 522;
	                this._errHandler.sync(this);
	                _alt = this._interp.adaptivePredict(this._input,45,this._ctx);
	            }

	            break;

	        case 2:
	            this.enterOuterAlt(localctx, 2);
	            this.state = 523;
	            this.argument();
	            this.state = 524;
	            this.match(GameMakerLanguageParser.Comma);
	            this.state = 525;
	            this.argument();
	            this.state = 530;
	            this._errHandler.sync(this);
	            var _alt = this._interp.adaptivePredict(this._input,46,this._ctx)
	            while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
	                if(_alt===1) {
	                    this.state = 526;
	                    this.match(GameMakerLanguageParser.Comma);
	                    this.state = 527;
	                    this.argument(); 
	                }
	                this.state = 532;
	                this._errHandler.sync(this);
	                _alt = this._interp.adaptivePredict(this._input,46,this._ctx);
	            }

	            break;

	        case 3:
	            this.enterOuterAlt(localctx, 3);
	            this.state = 533;
	            this.argument();
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



	argument() {
	    let localctx = new ArgumentContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 88, GameMakerLanguageParser.RULE_argument);
	    try {
	        this.state = 539;
	        this._errHandler.sync(this);
	        var la_ = this._interp.adaptivePredict(this._input,48,this._ctx);
	        switch(la_) {
	        case 1:
	            this.enterOuterAlt(localctx, 1);
	            this.state = 536;
	            this.expressionOrFunction();
	            break;

	        case 2:
	            this.enterOuterAlt(localctx, 2);
	            this.state = 537;
	            this.match(GameMakerLanguageParser.UndefinedLiteral);
	            break;

	        case 3:
	            this.enterOuterAlt(localctx, 3);

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



	trailingComma() {
	    let localctx = new TrailingCommaContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 90, GameMakerLanguageParser.RULE_trailingComma);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 541;
	        this.match(GameMakerLanguageParser.Comma);
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
	    this.enterRule(localctx, 92, GameMakerLanguageParser.RULE_assignmentOperator);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 543;
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
	    this.enterRule(localctx, 94, GameMakerLanguageParser.RULE_literal);
	    try {
	        this.state = 557;
	        this._errHandler.sync(this);
	        switch(this._input.LA(1)) {
	        case 63:
	            this.enterOuterAlt(localctx, 1);
	            this.state = 545;
	            this.match(GameMakerLanguageParser.UndefinedLiteral);
	            break;
	        case 64:
	            this.enterOuterAlt(localctx, 2);
	            this.state = 546;
	            this.match(GameMakerLanguageParser.NoOneLiteral);
	            break;
	        case 65:
	            this.enterOuterAlt(localctx, 3);
	            this.state = 547;
	            this.match(GameMakerLanguageParser.BooleanLiteral);
	            break;
	        case 104:
	            this.enterOuterAlt(localctx, 4);
	            this.state = 548;
	            this.match(GameMakerLanguageParser.StringLiteral);
	            break;
	        case 106:
	            this.enterOuterAlt(localctx, 5);
	            this.state = 549;
	            this.match(GameMakerLanguageParser.VerbatimStringLiteral);
	            break;
	        case 105:
	            this.enterOuterAlt(localctx, 6);
	            this.state = 550;
	            this.templateStringLiteral();
	            break;
	        case 69:
	            this.enterOuterAlt(localctx, 7);
	            this.state = 551;
	            this.match(GameMakerLanguageParser.HexIntegerLiteral);
	            break;
	        case 68:
	            this.enterOuterAlt(localctx, 8);
	            this.state = 552;
	            this.match(GameMakerLanguageParser.BinaryLiteral);
	            break;
	        case 67:
	            this.enterOuterAlt(localctx, 9);
	            this.state = 553;
	            this.match(GameMakerLanguageParser.DecimalLiteral);
	            break;
	        case 66:
	            this.enterOuterAlt(localctx, 10);
	            this.state = 554;
	            this.match(GameMakerLanguageParser.IntegerLiteral);
	            break;
	        case 3:
	            this.enterOuterAlt(localctx, 11);
	            this.state = 555;
	            this.arrayLiteral();
	            break;
	        case 12:
	        case 15:
	            this.enterOuterAlt(localctx, 12);
	            this.state = 556;
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
	    this.enterRule(localctx, 96, GameMakerLanguageParser.RULE_templateStringLiteral);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 559;
	        this.match(GameMakerLanguageParser.TemplateStringStart);
	        this.state = 563;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        while(_la===113 || _la===114) {
	            this.state = 560;
	            this.templateStringAtom();
	            this.state = 565;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	        }
	        this.state = 566;
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
	    this.enterRule(localctx, 98, GameMakerLanguageParser.RULE_templateStringAtom);
	    try {
	        this.state = 573;
	        this._errHandler.sync(this);
	        switch(this._input.LA(1)) {
	        case 114:
	            this.enterOuterAlt(localctx, 1);
	            this.state = 568;
	            this.match(GameMakerLanguageParser.TemplateStringText);
	            break;
	        case 113:
	            this.enterOuterAlt(localctx, 2);
	            this.state = 569;
	            this.match(GameMakerLanguageParser.TemplateStringStartExpression);
	            this.state = 570;
	            this.expression(0);
	            this.state = 571;
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
	    this.enterRule(localctx, 100, GameMakerLanguageParser.RULE_arrayLiteral);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 575;
	        this.match(GameMakerLanguageParser.OpenBracket);
	        this.state = 576;
	        this.elementList();
	        this.state = 577;
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
	    this.enterRule(localctx, 102, GameMakerLanguageParser.RULE_elementList);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 582;
	        this._errHandler.sync(this);
	        var _alt = this._interp.adaptivePredict(this._input,52,this._ctx)
	        while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
	            if(_alt===1) {
	                this.state = 579;
	                this.match(GameMakerLanguageParser.Comma); 
	            }
	            this.state = 584;
	            this._errHandler.sync(this);
	            _alt = this._interp.adaptivePredict(this._input,52,this._ctx);
	        }

	        this.state = 586;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if((((_la) & ~0x1f) === 0 && ((1 << _la) & 264279048) !== 0) || ((((_la - 63)) & ~0x1f) === 0 && ((1 << (_la - 63)) & 16781439) !== 0) || ((((_la - 96)) & ~0x1f) === 0 && ((1 << (_la - 96)) & 1921) !== 0)) {
	            this.state = 585;
	            this.expressionOrFunction();
	        }

	        this.state = 596;
	        this._errHandler.sync(this);
	        var _alt = this._interp.adaptivePredict(this._input,55,this._ctx)
	        while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
	            if(_alt===1) {
	                this.state = 589; 
	                this._errHandler.sync(this);
	                _la = this._input.LA(1);
	                do {
	                    this.state = 588;
	                    this.match(GameMakerLanguageParser.Comma);
	                    this.state = 591; 
	                    this._errHandler.sync(this);
	                    _la = this._input.LA(1);
	                } while(_la===18);
	                this.state = 593;
	                this.expressionOrFunction(); 
	            }
	            this.state = 598;
	            this._errHandler.sync(this);
	            _alt = this._interp.adaptivePredict(this._input,55,this._ctx);
	        }

	        this.state = 600;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===18) {
	            this.state = 599;
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
	    this.enterRule(localctx, 104, GameMakerLanguageParser.RULE_structLiteral);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 602;
	        this.openBlock();
	        this.state = 614;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===64 || ((((_la - 96)) & ~0x1f) === 0 && ((1 << (_la - 96)) & 1409) !== 0)) {
	            this.state = 603;
	            this.propertyAssignment();
	            this.state = 608;
	            this._errHandler.sync(this);
	            var _alt = this._interp.adaptivePredict(this._input,57,this._ctx)
	            while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
	                if(_alt===1) {
	                    this.state = 604;
	                    this.match(GameMakerLanguageParser.Comma);
	                    this.state = 605;
	                    this.propertyAssignment(); 
	                }
	                this.state = 610;
	                this._errHandler.sync(this);
	                _alt = this._interp.adaptivePredict(this._input,57,this._ctx);
	            }

	            this.state = 612;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	            if(_la===18) {
	                this.state = 611;
	                this.match(GameMakerLanguageParser.Comma);
	            }

	        }

	        this.state = 616;
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
	    this.enterRule(localctx, 106, GameMakerLanguageParser.RULE_propertyAssignment);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 618;
	        this.propertyIdentifier();
	        this.state = 619;
	        this.match(GameMakerLanguageParser.Colon);
	        this.state = 620;
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
	    this.enterRule(localctx, 108, GameMakerLanguageParser.RULE_propertyIdentifier);
	    try {
	        this.state = 627;
	        this._errHandler.sync(this);
	        switch(this._input.LA(1)) {
	        case 103:
	            this.enterOuterAlt(localctx, 1);
	            this.state = 622;
	            this.match(GameMakerLanguageParser.Identifier);
	            break;
	        case 96:
	            this.enterOuterAlt(localctx, 2);
	            this.state = 623;
	            this.softKeyword();
	            break;
	        case 64:
	            this.enterOuterAlt(localctx, 3);
	            this.state = 624;
	            this.propertySoftKeyword();
	            break;
	        case 104:
	            this.enterOuterAlt(localctx, 4);
	            this.state = 625;
	            this.match(GameMakerLanguageParser.StringLiteral);
	            break;
	        case 106:
	            this.enterOuterAlt(localctx, 5);
	            this.state = 626;
	            this.match(GameMakerLanguageParser.VerbatimStringLiteral);
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
	    this.enterRule(localctx, 110, GameMakerLanguageParser.RULE_functionDeclaration);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 629;
	        this.match(GameMakerLanguageParser.Function_);
	        this.state = 631;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===103) {
	            this.state = 630;
	            this.match(GameMakerLanguageParser.Identifier);
	        }

	        this.state = 633;
	        this.parameterList();
	        this.state = 635;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===20 || _la===96) {
	            this.state = 634;
	            this.constructorClause();
	        }

	        this.state = 637;
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
	    this.enterRule(localctx, 112, GameMakerLanguageParser.RULE_constructorClause);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 642;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===20) {
	            this.state = 639;
	            this.match(GameMakerLanguageParser.Colon);
	            this.state = 640;
	            this.match(GameMakerLanguageParser.Identifier);
	            this.state = 641;
	            this.arguments();
	        }

	        this.state = 644;
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
	    this.enterRule(localctx, 114, GameMakerLanguageParser.RULE_parameterList);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 646;
	        this.match(GameMakerLanguageParser.OpenParen);
	        this.state = 658;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===96 || _la===103) {
	            this.state = 647;
	            this.parameterArgument();
	            this.state = 652;
	            this._errHandler.sync(this);
	            var _alt = this._interp.adaptivePredict(this._input,64,this._ctx)
	            while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
	                if(_alt===1) {
	                    this.state = 648;
	                    this.match(GameMakerLanguageParser.Comma);
	                    this.state = 649;
	                    this.parameterArgument(); 
	                }
	                this.state = 654;
	                this._errHandler.sync(this);
	                _alt = this._interp.adaptivePredict(this._input,64,this._ctx);
	            }

	            this.state = 656;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	            if(_la===18) {
	                this.state = 655;
	                this.match(GameMakerLanguageParser.Comma);
	            }

	        }

	        this.state = 660;
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
	    this.enterRule(localctx, 116, GameMakerLanguageParser.RULE_parameterArgument);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 662;
	        this.identifier();
	        this.state = 665;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===19) {
	            this.state = 663;
	            this.match(GameMakerLanguageParser.Assign);
	            this.state = 664;
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
	    this.enterRule(localctx, 118, GameMakerLanguageParser.RULE_identifier);
	    try {
	        this.state = 669;
	        this._errHandler.sync(this);
	        switch(this._input.LA(1)) {
	        case 103:
	            this.enterOuterAlt(localctx, 1);
	            this.state = 667;
	            this.match(GameMakerLanguageParser.Identifier);
	            break;
	        case 96:
	            this.enterOuterAlt(localctx, 2);
	            this.state = 668;
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
	    this.enterRule(localctx, 120, GameMakerLanguageParser.RULE_enumeratorDeclaration);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 671;
	        this.match(GameMakerLanguageParser.Enum);
	        this.state = 672;
	        this.identifier();
	        this.state = 673;
	        this.openBlock();
	        this.state = 675;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===96 || _la===103) {
	            this.state = 674;
	            this.enumeratorList();
	        }

	        this.state = 677;
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
	    this.enterRule(localctx, 122, GameMakerLanguageParser.RULE_enumeratorList);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 679;
	        this.enumerator();
	        this.state = 684;
	        this._errHandler.sync(this);
	        var _alt = this._interp.adaptivePredict(this._input,70,this._ctx)
	        while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
	            if(_alt===1) {
	                this.state = 680;
	                this.match(GameMakerLanguageParser.Comma);
	                this.state = 681;
	                this.enumerator(); 
	            }
	            this.state = 686;
	            this._errHandler.sync(this);
	            _alt = this._interp.adaptivePredict(this._input,70,this._ctx);
	        }

	        this.state = 688;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===18) {
	            this.state = 687;
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
	    this.enterRule(localctx, 124, GameMakerLanguageParser.RULE_enumerator);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 690;
	        this.identifier();
	        this.state = 693;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===19) {
	            this.state = 691;
	            this.match(GameMakerLanguageParser.Assign);
	            this.state = 692;
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



	macroStatement() {
	    let localctx = new MacroStatementContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 126, GameMakerLanguageParser.RULE_macroStatement);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 695;
	        this.match(GameMakerLanguageParser.Macro);
	        this.state = 696;
	        this.identifier();
	        this.state = 698; 
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        do {
	            this.state = 697;
	            this.macroToken();
	            this.state = 700; 
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	        } while((((_la) & ~0x1f) === 0 && ((1 << _la) & 4294967288) !== 0) || ((((_la - 32)) & ~0x1f) === 0 && ((1 << (_la - 32)) & 4294967295) !== 0) || ((((_la - 64)) & ~0x1f) === 0 && ((1 << (_la - 64)) & 4294967295) !== 0) || ((((_la - 96)) & ~0x1f) === 0 && ((1 << (_la - 96)) & 460683) !== 0));
	        this.state = 702;
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
	    this.enterRule(localctx, 128, GameMakerLanguageParser.RULE_defineStatement);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 704;
	        this.match(GameMakerLanguageParser.Define);
	        this.state = 705;
	        this.match(GameMakerLanguageParser.RegionCharacters);
	        this.state = 706;
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
	    this.enterRule(localctx, 130, GameMakerLanguageParser.RULE_regionStatement);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 708;
	        _la = this._input.LA(1);
	        if(!(_la===101 || _la===102)) {
	        this._errHandler.recoverInline(this);
	        }
	        else {
	        	this._errHandler.reportMatch(this);
	            this.consume();
	        }
	        this.state = 710;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===110) {
	            this.state = 709;
	            this.match(GameMakerLanguageParser.RegionCharacters);
	        }

	        this.state = 712;
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
	    this.enterRule(localctx, 132, GameMakerLanguageParser.RULE_identifierStatement);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 714;
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
	    this.enterRule(localctx, 134, GameMakerLanguageParser.RULE_softKeyword);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 716;
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
	    this.enterRule(localctx, 136, GameMakerLanguageParser.RULE_propertySoftKeyword);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 718;
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
	    this.enterRule(localctx, 138, GameMakerLanguageParser.RULE_openBlock);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 720;
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
	    this.enterRule(localctx, 140, GameMakerLanguageParser.RULE_closeBlock);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 722;
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
	    this.enterRule(localctx, 142, GameMakerLanguageParser.RULE_eos);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 724;
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
	    this.enterRule(localctx, 144, GameMakerLanguageParser.RULE_macroToken);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 726;
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
GameMakerLanguageParser.Equals = 42;
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
GameMakerLanguageParser.RULE_literalStatement = 22;
GameMakerLanguageParser.RULE_assignmentExpression = 23;
GameMakerLanguageParser.RULE_variableDeclarationList = 24;
GameMakerLanguageParser.RULE_varModifier = 25;
GameMakerLanguageParser.RULE_variableDeclaration = 26;
GameMakerLanguageParser.RULE_globalVarStatement = 27;
GameMakerLanguageParser.RULE_newExpression = 28;
GameMakerLanguageParser.RULE_lValueStartExpression = 29;
GameMakerLanguageParser.RULE_lValueExpression = 30;
GameMakerLanguageParser.RULE_lValueChainOperator = 31;
GameMakerLanguageParser.RULE_lValueFinalOperator = 32;
GameMakerLanguageParser.RULE_expressionSequence = 33;
GameMakerLanguageParser.RULE_expressionOrFunction = 34;
GameMakerLanguageParser.RULE_expression = 35;
GameMakerLanguageParser.RULE_callStatement = 36;
GameMakerLanguageParser.RULE_callableExpression = 37;
GameMakerLanguageParser.RULE_preIncDecExpression = 38;
GameMakerLanguageParser.RULE_postIncDecExpression = 39;
GameMakerLanguageParser.RULE_incDecStatement = 40;
GameMakerLanguageParser.RULE_accessor = 41;
GameMakerLanguageParser.RULE_arguments = 42;
GameMakerLanguageParser.RULE_argumentList = 43;
GameMakerLanguageParser.RULE_argument = 44;
GameMakerLanguageParser.RULE_trailingComma = 45;
GameMakerLanguageParser.RULE_assignmentOperator = 46;
GameMakerLanguageParser.RULE_literal = 47;
GameMakerLanguageParser.RULE_templateStringLiteral = 48;
GameMakerLanguageParser.RULE_templateStringAtom = 49;
GameMakerLanguageParser.RULE_arrayLiteral = 50;
GameMakerLanguageParser.RULE_elementList = 51;
GameMakerLanguageParser.RULE_structLiteral = 52;
GameMakerLanguageParser.RULE_propertyAssignment = 53;
GameMakerLanguageParser.RULE_propertyIdentifier = 54;
GameMakerLanguageParser.RULE_functionDeclaration = 55;
GameMakerLanguageParser.RULE_constructorClause = 56;
GameMakerLanguageParser.RULE_parameterList = 57;
GameMakerLanguageParser.RULE_parameterArgument = 58;
GameMakerLanguageParser.RULE_identifier = 59;
GameMakerLanguageParser.RULE_enumeratorDeclaration = 60;
GameMakerLanguageParser.RULE_enumeratorList = 61;
GameMakerLanguageParser.RULE_enumerator = 62;
GameMakerLanguageParser.RULE_macroStatement = 63;
GameMakerLanguageParser.RULE_defineStatement = 64;
GameMakerLanguageParser.RULE_regionStatement = 65;
GameMakerLanguageParser.RULE_identifierStatement = 66;
GameMakerLanguageParser.RULE_softKeyword = 67;
GameMakerLanguageParser.RULE_propertySoftKeyword = 68;
GameMakerLanguageParser.RULE_openBlock = 69;
GameMakerLanguageParser.RULE_closeBlock = 70;
GameMakerLanguageParser.RULE_eos = 71;
GameMakerLanguageParser.RULE_macroToken = 72;

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
	};

	statementList() {
	    return this.getTypedRuleContext(StatementListContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterProgram(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitProgram(this);
		}
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

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterStatementList(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitStatementList(this);
		}
	}

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
	};

	emptyStatement() {
	    return this.getTypedRuleContext(EmptyStatementContext,0);
	};

	ifStatement() {
	    return this.getTypedRuleContext(IfStatementContext,0);
	};

	variableDeclarationList() {
	    return this.getTypedRuleContext(VariableDeclarationListContext,0);
	};

	iterationStatement() {
	    return this.getTypedRuleContext(IterationStatementContext,0);
	};

	continueStatement() {
	    return this.getTypedRuleContext(ContinueStatementContext,0);
	};

	breakStatement() {
	    return this.getTypedRuleContext(BreakStatementContext,0);
	};

	returnStatement() {
	    return this.getTypedRuleContext(ReturnStatementContext,0);
	};

	withStatement() {
	    return this.getTypedRuleContext(WithStatementContext,0);
	};

	switchStatement() {
	    return this.getTypedRuleContext(SwitchStatementContext,0);
	};

	tryStatement() {
	    return this.getTypedRuleContext(TryStatementContext,0);
	};

	throwStatement() {
	    return this.getTypedRuleContext(ThrowStatementContext,0);
	};

	exitStatement() {
	    return this.getTypedRuleContext(ExitStatementContext,0);
	};

	macroStatement() {
	    return this.getTypedRuleContext(MacroStatementContext,0);
	};

	defineStatement() {
	    return this.getTypedRuleContext(DefineStatementContext,0);
	};

	regionStatement() {
	    return this.getTypedRuleContext(RegionStatementContext,0);
	};

	enumeratorDeclaration() {
	    return this.getTypedRuleContext(EnumeratorDeclarationContext,0);
	};

	globalVarStatement() {
	    return this.getTypedRuleContext(GlobalVarStatementContext,0);
	};

	assignmentExpression() {
	    return this.getTypedRuleContext(AssignmentExpressionContext,0);
	};

	incDecStatement() {
	    return this.getTypedRuleContext(IncDecStatementContext,0);
	};

	callStatement() {
	    return this.getTypedRuleContext(CallStatementContext,0);
	};

	functionDeclaration() {
	    return this.getTypedRuleContext(FunctionDeclarationContext,0);
	};

	deleteStatement() {
	    return this.getTypedRuleContext(DeleteStatementContext,0);
	};

	literalStatement() {
	    return this.getTypedRuleContext(LiteralStatementContext,0);
	};

	identifierStatement() {
	    return this.getTypedRuleContext(IdentifierStatementContext,0);
	};

	eos() {
	    return this.getTypedRuleContext(EosContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterStatement(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitStatement(this);
		}
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
	};

	closeBlock() {
	    return this.getTypedRuleContext(CloseBlockContext,0);
	};

	statementList() {
	    return this.getTypedRuleContext(StatementListContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterBlock(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitBlock(this);
		}
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
	};

	expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
	};

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
	};

	Else() {
	    return this.getToken(GameMakerLanguageParser.Else, 0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterIfStatement(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitIfStatement(this);
		}
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
	};

	statement() {
	    return this.getTypedRuleContext(StatementContext,0);
	};

	Until() {
	    return this.getToken(GameMakerLanguageParser.Until, 0);
	};

	expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterDoStatement(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitDoStatement(this);
		}
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
	};

	expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
	};

	statement() {
	    return this.getTypedRuleContext(StatementContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterWhileStatement(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitWhileStatement(this);
		}
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
	};

	OpenParen() {
	    return this.getToken(GameMakerLanguageParser.OpenParen, 0);
	};

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
	};

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
	};

	assignmentExpression() {
	    return this.getTypedRuleContext(AssignmentExpressionContext,0);
	};

	expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterForStatement(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitForStatement(this);
		}
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
	};

	expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
	};

	statement() {
	    return this.getTypedRuleContext(StatementContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterRepeatStatement(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitRepeatStatement(this);
		}
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
	};

	expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
	};

	statement() {
	    return this.getTypedRuleContext(StatementContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterWithStatement(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitWithStatement(this);
		}
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
	};

	expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
	};

	caseBlock() {
	    return this.getTypedRuleContext(CaseBlockContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterSwitchStatement(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitSwitchStatement(this);
		}
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
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterContinueStatement(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitContinueStatement(this);
		}
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
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterBreakStatement(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitBreakStatement(this);
		}
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
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterExitStatement(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitExitStatement(this);
		}
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
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterEmptyStatement(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitEmptyStatement(this);
		}
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
	};

	closeBlock() {
	    return this.getTypedRuleContext(CloseBlockContext,0);
	};

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
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterCaseBlock(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitCaseBlock(this);
		}
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

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterCaseClauses(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitCaseClauses(this);
		}
	}

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
	};

	expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
	};

	Colon() {
	    return this.getToken(GameMakerLanguageParser.Colon, 0);
	};

	statementList() {
	    return this.getTypedRuleContext(StatementListContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterCaseClause(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitCaseClause(this);
		}
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
	};

	Colon() {
	    return this.getToken(GameMakerLanguageParser.Colon, 0);
	};

	statementList() {
	    return this.getTypedRuleContext(StatementListContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterDefaultClause(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitDefaultClause(this);
		}
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
	};

	expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterThrowStatement(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitThrowStatement(this);
		}
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
	};

	statement() {
	    return this.getTypedRuleContext(StatementContext,0);
	};

	catchProduction() {
	    return this.getTypedRuleContext(CatchProductionContext,0);
	};

	finallyProduction() {
	    return this.getTypedRuleContext(FinallyProductionContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterTryStatement(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitTryStatement(this);
		}
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
	};

	statement() {
	    return this.getTypedRuleContext(StatementContext,0);
	};

	OpenParen() {
	    return this.getToken(GameMakerLanguageParser.OpenParen, 0);
	};

	CloseParen() {
	    return this.getToken(GameMakerLanguageParser.CloseParen, 0);
	};

	identifier() {
	    return this.getTypedRuleContext(IdentifierContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterCatchProduction(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitCatchProduction(this);
		}
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
	};

	statement() {
	    return this.getTypedRuleContext(StatementContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterFinallyProduction(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitFinallyProduction(this);
		}
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
	};

	expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterReturnStatement(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitReturnStatement(this);
		}
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
	};

	expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterDeleteStatement(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitDeleteStatement(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitDeleteStatement(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



class LiteralStatementContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_literalStatement;
    }

	literal() {
	    return this.getTypedRuleContext(LiteralContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterLiteralStatement(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitLiteralStatement(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitLiteralStatement(this);
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
	};

	assignmentOperator() {
	    return this.getTypedRuleContext(AssignmentOperatorContext,0);
	};

	expressionOrFunction() {
	    return this.getTypedRuleContext(ExpressionOrFunctionContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterAssignmentExpression(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitAssignmentExpression(this);
		}
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
	};

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


	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterVariableDeclarationList(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitVariableDeclarationList(this);
		}
	}

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
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterVarModifier(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitVarModifier(this);
		}
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
	};

	Assign() {
	    return this.getToken(GameMakerLanguageParser.Assign, 0);
	};

	expressionOrFunction() {
	    return this.getTypedRuleContext(ExpressionOrFunctionContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterVariableDeclaration(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitVariableDeclaration(this);
		}
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
	};

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


	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterGlobalVarStatement(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitGlobalVarStatement(this);
		}
	}

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
	};

	identifier() {
	    return this.getTypedRuleContext(IdentifierContext,0);
	};

	arguments() {
	    return this.getTypedRuleContext(ArgumentsContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterNewExpression(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitNewExpression(this);
		}
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
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterNewLValue(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitNewLValue(this);
		}
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

class ParenthesizedLValueContext extends LValueStartExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	OpenParen() {
	    return this.getToken(GameMakerLanguageParser.OpenParen, 0);
	};

	lValueExpression() {
	    return this.getTypedRuleContext(LValueExpressionContext,0);
	};

	CloseParen() {
	    return this.getToken(GameMakerLanguageParser.CloseParen, 0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterParenthesizedLValue(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitParenthesizedLValue(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitParenthesizedLValue(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

GameMakerLanguageParser.ParenthesizedLValueContext = ParenthesizedLValueContext;

class IdentifierLValueContext extends LValueStartExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	identifier() {
	    return this.getTypedRuleContext(IdentifierContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterIdentifierLValue(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitIdentifierLValue(this);
		}
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
	};

	lValueFinalOperator() {
	    return this.getTypedRuleContext(LValueFinalOperatorContext,0);
	};

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

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterLValueExpression(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitLValueExpression(this);
		}
	}

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
	};

	identifier() {
	    return this.getTypedRuleContext(IdentifierContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterMemberDotLValue(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitMemberDotLValue(this);
		}
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
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterCallLValue(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitCallLValue(this);
		}
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
	};

	expressionSequence() {
	    return this.getTypedRuleContext(ExpressionSequenceContext,0);
	};

	CloseBracket() {
	    return this.getToken(GameMakerLanguageParser.CloseBracket, 0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterMemberIndexLValue(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitMemberIndexLValue(this);
		}
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
	};

	identifier() {
	    return this.getTypedRuleContext(IdentifierContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterMemberDotLValueFinal(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitMemberDotLValueFinal(this);
		}
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
	};

	expressionSequence() {
	    return this.getTypedRuleContext(ExpressionSequenceContext,0);
	};

	CloseBracket() {
	    return this.getToken(GameMakerLanguageParser.CloseBracket, 0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterMemberIndexLValueFinal(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitMemberIndexLValueFinal(this);
		}
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


	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterExpressionSequence(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitExpressionSequence(this);
		}
	}

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
	};

	functionDeclaration() {
	    return this.getTypedRuleContext(FunctionDeclarationContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterExpressionOrFunction(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitExpressionOrFunction(this);
		}
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
	};

	expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
	};

	CloseParen() {
	    return this.getToken(GameMakerLanguageParser.CloseParen, 0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterParenthesizedExpression(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitParenthesizedExpression(this);
		}
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
	};

	Colon() {
	    return this.getToken(GameMakerLanguageParser.Colon, 0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterTernaryExpression(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitTernaryExpression(this);
		}
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

class FunctionExpressionContext extends ExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	functionDeclaration() {
	    return this.getTypedRuleContext(FunctionDeclarationContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterFunctionExpression(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitFunctionExpression(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitFunctionExpression(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

GameMakerLanguageParser.FunctionExpressionContext = FunctionExpressionContext;

class UnaryMinusExpressionContext extends ExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	Minus() {
	    return this.getToken(GameMakerLanguageParser.Minus, 0);
	};

	expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterUnaryMinusExpression(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitUnaryMinusExpression(this);
		}
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

class BitNotExpressionContext extends ExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	BitNot() {
	    return this.getToken(GameMakerLanguageParser.BitNot, 0);
	};

	expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterBitNotExpression(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitBitNotExpression(this);
		}
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

class BinaryExpressionContext extends ExpressionContext {

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
	};

	Divide() {
	    return this.getToken(GameMakerLanguageParser.Divide, 0);
	};

	IntegerDivide() {
	    return this.getToken(GameMakerLanguageParser.IntegerDivide, 0);
	};

	Modulo() {
	    return this.getToken(GameMakerLanguageParser.Modulo, 0);
	};

	Plus() {
	    return this.getToken(GameMakerLanguageParser.Plus, 0);
	};

	Minus() {
	    return this.getToken(GameMakerLanguageParser.Minus, 0);
	};

	LeftShiftArithmetic() {
	    return this.getToken(GameMakerLanguageParser.LeftShiftArithmetic, 0);
	};

	RightShiftArithmetic() {
	    return this.getToken(GameMakerLanguageParser.RightShiftArithmetic, 0);
	};

	BitAnd() {
	    return this.getToken(GameMakerLanguageParser.BitAnd, 0);
	};

	BitXOr() {
	    return this.getToken(GameMakerLanguageParser.BitXOr, 0);
	};

	BitOr() {
	    return this.getToken(GameMakerLanguageParser.BitOr, 0);
	};

	Equals() {
	    return this.getToken(GameMakerLanguageParser.Equals, 0);
	};

	NotEquals() {
	    return this.getToken(GameMakerLanguageParser.NotEquals, 0);
	};

	LessThan() {
	    return this.getToken(GameMakerLanguageParser.LessThan, 0);
	};

	MoreThan() {
	    return this.getToken(GameMakerLanguageParser.MoreThan, 0);
	};

	LessThanEquals() {
	    return this.getToken(GameMakerLanguageParser.LessThanEquals, 0);
	};

	GreaterThanEquals() {
	    return this.getToken(GameMakerLanguageParser.GreaterThanEquals, 0);
	};

	NullCoalesce() {
	    return this.getToken(GameMakerLanguageParser.NullCoalesce, 0);
	};

	And() {
	    return this.getToken(GameMakerLanguageParser.And, 0);
	};

	Or() {
	    return this.getToken(GameMakerLanguageParser.Or, 0);
	};

	Xor() {
	    return this.getToken(GameMakerLanguageParser.Xor, 0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterBinaryExpression(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitBinaryExpression(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitBinaryExpression(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

GameMakerLanguageParser.BinaryExpressionContext = BinaryExpressionContext;

class LiteralExpressionContext extends ExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	literal() {
	    return this.getTypedRuleContext(LiteralContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterLiteralExpression(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitLiteralExpression(this);
		}
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

class UnaryPlusExpressionContext extends ExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	Plus() {
	    return this.getToken(GameMakerLanguageParser.Plus, 0);
	};

	expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterUnaryPlusExpression(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitUnaryPlusExpression(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitUnaryPlusExpression(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

GameMakerLanguageParser.UnaryPlusExpressionContext = UnaryPlusExpressionContext;

class NotExpressionContext extends ExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	Not() {
	    return this.getToken(GameMakerLanguageParser.Not, 0);
	};

	expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterNotExpression(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitNotExpression(this);
		}
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

class VariableExpressionContext extends ExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	lValueExpression() {
	    return this.getTypedRuleContext(LValueExpressionContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterVariableExpression(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitVariableExpression(this);
		}
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

class IncDecExpressionContext extends ExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	preIncDecExpression() {
	    return this.getTypedRuleContext(PreIncDecExpressionContext,0);
	};

	postIncDecExpression() {
	    return this.getTypedRuleContext(PostIncDecExpressionContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterIncDecExpression(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitIncDecExpression(this);
		}
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

class CallExpressionContext extends ExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	callStatement() {
	    return this.getTypedRuleContext(CallStatementContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterCallExpression(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitCallExpression(this);
		}
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
	};

	arguments() {
	    return this.getTypedRuleContext(ArgumentsContext,0);
	};

	callStatement() {
	    return this.getTypedRuleContext(CallStatementContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterCallStatement(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitCallStatement(this);
		}
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
	};

	OpenParen() {
	    return this.getToken(GameMakerLanguageParser.OpenParen, 0);
	};

	CloseParen() {
	    return this.getToken(GameMakerLanguageParser.CloseParen, 0);
	};

	functionDeclaration() {
	    return this.getTypedRuleContext(FunctionDeclarationContext,0);
	};

	callableExpression() {
	    return this.getTypedRuleContext(CallableExpressionContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterCallableExpression(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitCallableExpression(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitCallableExpression(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



class PreIncDecExpressionContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_preIncDecExpression;
    }


	 
		copyFrom(ctx) {
			super.copyFrom(ctx);
		}

}


class PreIncDecStatementContext extends PreIncDecExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	lValueExpression() {
	    return this.getTypedRuleContext(LValueExpressionContext,0);
	};

	PlusPlus() {
	    return this.getToken(GameMakerLanguageParser.PlusPlus, 0);
	};

	MinusMinus() {
	    return this.getToken(GameMakerLanguageParser.MinusMinus, 0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterPreIncDecStatement(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitPreIncDecStatement(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitPreIncDecStatement(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

GameMakerLanguageParser.PreIncDecStatementContext = PreIncDecStatementContext;

class PostIncDecExpressionContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_postIncDecExpression;
    }


	 
		copyFrom(ctx) {
			super.copyFrom(ctx);
		}

}


class PostIncDecStatementContext extends PostIncDecExpressionContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	lValueExpression() {
	    return this.getTypedRuleContext(LValueExpressionContext,0);
	};

	PlusPlus() {
	    return this.getToken(GameMakerLanguageParser.PlusPlus, 0);
	};

	MinusMinus() {
	    return this.getToken(GameMakerLanguageParser.MinusMinus, 0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterPostIncDecStatement(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitPostIncDecStatement(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitPostIncDecStatement(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

GameMakerLanguageParser.PostIncDecStatementContext = PostIncDecStatementContext;

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

	postIncDecExpression() {
	    return this.getTypedRuleContext(PostIncDecExpressionContext,0);
	};

	preIncDecExpression() {
	    return this.getTypedRuleContext(PreIncDecExpressionContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterIncDecStatement(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitIncDecStatement(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitIncDecStatement(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



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
	};

	ListAccessor() {
	    return this.getToken(GameMakerLanguageParser.ListAccessor, 0);
	};

	MapAccessor() {
	    return this.getToken(GameMakerLanguageParser.MapAccessor, 0);
	};

	GridAccessor() {
	    return this.getToken(GameMakerLanguageParser.GridAccessor, 0);
	};

	ArrayAccessor() {
	    return this.getToken(GameMakerLanguageParser.ArrayAccessor, 0);
	};

	StructAccessor() {
	    return this.getToken(GameMakerLanguageParser.StructAccessor, 0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterAccessor(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitAccessor(this);
		}
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
	};

	CloseParen() {
	    return this.getToken(GameMakerLanguageParser.CloseParen, 0);
	};

	argumentList() {
	    return this.getTypedRuleContext(ArgumentListContext,0);
	};

	trailingComma() {
	    return this.getTypedRuleContext(TrailingCommaContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterArguments(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitArguments(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitArguments(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



class ArgumentListContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_argumentList;
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


	argument = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(ArgumentContext);
	    } else {
	        return this.getTypedRuleContext(ArgumentContext,i);
	    }
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterArgumentList(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitArgumentList(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitArgumentList(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



class ArgumentContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_argument;
    }

	expressionOrFunction() {
	    return this.getTypedRuleContext(ExpressionOrFunctionContext,0);
	};

	UndefinedLiteral() {
	    return this.getToken(GameMakerLanguageParser.UndefinedLiteral, 0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterArgument(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitArgument(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitArgument(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



class TrailingCommaContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = GameMakerLanguageParser.RULE_trailingComma;
    }

	Comma() {
	    return this.getToken(GameMakerLanguageParser.Comma, 0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterTrailingComma(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitTrailingComma(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof GameMakerLanguageParserVisitor ) {
	        return visitor.visitTrailingComma(this);
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
	};

	DivideAssign() {
	    return this.getToken(GameMakerLanguageParser.DivideAssign, 0);
	};

	ModulusAssign() {
	    return this.getToken(GameMakerLanguageParser.ModulusAssign, 0);
	};

	PlusAssign() {
	    return this.getToken(GameMakerLanguageParser.PlusAssign, 0);
	};

	MinusAssign() {
	    return this.getToken(GameMakerLanguageParser.MinusAssign, 0);
	};

	LeftShiftArithmeticAssign() {
	    return this.getToken(GameMakerLanguageParser.LeftShiftArithmeticAssign, 0);
	};

	RightShiftArithmeticAssign() {
	    return this.getToken(GameMakerLanguageParser.RightShiftArithmeticAssign, 0);
	};

	BitAndAssign() {
	    return this.getToken(GameMakerLanguageParser.BitAndAssign, 0);
	};

	BitXorAssign() {
	    return this.getToken(GameMakerLanguageParser.BitXorAssign, 0);
	};

	BitOrAssign() {
	    return this.getToken(GameMakerLanguageParser.BitOrAssign, 0);
	};

	NullCoalescingAssign() {
	    return this.getToken(GameMakerLanguageParser.NullCoalescingAssign, 0);
	};

	Assign() {
	    return this.getToken(GameMakerLanguageParser.Assign, 0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterAssignmentOperator(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitAssignmentOperator(this);
		}
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
	};

	NoOneLiteral() {
	    return this.getToken(GameMakerLanguageParser.NoOneLiteral, 0);
	};

	BooleanLiteral() {
	    return this.getToken(GameMakerLanguageParser.BooleanLiteral, 0);
	};

	StringLiteral() {
	    return this.getToken(GameMakerLanguageParser.StringLiteral, 0);
	};

	VerbatimStringLiteral() {
	    return this.getToken(GameMakerLanguageParser.VerbatimStringLiteral, 0);
	};

	templateStringLiteral() {
	    return this.getTypedRuleContext(TemplateStringLiteralContext,0);
	};

	HexIntegerLiteral() {
	    return this.getToken(GameMakerLanguageParser.HexIntegerLiteral, 0);
	};

	BinaryLiteral() {
	    return this.getToken(GameMakerLanguageParser.BinaryLiteral, 0);
	};

	DecimalLiteral() {
	    return this.getToken(GameMakerLanguageParser.DecimalLiteral, 0);
	};

	IntegerLiteral() {
	    return this.getToken(GameMakerLanguageParser.IntegerLiteral, 0);
	};

	arrayLiteral() {
	    return this.getTypedRuleContext(ArrayLiteralContext,0);
	};

	structLiteral() {
	    return this.getTypedRuleContext(StructLiteralContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterLiteral(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitLiteral(this);
		}
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
	};

	TemplateStringEnd() {
	    return this.getToken(GameMakerLanguageParser.TemplateStringEnd, 0);
	};

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

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterTemplateStringLiteral(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitTemplateStringLiteral(this);
		}
	}

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
	};

	TemplateStringStartExpression() {
	    return this.getToken(GameMakerLanguageParser.TemplateStringStartExpression, 0);
	};

	expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
	};

	TemplateStringEndExpression() {
	    return this.getToken(GameMakerLanguageParser.TemplateStringEndExpression, 0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterTemplateStringAtom(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitTemplateStringAtom(this);
		}
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
	};

	elementList() {
	    return this.getTypedRuleContext(ElementListContext,0);
	};

	CloseBracket() {
	    return this.getToken(GameMakerLanguageParser.CloseBracket, 0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterArrayLiteral(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitArrayLiteral(this);
		}
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

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterElementList(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitElementList(this);
		}
	}

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
	};

	closeBlock() {
	    return this.getTypedRuleContext(CloseBlockContext,0);
	};

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


	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterStructLiteral(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitStructLiteral(this);
		}
	}

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
	};

	Colon() {
	    return this.getToken(GameMakerLanguageParser.Colon, 0);
	};

	expressionOrFunction() {
	    return this.getTypedRuleContext(ExpressionOrFunctionContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterPropertyAssignment(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitPropertyAssignment(this);
		}
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
	};

	softKeyword() {
	    return this.getTypedRuleContext(SoftKeywordContext,0);
	};

	propertySoftKeyword() {
	    return this.getTypedRuleContext(PropertySoftKeywordContext,0);
	};

	StringLiteral() {
	    return this.getToken(GameMakerLanguageParser.StringLiteral, 0);
	};

	VerbatimStringLiteral() {
	    return this.getToken(GameMakerLanguageParser.VerbatimStringLiteral, 0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterPropertyIdentifier(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitPropertyIdentifier(this);
		}
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
	};

	parameterList() {
	    return this.getTypedRuleContext(ParameterListContext,0);
	};

	block() {
	    return this.getTypedRuleContext(BlockContext,0);
	};

	Identifier() {
	    return this.getToken(GameMakerLanguageParser.Identifier, 0);
	};

	constructorClause() {
	    return this.getTypedRuleContext(ConstructorClauseContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterFunctionDeclaration(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitFunctionDeclaration(this);
		}
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
	};

	Colon() {
	    return this.getToken(GameMakerLanguageParser.Colon, 0);
	};

	Identifier() {
	    return this.getToken(GameMakerLanguageParser.Identifier, 0);
	};

	arguments() {
	    return this.getTypedRuleContext(ArgumentsContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterConstructorClause(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitConstructorClause(this);
		}
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
	};

	CloseParen() {
	    return this.getToken(GameMakerLanguageParser.CloseParen, 0);
	};

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


	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterParameterList(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitParameterList(this);
		}
	}

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
	};

	Assign() {
	    return this.getToken(GameMakerLanguageParser.Assign, 0);
	};

	expressionOrFunction() {
	    return this.getTypedRuleContext(ExpressionOrFunctionContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterParameterArgument(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitParameterArgument(this);
		}
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
	};

	softKeyword() {
	    return this.getTypedRuleContext(SoftKeywordContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterIdentifier(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitIdentifier(this);
		}
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
	};

	identifier() {
	    return this.getTypedRuleContext(IdentifierContext,0);
	};

	openBlock() {
	    return this.getTypedRuleContext(OpenBlockContext,0);
	};

	closeBlock() {
	    return this.getTypedRuleContext(CloseBlockContext,0);
	};

	enumeratorList() {
	    return this.getTypedRuleContext(EnumeratorListContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterEnumeratorDeclaration(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitEnumeratorDeclaration(this);
		}
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


	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterEnumeratorList(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitEnumeratorList(this);
		}
	}

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
	};

	Assign() {
	    return this.getToken(GameMakerLanguageParser.Assign, 0);
	};

	expression() {
	    return this.getTypedRuleContext(ExpressionContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterEnumerator(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitEnumerator(this);
		}
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
	};

	identifier() {
	    return this.getTypedRuleContext(IdentifierContext,0);
	};

	LineTerminator() {
	    return this.getToken(GameMakerLanguageParser.LineTerminator, 0);
	};

	EOF() {
	    return this.getToken(GameMakerLanguageParser.EOF, 0);
	};

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

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterMacroStatement(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitMacroStatement(this);
		}
	}

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
	};

	RegionCharacters() {
	    return this.getToken(GameMakerLanguageParser.RegionCharacters, 0);
	};

	RegionEOL() {
	    return this.getToken(GameMakerLanguageParser.RegionEOL, 0);
	};

	EOF() {
	    return this.getToken(GameMakerLanguageParser.EOF, 0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterDefineStatement(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitDefineStatement(this);
		}
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
	};

	EndRegion() {
	    return this.getToken(GameMakerLanguageParser.EndRegion, 0);
	};

	RegionEOL() {
	    return this.getToken(GameMakerLanguageParser.RegionEOL, 0);
	};

	EOF() {
	    return this.getToken(GameMakerLanguageParser.EOF, 0);
	};

	RegionCharacters() {
	    return this.getToken(GameMakerLanguageParser.RegionCharacters, 0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterRegionStatement(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitRegionStatement(this);
		}
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
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterIdentifierStatement(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitIdentifierStatement(this);
		}
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
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterSoftKeyword(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitSoftKeyword(this);
		}
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
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterPropertySoftKeyword(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitPropertySoftKeyword(this);
		}
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
	};

	Begin() {
	    return this.getToken(GameMakerLanguageParser.Begin, 0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterOpenBlock(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitOpenBlock(this);
		}
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
	};

	End() {
	    return this.getToken(GameMakerLanguageParser.End, 0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterCloseBlock(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitCloseBlock(this);
		}
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
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterEos(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitEos(this);
		}
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
	};

	OpenBracket() {
	    return this.getToken(GameMakerLanguageParser.OpenBracket, 0);
	};

	CloseBracket() {
	    return this.getToken(GameMakerLanguageParser.CloseBracket, 0);
	};

	OpenParen() {
	    return this.getToken(GameMakerLanguageParser.OpenParen, 0);
	};

	CloseParen() {
	    return this.getToken(GameMakerLanguageParser.CloseParen, 0);
	};

	OpenBrace() {
	    return this.getToken(GameMakerLanguageParser.OpenBrace, 0);
	};

	CloseBrace() {
	    return this.getToken(GameMakerLanguageParser.CloseBrace, 0);
	};

	Begin() {
	    return this.getToken(GameMakerLanguageParser.Begin, 0);
	};

	End() {
	    return this.getToken(GameMakerLanguageParser.End, 0);
	};

	SemiColon() {
	    return this.getToken(GameMakerLanguageParser.SemiColon, 0);
	};

	Comma() {
	    return this.getToken(GameMakerLanguageParser.Comma, 0);
	};

	Assign() {
	    return this.getToken(GameMakerLanguageParser.Assign, 0);
	};

	Colon() {
	    return this.getToken(GameMakerLanguageParser.Colon, 0);
	};

	Dot() {
	    return this.getToken(GameMakerLanguageParser.Dot, 0);
	};

	PlusPlus() {
	    return this.getToken(GameMakerLanguageParser.PlusPlus, 0);
	};

	MinusMinus() {
	    return this.getToken(GameMakerLanguageParser.MinusMinus, 0);
	};

	Plus() {
	    return this.getToken(GameMakerLanguageParser.Plus, 0);
	};

	Minus() {
	    return this.getToken(GameMakerLanguageParser.Minus, 0);
	};

	BitNot() {
	    return this.getToken(GameMakerLanguageParser.BitNot, 0);
	};

	Not() {
	    return this.getToken(GameMakerLanguageParser.Not, 0);
	};

	Multiply() {
	    return this.getToken(GameMakerLanguageParser.Multiply, 0);
	};

	Divide() {
	    return this.getToken(GameMakerLanguageParser.Divide, 0);
	};

	IntegerDivide() {
	    return this.getToken(GameMakerLanguageParser.IntegerDivide, 0);
	};

	Modulo() {
	    return this.getToken(GameMakerLanguageParser.Modulo, 0);
	};

	Power() {
	    return this.getToken(GameMakerLanguageParser.Power, 0);
	};

	QuestionMark() {
	    return this.getToken(GameMakerLanguageParser.QuestionMark, 0);
	};

	NullCoalesce() {
	    return this.getToken(GameMakerLanguageParser.NullCoalesce, 0);
	};

	NullCoalescingAssign() {
	    return this.getToken(GameMakerLanguageParser.NullCoalescingAssign, 0);
	};

	RightShiftArithmetic() {
	    return this.getToken(GameMakerLanguageParser.RightShiftArithmetic, 0);
	};

	LeftShiftArithmetic() {
	    return this.getToken(GameMakerLanguageParser.LeftShiftArithmetic, 0);
	};

	LessThan() {
	    return this.getToken(GameMakerLanguageParser.LessThan, 0);
	};

	MoreThan() {
	    return this.getToken(GameMakerLanguageParser.MoreThan, 0);
	};

	LessThanEquals() {
	    return this.getToken(GameMakerLanguageParser.LessThanEquals, 0);
	};

	GreaterThanEquals() {
	    return this.getToken(GameMakerLanguageParser.GreaterThanEquals, 0);
	};

	Equals() {
	    return this.getToken(GameMakerLanguageParser.Equals, 0);
	};

	NotEquals() {
	    return this.getToken(GameMakerLanguageParser.NotEquals, 0);
	};

	BitAnd() {
	    return this.getToken(GameMakerLanguageParser.BitAnd, 0);
	};

	BitXOr() {
	    return this.getToken(GameMakerLanguageParser.BitXOr, 0);
	};

	BitOr() {
	    return this.getToken(GameMakerLanguageParser.BitOr, 0);
	};

	And() {
	    return this.getToken(GameMakerLanguageParser.And, 0);
	};

	Or() {
	    return this.getToken(GameMakerLanguageParser.Or, 0);
	};

	Xor() {
	    return this.getToken(GameMakerLanguageParser.Xor, 0);
	};

	MultiplyAssign() {
	    return this.getToken(GameMakerLanguageParser.MultiplyAssign, 0);
	};

	DivideAssign() {
	    return this.getToken(GameMakerLanguageParser.DivideAssign, 0);
	};

	PlusAssign() {
	    return this.getToken(GameMakerLanguageParser.PlusAssign, 0);
	};

	MinusAssign() {
	    return this.getToken(GameMakerLanguageParser.MinusAssign, 0);
	};

	ModulusAssign() {
	    return this.getToken(GameMakerLanguageParser.ModulusAssign, 0);
	};

	LeftShiftArithmeticAssign() {
	    return this.getToken(GameMakerLanguageParser.LeftShiftArithmeticAssign, 0);
	};

	RightShiftArithmeticAssign() {
	    return this.getToken(GameMakerLanguageParser.RightShiftArithmeticAssign, 0);
	};

	BitAndAssign() {
	    return this.getToken(GameMakerLanguageParser.BitAndAssign, 0);
	};

	BitXorAssign() {
	    return this.getToken(GameMakerLanguageParser.BitXorAssign, 0);
	};

	BitOrAssign() {
	    return this.getToken(GameMakerLanguageParser.BitOrAssign, 0);
	};

	NumberSign() {
	    return this.getToken(GameMakerLanguageParser.NumberSign, 0);
	};

	DollarSign() {
	    return this.getToken(GameMakerLanguageParser.DollarSign, 0);
	};

	AtSign() {
	    return this.getToken(GameMakerLanguageParser.AtSign, 0);
	};

	UndefinedLiteral() {
	    return this.getToken(GameMakerLanguageParser.UndefinedLiteral, 0);
	};

	NoOneLiteral() {
	    return this.getToken(GameMakerLanguageParser.NoOneLiteral, 0);
	};

	BooleanLiteral() {
	    return this.getToken(GameMakerLanguageParser.BooleanLiteral, 0);
	};

	IntegerLiteral() {
	    return this.getToken(GameMakerLanguageParser.IntegerLiteral, 0);
	};

	DecimalLiteral() {
	    return this.getToken(GameMakerLanguageParser.DecimalLiteral, 0);
	};

	BinaryLiteral() {
	    return this.getToken(GameMakerLanguageParser.BinaryLiteral, 0);
	};

	HexIntegerLiteral() {
	    return this.getToken(GameMakerLanguageParser.HexIntegerLiteral, 0);
	};

	Break() {
	    return this.getToken(GameMakerLanguageParser.Break, 0);
	};

	Exit() {
	    return this.getToken(GameMakerLanguageParser.Exit, 0);
	};

	Do() {
	    return this.getToken(GameMakerLanguageParser.Do, 0);
	};

	Case() {
	    return this.getToken(GameMakerLanguageParser.Case, 0);
	};

	Else() {
	    return this.getToken(GameMakerLanguageParser.Else, 0);
	};

	New() {
	    return this.getToken(GameMakerLanguageParser.New, 0);
	};

	Var() {
	    return this.getToken(GameMakerLanguageParser.Var, 0);
	};

	GlobalVar() {
	    return this.getToken(GameMakerLanguageParser.GlobalVar, 0);
	};

	Catch() {
	    return this.getToken(GameMakerLanguageParser.Catch, 0);
	};

	Finally() {
	    return this.getToken(GameMakerLanguageParser.Finally, 0);
	};

	Return() {
	    return this.getToken(GameMakerLanguageParser.Return, 0);
	};

	Continue() {
	    return this.getToken(GameMakerLanguageParser.Continue, 0);
	};

	For() {
	    return this.getToken(GameMakerLanguageParser.For, 0);
	};

	Switch() {
	    return this.getToken(GameMakerLanguageParser.Switch, 0);
	};

	While() {
	    return this.getToken(GameMakerLanguageParser.While, 0);
	};

	Until() {
	    return this.getToken(GameMakerLanguageParser.Until, 0);
	};

	Repeat() {
	    return this.getToken(GameMakerLanguageParser.Repeat, 0);
	};

	Function_() {
	    return this.getToken(GameMakerLanguageParser.Function_, 0);
	};

	With() {
	    return this.getToken(GameMakerLanguageParser.With, 0);
	};

	Default() {
	    return this.getToken(GameMakerLanguageParser.Default, 0);
	};

	If() {
	    return this.getToken(GameMakerLanguageParser.If, 0);
	};

	Then() {
	    return this.getToken(GameMakerLanguageParser.Then, 0);
	};

	Throw() {
	    return this.getToken(GameMakerLanguageParser.Throw, 0);
	};

	Delete() {
	    return this.getToken(GameMakerLanguageParser.Delete, 0);
	};

	Try() {
	    return this.getToken(GameMakerLanguageParser.Try, 0);
	};

	Enum() {
	    return this.getToken(GameMakerLanguageParser.Enum, 0);
	};

	Constructor() {
	    return this.getToken(GameMakerLanguageParser.Constructor, 0);
	};

	Static() {
	    return this.getToken(GameMakerLanguageParser.Static, 0);
	};

	Identifier() {
	    return this.getToken(GameMakerLanguageParser.Identifier, 0);
	};

	StringLiteral() {
	    return this.getToken(GameMakerLanguageParser.StringLiteral, 0);
	};

	VerbatimStringLiteral() {
	    return this.getToken(GameMakerLanguageParser.VerbatimStringLiteral, 0);
	};

	TemplateStringStart() {
	    return this.getToken(GameMakerLanguageParser.TemplateStringStart, 0);
	};

	TemplateStringEnd() {
	    return this.getToken(GameMakerLanguageParser.TemplateStringEnd, 0);
	};

	TemplateStringText() {
	    return this.getToken(GameMakerLanguageParser.TemplateStringText, 0);
	};

	TemplateStringStartExpression() {
	    return this.getToken(GameMakerLanguageParser.TemplateStringStartExpression, 0);
	};

	TemplateStringEndExpression() {
	    return this.getToken(GameMakerLanguageParser.TemplateStringEndExpression, 0);
	};

	ListAccessor() {
	    return this.getToken(GameMakerLanguageParser.ListAccessor, 0);
	};

	MapAccessor() {
	    return this.getToken(GameMakerLanguageParser.MapAccessor, 0);
	};

	GridAccessor() {
	    return this.getToken(GameMakerLanguageParser.GridAccessor, 0);
	};

	ArrayAccessor() {
	    return this.getToken(GameMakerLanguageParser.ArrayAccessor, 0);
	};

	StructAccessor() {
	    return this.getToken(GameMakerLanguageParser.StructAccessor, 0);
	};

	enterRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.enterMacroToken(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof GameMakerLanguageParserListener ) {
	        listener.exitMacroToken(this);
		}
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
GameMakerLanguageParser.LiteralStatementContext = LiteralStatementContext; 
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
GameMakerLanguageParser.PreIncDecExpressionContext = PreIncDecExpressionContext; 
GameMakerLanguageParser.PostIncDecExpressionContext = PostIncDecExpressionContext; 
GameMakerLanguageParser.IncDecStatementContext = IncDecStatementContext; 
GameMakerLanguageParser.AccessorContext = AccessorContext; 
GameMakerLanguageParser.ArgumentsContext = ArgumentsContext; 
GameMakerLanguageParser.ArgumentListContext = ArgumentListContext; 
GameMakerLanguageParser.ArgumentContext = ArgumentContext; 
GameMakerLanguageParser.TrailingCommaContext = TrailingCommaContext; 
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
