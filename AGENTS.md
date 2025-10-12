# Agent Instructions
- The existing test input and output fixtures (src/plugin/tests) in this project are considered golden files and **MUST NEVER BE MODIFIED**. They capture the desired formatting for GML and must be preserved byte-for-byte. NEVER update or change these files, certainly not to "fix" a test failure.
- You may add new tests or adjust the way tests are executed, but do not change or replace the current input/output text fixtures.

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

4. **Implement the Resolution**
   - **Normalize formatter-only differences before merging.** When conflicts are purely formatting-related (common when pre-commit hooks enforce different rules), make formatter normalization your first step:
     1. Identify the authoritative formatter and linter configuration on the target branch by checking it out and syncing it locally:
        ```bash
        git fetch origin
        git checkout <target-branch>
        git pull --ff-only origin <target-branch>
        ```
        Review the relevant configuration files (e.g., `.prettierrc`, `eslint.config.js`, `.eslintrc.*`, `.editorconfig`, or hook revisions) to confirm which settings must be applied everywhere.
     2. For each branch that needs to merge, create an isolated worktree that reuses the authoritative configuration:
        ```bash
        git worktree add ../<branch>-fmt <branch>
        cd ../<branch>-fmt
        git checkout <branch>
        git checkout <target-branch> -- <formatter-config-files>
        npm install
        npm run format
        npm run lint -- --fix
        git status
        ```
        Replace `<formatter-config-files>` with the specific configuration paths identified in step 1. Running the formatter (`npm run format`) and fixer (`npm run lint -- --fix`) ensures consistent whitespace and style.
     3. Commit and push the normalization for each branch so the merge sees consistent formatting:
        ```bash
        git add -A
        git commit -m "Normalize formatting with <target-branch> configuration"
        git push origin <branch>
        cd <path-to-main-worktree>
        git worktree remove ../<branch>-fmt
        ```
        Repeat for every branch participating in the merge. If your repository uses different package managers or formatter commands, substitute the equivalent commands here.
     4. After both branches share the same formatting baseline, proceed with the merge. During the merge itself, re-run the formatter (`npm run format`) instead of hand-editing whitespace, and include any configuration updates in the resolution commit.
   - Edit each conflicting file carefully, removing conflict markers and integrating the intended logic or content.
   - Run formatters or linters if applicable to maintain code quality and consistency.
   - Stage resolved files incrementally (`git add <file>`), verifying each change with `git diff --staged`.

5. **Validate Thoroughly**
   - Execute relevant test suites or build commands to confirm that the resolution does not introduce regressions.
   - Re-run any scripts or generators if the conflict involved derived artifacts, ensuring outputs remain correct.
   - Double-check that no golden fixtures were modified unintentionally.
   - For formatting-only reconciliations, compare the formatter output on both branches (e.g., by checking out the other branch in a temporary worktree) to confirm that running the agreed-upon formatter yields consistent results, and document any lingering discrepancies for follow-up.

6. **Finalize the Commit History**
   - For merges, complete the merge with a clear commit message summarizing the resolution.
   - For rebases or cherry-picks, continue the process (`git rebase --continue`, `git cherry-pick --continue`) after staging changes.
   - If conflicts required significant rework, consider amending the commit or splitting changes for clarity.

7. **Document and Communicate**
   - Note any non-obvious decisions in commit messages or PR descriptions to aid reviewers.
   - If additional follow-up tasks are necessary, create TODOs or issues as appropriate.

Following this strategy promotes logical, thorough, and intelligent conflict resolution, reduces the likelihood of regressions, and keeps the repository history clean and understandable.
