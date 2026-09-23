'use strict';

const EventEmitter = require('events');

// Minuteur de sessions focus / pause (façon Pomodoro)
class Focus extends EventEmitter {
  constructor() {
    super();
    this.state = { kind: null };
    this.timer = null;
  }

  get active() { return !!this.state.kind; }
  isFocus() { return this.state.kind === 'focus'; }

  start(minutes, kind = 'focus') {
    minutes = Math.max(1, Math.min(240, Number(minutes) || 25));
    if (this.state.kind) this._finish(false);
    const now = Date.now();
    this.state = { kind, minutes, startedAt: now, endsAt: now + minutes * 60000 };
    this.timer = setTimeout(() => this._finish(true), minutes * 60000);
    this.emit('start', { ...this.state });
    return this.snapshot();
  }

  stop() {
    if (this.state.kind) this._finish(false);
    return this.snapshot();
  }

  _finish(completed) {
    clearTimeout(this.timer);
    const s = this.state;
    this.state = { kind: null };
    const elapsed = Math.min(Date.now(), s.endsAt) - s.startedAt;
    this.emit('end', { ...s, completed, elapsed });
  }

  snapshot() {
    return { ...this.state, remaining: this.state.kind ? Math.max(0, this.state.endsAt - Date.now()) : 0 };
  }
}

module.exports = Focus;
