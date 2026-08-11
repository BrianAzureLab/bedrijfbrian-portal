import {
  fallbackBoard,
  getBoard,
  getPrincipal,
  postAction,
  renderBoardLists,
  setAppNotice,
  setShellIdentity
} from "/app.js";

let board = fallbackBoard;

function renderMetrics() {
  document.querySelector("#active-tasks").textContent = String(board.tasks.filter((task) => task.active).length);
  document.querySelector("#announcement-count").textContent = String(board.announcements.length);
  document.querySelector("#knowledge-count").textContent = String(board.knowledge.length);
}

function renderTasks() {
  const list = document.querySelector("#admin-task-list");
  list.replaceChildren();
  board.tasks.forEach((task) => {
    const row = document.createElement("article");
    row.className = "admin-task";
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = task.title;
    const meta = document.createElement("span");
    meta.textContent = `${task.audience === "support" ? "Support team" : "All employees"} · ${task.completionCount || 0} completed`;
    copy.append(title, meta);
    const button = document.createElement("button");
    button.className = "text-button";
    button.type = "button";
    button.textContent = task.active ? "Close task" : "Reopen task";
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        board = await postAction("setTaskActive", { taskId: task.id, active: !task.active });
        render();
      } catch {
        button.disabled = false;
        setAppNotice("That task could not be updated. Try again in a moment.");
      }
    });
    row.append(copy, button);
    list.append(row);
  });
}

function render() {
  renderMetrics();
  renderTasks();
  renderBoardLists(board, { status: "#status-feed" });
}

async function submitForm(event, action, fields) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const payload = Object.fromEntries(fields.map((field) => [field, form.elements[field].value]));
    board = await postAction(action, payload);
    form.reset();
    render();
    setAppNotice("Saved and shared with the right team.");
  } catch {
    setAppNotice("That change could not be saved. Check the database setup and try again.");
  } finally {
    button.disabled = false;
  }
}

function wireForms() {
  document.querySelector("#task-form").addEventListener("submit", (event) => submitForm(event, "addTask", ["title", "audience"]));
  document.querySelector("#announcement-form").addEventListener("submit", (event) => submitForm(event, "addAnnouncement", ["title", "body"]));
  document.querySelector("#knowledge-form").addEventListener("submit", (event) => submitForm(event, "addKnowledge", ["title", "body"]));
}

async function start() {
  const principal = await getPrincipal();
  setShellIdentity(principal);
  wireForms();
  try {
    board = await getBoard("admin");
  } catch (error) {
    setAppNotice(error.message);
  }
  render();
}

start();
