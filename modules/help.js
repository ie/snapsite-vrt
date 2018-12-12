module.exports = function helpAction(appContext, argv) {
  var consoleLogFromAppAction = require('./console-log-from-app-action')(appContext);

  return function () {
    consoleLogFromAppAction('');
    console.log(argv.help());
    console.log();
    console.log('Examples:');
    console.log('');
    console.log('  Crawl and create reference images for all of examplesite.com.au to ./examplesite_com_au (~2hrs 20min for toyota.com.au):');
    console.log('  node ' + appContext.appFilename + ' -r examplesite.com.au');
    console.log('');
    console.log('  Test images for all of examplesite.com.au, and compare to reference images:');
    console.log('  node ' + appContext.appFilename + ' -t examplesite.com.au');
    console.log('');
    console.log('  Present report for last test against examplesite.com.au:');
    console.log('  node ' + appContext.appFilename + ' -p examplesite.com.au');
    console.log('');
    console.log('  Approve most recent test failures on examplesite.com.au:');
    console.log('  node ' + appContext.appFilename + ' -a examplesite.com.au');
    console.log('');
    console.log('  Delete the examplesite_com_au directory:');
    console.log('  node ' + appContext.appFilename + ' -d examplesite.com.au');
    console.log('');
    console.log('  Test only https://www.examplesite.com.au/prius-v (but output to ./examplesite_com_au rather than ./www_examplesite_com_au):');
    console.log('  node ' + appContext.appFilename + ' -t -u https://www.examplesite.com.au/prius-v -o examplesite.com.au');
    console.log('');
    console.log('  Create Backstop configuration files by domain name');
    console.log('  node ' + appContext.appFilename + ' -i examplesite.com.au');
    console.log('');
    process.exit(0);
  }
};