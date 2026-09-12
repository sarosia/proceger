const Apper = require('@sarosia/apper');
const NotableStore = Apper.NotableStore;

class TaskStore extends NotableStore {
  constructor(options = {}) {
    super('tasks', {
      appName: 'proceger',
      idField: 'name',
      ...options,
    });
  }

  /**
   * Seed tasks from initial config if database doesn't have any tasks yet.
   * @param {Array} initialTasks Initial tasks array from config.
   */
  async init(initialTasks = []) {
    const formatted = (initialTasks || []).map((t) => {
      if (!t || !t.name) return null;
      const gitUrl = typeof t.git === 'string' ?
        t.git :
        (t.git && t.git.url ? t.git.url : '');
      return {
        name: t.name,
        git: gitUrl ? {url: gitUrl} : null,
        path: t.path || t.cwd || null,
        command: (t.command && t.command.trim()) || 'npm start',
        env: t.env || {},
        enabled: t.enabled !== undefined ? Boolean(t.enabled) : true,
      };
    }).filter(Boolean);
    await super.init(formatted);
  }

  async listTasks() {
    return this.list();
  }

  async getTask(name) {
    return this.get(name);
  }

  async addTask(taskData) {
    if (!taskData || !taskData.name || !taskData.name.trim()) {
      throw new Error('Task name is required.');
    }
    const name = taskData.name.trim();

    const gitUrl = typeof taskData.git === 'string' ?
      taskData.git :
      (taskData.git && taskData.git.url ? taskData.git.url : '');
    const taskPath = taskData.path || taskData.cwd;

    if ((!gitUrl || !gitUrl.trim()) && (!taskPath || !taskPath.trim())) {
      throw new Error(
          'Either Git repository URL or local path is required.');
    }

    const command =
      (taskData.command && taskData.command.trim()) || 'npm start';

    const newTask = {
      name,
      git: gitUrl && gitUrl.trim() ? {url: gitUrl.trim()} : null,
      path: taskPath && taskPath.trim() ? taskPath.trim() : null,
      command,
      env: taskData.env || {},
      enabled:
        taskData.enabled !== undefined ? Boolean(taskData.enabled) : true,
    };

    return super.add(newTask);
  }

  async updateTask(name, updates = {}) {
    if (!name) {
      throw new Error('Task name is required.');
    }
    const existing = await this.getTask(name);
    if (!existing) {
      throw new Error(`Task "${name}" not found.`);
    }

    const cleanUpdates = {};
    if (updates.command !== undefined) {
      cleanUpdates.command =
        (typeof updates.command === 'string' && updates.command.trim()) ||
        'npm start';
    }
    if (updates.path !== undefined || updates.cwd !== undefined) {
      const p = updates.path !== undefined ? updates.path : updates.cwd;
      cleanUpdates.path = typeof p === 'string' && p.trim() ? p.trim() : null;
    }
    if (updates.git !== undefined) {
      if (!updates.git) {
        cleanUpdates.git = null;
      } else {
        const gitUrl = typeof updates.git === 'string' ?
          updates.git :
          (updates.git && updates.git.url ? updates.git.url : '');
        cleanUpdates.git =
          gitUrl && gitUrl.trim() ? {url: gitUrl.trim()} : null;
      }
    }
    if (updates.env !== undefined) {
      const isObj =
        typeof updates.env === 'object' && updates.env !== null;
      cleanUpdates.env = isObj ? updates.env : {};
    }
    if (updates.enabled !== undefined) {
      cleanUpdates.enabled = Boolean(updates.enabled);
    }

    return super.update(name, cleanUpdates);
  }

  async removeTask(name) {
    return super.remove(name);
  }
}

module.exports = TaskStore;
