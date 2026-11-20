# Changelog

All notable changes to this extension are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.0.2] - 2026-11-19

### Added

- Each row shows its position within its INSERT block (`#1` to `#50`) after the line.

## [0.0.1] - 2026-11-18

### Added

- Checks every `db/structure-self.sql` in the workspace (umbrella and components) against the INSERT blocks
  `bin/rails db:migrate` (Edgestitch) would generate: blocks of at most 50, cut from the numerically sorted
  migration files in `db/migrate` and `db/migrate.archive`, with rows in string order.
- Errors on each row past the 50th in a block, on rows that belong in a different block (new or existing), and on
  rows with no migration file.
- Warnings on duplicate rows and on rows out of order within a block.
- Quick fix, **Rebuild INSERT blocks the way bin/rails db:migrate would**, which rewrites only the
  `schema_migrations` section with one undoable edit.
- Re-checks on startup, while editing, when files change on disk, and when migrations are added or removed.
- `Structure Self Blocks: Recheck All Files` command.
- Extension icon.

### Notes

- Files with merge conflict markers are skipped until the conflict is resolved.
- A migration file without a row is not reported, matching the CI check.
