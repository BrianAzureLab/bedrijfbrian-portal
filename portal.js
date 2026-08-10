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

function renderTasks() {
  const list = document.querySelector("#task-list");
  list.replaceChildren();

  board.tasks.forEach((task) => {
    const row = document.createElement("label");
    row.className = `task${task.complete ? " done" : ""}`;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = task.complete;
    input.addEventListener("change", async () => {
      input.disabled = true;
      try {
        board = await postAction("toggleTask", { taskId: task.id });
        render();
      } catch {
        input.checked = !input.checked;
        input.disabled = false;
        setAppNotice("Your task could not be saved. Try again in a moment.");
      }
    });
    const text = document.createElement("span");
    text.textContent = task.title;
    row.append(input, text);
    list.append(row);
  });

  if (!board.tasks.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No employee tasks are assigned right now.";
    list.append(empty);
  }
}

function renderMetrics() {
  const total = board.tasks.length;
  const completed = board.tasks.filter((task) => task.complete).length;
  const percentage = total ? Math.round((completed / total) * 100) : 0;
  document.querySelector("#progress-value").textContent = `${percentage}%`;
  document.querySelector("#progress-bar").style.width = `${percentage}%`;
  document.querySelector("#open-tasks").textContent = String(total - completed);
}

function renderStatus() {
  const options = document.querySelector("#status-options");
  options.replaceChildren();
  board.statusOptions.forEach((message) => {
    const button = document.createElement("button");
    button.className = "status-button";
    button.type = "button";
    button.textContent = message;
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        board = await postAction("postStatus", { message });
        render();
      } catch {
        button.disabled = false;
        setAppNotice("Your status could not be shared. Try again in a moment.");
      }
    });
    options.append(button);
  });
}

function render() {
  renderMetrics();
  renderTasks();
  renderBoardLists(board, {
    announcements: "#announcement-list",
    knowledge: "#knowledge-list",
    status: "#status-feed"
  });
  renderStatus();
}

async function start() {
  const principal = await getPrincipal();
  setShellIdentity(principal);
  try {
    board = await getBoard("employee");
  } catch {
    setAppNotice("Shared portal data will appear after the database connection is completed.");
  }
  render();
}

start();
