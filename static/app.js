import e from './e.js';
import {escapeHtml, toast} from './apper-ui.js';

let actionInProgress = false;
let allTasksData = [];
let currentSearchQuery = '';
let currentStatusFilter = 'all';

const logPreviewCache = new Map();
const inFlightLogFetches = new Map();

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
 * Retrieves the currently saved UI state from URL hash or localStorage.
 * @return {{task: ?string, log: ?string}} Saved state.
 */
function getState() {
  let task = null;
  let log = null;

  if (window.location.hash) {
    try {
      const hash = window.location.hash.replace(/^#/, '').trim();
      if (hash === '' || hash === 'overview') {
        return {task: null, log: null};
      }
      if (hash.includes('=')) {
        const params = new URLSearchParams(hash);
        task = params.get('task');
        log = params.get('log');
      } else {
        task = decodeURIComponent(hash);
      }
    } catch (_) {
      // Ignore URL parsing errors.
    }
  }

  if (task && !log) {
    try {
      log = localStorage.getItem('proceger:active_log:' + task);
    } catch (_) {
      // Ignore storage errors.
    }
  }

  return {task, log};
}

/**
 * Persists UI state to URL hash and localStorage.
 * @param {?string} taskName Active task name or null for overview.
 * @param {?string} logName Active log filename.
 */
function saveState(taskName, logName) {
  if (!taskName) {
    try {
      localStorage.removeItem('proceger:active_task');
    } catch (_) {
      // Ignore storage errors.
    }
    if (window.location.hash && window.location.hash !== '#overview') {
      if (window.history && window.history.replaceState) {
        const cleanUrl =
          window.location.pathname + window.location.search;
        window.history.replaceState(null, '', cleanUrl);
      } else {
        window.location.hash = '';
      }
    }
    return;
  }

  try {
    localStorage.setItem('proceger:active_task', taskName);
    if (logName) {
      localStorage.setItem('proceger:active_log:' + taskName, logName);
    }
  } catch (_) {
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
          const fileTag = log.file ?
            el('span', {'class': 'log-tag-badge'}, escapeHtml(log.file)) : null;
          const msg = escapeHtml(log.message !== undefined ? log.message : line);
          const children = [
            time ? el('span', {'class': 'log-time'}, time) : null,
            fileTag,
            el('span', {'class': 'log-msg'}, msg),
          ].filter(Boolean);
          return el('p', {}, children);
        } catch (_) {
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
 * Generates the URL to open full logs in a dedicated view.
 * @param {string} taskName Task name.
 * @param {?string} logName Optional log filename.
 * @return {string} Relative URL for log.html.
 */
function getLogOpenUrl(taskName, logName) {
  const encTask = encodeURIComponent(taskName);
  if (!logName || logName === '__all__.log') {
    return `/log.html?task=${encTask}&log=__all__.log`;
  }
  return `/log.html?task=${encTask}&log=${encodeURIComponent(logName)}`;
}

/**
 * Returns available log filenames for a task.
 * @param {Object} task Task object.
 * @return {Array<string>} List of log filenames.
 */
function getTaskLogFiles(task) {
  if (!task || !task.logs) return [];
  if (Array.isArray(task.logs)) return task.logs;
  return Object.keys(task.logs);
}

/**
 * Fetches log preview data for a specific task and filename.
 * @param {string} taskName Task name.
 * @param {string} logFile Log filename.
 * @return {Promise<Object|null>} Log data object.
 */
async function fetchLogPreview(taskName, logFile) {
  if (!taskName || !logFile) return null;
  const key = `${taskName}:${logFile}`;
  if (inFlightLogFetches.has(key)) {
    return inFlightLogFetches.get(key);
  }
  const promise = (async () => {
    try {
      const res = await fetch(
          `/task/${encodeURIComponent(taskName)}/log/` +
          `${encodeURIComponent(logFile)}?tail=15`,
      );
      if (res.status === 401) {
        window.location.href = '/login';
        return null;
      }
      if (!res.ok) return null;
      const data = await res.json();
      logPreviewCache.set(key, data);
      return data;
    } catch (err) {
      console.error(`Failed to fetch log for ${taskName}/${logFile}:`, err);
      return null;
    } finally {
      inFlightLogFetches.delete(key);
    }
  })();
  inFlightLogFetches.set(key, promise);
  return promise;
}

/**
 * Applies log preview data to the task's log terminal.
 * @param {string} taskName Task name.
 * @param {?string} activeLog Active log filename.
 */
async function applyLogPreview(taskName, activeLog) {
  if (!taskName || !activeLog) {
    const countElm = document.getElementById(`log-count-${taskName}`);
    if (countElm) countElm.textContent = 'No logs';
    const logBody = document.getElementById(`log-body-${taskName}`);
    if (logBody) renderLogLinesInto(logBody, '');
    return;
  }
  const key = `${taskName}:${activeLog}`;
  const cached = logPreviewCache.get(key);
  const countElm = document.getElementById(`log-count-${taskName}`);
  const logBody = document.getElementById(`log-body-${taskName}`);
  const openBtn = document.getElementById(`log-open-btn-${taskName}`);

  const displayLogTitle = activeLog === '__all__.log' ?
    'All Logs (Merged)' :
    activeLog;

  if (openBtn) {
    openBtn.href = getLogOpenUrl(taskName, activeLog);
  }

  if (cached) {
    const total = cached.totalLines ?? 0;
    const last10 = getLastLogLines(cached.content || '', 10);
    if (countElm) {
      countElm.textContent =
        `${displayLogTitle} (last ${last10.length} of ${total} entries)`;
    }
    const last10Text = last10.join('\n');
    if (logBody && logBody._previewText !== last10Text) {
      logBody._previewText = last10Text;
      renderLogLinesInto(logBody, last10Text);
      logBody.scrollTop = logBody.scrollHeight;
    }
  } else if (logBody && !logBody._previewText) {
    if (countElm) {
      countElm.textContent = `${displayLogTitle} (loading...)`;
    }
    logBody.innerHTML = '<p class="empty-log">Loading log preview...</p>';
  }

  const data = await fetchLogPreview(taskName, activeLog);
  if (!data) return;

  const currentSaved = getState();
  if (currentSaved.task && currentSaved.task !== taskName) {
    return;
  }

  const freshTotal = data.totalLines ?? 0;
  const freshLast10 = getLastLogLines(data.content || '', 10);
  const freshCountElm = document.getElementById(`log-count-${taskName}`);
  if (freshCountElm) {
    freshCountElm.textContent =
      `${displayLogTitle} (last ${freshLast10.length} of ${freshTotal} entries)`;
  }
  const freshText = freshLast10.join('\n');
  const freshBody = document.getElementById(`log-body-${taskName}`);
  if (freshBody && freshBody._previewText !== freshText) {
    freshBody._previewText = freshText;
    renderLogLinesInto(freshBody, freshText);
    freshBody.scrollTop = freshBody.scrollHeight;
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
 * Selects an active task and renders the UI.
 * @param {?string} taskName Task name to select or null for overview.
 * @param {?string} [preferredLog] Optional log filename.
 */
function selectTask(taskName, preferredLog = null) {
  saveState(taskName, preferredLog);
  render();
  if (taskName && preferredLog) {
    applyLogPreview(taskName, preferredLog);
  }
}

/**
 * Selects an active log tab for a specific task and renders.
 * @param {string} taskName Task name.
 * @param {string} logName Log filename.
 */
function selectLog(taskName, logName) {
  saveState(taskName, logName);
  render();
  applyLogPreview(taskName, logName);
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
 * Triggers a task process control action (stop/restart).
 * @param {string} taskName Task name.
 * @param {string} action Action ('stop' or 'restart').
 */
async function handleTaskAction(taskName, action) {
  if (actionInProgress) return;
  actionInProgress = true;

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
    await render();
    setTimeout(() => render(), 800);
    setTimeout(() => render(), 2000);
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

    const isUpdated = Boolean(data.updated);
    toast(
        isUpdated ?
          `New git updates found! Task "${taskName}" restarting.` :
          `Task "${taskName}" is already up to date.`,
        isUpdated ? 'success' : 'primary',
        {pos: 'top-center', timeout: 3500},
    );
  } catch (err) {
    console.error(`Failed to poll updates for ${taskName}:`, err);
    toast(
        `Failed to check updates: ${err.message}`,
        'danger',
        {pos: 'top-center', timeout: 4000},
    );
  } finally {
    actionInProgress = false;
    await render();
    setTimeout(() => render(), 1000);
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
    toast(
        isEdit ?
          `Task "${name}" updated and restarted!` :
          `Task "${name}" created successfully!`,
        'success',
        {pos: 'top-center', timeout: 3000},
    );
    selectTask(name);
    await render();
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

    toast(
        `Task "${taskName}" removed.`,
        'primary',
        {pos: 'top-center', timeout: 3000},
    );

    selectTask(null);
    await render();
  } catch (err) {
    console.error(`Failed to delete task ${taskName}:`, err);
    alert(`Error deleting task: ${err.message}`);
  }
}

/**
 * Renders the overview grid displaying all apps.
 * @param {Array<Object>} tasks List of task objects.
 */
function renderOverview(tasks) {
  const totalCount = tasks.length;
  const runningCount = tasks.filter((t) => t.status === 'RUNNING').length;
  const stoppedCount = tasks.filter((t) => t.status !== 'RUNNING').length;

  const countAll = document.getElementById('count-all');
  if (countAll) countAll.textContent = totalCount;
  const countRunning = document.getElementById('count-running');
  if (countRunning) countRunning.textContent = runningCount;
  const countStopped = document.getElementById('count-stopped');
  if (countStopped) countStopped.textContent = stoppedCount;

  // Filter tasks based on search and status tab
  const filteredTasks = tasks.filter((task) => {
    if (currentStatusFilter === 'running' && task.status !== 'RUNNING') {
      return false;
    }
    if (currentStatusFilter === 'stopped' && task.status === 'RUNNING') {
      return false;
    }
    if (currentSearchQuery) {
      const q = currentSearchQuery.toLowerCase();
      const nameMatch = (task.name || '').toLowerCase().includes(q);
      const cmdMatch = (task.command || '').toLowerCase().includes(q);
      const pathMatch = (task.path || '').toLowerCase().includes(q);
      const statusMatch = (task.status || '').toLowerCase().includes(q);
      if (!nameMatch && !cmdMatch && !pathMatch && !statusMatch) {
        return false;
      }
    }
    return true;
  });

  const gridContainer = document.getElementById('apps-grid');
  if (!gridContainer) return;

  if (filteredTasks.length === 0) {
    e('apps-grid', {}, [
      el('div', {
        'class': 'empty-state',
        'style': 'grid-column: 1 / -1; padding: 48px 16px;',
      }, [
        el('h3', {}, totalCount === 0 ? 'No tasks registered' : 'No matching apps'),
        el('p', {}, totalCount === 0 ?
            'Add your first app with NotableDB persistence.' :
            'No apps match the current search or status filter.'),
        totalCount === 0 ? el('button', {
          'class': 'uk-button uk-button-primary uk-button-small uk-margin-top',
          'onclick': () => openAddTaskModal(),
        }, [
          el('span', {'uk-icon': 'icon: plus; ratio: 0.85'}),
          el('span', {'class': 'uk-margin-small-left'}, 'Add Task'),
        ]) : el('button', {
          'class': 'uk-button uk-button-default uk-button-small uk-margin-top',
          'onclick': () => {
            currentSearchQuery = '';
            currentStatusFilter = 'all';
            const searchInput = document.getElementById('overview-search-input');
            if (searchInput) searchInput.value = '';
            updateFilterButtons();
            renderOverview(tasks);
          },
        }, 'Clear Filters'),
      ]),
    ]);
    return;
  }

  e('apps-grid', {}, filteredTasks.map((task) => {
    const statusClass = getStatusClass(task.status);
    const isRunning = task.status === 'RUNNING';
    const isBusy = task.status === 'STARTING' || task.status === 'STOPPING';
    const logFiles = getTaskLogFiles(task);

    return el('div', {'class': 'app-card'}, [
      // Header
      el('div', {'class': 'app-card-header'}, [
        el('div', {'class': 'app-card-title-wrap'}, [
          el('a', {
            'class': 'app-card-title',
            'href': `#task=${encodeURIComponent(task.name)}`,
            'onclick': (evt) => {
              evt.preventDefault();
              selectTask(task.name);
            },
          }, task.name),
          task.isSystem ? el('span', {
            'class': 'uk-badge',
            'style':
              'font-size: 10px; background: #6366f1; padding: 1px 6px; ' +
              'border-radius: 4px; vertical-align: middle;',
          }, 'System') : null,
        ].filter(Boolean)),
        el('span', {'class': `task-status-badge ${statusClass}`}, [
          el('span', {'class': `status-dot ${statusClass}`}),
          el('span', {}, task.status || 'UNKNOWN'),
        ]),
      ]),

      // Body
      el('div', {
        'class': 'app-card-body',
        'style': 'cursor: pointer;',
        'onclick': () => selectTask(task.name),
      }, [
        el('div', {'class': 'app-card-prop'}, [
          el('div', {'class': 'app-card-prop-label'}, 'Program to Run'),
          el('div', {
            'class': 'app-card-prop-val',
            'style': 'color: #0284c7; font-weight: 500;',
          }, task.command || 'npm start'),
        ]),
        el('div', {'class': 'app-card-prop'}, [
          el('div', {'class': 'app-card-prop-label'}, 'Path / Repository'),
          el('div', {
            'class': 'app-card-prop-val',
          }, task.path || task.git || 'None'),
        ]),
        el('div', {
          'class': 'uk-flex uk-flex-between uk-margin-small-top',
          'style': 'gap: 8px; flex-wrap: wrap;',
        }, [
          el('div', {}, [
            el('span', {'class': 'app-card-prop-label'}, 'PID: '),
            el('span', {
              'style': 'font-family: "Roboto Mono", monospace; font-size: 12px;',
            }, String(task.pid ?? -1)),
          ]),
          el('div', {}, [
            el('span', {'class': 'app-card-prop-label'}, 'Started: '),
            el('span', {
              'style': 'font-size: 11.5px; color: #64748b;',
            }, formatStartTime(task.startTime)),
          ]),
        ]),
        el('div', {
          'class': 'uk-margin-xsmall-top',
          'style': 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap;',
        }, [
          el('span', {'class': 'app-card-prop-label'}, 'Logs: '),
          el('span', {
            'style': 'font-size: 11.5px; color: #64748b;',
          }, logFiles.length > 0 ?
            `${logFiles.length} file${logFiles.length > 1 ? 's' : ''} (latest: ${logFiles[0]})` :
            'No logs'),
        ]),
      ]),

      // Footer
      el('div', {'class': 'app-card-footer'}, [
        el('div', {'class': 'app-card-actions'}, task.isSystem ? [
          el('span', {
            'class': 'uk-text-meta',
            'style': 'font-size: 12px; color: #64748b; font-weight: 500;',
          }, 'System Daemon'),
        ] : [
          el('button', {
            'class': 'app-card-btn',
            'disabled': !isRunning || isBusy,
            'title': 'Stop task',
            'onclick': (evt) => {
              evt.stopPropagation();
              handleTaskAction(task.name, 'stop');
            },
          }, [
            el('span', {'uk-icon': 'icon: ban; ratio: 0.75'}),
            el('span', {}, 'Stop'),
          ]),
          el('button', {
            'class': 'app-card-btn',
            'disabled': isBusy,
            'title': task.status === 'STOPPED' ? 'Start task' : 'Restart task',
            'onclick': (evt) => {
              evt.stopPropagation();
              handleTaskAction(task.name, 'restart');
            },
          }, [
            el('span', {'uk-icon': 'icon: refresh; ratio: 0.75'}),
            el('span', {}, task.status === 'STOPPED' ? 'Start' : 'Restart'),
          ]),
          el('button', {
            'class': 'app-card-btn',
            'title': 'Edit configuration',
            'onclick': (evt) => {
              evt.stopPropagation();
              openEditTaskModal(task);
            },
          }, [
            el('span', {'uk-icon': 'icon: file-edit; ratio: 0.75'}),
          ]),
        ]),
        el('button', {
          'class': 'app-card-view-btn',
          'onclick': (evt) => {
            evt.stopPropagation();
            selectTask(task.name);
          },
        }, [
          el('span', {}, 'Details & Logs'),
          el('span', {'uk-icon': 'icon: arrow-right; ratio: 0.75'}),
        ]),
      ]),
    ]);
  }));
}

/**
 * Updates filter tab buttons state.
 */
function updateFilterButtons() {
  const allBtn = document.getElementById('filter-btn-all');
  const runningBtn = document.getElementById('filter-btn-running');
  const stoppedBtn = document.getElementById('filter-btn-stopped');

  if (allBtn) allBtn.classList.toggle('active', currentStatusFilter === 'all');
  if (runningBtn) runningBtn.classList.toggle('active', currentStatusFilter === 'running');
  if (stoppedBtn) stoppedBtn.classList.toggle('active', currentStatusFilter === 'stopped');
}

/**
 * Renders the detail view for a specific task.
 * @param {Object} task Task object to render.
 * @param {string} finalLog Active log filename or '__all__.log'.
 */
function renderDetail(task, finalLog) {
  const statusClass = getStatusClass(task.status);
  const isRunning = task.status === 'RUNNING';
  const isBusy = task.status === 'STARTING' || task.status === 'STOPPING';
  const logFiles = getTaskLogFiles(task);

  // Update top nav title
  const navTitle = document.getElementById('detail-nav-title');
  if (navTitle) {
    navTitle.innerHTML =
      `<span style="font-size: 1.15rem; font-weight: 600; margin-right: 8px;">` +
      `${escapeHtml(task.name)}</span>` +
      (task.isSystem ?
        `<span class="uk-badge" style="font-size: 10px; background: #6366f1; margin-right: 8px;">System</span>` :
        '') +
      `<span class="task-status-badge ${statusClass}">` +
      `<span class="status-dot ${statusClass}"></span>` +
      `${escapeHtml(task.status || 'UNKNOWN')}</span>`;
  }

  // Define log tabs: All Logs (Merged) first, then sorted log files
  const allLogTabs = [
    {filename: '__all__.log', label: 'All Logs (Merged)'},
    ...logFiles.map((f, idx) => ({
      filename: f,
      label: idx === 0 ? `${f} (latest)` : f,
    })),
  ];

  e('detail-task-container', {}, [
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
        allLogTabs.map((item) => {
          const isLogActive = item.filename === finalLog;
          return el('li', {
            'id': `log-tab-item-${task.name}-${item.filename}`,
            'class': isLogActive ? 'uk-active' : '',
          }, [
            el('a', {
              'href': '#',
              'onclick': (evt) => {
                evt.preventDefault();
                selectLog(task.name, item.filename);
              },
            }, item.label),
          ]);
        })),
      ]),

      el('div', {'class': 'logs-terminal'}, [
        el('div', {'class': 'logs-toolbar'}, [
          el('span', {
            'id': `log-count-${task.name}`,
            'class': 'logs-filename',
          }, finalLog === '__all__.log' ? 'All Logs (Merged)' : finalLog),
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
              'href': getLogOpenUrl(task.name, finalLog),
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

  applyLogPreview(task.name, finalLog);
}

/**
 * Fetches tasks and renders the UI according to current view state.
 */
async function render() {
  let tasks = [];
  try {
    const res = await fetch('/task/list');
    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }
    tasks = await res.json();
    allTasksData = tasks;
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

  const savedState = getState();
  const viewOverview = document.getElementById('view-overview');
  const viewDetail = document.getElementById('view-detail');

  if (!savedState.task) {
    // Show Overview Entry Page
    if (viewOverview) viewOverview.style.display = '';
    if (viewDetail) viewDetail.style.display = 'none';
    renderOverview(tasks);
  } else {
    // Show App Details & Logs View
    const activeTask = tasks.find((t) => t.name === savedState.task);
    if (!activeTask) {
      // If task no longer exists, return to overview
      saveState(null, null);
      if (viewOverview) viewOverview.style.display = '';
      if (viewDetail) viewDetail.style.display = 'none';
      renderOverview(tasks);
      return;
    }

    if (viewOverview) viewOverview.style.display = 'none';
    if (viewDetail) viewDetail.style.display = '';

    const logFiles = getTaskLogFiles(activeTask);
    let finalLog = '__all__.log';
    const isKnownLog = savedState.log === '__all__.log' ||
      logFiles.includes(savedState.log);
    if (savedState.log && isKnownLog) {
      finalLog = savedState.log;
    }
    saveState(activeTask.name, finalLog);

    renderDetail(activeTask, finalLog);
  }

  if (window.UIkit && window.UIkit.update) {
    window.UIkit.update();
  }
}

window.onload = async function() {
  await render();

  window.addEventListener('hashchange', () => {
    render();
  });

  const searchInput = document.getElementById('overview-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (evt) => {
      currentSearchQuery = evt.target.value.trim();
      renderOverview(allTasksData);
    });
  }

  const filterBtnAll = document.getElementById('filter-btn-all');
  if (filterBtnAll) {
    filterBtnAll.addEventListener('click', () => {
      currentStatusFilter = 'all';
      updateFilterButtons();
      renderOverview(allTasksData);
    });
  }

  const filterBtnRunning = document.getElementById('filter-btn-running');
  if (filterBtnRunning) {
    filterBtnRunning.addEventListener('click', () => {
      currentStatusFilter = 'running';
      updateFilterButtons();
      renderOverview(allTasksData);
    });
  }

  const filterBtnStopped = document.getElementById('filter-btn-stopped');
  if (filterBtnStopped) {
    filterBtnStopped.addEventListener('click', () => {
      currentStatusFilter = 'stopped';
      updateFilterButtons();
      renderOverview(allTasksData);
    });
  }

  const backBtn = document.getElementById('back-to-overview-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      selectTask(null);
    });
  }

  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.classList.add('loading');
      try {
        await render();
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
      await render();
    }
  }, 4000);
};
