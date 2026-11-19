import * as fs from "fs"
import * as path from "path"
import { versionOf } from "./analyzer"

const STRUCTURE_FILE = /[\\/]db[\\/]structure-self\.sql$/
const IGNORED_DIRECTORY = /[\\/](node_modules|vendor|tmp)[\\/]/

export const MIGRATION_DIRECTORIES = ["migrate", "migrate.archive"]

export function isStructureSelf(fsPath: string): boolean {
  return STRUCTURE_FILE.test(fsPath) && !IGNORED_DIRECTORY.test(fsPath)
}

export function structureFileFor(migrationPath: string): string {
  return path.join(
    path.dirname(path.dirname(migrationPath)),
    "structure-self.sql"
  )
}

export function migrationVersions(structurePath: string): number[] {
  const dbDirectory = path.dirname(structurePath)
  return MIGRATION_DIRECTORIES.flatMap(directory => {
    try {
      return fs
        .readdirSync(path.join(dbDirectory, directory))
        .filter(name => name.endsWith(".rb") && !name.startsWith("."))
        .map(versionOf)
    } catch {
      return []
    }
  })
}
