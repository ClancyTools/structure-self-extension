export const DDL =
  "CREATE TABLE `things` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  PRIMARY KEY (`id`)\n);\n\n"

export function versions(count: number, start = 20260101000000): number[] {
  return Array.from({ length: count }, (_, index) => start + index * 1000)
}

export function fresh(count: number): number[] {
  return versions(count, 20270101000000)
}

export function structure(blocks: number[][], prefix = DDL): string {
  const inserts = blocks.map(block => {
    const rows = block.map(
      (version, index) => `${index === 0 ? "(" : ",("}'${version}')\n`
    )
    return "INSERT INTO `schema_migrations` VALUES\n" + rows.join("") + ";\n"
  })
  return prefix + inserts.join("")
}

export function chunk(all: number[], size = 50): number[][] {
  const blocks: number[][] = []
  for (let start = 0; start < all.length; start += size) {
    blocks.push(all.slice(start, start + size))
  }
  return blocks
}

export function lineOf(text: string, fragment: string): number {
  return text.split("\n").findIndex(line => line.includes(fragment))
}

export function headerLines(text: string): number[] {
  return text
    .split("\n")
    .map((line, index) => (line.startsWith("INSERT INTO") ? index : -1))
    .filter(index => index >= 0)
}
