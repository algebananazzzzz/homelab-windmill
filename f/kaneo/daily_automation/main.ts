type BoardTask = {
  id: string;
  number: number | null;
  title: string;
  dueDate: string | null;
};

type Board = {
  data: { columns: { slug: string; tasks: BoardTask[] }[] };
  pagination: { totalPages: number };
};

const TIMEZONE = "Asia/Singapore";
const TODO = "to-do";
const THIS_WEEK = "this-week";

// Named after the `kaneo` resource type, so Windmill offers f/kaneo/kaneo for this parameter.
type Kaneo = { base_url: string; workspace_id: string; api_key: string };

/**
 * Moves every To Do task due on or before Friday of next week into This Week, across all projects in the
 * workspace, so the weekly column always holds what is due soon without triaging it by hand.
 */
export async function main(kaneo: Kaneo, dry_run = false) {
  const cutoff = weekCutoff(new Date(), TIMEZONE);
  const api = client(kaneo);

  const projects = await api<{ id: string; name: string; slug: string }[]>(`/project?workspaceId=${kaneo.workspace_id}`);

  const moved: { task: string; title: string; due: string }[] = [];
  const skipped: string[] = [];
  for (const project of projects) {
    const { hasThisWeek, tasks } = await todoTasks(api, project.id);
    // Only boards that opted into the weekly column take part.
    if (!hasThisWeek) {
      skipped.push(project.name);
      continue;
    }

    const due = tasks.filter((t) => t.dueDate !== null && new Date(t.dueDate) < cutoff);
    if (due.length > 0 && !dry_run) {
      const result = await api<{ updatedCount: number }>("/task/bulk", {
        method: "PATCH",
        body: { taskIds: due.map((t) => t.id), operation: "updateStatus", value: THIS_WEEK },
      });
      if (result.updatedCount !== due.length) {
        throw new Error(`${project.name}: moved ${result.updatedCount} of ${due.length} tasks`);
      }
    }
    moved.push(...due.map((t) => ({ task: `${project.slug}-${t.number}`, title: t.title, due: t.dueDate! })));
  }

  return { cutoff: cutoff.toISOString(), dry_run, moved, skipped };
}

/**
 * The first instant after Friday of next week in `timezone`, with weeks running Monday to Sunday.
 * Run on Thu 1 Oct, the cutoff is Sat 10 Oct 00:00; run on Mon 5 Oct, it is Sat 17 Oct 00:00.
 */
export function weekCutoff(now: Date, timezone: string): Date {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(now)
    .split("-")
    .map(Number);
  const isoWeekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
  const saturday = new Date(Date.UTC(y, m - 1, d + (7 - isoWeekday) + 6));
  return midnightIn(saturday.getUTCFullYear(), saturday.getUTCMonth(), saturday.getUTCDate(), timezone);
}

function midnightIn(y: number, monthIndex: number, d: number, timezone: string): Date {
  const utcMidnight = Date.UTC(y, monthIndex, d);
  const wall = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(utcMidnight);
  const part = (type: string) => Number(wall.find((p) => p.type === type)!.value);
  const wallAsUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return new Date(utcMidnight - (wallAsUtc - utcMidnight));
}

type KaneoClient = <T>(path: string, init?: { method: string; body: unknown }) => Promise<T>;

function client(kaneo: Kaneo): KaneoClient {
  return async (path, init) => {
    const res = await fetch(`${kaneo.base_url}${path}`, {
      method: init?.method ?? "GET",
      headers: { authorization: `Bearer ${kaneo.api_key}`, "content-type": "application/json" },
      body: init ? JSON.stringify(init.body) : undefined,
    });
    if (!res.ok) {
      throw new Error(`${init?.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
    }
    return res.json();
  };
}

async function todoTasks(api: KaneoClient, projectId: string) {
  const tasks: BoardTask[] = [];
  let hasThisWeek = false;
  for (let page = 1, totalPages = 1; page <= totalPages; page++) {
    const board = await api<Board>(`/task/tasks/${projectId}?status=${TODO}&limit=100&page=${page}`);
    totalPages = board.pagination.totalPages;
    hasThisWeek ||= board.data.columns.some((c) => c.slug === THIS_WEEK);
    tasks.push(...(board.data.columns.find((c) => c.slug === TODO)?.tasks ?? []));
  }
  return { hasThisWeek, tasks };
}
