const git = require('simple-git');
const fs = require('fs').promises;
const logger = require('./logger');
const path = require('path');

const repoRoot = path.resolve(`${__dirname}/../repos`);

class GitRepo {
  #url = null;
  #repoPath = null;
  #git = null;
  #lastHash = null;

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
    const hash = await this.#git.revparse('HEAD');
    if (hash === this.#lastHash) {
      return false;
    }
    logger.info(`Got new version, old=${this.lastHash}, new=${hash}.`);
    this.#lastHash = hash;
    return true;
  }
}

module.exports = GitRepo;
