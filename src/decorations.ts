import * as vscode from "vscode"
import { rowPositions } from "./analyzer"
import { isStructureSelf } from "./migrations"

// Shows "#5" after the fifth row of every INSERT block, so you can see where a block ends
// without counting lines.
export function createRowNumberDecoration(): vscode.TextEditorDecorationType {
  return vscode.window.createTextEditorDecorationType({
    after: {
      margin: "0 0 0 2em",
      color: new vscode.ThemeColor("editorCodeLens.foreground"),
    },
  })
}

export function decorateRowNumbers(
  editor: vscode.TextEditor,
  decoration: vscode.TextEditorDecorationType
): void {
  const { document } = editor
  if (!isStructureSelf(document.uri.fsPath)) {
    return
  }
  editor.setDecorations(
    decoration,
    rowPositions(document.getText()).map(
      ({ line, endCharacter, position }) => ({
        range: new vscode.Range(line, endCharacter, line, endCharacter),
        renderOptions: { after: { contentText: `#${position}` } },
      })
    )
  )
}
