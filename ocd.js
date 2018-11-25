var appTitle = 'ocd';
var appFilename = 'ocd.js';
var configFilePath = './backstop.config.js';
var maxShootBatchSize = 5; // 10 or higher known to give timeouts for batches of heavier pages @ 120000
var backstopAsyncCaptureLimit = maxShootBatchSize * 2;
var backstopAsyncCompareLimit = 10;
var backstopTimeout = 300000;//120000;

var supercrawler = require('supercrawler');
var fs = require('fs');
var fse = require('fs-extra');
var rmrf = require('rmrf');
var backstop = require('backstopjs');
var nodejs_argv = require("nodejs-argv");
var Promise = require("bluebird");

var overrideDomainForSiteDirPath;
var overrideSiteDirPath;

// Stuff the SIGINT handler needs to access
var exitCode;
var batchOfReferenceUrls;

// Stuff both SIGINT and console log needs to access
var displayAction;

var argv = nodejs_argv.new();

function consoleLogFromAppAction(message) {
  console.log(appTitle + (displayAction ? (' ' + displayAction) : '') + ': ' + message);
}

function helpAction() {
  consoleLogFromAppAction('');
  console.log(argv.help() );
  console.log();
  console.log('Examples:');
  console.log('');
  console.log('  Crawl and create reference images for all of toyota.com.au to ./toyota_com_au (~2hrs 20min):');
  console.log('  node ' + appFilename + ' -r toyota.com.au');
  console.log('');
  console.log('  Test images for all of toyota.com.au, and compare to reference images:');
  console.log('  node ' + appFilename + ' -t toyota.com.au');
  console.log('');
  console.log('  Present report for last test against toyota.com.au:');
  console.log('  node ' + appFilename + ' -p toyota.com.au');
  console.log('');
  console.log('  Approve most recent test failures on toyota.com.au:');
  console.log('  node ' + appFilename + ' -a toyota.com.au');
  console.log('');
  console.log('  Delete the toyota_com_au directory:');
  console.log('  node ' + appFilename + ' -d toyota.com.au');
  console.log('');
  console.log('  Test only https://www.toyota.com.au/prius-v (but output to ./toyota_com_au rather than ./www_toyota_com_au):');
  console.log('  node ' + appFilename + ' -t -u https://www.toyota.com.au/prius-v -o toyota.com.au');
  process.exit(0);
}

function versionAction() {
  consoleLogFromAppAction(argv.version());
  process.exit(0);
}

function getSiteDirPath(domain) {
  if (overrideSiteDirPath) {
    return overrideSiteDirPath;
  }
  if (overrideDomainForSiteDirPath) {
    return './sites/' + filenameifyUrl(overrideDomainForSiteDirPath);
  }
  return './sites/' + filenameifyUrl(domain);
}

function getBackstopDataDirPath(siteDirPath) {
  return siteDirPath + '/backstop_data';
}

function getCrawlBodyDirPath(siteDirPath) {
  return siteDirPath + '/html';
}

function getCrawlDbDirPath(siteDirPath) {
  return siteDirPath;
}

function getCrawlDbFilePath(siteDirPath) {
  return siteDirPath + '/' + 'supercrawler.sqlite';
}

function getCrawledUrlsLogFilePath(siteDirPath) {
  return siteDirPath + '/' + 'crawled-urls.log';
}

function getBackstopReferenceDirPath(siteDirPath) {
  return siteDirPath + '/backstop_data/bitmaps_reference';
}

function getReferencedUrlsLogFilePath(siteDirPath) {
  return siteDirPath + '/' + 'referenced-urls.log';
}

function getTestedUrlsLogFilePath(siteDirPath) {
  return siteDirPath + '/' + 'tested-urls.log';
}

function getBackstopTestDirPath(siteDirPath) {
  return siteDirPath + '/backstop_data/bitmaps_test';
}

function getBackstopReportForBrowserDirPath(siteDirPath) {
  return siteDirPath + '/backstop_data/html_report';
}

function getBackstopReportForCiDirPath(siteDirPath) {
  return siteDirPath + '/backstop_data/ci_report';
}

function getUrlProtocol(url) {
  var protocolDomainPath = url.match(/([^:]*):\/\/([^\/]*)(.*)/);
  return protocolDomainPath ? protocolDomainPath[1] : null;
}

function getUrlDomain(url) {
  var protocolDomainPath = url.match(/([^:]*):\/\/([^\/]*)(.*)/);
  if (protocolDomainPath) {
    return protocolDomainPath[2];
  }

  var domain = url.match(/([^\/]*\.[^\/]*)/);
  return domain ? domain[1] : null;
}

function getUrlPath(url) {
  var protocolDomainPath = url.match(/([^:]*):\/\/([^\/]*)(.*)/);
  if (protocolDomainPath) {
    return protocolDomainPath[3];
  }

  var domain = url.match(/([^\/]*\.[^\/]*)(.*)/);
  return domain ? domain[2] : null;
}

function normalizeUrl(url) {
  var protocol = getUrlProtocol(url) || 'http';
  var domain = getUrlDomain(url);
  var path = getUrlPath(url) || '/';

  if (!domain) {
    return null;
  }

  return protocol + '://' + domain + path;
}

function getFirstUrlFromArgv() {
  var urls = process.argv.slice(2).filter(getUrlDomain);
  return urls.length ? urls[0] : null;
}

function getFirstUrlFromArgvNormalized() {
  var firstUrlFromArgv = getFirstUrlFromArgv();
  return firstUrlFromArgv ? normalizeUrl(firstUrlFromArgv) : null;
}

function filenameifyUrl(url) {
  return url.replace(/(:\/\/|\/)/g,'__').replace(/[<>:"\\|?*. ]/g, '_');
}

function writeLineToFile(filePath, line, onlyWriteLinesNotAlreadyInFile) {
  if (line instanceof Array) {
    throw 'Value is an array, but non-array expected';
  }

  return writeLinesToFile.apply(this, arguments);
}

function writeLinesToFile(filePath, stringOrArrayOfLines, onlyWriteLinesNotAlreadyInFile) {
  var content;

  if (!(stringOrArrayOfLines instanceof Array)) {
    content = [stringOrArrayOfLines];
  } else {
    content = stringOrArrayOfLines;
  }

  if (fs.existsSync(filePath) && onlyWriteLinesNotAlreadyInFile) {
    var existingLines = readLinesFromFile(filePath);
    content = arraySubtract(content, existingLines);
  }

  fs.appendFileSync(filePath, content.join('\n') + '\n', { encoding: 'utf8' });
}

function readLinesFromFile(filePath) {
  var fileContent = fs.readFileSync(filePath, 'utf8');
  return fileContent.replace(/[\r\n]?[\r\n]$/, '').split('\n').map(function(el) { return el.replace(/[\r\n]/g, ''); });
}

function arraySubtract(startEls, toSubtractEls) {
  return startEls.filter(function(startEl) {
    return toSubtractEls.indexOf(startEl) === -1;
  })
}

function deleteIfExists(filePath, onDeleteCallback) {
  try {
    fs.unlinkSync(filePath);
    if (onDeleteCallback) {
      onDeleteCallback(filePath);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

function deleteSiteOutputDirAction(url) {
  var domain = getUrlDomain(url);

  if (!domain) {
    consoleLogFromAppAction('A valid URL or domain must be specified.');
    console.log('e.g. node ' + appFilename + ' -d http://toyota.com.au/');
    console.log('  or node ' + appFilename + ' -d toyota.com.au');
    exitCleanly(1);
  }

  consoleLogFromAppAction('Removing site output directory for ' + domain);

  var siteDirPath = getSiteDirPath(domain);
  deleteDir(siteDirPath, 'delete');

  exitCleanly(0);
}

function deleteDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    consoleLogFromAppAction('No such directory to delete "' + dirPath + '".');
    return;
  }

  rmrf(dirPath);
  consoleLogFromAppAction('Removed "' + dirPath + '" OK.');
}

function deleteFile(filePath) {
  if (!fs.existsSync(filePath)) {
    consoleLogFromAppAction('No such file to delete "' + filePath + '".');
    return;
  }

  fs.unlinkSync(filePath);
  consoleLogFromAppAction('Removed "' + filePath + '" OK.');
}

function deleteReferenceFiles(siteDirPath) {
  deleteFile(getReferencedUrlsLogFilePath(siteDirPath));
  deleteDir(getBackstopReferenceDirPath(siteDirPath))
}

function deleteTestFiles(siteDirPath) {
  deleteFile(getTestedUrlsLogFilePath(siteDirPath));
  deleteDir(getBackstopTestDirPath(siteDirPath));
  deleteDir(getBackstopReportForBrowserDirPath(siteDirPath));
  deleteDir(getBackstopReportForCiDirPath(siteDirPath));
}

function crawl(siteDirPath, crawlDomain, crawlStartingUrl, onVisitedHandler) {
  // 1. Create a new instance of the Crawler object, providing configuration
  // details. Note that configuration cannot be changed after the object is 
  // created. 
  var crawler = new supercrawler.Crawler({
    // By default, Supercrawler uses a simple FIFO queue, which doesn't support 
    // retries or memory of crawl state. For any non-trivial crawl, you should 
    // create a database. Provide your database config to the constructor of 
    // DbUrlList. 
    urlList: new supercrawler.DbUrlList({
      db: {
        database: "crawler",
        username: "root",
        password: "password",
        sequelizeOpts: {
          dialect: "sqlite",
          storage: getCrawlDbFilePath(siteDirPath)
        }
      }
    }),
    // Time (ms) between requests
    interval: 100,
    // Maximum number of requests at any one time. 
    concurrentRequestsLimit: 1, // WARNING: Backstop becomes unstable if we change this. Change maxShootBatchSize instead.
    // Time (ms) to cache the results of robots.txt queries. 
    robotsCacheTime: 3600000,
    // Query string to use during the crawl. 
    userAgent: "Mozilla/5.0 (compatible; supercrawler/1.0; +https://github.com/brendonboshell/supercrawler)",
    // Custom options to be passed to request. 
    request: {
      headers: {
        'x-custom-header': 'example'
      }
    }
  });

  // Get "Sitemaps:" directives from robots.txt 
  crawler.addHandler(supercrawler.handlers.robotsParser());
   
  // Crawl sitemap files and extract their URLs. 
  crawler.addHandler(supercrawler.handlers.sitemapsParser());
   
  // Pick up <a href> links from HTML documents 
  crawler.addHandler("text/html", supercrawler.handlers.htmlLinkParser({
    // Restrict discovered links to the following hostnames. 
    hostnames: [ crawlDomain ]
  }));
   
  // Custom content handler for HTML pages. 
  crawler.addHandler("text/html", function (context) {
    // Restrict at the screenshot level to *.toyota.com.au or toyota.com.au itself
    var urlDomain = getUrlDomain(context.url);
    var crawlDomainEscaped = crawlDomain.replace('.', '\\.');
    var crawlDomainRegex = new RegExp('^((.*\\.)?' + crawlDomainEscaped + ')$');
    if (!urlDomain.match(crawlDomainRegex)) {
      return;
    }

    // TODO: Allow customisation of this
    if (context.url.match(/404\?item/)) {
      consoleLogFromAppAction('-> Aborting - this is a 404 page giving a HTTP 200 response!');
      return;
    }

    return onVisitedHandler(context);
  });

  fse.ensureDirSync(getCrawlDbDirPath(siteDirPath));

  crawler.getUrlList()
    .insertIfNotExists(new supercrawler.Url(crawlStartingUrl))
    .then(function () {
      consoleLogFromAppAction('Created new supercrawler');
      return crawler.start();
    });

  crawler.on('crawlurl', function(url) {
    //consoleLogFromApp('supercrawler fired "crawlurl" for ' + url);
  });

  return new Promise(function(resolve) {
    crawler.on('urllistempty', function() {
      consoleLogFromAppAction('supercrawler fired "urllistempty" so let\'s stop.');
      crawler.stop();
      resolve();
    });
  });
}

function saveAsFile(siteDirPath, context) {
  // Flatten URL as filename, '://' and '/' -> '__', illegal chars -> '_'
  var filename = filenameifyUrl(context.url) + '.txt';
  filename = filename.substring(0, 96);

  var sizeKb = Math.round(Buffer.byteLength(context.body) / 1024);
  consoleLogFromAppAction('-> Running saveAsFile for ' + context.url + '(size: ' + sizeKb + ' KiB)');

  var crawlBodyDirPath = getCrawlBodyDirPath(siteDirPath);

  fse.ensureDirSync(crawlBodyDirPath);
  fs.writeFile(crawlBodyDirPath + '/' + filename, context.body, function(err) {
    if (err) {
      consoleLogFromAppAction(err);
    }
  });
}

function crawlAction(siteDirPath, crawlStartingUrl, force) {
  crawlAndMaybeReference(siteDirPath, crawlStartingUrl, force, true).then(function() {
    exitCleanly(0);
  });
}

function crawlAndReferenceAction(siteDirPath, crawlStartingUrl, force) {
  var crawledUrlsLogFilePath = getCrawledUrlsLogFilePath(siteDirPath);
  var referencedUrlsLogFilePath = getReferencedUrlsLogFilePath(siteDirPath);

  consoleLogFromAppAction('Starting crawl and reference');

  function doCrawlAndReference() {
    return crawlAndMaybeReference(siteDirPath, crawlStartingUrl, force, false).then(function() {
      consoleLogFromAppAction('Completed crawl and reference');
      exitCleanly(0);
    });
  }

  if (fs.existsSync(crawledUrlsLogFilePath) && fs.existsSync(referencedUrlsLogFilePath)) {
    var crawledUrls = readLinesFromFile(crawledUrlsLogFilePath);
    var referencedUrls = readLinesFromFile(referencedUrlsLogFilePath);
    var referencedUrlsStillToGo = arraySubtract(crawledUrls, referencedUrls);
    if (referencedUrlsStillToGo.length) {
      consoleLogFromAppAction('Found a gap of ' + referencedUrlsStillToGo.length + ' crawled URLs which still need referencing.');
      consoleLogFromAppAction('Processing those first...');

      shootAndAppendLogUrls(siteDirPath, referencedUrlsStillToGo, 'reference').then(function() {
        consoleLogFromAppAction('Done catching up on gap between reference and crawl. Resuming crawl-and-reference...');
        return doCrawlAndReference();
      });
    }

    return doCrawlAndReference();
  } else {
    return doCrawlAndReference();
  }
}

function crawlAndMaybeReference(siteDirPath, crawlStartingUrl, force, crawlOnly) {
  var backstopAction = crawlOnly ? '' : 'reference';

  if (!crawlStartingUrl) {
    consoleLogFromAppAction('A valid crawl starting URL must be specified.');
    console.log('e.g. node ' + appFilename + ' --' + displayAction +' http://toyota.com.au/');
    exitCleanly(1);
  }

  if (crawlStartingUrl !== getFirstUrlFromArgv()) {
    consoleLogFromAppAction('Interpreted URL as ' + crawlStartingUrl)
  }

  if (force) {
    deleteDir(siteDirPath);
  }

  if (crawlOnly) {
    consoleLogFromAppAction('' + appTitle + ' will now crawl the site and log URLs to the crawl database. You can run Backstop against all crawled URLs using the --reference action.');
  }

  batchOfReferenceUrls = [];

  function referenceThenClearBatch() {
    consoleLogFromAppAction('    Batch starting: ');
    console.log(batchOfReferenceUrls.join('\n'));

    return shootAndAppendLogUrls(siteDirPath, batchOfReferenceUrls, backstopAction).then(function() {
      console.log();
      consoleLogFromAppAction('    Batch completed.');
      batchOfReferenceUrls = [];
    });
  }

  function onVisitedHandler(context) {
    consoleLogFromAppAction('supercrawler has visited ' + context.url);

    writeLineToFile(getCrawledUrlsLogFilePath(siteDirPath), context.url);

    saveAsFile(siteDirPath, context);

    if (crawlOnly) {
      return true;
    }

    batchOfReferenceUrls.push(context.url);

    if (batchOfReferenceUrls.length === maxShootBatchSize) {
      return referenceThenClearBatch();
    }

    return true;
  }

  var crawlDomain = getUrlDomain(crawlStartingUrl);

  return crawl(siteDirPath, crawlDomain, crawlStartingUrl, onVisitedHandler).then(function() {
    consoleLogFromAppAction('Crawl completed.');

    // Any leftovers in the batch? Process/flush them
    return referenceThenClearBatch();
  });
}

function referenceUrlsAction(siteDirPath, urls) {
  consoleLogFromAppAction('Starting:');
  console.log(urls.join('\n'));

  shootAndAppendLogUrls(siteDirPath, urls, 'reference').then(function() {
    consoleLogFromAppAction('Completed. URLs referenced logged to ' + getReferencedUrlsLogFilePath(siteDirPath));
    exitCleanly(0);
  });
}

function testUrlsAction(siteDirPath, urls, overrideTestUrlDomainAndProtocol) {
  var testedUrlsFilePath = getTestedUrlsLogFilePath(siteDirPath);

  deleteIfExists(testedUrlsFilePath, function(filePath) {
    consoleLogFromAppAction('Removed "' + filePath + '" OK.');
  });

  consoleLogFromAppAction('Starting:');
  console.log(urls.join('\n'));

  urls = getTestAndReferenceUrlsUsingReferenceUrls(urls, overrideTestUrlDomainAndProtocol);

  shootAndAppendLogUrls(siteDirPath, urls, 'test').then(function() {
    consoleLogFromAppAction('Completed. URLs tested logged to ' + testedUrlsFilePath);
    consoleLogFromAppAction('Run node.js ' + appFilename + ' --report to view results.');
    exitCleanly(0);
  }).catch(function() {
    consoleLogFromAppAction('Some tests failed. URLs tested logged to ' + testedUrlsFilePath);
    consoleLogFromAppAction('Run node.js ' + appFilename + ' --report to view results.');
    exitCleanly(1);
  });
}

function createScenario(urlTuple) {
  return {
    'label': urlTuple.referenceUrl, // used to match filenames during comparison
    'url': urlTuple.testUrl,
    'referenceUrl': urlTuple.referenceUrl
  };
}

function normalizeUrlsOrUrlTuplesToUrlTuples(urlsOrUrlTuples) {
  return urlsOrUrlTuples.map(function(urlOrUrlTuple) {
    if (typeof urlOrUrlTuple === 'string') {
      return { 'referenceUrl': urlOrUrlTuple, 'testUrl': urlOrUrlTuple };
    }

    return urlOrUrlTuple;
  });
}

function shootAndAppendLogUrls(siteDirPath, urlsOrUrlTuples, backstopAction) {
  var backstopDataDirPath = getBackstopDataDirPath(siteDirPath);

  var urlTuples = normalizeUrlsOrUrlTuplesToUrlTuples(urlsOrUrlTuples);
  var referenceUrls = urlTuples.map(function (url) { return url.referenceUrl; });
  var testUrls = urlTuples.map(function (url) { return url.testUrl; });

  var urlsForDisplay = backstopAction === 'reference' ? referenceUrls : (backstopAction === 'test' ? testUrls : []);

  if (!backstopAction) {
    consoleLogFromAppAction('-> Dry run: BackstopJS suppressed for ' + urlsForDisplay.length + ' URLs (' + urlsForDisplay.join(', ') + ')');
    consoleLogFromAppAction('   Output target would have been to ' + backstopDataDirPath);
    return Promise.resolve(urlsOrUrlTuples);
  }

  consoleLogFromAppAction('-> About to run BackstopJS "' + backstopAction + '" for ' + urlsForDisplay.length + ' URLs (' + urlsForDisplay.join(', ') + ')');
  consoleLogFromAppAction('   Outputting to ' + backstopDataDirPath);

  fse.ensureDirSync(backstopDataDirPath);

  return backstop(backstopAction, {
    i: true, // i (incremental): do not clear out the reference folder
    config: require(configFilePath)({
      'scenarios': urlTuples.map(createScenario),
      'backstopDataPath': backstopDataDirPath.replace(/^\.\//, ''),
      'asyncCaptureLimit': backstopAsyncCaptureLimit,
      'asyncCompareLimit': backstopAsyncCompareLimit,
      'timeout': backstopTimeout
    })
  }).then(function() {
    return Promise.resolve(urlsOrUrlTuples);
  }).finally(function() {
    if (backstopAction === 'reference') {
      writeLinesToFile(getReferencedUrlsLogFilePath(siteDirPath), referenceUrls, true);
    }

    if (backstopAction === 'test') {
      writeTestUrlsLogFile(getTestedUrlsLogFilePath(siteDirPath), urlTuples);
    }
  });
}

function referenceAllCrawledUrlsAction(siteDirPath, force) {
  var crawledUrlsLogFilePath = getCrawledUrlsLogFilePath(siteDirPath);
  var referenceUrls = readLinesFromFile(crawledUrlsLogFilePath);
  var alreadyReferencedUrls = [];

  consoleLogFromAppAction('Found ' + referenceUrls.length + ' URLs in ' + crawledUrlsLogFilePath);

  if (force) {
    deleteReferenceFiles(siteDirPath);
    deleteTestFiles(siteDirPath);
  }

  var referencedUrlsLogFilePath = getReferencedUrlsLogFilePath(siteDirPath);
  if (fs.existsSync(referencedUrlsLogFilePath)) {
    alreadyReferencedUrls = readLinesFromFile(referencedUrlsLogFilePath);
    referenceUrls = arraySubtract(referenceUrls, alreadyReferencedUrls);

    consoleLogFromAppAction('Excluding ' + alreadyReferencedUrls.length + ' found URLs in ' + referencedUrlsLogFilePath);
  }

  if (!referenceUrls.length) {
    consoleLogFromAppAction('Nothing to do!');
    console.log();
    console.log('All crawled URLs have already been referenced.');
    console.log('- Try the --force flag to re-reference all crawled URLs anyway');
    console.log('- Complete any unfinished crawl using --crawl');
    console.log('- Force a crawl from scratch with --crawl -f');
    exitCleanly(0);
  }

  shootAndAppendLogUrls(siteDirPath, referenceUrls, 'reference').then(function() {
    consoleLogFromAppAction('Completed. URLs referenced logged to ' + referencedUrlsLogFilePath);
    exitCleanly(0);
  });
}

function getTestAndReferenceUrlsUsingReferenceUrls(referenceUrls, overrideTestUrlDomainAndProtocol) {
  var overrideProtocol = overrideTestUrlDomainAndProtocol ? getUrlProtocol(overrideTestUrlDomainAndProtocol) : null;
  var overrideDomain = overrideTestUrlDomainAndProtocol ? getUrlDomain(overrideTestUrlDomainAndProtocol) : null;

  return referenceUrls.map(function (url) {
    var urlDomain = getUrlDomain(url);
    var urlProtocol = getUrlProtocol(url);
    var urlDomainEscaped = urlDomain.replace('.', '\\.');
    var urlProtocolAndDomainRegex = new RegExp('(http[s]?://)((.*\\.)?' + urlDomainEscaped + ')');
    return {
      'referenceUrl': url,
      'testUrl': url.replace(urlProtocolAndDomainRegex, (overrideProtocol || urlProtocol) + '://' + (overrideDomain || urlDomain) )
    };
  });
}

function testAllReferencedUrlsAction(siteDirPath, overrideTestUrlDomainAndProtocol) {
  var testedUrlsLogFilePath = getTestedUrlsLogFilePath(siteDirPath);
  var referencedUrlsLogFilePath = getReferencedUrlsLogFilePath(siteDirPath);

  if (!fs.existsSync(referencedUrlsLogFilePath)) {
    consoleLogFromAppAction('Could not find required file' + referencedUrlsLogFilePath);
    exitCleanly(1);
  }

  var referenceUrls = readLinesFromFile(referencedUrlsLogFilePath);
  var testAndReferenceUrls = getTestAndReferenceUrlsUsingReferenceUrls(referenceUrls, overrideTestUrlDomainAndProtocol);

  deleteIfExists(testedUrlsLogFilePath, function(filePath) {
    consoleLogFromAppAction('Removed "' + filePath + '" OK.');
  });

  consoleLogFromAppAction('About to run backstop test');

  shootAndAppendLogUrls(siteDirPath, testAndReferenceUrls, 'test').then(function() {
    consoleLogFromAppAction('Completed. URLs tested logged to ' + testedUrlsLogFilePath);
    consoleLogFromAppAction('Run node ' + appFilename + ' --report -O ' + siteDirPath + ' to view results.');
    exitCleanly(0);
  }).catch(function() {
    consoleLogFromAppAction('Some tests failed. URLs tested logged to ' + testedUrlsLogFilePath);
    consoleLogFromAppAction('Run node ' + appFilename + ' --report -O ' + siteDirPath + ' to view results.');
    exitCleanly(1);
  });
}

function writeTestUrlsLogFile(testedUrlsLogFilePath, urlTuples) {
  writeLinesToFile(testedUrlsLogFilePath, urlTuples.map(function(urlTuple) {
    return urlTuple.referenceUrl + ' -> ' + urlTuple.testUrl;
  }), true);
}

function readTestUrlsLogFile(testedUrlsLogFilePath) {
  return readLinesFromFile(testedUrlsLogFilePath).map(function(testUrlTupleString) {
    var testUrlTupleStringParts = testUrlTupleString.split(' -> ');
    return {
      'referenceUrl': testUrlTupleStringParts[0],
      'testUrl': testUrlTupleStringParts[1]
    };
  })
}

function reportLastTestAction(siteDirPath) {
  var dataDirPath = getBackstopDataDirPath(siteDirPath);

  consoleLogFromAppAction('About to run backstop openReport');

  backstop('openReport', {
    config: require(configFilePath)({
      'backstopDataPath': dataDirPath.replace(/^\.\//, ''),
      'scenarios': []
    })
  }).finally(function() {
    consoleLogFromAppAction('Completed.');
    exitCleanly(0);
  });
}

function approveLastTestAction(siteDirPath) {
  var dataDirPath = getBackstopDataDirPath(siteDirPath);
  var testedUrlsLogFilePath = getTestedUrlsLogFilePath(siteDirPath);

  if (!fs.existsSync(testedUrlsLogFilePath)) {
    consoleLogFromAppAction('Could not find file "' + testedUrlsLogFilePath + '". Have you run --test?');
    exitCleanly(1);
  }

  var urlTuples = readTestUrlsLogFile(testedUrlsLogFilePath);

  consoleLogFromAppAction('About to run backstop approve');

  backstop('approve', {
    config: require(configFilePath)({
      'scenarios': urlTuples.map(createScenario),
      'backstopDataPath': dataDirPath.replace(/^\.\//, '')//,
      // 'asyncCaptureLimit': backstopAsyncCaptureLimit,
      // 'asyncCompareLimit': backstopAsyncCompareLimit,
      // 'timeout': backstopTimeout
    })
  }).finally(function() {
    consoleLogFromAppAction('Completed.');
    exitCleanly(0);
  });
}

function getDisplayActionFromArgs() {
  var rawAction =
    process.argv.slice(2).find(function(el) { return [
      '-g',
      '-c',
      '-r',
      '-t',
      '-p',
      '-a',
      '-d',
      '-v',
      '-h',
      '--go',
      '--crawl',
      '--reference',
      '--test',
      '--report',
      '--approve',
      '--delete',
      '--version',
      '--help'
    ].indexOf(el) >= 0; });

  var shortToLongMap = {
    '-g': '--go',
    '-c': '--crawl',
    '-r': '--reference',
    '-t': '--test',
    '-p': '--report',
    '-a': '--approve',
    '-d': '--delete',
    '-v': '--version',
    '-h': '--help'
  };

  var displayAction = rawAction;

  if (rawAction && shortToLongMap.hasOwnProperty(rawAction)) {
    displayAction = shortToLongMap[rawAction];
  }

  if (argv.get('-u') && (argv.get('-r') || argv.get('-t'))) {
    displayAction += ' -u';
  }

  return displayAction;
}

function getActionFromArgs() {
  argv.option([
    ['-g', '--go', 'bool', 'Crawl from the specified URL while creating reference images'],
    ['-c', '--crawl', 'bool', 'Crawl from the specified URL (resumes crawl if crawled-urls.log exists)'],
    ['-r', '--reference', 'bool', 'Create reference images using URLs in the crawled-urls.log'],
    ['-t', '--test', 'bool', 'Test for regressions against all reference images'],
    ['-p', '--report', 'bool', 'Present report for last --test'],
    ['-a', '--approve', 'bool', 'Approve all "fail" images from the last --test and promote them to reference images'],
    ['-u', '--urls', '[]', '  Reference/test: use exactly the URLs you specify instead of crawled-urls.log'],
    ['-x', '--against', 'string', '  Test: run the --test against a different domain'],
    ['-f', '--force', 'bool', '  Crawl/go: Deletes the site output directory before crawling from scratch'],
    ['-o', '--output-dir-from-domain', 'string', '  Override site output directory (e.g. specify toyota.com.au to output to toyota_com_au)'],
    ['-O', '--output-dir', 'string', '  Override site output directory directly (e.g. specify ./toyota_com_au)'],
    ['-d', '--delete', 'bool', 'Delete all the data for the specified site'],
    ['-v', '--version', 'bool', 'Display version'],
    ['-h', '--help', 'Display help']
  ]);

  try {
    argv.parse();
  } catch (e) {
    console.log(appTitle + ': Error:', e);
  }

  displayAction = getDisplayActionFromArgs();

  if (argv.get('-v')) {
    return versionAction;
  }

  if (argv.get('-h')) {
    return helpAction;
  }

  if (argv.get('-d')) {
    return deleteSiteOutputDirAction.bind(undefined, getFirstUrlFromArgvNormalized());
  }

  if (argv.get('-O')) {
    overrideSiteDirPath = argv.get('-O');
    consoleLogFromAppAction('Overriding site directory to ' + getSiteDirPath());
  } else if (argv.get('-o')) {
    overrideDomainForSiteDirPath = argv.get('-o');
    consoleLogFromAppAction('Overriding site directory to ' + getSiteDirPath());
  }

  var firstUrl;
  var domain;
  var siteDirPath;

  if (argv.get('-u')) {
    firstUrl = getFirstUrlFromArgvNormalized();

    if (!firstUrl) {
      consoleLogFromAppAction('This action requires at least one URL to be specified');
      console.log('e.g. node ' + appFilename + ' ' + displayAction + ' http://toyota.com.au http://toyota.com.au/86');
      exitCleanly(1);
    }

    var urls = argv.get('-u').map(normalizeUrl);
    domain = getUrlDomain(firstUrl);
    siteDirPath = getSiteDirPath(domain);

    if (argv.get('-r')) {
      return referenceUrlsAction.bind(undefined, siteDirPath, urls);
    }

    if (argv.get('-t')) {
      return testUrlsAction.bind(undefined, siteDirPath, urls, argv.get('-x'));
    }

    consoleLogFromAppAction('ERROR: The --urls switch only applies to reference or test.');
    console.log('e.g. node ' + appFilename + ' --reference -u toyota.com.au http://greenwoodcity.com');
    exitCleanly(1);
  }

  if (argv.get('-g') || argv.get('-r') || argv.get('-t') || argv.get('-a') || argv.get('-p') || argv.get('-c')) {
    firstUrl = getFirstUrlFromArgvNormalized();

    if (!firstUrl) {
      consoleLogFromAppAction('This action requires a domain to be specified');
      console.log('e.g. node ' + appFilename + ' ' + displayAction + ' toyota.com.au');
      exitCleanly(1);
    }

    domain = getUrlDomain(firstUrl);
    siteDirPath = getSiteDirPath(domain);

    if (argv.get('-g')) {
      return crawlAndReferenceAction.bind(undefined, siteDirPath, firstUrl, argv.get('-f'));
    }

    if (argv.get('-c')) {
      return crawlAction.bind(undefined, siteDirPath, firstUrl, argv.get('-f'));
    }

    if (argv.get('-r')) {
      return referenceAllCrawledUrlsAction.bind(undefined, siteDirPath, argv.get('-f'));
    }

    if (argv.get('-t')) {
      return testAllReferencedUrlsAction.bind(undefined, siteDirPath, argv.get('-x'));
    }

    if (argv.get('-p')) {
      return reportLastTestAction.bind(undefined, siteDirPath);
    }

    if (argv.get('-a')) {
      return approveLastTestAction.bind(undefined, siteDirPath);
    }
  }

  return helpAction;
}

// Allow SIGINT (^C / break) handling on Windows
// TODO: Suppress this for quick actions such as "report" or "approve"

var rl;

if (process.platform === "win32") {
  rl = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.on("SIGINT", function () {
    process.emit("SIGINT");
  });
}

function exitCleanly(exitCode) {
  if (rl) {
    rl.close();
  }

  if (exitCode) {
    process.exit(exitCode);
  }
}

process.on("SIGINT", function () {
  console.log();
  consoleLogFromAppAction('Interrupted by user');

  if (displayAction === 'go' && batchOfReferenceUrls.length) {
    console.log();
    console.log('This batch of reference images did not complete but has already been crawled:\n  ' + batchOfReferenceUrls.join('\n  '));
    console.log();
    console.log('To recover from this condition, resume the crawl and reference with:');
    console.log('     node ' + appFilename + ' -g');
  }

  exitCleanly(1);
});

var action = getActionFromArgs();

console.log();
action();