import { analyze, parseBlocks } from "../src/analyzer"
import {
  chunk,
  fresh,
  headerLines,
  lineOf,
  structure,
  versions,
} from "./helpers"

describe("analyze", () => {
  it("finds nothing when the blocks match what db:migrate would write", () => {
    const all = versions(120)
    const result = analyze(structure(chunk(all)), all)

    expect(result.findings).toEqual([])
    expect(result.fixedText).toBeNull()
  })

  it.each([
    [1, false],
    [30, false],
    [31, true],
    [80, true],
  ])("with %i rows added to a last block of 20, warns: %s", (added, warns) => {
    const all = [...versions(120), ...fresh(added)]
    const blocks = chunk(versions(120))
    blocks[blocks.length - 1] = [...blocks[blocks.length - 1], ...fresh(added)]

    expect(analyze(structure(blocks), all).findings.length > 0).toBe(warns)
  })

  it("flags exactly the rows past the 50th", () => {
    const all = [...versions(50), ...fresh(2)]
    const text = structure([all])
    const { findings } = analyze(text, all)

    expect(findings).toEqual([
      expect.objectContaining({
        line: lineOf(text, `('${fresh(2)[0]}')`),
        message: `\`${fresh(2)[0]}\` is row 51 of the INSERT block starting on line 6 (max 50)`,
      }),
      expect.objectContaining({
        line: lineOf(text, `('${fresh(2)[1]}')`),
        message: `\`${fresh(2)[1]}\` is row 52 of the INSERT block starting on line 6 (max 50)`,
      }),
    ])
  })

  it("flags each overflowing row of an oversized block", () => {
    const added = fresh(40)
    const blocks = chunk(versions(120))
    blocks[2] = [...blocks[2], ...added]
    const text = structure(blocks)
    const { findings } = analyze(text, [...versions(120), ...added])

    expect(findings.map(finding => finding.line)).toEqual(
      added.slice(30).map(version => lineOf(text, `('${version}')`))
    )
    expect(findings[0].message).toBe(
      `\`${added[30]}\` is row 51 of the INSERT block starting on line ${headerLines(text)[2] + 1} (max 50)`
    )
  })

  it("points a row that belongs in an existing block at that block's first line", () => {
    const old = 20250101000000
    const text = structure([
      [...versions(50), old],
      ...chunk(versions(120)).slice(1),
    ])
    const { findings } = analyze(text, [old, ...versions(120)])

    expect(findings.map(finding => finding.message)).toContain(
      `\`${versions(120)[49]}\` should be in the INSERT block starting on line ${headerLines(text)[1] + 1}`
    )
  })

  it("leaves a 49-row block alone when an archived migration has no row", () => {
    const archived = 20190101000000
    const rows = versions(99)
    const result = analyze(structure([rows.slice(0, 49), rows.slice(49)]), [
      archived,
      ...rows,
    ])

    expect(result.findings).toEqual([])
  })

  it("expects rows inside a block in string order, like MySQL returns them", () => {
    const all = [2, 13, ...versions(10)]
    const stringOrder = [...all].sort((a, b) =>
      String(a) < String(b) ? -1 : 1
    )

    expect(analyze(structure([stringOrder]), all).findings).toEqual([])
    expect(analyze(structure([all]), all).findings).toEqual([
      expect.objectContaining({
        message:
          "INSERT blocks don't match what `bin/rails db:migrate` would generate",
      }),
    ])
  })

  it("reports a row whose migration file is gone", () => {
    const all = versions(10)
    const { findings } = analyze(structure([[...all, 20270101000000]]), all)

    expect(findings.map(finding => finding.message)).toEqual([
      "`20270101000000` has no migration file",
    ])
  })

  it("tolerates a migration file without a row, like the CI check", () => {
    const all = versions(10)

    expect(analyze(structure([all]), [...all, ...fresh(1)]).findings).toEqual(
      []
    )
  })

  it("skips files that still have merge conflict markers", () => {
    const all = versions(10)
    const text = structure([all]).replace(
      ";\n",
      "<<<<<<< HEAD\n,('1')\n=======\n,('2')\n>>>>>>> master\n;\n"
    )

    expect(analyze(text, all)).toEqual({
      conflicted: true,
      findings: [],
      fixedText: null,
    })
  })

  it("accepts a file with no migrations and no INSERT blocks", () => {
    expect(
      analyze("CREATE TABLE `x` (\n  `id` bigint\n);\n", []).findings
    ).toEqual([])
  })

  it("covers the whole flagged line", () => {
    const all = [...versions(50), ...fresh(1)]
    const [row] = analyze(structure([all]), all).findings

    expect(row.endCharacter).toBe(`,('${fresh(1)[0]}')`.length)
  })

  it("produces a fix that rebuilds the blocks and is itself clean", () => {
    const all = [...versions(120), ...fresh(40)]
    const blocks = chunk(versions(120))
    blocks[2] = [...blocks[2], ...fresh(40)]
    const { fixedText } = analyze(structure(blocks), all)

    expect(fixedText).toBe(structure(chunk(all)))
    expect(analyze(fixedText as string, all).findings).toEqual([])
  })

  it("keeps everything before the first INSERT block in the fix", () => {
    const all = [...versions(50), ...fresh(1)]
    const { fixedText } = analyze(
      structure([all], "CREATE TABLE `custom` (`id` int);\n\n"),
      all
    )

    expect(
      fixedText?.startsWith("CREATE TABLE `custom` (`id` int);\n\nINSERT INTO")
    ).toBe(true)
  })
})

describe("parseBlocks", () => {
  it("records each block's line and each row's line", () => {
    const blocks = parseBlocks(structure([[1, 2], [3]]))

    expect(blocks).toEqual([
      {
        line: 5,
        rows: [
          { version: 1, line: 6 },
          { version: 2, line: 7 },
        ],
      },
      { line: 9, rows: [{ version: 3, line: 10 }] },
    ])
  })
})
