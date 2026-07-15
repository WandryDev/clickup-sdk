# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`@wandrydev/clickup` is a typed, framework-agnostic ClickUp API client. The HTTP
layer and types are **generated** from ClickUp's OpenAPI specs via
[`@hey-api/openapi-ts`](https://heyapi.dev); a thin hand-written layer
(`src/client.ts`, `src/helpers.ts`, `src/logger.ts`) wraps the generated SDK with
ergonomic methods, structured logging hooks, and workarounds for fields the spec
omits or mistypes. No runtime dependencies — runs anywhere `fetch` exists.

The package manager is **bun** (see `bun.lock`).

## Commands

```sh
bun install
bun run clickup:types   # regenerate src/generated/ from openapi/clickup-*.json
bun run build           # tsup → dist/ (esm + cjs + d.ts)
bun run dev             # tsup --watch
bun run typecheck       # tsc --noEmit
bun run test            # vitest run
bun run lint            # biome check
bun run format          # biome format --write
```

Run a single test: `bun run test src/client.test.ts` or filter by name with
`bun run test -t "getTask sends the auth token"`. Tests stub `fetch` via
`vi.stubGlobal` — there are no live network calls.

## Codegen pipeline (the important part)

`bun run clickup:types` is a two-step pipeline, not a single tool:

1. **`scripts/preprocess-clickup-openapi.ts`** reads the raw specs
   `openapi/clickup-{v2,v3}.json` and writes cleaned copies to
   `openapi/.generated/`. It fixes things hey-api can't handle on its own:
   - Renames lowercased `operationId`s (e.g. `Gettimeentrieswithinadaterange` →
     `GetTimeEntriesWithinDateRange`) via the `OPERATION_ID_RENAMES` map.
   - Hoists inline schema objects under `paths` into `components/schemas` with
     generated PascalCase names (this is why generated type names are long, e.g.
     `PathsV2TeamTeamIdTaskGetResponses200ContentApplicationJsonSchemaPropertiesTasksItems`).
   - Strips colliding `title`s and drops `null` enum members.
2. **`openapi-ts`** (`openapi-ts.config.ts`) reads `openapi/.generated/` and emits
   `src/generated/{v2,v3}`. Both specs are generated in full — the SDK surface is
   wide, but only the operations wrapped in `src/helpers.ts` are public API.
   Note: `input.include` is **not** a supported option in `@hey-api/openapi-ts`
   0.96.x. It is accepted and silently ignored (the input type takes unknown
   keys, so `tsc` won't flag it), so don't add a regex there expecting it to
   scope generation.

**`output.clean: false`** is intentional: it lets hand-written files live inside
the generated tree and survive regeneration. The key one is
`src/generated/v2/custom_types.ts` — do NOT delete it. `.gen.ts` files ARE
overwritten on every codegen run, so never edit them by hand.

## Architecture

- **`src/client.ts`** — `createClickUp({ token, logger?, baseUrl? })` is the only
  public constructor. It builds the per-instance fetch `Client` (auth header +
  a response interceptor that logs `version/method/path/status`), then hands a
  `ClickUpContext` to `createHelpers`. The returned object is `ClickUpClient`.
- **`src/helpers.ts`** — all public methods (`getTask`, `getTeamTasks`,
  `findTaskInTeam`, `getTimeEntries`, `getTaskTimeEntriesPerAssignee`, `getList`,
  `createTask`, `createTaskAttachment`,
  `postComment`, `postCommentWithMention`). Each closes over the `client` + `logger`
  from `ClickUpContext`. This is where the spec workarounds live and where new
  ergonomic methods should be added.
- **`src/logger.ts`** — `ClickUpLogger` interface (`info`/`warn`) injected by the
  host; defaults to `noopLogger`. Methods log structured `Record<string, unknown>`
  events, not strings.
- **`src/index.ts`** — the public surface. Anything exported here is part of the
  package API; re-export new public types from `custom_types.ts` here.
- **`src/generated/v2` & `v3`** — generated SDK + fetch client. Only v2 is wired
  into the helpers today; v3 is generated but unused.

### Conventions and gotchas

- Helper methods translate ergonomic params into the SDK's array-bracket query
  shape (e.g. `list_ids` → `query["list_ids[]"]`). Match this pattern when adding
  filters.
- Spec mismatches are handled by widening types at the call site (`as unknown as
  ...`), with a comment explaining why — see `postCommentWithMention` (rich
  `comment` array vs documented `comment_text`) and `getTimeEntries` (comma-joined
  `assignee` string vs typed `number`). Prefer this over editing generated files.
- `getTask`/`getTeamTasks`/`getTimeEntries`/`postComment*` use
  `throwOnError: true` and re-wrap failures as `Error`. `getList` is deliberately
  **non-throwing** (best-effort metadata). Keep that distinction.
- `createTask`/`createTaskAttachment` also throw, but deliberately do **not** use
  `throwOnError`: it throws the parsed response body alone, so the HTTP status is
  lost and an empty error body arrives as `{}` — a 502 outage then looks the same
  as a rejected request. They take the `{ data, error, response }` form and build
  the message via `describeFailure`, which keeps the status. Prefer this for new
  write methods.
- `createTaskAttachment` is the only `multipart/form-data` method. It builds its
  own `FormData` and passes it through with `bodySerializer: (body) => body`,
  because the generated `formDataBodySerializer` appends without a filename —
  every upload would land in ClickUp named `blob`.
- `getTaskTimeEntriesPerAssignee` fans out one request per assignee and swallows
  per-user `TIMEENTRY_059` (access-denied) as empty, because a comma-joined
  `assignee` 403s the whole request if any single user is out of scope.
- `ClickUpTask` (in `custom_types.ts`) extends the generated type with an
  undocumented `time_estimates_by_user` field — add similar undocumented fields
  there, not inline.

### Formatting

Biome formats with 2-space indent and **no semicolons** (`asNeeded`).
`src/generated`, `dist`, `openapi`, and `node_modules` are excluded from
lint/format.
