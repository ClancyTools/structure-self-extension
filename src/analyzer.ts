// Mirrors how Edgestitch writes the schema_migrations section of a structure-self.sql:
// the migration files (db/migrate and db/migrate.archive) are sorted numerically and cut
// into chunks of 50, and each chunk becomes one INSERT block holding whichever of those
// versions have a row, in string order. A file without a row still takes up a slot.

export const BLOCK_SIZE = 50
export const HEADER = "INSERT INTO `schema_migrations` VALUES"

const ROW = /^,?\('(\d+)'\)$/
const CONFLICT_MARKER = /^(<{7}|={7}|>{7})(\s|$)/m

export interface Row {
  version: number
  line: number
}

export interface Block {
  line: number
  rows: Row[]
}

export interface Finding {
  line: number
  endCharacter: number
  message: string
}

export interface Analysis {
  conflicted: boolean
  findings: Finding[]
  fixedText: string | null
}

export function versionOf(fileName: string): number {
  const digits = /^\d+/.exec(fileName)
  return digits ? Number(digits[0]) : 0
}

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = []
  splitLines(text).forEach((line, index) => {
    if (line === HEADER) {
      blocks.push({ line: index, rows: [] })
      return
    }
    const row = ROW.exec(line)
    if (row && blocks.length > 0) {
      blocks[blocks.length - 1].rows.push({
        version: Number(row[1]),
        line: index,
      })
    }
  })
  return blocks
}

export function expectedBlocks(
  fileVersions: number[],
  present: Set<number>
): number[][] {
  const sorted = [...fileVersions].sort((a, b) => a - b)
  const blocks: number[][] = []
  for (let start = 0; start < sorted.length; start += BLOCK_SIZE) {
    const chunk = [...new Set(sorted.slice(start, start + BLOCK_SIZE))]
    const rows = chunk.filter(version => present.has(version)).sort(byString)
    if (rows.length > 0) {
      blocks.push(rows)
    }
  }
  return blocks
}

export function render(blocks: number[][]): string {
  return blocks
    .map(block => {
      const rows = block.map(
        (version, index) => `${index === 0 ? "(" : ",("}'${version}')\n`
      )
      return `${HEADER}\n${rows.join("")};\n`
    })
    .join("")
}

export function canonicalText(text: string, expected: number[][]): string {
  const header = new RegExp(`^${escapeRegExp(HEADER)}$`, "m").exec(text)
  const prefix = header ? text.slice(0, header.index) : text
  return `${(prefix + render(expected)).trim()}\n`
}

export function analyze(text: string, fileVersions: number[]): Analysis {
  if (CONFLICT_MARKER.test(text)) {
    return { conflicted: true, findings: [], fixedText: null }
  }

  const blocks = parseBlocks(text)
  const present = new Set(
    blocks.flatMap(block => block.rows.map(row => row.version))
  )
  const expected = expectedBlocks(fileVersions, present)
  const fixed = canonicalText(text, expected)
  if (fixed === text) {
    return { conflicted: false, findings: [], fixedText: null }
  }

  const lines = splitLines(text)
  const at = (line: number, message: string): Finding => ({
    line,
    endCharacter: lines[line]?.length ?? 0,
    message,
  })
  const overflow = overflowRows(blocks)
  const flagged = new Set(overflow.map(entry => entry.row.line))
  const findings = [
    ...overflow.map(({ row, position, block }) =>
      at(
        row.line,
        `\`${row.version}\` is row ${position} of the INSERT block starting on line ${block.line + 1} (max ${BLOCK_SIZE})`
      )
    ),
    ...misplacedGroups(blocks, expected, flagged).map(group =>
      at(group.rows[0].line, moveMessage(group, blocks, expected))
    ),
  ]
  if (findings.length === 0) {
    findings.push(
      at(
        firstDifference(lines, splitLines(fixed)),
        "INSERT blocks don't match what `bin/rails db:migrate` would generate"
      )
    )
  }
  return { conflicted: false, findings, fixedText: fixed }
}

interface MisplacedGroup {
  target: number | undefined
  rows: Row[]
}

// Every row past the 50th in a block, so a 52-row block flags rows 51 and 52.
function overflowRows(
  blocks: Block[]
): { row: Row; position: number; block: Block }[] {
  return blocks.flatMap(block =>
    block.rows
      .slice(BLOCK_SIZE)
      .map((row, index) => ({ row, position: BLOCK_SIZE + index + 1, block }))
  )
}

function misplacedGroups(
  blocks: Block[],
  expected: number[][],
  skipLines: Set<number>
): MisplacedGroup[] {
  const expectedIndex = new Map<number, number>()
  expected.forEach((block, index) =>
    block.forEach(version => expectedIndex.set(version, index))
  )

  const groups = new Map<number | undefined, Row[]>()
  blocks.forEach((block, index) => {
    block.rows.forEach(row => {
      const target = expectedIndex.get(row.version)
      if (target === index || skipLines.has(row.line)) {
        return
      }
      groups.set(target, [...(groups.get(target) ?? []), row])
    })
  })
  return [...groups.entries()]
    .map(([target, rows]) => ({
      target,
      rows: rows.sort((a, b) => a.line - b.line),
    }))
    .sort((a, b) => (a.target ?? -1) - (b.target ?? -1))
}

function moveMessage(
  group: MisplacedGroup,
  blocks: Block[],
  expected: number[][]
): string {
  const [first] = group.rows
  const extra = group.rows.length - 1
  const subject =
    extra === 0
      ? `\`${first.version}\``
      : `\`${first.version}\` and ${extra} more row${extra === 1 ? "" : "s"}`
  if (group.target === undefined) {
    return `${subject} ${extra === 0 ? "has" : "have"} no migration file`
  }
  return `${subject} should ${destination(group.target, blocks, expected)}`
}

// A destination block "exists" when the expected block keeps some rows that are already in
// the right place; those rows show which current block it is.
function destination(
  target: number,
  blocks: Block[],
  expected: number[][]
): string {
  const settled = expected[target].filter(version =>
    blocks[target]?.rows.some(row => row.version === version)
  )
  const block = settled.length > 0 ? blocks[target] : undefined
  if (block) {
    return `be in the INSERT block starting on line ${block.line + 1}`
  }
  return expected[target].length === 1
    ? "be the first row of a new INSERT block"
    : "be in a new INSERT block"
}

function firstDifference(actual: string[], fixed: string[]): number {
  const index = actual.findIndex((line, i) => line !== fixed[i])
  return Math.max(
    0,
    Math.min(index === -1 ? actual.length - 1 : index, actual.length - 1)
  )
}

function splitLines(text: string): string[] {
  return text.split("\n").map(line => line.replace(/\r$/, ""))
}

function byString(a: number, b: number): number {
  const left = String(a)
  const right = String(b)
  return left < right ? -1 : left > right ? 1 : 0
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
