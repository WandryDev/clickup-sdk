import { createServer, type IncomingMessage, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import type {
  ClickUpFolder,
  ClickUpList,
  ClickUpSpace,
  ClickUpTask,
  ClickUpTimeEntry,
} from "../generated/v2/custom_types"

export interface ClickUpFakeFixtures {
  /** When set, team-scoped routes 401 for any other team id. */
  teamId?: string
  spaces?: ClickUpSpace[]
  folders?: ClickUpFolder[]
  lists?: ClickUpList[]
  tasks?: ClickUpTask[]
  timeEntries?: ClickUpTimeEntry[]
}

export type ClickUpFakeHelper =
  | "getTask"
  | "getTeamTasks"
  | "getTimeEntries"
  | "getList"
  | "getSpace"
  | "getFolders"
  | "getFolderlessLists"
  | "getListTasks"
  | "setTaskType"

export interface RecordedCall {
  /** Name of the SDK helper the request belongs to, or `"unknown"`. */
  method: ClickUpFakeHelper | "unknown"
  path: string
  /** Repeated keys (`list_ids[]`) become arrays. */
  query: Record<string, string | string[]>
  body: unknown
}

export interface FailOnceOptions {
  status: number
  /** Only fail the request that targets this task id. */
  taskId?: string
  /** JSON body to send. Defaults to a ClickUp-style `{ err, ECODE }`. */
  body?: unknown
}

export interface ClickUpFake {
  /** Directly usable as `createClickUp({ baseUrl })`. */
  url: string
  calls(method?: ClickUpFakeHelper | "unknown"): RecordedCall[]
  failOnce(helper: ClickUpFakeHelper, options: FailOnceOptions): void
  reset(fixtures?: ClickUpFakeFixtures): Promise<void>
  close(): Promise<void>
}

const PAGE_SIZE = 100

interface Reply {
  status: number
  body: unknown
}

const notFound = (err: string, ECODE: string): Reply => ({
  status: 404,
  body: { err, ECODE },
})

interface Route {
  method: string
  pattern: RegExp
  helper: ClickUpFakeHelper
  handle(ctx: Ctx): Reply
}

interface Ctx {
  state: State
  params: string[]
  query: URLSearchParams
  body: unknown
}

interface State {
  teamId?: string
  spaces: ClickUpSpace[]
  folders: ClickUpFolder[]
  lists: ClickUpList[]
  tasks: ClickUpTask[]
  timeEntries: ClickUpTimeEntry[]
}

function toState(fixtures: ClickUpFakeFixtures): State {
  // Cloned so setTaskType never mutates the caller's fixture objects.
  return structuredClone({
    teamId: fixtures.teamId,
    spaces: fixtures.spaces ?? [],
    folders: fixtures.folders ?? [],
    lists: fixtures.lists ?? [],
    tasks: fixtures.tasks ?? [],
    timeEntries: fixtures.timeEntries ?? [],
  })
}

// Accepts `key`, `key[]`, repeated keys and comma-joined values.
function multi(query: URLSearchParams, key: string): string[] | undefined {
  const values = [...query.getAll(key), ...query.getAll(`${key}[]`)].flatMap(
    (v) => v.split(","),
  )
  return values.length > 0 ? values : undefined
}

const bool = (query: URLSearchParams, key: string) => {
  const v = query.get(key)
  return v === "true" || v === "1"
}

function checkTeam(state: State, teamId: string): Reply | undefined {
  if (state.teamId !== undefined && state.teamId !== teamId) {
    return {
      status: 401,
      body: { err: "Team not authorized", ECODE: "OAUTH_023" },
    }
  }
}

function filterTasks(tasks: ClickUpTask[], query: URLSearchParams) {
  const includeClosed = bool(query, "include_closed")
  const subtasks = bool(query, "subtasks")
  return tasks.filter(
    (t) =>
      (includeClosed || t.status?.type !== "closed") && (subtasks || !t.parent),
  )
}

function paginate(tasks: ClickUpTask[], query: URLSearchParams) {
  const page = Number(query.get("page") ?? 0) || 0
  const start = page * PAGE_SIZE
  return {
    tasks: tasks.slice(start, start + PAGE_SIZE),
    last_page: start + PAGE_SIZE >= tasks.length,
  }
}

const taskNotFound = () => notFound("Task not found", "ITEM_013")

const routes: Route[] = [
  {
    method: "GET",
    pattern: /^\/v2\/team\/([^/]+)\/task$/,
    helper: "getTeamTasks",
    handle({ state, params, query }) {
      const denied = checkTeam(state, params[0] as string)
      if (denied) return denied
      const listIds = multi(query, "list_ids")
      const statuses = multi(query, "statuses")?.map((s) => s.toLowerCase())
      const assignees = multi(query, "assignees")
      const updatedGt = query.get("date_updated_gt")
      const matched = filterTasks(state.tasks, query).filter(
        (t) =>
          (!listIds || listIds.includes(String(t.list?.id))) &&
          (!statuses ||
            statuses.includes(String(t.status?.status).toLowerCase())) &&
          (!assignees ||
            t.assignees.some((a) => assignees.includes(String(a.id)))) &&
          (updatedGt === null || Number(t.date_updated) > Number(updatedGt)),
      )
      return { status: 200, body: paginate(matched, query) }
    },
  },
  {
    method: "GET",
    pattern: /^\/v2\/team\/([^/]+)\/time_entries$/,
    helper: "getTimeEntries",
    handle({ state, params, query }) {
      const denied = checkTeam(state, params[0] as string)
      if (denied) return denied
      const taskId = query.get("task_id")
      const assignees = multi(query, "assignee")
      const spaceId = query.get("space_id")
      const from = query.get("start_date")
      const to = query.get("end_date")
      const data = state.timeEntries.filter(
        (e) =>
          (taskId === null || e.task?.id === taskId) &&
          (!assignees || assignees.includes(String(e.user?.id))) &&
          (spaceId === null || String(e.task_location?.space_id) === spaceId) &&
          (from === null || Number(e.start) >= Number(from)) &&
          (to === null || Number(e.start) <= Number(to)),
      )
      return { status: 200, body: { data } }
    },
  },
  {
    method: "GET",
    pattern: /^\/v2\/task\/([^/]+)$/,
    helper: "getTask",
    handle({ state, params }) {
      const task = state.tasks.find((t) => t.id === params[0])
      return task ? { status: 200, body: task } : taskNotFound()
    },
  },
  {
    method: "PUT",
    pattern: /^\/v2\/task\/([^/]+)$/,
    helper: "setTaskType",
    handle({ state, params, body }) {
      const task = state.tasks.find((t) => t.id === params[0])
      if (!task) return taskNotFound()
      const itemId = (body as { custom_item_id?: number } | undefined)
        ?.custom_item_id
      if (itemId !== undefined) task.custom_item_id = itemId
      return { status: 200, body: task }
    },
  },
  {
    method: "GET",
    pattern: /^\/v2\/list\/([^/]+)$/,
    helper: "getList",
    handle({ state, params }) {
      const list = state.lists.find((l) => l.id === params[0])
      return list
        ? { status: 200, body: list }
        : notFound("List not found", "LIST_001")
    },
  },
  {
    method: "GET",
    pattern: /^\/v2\/list\/([^/]+)\/task$/,
    helper: "getListTasks",
    handle({ state, params, query }) {
      if (!state.lists.some((l) => l.id === params[0])) {
        return notFound("List not found", "LIST_001")
      }
      const archived = bool(query, "archived")
      const matched = filterTasks(state.tasks, query).filter(
        (t) => t.list?.id === params[0] && Boolean(t.archived) === archived,
      )
      return { status: 200, body: paginate(matched, query) }
    },
  },
  {
    method: "GET",
    pattern: /^\/v2\/space\/([^/]+)$/,
    helper: "getSpace",
    handle({ state, params }) {
      const space = state.spaces.find((s) => s.id === params[0])
      if (!space) return notFound("Space not found", "SPACE_015")
      // GET /space/{id} omits `members`, unlike GET /team/{id}/space.
      const { members: _members, ...rest } = space
      return { status: 200, body: rest }
    },
  },
  {
    method: "GET",
    pattern: /^\/v2\/space\/([^/]+)\/folder$/,
    helper: "getFolders",
    handle({ state, params }) {
      if (!state.spaces.some((s) => s.id === params[0])) {
        return notFound("Space not found", "SPACE_015")
      }
      const folders = state.folders
        .filter((f) => f.space?.id === params[0])
        .map((f) => ({
          ...f,
          lists: state.lists.filter((l) => l.folder?.id === f.id),
        }))
      return { status: 200, body: { folders } }
    },
  },
  {
    method: "GET",
    pattern: /^\/v2\/space\/([^/]+)\/list$/,
    helper: "getFolderlessLists",
    handle({ state, params }) {
      if (!state.spaces.some((s) => s.id === params[0])) {
        return notFound("Space not found", "SPACE_015")
      }
      const lists = state.lists.filter(
        (l) => l.space?.id === params[0] && (!l.folder || l.folder.hidden),
      )
      return { status: 200, body: { lists } }
    },
  },
]

function targetTaskId(
  pathname: string,
  query: URLSearchParams,
): string | undefined {
  return (
    /^\/v2\/task\/([^/]+)$/.exec(pathname)?.[1] ??
    query.get("task_id") ??
    undefined
  )
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on("data", (c: Buffer) => chunks.push(c))
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8")
      if (!text) return resolve(undefined)
      try {
        resolve(JSON.parse(text))
      } catch {
        resolve(text)
      }
    })
  })
}

export async function createClickUpFake(
  fixtures: ClickUpFakeFixtures = {},
): Promise<ClickUpFake> {
  let state = toState(fixtures)
  let recorded: RecordedCall[] = []
  let failures: Array<FailOnceOptions & { helper: ClickUpFakeHelper }> = []

  const server: Server = createServer(async (req, res) => {
    const send = ({ status, body }: Reply) => {
      res.writeHead(status, {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "*",
      })
      res.end(JSON.stringify(body))
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "*",
      })
      return void res.end()
    }

    const body = await readBody(req)
    const url = new URL(req.url ?? "/", "http://fake")
    const prefix = "/api"
    const pathname = url.pathname.startsWith(`${prefix}/`)
      ? url.pathname.slice(prefix.length)
      : url.pathname

    let matched: RegExpExecArray | null = null
    const route = routes.find((r) => {
      if (r.method !== req.method) return false
      matched = r.pattern.exec(pathname)
      return matched !== null
    })

    const query: RecordedCall["query"] = {}
    for (const key of new Set(url.searchParams.keys())) {
      const values = url.searchParams.getAll(key)
      query[key] = values.length > 1 ? values : (values[0] as string)
    }
    recorded.push({
      method: route?.helper ?? "unknown",
      path: pathname,
      query,
      body,
    })

    if (!route || !matched) {
      return send(notFound("Route not found", "FAKE_404"))
    }

    const taskId = targetTaskId(pathname, url.searchParams)
    const idx = failures.findIndex(
      (f) =>
        f.helper === route.helper &&
        (f.taskId === undefined || f.taskId === taskId),
    )
    if (idx !== -1) {
      const [failure] = failures.splice(idx, 1)
      return send({
        status: (failure as FailOnceOptions).status,
        body: (failure as FailOnceOptions).body ?? {
          err: "Injected failure",
          ECODE: "FAKE_000",
        },
      })
    }

    send(
      route.handle({
        state,
        params: (matched as RegExpExecArray).slice(1).map(decodeURIComponent),
        query: url.searchParams,
        body,
      }),
    )
  })

  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  )
  const { port } = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${port}/api`,
    calls: (method) =>
      method ? recorded.filter((c) => c.method === method) : [...recorded],
    failOnce: (helper, options) => {
      failures.push({ helper, ...options })
    },
    reset: async (next = {}) => {
      state = toState(next)
      recorded = []
      failures = []
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections()
        server.close((err) => (err ? reject(err) : resolve()))
      }),
  }
}
