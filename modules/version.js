module.exports = function versionAction(appContext, argv) {
  var consoleLogFromAppAction = require('./console-log-from-app-action')(appContext);

  return function () {
    consoleLogFromAppAction(argv.version());
    process.exit(0);
  };
};