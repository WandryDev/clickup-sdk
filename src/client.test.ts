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
      "createTask",
      "createTaskAttachment",
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
})
