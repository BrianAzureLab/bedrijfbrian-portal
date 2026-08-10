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
        board = await postAction("toggleTask", { taskId: task.id, view: "support" });
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
    empty.textContent = "No Support tasks are assigned right now.";
    list.append(empty);
  }
}

function render() {
  document.querySelector("#open-tasks").textContent = String(board.tasks.filter((task) => !task.complete).length);
  renderTasks();
  renderBoardLists(board, {
    announcements: "#announcement-list",
    status: "#status-feed"
  });
}

async function start() {
  const principal = await getPrincipal();
  setShellIdentity(principal);
  try {
    board = await getBoard("support");
  } catch {
    setAppNotice("Shared Support data will appear after the database connection is completed.");
    board = { ...fallbackBoard, tasks: [] };
  }
  render();
}

start();
