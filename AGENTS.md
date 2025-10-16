# Agent Instructions
- The existing plugin test input and output fixtures (src/plugin/tests) and the parser input fixtures (src/parser/tests/input) in this project are considered golden files and **MUST NEVER BE MODIFIED**. They capture parsing behavior and the desired formatting for GML and must be preserved byte-for-byte. NEVER update or change these files, certainly not to "fix" a test failure.
- You may add new tests or adjust the way tests are executed, but do not change or replace the current input/output text fixtures.
- Do **NOT** modify the Github Actions workflows in `.github/workflows` unless explicitly instructed to do so. When updating these files, ensure the changes are limited to the specific instructions or guidelines provided, without altering other sections.
- Do **NOT** modify the `eslint.config.js` or `.prettierrc` files unless explicitly instructed to do so. When updating this file, ensure that the changes are limited to the specific instructions or guidelines provided, without altering other sections.
- Do **NOT** modify the `AGENTS.md` file unless explicitly instructed to do so. When updating this file, ensure that the changes are limited to the specific instructions or guidelines provided, without altering other sections.
- Never add eslint-disable comments to the codebase. If lint errors arise, fix them properly.

## Repository & Commit Conflict Resolution Strategy
To ensure smooth collaboration and maintain a healthy commit history, follow this structured process whenever you encounter merge, rebase, or commit conflicts within this repository:

1. **Assess the Situation**
   - Identify the branch you are on, the target branch, and the conflicting files.
   - Determine whether the conflict arises during a merge, rebase, cherry-pick, or regular commit.
   - Review the latest changes on both branches (e.g., `git log --oneline --graph --decorate`) to understand the context.

2. **Gather Context**
   - Inspect conflicting files with `git status` and `git diff --merge` or `git diff --staged` to see both sides of the changes.
   - Consult project documentation, commit messages, or related pull requests to understand the intent behind conflicting edits.
   - If the conflict stems from generated or dependency files, verify whether they should be regenerated rather than manually edited.

3. **Develop a Resolution Strategy**
   - Decide whether to favor one side, integrate both changes, or refactor to accommodate new requirements.
   - Ensure the chosen approach aligns with project conventions, coding standards, and the preservation of golden files.
   - Plan any follow-up actions, such as updating tests or documentation, before modifying files.

4. **Normalize Tooling Before the Merge**
   - Sync the latest base branch and spin up a disposable worktree so you can confirm the formatter configuration from a clean checkout:
     ```bash
     git fetch origin
     git worktree add ../base-format origin/<base>
     (cd ../base-format && npm ci && npm run format && npm run lint -- --fix)
     ```
     The base worktree should end up clean; if the formatter produces real changes here, stop and raise a follow-up rather than committing against the base branch.
   - Back in your main worktree (the PR branch), copy the authoritative formatter/linter configuration from the base worktree:
     ```bash
     git checkout origin/<base> -- eslint.config.js ".prettier*" .editorconfig
     ```
     (Adjust the list to include any other formatter, lint, or tooling configs that affect whitespace or ordering.)
   - Install dependencies if needed and run the same normalization passes on the PR branch:
     ```bash
     npm ci
     npm run format
     npm run lint -- --fix
     git status --short
     ```
     Commit or stash only the mechanical formatter output; this step ensures both branches share the same baseline before conflicts are resolved.
   - Remove the disposable base worktree once finished:
     ```bash
     git worktree remove ../base-format
     ```

5. **Prepare a Clean Merge Environment**
   - Double-check the remote you will push to and refresh refs again (lightweight after the normalization step):
     ```bash
     git remote -v
     git fetch origin
     ```
   - Check out the PR branch so it tracks the remote tip (`git switch <branch>`; use `git switch --track origin/<branch>` if it is not yet local). Abort if `git status --short` shows files you did not generate in the prior normalization step.
   - Inspect the pending diff before touching conflicts:
     ```bash
     git diff --stat origin/<base>...HEAD
     ```
     This keeps the scope tight and highlights which files truly need attention.

6. **Perform the Merge Carefully**
   - Bring the base branch into the PR branch without committing immediately so you can sanity-check the changes:
     ```bash
     git merge --no-commit --no-ff origin/<base>
     ```
     (Rebasing is acceptable if the project requires it; use `git rebase origin/<base>` with the same discipline.)
   - Resolve conflict markers surgically. Prefer editing only the hunks that differ and keep unrelated whitespace or formatting untouched.
   - After each file is reconciled, run `git diff` to confirm only the expected sections changed.
   - Stage files incrementally (`git add <file>`) and keep the merge paused until everything looks correct. If you used `git merge --no-commit`, finish with `git commit` once satisfied. For rebases, continue with `git rebase --continue`.

7. **Validate Thoroughly**
   - Execute relevant test suites or build commands to confirm that the resolution does not introduce regressions.
   - Re-run any CLI commands or generators if the conflict involved derived artifacts, ensuring outputs remain correct.
   - Double-check that no golden fixtures were modified unintentionally.
   - Run `git diff --stat origin/<base>...HEAD` again; the stat output should list only the files you deliberately touched.

8. **Finalize the Commit History**
   - For merges, complete the merge commit with a clear message describing the conflict resolution.
   - For rebases or cherry-picks, continue the process (`git rebase --continue`, `git cherry-pick --continue`) after staging changes.
   - If conflicts required significant rework, consider amending the commit or splitting changes for clarity.
   - Ensure the branch is up to date: `git fetch origin` followed by `git merge --ff-only origin/<base>` (or `git rebase origin/<base>`) should report "Already up to date."

9. **Document and Communicate**
   - Note any non-obvious decisions in commit messages or PR descriptions to aid reviewers.
   - If additional follow-up tasks are necessary, create TODOs or issues as appropriate.

Following this strategy promotes logical, thorough, and intelligent conflict resolution, reduces the likelihood of regressions, and keeps the repository history clean and understandable.
