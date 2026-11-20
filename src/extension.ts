import * as vscode from "vscode"
import { analyze } from "./analyzer"
import {
  SOURCE,
  StructureSelfCodeActionProvider,
  toDiagnostics,
} from "./diagnostics"
import { createRowNumberDecoration, decorateRowNumbers } from "./decorations"
import {
  isStructureSelf,
  migrationVersions,
  structureFileFor,
} from "./migrations"

const STRUCTURE_GLOB = "**/db/structure-self.sql"
const MIGRATION_GLOB = "**/db/{migrate,migrate.archive}/*.rb"
const EXCLUDE_GLOB = "**/{node_modules,vendor,tmp}/**"
const DEBOUNCE_MS = 300

export function activate(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection(SOURCE)
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const rowNumbers = createRowNumberDecoration()
  const decorateOpenEditors = (document?: vscode.TextDocument) =>
    vscode.window.visibleTextEditors
      .filter(editor => !document || editor.document === document)
      .forEach(editor => decorateRowNumbers(editor, rowNumbers))

  const checkText = (uri: vscode.Uri, text: string) => {
    collection.set(
      uri,
      toDiagnostics(analyze(text, migrationVersions(uri.fsPath)))
    )
  }

  // Unopened files are read from disk, so a `git merge` that rewrites a structure file shows
  // up in the Problems panel without anyone opening it.
  const checkUri = async (uri: vscode.Uri) => {
    if (!isStructureSelf(uri.fsPath)) {
      return
    }
    const open = vscode.workspace.textDocuments.find(
      document => document.uri.toString() === uri.toString()
    )
    if (open) {
      checkText(uri, open.getText())
      return
    }
    try {
      checkText(
        uri,
        Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8")
      )
    } catch {
      collection.delete(uri)
    }
  }

  const checkAll = async () => {
    collection.clear()
    const uris = await vscode.workspace.findFiles(STRUCTURE_GLOB, EXCLUDE_GLOB)
    await Promise.all(uris.map(checkUri))
  }

  const structureWatcher =
    vscode.workspace.createFileSystemWatcher(STRUCTURE_GLOB)
  structureWatcher.onDidCreate(checkUri)
  structureWatcher.onDidChange(checkUri)
  structureWatcher.onDidDelete(uri => collection.delete(uri))

  const migrationWatcher = vscode.workspace.createFileSystemWatcher(
    MIGRATION_GLOB,
    false,
    true,
    false
  )
  const checkStructureFor = (uri: vscode.Uri) =>
    checkUri(vscode.Uri.file(structureFileFor(uri.fsPath)))
  migrationWatcher.onDidCreate(checkStructureFor)
  migrationWatcher.onDidDelete(checkStructureFor)

  context.subscriptions.push(
    collection,
    structureWatcher,
    migrationWatcher,
    vscode.workspace.onDidChangeTextDocument(event => {
      const { document } = event
      if (!isStructureSelf(document.uri.fsPath)) {
        return
      }
      const key = document.uri.toString()
      clearTimeout(timers.get(key))
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key)
          checkText(document.uri, document.getText())
          decorateOpenEditors(document)
        }, DEBOUNCE_MS)
      )
    }),
    rowNumbers,
    vscode.window.onDidChangeVisibleTextEditors(() => decorateOpenEditors()),
    vscode.workspace.onDidCloseTextDocument(document => checkUri(document.uri)),
    vscode.languages.registerCodeActionsProvider(
      { pattern: STRUCTURE_GLOB },
      new StructureSelfCodeActionProvider(),
      {
        providedCodeActionKinds:
          StructureSelfCodeActionProvider.providedCodeActionKinds,
      }
    ),
    vscode.commands.registerCommand("structureSelfBlocks.recheckAll", checkAll),
    { dispose: () => timers.forEach(timer => clearTimeout(timer)) }
  )

  decorateOpenEditors()
  void checkAll()
}

export function deactivate(): void {}
