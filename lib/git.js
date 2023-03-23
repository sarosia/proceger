const git = require('simple-git');
const fs = require('fs').promises;
const logger = require('./logger');
const path = require('path');

class GitRepo {
  #url = null;
  #repoPath = null;
  #git = null;
  #revision = null;

  constructor(workspace, url) {
    this.#repoPath = path.join(workspace, path.basename(url, '.git'));
    this.#url = url;
  }

  getUrl() {
    return this.#url;
  }

  getRepoPath() {
    return this.#repoPath;
  }

  getRevision() {
    return this.#revision;
  }

  async init() {
    let newRepo = false;
    try {
      await fs.readdir(this.#repoPath);
    } catch (e) {
      if (e.code != 'ENOENT') {
        throw e;
      }
      logger.info(
          `Directory does not exist, cloning repostory from ${this.#url}.`);
      await fs.mkdir(path.dirname(this.#repoPath), {recursive: true});
      await git(path.dirname(this.#repoPath)).clone(this.#url);
      newRepo = true;
    }
    this.#git = git(this.#repoPath);
    this.#revision = await this.#git.revparse('HEAD');
    return newRepo;
  }

  async update() {
    if (this.#git === null) {
      throw new Error(
          'GitRepo#init() must be called before calling GitRepo#update().');
    }

    logger.info(`Pulling updates for "${this.#repoPath}" from "${this.#url}".`);
    await this.#git.pull();
    const revision = await this.#git.revparse('HEAD');
    if (revision === this.#revision) {
      return false;
    }
    logger.info(`Got new revision, old=${this.revision}, new=${revision}.`);
    this.#revision = revision;
    return true;
  }
}

module.exports = GitRepo;
