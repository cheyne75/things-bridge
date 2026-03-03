const TOKEN_KEY = "things_bridge_token";

let currentTasks = [];
let isDragging = false;
let draggedElement = null;

// --- Token management ---

function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

function saveToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
}

function showTokenPrompt() {
    document.getElementById("token-prompt").classList.remove("hidden");
    document.getElementById("main").classList.add("hidden");
    document.getElementById("token-input").value = "";
    document.getElementById("token-input").focus();
}

function showMain() {
    document.getElementById("token-prompt").classList.add("hidden");
    document.getElementById("main").classList.remove("hidden");
}

function showTokenError(msg) {
    const el = document.getElementById("token-error");
    el.textContent = msg;
    el.classList.remove("hidden");
}

function hideTokenError() {
    const el = document.getElementById("token-error");
    el.textContent = "";
    el.classList.add("hidden");
}

// --- API client ---

async function api(method, path, body = null) {
    const headers = {
        "X-Things-Token": getToken(),
        "Content-Type": "application/json",
    };
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`/api${path}`, opts);
    if (res.status === 401) {
        showTokenPrompt();
        throw new Error("Unauthorized");
    }
    if (!res.ok) {
        const detail = await res.text();
        throw new Error(`API error ${res.status}: ${detail}`);
    }
    return res.json();
}

// --- Rendering ---

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function renderTasks(tasks) {
    const list = document.getElementById("task-list");
    const empty = document.getElementById("empty-state");
    const syncBar = document.getElementById("sync-bar");

    if (tasks.length === 0) {
        list.innerHTML = "";
        empty.classList.remove("hidden");
        syncBar.classList.add("hidden");
        return;
    }

    empty.classList.add("hidden");
    // Show sync bar when there are incomplete tasks
    const hasIncomplete = tasks.some((t) => t.status === "incomplete");
    if (hasIncomplete) {
        syncBar.classList.remove("hidden");
    } else {
        syncBar.classList.add("hidden");
    }

    const incomplete = tasks.filter((t) => t.status === "incomplete");
    const completed = tasks.filter((t) => t.status === "completed");

    let html = "";

    for (const task of incomplete) {
        html += taskHtml(task, false);
    }

    if (completed.length > 0 && incomplete.length > 0) {
        html += '<div class="completed-divider"></div>';
    }

    for (const task of completed) {
        html += taskHtml(task, true);
    }

    list.innerHTML = html;
    attachTaskListeners();
}

function taskHtml(task, isCompleted) {
    const checkedAttr = isCompleted ? "checked disabled" : "";
    const completedClass = isCompleted ? " completed" : "";
    const editable = isCompleted ? "false" : "true";
    const notesText = escapeHtml(task.notes || "");
    const dragHandle = isCompleted ? "" : '<div class="drag-handle">&#8942;&#8942;</div>';

    return `
        <div class="task${completedClass}" data-uuid="${task.uuid}">
            ${dragHandle}
            <div class="task-checkbox">
                <input type="checkbox" ${checkedAttr} data-uuid="${task.uuid}">
            </div>
            <div class="task-content">
                <div class="task-title">${escapeHtml(task.title)}</div>
                <div class="task-notes" contenteditable="${editable}" data-uuid="${task.uuid}" data-original="${notesText}">${notesText}</div>
            </div>
        </div>
    `;
}

function attachTaskListeners() {
    // Checkbox listeners
    document.querySelectorAll('.task-checkbox input[type="checkbox"]:not([disabled])').forEach((cb) => {
        cb.addEventListener("change", () => handleComplete(cb.dataset.uuid, cb));
    });

    // Notes blur listeners
    document.querySelectorAll('.task-notes[contenteditable="true"]').forEach((el) => {
        el.addEventListener("blur", () => handleNotesBlur(el));
    });

    // Drag-and-drop: only initiate drag from the handle
    document.querySelectorAll(".task:not(.completed)").forEach((taskEl) => {
        taskEl.addEventListener("mousedown", (e) => {
            if (e.target.closest(".drag-handle")) {
                taskEl.setAttribute("draggable", "true");
            } else {
                taskEl.removeAttribute("draggable");
            }
        });

        taskEl.addEventListener("dragstart", handleDragStart);
        taskEl.addEventListener("dragend", handleDragEnd);
        taskEl.addEventListener("dragover", handleDragOver);
        taskEl.addEventListener("dragleave", handleDragLeave);
        taskEl.addEventListener("drop", handleDrop);
    });
}

// --- Drag and drop ---

function handleDragStart(e) {
    isDragging = true;
    draggedElement = this;
    this.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", this.dataset.uuid);
}

function handleDragEnd() {
    isDragging = false;
    if (draggedElement) draggedElement.classList.remove("dragging");
    draggedElement = null;
    document.querySelectorAll(".drop-indicator").forEach((el) => el.remove());
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (this === draggedElement || this.classList.contains("completed")) return;

    // Remove existing indicators
    document.querySelectorAll(".drop-indicator").forEach((el) => el.remove());

    const rect = this.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const indicator = document.createElement("div");
    indicator.className = "drop-indicator";

    if (e.clientY < midY) {
        this.parentNode.insertBefore(indicator, this);
    } else {
        this.parentNode.insertBefore(indicator, this.nextSibling);
    }
}

function handleDragLeave() {
    // Indicators cleaned up in dragover/drop/dragend
}

function handleDrop(e) {
    e.preventDefault();
    if (this === draggedElement || this.classList.contains("completed")) return;

    const rect = this.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;

    if (e.clientY < midY) {
        this.parentNode.insertBefore(draggedElement, this);
    } else {
        this.parentNode.insertBefore(draggedElement, this.nextSibling);
    }

    document.querySelectorAll(".drop-indicator").forEach((el) => el.remove());
    saveNewOrder();
}

function saveNewOrder() {
    const taskEls = document.querySelectorAll(".task:not(.completed)");
    const order = Array.from(taskEls).map((el) => el.dataset.uuid);
    api("PUT", "/order", { order }).catch((err) => {
        console.error("Failed to save order:", err);
    });
}

// --- Actions ---

async function handleComplete(uuid, checkbox) {
    checkbox.classList.add("completing");
    checkbox.disabled = true;
    try {
        await api("POST", `/tasks/${uuid}/complete`);
        setTimeout(fetchAndRender, 800);
    } catch (e) {
        checkbox.checked = false;
        checkbox.disabled = false;
        checkbox.classList.remove("completing");
        console.error("Complete failed:", e);
    }
}

async function handleNotesBlur(el) {
    const uuid = el.dataset.uuid;
    const newNotes = el.textContent;
    const original = el.dataset.original;

    if (newNotes === original) return;

    try {
        await api("PATCH", `/tasks/${uuid}`, { notes: newNotes });
        el.dataset.original = escapeHtml(newNotes);
        setTimeout(fetchAndRender, 800);
    } catch (e) {
        console.error("Update notes failed:", e);
    }
}

async function handleCreateTask() {
    const input = document.getElementById("new-task-title");
    const title = input.value.trim();
    if (!title) return;

    const btn = document.getElementById("create-task-btn");
    btn.disabled = true;

    try {
        await api("POST", "/tasks", { title });
        input.value = "";
        toggleAddForm(false);
        setTimeout(fetchAndRender, 800);
    } catch (e) {
        console.error("Create task failed:", e);
    } finally {
        btn.disabled = false;
    }
}

function toggleAddForm(show) {
    const form = document.getElementById("add-task-form");
    if (show) {
        form.classList.remove("hidden");
        document.getElementById("new-task-title").focus();
    } else {
        form.classList.add("hidden");
        document.getElementById("new-task-title").value = "";
    }
}

async function handleSyncOrder() {
    const btn = document.getElementById("sync-order-btn");
    btn.disabled = true;
    btn.textContent = "Syncing...";
    try {
        await api("DELETE", "/order");
        await fetchAndRender();
    } catch (e) {
        console.error("Sync order failed:", e);
    } finally {
        btn.disabled = false;
        btn.textContent = "↻ Sync order from Things";
    }
}

// --- Fetch and render ---

async function fetchAndRender() {
    if (isDragging) return;
    try {
        const data = await api("GET", "/today");
        currentTasks = data.tasks;
        renderTasks(currentTasks);
    } catch (e) {
        if (e.message !== "Unauthorized") {
            console.error("Fetch failed:", e);
        }
    }
}

// --- Init ---

function init() {
    // Token prompt
    document.getElementById("token-save").addEventListener("click", async () => {
        const token = document.getElementById("token-input").value.trim();
        if (!token) return;

        hideTokenError();
        const btn = document.getElementById("token-save");
        btn.disabled = true;
        btn.textContent = "Connecting...";

        try {
            const testRes = await fetch("/api/today", {
                headers: { "X-Things-Token": token },
            });
            if (testRes.status === 401) {
                showTokenError("Invalid token. Please check and try again.");
                return;
            }
            if (!testRes.ok) {
                showTokenError("Server error. Please try again.");
                return;
            }
            saveToken(token);
            showMain();
            fetchAndRender();
        } catch (e) {
            showTokenError("Cannot reach server.");
        } finally {
            btn.disabled = false;
            btn.textContent = "Connect";
        }
    });

    document.getElementById("token-input").addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            document.getElementById("token-save").click();
        }
    });

    // Add task
    document.getElementById("add-task-btn").addEventListener("click", () => {
        const form = document.getElementById("add-task-form");
        toggleAddForm(form.classList.contains("hidden"));
    });

    document.getElementById("create-task-btn").addEventListener("click", handleCreateTask);
    document.getElementById("cancel-task-btn").addEventListener("click", () => toggleAddForm(false));
    document.getElementById("sync-order-btn").addEventListener("click", handleSyncOrder);

    document.getElementById("new-task-title").addEventListener("keydown", (e) => {
        if (e.key === "Enter") handleCreateTask();
        if (e.key === "Escape") toggleAddForm(false);
    });

    // Check for existing token
    if (getToken()) {
        showMain();
        fetchAndRender();
    }

    // Auto-refresh every 60s
    setInterval(fetchAndRender, 60000);

    // Refresh on window focus
    window.addEventListener("focus", fetchAndRender);
}

document.addEventListener("DOMContentLoaded", init);
