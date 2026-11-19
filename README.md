# Structure Self Blocks

Catches broken `schema_migrations` INSERT blocks in `db/structure-self.sql` files while you work, before the CI
"Git Diff" step does.

## The problem

`bin/rails db:migrate` (Edgestitch) writes the `schema_migrations` rows of each `db/structure-self.sql` in
blocks of at most 50:

1. It sorts the root's migration files (`db/migrate` and `db/migrate.archive`) numerically.
2. It cuts that list into chunks of 50.
3. Each chunk becomes one `INSERT INTO schema_migrations` block, holding the versions that have a row, in string
   order. A migration file without a row still takes up a slot, so a block can have 49 rows.

When two branches add migrations around a block boundary, git can merge the files cleanly and leave a block of
51 rows. The generated file no longer matches, and CI fails for everyone until someone fixes it. This extension
shows that problem in the editor, most usefully while you are resolving a merge conflict.

## Features

### Diagnostics

Every `db/structure-self.sql` in the workspace (the umbrella and each component) is checked, open or not:

- on startup
- as you edit an open file
- when the file changes on disk, for example after `git merge` or `git pull`
- when a migration is added to or removed from that root's `db/migrate` or `db/migrate.archive`

**Errors** (red squiggle) appear on each row past the 50th in a block, so a 52-row block flags rows 51 and 52:

| Message | Meaning |
| --- | --- |
| `` `2026…` is row 51 of the INSERT block starting on line 208 (max 50) `` | The block is over the limit; this row is one of the extras |
| `` `2026…` should be the first row of a new INSERT block `` | `db:migrate` would start a new block with this row |
| `` `2026…` and 3 more rows should be in a new INSERT block `` | Several rows belong in the same new block (shown on the first of them) |
| `` `2025…` should be in the INSERT block starting on line 158 `` | The row belongs in an existing, earlier block |
| `` `2027…` has no migration file `` | The row's migration is gone, so `db:migrate` would drop it |

**Warnings** (yellow squiggle):

| Message | Meaning |
| --- | --- |
| `` `2026…` is a duplicate of the row on line 85 `` | The version already appears earlier in the file |
| `` `2026…` is out of order (it should come before `2026…`) `` | Rows in a block are in string order, as MySQL returns them (`'2'` before `'13'`) |

If the blocks differ from what `db:migrate` would write for a reason none of these explain, a general
`INSERT blocks don't match what bin/rails db:migrate would generate` error marks the first differing line.

Not reported:

- A migration file that has no row yet. The CI check ignores it too, and `db:migrate` adds the row.
- Files that still have merge conflict markers. Both sides' rows are present until you resolve them, so the
  diagnostics appear once the markers are gone.

### Quick fix

On any of the diagnostics, press `Cmd+.` (or click the lightbulb) and choose **Rebuild INSERT blocks the way
bin/rails db:migrate would**.

- It rebuilds only the `schema_migrations` section, from the rows already in the file and the migration files on
  disk, using the rules above. Everything before the first INSERT block (the table definitions) is left alone.
- It makes one edit, from the first changed character to the end of the file. Undo reverts it in one step.
- It reorganizes existing rows and removes duplicates and rows with no migration file.
- It does **not** add rows for new migrations, run migrations, or change table definitions. Run
  `bin/rails db:migrate` for that.

### Commands

| Command | Description |
| --- | --- |
| `Structure Self Blocks: Recheck All Files` | Re-scan every `structure-self.sql` in the workspace |

## Requirements

VS Code 1.85 or later. There are no settings, and it needs no database, Ruby, or network access. It activates
when the workspace contains a `db/structure-self.sql`. Files under `node_modules`, `vendor`, and `tmp` are ignored.

## Limitations

- It checks the file as it is in your editor. It cannot know that `master` moved after your branch last passed CI
  and will change the blocks when merged. Merge the latest `master` into your branch and run
  `bin/rails db:migrate` to see that case.
- Edgestitch's block size is 50. If that changes, the extension must be updated to match.

## Development

```bash
npm install
npm test            # unit tests
npm run bundle      # build out/extension.js
npx @vscode/vsce package --allow-missing-repository --skip-license
```

Press `F5` in VS Code to try it in an Extension Development Host. Install a packaged build with
`code --install-extension structure-self-blocks-<version>.vsix --force`.

See [CHANGELOG.md](CHANGELOG.md) for what changed in each version.
