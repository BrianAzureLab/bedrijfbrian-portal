const tasks = [
  "Read the BedrijfBrian security basics",
  "Confirm your MFA registration works",
  "Check your assigned access role",
  "Complete your onboarding profile",
  "Review where to ask for IT support"
];

let storageKey = "bedrijfbrian-portal-tasks";

function readProgress() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || {};
  } catch {
    return {};
  }
}

function saveProgress(progress) {
  localStorage.setItem(storageKey, JSON.stringify(progress));
}

function updateMetrics(progress) {
  const complete = Object.values(progress).filter(Boolean).length;
  const percentage = Math.round((complete / tasks.length) * 100);
  document.querySelector("#progress-value").textContent = `${percentage}%`;
  document.querySelector("#progress-bar").style.width = `${percentage}%`;
  document.querySelector("#open-tasks").textContent = String(tasks.length - complete);
}

function renderTasks() {
  const progress = readProgress();
  const list = document.querySelector("#task-list");
  list.replaceChildren();

  tasks.forEach((task, index) => {
    const id = `task-${index}`;
    const row = document.createElement("div");
    row.className = `task${progress[id] ? " done" : ""}`;
    row.innerHTML = `<input id="${id}" type="checkbox" ${progress[id] ? "checked" : ""}><label for="${id}">${task}</label>`;
    const checkbox = row.querySelector("input");
    checkbox.addEventListener("change", () => {
      const current = readProgress();
      current[id] = checkbox.checked;
      saveProgress(current);
      renderTasks();
    });
    list.append(row);
  });
  updateMetrics(progress);
}

function renderRolePanel(roles) {
  const panel = document.querySelector("#role-panel");
  if (roles.includes("itadmin")) {
    panel.classList.remove("hidden");
    panel.innerHTML = "<h3>IT view enabled</h3><p>You have access to the future IT administration area. In this lab, it confirms that your IT role assignment works.</p>";
  } else if (roles.includes("support")) {
    panel.classList.remove("hidden");
    panel.innerHTML = "<h3>Support view enabled</h3><p>You have access to the future support area. In this lab, it confirms that your Support role assignment works.</p>";
  }
}

async function loadIdentity() {
  try {
    const response = await fetch("/.auth/me");
    const payload = await response.json();
    const principal = payload.clientPrincipal;
    if (!principal) return;

    const name = principal.userDetails || "employee";
    storageKey = `bedrijfbrian-portal-tasks-${name.toLowerCase()}`;
    const firstName = name.split(/[.@ ]/)[0] || "employee";
    const roles = principal.userRoles || [];

    document.querySelector("#user-name").textContent = name;
    document.querySelector("#first-name").textContent = firstName;
    document.querySelector("#role-badge").textContent = roles.includes("itadmin")
      ? "IT administrator"
      : roles.includes("support")
        ? "Support"
        : "Employee";
    renderRolePanel(roles);
  } catch {
    document.querySelector("#user-name").textContent = "Work account";
  }
  renderTasks();
}

document.querySelector("#reset-tasks").addEventListener("click", () => {
  localStorage.removeItem(storageKey);
  renderTasks();
});

loadIdentity();
