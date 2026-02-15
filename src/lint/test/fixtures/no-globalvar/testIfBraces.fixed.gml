if (should_exit()) return;

global.doExit = undefined;
if (doExit == global.exitState) {
    exit;
}
