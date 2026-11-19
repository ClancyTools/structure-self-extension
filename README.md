# Structure Self Blocks

Warns when a `db/structure-self.sql` would not match what `bin/rails db:migrate` (Edgestitch) generates for its
`schema_migrations` rows, and offers a quick fix that rebuilds them.

Edgestitch sorts a root's migration files (`db/migrate` and `db/migrate.archive`) numerically, cuts that list
into chunks of 50, and writes each chunk as one `INSERT INTO schema_migrations` block containing the versions that
have a row, in string order. A migration file without a row still takes up a slot. When two branches add
migrations around a block boundary, git can merge them cleanly into a block of 51 rows, and the CI "Git Diff" step
then fails for everyone. This extension catches that in the editor.

## What it checks

Every `db/structure-self.sql` in the workspace (the umbrella and each component), whether or not it is open:

- on startup
- as you edit an open file
- when the file changes on disk, for example after `git merge` or `git pull`
- when a migration is added to or removed from that root's `db/migrate` or `db/migrate.archive`

Warnings appear on the line they are about and in the Problems panel:

- `INSERT block starting on line 208 has 51 rows (max 50)` on the block's first line
- `` `20261029180000` should be the first row of a new INSERT block `` on the row itself
- `` `20261029170036` and 3 more rows should be in a new INSERT block ``
- `` `20250101000000` should be in the INSERT block starting on line 158 ``
- `` `20270101000000` has no migration file ``
- `INSERT blocks don't match what bin/rails db:migrate would generate` when the rows are in the right blocks but
  out of order or formatted differently

A migration file without a row is not reported, matching the CI check; the build catches that case.

Files with merge conflict markers are skipped until the conflict is resolved, because both sides' rows are
present. The warnings appear as soon as the markers are gone.

## Quick fix

**Rebuild INSERT blocks the way bin/rails db:migrate would** rewrites the `schema_migrations` section from the
rows already in the file and the migration files on disk, using the rules above. Everything before the first
INSERT block (the table definitions) is left as is. It only reorganizes rows that are there; it does not add rows
for new migrations or run anything.

## Commands

- `Structure Self Blocks: Recheck All Files`

## Development

```bash
npm install
npm test            # unit tests
npm run bundle      # build out/extension.js
npx @vscode/vsce package --allow-missing-repository --skip-license
```
