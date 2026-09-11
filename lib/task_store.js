const path = require('path');
const os = require('os');
const {Database, FilesystemStorage, Client} = require('@sarosia/notabledb');

class TaskStore {
  #database;

  constructor(options = {}) {
    if (options.database) {
      this.#database = options.database;
    } else if (options.url || options.notabledbUrl) {
      this.#database = new Client(options.url || options.notabledbUrl);
    } else {
      let dbPath =
        options.storagePath || options.dbPath || options.notabledbPath;
      if (!dbPath) {
        dbPath = path.join(os.homedir(), '.proceger', 'notabledb.json');
      } else if (dbPath === '~') {
        dbPath = os.homedir();
      } else if (dbPath.startsWith('~/') || dbPath.startsWith('~\\')) {
        dbPath = path.join(os.homedir(), dbPath.slice(2));
      }
      const storage = new FilesystemStorage(path.resolve(dbPath));
      this.#database = new Database(storage);
    }
  }

  getDatabase() {
    return this.#database;
  }

  /**
   * Seed tasks from initial config if database doesn't have any tasks yet.
   * @param {Array} initialTasks Initial tasks array from config.
   */
  async init(initialTasks = []) {
    const existing = await this.listTasks();
    if (
      existing.length === 0 &&
      initialTasks &&
      initialTasks.length > 0
    ) {
      const tasksMap = {};
      for (const t of initialTasks) {
        if (!t || !t.name) continue;
        const gitUrl = typeof t.git === 'string' ?
          t.git :
          (t.git && t.git.url ? t.git.url : '');
        tasksMap[t.name] = {
          name: t.name,
          git: {url: gitUrl || ''},
          command: (t.command && t.command.trim()) || 'npm start',
          env: t.env || {},
        };
      }
      await this.#database.update(['tasks'], tasksMap);
    }
  }

  async listTasks() {
    const data = await this.#database.query(['tasks']);
    if (!data) return [];
    if (Array.isArray(data)) {
      return data.filter(Boolean);
    }
    return Object.values(data);
  }

  async getTask(name) {
    if (!name) return null;
    const task = await this.#database.query(['tasks', name]);
    if (task) return task;
    const all = await this.listTasks();
    return all.find((t) => t.name === name) || null;
  }

  async addTask(taskData) {
    if (!taskData || !taskData.name || !taskData.name.trim()) {
      throw new Error('Task name is required.');
    }
    const name = taskData.name.trim();

    const gitUrl = typeof taskData.git === 'string' ?
      taskData.git :
      (taskData.git && taskData.git.url ? taskData.git.url : '');
    if (!gitUrl || !gitUrl.trim()) {
      throw new Error('Git repository URL is required.');
    }

    const command =
      (taskData.command && taskData.command.trim()) || 'npm start';

    const newTask = {
      name,
      git: {url: gitUrl.trim()},
      command,
      env: taskData.env || {},
    };

    const existing = await this.#database.query(['tasks']);
    let tasksMap = {};
    if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
      tasksMap = {...existing};
    } else if (Array.isArray(existing)) {
      for (const item of existing) {
        if (item && item.name) tasksMap[item.name] = item;
      }
    }

    if (tasksMap[name]) {
      throw new Error(`Task with name "${name}" already exists.`);
    }

    tasksMap[name] = newTask;
    await this.#database.update(['tasks'], tasksMap);
    return newTask;
  }

  async updateTask(name, updates = {}) {
    if (!name) {
      throw new Error('Task name is required.');
    }
    const existing = await this.getTask(name);
    if (!existing) {
      throw new Error(`Task "${name}" not found.`);
    }

    const updated = {
      ...existing,
      ...updates,
      name,
    };

    if (updates.command !== undefined) {
      updated.command =
        (typeof updates.command === 'string' && updates.command.trim()) ||
        'npm start';
    }
    if (updates.git !== undefined) {
      const gitUrl = typeof updates.git === 'string' ?
        updates.git :
        (updates.git && updates.git.url ? updates.git.url : '');
      updated.git = {url: (gitUrl || '').trim()};
    }
    if (updates.env !== undefined) {
      updated.env = typeof updates.env === 'object' && updates.env !== null ?
        updates.env :
        {};
    }

    const allData = await this.#database.query(['tasks']);
    let tasksMap = {};
    if (allData && typeof allData === 'object' && !Array.isArray(allData)) {
      tasksMap = {...allData};
    } else if (Array.isArray(allData)) {
      for (const item of allData) {
        if (item && item.name) tasksMap[item.name] = item;
      }
    }
    tasksMap[name] = updated;
    await this.#database.update(['tasks'], tasksMap);
    return updated;
  }

  async removeTask(name) {
    if (!name) {
      throw new Error('Task name is required.');
    }
    const existing = await this.getTask(name);
    if (!existing) {
      throw new Error(`Task "${name}" not found.`);
    }

    const allData = await this.#database.query(['tasks']);
    if (allData && typeof allData === 'object' && !Array.isArray(allData)) {
      const copy = {...allData};
      delete copy[name];
      await this.#database.update(['tasks'], copy);
    } else if (Array.isArray(allData)) {
      const filtered = allData.filter((t) => t.name !== name);
      await this.#database.update(['tasks'], filtered);
    } else {
      await this.#database.remove(['tasks', name]);
    }
    return existing;
  }
}

module.exports = TaskStore;
