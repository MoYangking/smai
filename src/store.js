const fsp = require('fs/promises');
const path = require('path');

class Store {
  constructor(dir) {
    this.dir = dir;
  }

  async ensureDir() {
    try {
      await fsp.mkdir(this.dir, { recursive: true });
    } catch {}
  }

  async writeFile(p, s) {
    await this.ensureDir();
    await fsp.writeFile(p + '.tmp', s, 'utf-8');
    await fsp.rename(p + '.tmp', p);
  }

  cookiesPath() {
    return path.join(this.dir, 'cookies.json');
  }

  async readCookies() {
    try {
      const s = await fsp.readFile(this.cookiesPath(), 'utf-8');
      const j = JSON.parse(s);
      return j.cookies || '';
    } catch {
      return '';
    }
  }

  async writeCookies(cookies) {
    await this.writeFile(this.cookiesPath(), JSON.stringify({
      cookies: cookies || ''
    }));
    return true;
  }

  modelsPath() {
    return path.join(this.dir, 'models_openai.json');
  }

  async readModels() {
    try {
      const s = await fsp.readFile(this.modelsPath(), 'utf-8');
      return JSON.parse(s);
    } catch {
      return null;
    }
  }

  async writeModels(obj) {
    await this.writeFile(this.modelsPath(), JSON.stringify(obj));
    return true;
  }

  async deleteModels() {
    try {
      await fsp.rm(this.modelsPath(), { force: true });
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = Store;