const git = require('simple-git');
const fs = require('fs').promises;
const logger = require('./logger');
const path = require('path');

const repoRoot = path.resolve(`${__dirname}/../repos`);

class GitRepo {
  #url = null;
  #repoPath = null;
  #git = null;
  #revision = null;

  constructor(url) {
    this.#url = url;
    this.#repoPath = path.join(repoRoot, path.basename(this.#url, '.git'));
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
    try {
      await fs.readdir(this.#repoPath);
    } catch (e) {
      if (e.code != 'ENOENT') {
        throw e;
      }
      logger.info(
          `Directory does not exist, cloning repostory from ${this.#url}.`);
      await fs.mkdir(repoRoot, {recursive: true});
      await git(repoRoot).clone(this.#url);
    }
    this.#git = git(this.#repoPath);
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
