// Inside of `backstop.config.js` we export a function that returns the configuration object
module.exports = function(options) {
  var deepcopy = require('deepcopy');
  var extend = require('extend');

  var baseScenario = {
    "delay": 8000, // 4000 is sometimes not enough for Sirius BEP pages to process
    "selectors": [
      "document"
    ],
    "selectorExpansion": false
  };

  var scenarios = [];

  options.scenarios.forEach(function(scenarioOverrides) {
    var scenario = deepcopy(baseScenario);
    extend(scenario, scenarioOverrides);
    scenarios.push(scenario);
  });

  return {
    "id": "examplesite_screens",
    "viewports": [
      {
        "label": "phone-320",
        "width": 320,
        "height": 480
      },
      {
        "label": "desktop-1920",
        "width": 1920,
        "height": 1080
      }
    ],
    "onBeforeScript": "chromy/onBefore.js",
    "onReadyScript": "chromy/onReady.js",
    "scenarios": scenarios,
    // We're just going to have a single scenario run per Backstop invocation, so that
    // the regression report per URL is very simple.
    "fileNameTemplate": "{scenarioLabel}_{viewportIndex}_{viewportLabel}",
    "paths": {
      "bitmaps_reference": options.backstopDataPath + "/bitmaps_reference",
      "bitmaps_test": options.backstopDataPath + "/bitmaps_test",
      "engine_scripts": "engine_scripts",
      "html_report": options.backstopDataPath + "/html_report",
      "ci_report": options.backstopDataPath + "/ci_report"
    },
    "report": ["CI"],
    "engine": "chrome",
    "engineFlags": [],
    "engineOptions": {
      "waitTimeout": options.timeout,
      "gotoTimeout": options.timeout,
      "loadTimeout": options.timeout,
      "evaluateTimeout": options.timeout
    },
    "asyncCaptureLimit": options.asyncCaptureLimit,
    "asyncCompareLimit": options.asyncCompareLimit,
    "debug": false,
    "debugWindow": false
  }
};