/**
 * @fileoverview Dedicated full-page log viewer for Proceger tasks.
 */

let allTasks = [];
let currentTaskName = null;
let currentLogName = null;
let currentRawLogs = '';
let currentFilterQuery = '';
let userScrolledUp = false;
let pollTimer = null;

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
 * Returns CSS status class for task status string.
 * @param {string} status Task status.
 * @return {string} CSS class modifier.
 */
function getStatusClass(status) {
  switch (status) {
    case 'RUNNING':
      return 'status-running';
    case 'STARTING':
      return 'status-starting';
    case 'STOPPING':
      return 'status-stopping';
    case 'STOPPED':
      return 'status-stopped';
    default:
      return 'status-idle';
  }
}

/**
 * Checks if an element is scrolled near bottom.
 * @param {HTMLElement} elm Container element.
 * @return {boolean} True if near bottom.
 */
function isNearBottom(elm) {
  if (!elm || elm.clientHeight === 0) return true;
  return elm.scrollHeight - elm.scrollTop - elm.clientHeight < 40;
}

/**
 * Parses URL query parameters.
 * @return {{task: ?string, log: ?string}}
 */
function getQueryParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    task: params.get('task'),
    log: params.get('log'),
  };
}

/**
 * Formats a log line into HTML string.
 * @param {string} line Raw line string.
 * @param {string} filter Optional filter keyword to highlight.
 * @return {string} Formatted HTML.
 */
function formatLineHtml(line, filter = '') {
  let timeHtml = '';
  let msgHtml = '';

  try {
    const parsed = JSON.parse(line);
    if (parsed && parsed.timestamp && parsed.message !== undefined) {
      timeHtml =
          `<span class="log-time">[${escapeHtml(parsed.timestamp)}]</span>`;
      msgHtml = `<span class="log-msg">${escapeHtml(parsed.message)}</span>`;
    }
  } catch (err) {
    // Plain line formatting.
  }

  if (!timeHtml) {
    msgHtml = `<span class="log-msg">${escapeHtml(line)}</span>`;
  }

  return `<p>${timeHtml}${msgHtml}</p>`;
}

/**
 * Renders all log lines into the container.
 * @param {boolean} preserveScroll Whether to preserve scroll position.
 */
function renderLogContent(preserveScroll = true) {
  const container = document.getElementById('log-content');
  const statsElm = document.getElementById('log-stats');
  if (!container) return;

  const prevScrollTop = container.scrollTop;
  const prevWasNearBottom = isNearBottom(container);

  if (!currentRawLogs) {
    container.innerHTML =
        '<p class="empty-log">No logs recorded yet for this task.</p>';
    if (statsElm) statsElm.textContent = '0 entries';
    return;
  }

  const allLines = currentRawLogs.split('\n');
  if (allLines.length > 0 && allLines[allLines.length - 1] === '') {
    allLines.pop();
  }

  let visibleLines = allLines;
  if (currentFilterQuery) {
    const q = currentFilterQuery.toLowerCase();
    visibleLines = allLines.filter((l) => l.toLowerCase().includes(q));
  }

  const htmlParts = visibleLines.map((line) =>
    formatLineHtml(line, currentFilterQuery),
  );

  container.innerHTML = htmlParts.join('');

  if (statsElm) {
    if (currentFilterQuery) {
      statsElm.textContent =
          `Showing ${visibleLines.length} of ${allLines.length} ` +
          'entries (filtered)';
    } else {
      statsElm.textContent = `${allLines.length} total entries`;
    }
  }

  if (preserveScroll && userScrolledUp) {
    container.scrollTop = prevScrollTop;
  } else if (!preserveScroll || prevWasNearBottom || !userScrolledUp) {
    container.scrollTop = container.scrollHeight;
    userScrolledUp = false;
  }

  updateScrollButtons();
}

/**
 * Updates visibility of bottom jump buttons.
 */
function updateScrollButtons() {
  const container = document.getElementById('log-content');
  const floatBtn = document.getElementById('float-bottom-btn');
  const bottomBtn = document.getElementById('bottom-btn');
  if (!container) return;

  const scrolledAway = !isNearBottom(container);
  userScrolledUp = scrolledAway;

  if (floatBtn) {
    floatBtn.classList.toggle('visible', scrolledAway);
  }
  if (bottomBtn) {
    bottomBtn.classList.toggle('terminal-btn-highlight', scrolledAway);
  }
}

/**
 * Scrolls container to bottom.
 */
function scrollToBottom() {
  const container = document.getElementById('log-content');
  if (container) {
    container.scrollTop = container.scrollHeight;
    userScrolledUp = false;
    updateScrollButtons();
  }
}

/**
 * Renders task log tabs and updates active selection.
 * @param {Object} task Task object.
 */
function renderLogTabs(task) {
  const tabsContainer = document.getElementById('log-tabs');
  if (!tabsContainer) return;

  const logsObj = task.logs || {};
  const logFiles = Object.keys(logsObj);

  if (logFiles.length === 0) {
    tabsContainer.innerHTML =
        '<div style="padding: 10px 14px; font-size: 13px; color: #64748b;">' +
        'No log files available</div>';
    return;
  }

  if (!currentLogName || !logFiles.includes(currentLogName)) {
    currentLogName = logFiles[logFiles.length - 1];
  }

  tabsContainer.innerHTML = '';
  for (const filename of logFiles) {
    const raw = logsObj[filename] || '';
    const lineCount = raw ? raw.split('\n').filter(Boolean).length : 0;
    const isActive = filename === currentLogName;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `log-tab-btn${isActive ? ' active' : ''}`;
    btn.innerHTML =
        `<span>${escapeHtml(filename)}</span>` +
        `<span class="log-tab-count">${lineCount}</span>`;

    btn.onclick = () => {
      if (currentLogName !== filename) {
        currentLogName = filename;
        currentRawLogs = (task.logs || {})[filename] || '';
        userScrolledUp = false;
        renderLogTabs(task);
        renderLogContent(false);
        updateUrlParams();
      }
    };

    tabsContainer.appendChild(btn);
  }
}

/**
 * Updates URL search query parameters without reloading.
 */
function updateUrlParams() {
  const params = new URLSearchParams();
  if (currentTaskName) params.set('task', currentTaskName);
  if (currentLogName) params.set('log', currentLogName);
  const newUrl = `${window.location.pathname}?${params.toString()}`;
  if (window.history && window.history.replaceState) {
    window.history.replaceState(null, '', newUrl);
  }
  document.title =
      `[${currentTaskName || 'task'}] ${currentLogName || 'logs'} - Proceger`;
}

/**
 * Loads tasks and renders current task log viewer.
 * @param {boolean} isPolling Whether this is a background poll.
 */
async function loadTaskLogs(isPolling = false) {
  try {
    const res = await fetch('/task/list');
    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }
    allTasks = await res.json();
  } catch (err) {
    console.error('Failed to fetch tasks:', err);
    return;
  }

  if (!allTasks || allTasks.length === 0) {
    const content = document.getElementById('log-content');
    if (content) {
      content.innerHTML = '<p class="empty-log">No tasks found.</p>';
    }
    return;
  }

  if (!currentTaskName || !allTasks.some((t) => t.name === currentTaskName)) {
    currentTaskName = allTasks[0].name;
  }

  const task = allTasks.find((t) => t.name === currentTaskName) || allTasks[0];
  currentTaskName = task.name;

  // Header display
  const titleDisplay = document.getElementById('task-name-display');
  if (titleDisplay) {
    titleDisplay.textContent = task.name;
  }

  const dot = document.getElementById('task-status-dot');
  if (dot) {
    dot.className = `status-dot ${getStatusClass(task.status)}`;
  }

  // Task switcher dropdown
  const select = document.getElementById('task-select');
  if (select) {
    if (allTasks.length > 1) {
      select.style.display = '';
      select.innerHTML = allTasks.map((t) =>
        `<option value="${escapeHtml(t.name)}"` +
        `${t.name === currentTaskName ? ' selected' : ''}>` +
        `${escapeHtml(t.name)} (${t.status || 'UNKNOWN'})</option>`,
      ).join('');

      select.onchange = (evt) => {
        currentTaskName = evt.target.value;
        currentLogName = null;
        userScrolledUp = false;
        loadTaskLogs(false);
      };
    } else {
      select.style.display = 'none';
    }
  }

  renderLogTabs(task);

  const newLogs = (task.logs || {})[currentLogName] || '';
  if (newLogs !== currentRawLogs || !isPolling) {
    currentRawLogs = newLogs;
    renderLogContent(isPolling);
  }

  updateUrlParams();
}

/**
 * Initializes full log viewer page.
 */
window.onload = async function() {
  const params = getQueryParams();
  if (params.task) currentTaskName = params.task;
  if (params.log) currentLogName = params.log;

  if (window.opener) {
    const closeBtn = document.getElementById('close-btn');
    if (closeBtn) {
      closeBtn.style.display = '';
      closeBtn.onclick = () => window.close();
    }
  }

  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (evt) => {
      currentFilterQuery = evt.target.value.trim();
      renderLogContent(true);
    });
  }

  const copyBtn = document.getElementById('copy-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      if (!currentRawLogs) return;
      try {
        await navigator.clipboard.writeText(currentRawLogs);
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML =
            '<span uk-icon="icon: check; ratio: 0.75"></span>' +
            '<span>Copied!</span>';
        setTimeout(() => {
          copyBtn.innerHTML = originalText;
        }, 1500);
      } catch (err) {
        console.error('Failed to copy to clipboard:', err);
      }
    });
  }

  const bottomBtn = document.getElementById('bottom-btn');
  if (bottomBtn) {
    bottomBtn.addEventListener('click', () => scrollToBottom());
  }

  const floatBtn = document.getElementById('float-bottom-btn');
  if (floatBtn) {
    floatBtn.addEventListener('click', () => scrollToBottom());
  }

  const logContent = document.getElementById('log-content');
  if (logContent) {
    logContent.addEventListener('scroll', () => {
      updateScrollButtons();
    }, {passive: true});
  }

  await loadTaskLogs(false);

  pollTimer = setInterval(async () => {
    if (!document.hidden) {
      await loadTaskLogs(true);
    }
  }, 3000);
};

window.onbeforeunload = function() {
  if (pollTimer) clearInterval(pollTimer);
};
