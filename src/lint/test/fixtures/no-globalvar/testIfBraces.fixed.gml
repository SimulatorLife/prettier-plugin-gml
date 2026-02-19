if (should_exit()) return;

global.doExit = undefined;
if (global.doExit == global.exitState) {
    exit;
}
