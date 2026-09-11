import e from './e.js';

let actionInProgress = false;
let currentTaskStructureKey = '';
const logScrollStates = new Map();

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
  if (!elm || elm.clientHeight === 0) return true;
  return elm.scrollHeight - elm.scrollTop - elm.clientHeight < 30;
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
 * Updates the appearance and title of the bottom button for a log.
 * @param {string} taskName Task name.
 * @param {string} logName Log filename.
 * @param {boolean} userScrolledUp Whether user navigated away from bottom.
 */
function updateBottomButtonState(taskName, logName, userScrolledUp) {
  const btn = document.getElementById(`bottom-btn-${taskName}-${logName}`);
  if (btn) {
    if (userScrolledUp) {
      btn.classList.add('terminal-btn-highlight');
      btn.title = 'Auto-scroll paused (navigating). Click to jump to bottom.';
    } else {
      btn.classList.remove('terminal-btn-highlight');
      btn.title = 'Jump to bottom';
    }
  }
}

/**
 * Attaches scroll listener to a log element to track user navigation.
 * @param {HTMLElement} logElm Log container.
 * @param {string} taskName Task name.
 * @param {string} logName Log filename.
 */
function bindLogScrollTracker(logElm, taskName, logName) {
  const key = `${taskName}:${logName}`;
  logElm.addEventListener('scroll', () => {
    if (logElm.clientHeight === 0) return;
    const isNearBottom = isScrolledNearBottom(logElm);
    const state = logScrollStates.get(key) || {
      scrollTop: 0,
      userScrolledUp: false,
    };
    state.scrollTop = logElm.scrollTop;
    state.userScrolledUp = !isNearBottom;
    logScrollStates.set(key, state);
    updateBottomButtonState(taskName, logName, state.userScrolledUp);
  }, {passive: true});
}

/**
 * Scrolls the active log container to the bottom and resets scroll tracking.
 * @param {string} taskName Task name.
 * @param {?string} logName Log filename.
 */
function scrollActiveLogToBottom(taskName, logName) {
  if (!logName) return;
  const bodyId = `log-body-${taskName}-${logName}`;
  const logElm = document.getElementById(bodyId);
  if (logElm) {
    logElm.scrollTop = logElm.scrollHeight;
    const key = `${taskName}:${logName}`;
    const state = logScrollStates.get(key) || {
      scrollTop: 0,
      userScrolledUp: false,
    };
    state.scrollTop = logElm.scrollTop;
    state.userScrolledUp = false;
    logScrollStates.set(key, state);
    updateBottomButtonState(taskName, logName, false);
  }
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

  const finalLogFiles = Object.keys(activeTask.logs || {});
  let finalLog = null;
  if (savedState.log && finalLogFiles.includes(savedState.log)) {
    finalLog = savedState.log;
  } else if (finalLogFiles.length > 0) {
    finalLog = finalLogFiles[finalLogFiles.length - 1];
  }
  saveState(activeTask.name, finalLog);

  const structureKey = tasks.map((t) =>
    `${t.name}:${Object.keys(t.logs || {}).join(',')}`,
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

      const startTimeElm = document.getElementById(
          `task-starttime-${task.name}`,
      );
      if (startTimeElm) {
        startTimeElm.textContent = formatStartTime(task.startTime);
      }

      if (!actionInProgress) {
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
      }

      for (let logIdx = 0; logIdx < logFiles.length; logIdx++) {
        const filename = logFiles[logIdx];
        const logs = (task.logs || {})[filename] || '';
        const isLogActive = logIdx === activeLogIndex;

        const logTabLi = document.getElementById(
            `log-tab-item-${task.name}-${filename}`,
        );
        if (logTabLi) {
          logTabLi.className = isLogActive ? 'uk-active' : '';
        }

        const logContentLi = document.getElementById(
            `log-content-${task.name}-${filename}`,
        );
        if (logContentLi) {
          logContentLi.className = isLogActive ? 'uk-active' : '';
          logContentLi.style.display = isLogActive ? '' : 'none';
        }

        const lineCount = logs ? logs.split('\n').filter(Boolean).length : 0;
        const countElm = document.getElementById(
            `log-count-${task.name}-${filename}`,
        );
        if (countElm) {
          countElm.textContent = `${filename} (${lineCount} lines)`;
        }

        const logBody = document.getElementById(
            `log-body-${task.name}-${filename}`,
        );
        if (logBody) {
          const key = `${task.name}:${filename}`;
          const state = logScrollStates.get(key) || {
            scrollTop: 0,
            userScrolledUp: false,
          };

          if (logBody._rawLogs !== logs) {
            if (logBody.clientHeight > 0) {
              state.scrollTop = logBody.scrollTop;
              state.userScrolledUp = !isScrolledNearBottom(logBody);
            }
            renderLogLinesInto(logBody, logs);

            if ((forceScroll && isTaskActive && isLogActive) ||
                !state.userScrolledUp) {
              logBody.scrollTop = logBody.scrollHeight;
              state.scrollTop = logBody.scrollTop;
              state.userScrolledUp = false;
            } else {
              logBody.scrollTop = state.scrollTop;
            }
            logScrollStates.set(key, state);
            updateBottomButtonState(task.name, filename, state.userScrolledUp);
          } else if (forceScroll && isTaskActive && isLogActive) {
            logBody.scrollTop = logBody.scrollHeight;
            state.scrollTop = logBody.scrollTop;
            state.userScrolledUp = false;
            logScrollStates.set(key, state);
            updateBottomButtonState(task.name, filename, false);
          }
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
        ]),
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

          el('div', {'class': 'task-actions'}, [
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
        logFiles.map((filename, logIdx) => {
          const isLogActive = logIdx === activeLogIndex;
          const bodyId = `log-body-${task.name}-${filename}`;
          const logs = (task.logs || {})[filename] || '';
          const lineCount = logs ? logs.split('\n').filter(Boolean).length : 0;

          return el('li', {
            'id': `log-content-${task.name}-${filename}`,
            'class': isLogActive ? 'uk-active' : '',
            'style': isLogActive ? '' : 'display: none;',
          }, [
            el('div', {'class': 'logs-terminal'}, [
              el('div', {'class': 'logs-toolbar'}, [
                el(
                    'span',
                    {
                      'id': `log-count-${task.name}-${filename}`,
                      'class': 'logs-filename',
                    },
                    `${filename} (${lineCount} lines)`,
                ),
                el('div', {'class': 'logs-toolbar-actions'}, [
                  el('button', {
                    'class': 'terminal-btn',
                    'onclick': (evt) => copyLogText(logs, evt.currentTarget),
                  }, 'Copy'),
                  el('button', {
                    'id': `bottom-btn-${task.name}-${filename}`,
                    'class': 'terminal-btn',
                    'onclick': () => {
                      scrollActiveLogToBottom(task.name, filename);
                    },
                  }, 'Bottom'),
                ]),
              ]),
              el('div', {
                'id': bodyId,
                'class': 'logs-body',
              }, []),
            ]),
          ]);
        })),
      ]);
    }));

    // Populate log bodies and attach scroll trackers.
    for (const task of tasks) {
      const logFiles = Object.keys(task.logs || {});
      for (const filename of logFiles) {
        const bodyId = `log-body-${task.name}-${filename}`;
        const logElm = document.getElementById(bodyId);
        const logs = (task.logs || {})[filename] || '';
        if (logElm) {
          renderLogLinesInto(logElm, logs);
          bindLogScrollTracker(logElm, task.name, filename);
        }
      }
    }

    if (finalLog) {
      const activeLogElm = document.getElementById(
          `log-body-${activeTask.name}-${finalLog}`,
      );
      if (activeLogElm) {
        const key = `${activeTask.name}:${finalLog}`;
        const state = logScrollStates.get(key);
        if (forceScroll || !state || !state.userScrolledUp) {
          activeLogElm.scrollTop = activeLogElm.scrollHeight;
          logScrollStates.set(key, {
            scrollTop: activeLogElm.scrollTop,
            userScrolledUp: false,
          });
          updateBottomButtonState(activeTask.name, finalLog, false);
        } else {
          activeLogElm.scrollTop = state.scrollTop;
          updateBottomButtonState(activeTask.name, finalLog, true);
        }
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

  // Periodic polling for task status and log updates.
  setInterval(async () => {
    if (!actionInProgress && !document.hidden) {
      await render(false);
    }
  }, 4000);
};

