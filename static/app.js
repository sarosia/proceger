import e from './e.js';

let actionInProgress = false;
let currentTaskStructureKey = '';

/**
 * Creates an element definition array for e().
 * @param {string} type Element tag name.
 * @param {Object} [attrs={}] Element attributes.
 * @param {Array|string} [children] Child elements or text.
 * @return {Array} Element definition.
 */
function el(type, attrs = {}, children) {
  return [type, attrs, children];
}

/**
 * Escapes HTML entities for safe rendering.
 * @param {string} str Input string.
 * @return {string} Escaped string.
 */
function escapeHtml(str) {
  return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
}

/**
 * Retrieves the currently saved UI state from URL hash or localStorage.
 * @return {{task: ?string, log: ?string}} Saved state.
 */
function getState() {
  let task = null;
  let log = null;

  if (window.location.hash) {
    try {
      const hash = window.location.hash.replace(/^#/, '');
      const params = new URLSearchParams(hash);
      task = params.get('task');
      log = params.get('log');
    } catch (err) {
      // Ignore URL parsing errors.
    }
  }

  if (!task) {
    try {
      task = localStorage.getItem('proceger:active_task');
    } catch (err) {
      // Ignore storage errors.
    }
  }

  if (!log && task) {
    try {
      log = localStorage.getItem('proceger:active_log:' + task);
    } catch (err) {
      // Ignore storage errors.
    }
  }

  return {task, log};
}

/**
 * Persists UI state to URL hash and localStorage.
 * @param {string} taskName Active task name.
 * @param {?string} logName Active log filename.
 */
function saveState(taskName, logName) {
  if (!taskName) return;

  try {
    localStorage.setItem('proceger:active_task', taskName);
    if (logName) {
      localStorage.setItem('proceger:active_log:' + taskName, logName);
    }
  } catch (err) {
    // Ignore storage errors.
  }

  const params = new URLSearchParams();
  params.set('task', taskName);
  if (logName) {
    params.set('log', logName);
  }

  const newHash = '#' + params.toString();
  if (window.location.hash !== newHash) {
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', newHash);
    } else {
      window.location.hash = newHash;
    }
  }
}

/**
 * Returns the CSS status modifier based on task status.
 * @param {string} status Task status.
 * @return {string} CSS class name.
 */
function getStatusClass(status) {
  const s = String(status || 'idle').toLowerCase();
  return `status-${s}`;
}

/**
 * Formats a start timestamp into a readable date string.
 * @param {?string} startTime ISO timestamp.
 * @return {string} Formatted string.
 */
function formatStartTime(startTime) {
  if (!startTime) return 'Not running';
  const date = new Date(startTime);
  if (isNaN(date.getTime())) return 'Not running';
  return date.toLocaleString();
}

/**
 * Parses and formats raw log content into rendered paragraph elements.
 * @param {string} logs Raw log text.
 * @return {Array} List of element definitions.
 */
function formatLogLines(logs) {
  if (!logs || !logs.trim()) {
    return [el('p', {'class': 'empty-log'}, 'No logs recorded yet.')];
  }
  return logs
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => {
        try {
          const log = JSON.parse(line);
          const time = log.timestamp ? `${escapeHtml(log.timestamp)} ` : '';
          const msg = escapeHtml(log.message || line);
          return el('p', {}, [
            el('span', {'class': 'log-time'}, time),
            el('span', {'class': 'log-msg'}, msg),
          ]);
        } catch (err) {
          const match = line.match(/^(\[\d{4}-\d{2}-\d{2}[^\]]+\])\s*(.*)$/);
          if (match) {
            return el('p', {}, [
              el('span', {'class': 'log-time'}, `${escapeHtml(match[1])} `),
              el('span', {'class': 'log-msg'}, escapeHtml(match[2])),
            ]);
          }
          return el('p', {}, escapeHtml(line));
        }
      });
}

/**
 * Triggers a task process control action (stop/restart).
 * @param {string} taskName Task name.
 * @param {string} action Action ('stop' or 'restart').
 */
async function handleTaskAction(taskName, action) {
  if (actionInProgress) return;
  actionInProgress = true;

  const stopBtn = document.getElementById(`task-stop-btn-${taskName}`);
  const restartBtn = document.getElementById(`task-restart-btn-${taskName}`);
  const stopText = document.getElementById(`task-stop-text-${taskName}`);
  const restartText = document.getElementById(`task-restart-text-${taskName}`);
  const statusBadge = document.getElementById(`task-status-badge-${taskName}`);
  const statusDot = document.getElementById(`task-status-dot-${taskName}`);
  const statusText = document.getElementById(`task-status-text-${taskName}`);

  if (stopBtn) stopBtn.disabled = true;
  if (restartBtn) restartBtn.disabled = true;

  if (action === 'stop') {
    if (stopText) stopText.textContent = 'Stopping...';
    if (statusBadge) {
      statusBadge.className = 'task-status-badge status-stopping';
    }
    if (statusDot) statusDot.className = 'status-dot status-stopping';
    if (statusText) statusText.textContent = 'STOPPING';
  } else {
    const isStopped =
        statusText && statusText.textContent.trim() === 'STOPPED';
    if (restartText) {
      restartText.textContent = isStopped ? 'Starting...' : 'Restarting...';
    }
    if (statusBadge) {
      statusBadge.className = 'task-status-badge status-starting';
    }
    if (statusDot) statusDot.className = 'status-dot status-starting';
    if (statusText) {
      statusText.textContent = isStopped ? 'STARTING' : 'RESTARTING';
    }
  }

  try {
    const res = await fetch(`/task/${encodeURIComponent(taskName)}/${action}`);
    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }
  } catch (err) {
    console.error(`Failed to ${action} task ${taskName}:`, err);
  } finally {
    actionInProgress = false;
    await render(true);
    setTimeout(() => render(false), 800);
    setTimeout(() => render(false), 2000);
  }
}

/**
 * Forces an immediate Git poll and update check for a task.
 * @param {string} taskName Task name.
 */
async function handlePollUpdates(taskName) {
  if (actionInProgress) return;
  actionInProgress = true;

  const pollBtn = document.getElementById(`task-poll-btn-${taskName}`);
  const pollText = document.getElementById(`task-poll-text-${taskName}`);
  if (pollBtn) pollBtn.disabled = true;
  if (pollText) pollText.textContent = 'Checking...';

  try {
    const res = await fetch(`/task/${encodeURIComponent(taskName)}/poll`);
    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    if (window.UIkit && window.UIkit.notification) {
      const isUpdated = Boolean(data.updated);
      window.UIkit.notification({
        message: isUpdated ?
          `New git updates found! Task "${taskName}" restarting.` :
          `Task "${taskName}" is already up to date.`,
        status: isUpdated ? 'success' : 'primary',
        pos: 'top-center',
        timeout: 3500,
      });
    }
  } catch (err) {
    console.error(`Failed to poll updates for ${taskName}:`, err);
    if (window.UIkit && window.UIkit.notification) {
      window.UIkit.notification({
        message: `Failed to check updates: ${err.message}`,
        status: 'danger',
        pos: 'top-center',
        timeout: 4000,
      });
    }
  } finally {
    actionInProgress = false;
    await render(true);
    setTimeout(() => render(false), 1000);
  }
}

/**
 * Opens modal for adding a new task.
 */
function openAddTaskModal() {
  const isEdit = document.getElementById('task-is-edit');
  const title = document.getElementById('modal-task-title');
  const nameInput = document.getElementById('task-input-name');
  const commandInput = document.getElementById('task-input-command');
  const pathInput = document.getElementById('task-input-path');
  const gitInput = document.getElementById('task-input-git');
  const envInput = document.getElementById('task-input-env');

  if (isEdit) isEdit.value = 'false';
  if (title) title.textContent = 'Add Task';
  if (nameInput) {
    nameInput.value = '';
    nameInput.disabled = false;
  }
  if (commandInput) commandInput.value = 'npm start';
  if (pathInput) pathInput.value = '';
  if (gitInput) gitInput.value = '';
  if (envInput) envInput.value = '';

  if (window.UIkit && window.UIkit.modal) {
    window.UIkit.modal('#modal-task').show();
  }
}

/**
 * Opens modal for editing an existing task's program and config.
 * @param {Object} task Task object to edit.
 */
function openEditTaskModal(task) {
  const isEdit = document.getElementById('task-is-edit');
  const title = document.getElementById('modal-task-title');
  const nameInput = document.getElementById('task-input-name');
  const commandInput = document.getElementById('task-input-command');
  const pathInput = document.getElementById('task-input-path');
  const gitInput = document.getElementById('task-input-git');
  const envInput = document.getElementById('task-input-env');

  if (isEdit) isEdit.value = 'true';
  if (title) title.textContent = `Edit Program: ${task.name}`;
  if (nameInput) {
    nameInput.value = task.name;
    nameInput.disabled = true;
  }
  if (commandInput) {
    commandInput.value = task.command || 'npm start';
  }
  if (pathInput) {
    pathInput.value = task.path || '';
  }
  if (gitInput) {
    gitInput.value = task.git || '';
  }
  if (envInput) {
    const envObj = task.env || {};
    envInput.value = Object.keys(envObj).length > 0 ?
      JSON.stringify(envObj, null, 2) : '';
  }

  if (window.UIkit && window.UIkit.modal) {
    window.UIkit.modal('#modal-task').show();
  }
}

/**
 * Submits the add/edit task form to the backend.
 * @param {Event} evt Submit event.
 */
async function handleTaskFormSubmit(evt) {
  evt.preventDefault();
  const isEdit = document.getElementById('task-is-edit').value === 'true';
  const name = document.getElementById('task-input-name').value.trim();
  const command = document.getElementById('task-input-command').value.trim();
  const pathInput = document.getElementById('task-input-path');
  const taskPath = pathInput ? pathInput.value.trim() : '';
  const git = document.getElementById('task-input-git').value.trim();
  const envRaw = document.getElementById('task-input-env').value.trim();
  const submitBtn = document.getElementById('task-modal-submit-btn');

  if (!git && !taskPath) {
    alert('Either Git repository URL or Directory Path is required.');
    return;
  }

  let env = {};
  if (envRaw) {
    try {
      env = JSON.parse(envRaw);
      if (typeof env !== 'object' || env === null || Array.isArray(env)) {
        throw new Error('Environment variables must be a JSON object.');
      }
    } catch (err) {
      alert('Invalid JSON in Environment Variables: ' + err.message);
      return;
    }
  }

  const payload = {
    name,
    command: command || 'npm start',
    git: git ? {url: git} : null,
    path: taskPath || null,
    env,
  };

  if (submitBtn) submitBtn.disabled = true;

  try {
    const endpoint = isEdit ?
      `/task/${encodeURIComponent(name)}` :
      '/task';
    const method = isEdit ? 'PUT' : 'POST';
    const res = await fetch(endpoint, {
      method,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `HTTP ${res.status}`);
    }

    if (window.UIkit && window.UIkit.modal) {
      window.UIkit.modal('#modal-task').hide();
    }
    if (window.UIkit && window.UIkit.notification) {
      window.UIkit.notification({
        message: isEdit ?
          `Task "${name}" updated in NotableDB and restarted!` :
          `Task "${name}" created and saved in NotableDB!`,
        status: 'success',
        pos: 'top-center',
        timeout: 3000,
      });
    }
    selectTask(name);
    await render(true);
  } catch (err) {
    console.error('Failed to save task:', err);
    alert(`Error saving task: ${err.message}`);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

/**
 * Deletes a task after confirmation.
 * @param {string} taskName Task name to delete.
 */
async function handleDeleteTask(taskName) {
  const confirmed = confirm(
      `Are you sure you want to remove task "${taskName}"?\n` +
      `This will stop the process and delete it from NotableDB storage.`,
  );
  if (!confirmed) return;

  try {
    const res = await fetch(`/task/${encodeURIComponent(taskName)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `HTTP ${res.status}`);
    }

    if (window.UIkit && window.UIkit.notification) {
      window.UIkit.notification({
        message: `Task "${taskName}" removed from NotableDB.`,
        status: 'primary',
        pos: 'top-center',
        timeout: 3000,
      });
    }

    const saved = getState();
    if (saved.task === taskName) {
      saveState('', null);
    }
    await render(true);
  } catch (err) {
    console.error(`Failed to delete task ${taskName}:`, err);
    alert(`Error deleting task: ${err.message}`);
  }
}

/**
 * Renders formatted log lines into a container element.
 * @param {HTMLElement} container Container element.
 * @param {string} logs Raw logs text.
 */
function renderLogLinesInto(container, logs) {
  container._rawLogs = logs;
  container.innerHTML = '';
  const defs = formatLogLines(logs);
  const fragment = document.createDocumentFragment();
  for (const def of defs) {
    fragment.appendChild(e(def));
  }
  container.appendChild(fragment);
}

/**
 * Extracts the last N lines from a raw logs string.
 * @param {string} logs Raw logs text.
 * @param {number} [count=10] Max number of lines to return.
 * @return {Array<string>} Array of raw line strings.
 */
function getLastLogLines(logs, count = 10) {
  if (!logs) return [];
  const lines = logs.split('\n');
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.slice(-count);
}

/**
 * Generates the URL to open full logs in a dedicated view or popup.
 * @param {string} taskName Task name.
 * @param {?string} logName Optional log filename.
 * @return {string} Relative URL for log.html.
 */
function getLogOpenUrl(taskName, logName) {
  const encTask = encodeURIComponent(taskName);
  if (!logName) {
    return `/log.html?task=${encTask}`;
  }
  return `/log.html?task=${encTask}&log=${encodeURIComponent(logName)}`;
}

/**
 * Selects an active task and renders the UI.
 * @param {string} taskName Task name to select.
 * @param {?string} [preferredLog] Optional log filename.
 */
function selectTask(taskName, preferredLog = null) {
  const currentScrollY = window.scrollY;
  saveState(taskName, preferredLog);
  render(false);
  if (window.scrollY !== currentScrollY) {
    window.scrollTo(window.scrollX, currentScrollY);
  }
}

/**
 * Selects an active log tab for a specific task and renders.
 * @param {string} taskName Task name.
 * @param {string} logName Log filename.
 */
function selectLog(taskName, logName) {
  const currentScrollY = window.scrollY;
  saveState(taskName, logName);
  render(false);
  if (window.scrollY !== currentScrollY) {
    window.scrollTo(window.scrollX, currentScrollY);
  }
}

/**
 * Copies log content to clipboard.
 * @param {string} logText Text to copy.
 * @param {HTMLElement} btn Target button for feedback.
 */
async function copyLogText(logText, btn) {
  try {
    await navigator.clipboard.writeText(logText);
    const orig = btn.innerText;
    btn.innerText = 'Copied!';
    setTimeout(() => {
      btn.innerText = orig;
    }, 1500);
  } catch (err) {
    console.error('Failed to copy logs:', err);
  }
}

/**
 * Renders the user profile avatar button with dropdown for sign out.
 * @param {Object} user User object from /auth/me.
 */
function renderUserProfile(user) {
  const container = document.getElementById('user-profile');
  if (!container) return;

  const displayName = user.name || user.email || 'User';
  const initial = (displayName || 'U').charAt(0).toUpperCase();
  const avatarHtml = user.picture ?
    `<img src="${escapeHtml(user.picture)}" alt="Profile" ` +
    `class="user-avatar-img" />` :
    `<div class="user-avatar-fallback">${escapeHtml(initial)}</div>`;

  container.innerHTML = `
    <div class="uk-inline">
      <button class="user-avatar-btn" type="button" ` +
        `aria-label="Account: ${escapeHtml(displayName)}" ` +
        `title="${escapeHtml(displayName)} (${escapeHtml(user.email)})">
        ${avatarHtml}
      </button>
      <div uk-dropdown="mode: click; pos: bottom-right; offset: 8" ` +
        `class="user-dropdown-card">
        <a href="/auth/logout" ` +
          `class="uk-button uk-button-small uk-width-1-1 ` +
          `user-dropdown-logout-btn">
          <span uk-icon="icon: sign-out; ratio: 0.8" ` +
            `class="uk-margin-small-right"></span>Sign Out
        </a>
      </div>
    </div>
  `;
}

/**
 * Loads current authenticated user profile from /auth/me.
 */
async function loadCurrentUser() {
  try {
    const res = await fetch('/auth/me');
    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }
    if (res.ok) {
      const data = await res.json();
      if (data.user) {
        renderUserProfile(data.user);
      }
    }
  } catch (err) {
    console.error('Failed to load current user:', err);
  }
}

/**
 * Fetches tasks and renders the UI while preserving user navigation scroll.
 * @param {boolean} [forceScroll=false] Whether to scroll active log to bottom.
 */
async function render(forceScroll = false) {
  let tasks = [];
  try {
    const res = await fetch('/task/list');
    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }
    tasks = await res.json();
  } catch (err) {
    console.error('Failed to fetch tasks:', err);
    return;
  }

  const headerStatus = document.getElementById('header-status');
  if (headerStatus) {
    const runningCount = tasks.filter((t) => t.status === 'RUNNING').length;
    let badgeClass = 'uk-label-warning';
    if (runningCount === tasks.length && tasks.length > 0) {
      badgeClass = 'uk-label-success';
    } else if (runningCount === 0 && tasks.length > 0) {
      badgeClass = 'uk-label-danger';
    }
    headerStatus.innerHTML =
      `<span class="uk-badge ${badgeClass}">` +
      `${runningCount}/${tasks.length} running</span>`;
  }

  if (tasks.length === 0) {
    currentTaskStructureKey = '';
    e('tasks-tab', {}, []);
    e('tasks-content', {}, [
      el('li', {'class': 'uk-active'}, [
        el('div', {'class': 'empty-state'}, [
          el('h3', {}, 'No tasks found'),
          el('p', {}, 'Add a program to run with NotableDB storage.'),
          el('button', {
            'class':
              'uk-button uk-button-primary uk-button-small uk-margin-top',
            'onclick': () => openAddTaskModal(),
          }, [
            el('span', {'uk-icon': 'icon: plus; ratio: 0.85'}),
            el('span', {'class': 'uk-margin-small-left'}, 'Add Task'),
          ]),
        ]),
      ]),
    ]);
    return;
  }

  const savedState = getState();
  let activeTaskIndex = tasks.findIndex((t) => t.name === savedState.task);
  if (activeTaskIndex === -1) {
    activeTaskIndex = 0;
  }
  const activeTask = tasks[activeTaskIndex];

  const finalLogFiles = Object.keys(activeTask.logs || {});
  let finalLog = null;
  if (savedState.log && finalLogFiles.includes(savedState.log)) {
    finalLog = savedState.log;
  } else if (finalLogFiles.length > 0) {
    finalLog = finalLogFiles[finalLogFiles.length - 1];
  }
  saveState(activeTask.name, finalLog);

  const structureKey = tasks.map((t) =>
    `${t.name}:${t.command || 'npm start'}:${Boolean(t.git)}:` +
    `${Object.keys(t.logs || {}).join(',')}`,
  ).join('|');

  if (currentTaskStructureKey === structureKey) {
    // Perform fast in-place update without tearing down DOM elements.
    for (let idx = 0; idx < tasks.length; idx++) {
      const task = tasks[idx];
      const isActive = idx === activeTaskIndex;
      const tabLi = document.getElementById(`task-tab-${task.name}`);
      if (tabLi) {
        tabLi.className = isActive ? 'uk-active' : '';
      }
      const dot = document.getElementById(`task-tab-dot-${task.name}`);
      if (dot) {
        dot.className = `status-dot ${getStatusClass(task.status)}`;
      }
    }

    for (let taskIdx = 0; taskIdx < tasks.length; taskIdx++) {
      const task = tasks[taskIdx];
      const isTaskActive = taskIdx === activeTaskIndex;
      const logFiles = Object.keys(task.logs || {});

      let activeLogIndex = -1;
      if (isTaskActive && finalLog) {
        activeLogIndex = logFiles.indexOf(finalLog);
      }
      if (activeLogIndex === -1) {
        activeLogIndex = logFiles.length > 0 ? logFiles.length - 1 : 0;
      }

      const taskContentLi = document.getElementById(
          `task-content-${task.name}`,
      );
      if (taskContentLi) {
        taskContentLi.className = isTaskActive ? 'uk-active' : '';
        taskContentLi.style.display = isTaskActive ? '' : 'none';
      }

      const statusClass = getStatusClass(task.status);
      const isRunning = task.status === 'RUNNING';
      const isBusy = task.status === 'STARTING' || task.status === 'STOPPING';

      const statusBadge = document.getElementById(
          `task-status-badge-${task.name}`,
      );
      if (statusBadge) {
        statusBadge.className = `task-status-badge ${statusClass}`;
      }
      const statusDot = document.getElementById(
          `task-status-dot-${task.name}`,
      );
      if (statusDot) {
        statusDot.className = `status-dot ${statusClass}`;
      }
      const statusText = document.getElementById(
          `task-status-text-${task.name}`,
      );
      if (statusText) {
        statusText.textContent = task.status || 'UNKNOWN';
      }

      const pidElm = document.getElementById(`task-pid-${task.name}`);
      if (pidElm) {
        pidElm.textContent = String(task.pid ?? -1);
      }

      const commandElm = document.getElementById(`task-command-${task.name}`);
      if (commandElm) {
        commandElm.textContent = task.command || 'npm start';
      }

      const pathElm = document.getElementById(`task-path-${task.name}`);
      if (pathElm) {
        pathElm.textContent = task.path || 'None';
      }

      const startTimeElm = document.getElementById(
          `task-starttime-${task.name}`,
      );
      if (startTimeElm) {
        startTimeElm.textContent = formatStartTime(task.startTime);
      }

      if (!actionInProgress && !task.isSystem) {
        const stopBtn = document.getElementById(
            `task-stop-btn-${task.name}`,
        );
        if (stopBtn) {
          stopBtn.disabled = !isRunning || isBusy;
          const stopText = document.getElementById(
              `task-stop-text-${task.name}`,
          );
          if (!stopText) {
            stopBtn.innerHTML =
                '<span uk-icon="icon: ban; ratio: 0.85"></span>' +
                `<span id="task-stop-text-${task.name}">Stop</span>`;
            if (window.UIkit && window.UIkit.icon) {
              window.UIkit.icon(stopBtn.querySelector('span[uk-icon]'));
            }
          } else {
            stopText.textContent = 'Stop';
          }
        }
        const restartBtn = document.getElementById(
            `task-restart-btn-${task.name}`,
        );
        if (restartBtn) {
          restartBtn.disabled = isBusy;
          const targetText = task.status === 'STOPPED' ? 'Start' : 'Restart';
          const restartText = document.getElementById(
              `task-restart-text-${task.name}`,
          );
          if (!restartText) {
            restartBtn.innerHTML =
                '<span uk-icon="icon: refresh; ratio: 0.85"></span>' +
                `<span id="task-restart-text-${task.name}">` +
                `${targetText}</span>`;
            if (window.UIkit && window.UIkit.icon) {
              window.UIkit.icon(restartBtn.querySelector('span[uk-icon]'));
            }
          } else {
            restartText.textContent = targetText;
          }
        }
        const pollBtn = document.getElementById(
            `task-poll-btn-${task.name}`,
        );
        if (pollBtn) {
          pollBtn.disabled = isBusy;
        }
      }

      const activeLog = logFiles[activeLogIndex] || null;
      const activeLogsText = activeLog ?
          ((task.logs || {})[activeLog] || '') : '';
      const totalLines = activeLogsText ?
          activeLogsText.split('\n').filter(Boolean).length : 0;
      const last10Lines = getLastLogLines(activeLogsText, 10);
      const last10Text = last10Lines.join('\n');

      for (let logIdx = 0; logIdx < logFiles.length; logIdx++) {
        const filename = logFiles[logIdx];
        const isLogActive = logIdx === activeLogIndex;
        const logTabLi = document.getElementById(
            `log-tab-item-${task.name}-${filename}`,
        );
        if (logTabLi) {
          logTabLi.className = isLogActive ? 'uk-active' : '';
        }
      }

      const countElm = document.getElementById(`log-count-${task.name}`);
      if (countElm) {
        const previewCount = last10Lines.length;
        countElm.textContent = activeLog ?
            `${activeLog} (last ${previewCount} of ${totalLines} entries)` :
            'No logs';
      }

      const openBtn = document.getElementById(`log-open-btn-${task.name}`);
      if (openBtn) {
        openBtn.href = getLogOpenUrl(task.name, activeLog);
      }

      const logBody = document.getElementById(`log-body-${task.name}`);
      if (logBody) {
        if (logBody._previewText !== last10Text) {
          logBody._previewText = last10Text;
          renderLogLinesInto(logBody, last10Text);
          logBody.scrollTop = logBody.scrollHeight;
        }
      }
    }
  } else {
    // Rebuild the complete task UI structure.
    currentTaskStructureKey = structureKey;

    e('tasks-tab', {}, tasks.map((task, idx) => {
      const isActive = idx === activeTaskIndex;
      const statusClass = getStatusClass(task.status);
      return el('li', {
        'id': `task-tab-${task.name}`,
        'class': isActive ? 'uk-active' : '',
      }, [
        el('a', {
          'href': '#',
          'onclick': (evt) => {
            evt.preventDefault();
            selectTask(task.name);
          },
        }, [
          el('span', {
            'id': `task-tab-dot-${task.name}`,
            'class': `status-dot ${statusClass}`,
          }),
          el('span', {'id': `task-tab-name-${task.name}`}, task.name),
        ].concat(task.isSystem ? [
          el('span', {
            'class': 'uk-badge',
            'style':
              'font-size: 10px; background: #6366f1; margin-left: 6px; ' +
              'padding: 1px 6px; border-radius: 4px; vertical-align: middle;',
          }, 'System'),
        ] : [])),
      ]);
    }));

    e('tasks-content', {}, tasks.map((task, taskIdx) => {
      const isTaskActive = taskIdx === activeTaskIndex;
      const logFiles = Object.keys(task.logs || {});

      let activeLogIndex = -1;
      if (isTaskActive && finalLog) {
        activeLogIndex = logFiles.indexOf(finalLog);
      }
      if (activeLogIndex === -1) {
        activeLogIndex = logFiles.length > 0 ? logFiles.length - 1 : 0;
      }

      const activeLog = logFiles[activeLogIndex] || null;
      const activeLogsText = activeLog ?
          ((task.logs || {})[activeLog] || '') : '';
      const totalLines = activeLogsText ?
          activeLogsText.split('\n').filter(Boolean).length : 0;
      const last10Lines = getLastLogLines(activeLogsText, 10);

      const statusClass = getStatusClass(task.status);
      const isRunning = task.status === 'RUNNING';
      const isBusy = task.status === 'STARTING' || task.status === 'STOPPING';

      return el('li', {
        'id': `task-content-${task.name}`,
        'class': isTaskActive ? 'uk-active' : '',
        'style': isTaskActive ? '' : 'display: none;',
      }, [
        el('div', {'class': 'task-card'}, [
          el('ul', {'class': 'task-info-list'}, [
            el('li', {'class': 'task-info-item'}, [
              el('span', {'class': 'task-info-label'}, 'Status'),
              el('span', {
                'id': `task-status-badge-${task.name}`,
                'class': `task-status-badge ${statusClass}`,
              }, [
                el('span', {
                  'id': `task-status-dot-${task.name}`,
                  'class': `status-dot ${statusClass}`,
                }),
                el('span', {
                  'id': `task-status-text-${task.name}`,
                }, task.status || 'UNKNOWN'),
              ]),
            ]),
            el('li', {'class': 'task-info-item'}, [
              el('span', {'class': 'task-info-label'}, 'Process ID'),
              el('span', {
                'id': `task-pid-${task.name}`,
                'class': 'task-info-value',
              }, String(task.pid ?? -1)),
            ]),
            el('li', {'class': 'task-info-item'}, [
              el('span', {'class': 'task-info-label'}, 'Program to Run'),
              el('span', {
                'id': `task-command-${task.name}`,
                'class': 'task-info-value',
                'style':
                  'font-family: "Roboto Mono", monospace; ' +
                  'font-weight: 500; color: #0284c7;',
              }, task.command || 'npm start'),
            ]),
            el('li', {'class': 'task-info-item'}, [
              el('span', {'class': 'task-info-label'}, 'Directory Path'),
              el('span', {
                'id': `task-path-${task.name}`,
                'class': 'task-info-value',
                'style':
                  'font-family: "Roboto Mono", monospace; font-size: 12px;',
              }, task.path || 'None'),
            ]),
            el('li', {'class': 'task-info-item'}, [
              el('span', {'class': 'task-info-label'}, 'Repository'),
              el('span', {'class': 'task-info-value'}, task.git || 'None'),
            ]),
            el('li', {'class': 'task-info-item'}, [
              el('span', {'class': 'task-info-label'}, 'Revision'),
              el('span', {
                'class': 'task-info-value',
              }, task.revision || 'None'),
            ]),
            el('li', {'class': 'task-info-item'}, [
              el('span', {'class': 'task-info-label'}, 'Start Time'),
              el(
                  'span',
                  {
                    'id': `task-starttime-${task.name}`,
                    'class': 'task-info-value',
                  },
                  formatStartTime(task.startTime),
              ),
            ]),
          ]),

          el('div', {'class': 'task-actions'}, task.isSystem ? [
            el('span', {
              'class': 'uk-text-meta',
              'style':
                'display: inline-flex; align-items: center; gap: 6px; ' +
                'font-weight: 500; color: #64748b; font-size: 13px;',
            }, [
              el('span', {'uk-icon': 'icon: server; ratio: 0.85'}),
              el('span', {}, 'Main Proceger daemon process (active)'),
            ]),
          ] : [
            el('button', {
              'id': `task-stop-btn-${task.name}`,
              'class': 'uk-button uk-button-danger task-btn',
              'disabled': !isRunning || isBusy,
              'onclick': () => {
                handleTaskAction(task.name, 'stop');
              },
            }, [
              el('span', {'uk-icon': 'icon: ban; ratio: 0.85'}),
              el('span', {'id': `task-stop-text-${task.name}`}, 'Stop'),
            ]),
            el('button', {
              'id': `task-restart-btn-${task.name}`,
              'class': 'uk-button uk-button-primary task-btn',
              'disabled': isBusy,
              'onclick': () => {
                handleTaskAction(task.name, 'restart');
              },
            }, [
              el('span', {'uk-icon': 'icon: refresh; ratio: 0.85'}),
              el('span', {
                'id': `task-restart-text-${task.name}`,
              }, task.status === 'STOPPED' ? 'Start' : 'Restart'),
            ]),
          ].concat(task.git ? [
            el('button', {
              'id': `task-poll-btn-${task.name}`,
              'class': 'uk-button uk-button-default task-btn',
              'title': 'Force poll Git repository for new commits and restart',
              'disabled': isBusy,
              'onclick': () => {
                handlePollUpdates(task.name);
              },
            }, [
              el('span', {'uk-icon': 'icon: cloud-download; ratio: 0.85'}),
              el('span', {'id': `task-poll-text-${task.name}`}, 'Force Poll'),
            ]),
          ] : []).concat([
            el('button', {
              'id': `task-edit-btn-${task.name}`,
              'class': 'uk-button uk-button-default task-btn',
              'title': 'Modify program command or settings',
              'onclick': () => {
                openEditTaskModal(task);
              },
            }, [
              el('span', {'uk-icon': 'icon: file-edit; ratio: 0.85'}),
              el('span', {}, 'Edit Program'),
            ]),
            el('button', {
              'id': `task-delete-btn-${task.name}`,
              'class': 'uk-button uk-button-default task-btn task-btn-delete',
              'title': 'Delete task from NotableDB',
              'onclick': () => {
                handleDeleteTask(task.name);
              },
            }, [
              el('span', {'uk-icon': 'icon: trash; ratio: 0.85'}),
              el('span', {}, 'Delete'),
            ]),
          ])),
        ]),

        el('div', {'class': 'log-preview-section uk-margin-small-top'}, [
          el('div', {'class': 'log-tab-wrapper'}, [
            el('ul', {
              'id': `task-${task.name}-logs-tab`,
              'class': 'uk-tab log-tab',
            },
            logFiles.map((filename, logIdx) => {
              const isLogActive = logIdx === activeLogIndex;
              return el('li', {
                'id': `log-tab-item-${task.name}-${filename}`,
                'class': isLogActive ? 'uk-active' : '',
              }, [
                el('a', {
                  'href': '#',
                  'onclick': (evt) => {
                    evt.preventDefault();
                    selectLog(task.name, filename);
                  },
                }, filename),
              ]);
            })),
          ]),

          el('div', {'class': 'logs-terminal'}, [
            el('div', {'class': 'logs-toolbar'}, [
              el('span', {
                'id': `log-count-${task.name}`,
                'class': 'logs-filename',
              }, activeLog ?
                  `${activeLog} (last ${last10Lines.length} of ` +
                  `${totalLines} entries)` :
                  'No logs'),
              el('div', {'class': 'logs-toolbar-actions'}, [
                el('button', {
                  'class': 'terminal-btn',
                  'onclick': (evt) => {
                    const bodyElm = document.getElementById(
                        `log-body-${task.name}`,
                    );
                    const text = bodyElm ? (bodyElm._previewText || '') : '';
                    copyLogText(text, evt.currentTarget);
                  },
                }, 'Copy Preview'),
                el('a', {
                  'id': `log-open-btn-${task.name}`,
                  'class': 'terminal-btn terminal-btn-primary',
                  'href': getLogOpenUrl(task.name, activeLog),
                  'target': '_blank',
                  'onclick': (evt) => {
                    evt.preventDefault();
                    window.open(
                        evt.currentTarget.href,
                        '_blank',
                        'width=1100,height=800,scrollbars=yes,resizable=yes',
                    );
                  },
                }, [
                  el('span', {'uk-icon': 'icon: expand; ratio: 0.8'}),
                  el('span', {}, 'Open Full Logs'),
                ]),
              ]),
            ]),
            el('div', {
              'id': `log-body-${task.name}`,
              'class': 'logs-body log-preview-body',
            }, []),
          ]),
        ]),
      ]);
    }));

    // Populate preview log bodies with the last 10 lines.
    for (const task of tasks) {
      const logFiles = Object.keys(task.logs || {});
      let activeLogIndex = -1;
      if (task.name === activeTask.name && finalLog) {
        activeLogIndex = logFiles.indexOf(finalLog);
      }
      if (activeLogIndex === -1) {
        activeLogIndex = logFiles.length > 0 ? logFiles.length - 1 : 0;
      }
      const activeLog = logFiles[activeLogIndex] || null;
      const activeLogsText = activeLog ?
          ((task.logs || {})[activeLog] || '') : '';
      const last10Text = getLastLogLines(activeLogsText, 10).join('\n');
      const logBody = document.getElementById(`log-body-${task.name}`);
      if (logBody) {
        logBody._previewText = last10Text;
        renderLogLinesInto(logBody, last10Text);
        logBody.scrollTop = logBody.scrollHeight;
      }
    }
  }

  if (window.UIkit && window.UIkit.update) {
    window.UIkit.update();
  }
}

window.onload = async function() {
  await loadCurrentUser();
  await render(true);

  window.addEventListener('hashchange', () => {
    const state = getState();
    if (state.task) {
      selectTask(state.task, state.log);
    }
  });

  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.classList.add('loading');
      try {
        await render(false);
      } finally {
        setTimeout(() => refreshBtn.classList.remove('loading'), 400);
      }
    });
  }

  const addTaskBtn = document.getElementById('add-task-btn');
  if (addTaskBtn) {
    addTaskBtn.addEventListener('click', () => {
      openAddTaskModal();
    });
  }

  const formTask = document.getElementById('form-task');
  if (formTask) {
    formTask.addEventListener('submit', handleTaskFormSubmit);
  }

  // Periodic polling for task status and log updates.
  setInterval(async () => {
    if (!actionInProgress && !document.hidden) {
      await render(false);
    }
  }, 4000);
};

