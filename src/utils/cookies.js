const { readJson, writeJson } = require('./fileStore');
const { log } = require('./logger');

const FILE = 'cookies.json';

function normalizeCookiesInput(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input.filter(Boolean).map(String).map(s => s.trim()).filter(Boolean);
  const s = String(input);
  // Support multi-line input; one cookie header per line
  const parts = s.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  return parts.length ? parts : (s.trim() ? [s.trim()] : []);
}

function readCookiesFile() {
  const obj = readJson(FILE, { cookies: [], index: 0 });
  if (!Array.isArray(obj.cookies)) obj.cookies = normalizeCookiesInput(obj.cookies);
  if (typeof obj.index !== 'number' || obj.index < 0) obj.index = 0;
  return obj;
}

function writeCookiesFile(obj) {
  const out = { cookies: normalizeCookiesInput(obj.cookies), index: Number(obj.index) || 0 };
  writeJson(FILE, out);
}

function getCookiesList() {
  const { cookies } = readCookiesFile();
  return cookies;
}

function setCookies(input) {
  const curr = readCookiesFile();
  curr.cookies = normalizeCookiesInput(input);
  if (curr.index >= curr.cookies.length) curr.index = 0;
  writeCookiesFile(curr);
  return { ok: true, count: curr.cookies.length };
}

function addCookie(cookie) {
  if (!cookie || !cookie.trim()) return { ok: false };
  const curr = readCookiesFile();
  curr.cookies.push(cookie.trim());
  writeCookiesFile(curr);
  return { ok: true, count: curr.cookies.length };
}

function deleteCookie(index) {
  const curr = readCookiesFile();
  if (index < 0 || index >= curr.cookies.length) return { ok: false };
  curr.cookies.splice(index, 1);
  if (curr.index >= curr.cookies.length) curr.index = 0;
  writeCookiesFile(curr);
  return { ok: true, count: curr.cookies.length };
}

function pickCookieRoundRobin() {
  const curr = readCookiesFile();
  const list = curr.cookies || [];
  if (!list.length) return null;
  const idx = curr.index % list.length;
  const chosen = list[idx];
  curr.index = (idx + 1) % list.length;
  writeCookiesFile(curr);
  log('[cookie-rr]', `idx=${idx} -> next=${curr.index}`);
  return chosen;
}

module.exports = {
  getCookiesList,
  setCookies,
  addCookie,
  deleteCookie,
  pickCookieRoundRobin
};

