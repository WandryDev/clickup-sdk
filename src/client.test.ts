import { afterEach, describe, expect, it, vi } from "vitest"
import { createClickUp } from "./client"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("createClickUp", () => {
  it("exposes all client methods", () => {
    const clickup = createClickUp({ token: "tok" })
    const methods = [
      "getTask",
      "getTeamTasks",
      "findTaskInTeam",
      "getTimeEntries",
      "getTaskTimeEntriesPerAssignee",
      "getList",
      "getSpaces",
      "getSpace",
      "getFolders",
      "getFolderlessLists",
      "getFolderLists",
      "getListTasks",
      "postComment",
      "postCommentWithMention",
    ] as const
    for (const m of methods) {
      expect(typeof clickup[m]).toBe("function")
    }
  })

  it("getTask sends the auth token and returns the task", async () => {
    const fetchMock = vi.fn(async (_req: Request) =>
      jsonResponse({ id: "t1", name: "Task" }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "secret-token" })
    const task = await clickup.getTask("t1")

    expect(task.id).toBe("t1")
    expect(fetchMock).toHaveBeenCalledOnce()
    const req = fetchMock.mock.calls[0][0]
    expect(req.headers.get("Authorization")).toBe("secret-token")
    expect(req.url).toContain("/v2/task/t1")
  })

  it("postCommentWithMention builds a tag_user comment array", async () => {
    let sentBody: Record<string, unknown> | undefined
    const fetchMock = vi.fn(async (req: Request) => {
      sentBody = (await req.clone().json()) as Record<string, unknown>
      return jsonResponse({ id: "c1" })
    })
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "tok" })
    await clickup.postCommentWithMention("t1", {
      clickupUserId: 42,
      username: "alice",
      messageBefore: "hi ",
      messageAfter: " please review",
    })

    expect(sentBody?.comment).toEqual([
      { text: "hi " },
      { text: "alice", type: "tag_user", attributes: { user_id: 42 } },
      { text: " please review" },
    ])
    expect(sentBody?.assignee).toBe(42)
    expect(sentBody?.notify_all).toBe(false)
  })

  it("getSpaces sends auth, hits the team space path, and returns members", async () => {
    const fetchMock = vi.fn(async (_req: Request) =>
      jsonResponse({
        spaces: [{ id: "s1", name: "Space 1", members: [{ user: { id: 7 } }] }],
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "secret-token" })
    const spaces = await clickup.getSpaces("90210")

    expect(spaces).toHaveLength(1)
    expect(spaces[0].id).toBe("s1")
    expect(spaces[0].members?.[0]?.user?.id).toBe(7)
    const req = fetchMock.mock.calls[0][0]
    expect(req.headers.get("Authorization")).toBe("secret-token")
    expect(req.url).toContain("/v2/team/90210/space")
  })

  it("getListTasks forwards archived/page and unwraps tasks", async () => {
    const fetchMock = vi.fn(async (_req: Request) =>
      jsonResponse({ tasks: [{ id: "t9" }], last_page: true }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "tok" })
    const { tasks, last_page } = await clickup.getListTasks("123", {
      archived: true,
      page: 2,
    })

    expect(tasks).toEqual([{ id: "t9" }])
    expect(last_page).toBe(true)
    const req = fetchMock.mock.calls[0][0]
    expect(req.url).toContain("/v2/list/123/task")
    expect(req.url).toContain("archived=true")
    expect(req.url).toContain("page=2")
  })

  it("getFolders throws (sync-critical) on a non-2xx response", async () => {
    const fetchMock = vi.fn(async (_req: Request) =>
      jsonResponse({ err: "boom" }, 500),
    )
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "tok" })
    await expect(clickup.getFolders("s1")).rejects.toThrow(
      /\/space\/s1\/folder failed/,
    )
  })

  it("getList does not throw on a non-2xx response", async () => {
    const fetchMock = vi.fn(async (_req: Request) =>
      jsonResponse({ err: "not found" }, 404),
    )
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "tok" })
    await expect(clickup.getList(123)).resolves.toBeUndefined()
  })
})
