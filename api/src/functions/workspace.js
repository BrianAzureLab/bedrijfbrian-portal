const crypto = require("node:crypto");
const { app } = require("@azure/functions");
const { CosmosClient } = require("@azure/cosmos");

const BOARD_ID = "board";
const PARTITION = "workspace";
const PORTAL_ROLES = ["employee", "support", "itadmin"];
const STATUS_OPTIONS = ["Working on it", "Need help", "Ready for review", "Completed"];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(status, body) {
  return {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    body: JSON.stringify(body)
  };
}

function safeWorkspaceError(error) {
  const rawCode = error?.statusCode ?? error?.code;
  const code = Number(rawCode);
  if (code === 401) return "Cosmos rejected the configured key.";
  if (code === 403) return "Cosmos denied access to the configured account.";
  if (code === 404) return "Cosmos could not find the configured database or container.";
  if (code === 429) return "Cosmos is temporarily busy. Try again in a moment.";

  const signal = String(rawCode || error?.name || "unknown").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 40);
  if (signal === "MODULE_NOT_FOUND") return "The workspace API package is missing.";
  if (signal === "ENOTFOUND" || signal === "ECONNREFUSED" || signal === "ETIMEDOUT") {
    return `The workspace API cannot reach Cosmos (${signal}).`;
  }
  return `The workspace API could not reach Cosmos (${signal}).`;
}

function getPrincipal(request) {
  const value = request.headers.get("x-ms-client-principal");
  if (!value) throw new HttpError(401, "Sign-in is required.");
  try {
    const principal = JSON.parse(Buffer.from(value, "base64").toString("utf8"));
    const roles = principal.userRoles || [];
    if (!roles.some((role) => PORTAL_ROLES.includes(role))) {
      throw new HttpError(403, "You do not have a portal role.");
    }
    return {
      id: principal.userId,
      name: principal.userDetails || "Work account",
      roles
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, "Your sign-in could not be verified.");
  }
}

function hasRole(principal, role) {
  return principal.roles.includes(role);
}

function requireAdmin(principal) {
  if (!hasRole(principal, "itadmin")) throw new HttpError(403, "IT administrator access is required.");
}

function configuration() {
  const endpoint = process.env.COSMOS_ENDPOINT;
  const key = process.env.COSMOS_KEY;
  const database = process.env.COSMOS_DATABASE || "bedrijfbrian";
  const container = process.env.COSMOS_CONTAINER || "workspace";
  if (!endpoint || !key) {
    throw new HttpError(503, "The shared workspace is not configured yet.");
  }
  return { endpoint, key, database, container };
}

function getContainer() {
  const config = configuration();
  const client = new CosmosClient({ endpoint: config.endpoint, key: config.key });
  return client.database(config.database).container(config.container);
}

function seedBoard() {
  return {
    id: BOARD_ID,
    category: PARTITION,
    tasks: [
      {
        id: "security-basics",
        title: "Read the BedrijfBrian security basics",
        audience: "employee",
        active: true,
        completedBy: {},
        createdAt: new Date().toISOString(),
        createdBy: "System"
      },
      {
        id: "support-process",
        title: "Review the Support escalation process",
        audience: "support",
        active: true,
        completedBy: {},
        createdAt: new Date().toISOString(),
        createdBy: "System"
      }
    ],
    announcements: [
      {
        id: "welcome-update",
        title: "Welcome to the BedrijfBrian portal",
        body: "This is the shared company workspace for our Azure learning environment.",
        createdAt: new Date().toISOString(),
        createdBy: "System"
      }
    ],
    knowledge: [
      {
        id: "security-article",
        title: "How do I keep my account secure?",
        body: "Use MFA, protect your password and report unexpected sign-in prompts.",
        createdAt: new Date().toISOString(),
        createdBy: "System"
      }
    ],
    statuses: []
  };
}

async function getBoardDocument() {
  const container = getContainer();
  try {
    const { resource } = await container.item(BOARD_ID, PARTITION).read();
    return { container, board: resource };
  } catch (error) {
    if (error.code !== 404) throw error;
    const board = seedBoard();
    try {
      await container.items.create(board);
      return { container, board };
    } catch (createError) {
      if (createError.code !== 409) throw createError;
      const { resource } = await container.item(BOARD_ID, PARTITION).read();
      return { container, board: resource };
    }
  }
}

function taskIsVisible(task, principal) {
  return task.active && (task.audience === "employee" ? hasRole(principal, "employee") : hasRole(principal, "support") || hasRole(principal, "itadmin"));
}

function publicTask(task, principal, admin = false) {
  return {
    id: task.id,
    title: task.title,
    audience: task.audience,
    active: task.active,
    complete: Boolean(task.completedBy?.[principal.id]),
    completionCount: admin ? Object.keys(task.completedBy || {}).length : undefined
  };
}

function boardFor(principal, view, board) {
  const requested = String(view || "employee").toLowerCase();
  if (requested === "admin") requireAdmin(principal);
  if (requested === "support" && !hasRole(principal, "support") && !hasRole(principal, "itadmin")) {
    throw new HttpError(403, "Support access is required.");
  }

  const tasks = requested === "admin"
    ? board.tasks.map((task) => publicTask(task, principal, true))
    : board.tasks.filter((task) => requested === "support" ? task.audience === "support" && taskIsVisible(task, principal) : task.audience === "employee" && taskIsVisible(task, principal)).map((task) => publicTask(task, principal));

  return {
    tasks,
    announcements: [...board.announcements].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12),
    knowledge: [...board.knowledge].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20),
    statuses: [...board.statuses].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30),
    statusOptions: STATUS_OPTIONS
  };
}

function cleanText(value, label, maxLength) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (text.length < 3 || text.length > maxLength) {
    throw new HttpError(400, `${label} must contain between 3 and ${maxLength} characters.`);
  }
  return text;
}

async function updateBoard(mutator) {
  const { container, board } = await getBoardDocument();
  mutator(board);
  const { resource } = await container.item(BOARD_ID, PARTITION).replace(board, { accessCondition: { type: "IfMatch", condition: board._etag } });
  return resource;
}

function findTask(board, taskId) {
  const task = board.tasks.find((item) => item.id === taskId);
  if (!task) throw new HttpError(404, "Task not found.");
  return task;
}

async function handleAction(principal, payload) {
  const action = String(payload.action || "");
  let updated;

  if (action === "toggleTask") {
    const taskId = String(payload.taskId || "");
    updated = await updateBoard((board) => {
      const task = findTask(board, taskId);
      if (!taskIsVisible(task, principal)) throw new HttpError(403, "This task is not assigned to your role.");
      task.completedBy = task.completedBy || {};
      if (task.completedBy[principal.id]) delete task.completedBy[principal.id];
      else task.completedBy[principal.id] = new Date().toISOString();
    });
    return boardFor(principal, payload.view === "support" ? "support" : "employee", updated);
  }

  if (action === "postStatus") {
    const message = String(payload.message || "");
    if (!STATUS_OPTIONS.includes(message)) throw new HttpError(400, "Choose one of the available status messages.");
    updated = await updateBoard((board) => {
      board.statuses.unshift({
        id: crypto.randomUUID(),
        authorId: principal.id,
        authorName: principal.name,
        message,
        createdAt: new Date().toISOString()
      });
      board.statuses = board.statuses.slice(0, 60);
    });
    return boardFor(principal, "employee", updated);
  }

  requireAdmin(principal);
  if (action === "addTask") {
    const title = cleanText(payload.title, "Task title", 120);
    const audience = payload.audience === "support" ? "support" : "employee";
    updated = await updateBoard((board) => {
      board.tasks.unshift({
        id: crypto.randomUUID(), title, audience, active: true, completedBy: {},
        createdAt: new Date().toISOString(), createdBy: principal.name
      });
    });
  } else if (action === "setTaskActive") {
    const taskId = String(payload.taskId || "");
    updated = await updateBoard((board) => {
      const task = findTask(board, taskId);
      task.active = Boolean(payload.active);
    });
  } else if (action === "addAnnouncement") {
    const title = cleanText(payload.title, "Headline", 90);
    const body = cleanText(payload.body, "Update", 500);
    updated = await updateBoard((board) => {
      board.announcements.unshift({ id: crypto.randomUUID(), title, body, createdAt: new Date().toISOString(), createdBy: principal.name });
      board.announcements = board.announcements.slice(0, 30);
    });
  } else if (action === "addKnowledge") {
    const title = cleanText(payload.title, "Article title", 90);
    const body = cleanText(payload.body, "Article body", 700);
    updated = await updateBoard((board) => {
      board.knowledge.unshift({ id: crypto.randomUUID(), title, body, createdAt: new Date().toISOString(), createdBy: principal.name });
      board.knowledge = board.knowledge.slice(0, 40);
    });
  } else {
    throw new HttpError(400, "Unknown workspace action.");
  }
  return boardFor(principal, "admin", updated);
}

app.http("workspace", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "workspace",
  handler: async (request) => {
    try {
      const principal = getPrincipal(request);
      if (request.method === "GET") {
        const { board } = await getBoardDocument();
        return json(200, boardFor(principal, request.query.get("view"), board));
      }
      const payload = await request.json();
      return json(200, await handleAction(principal, payload));
    } catch (error) {
      if (error instanceof HttpError) return json(error.status, { error: error.message });
      console.error("Workspace API error", error);
      return json(500, { error: safeWorkspaceError(error) });
    }
  }
});
