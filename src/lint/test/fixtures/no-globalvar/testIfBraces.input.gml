if (should_exit()) return;

globalvar doExit;
if (doExit == global.exitState) {
    exit;
}
