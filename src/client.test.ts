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
      "getWorkspaces",
      "getTaskComments",
      "getThreadedComments",
      "getTaskTimeInStatus",
      "getRunningTimeEntry",
      "createTask",
      "createTaskAttachment",
      "setTaskType",
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

  it("getTask leaves the markdown description out unless asked", async () => {
    const fetchMock = vi.fn(async (_req: Request) => jsonResponse({ id: "t1" }))
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "tok" })
    await clickup.getTask("t1")

    const url = new URL(fetchMock.mock.calls[0][0].url)
    expect(url.pathname).toBe("/api/v2/task/t1")
    expect(url.search).toBe("")
  })

  it("getTask requests the markdown description when asked", async () => {
    const fetchMock = vi.fn(async (_req: Request) =>
      jsonResponse({ id: "t1", markdown_description: "## Steps" }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "tok" })
    const task = await clickup.getTask("t1", {
      include_markdown_description: true,
    })

    expect(task.markdown_description).toBe("## Steps")
    const req = fetchMock.mock.calls[0][0]
    expect(req.url).toContain("/v2/task/t1")
    expect(req.url).toContain("include_markdown_description=true")
  })

  it("getWorkspaces sends auth to /team and unwraps teams", async () => {
    const fetchMock = vi.fn(async (_req: Request) =>
      jsonResponse({ teams: [{ id: "90210", name: "Acme", members: [] }] }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "secret-token" })
    const workspaces = await clickup.getWorkspaces()

    expect(workspaces).toEqual([{ id: "90210", name: "Acme", members: [] }])
    const req = fetchMock.mock.calls[0][0]
    expect(req.headers.get("Authorization")).toBe("secret-token")
    expect(new URL(req.url).pathname).toBe("/api/v2/team")
  })

  it("getWorkspaces returns an empty array when teams is absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_req: Request) => jsonResponse({})),
    )

    const clickup = createClickUp({ token: "tok" })
    await expect(clickup.getWorkspaces()).resolves.toEqual([])
  })

  it("getWorkspaces throws on a non-2xx response", async () => {
    const fetchMock = vi.fn(async (_req: Request) =>
      jsonResponse({ err: "Token invalid" }, 401),
    )
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "tok" })
    await expect(clickup.getWorkspaces()).rejects.toThrow(
      /GET \/team failed.*Token invalid/,
    )
  })

  it("getTaskComments hits the task comment path and unwraps comments", async () => {
    const fetchMock = vi.fn(async (_req: Request) =>
      jsonResponse({
        comments: [{ id: "c2", comment_text: "hi", date: "1700000000000" }],
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "tok" })
    const comments = await clickup.getTaskComments("t1")

    expect(comments.map((c) => c.id)).toEqual(["c2"])
    const req = fetchMock.mock.calls[0][0]
    expect(req.url).toContain("/v2/task/t1/comment")
    expect(req.url).not.toContain("start")
  })

  it("getTaskComments forwards the pagination cursor", async () => {
    const fetchMock = vi.fn(async (_req: Request) =>
      jsonResponse({ comments: [] }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "tok" })
    await clickup.getTaskComments("t1", {
      start: 1700000000000,
      start_id: "c2",
    })

    const url = new URL(fetchMock.mock.calls[0][0].url)
    expect(url.searchParams.get("start")).toBe("1700000000000")
    expect(url.searchParams.get("start_id")).toBe("c2")
  })

  it("getTaskComments throws on a non-2xx response", async () => {
    const fetchMock = vi.fn(async (_req: Request) =>
      jsonResponse({ err: "boom" }, 500),
    )
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "tok" })
    await expect(clickup.getTaskComments("t1")).rejects.toThrow(
      /\/task\/t1\/comment failed/,
    )
  })

  it("getThreadedComments passes the comment id through verbatim", async () => {
    const fetchMock = vi.fn(async (_req: Request) =>
      jsonResponse({ comments: [{ id: "r1", comment_text: "reply" }] }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "tok" })
    const replies = await clickup.getThreadedComments("90120045678901")

    expect(replies.map((r) => r.id)).toEqual(["r1"])
    expect(fetchMock.mock.calls[0][0].url).toContain(
      "/v2/comment/90120045678901/reply",
    )
  })

  it("getThreadedComments throws on a non-2xx response", async () => {
    const fetchMock = vi.fn(async (_req: Request) =>
      jsonResponse({ err: "boom" }, 404),
    )
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "tok" })
    await expect(clickup.getThreadedComments("c1")).rejects.toThrow(
      /\/comment\/c1\/reply failed/,
    )
  })

  it("getTaskTimeInStatus returns the current status and history", async () => {
    const body = {
      current_status: {
        status: "in progress",
        color: "#4194f6",
        total_time: { by_minute: 42, since: "1700000000000" },
      },
      status_history: [],
    }
    const fetchMock = vi.fn(async (_req: Request) => jsonResponse(body))
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "tok" })
    const timeInStatus = await clickup.getTaskTimeInStatus("t1")

    expect(timeInStatus).toEqual(body)
    expect(fetchMock.mock.calls[0][0].url).toContain(
      "/v2/task/t1/time_in_status",
    )
  })

  it("getTaskTimeInStatus throws on a non-2xx response", async () => {
    const fetchMock = vi.fn(async (_req: Request) =>
      jsonResponse({ err: "boom" }, 400),
    )
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "tok" })
    await expect(clickup.getTaskTimeInStatus("t1")).rejects.toThrow(
      /\/task\/t1\/time_in_status failed.*boom/,
    )
  })

  it("getRunningTimeEntry returns the running timer", async () => {
    const fetchMock = vi.fn(async (_req: Request) =>
      jsonResponse({
        data: { id: "e1", task: { id: "t1", name: "Task" }, duration: -1 },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "tok" })
    const entry = await clickup.getRunningTimeEntry("90210", { assignee: 42 })

    expect(entry?.task?.id).toBe("t1")
    const url = new URL(fetchMock.mock.calls[0][0].url)
    expect(url.pathname).toBe("/api/v2/team/90210/time_entries/current")
    expect(url.searchParams.get("assignee")).toBe("42")
  })

  it("getRunningTimeEntry throws on a non-2xx response", async () => {
    const fetchMock = vi.fn(async (_req: Request) =>
      jsonResponse({ err: "boom" }, 500),
    )
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "tok" })
    await expect(clickup.getRunningTimeEntry("90210")).rejects.toThrow(
      /\/team\/90210\/time_entries\/current failed/,
    )
  })

  it("getRunningTimeEntry returns null when no timer runs", async () => {
    const fetchMock = vi.fn(async (_req: Request) =>
      jsonResponse({ data: null }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "tok" })
    await expect(clickup.getRunningTimeEntry("90210")).resolves.toBeNull()
    expect(fetchMock.mock.calls[0][0].url).not.toContain("assignee")
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

  it("createTask sends the auth token to the list task path and returns id/url", async () => {
    const fetchMock = vi.fn(async (_req: Request) =>
      jsonResponse({ id: "abc123", url: "https://app.clickup.com/t/abc123" }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "secret-token" })
    const task = await clickup.createTask("901", { name: "Bug report" })

    expect(task.id).toBe("abc123")
    expect(task.url).toBe("https://app.clickup.com/t/abc123")
    const req = fetchMock.mock.calls[0][0]
    expect(req.method).toBe("POST")
    expect(req.headers.get("Authorization")).toBe("secret-token")
    expect(req.url).toContain("/v2/list/901/task")
  })

  it("createTask sends every supplied field in the body", async () => {
    let sentBody: Record<string, unknown> | undefined
    const fetchMock = vi.fn(async (req: Request) => {
      sentBody = (await req.clone().json()) as Record<string, unknown>
      return jsonResponse({ id: "abc123" })
    })
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "tok" })
    await clickup.createTask("901", {
      name: "Bug report",
      description: "plain",
      markdown_content: "# heading",
      status: "to do",
      assignees: [42, 43],
      custom_item_id: 1300,
    })

    expect(sentBody).toEqual({
      name: "Bug report",
      description: "plain",
      markdown_content: "# heading",
      status: "to do",
      assignees: [42, 43],
      custom_item_id: 1300,
    })
  })

  // Omitting (rather than nulling) optional fields is what lets ClickUp apply
  // the list's own defaults, so pin it explicitly.
  it("createTask omits optional fields that were not supplied", async () => {
    let sentBody: Record<string, unknown> | undefined
    const fetchMock = vi.fn(async (req: Request) => {
      sentBody = (await req.clone().json()) as Record<string, unknown>
      return jsonResponse({ id: "abc123" })
    })
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "tok" })
    await clickup.createTask("901", { name: "Only a name" })

    expect(sentBody).toEqual({ name: "Only a name" })
    for (const key of [
      "description",
      "markdown_content",
      "status",
      "assignees",
      "custom_item_id",
    ]) {
      expect(sentBody).not.toHaveProperty(key)
    }
  })

  it("createTask throws with the status code and body on a non-2xx response", async () => {
    const fetchMock = vi.fn(async (_req: Request) =>
      jsonResponse({ err: "List not found", ECODE: "CRTSK_001" }, 400),
    )
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "tok" })
    const error = await clickup
      .createTask("901", { name: "x" })
      .catch((e: Error) => e)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain("/list/901/task")
    expect((error as Error).message).toContain("400")
    expect((error as Error).message).toContain("CRTSK_001")
  })

  // An outage returns a non-2xx with no parseable body. Without the status the
  // caller cannot tell it apart from a rejected request, so pin it.
  it("createTask surfaces the status when the failure has an empty body", async () => {
    const fetchMock = vi.fn(
      async (_req: Request) => new Response("", { status: 502 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "tok" })
    const error = await clickup
      .createTask("901", { name: "x" })
      .catch((e: Error) => e)

    // Exact: the generated client turns an empty body into the literal "{}",
    // which must not be echoed as if it were a response.
    expect((error as Error).message).toBe(
      "ClickUp POST /list/901/task failed with 502",
    )
  })

  // A 2xx with an unusable body can't produce the ClickUpTask the signature
  // promises. Report it as such rather than as a failed request.
  it("createTask reports a 2xx with no payload distinctly from a failure", async () => {
    const fetchMock = vi.fn(
      async (_req: Request) => new Response("", { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "tok" })
    await expect(clickup.createTask("901", { name: "x" })).rejects.toThrow(
      /\/list\/901\/task returned 200 with no task payload/,
    )
  })

  // The other outage shape: no response at all. The cause must survive, since
  // the generated client hands back a thrown Error rather than a body here.
  it("createTask surfaces the cause when the request never reaches ClickUp", async () => {
    const fetchMock = vi.fn(async (_req: Request) => {
      throw new TypeError("fetch failed: ECONNREFUSED")
    })
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "tok" })
    await expect(clickup.createTask("901", { name: "x" })).rejects.toThrow(
      /ECONNREFUSED/,
    )
  })

  it("createTaskAttachment posts multipart with the filename and returns the attachment", async () => {
    let sentBody: FormData | undefined
    const fetchMock = vi.fn(async (req: Request) => {
      sentBody = await req.clone().formData()
      return jsonResponse({ id: "att1", url: "https://cdn.clickup.com/att1" })
    })
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "secret-token" })
    const attachment = await clickup.createTaskAttachment("t1", {
      file: new Blob(["screenshot-bytes"], { type: "image/png" }),
      filename: "screenshot.png",
    })

    expect(attachment.id).toBe("att1")

    const req = fetchMock.mock.calls[0][0]
    expect(req.method).toBe("POST")
    expect(req.headers.get("Authorization")).toBe("secret-token")
    expect(req.url).toContain("/v2/task/t1/attachment")
    expect(req.headers.get("Content-Type")).toMatch(/^multipart\/form-data;/)

    const uploaded = sentBody?.get("attachment")
    expect(uploaded).toBeInstanceOf(File)
    expect((uploaded as File).name).toBe("screenshot.png")
    expect(await (uploaded as File).text()).toBe("screenshot-bytes")
  })

  it("createTaskAttachment throws with the status code and body on a non-2xx response", async () => {
    const fetchMock = vi.fn(async (_req: Request) =>
      jsonResponse({ err: "Task not found", ECODE: "ATTCH_064" }, 404),
    )
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "tok" })
    const error = await clickup
      .createTaskAttachment("t1", {
        file: new Blob(["x"]),
        filename: "a.txt",
      })
      .catch((e: Error) => e)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain("/task/t1/attachment")
    expect((error as Error).message).toContain("404")
    expect((error as Error).message).toContain("ATTCH_064")
  })
  it("setTaskType puts the task path with the auth token and returns the task", async () => {
    const fetchMock = vi.fn(async (_req: Request) =>
      jsonResponse({ id: "t1", name: "Task", custom_item_id: 1002 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "secret-token" })
    const task = await clickup.setTaskType("t1", 1002)

    expect(task.id).toBe("t1")
    expect(fetchMock).toHaveBeenCalledOnce()
    const req = fetchMock.mock.calls[0][0]
    expect(req.method).toBe("PUT")
    expect(req.headers.get("Authorization")).toBe("secret-token")
    expect(req.url).toContain("/v2/task/t1")
  })

  // The point of the narrow signature: a task type update must not carry any
  // other field, or it would silently overwrite what someone edited in ClickUp.
  it("setTaskType sends custom_item_id and nothing else", async () => {
    let sentBody: Record<string, unknown> | undefined
    const fetchMock = vi.fn(async (req: Request) => {
      sentBody = (await req.clone().json()) as Record<string, unknown>
      return jsonResponse({ id: "t1" })
    })
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "tok" })
    await clickup.setTaskType("t1", 1002)

    expect(sentBody).toEqual({ custom_item_id: 1002 })
  })

  it("setTaskType throws with the status code and body on a non-2xx response", async () => {
    const fetchMock = vi.fn(async (_req: Request) =>
      jsonResponse({ err: "Task not found", ECODE: "OAUTH_027" }, 404),
    )
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "tok" })
    const error = await clickup.setTaskType("t1", 1002).catch((e: Error) => e)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain("/task/t1")
    expect((error as Error).message).toContain("404")
    expect((error as Error).message).toContain("OAUTH_027")
  })

  // Callers throttle on 429, and matching a status code out of a message is
  // brittle — carry it as a field so a rate limit stays machine-readable.
  it("setTaskType carries the HTTP status on the thrown error", async () => {
    const fetchMock = vi.fn(async (_req: Request) =>
      jsonResponse({ err: "Rate limit exceeded" }, 429),
    )
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "tok" })
    const error = await clickup.setTaskType("t1", 1002).catch((e: Error) => e)

    expect((error as Error & { status?: number }).status).toBe(429)
    expect((error as Error).message).toContain("429")
  })

  it("setTaskType carries the status for a server error too", async () => {
    const fetchMock = vi.fn(
      async (_req: Request) => new Response("", { status: 500 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "tok" })
    const error = await clickup.setTaskType("t1", 1002).catch((e: Error) => e)

    expect((error as Error & { status?: number }).status).toBe(500)
    expect((error as Error).message).toBe(
      "ClickUp PUT /task/t1 failed with 500",
    )
  })

  it("setTaskType reports a 2xx with no payload distinctly from a failure", async () => {
    const fetchMock = vi.fn(
      async (_req: Request) => new Response("", { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "tok" })
    await expect(clickup.setTaskType("t1", 1002)).rejects.toThrow(
      /\/task\/t1 returned 200 with no task payload/,
    )
  })

  it("setTaskType surfaces the cause when the request never reaches ClickUp", async () => {
    const fetchMock = vi.fn(async (_req: Request) => {
      throw new TypeError("fetch failed: ECONNREFUSED")
    })
    vi.stubGlobal("fetch", fetchMock)

    const clickup = createClickUp({ token: "tok" })
    await expect(clickup.setTaskType("t1", 1002)).rejects.toThrow(
      /ECONNREFUSED/,
    )
  })
})
