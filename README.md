# fuzzy-rotary-phone

A simple npm package to add heroku runtime metrics to an existing node.js 
application.

## Usage

```console
$ npm install --save fuzzy-rotary-phone
```

And then in the main file of each process you want monitored add:
```javascript
require("fuzzy-rotary-phone");
```

## Metrics collected

```json
{
  "counters": {
    "node.gc.collections": 0,
    "node.gc.pause.ns": 0
  },
  "gauges": {
    "node.heap.inuse.bytes": 12472640,
    "node.heap.total.bytes": 17158144,
    "node.heap.limit.bytes": 1501560832
  }
}
```

See https://github.com/Xe/fuzzy-rotary-phone/blob/master/src/index.js#L4 for more
explanation on the individual metrics being monitored.
