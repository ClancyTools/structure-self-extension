// VS Code API mock for testing
export class Position {
  constructor(
    public line: number,
    public character: number
  ) {}
}

export class Range {
  start: Position
  end: Position

  constructor(
    startOrLine: Position | number,
    startOrCharacter: Position | number,
    endLine?: number,
    endCharacter?: number
  ) {
    if (typeof startOrLine === "number") {
      this.start = new Position(startOrLine, startOrCharacter as number)
      this.end = new Position(endLine as number, endCharacter as number)
    } else {
      this.start = startOrLine
      this.end = startOrCharacter as Position
    }
  }
}

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}

export class Diagnostic {
  source?: string

  constructor(
    public range: Range,
    public message: string,
    public severity: DiagnosticSeverity
  ) {}
}

export const CodeActionKind = { QuickFix: "quickfix" }

export class CodeAction {
  edit?: WorkspaceEdit
  diagnostics?: Diagnostic[]
  isPreferred?: boolean

  constructor(
    public title: string,
    public kind: string
  ) {}
}

export class WorkspaceEdit {
  replacements: { uri: unknown; range: Range; text: string }[] = []

  replace(uri: unknown, range: Range, text: string): void {
    this.replacements.push({ uri, range, text })
  }
}
