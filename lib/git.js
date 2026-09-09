const git = require('simple-git');
const fs = require('fs').promises;
const path = require('path');
const Apper = require('@sarosia/apper');

class GitRepo {
  #url = null;
  #repoPath = null;
  #git = null;
  #revision = null;
  #logger = null;

  constructor(workspace, url, logger = null) {
    this.#repoPath = path.join(workspace, path.basename(url, '.git'));
    this.#url = url;
    this.#logger = logger || new Apper.Logger('proceger');
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
      this.#logger.info(
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

    this.#logger.info(
        `Pulling updates for "${this.#repoPath}" from "${this.#url}".`);
    try {
      await this.#git.pull();
      const revision = await this.#git.revparse('HEAD');
      if (revision === this.#revision) {
        return false;
      }
      this.#logger.info(
          `Got new revision, old=${this.#revision}, new=${revision}.`);
      this.#revision = revision;
      return true;
    } catch (e) {
      this.#logger.error('Unable to pull update from git repo.', e);
    }
    return false;
  }
}

module.exports = GitRepo;
