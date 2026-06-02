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

  it("getList does not throw on a non-2xx response", async () => {
    const fetchMock = vi.fn(async (_req: Request) =>
      jsonResponse({ err: "not found" }, 404),
    )
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "tok" })
    await expect(clickup.getList(123)).resolves.toBeUndefined()
  })
})
