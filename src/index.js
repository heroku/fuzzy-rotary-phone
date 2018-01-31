const gc = require("gc-stats")();
const request = require("request");
const EventLoopMonitor = require("./event-loop");

// Add timers that approximate the delay in the event loop
const eventLoopMonitor = new EventLoopMonitor();
eventLoopMonitor.start();

// pauseNS is the cumulative GC pause of the node program between GC runs.
// This is reset every metrics submission run.
let pauseNS = 0;

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
});

eventLoopMonitor.on("data", ({ ticks }) => {
  const total = ticks.reduce((acc, time) => acc + time, 0);
  eventLoopPercentageEstimates.push(total / 4000);

  // This takes an array of ms latencies and buckets them. The buckets are
  // currently arbitrary, but can be decided based upon the needs of the
  // visualization in the metrics dashboard.
  ticks.reduce((acc, time) => {
    if (time <= 0.1) {
      acc["0.1"] = acc["0.1"] ? acc["0.1"] + 1 : 1;
    } else if (time <= 0.25) {
      acc["0.25"] = acc["0.25"] ? acc["0.25"] + 1 : 1;
    } else if (time <= 0.5) {
      acc["0.5"] = acc["0.5"] ? acc["0.5"] + 1 : 1;
    } else if (time <= 1) {
      acc["1"] = acc["1"] ? acc["1"] + 1 : 1;
    } else if (time <= 2) {
      acc["2"] = acc["2"] ? acc["2"] + 1 : 1;
    } else if (time <= 4) {
      acc["4"] = acc["4"] ? acc["4"] + 1 : 1;
    } else if (time <= 8) {
      acc["8"] = acc["8"] ? acc["8"] + 1 : 1;
    } else if (time <= 16) {
      acc["16"] = acc["16"] ? acc["16"] + 1 : 1;
    } else if (time <= 32) {
      acc["32"] = acc["32"] ? acc["32"] + 1 : 1;
    } else if (time <= 64) {
      acc["64"] = acc["64"] ? acc["64"] + 1 : 1;
    } else if (time <= 128) {
      acc["128"] = acc["128"] ? acc["128"] + 1 : 1;
    } else if (time <= 256) {
      acc["256"] = acc["256"] ? acc["256"] + 1 : 1;
    } else if (time <= 512) {
      acc["512"] = acc["512"] ? acc["512"] + 1 : 1;
    } else if (time <= 1024) {
      acc["1024"] = acc["1024"] ? acc["1024"] + 1 : 1;
    } else if (time <= 2048) {
      acc["2048"] = acc["2048"] ? acc["2048"] + 1 : 1;
    } else if (time > 2048) {
      acc["2048+"] = acc["2048+"] ? acc["2048+"] + 1 : 1;
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

  // aa is the averate of the event loop percentage estimates.
  // this is a variable because 4/0 in node is Infinity, not a
  // runtime exception.
  let aa = averageArray(eventLoopPercentageEstimates);

  if (aa == Infinity) {
    aa = 0;
  }

  data = {
    counters: {
      "node.eventloop.latency.0.1.ms": latencies['0.1'] || 0,
      "node.eventloop.latency.0.25.ms": latencies['0.25'] || 0,
      "node.eventloop.latency.0.5.ms": latencies['0.5'] || 0,
      "node.eventloop.latency.1.ms": latencies['1'] || 0,
      "node.eventloop.latency.2.ms": latencies['2'] || 0,
      "node.eventloop.latency.4.ms": latencies['4'] || 0,
      "node.eventloop.latency.8.ms": latencies['8'] || 0,
      "node.eventloop.latency.16.ms": latencies['16'] || 0,
      "node.eventloop.latency.32.ms": latencies['32'] || 0,
      "node.eventloop.latency.64.ms": latencies['64'] || 0,
      "node.eventloop.latency.128.ms": latencies['128'] || 0,
      "node.eventloop.latency.256.ms": latencies['256'] || 0,
      "node.eventloop.latency.512.ms": latencies['512'] || 0,
      "node.eventloop.latency.1024.ms": latencies['1024'] || 0,
      "node.eventloop.latency.2048.ms": latencies['2048'] || 0,
      "node.eventloop.latency.2048+.ms": latencies['2048+'] || 0,
      "node.gc.collections": gcCount,
      "node.gc.pause.ns": pauseNS
    },
    gauges: {
      "node.eventloop.usage.percent": aa
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
