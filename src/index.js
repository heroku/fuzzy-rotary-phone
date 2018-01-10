const gc = require("gc-stats")();
const request = require("request");
const EventLoopMonitor = require("./event-loop");

// Add timers that approximate the delay in the event loop
const eventLoopMonitor = new EventLoopMonitor();
eventLoopMonitor.start();

// pauseNS is the cumulative GC pause of the node program between GC runs.
// This is reset every metrics submission run.
let pauseNS = 0;

// usedHeapSize is the number of bytes in the heap that are actively being used.
let usedHeapSize = 0;

// totalHeapSize is the total number of bytes in the heap.
let totalHeapSize = 0;

// heapSizeLimit is the maximum size of the heap.
let heapSizeLimit = 0;

// gcCount is the number of garbage collections that have been observed between
// metrics runs. This is reset every metrics submission run.
let gcCount = 0;

// latencies contains the counts for various "buckets" of event loop latencies
// Ex: all latencies between 1ms and 2ms will be counted in the "1ms" bucket
// This is reset every metrics submission run.
let latencies = {};

// This contains our estimations for the amount of time the event loop is
// active. This is reset every metrics submission run.
let eventLoopPercentageEstimates = [];

// metricsURL is where the runtime metrics will be posted to. This is added
// to dynos by runtime iff the app is opped into the heroku runtime metrics
// beta.
const metricsURL = process.env.HEROKU_METRICS_URL;

// metricsInterval is the amount of time between metrics submissions.
const metricsInterval = 20000; // 20 seconds

// on every garbage collection, update the statistics.
gc.on("stats", stats => {
  gcCount++;

  pauseNS = pauseNS + stats.pause;
  usedHeapSize = stats.after.usedHeapSize;
  totalHeapSize = stats.after.totalHeapSize;
  heapSizeLimit = stats.after.heapSizeLimit;
});

eventLoopMonitor.on("data", ({ ticks }) => {
  const total = ticks.reduce((acc, time) => acc + time, 0);
  eventLoopPercentageEstimates.push(total / 4000);

  // This takes an array of ms latencies and buckets them. The buckets are
  // currently arbitrary, but can be decided based upon the needs of the
  // visualization in the metrics dashboard.
  ticks.reduce((acc, time) => {
    if (time <= 0) {
      acc["0"] = acc["0"] ? acc["0"] + 1 : 1;
    } else if (time === 1) {
      acc["1"] = acc["1"] ? acc["1"] + 1 : 1;
    } else if (time === 2) {
      acc["2"] = acc["2"] ? acc["2"] + 1 : 1;
    } else if (time <= 5) {
      acc["5"] = acc["5"] ? acc["5"] + 1 : 1;
    } else if (time <= 10) {
      acc["10"] = acc["10"] ? acc["10"] + 1 : 1;
    } else if (time <= 20) {
      acc["20"] = acc["20"] ? acc["20"] + 1 : 1;
    } else if (time <= 50) {
      acc["50"] = acc["50"] ? acc["50"] + 1 : 1;
    } else if (time <= 100) {
      acc["100"] = acc["100"] ? acc["100"] + 1 : 1;
    } else if (time <= 200) {
      acc["200"] = acc["200"] ? acc["200"] + 1 : 1;
    } else if (time <= 400) {
      acc["400"] = acc["400"] ? acc["400"] + 1 : 1;
    } else if (time <= 1000) {
      acc["1000"] = acc["1000"] ? acc["1000"] + 1 : 1;
    } else if (time <= 2000) {
      acc["2000"] = acc["2000"] ? acc["2000"] + 1 : 1;
    } else if (time > 2000) {
      acc["2000+"] = acc["2000+"] ? acc["2000+"] + 1 : 1;
    }
    return acc;
  }, latencies);
});

function averageArray(arr) {
  const sum = arr.reduce((a, b) => a + b, 0);
  return sum / arr.length;
}

// every 20 seconds, submit a metrics payload to metricsURL.
setInterval(() => {
  // the metrics data collected above.
  data = {
    counters: {
      "node.eventloop.latency.0.ms": latencies['0'] || 0,
      "node.eventloop.latency.1.ms": latencies['1'] || 0,
      "node.eventloop.latency.2.ms": latencies['2'] || 0,
      "node.eventloop.latency.5.ms": latencies['5'] || 0,
      "node.eventloop.latency.10.ms": latencies['10'] || 0,
      "node.eventloop.latency.20.ms": latencies['20'] || 0,
      "node.eventloop.latency.50.ms": latencies['50'] || 0,
      "node.eventloop.latency.100.ms": latencies['100'] || 0,
      "node.eventloop.latency.200.ms": latencies['200'] || 0,
      "node.eventloop.latency.400.ms": latencies['400'] || 0,
      "node.eventloop.latency.1000.ms": latencies['1000'] || 0,
      "node.eventloop.latency.2000.ms": latencies['2000'] || 0,
      "node.eventloop.latency.2000+.ms": latencies['2000+'] || 0,
      "node.gc.collections": gcCount,
      "node.gc.pause.ns": pauseNS
    },
    gauges: {
      "node.heap.inuse.bytes": usedHeapSize,
      "node.heap.total.bytes": totalHeapSize,
      "node.heap.limit.bytes": heapSizeLimit,
      "node.eventloop.usage.percent": averageArray(eventLoopPercentageEstimates)
    }
  };

  // post data to metricsURL
  options = {
    method: "POST",
    uri: metricsURL,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  };

  request(options, (error, resp, body) => {
    if (error !== null) {
      console.log(
        "[fuzzy-rotary-phone] error when trying to submit data: ",
        error
      );
      return;
    }

    if (resp.statusCode !== 200) {
      console.log(
        "[fuzzy-rotary-phone] expected 200 when trying to submit data, got:",
        resp.statusCode
      );
      console.log("[fuzzy-rotary-phone] body:", body);
      return;
    }
  });

  pauseNS = 0;
  gcCount = 0;
  eventLoopPercentageEstimates = [];
  latencies = {};
}, 20000); // 20 seconds
