import e from './e.js';

let actionInProgress = false;

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
 * Checks if a scrollable element is near the bottom.
 * @param {?HTMLElement} elm Element to inspect.
 * @return {boolean} True if near bottom or not scrollable.
 */
function isScrolledNearBottom(elm) {
  if (!elm) return true;
  return elm.scrollHeight - elm.scrollTop - elm.clientHeight < 60;
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
 * @param {HTMLElement} buttonElement Triggering button.
 */
async function handleTaskAction(taskName, action, buttonElement) {
  if (actionInProgress) return;
  actionInProgress = true;

  buttonElement.disabled = true;
  buttonElement.innerText = action === 'stop' ? 'Stopping...' : 'Restarting...';

  try {
    await fetch(`/task/${encodeURIComponent(taskName)}/${action}`);
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
 * Smoothly scrolls the active log container to the bottom.
 * @param {string} taskName Task name.
 * @param {?string} logName Log filename.
 */
function scrollActiveLogToBottom(taskName, logName) {
  requestAnimationFrame(() => {
    if (!logName) return;
    const bodyId = `log-body-${taskName}-${logName}`;
    const logElm = document.getElementById(bodyId);
    if (logElm) {
      logElm.scrollTop = logElm.scrollHeight;
    }
  });
}

/**
 * Selects an active task and renders the UI.
 * @param {string} taskName Task name to select.
 * @param {?string} [preferredLog] Optional log filename.
 */
function selectTask(taskName, preferredLog = null) {
  saveState(taskName, preferredLog);
  render(true);
}

/**
 * Selects an active log tab for a specific task and renders.
 * @param {string} taskName Task name.
 * @param {string} logName Log filename.
 */
function selectLog(taskName, logName) {
  saveState(taskName, logName);
  render(true);
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
 * Fetches tasks and renders the entire UI while preserving state.
 * @param {boolean} [forceScroll=false] Whether to scroll log to bottom.
 */
async function render(forceScroll = false) {
  let tasks = [];
  try {
    const res = await fetch('/task/list');
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
    e('tasks-tab', {}, []);
    e('tasks-content', {}, [
      el('li', {'class': 'uk-active'}, [
        el('div', {'class': 'empty-state'}, [
          el('h3', {}, 'No tasks found'),
          el('p', {}, 'Configure tasks in your .procegerrc to get started.'),
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

  // Render tasks tab list
  e('tasks-tab', {}, tasks.map((task, idx) => {
    const isActive = idx === activeTaskIndex;
    const statusClass = getStatusClass(task.status);
    return el('li', {'class': isActive ? 'uk-active' : ''}, [
      el('a', {
        'href': '#',
        'onclick': (evt) => {
          evt.preventDefault();
          selectTask(task.name);
        },
      }, [
        el('span', {'class': `status-dot ${statusClass}`}),
        el('span', {}, task.name),
      ]),
    ]);
  }));

  // Render tasks content
  e('tasks-content', {}, tasks.map((task, taskIdx) => {
    const isTaskActive = taskIdx === activeTaskIndex;
    const logFiles = Object.keys(task.logs || {});

    let activeLogIndex = -1;
    if (isTaskActive && savedState.log) {
      activeLogIndex = logFiles.indexOf(savedState.log);
    }
    if (activeLogIndex === -1) {
      activeLogIndex = logFiles.length > 0 ? logFiles.length - 1 : 0;
    }

    const statusClass = getStatusClass(task.status);
    const isRunning = task.status === 'RUNNING';
    const isBusy = task.status === 'STARTING' || task.status === 'STOPPING';

    return el('li', {
      'class': isTaskActive ? 'uk-active' : '',
      'style': isTaskActive ? '' : 'display: none;',
    }, [
      el('div', {'class': 'task-card'}, [
        el('ul', {'class': 'task-info-list'}, [
          el('li', {'class': 'task-info-item'}, [
            el('span', {'class': 'task-info-label'}, 'Status'),
            el('span', {'class': `task-status-badge ${statusClass}`}, [
              el('span', {'class': `status-dot ${statusClass}`}),
              el('span', {}, task.status || 'UNKNOWN'),
            ]),
          ]),
          el('li', {'class': 'task-info-item'}, [
            el('span', {'class': 'task-info-label'}, 'Process ID'),
            el('span', {'class': 'task-info-value'}, String(task.pid ?? -1)),
          ]),
          el('li', {'class': 'task-info-item'}, [
            el('span', {'class': 'task-info-label'}, 'Repository'),
            el('span', {'class': 'task-info-value'}, task.git || 'None'),
          ]),
          el('li', {'class': 'task-info-item'}, [
            el('span', {'class': 'task-info-label'}, 'Revision'),
            el('span', {'class': 'task-info-value'}, task.revision || 'None'),
          ]),
          el('li', {'class': 'task-info-item'}, [
            el('span', {'class': 'task-info-label'}, 'Start Time'),
            el(
                'span',
                {'class': 'task-info-value'},
                formatStartTime(task.startTime),
            ),
          ]),
        ]),

        el('div', {'class': 'task-actions'}, [
          el('button', {
            'class': 'uk-button uk-button-danger task-btn',
            'disabled': !isRunning || isBusy,
            'onclick': (evt) => {
              handleTaskAction(task.name, 'stop', evt.currentTarget);
            },
          }, [
            el('span', {'uk-icon': 'icon: ban; ratio: 0.85'}),
            el('span', {}, 'Stop'),
          ]),
          el('button', {
            'class': 'uk-button uk-button-primary task-btn',
            'disabled': isBusy,
            'onclick': (evt) => {
              handleTaskAction(task.name, 'restart', evt.currentTarget);
            },
          }, [
            el('span', {'uk-icon': 'icon: refresh; ratio: 0.85'}),
            el('span', {}, task.status === 'STOPPED' ? 'Start' : 'Restart'),
          ]),
        ]),
      ]),

      el('div', {'class': 'log-tab-wrapper'}, [
        el('ul', {
          'id': `task-${task.name}-logs-tab`,
          'class': 'uk-tab log-tab',
          'uk-tab': `connect: #task-${task.name}-logs`,
        },
        logFiles.map((filename, logIdx) => {
          const isLogActive = logIdx === activeLogIndex;
          return el('li', {'class': isLogActive ? 'uk-active' : ''}, [
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

      el('ul', {
        'id': `task-${task.name}-logs`,
        'class': 'uk-switcher uk-margin-remove-top',
      },
      logFiles.length === 0 ? [
        el('li', {'class': 'uk-active'}, [
          el('div', {'class': 'logs-terminal'}, [
            el('div', {'class': 'logs-toolbar'}, [
              el('span', {'class': 'logs-filename'}, 'No logs'),
            ]),
            el('div', {'class': 'logs-body'}, [
              el(
                  'p',
                  {'class': 'empty-log'},
                  'No logs recorded yet for this task.',
              ),
            ]),
          ]),
        ]),
      ] :
      Object.entries(task.logs || {}).map(([filename, logs], logIdx) => {
        const isLogActive = logIdx === activeLogIndex;
        const bodyId = `log-body-${task.name}-${filename}`;
        const lineCount = logs ? logs.split('\n').filter(Boolean).length : 0;

        return el('li', {
          'class': isLogActive ? 'uk-active' : '',
          'style': isLogActive ? '' : 'display: none;',
        }, [
          el('div', {'class': 'logs-terminal'}, [
            el('div', {'class': 'logs-toolbar'}, [
              el(
                  'span',
                  {'class': 'logs-filename'},
                  `${filename} (${lineCount} lines)`,
              ),
              el('div', {'class': 'logs-toolbar-actions'}, [
                el('button', {
                  'class': 'terminal-btn',
                  'onclick': (evt) => copyLogText(logs, evt.currentTarget),
                }, 'Copy'),
                el('button', {
                  'class': 'terminal-btn',
                  'onclick': () => {
                    const elm = document.getElementById(bodyId);
                    if (elm) elm.scrollTop = elm.scrollHeight;
                  },
                }, 'Bottom'),
              ]),
            ]),
            el('div', {
              'id': bodyId,
              'class': 'logs-body',
            }, formatLogLines(logs)),
          ]),
        ]);
      })),
    ]);
  }));

  const finalLogFiles = Object.keys(activeTask.logs || {});
  let finalLog = null;
  if (savedState.log && finalLogFiles.includes(savedState.log)) {
    finalLog = savedState.log;
  } else if (finalLogFiles.length > 0) {
    finalLog = finalLogFiles[finalLogFiles.length - 1];
  }

  saveState(activeTask.name, finalLog);

  if (finalLog) {
    const activeLogElm = document.getElementById(
        `log-body-${activeTask.name}-${finalLog}`,
    );
    if (forceScroll || isScrolledNearBottom(activeLogElm)) {
      scrollActiveLogToBottom(activeTask.name, finalLog);
    }
  }

  if (window.UIkit && window.UIkit.update) {
    window.UIkit.update();
  }
}

window.onload = async function() {
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
        await render(true);
      } finally {
        setTimeout(() => refreshBtn.classList.remove('loading'), 400);
      }
    });
  }

  // Periodic polling for task status and log updates.
  setInterval(async () => {
    if (!actionInProgress && !document.hidden) {
      await render(false);
    }
  }, 4000);
};

