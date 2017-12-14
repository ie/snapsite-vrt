# OCD - Optical Crawl & Diff 

A visual regression testing tool designed to be as "point and shoot" as 
possible.

- Snapshot your site for the first time with `--go`.
- Come back later and `--test`.
- Look at the `--report`.
- Are the failed tests actually just improvements? Then `--approve`.

## Getting Started

These instructions will get you a copy of the project up and running on 
our local machine for development and testing purposes.

### Prerequisites

- Node
- Google Chrome
- Only tested on Windows so far, but should work wherever Chrome runs

### Installation

```
npm install
```

And you're done.

### Dev Usage

After a git pull and build on your desired website, go through these steps:

1. Run `node ocd.js --crawl toyota.local`
2. Run `node ocd.js --reference toyota.local`
3. Do some web development
4. Run `node ocd.js --test toyota.local`
5. Run `node ocd.js --report toyota.local`
6. Handle reported failures:
    - If these failures are actually improvements, run `node ocd.js --approve toyota.local`
    - If these failures are real, go back to (3) and fix your broken tests.
7. Once there are no failures, push your changes / submit a pull request.

### CI Usage

1. Install on a server with plenty of disk space
2. Run `node ocd.js --crawl toyota.com.au` once
   - Optional: using your own script, filter out any undesirable URLs from `crawled-urls.log` 
3. Run `node ocd.js --reference toyota.com.au` once
4. Nightly, run `node ocd.js --test toyota.com.au` (failed tests will yield a non-zero exit code)
5. Handle reported differences:
    - Last report results are logged in `sites/.../backstop_data/ci_report/xunit.xml`; make
      this file accessible to devs so they can investigate. 

### Examples

**Go crawl and capture reference screenshots for all of toyota.com.au**
```
node ocd.js --go toyota.com.au
```
Note: you can safely ^C in the middle of this.

**Crawl toyota.com.au**
```
node ocd.js --crawl toyota.com.au
```
Note: you can safely ^C in the middle of this.

**Reference image capture for all crawled URLs for toyota.com.au**
```
node ocd.js --reference toyota.com.au
```

**Test image capture for all referenced URLs for toyota.com.au**
```
node ocd.js --test toyota.com.au
```

**Present report of most recent test results for toyota.com.au**
```
node ocd.js --report toyota.com.au
```

**Delete all data for toyota.com.au**
```
node ocd.js --delete toyota.com.au
```

### Actions

#### --help (-h)
**`node ocd.js`** or

**`node ocd.js --help`**

Good to know it's there if you need it.

#### --go (-g)
**`node ocd.js --go [-f] <domain> [-o <domain>|-O <relative-path>]`**

Crawls a whole website, while capturing reference images to be used as the basis
for test success or failure. Essentially runs a `--crawl`, and every few URLs 
does a little `--reference`.

- Use `-f` to delete the site directory before running
- Use `-o` to override the directory using a domain name
- Use `-O` to override the directory using a relative path
- Outputs to `./sites/subdomain_domain_com_au/`
- HTML is logged to `./sites/.../html/`.
- Crawled URLs are logged to `./sites/.../crawled-urls.log`.
- Referenced URLs are logged to `./sites/.../referenced-urls.log`.
- Reference images are saved to `./sites/.../backstop_data/bitmaps_reference/`

#### --crawl (-c)
**`node ocd.js --crawl [-f] <domain> [-o <domain>|-O <relative-path>]`**

Crawls a whole website, starting with the URL you give it. Limits the crawl to
just the domain of that URL and its subdomains.

- Use `-f` to delete the site directory before running
- Use `-o` to override the directory using a domain name
- Use `-O` to override the directory using a relative path
- Outputs to `./sites/subdomain_domain_com_au/`
- HTML is logged to `./sites/.../html/`.
- Crawled URLs are logged to `./sites/.../crawled-urls.log`.

#### --reference (-r)
**`node ocd.js --reference [-f] (<domain>|-u <url1> <url2> ...) [-o <domain>|-O <relative-path>]`**

Captures images to be used as the basis for test success or failure.

- Use `-u` instead of a domain to reference specific URLs only
- Use `-f` to delete reference files and test files before running
- Use `-o` to override the directory using a domain name
- Use `-O` to override the directory using a relative path
- Outputs to `./sites/.../referenced-urls.log` and `./sites/.../backstop_data/bitmaps_reference/`

#### --test (-t)
**`node ocd.js --test (<domain>|-u <url1> <url2> ...) [-o <domain>|-O <relative-path>]`**

Captures images again, and compares them to the reference images.

- Use `-u` instead of a domain to test specific URLs only
- Use `-o` to override the directory using a domain name
- Use `-O` to override the directory using a relative path
- Outputs to `./sites/.../tested-urls.log` and `./sites/.../backstop_data/bitmaps_test/<date>-<time>/` 

#### --report (-p)
**`node ocd.js --report <domain> [-o <domain>|-O <relative-path>]`**

Presents a report for you to inspect the results of the last test, eyeballing 
the nature of the failures to see if they are "real".

- Use `-o` to override the directory using a domain name
- Use `-O` to override the directory using a relative path

#### --approve (-a)
**`node ocd.js --approve <domain> [-o <domain>|-O <relative-path>]`**

If all "failures" in the last test were intentional changes, then you should
approve them. This copies any "failed but approved" test images over the top 
of existing reference images.

- Use `-o` to override the directory using a domain name
- Use `-O` to override the directory using a relative path

#### --delete (-d)
**`node ocd.js --delete <domain> [-o <domain>|-O <relative-path>]`**

Deletes the site directory for the given domain.

- Use `-o` to override the directory using a domain name
- Use `-O` to override the directory using a relative path

#### --version (-v)
**`node ocd.js --version`**

### Known bugs

- Sometimes, some URLs can be skipped during a reference/test. The cause is 
  currently unknown.

- Failed `--go` and `--reference` references are still added to
`referenced-urls.log`. As a workaround you can use `--reference -u url1 url2
... -o toyota.com.au` to redo just those references.

- On Windows, you need to hit ^C after an `--approve`.

### Known limitations

* `--crawl` logs to `crawled-urls.log` as it progresses, but `--reference` 
and test don't log to `referenced-urls.log` / `tested-urls.log` until they
have completed.

* SuperCrawler cannot crawl links rendered only in JavaScript. It's not as
sophisticated as Googlebot!

* Pages longer than 10000 pixels will get cropped to 10000px long. (You can
manually modify Chromy to extend this to 16384px but Chrome headless itself
refuses to go any longer than that.)  

## Tips

* Each site's files has its own folder under `sites`, e.g. 
`sites/toyota_com_au`.

* To approve only selected test results, run `--test -u url1 url2 ... -o 
toyota.com.au` and then `--approve toyota.com.au`. (The `-o` option overrides 
the site directory to be `toyota_com_au` even if your first test URL is 
different e.g. `info.toyota.com.au`).

* The HTML for every crawled URL is copied to the `html` directory under the
directory for your site, e.g. `sites/toyota_com_au/html`. This is not used
by OCD, it is just there so you search over the whole site's content if you 
want to.

* To delete a stubborn folder on Windows (filenames too long?), use the
`--delete` action.

* You can hit ^C in the middle of a `--crawl`, run a `--reference`, continue 
the crawl by running `--crawl` again, and then `--reference` again to only
pick up the newly crawled pages.

* When running `--crawl` again, its default behaviour is to resume the last 
crawl.

* Use `--crawl -f` to suppress this resume function, and force a fresh crawl 
  from scratch. This will erase the whole site directory and start over.

* Similarly, running `--reference` again will crawl anything new in 
`crawled-urls.log` (it compares to `referenced-urls.log`).

* Use `--reference -f` to force a fresh new reference — this erases all 
existing reference and test files but keeps `crawled-urls.log`.

* `--test` always runs against every URL in `referenced-urls.log`. 

* Site stability: if your site's appearance naturally varies a lot each time
you look at it, you will see a lot of failures. You can mitigate this somewhat
by modifying `engine_scripts/chromy/onReady.js` to cover-up or remove elements
which keep messing up your results uselessly (see `coverVideo()` implemented
specifically for the Toyota website).

* Use `--reference -u url1 url2 ...` to reference an ad-hoc list of URLs on 
the command line. The site directory will be named after the domain name of 
the first URL. These URLs will be added to `referenced-urls.log` so that
any subsequent `--test` will pick them up.

* Use `--test -u url1 url2 ...` to test an ad-hoc list of URLs. These URLs
will be added to `tested-urls.log`.

## Built with

* [Supercrawler](https://github.com/brendonboshell/supercrawler) - Spiders the website
* [BackstopJS](https://github.com/garris/BackstopJS) - Captures website screenshots from URLs
* [SQLite](https://github.com/mapbox/node-sqlite3) - Supercrawler needs to store its crawl progress somewhere, and this is that somewhere

## Versioning

Use [SemVer](http://semver.org/) for versioning. For the versions available, see the [tags on this repository](https://github.com/your/project/tags). 

## Who do I talk to?

Please contact the following people for additional information

* **Martin Funcich** - *Initial work* - [ie_martin](https://bitbucket.org/ie_martin/)

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details
