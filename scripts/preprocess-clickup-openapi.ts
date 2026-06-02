import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

const INPUTS: Array<[string, string]> = [
  ["openapi/clickup-v2.json", "openapi/.generated/clickup-v2.json"],
  ["openapi/clickup-v3.json", "openapi/.generated/clickup-v3.json"],
]

// Fix operationIds that arrive as a single lowercase "word" in the source
// spec — hey-api can't split them into readable camelCase on its own, so
// the SDK would emit names like `gettimeentrieswithinadaterange`.
const OPERATION_ID_RENAMES: Record<string, string> = {
  Gettrackedtime: "GetTrackedTime",
  Edittimetracked: "EditTimeTracked",
  Deletetimetracked: "DeleteTimeTracked",
  Gettimeentrieswithinadaterange: "GetTimeEntriesWithinDateRange",
  Createatimeentry: "CreateTimeEntry",
  Getsingulartimeentry: "GetSingularTimeEntry",
  Gettimeentryhistory: "GetTimeEntryHistory",
  Getrunningtimeentry: "GetRunningTimeEntry",
  Removetagsfromtimeentries: "RemoveTagsFromTimeEntries",
  Getalltagsfromtimeentries: "GetAllTagsFromTimeEntries",
  Addtagsfromtimeentries: "AddTagsToTimeEntries",
  Changetagnamesfromtimeentries: "ChangeTagNamesFromTimeEntries",
}

type Obj = Record<string, unknown>

// Keys inside examples/example don't represent JSON Schema and shouldn't be hoisted.
// `parameters`, `headers`, and other non-schema containers are walked but their leaves aren't hoisted.
function isSchemaObject(node: unknown): node is Obj {
  if (!node || typeof node !== "object" || Array.isArray(node)) return false
  const o = node as Obj
  return (
    o.type === "object" && !!o.properties && typeof o.properties === "object"
  )
}

function toPascalSafe(segments: string[]): string {
  const base = segments
    .map((s) =>
      s
        .replace(/[{}]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, " ")
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(""),
    )
    .filter(Boolean)
    .join("")
  return base || "Schema"
}

function uniqueName(base: string, seen: Set<string>): string {
  if (!seen.has(base)) return base
  let i = 2
  while (seen.has(`${base}${i}`)) i++
  return `${base}${i}`
}

function walk(
  node: unknown,
  pathSegs: string[],
  components: Obj,
  seen: Set<string>,
  insideExample: boolean,
): unknown {
  if (Array.isArray(node)) {
    return node.map((v, i) =>
      walk(v, [...pathSegs, String(i)], components, seen, insideExample),
    )
  }
  if (!node || typeof node !== "object") return node
  const obj = node as Obj

  const out: Obj = {}
  for (const [k, v] of Object.entries(obj)) {
    // Strip titles on inline schemas — they collide in hey-api planner.
    // Keep components/schemas-level titles by NOT stripping at that depth
    // (pathSegs will start with "paths", "components", etc.).
    if (k === "title" && pathSegs[0] === "paths") continue
    // Drop null items from enum arrays — source has `enum: [1, 2, null]`.
    if (k === "enum" && Array.isArray(v)) {
      out[k] = (v as unknown[]).filter((x) => x !== null)
      continue
    }
    const nextInsideExample =
      insideExample || k === "example" || k === "examples"
    if (
      k === "operationId" &&
      typeof v === "string" &&
      OPERATION_ID_RENAMES[v]
    ) {
      out[k] = OPERATION_ID_RENAMES[v]
      continue
    }
    out[k] = walk(v, [...pathSegs, k], components, seen, nextInsideExample)
  }

  // Only hoist real schema objects, and not ones inside example/examples.
  if (
    !insideExample &&
    isSchemaObject(out) &&
    pathSegs[0] === "paths" &&
    pathSegs.length > 2
  ) {
    const base = toPascalSafe(pathSegs)
    const name = uniqueName(base, seen)
    seen.add(name)
    components[name] = out
    return { $ref: `#/components/schemas/${name}` }
  }

  return out
}

for (const [src, dst] of INPUTS) {
  const raw = JSON.parse(readFileSync(src, "utf8")) as Obj
  const componentsRoot = (raw.components as Obj | undefined) ?? {}
  const schemas = ((componentsRoot.schemas as Obj | undefined) ?? {}) as Obj
  const seen = new Set<string>(Object.keys(schemas))

  const newPaths = walk(raw.paths, ["paths"], schemas, seen, false)

  const out: Obj = {
    ...raw,
    paths: newPaths,
    components: { ...componentsRoot, schemas },
  }
  mkdirSync(dirname(dst), { recursive: true })
  writeFileSync(dst, JSON.stringify(out, null, 2))
  console.log(`wrote ${dst} (hoisted ${Object.keys(schemas).length} schemas)`)
}
