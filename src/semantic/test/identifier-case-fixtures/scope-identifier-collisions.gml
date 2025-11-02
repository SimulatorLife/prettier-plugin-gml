#macro MACRO_VALUE 10
#macro macro_value 20
#macro MacroValue 30

globalvar global_rate, GLOBAL_RATE;
global.GLOBALPOINT = 1;
global.globalPoint = 2;

enum RewardLevel {
    Bronze,
    bronze
}

enum RewardLevelCopy {
    Bronze,
    BRONZE
}

function scopeCollision() {
    var local_total = MACRO_VALUE + macro_value + MacroValue;
    global_rate = local_total;
    GLOBAL_RATE = globalPoint + GLOBALPOINT;
    return RewardLevel.Bronze + RewardLevelCopy.BRONZE;
}
