export const fallbackBoard = {
  tasks: [
    { id: "demo-security", title: "Read the BedrijfBrian security basics", audience: "employee", active: true, complete: false, completionCount: 0 },
    { id: "demo-mfa", title: "Confirm your MFA registration works", audience: "employee", active: true, complete: false, completionCount: 0 }
  ],
  announcements: [
    { title: "Portal setup in progress", body: "Company updates will be managed by IT after the shared data store is connected." }
  ],
  knowledge: [
    { title: "Need support?", body: "Use the Support desk once it is assigned to your role." },
    { title: "Keep your account secure", body: "Use MFA and never share your password." }
  ],
  statuses: [],
  statusOptions: ["Working on it", "Need help", "Ready for review", "Completed"]
};

export async function getPrincipal() {
  try {
    const response = await fetch("/.auth/me", { cache: "no-store" });
    const payload = await response.json();
    return payload.clientPrincipal || { userDetails: "Work account", userRoles: [] };
  } catch {
    return { userDetails: "Work account", userRoles: [] };
  }
}

export function hasRole(principal, role) {
  return (principal.userRoles || []).includes(role);
}

export function setShellIdentity(principal) {
  const name = principal.userDetails || "Work account";
  const roles = principal.userRoles || [];
  const firstName = name.split(/[.@ ]/)[0] || "employee";
  const roleName = hasRole(principal, "itadmin")
    ? "IT administrator"
    : hasRole(principal, "support")
      ? "Support"
      : "Employee";

  const userName = document.querySelector("#user-name");
  const first = document.querySelector("#first-name");
  const badge = document.querySelector("#role-badge");
  if (userName) userName.textContent = name;
  if (first) first.textContent = firstName;
  if (badge) badge.textContent = roleName;
  document.querySelector("#support-nav")?.classList.toggle("hidden", !hasRole(principal, "support") && !hasRole(principal, "itadmin"));
  document.querySelector("#admin-nav")?.classList.toggle("hidden", !hasRole(principal, "itadmin"));
}

export function setAppNotice(message) {
  const notice = document.querySelector("#app-notice");
  if (!notice) return;
  notice.textContent = message;
  notice.classList.remove("hidden");
}

export async function getBoard(view) {
  const response = await fetch(`/api/workspace?view=${encodeURIComponent(view)}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load workspace");
  return response.json();
}

export async function postAction(action, data = {}) {
  const response = await fetch("/api/workspace", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, ...data })
  });
  if (!response.ok) throw new Error("Could not update workspace");
  return response.json();
}

function makeTextCard(item, type) {
  const article = document.createElement("article");
  article.className = `${type}-card`;
  const title = document.createElement("h3");
  title.textContent = item.title;
  const body = document.createElement("p");
  body.textContent = item.body;
  article.append(title, body);
  return article;
}

function formatWhen(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function renderStatusFeed(items) {
  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    const row = document.createElement("article");
    row.className = "status-row";
    const name = document.createElement("strong");
    name.textContent = item.authorName;
    const text = document.createElement("span");
    text.textContent = item.message;
    const when = document.createElement("small");
    when.textContent = formatWhen(item.createdAt);
    row.append(name, text, when);
    fragment.append(row);
  });
  return fragment;
}

export function renderBoardLists(board, selectors) {
  if (selectors.announcements) {
    const target = document.querySelector(selectors.announcements);
    target?.replaceChildren(...board.announcements.map((item) => makeTextCard(item, "announcement")));
  }
  if (selectors.knowledge) {
    const target = document.querySelector(selectors.knowledge);
    target?.replaceChildren(...board.knowledge.map((item) => makeTextCard(item, "knowledge")));
  }
  if (selectors.status) {
    const target = document.querySelector(selectors.status);
    target?.replaceChildren(renderStatusFeed(board.statuses || []));
    if (target && !(board.statuses || []).length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No team status updates yet.";
      target.append(empty);
    }
  }
}
