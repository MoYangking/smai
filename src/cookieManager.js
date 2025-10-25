const fsp = require('fs/promises');
const path = require('path');

class CookieManager {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.cookiesPath = path.join(dataDir, 'cookies.json');
    this.cookiePoolPath = path.join(dataDir, 'cookiePool.json');
  }

  async ensureDir() {
    try {
      await fsp.mkdir(this.dataDir, { recursive: true });
    } catch {}
  }

  async readFile(filePath) {
    try {
      const content = await fsp.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async writeFile(filePath, data) {
    await this.ensureDir();
    const tmpPath = filePath + '.tmp';
    await fsp.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    await fsp.rename(tmpPath, filePath);
  }

  // 读取当前使用的cookie
  async getCurrentCookie() {
    const data = await this.readFile(this.cookiesPath);
    return data?.cookies || '';
  }

  // 设置当前使用的cookie
  async setCurrentCookie(cookie) {
    await this.writeFile(this.cookiesPath, { cookies: cookie || '' });
    return true;
  }

  // 读取cookie池
  async getCookiePool() {
    const data = await this.readFile(this.cookiePoolPath);
    return data?.cookies || [];
  }

  // 添加cookie到池中
  async addToCookiePool(cookies) {
    const pool = await this.getCookiePool();
    const newCookies = Array.isArray(cookies) ? cookies : [cookies];

    // 去重并添加到池中
    for (const cookie of newCookies) {
      if (cookie && !pool.includes(cookie)) {
        pool.push(cookie);
      }
    }

    await this.writeFile(this.cookiePoolPath, { cookies: pool });
    return pool.length;
  }

  // 从池中移除cookie
  async removeFromCookiePool(cookieToRemove) {
    const pool = await this.getCookiePool();
    const filteredPool = pool.filter(cookie => cookie !== cookieToRemove);

    await this.writeFile(this.cookiePoolPath, { cookies: filteredPool });
    return filteredPool.length;
  }

  // 清空cookie池
  async clearCookiePool() {
    await this.writeFile(this.cookiePoolPath, { cookies: [] });
    return true;
  }

  // 切换到池中的下一个cookie
  async rotateCookie() {
    const pool = await this.getCookiePool();
    if (pool.length === 0) {
      return { success: false, message: 'No cookies in pool' };
    }

    const currentCookie = await this.getCurrentCookie();
    let nextIndex = 0;

    // 找到当前cookie在池中的位置，使用下一个
    if (currentCookie) {
      const currentIndex = pool.indexOf(currentCookie);
      nextIndex = currentIndex >= 0 ? (currentIndex + 1) % pool.length : 0;
    }

    const nextCookie = pool[nextIndex];
    await this.setCurrentCookie(nextCookie);

    return {
      success: true,
      cookie: nextCookie,
      index: nextIndex,
      total: pool.length
    };
  }

  // 随机选择一个cookie
  async randomCookie() {
    const pool = await this.getCookiePool();
    if (pool.length === 0) {
      return { success: false, message: 'No cookies in pool' };
    }

    const randomIndex = Math.floor(Math.random() * pool.length);
    const randomCookie = pool[randomIndex];
    await this.setCurrentCookie(randomCookie);

    return {
      success: true,
      cookie: randomCookie,
      index: randomIndex,
      total: pool.length
    };
  }

  // 自动轮询cookie（如果当前cookie失败）
  async autoRotate(failedCookie = null) {
    const pool = await this.getCookiePool();
    if (pool.length === 0) {
      return { success: false, message: 'No cookies in pool for rotation' };
    }

    // 如果提供了失败的cookie，从池中移除
    if (failedCookie) {
      await this.removeFromCookiePool(failedCookie);
    }

    // 重新获取池（可能已经移除了失败的cookie）
    const updatedPool = await this.getCookiePool();
    if (updatedPool.length === 0) {
      return { success: false, message: 'No available cookies after removing failed one' };
    }

    return await this.rotateCookie();
  }

  // 获取cookie池状态
  async getPoolStatus() {
    const pool = await this.getCookiePool();
    const current = await this.getCurrentCookie();

    return {
      total: pool.length,
      current: current || null,
      currentIndex: current ? pool.indexOf(current) : -1,
      cookies: pool.map((cookie, index) => ({
        index,
        isCurrent: cookie === current,
        preview: cookie.substring(0, 50) + (cookie.length > 50 ? '...' : '')
      }))
    };
  }
}

module.exports = CookieManager;