import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import * as vscode from "vscode"
import { analyze } from "../src/analyzer"
import {
  FIX_TITLE,
  SOURCE,
  StructureSelfCodeActionProvider,
  toDiagnostics,
} from "../src/diagnostics"
import {
  isStructureSelf,
  migrationVersions,
  structureFileFor,
} from "../src/migrations"
import { chunk, fresh, structure, versions } from "./helpers"

describe("toDiagnostics", () => {
  it("turns each finding into an error on its whole line", () => {
    const all = [...versions(50), ...fresh(1)]
    const [row] = toDiagnostics(analyze(structure([all]), all))

    expect(row.severity).toBe(vscode.DiagnosticSeverity.Error)
    expect(row.source).toBe(SOURCE)
    expect(row.range).toEqual(new vscode.Range(56, 0, 56, 19))
  })
})

describe("StructureSelfCodeActionProvider", () => {
  let root: string
  let structurePath: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "structure-self-"))
    structurePath = path.join(root, "db", "structure-self.sql")
    fs.mkdirSync(path.join(root, "db", "migrate"), { recursive: true })
  })

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

  const addMigrations = (all: number[]) =>
    all.forEach(version =>
      fs.writeFileSync(
        path.join(root, "db", "migrate", `${version}_change.rb`),
        ""
      )
    )

  const provide = (text: string, source = SOURCE) => {
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 1),
      "x",
      vscode.DiagnosticSeverity.Warning
    )
    diagnostic.source = source
    return new StructureSelfCodeActionProvider().provideCodeActions(
      document(text, structurePath),
      new vscode.Range(0, 0, 0, 0),
      { diagnostics: [diagnostic] } as unknown as vscode.CodeActionContext
    )
  }

  it("offers one preferred fix that rewrites only what changes", () => {
    const all = [...versions(120), ...fresh(40)]
    addMigrations(all)
    const blocks = chunk(versions(120))
    blocks[2] = [...blocks[2], ...fresh(40)]
    const text = structure(blocks)

    const [action] = provide(text)
    const [replacement] = (
      action.edit as unknown as vscode.WorkspaceEdit & {
        replacements: Replacement[]
      }
    ).replacements

    expect(action.title).toBe(FIX_TITLE)
    expect(action.isPreferred).toBe(true)
    expect(replacement.range.start.line).toBeGreaterThan(0)
    expect(apply(text, replacement)).toBe(structure(chunk(all)))
  })

  it("offers nothing for other extensions' diagnostics", () => {
    const all = [...versions(50), ...fresh(1)]
    addMigrations(all)

    expect(provide(structure([all]), "someone-else")).toEqual([])
  })

  it("offers nothing once the file is already right", () => {
    const all = versions(60)
    addMigrations(all)

    expect(provide(structure(chunk(all)))).toEqual([])
  })
})

describe("migrations", () => {
  it("reads versions from migrate and migrate.archive like Edgestitch's glob", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "structure-self-"))
    fs.mkdirSync(path.join(root, "db", "migrate"), { recursive: true })
    fs.mkdirSync(path.join(root, "db", "migrate.archive"))
    fs.writeFileSync(
      path.join(root, "db", "migrate", "20260101000000_a.rb"),
      ""
    )
    fs.writeFileSync(path.join(root, "db", "migrate.archive", "13_b.rb"), "")
    fs.writeFileSync(path.join(root, "db", "migrate", "notes.txt"), "")

    expect(
      migrationVersions(path.join(root, "db", "structure-self.sql")).sort()
    ).toEqual([13, 20260101000000])
    fs.rmSync(root, { recursive: true, force: true })
  })

  it("recognizes structure files outside vendored and generated directories", () => {
    expect(isStructureSelf("/repo/db/structure-self.sql")).toBe(true)
    expect(
      isStructureSelf("/repo/components/alpha/db/structure-self.sql")
    ).toBe(true)
    expect(
      isStructureSelf("/repo/vendor/bundle/gems/x/db/structure-self.sql")
    ).toBe(false)
    expect(isStructureSelf("/repo/db/structure.sql")).toBe(false)
  })

  it("maps a migration file to its structure file", () => {
    expect(
      structureFileFor("/repo/components/alpha/db/migrate.archive/1_a.rb")
    ).toBe("/repo/components/alpha/db/structure-self.sql")
  })
})

interface Replacement {
  range: vscode.Range
  text: string
}

function document(text: string, fsPath: string): vscode.TextDocument {
  return {
    uri: { fsPath },
    getText: () => text,
    positionAt: (offset: number) => {
      const before = text.slice(0, offset).split("\n")
      return new vscode.Position(
        before.length - 1,
        before[before.length - 1].length
      )
    },
  } as unknown as vscode.TextDocument
}

function apply(
  text: string,
  { range, text: replacement }: Replacement
): string {
  const offset = (position: vscode.Position) =>
    text
      .split("\n")
      .slice(0, position.line)
      .reduce((sum, line) => sum + line.length + 1, 0) + position.character
  return (
    text.slice(0, offset(range.start)) +
    replacement +
    text.slice(offset(range.end))
  )
}
