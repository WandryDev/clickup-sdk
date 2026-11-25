import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { type ClickUpClient, createClickUp } from "../client"
import {
  type ClickUpFake,
  createClickUpFake,
  fakeFolder,
  fakeList,
  fakeSpace,
  fakeTask,
  fakeTimeEntry,
} from "./index"

const space = fakeSpace({ id: "101", name: "Dev" })
const folder = fakeFolder({ id: "201", name: "Project", space: { id: "101" } })
const list = fakeList({
  id: "301",
  name: "Sprint",
  folder: { id: "201", name: "Project", hidden: false, access: true },
  space: { id: "101" },
})
const looseList = fakeList({ id: "302", name: "Loose", space: { id: "101" } })
const otherSpace = fakeSpace({ id: "102", name: "Other" })

function fixtures() {
  return {
    teamId: "9001",
    spaces: [space, otherSpace],
    folders: [folder],
    lists: [list, looseList],
    tasks: [
      fakeTask({
        id: "a",
        name: "A",
        list: { id: "301" },
        folder: { id: "201" },
      }),
      fakeTask({
        id: "b",
        name: "B",
        list: { id: "301" },
        folder: { id: "201" },
        parent: "a",
      }),
      fakeTask({
        id: "c",
        name: "C",
        list: { id: "301" },
        folder: { id: "201" },
        archived: true,
      }),
      fakeTask({ id: "d", name: "D", list: { id: "302" } }),
    ],
    timeEntries: [
      fakeTimeEntry({
        id: "e1",
        task: { id: "a" },
        user: { id: 1 },
        start: 1000,
        end: 2000,
        duration: 1000,
        task_location: { space_id: 101 },
      }),
      fakeTimeEntry({
        id: "e2",
        task: { id: "a" },
        user: { id: 2 },
        start: 5000,
        end: 6000,
        duration: 1000,
      }),
      fakeTimeEntry({
        id: "e3",
        task: { id: "d" },
        user: { id: 1 },
        start: 9000,
      }),
    ],
  }
}

describe("createClickUpFake", () => {
  let fake: ClickUpFake
  let clickup: ClickUpClient

  beforeEach(async () => {
    fake = await createClickUpFake(fixtures())
    clickup = createClickUp({ token: "x", baseUrl: fake.url })
  })
  afterEach(async () => {
    await fake.close()
  })

  it("exposes a usable base url", () => {
    expect(fake.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/api$/)
  })

  it("getTask returns the task and throws for unknown ids", async () => {
    const task = await clickup.getTask("a")
    expect(task.id).toBe("a")
    expect(task.name).toBe("A")
    await expect(clickup.getTask("nope")).rejects.toThrow(/ITEM_013/)
  })

  it("getTeamTasks filters by list, subtasks, closed and status", async () => {
    const { tasks } = await clickup.getTeamTasks("9001", { list_ids: ["301"] })
    expect(tasks.map((t) => t.id).sort()).toEqual(["a", "c"])
    const withSub = await clickup.getTeamTasks("9001", {
      list_ids: ["301"],
      subtasks: true,
    })
    expect(withSub.tasks.map((t) => t.id).sort()).toEqual(["a", "b", "c"])
    const none = await clickup.getTeamTasks("9001", { statuses: ["nope"] })
    expect(none.tasks).toEqual([])
  })

  it("getTeamTasks filters by date_updated_gt", async () => {
    await fake.reset({
      tasks: [
        fakeTask({ id: "old", date_updated: 1000 }),
        fakeTask({ id: "new", date_updated: 9000 }),
      ],
    })
    const { tasks } = await clickup.getTeamTasks("9001", {
      date_updated_gt: 5000,
    })
    expect(tasks.map((t) => t.id)).toEqual(["new"])
  })

  it("getTeamTasks paginates 100 per page", async () => {
    await fake.reset({
      tasks: Array.from({ length: 150 }, (_, i) =>
        fakeTask({ id: `t${i}`, list: { id: "301" } }),
      ),
    })
    const p0 = await clickup.getTeamTasks("9001", { page: 0 })
    const p1 = await clickup.getTeamTasks("9001", { page: 1 })
    const p2 = await clickup.getTeamTasks("9001", { page: 2 })
    expect(p0.tasks).toHaveLength(100)
    expect(p1.tasks).toHaveLength(50)
    expect(p2.tasks).toHaveLength(0)
    expect(p1.tasks[0]?.id).toBe("t100")
    expect(fake.calls("getTeamTasks").map((c) => c.query.page)).toEqual([
      "0",
      "1",
      "2",
    ])
  })

  it("getTimeEntries filters by task, assignee, space and date range", async () => {
    expect((await clickup.getTimeEntries("9001", {})).data).toHaveLength(3)
    const byTask = await clickup.getTimeEntries("9001", { task_id: "a" })
    expect(byTask.data.map((e) => e.id)).toEqual(["e1", "e2"])
    const byAssignee = await clickup.getTimeEntries("9001", { assignee: "1,3" })
    expect(byAssignee.data.map((e) => e.id)).toEqual(["e1", "e3"])
    const byRange = await clickup.getTimeEntries("9001", {
      start_date: 4000,
      end_date: 7000,
    })
    expect(byRange.data.map((e) => e.id)).toEqual(["e2"])
    const bySpace = await clickup.getTimeEntries("9001", { space_id: "101" })
    expect(bySpace.data.map((e) => e.id)).toEqual(["e1"])
  })

  it("getList returns the list, and undefined for an unknown id", async () => {
    expect((await clickup.getList("301"))?.name).toBe("Sprint")
    expect(await clickup.getList("999")).toBeUndefined()
  })

  it("getSpace returns the space without members, throws on unknown", async () => {
    const s = await clickup.getSpace("101")
    expect(s.name).toBe("Dev")
    await expect(clickup.getSpace("zzz")).rejects.toThrow(/SPACE/)
  })

  it("getFolders returns the space's folders with nested lists", async () => {
    const folders = await clickup.getFolders("101")
    expect(folders.map((f) => f.id)).toEqual(["201"])
    expect(folders[0]?.lists.map((l) => l.id)).toEqual(["301"])
    expect(await clickup.getFolders("102")).toEqual([])
  })

  it("getFolderlessLists returns only lists without a folder", async () => {
    const lists = await clickup.getFolderlessLists("101")
    expect(lists.map((l) => l.id)).toEqual(["302"])
  })

  it("getListTasks filters by archived, subtasks and pages", async () => {
    const open = await clickup.getListTasks("301")
    expect(open.tasks.map((t) => t.id)).toEqual(["a"])
    expect(open.last_page).toBe(true)
    const archived = await clickup.getListTasks("301", { archived: true })
    expect(archived.tasks.map((t) => t.id)).toEqual(["c"])
    const sub = await clickup.getListTasks("301", { subtasks: true })
    expect(sub.tasks.map((t) => t.id)).toEqual(["a", "b"])
    await expect(clickup.getListTasks("999")).rejects.toThrow()
  })

  it("getListTasks paginates", async () => {
    await fake.reset({
      lists: [list],
      tasks: Array.from({ length: 101 }, (_, i) =>
        fakeTask({ id: `t${i}`, list: { id: "301" } }),
      ),
    })
    const p0 = await clickup.getListTasks("301", { page: 0 })
    const p1 = await clickup.getListTasks("301", { page: 1 })
    expect(p0.tasks).toHaveLength(100)
    expect(p0.last_page).toBe(false)
    expect(p1.tasks).toHaveLength(1)
    expect(p1.last_page).toBe(true)
  })

  it("setTaskType updates state seen by a following getTask", async () => {
    const updated = await clickup.setTaskType("a", 1002)
    expect(updated.custom_item_id).toBe(1002)
    expect((await clickup.getTask("a")).custom_item_id).toBe(1002)
    expect(fake.calls("setTaskType")).toMatchObject([
      {
        method: "setTaskType",
        path: "/v2/task/a",
        body: { custom_item_id: 1002 },
      },
    ])
    await expect(clickup.setTaskType("nope", 1)).rejects.toMatchObject({
      status: 404,
    })
  })

  it("records calls, filterable by helper name", async () => {
    await clickup.getTask("a")
    await clickup.getList("301")
    expect(fake.calls().map((c) => c.method)).toEqual(["getTask", "getList"])
    expect(fake.calls("getTask")[0]).toMatchObject({
      path: "/v2/task/a",
      query: {},
    })
  })

  it("records unknown routes and answers 404", async () => {
    const res = await fetch(`${fake.url}/v2/nothing`)
    expect(res.status).toBe(404)
    expect(fake.calls("unknown")).toHaveLength(1)
    expect(fake.calls()[0]?.path).toBe("/v2/nothing")
  })

  it("failOnce returns 429 once, then succeeds", async () => {
    fake.failOnce("getTask", { status: 429 })
    await expect(clickup.getTask("a")).rejects.toThrow(/failed/)
    expect((await clickup.getTask("a")).id).toBe("a")
    expect(fake.calls("getTask")).toHaveLength(2)
  })

  it("failOnce can target one task id and carry a custom body", async () => {
    fake.failOnce("setTaskType", {
      status: 503,
      taskId: "b",
      body: { err: "down" },
    })
    expect((await clickup.setTaskType("a", 1)).id).toBe("a")
    await expect(clickup.setTaskType("b", 1)).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining("down"),
    })
    expect((await clickup.setTaskType("b", 1)).id).toBe("b")
  })

  it("reset swaps fixtures and clears calls and failures", async () => {
    fake.failOnce("getTask", { status: 500 })
    await clickup.getList("301")
    await fake.reset({ tasks: [fakeTask({ id: "z", name: "Z" })] })
    expect(fake.calls()).toEqual([])
    expect((await clickup.getTask("z")).name).toBe("Z")
    await expect(clickup.getTask("a")).rejects.toThrow()
  })
})
