'use strict';

const fs = require('fs');
const path = require('path');
const { DEFAULT_RULES, DEFAULT_SETTINGS } = require('./defaults');

const CATS = ['work', 'distraction', 'other'];
const SLOT_MINUTES = 5;
const KEEP_DAYS = 120;

function dayKey(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

function emptyDay() {
  return { work: 0, distraction: 0, other: 0, blocks: 0, pets: 0, focusSessions: 0, focusSeconds: 0, items: {}, slots: {} };
}

class Store {
  constructor(dir) {
    this.file = path.join(dir, 'work-companion.json');
    this.firstRun = !fs.existsSync(this.file);
    let data = {};
    try { data = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { /* premier lancement ou fichier corrompu */ }
    this.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
    this.rules = Array.isArray(data.rules) ? data.rules : DEFAULT_RULES.map((r) => ({ ...r }));
    this.days = data.days && typeof data.days === 'object' ? data.days : {};
    this.dirty = this.firstRun;
  }

  today() {
    const k = dayKey();
    if (!this.days[k]) {
      this.days[k] = emptyDay();
      this.prune();
    }
    return this.days[k];
  }

  track(key, label, cat, seconds) {
    if (!CATS.includes(cat) || seconds <= 0) return;
    const d = this.today();
    d[cat] += seconds;
    const item = d.items[key] || (d.items[key] = { label, cat, s: 0 });
    item.label = label;
    item.cat = cat;
    item.s += seconds;
    const now = new Date();
    const slot = Math.floor((now.getHours() * 60 + now.getMinutes()) / SLOT_MINUTES);
    const s = d.slots[slot] || (d.slots[slot] = [0, 0, 0]);
    s[CATS.indexOf(cat)] += seconds;
    this.dirty = true;
  }

  addBlock() { this.today().blocks++; this.dirty = true; }
  addPet() { this.today().pets++; this.dirty = true; }

  addFocus(seconds, completed) {
    const d = this.today();
    d.focusSeconds += Math.max(0, seconds);
    if (completed) d.focusSessions++;
    this.dirty = true;
  }

  reclassifyToday(key, cat) {
    const d = this.today();
    const item = d.items[key];
    if (!item || !CATS.includes(cat) || item.cat === cat) return;
    d[item.cat] = Math.max(0, d[item.cat] - item.s);
    d[cat] += item.s;
    item.cat = cat;
    this.dirty = true;
  }

  summary() {
    const d = this.today();
    const items = Object.entries(d.items)
      .map(([key, v]) => ({ key, label: v.label, cat: v.cat, s: v.s }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 20);
    const focused = d.work + d.distraction;
    return {
      date: dayKey(),
      work: d.work, distraction: d.distraction, other: d.other,
      blocks: d.blocks, pets: d.pets, focusSessions: d.focusSessions, focusSeconds: d.focusSeconds,
      score: focused > 60 ? Math.round((d.work / focused) * 100) : null,
      items, slots: d.slots,
    };
  }

  history(n = 7) {
    const out = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const k = dayKey(date);
      const d = this.days[k] || emptyDay();
      out.push({ date: k, work: d.work, distraction: d.distraction, other: d.other, blocks: d.blocks, focusSeconds: d.focusSeconds, focusSessions: d.focusSessions });
    }
    return out;
  }

  setSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    this.dirty = true;
    return this.settings;
  }

  setRules(rules) {
    this.rules = rules;
    this.dirty = true;
  }

  prune() {
    const keys = Object.keys(this.days).sort();
    while (keys.length > KEEP_DAYS) delete this.days[keys.shift()];
  }

  save(force = false) {
    if (!this.dirty && !force) return;
    const data = JSON.stringify({ version: 1, settings: this.settings, rules: this.rules, days: this.days });
    const tmp = this.file + '.tmp';
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(tmp, data, 'utf8');
      fs.renameSync(tmp, this.file);
      this.dirty = false;
    } catch (e) {
      console.error('[store] sauvegarde impossible', e);
    }
  }
}

module.exports = Store;
