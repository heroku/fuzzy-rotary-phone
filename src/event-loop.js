const EventEmitter = require("events");
const INTERVAL = 10;
const COUNTER_INTERVAL_DEFAULT = 4000; // 4 seconds

function diffToMs(diff) {
  return diff[0] /*seconds*/ * 1000 + diff[1] /*nanoseconds*/ / 1000000;
}

class EventLoopMonitor extends EventEmitter {
  constructor() {
    super();
    this._loopMonitor = null;
    this._counter = null;
    this._time = process.hrtime();
    this._ticks = [];
  }

  stop() {
    clearInterval(this._loopMonitor);
    clearInterval(this._counter);
  }

  start(counterInterval = COUNTER_INTERVAL_DEFAULT) {
    this.stop();
    this.measureTick(counterInterval);
    this._counter = setInterval(() => {
      this.emit("data", { ticks: this._ticks });
      this._ticks = [];
    }, counterInterval);
  }

  measureTick(counterInterval) {
    const start = process.hrtime();
    this._loopMonitor = setTimeout(() => {
      const diff = process.hrtime(start);
      this._ticks.push(Math.floor(diffToMs(diff) - INTERVAL));
      this.measureTick();
    }, INTERVAL);
  }
}

module.exports = EventLoopMonitor;
