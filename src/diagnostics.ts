import * as vscode from "vscode"
import { Analysis, analyze } from "./analyzer"
import { migrationVersions } from "./migrations"

export const SOURCE = "structure-self-blocks"
export const FIX_TITLE =
  "Rebuild INSERT blocks the way bin/rails db:migrate would"

export function toDiagnostics(analysis: Analysis): vscode.Diagnostic[] {
  return analysis.findings.map(finding => {
    const range = new vscode.Range(
      finding.line,
      0,
      finding.line,
      finding.endCharacter
    )
    const diagnostic = new vscode.Diagnostic(
      range,
      finding.message,
      vscode.DiagnosticSeverity.Warning
    )
    diagnostic.source = SOURCE
    return diagnostic
  })
}

export class StructureSelfCodeActionProvider
  implements vscode.CodeActionProvider
{
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix]

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const diagnostics = context.diagnostics.filter(
      diagnostic => diagnostic.source === SOURCE
    )
    if (diagnostics.length === 0) {
      return []
    }

    const text = document.getText()
    const { fixedText } = analyze(text, migrationVersions(document.uri.fsPath))
    if (fixedText === null) {
      return []
    }

    const start = firstDifferentCharacter(text, fixedText)
    const edit = new vscode.WorkspaceEdit()
    edit.replace(
      document.uri,
      new vscode.Range(
        document.positionAt(start),
        document.positionAt(text.length)
      ),
      fixedText.slice(start)
    )

    const action = new vscode.CodeAction(
      FIX_TITLE,
      vscode.CodeActionKind.QuickFix
    )
    action.edit = edit
    action.diagnostics = diagnostics
    action.isPreferred = true
    return [action]
  }
}

function firstDifferentCharacter(text: string, fixed: string): number {
  let index = 0
  while (
    index < text.length &&
    index < fixed.length &&
    text[index] === fixed[index]
  ) {
    index += 1
  }
  return index
}
