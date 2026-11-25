import type {
  ClickUpFolder,
  ClickUpList,
  ClickUpSpace,
  ClickUpTask,
  ClickUpTimeEntry,
} from "../generated/v2/custom_types"

let seq = 0
const nextId = () => String(++seq + 900_000)

const defaultStatus = {
  id: "st1",
  status: "to do",
  color: "#d3d3d3",
  orderindex: 0,
  type: "open",
}

const defaultUser = {
  id: 1,
  username: "Fake User",
  color: "#000000",
  email: "fake@example.com",
  profilePicture: "",
}

// Dates and durations are strings on the wire; accept numbers for convenience.
type Stringy<T, K extends keyof T> = Omit<T, K> & {
  [P in K]?: string | number
}

export function fakeSpace(overrides: Partial<ClickUpSpace> = {}): ClickUpSpace {
  return {
    id: nextId(),
    name: "Space",
    private: false,
    statuses: [defaultStatus],
    multiple_assignees: true,
    features: {} as ClickUpSpace["features"],
    ...overrides,
  }
}

export type FakeFolderOverrides = Omit<Partial<ClickUpFolder>, "space"> & {
  space?: Partial<ClickUpFolder["space"]>
}

export function fakeFolder(overrides: FakeFolderOverrides = {}): ClickUpFolder {
  const { space, ...rest } = overrides
  return {
    id: nextId(),
    name: "Folder",
    orderindex: 0,
    override_statuses: false,
    hidden: false,
    task_count: "0",
    lists: [],
    ...rest,
    space: { id: "0", name: "Space", access: true, ...space },
  }
}

export type FakeListOverrides = Omit<
  Partial<ClickUpList>,
  "folder" | "space"
> & {
  folder?: Partial<ClickUpList["folder"]>
  space?: Partial<ClickUpList["space"]>
}

/**
 * Without a `folder` override the list is folderless (it carries ClickUp's
 * hidden placeholder folder), so `getFolderlessLists` returns it. Pass
 * `folder: { id, hidden: false }` to put it in a folder.
 */
export function fakeList(overrides: FakeListOverrides = {}): ClickUpList {
  const { folder, space, ...rest } = overrides
  return {
    id: nextId(),
    name: "List",
    orderindex: 0,
    content: "",
    status: null,
    priority: null,
    assignee: null,
    task_count: null,
    due_date: null,
    start_date: null,
    archived: false,
    override_statuses: false,
    permission_level: "create",
    ...rest,
    folder: {
      id: "0",
      name: "hidden",
      hidden: true,
      access: true,
      ...folder,
    },
    space: { id: "0", name: "Space", access: true, ...space },
  }
}

export type FakeTaskOverrides = Omit<
  Stringy<
    Partial<ClickUpTask>,
    "date_created" | "date_updated" | "date_closed"
  >,
  "list" | "folder" | "space" | "status"
> & {
  list?: Partial<ClickUpTask["list"]>
  folder?: Partial<ClickUpTask["folder"]>
  space?: Partial<ClickUpTask["space"]>
  status?: Partial<ClickUpTask["status"]>
}

export function fakeTask(overrides: FakeTaskOverrides = {}): ClickUpTask {
  const { list, folder, space, status, ...rest } = overrides
  const id = overrides.id ?? nextId()
  const now = String(Date.now())
  const folderObj = {
    id: "0",
    name: "hidden",
    hidden: false,
    access: true,
    ...folder,
  }
  const task = {
    id,
    custom_id: null,
    name: "Task",
    text_content: "",
    description: "",
    orderindex: "0",
    date_created: now,
    date_updated: now,
    date_closed: "",
    date_done: null,
    creator: defaultUser,
    assignees: [],
    watchers: [],
    checklists: [],
    tags: [],
    parent: "",
    priority: 0,
    due_date: "",
    start_date: "",
    points: 0,
    time_estimate: 0,
    custom_fields: [],
    dependencies: [],
    linked_tasks: [],
    team_id: "1",
    url: `https://app.clickup.com/t/${id}`,
    permission_level: "create",
    archived: false,
    custom_item_id: 0,
    ...rest,
    status: { ...defaultStatus, ...status },
    list: { id: "0", name: "List", access: true, ...list },
    project: {
      id: folderObj.id,
      name: folderObj.name,
      hidden: folderObj.hidden,
      access: true,
    },
    folder: folderObj,
    space: { id: "0", ...space },
  }
  // Numbers in the overrides are normalised to the wire format (strings).
  for (const key of ["date_created", "date_updated", "date_closed"] as const) {
    task[key] = String(task[key])
  }
  return task as ClickUpTask
}

export type FakeTimeEntryOverrides = Omit<
  Stringy<Partial<ClickUpTimeEntry>, "start" | "end" | "duration" | "at">,
  "task" | "user" | "task_location"
> & {
  task?: Partial<ClickUpTimeEntry["task"]>
  user?: Partial<ClickUpTimeEntry["user"]>
  task_location?: Partial<ClickUpTimeEntry["task_location"]>
}

export function fakeTimeEntry(
  overrides: FakeTimeEntryOverrides = {},
): ClickUpTimeEntry {
  const { task, user, task_location, ...rest } = overrides
  const now = Date.now()
  const entry = {
    id: nextId(),
    wid: "1",
    billable: false,
    start: now - 3_600_000,
    end: now,
    duration: 3_600_000,
    description: "",
    tags: [],
    source: "clickup",
    at: now,
    task_tags: [],
    task_url: "",
    ...rest,
    task: {
      id: "0",
      custom_id: "",
      name: "Task",
      status: defaultStatus,
      custom_type: null,
      ...task,
    },
    user: { id: 1, username: "Fake User", email: "fake@example.com", ...user },
    task_location: {
      list_id: 0,
      folder_id: 0,
      space_id: 0,
      list_name: "List",
      folder_name: "Folder",
      space_name: "Space",
      ...task_location,
    },
  }
  return {
    ...entry,
    start: String(entry.start),
    end: String(entry.end),
    duration: String(entry.duration),
    at: String(entry.at),
  } as ClickUpTimeEntry
}
