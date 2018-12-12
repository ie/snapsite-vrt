module.exports = function(appContext) {

  return function consoleLogFromAppAction(message) {
    console.log(appContext.appTitle + (appContext.displayAction ? (' ' + appContext.displayAction) : '') + ': ' + message);
  };
};