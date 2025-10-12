#macro MAX_COUNT 3
#macro max_count 4

globalvar global_score, GLOBAL_SCORE;

enum Difficulty {
    Easy,
    Hard
}

enum DifficultyCopy {
    Easy,
    Normal
}

function scopeTester() {
    hp = 1;
    global_score = MAX_COUNT;
    GLOBAL_SCORE = max_count;
    var local_value = Difficulty.Easy;
    return DifficultyCopy.Normal;
}
