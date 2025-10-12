# Asset Rename Precautions

Automated asset renames mutate both metadata (`.yy`) and source files on disk. To
minimise data loss risks, follow these safeguards before running the rename
pipeline:

1. **Create a reversible checkpoint.** Capture a clean version-control commit or
   take an external backup of the GameMaker project tree before executing the
   formatter. A snapshot lets you undo every rename if an unexpected mutation
   slips through.
2. **Validate filesystem permissions.** Ensure the formatter process can write
   to the `.yy`/`.gml` files being renamed and to their parent directories. The
   rename utilities perform explicit access checks and will abort when write
   access is missing, preventing partial moves.
3. **Monitor rename summaries.** Review the generated rename log so that any
   individual file move can be reverted quickly if required. Keep the summary
   alongside your backup until the project has been verified in the GameMaker
   IDE.

If a rename run fails midway, restore from the backup or revert the checkpoint
before retrying. This mirrors the operational guidance captured in the
identifier-case risk plan and ensures a straightforward rollback path when the
rename batch touches large dependency graphs across rooms, objects, and scripts.

