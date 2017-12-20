module.exports = function (chromy, scenario, vp) {
  console.log('SCENARIO > ' + scenario.label);
  require('./clickAndHoverHelper')(chromy, scenario);
  // add more ready handlers here...

  chromy.evaluate(function() {
    function init($) {
      function fixVhHeights() {
        var vhSelectors = [];
        var vhUnitRegex = /([0-9.]+)vh|vmin|vmax/g;
        for (var i = 0; i < document.styleSheets.length; i++) {
          var rules = document.styleSheets[i].cssRules;
          // Checking for null because cssRules is null for cross-site stylesheets
          if (rules) {
            for (var j = 0; j < rules.length; j++) {
              var rule = rules[j];
              var style = rule.style;
              for (var prop in style) {
                if (style[prop] && style.hasOwnProperty(prop)) {
                  // Add this selector if it contains a style with a VH unit
                  if (vhSelectors.indexOf(rule.selectorText) === -1) {
                    if (style[prop].match(vhUnitRegex)) {
                      vhSelectors.push(rule.selectorText);
                    }
                  }
                }
              }
            }
          }
        }

        // TERRIBLE KLUDGE
        //
        // We can't enumerate CSS rules inside media queries, which means we
        // can't programmatically find min-height / height / top / bottom etc.
        // using viewport-relative units if they're in a media query. But, we
        // need to find them in order to identify these edge-case-y elements
        // which may cause page layouts to break dramatically (e.g. Toyota
        // legacy "BEP" brand experience pages).
        //
        // So, here are the only known instances where we need to defend against
        // "unfindable" usages of viewport-relative units:
        //
        if (document.body.clientWidth <= 767) {
          vhSelectors.push('#bep-features-module .tab-pane, #bep-gallery-module .tab-pane, #bep-video-carousel-module .tab-pane');
        }
        if (document.body.clientWidth >= 768) {
          vhSelectors.push('.ty-modal');
        }

        // Find all elements matching fixHeightSelectors and fix their height now
        $(vhSelectors.join(',')).each(function() {
          var $el = $(this);
          var elHeight = $el.height();
          $el.css('min-height', 0);
          $el.css('max-height', 'none');
          $el.height(elHeight);
        });
      }

      function fixPercentageHeights() {
        var percentUnitRegex = /([0-9.]+)(%)/g;

        var freezeProperties = [];
        var $freezeElements = $();
        var $body = $('body');

        // Let us access original CSS property values, not computed styles
        $body.css('display', 'none');

        // Go store all individual element|propertyName|propertyValue tuples
        // for elements which need their heights frozen
        $body.find('*').each(function(){
          var el = this;
          var $el = $(el);
          var style = window.getComputedStyle(el);
          for (var cssPropertyName in style) {
            if (style.hasOwnProperty(cssPropertyName)) {
              var isPropVerticalMetric = cssPropertyName.match(/\b(top|bottom|height)\b/g) && !cssPropertyName.match(/\b(padding|min|max)\b/g);
              var isPropValueInPercentUnits = style[cssPropertyName].match(percentUnitRegex);
              if (isPropVerticalMetric && isPropValueInPercentUnits) {
                freezeProperties.push({el: el, $el: $el, cssPropertyName: cssPropertyName});
                $freezeElements = $freezeElements.add($el); // jQuery dedupes automatically
              }
            }
          }
        });

        // Exclude elements whose % heights will just end up resolving to "auto".
        // (These are elements who have no parents with a fixed-unit height value.)

        // We do this because freezing an element's auto height to a pixel value
        // can have knock-on effects on children, activating previously inactive
        // CSS % heights.

        var $bodyAndParents = $body.add($body.parents());

        function hasIndefiniteHeight(el) {
          var elHeight = window.getComputedStyle(el)['height'];
          return elHeight.match(percentUnitRegex) || elHeight === 'auto';
        }

        var $excluded = $();

        $freezeElements.each(function() {
          var el = this;
          var $el = $(this);
          // Element is a direct child of <body> -- keep.
          if (el.parentElement === document.body) {
            return;
          }

          // Case 1: position: static. Does its immediate parent have an indefinite (percentage-unit or auto) height? Exclude it.
          if (window.getComputedStyle(el)['position'] === 'static' && el.parentElement && hasIndefiniteHeight(el.parentElement)) {
            $excluded = $excluded.add($el);
            return;
          }

          // Case 2: position: (not static). Does its closest positioned parent have a indefinite (percentage-unit or auto) height? Exclude it.
          // EXCEPTION: The closest positioned parent is a direct child of <body> -- FREEZE THE PARENT HEIGHT.
          var $positionedParents = $el.parents().not($bodyAndParents).filter(function() {
            var el = this;
            return window.getComputedStyle(el)['position'] !== 'static';
          });
          var closestPositionedParent = $positionedParents.get(0);
          if (closestPositionedParent && hasIndefiniteHeight(closestPositionedParent)) {
            $excluded = $excluded.add($el);
          }

          /*
          if (closestPositionedParent === document.body) {
            freezeProperties.push({el: closestPositionedParent,})
          }
          */
        });

        // Now revert to being able to getComputedStyles
        $body.css('display', '');

        // Go grab the pixel-unit values for all the freezable values
        freezeProperties.forEach(function(freezeProperty) {
          freezeProperty.cssPropertyComputedValue = window.getComputedStyle(freezeProperty.el)[freezeProperty.cssPropertyName];
        });

        // Now, finally, freeze all relevant CSS property values to pixel-unit values.
        freezeProperties.forEach(function(freezeProperty) {
          var $el = freezeProperty.$el;

          if (!$el.not($excluded).length) {
            return;
          }

          if (freezeProperty.cssPropertyName === 'height') {
            $el.css('min-height', 0);
            $el.css('max-height', 'none');
          }

          $el.css(freezeProperty.cssPropertyName, freezeProperty.cssPropertyComputedValue);
        });
      }

      function coverVideo() {
        $('body').prepend(
          '<style>' +
            '.vrt-video-cover {' +
              'position: relative;' +
              'left: 0;' +
              'top: 0;' +
              'width: 100%;' +
              'height: 100%;' +
              'background: #808080;' +
            '}' +
            '.vrt-video-cover::before {' +
              'content: "(video replaced for VRT stability)";' +
              'display: block;' +
              'padding: 10px;' +
              'background: rgba(0, 0, 0, .2);' +
              'color: white;' +
              'text-shadow: none;' +
              'font-size: 20px;' +
              'letter-spacing: 0;' +
              'line-height: 1;' +
              'font-family: sans-serif;' +
              'font-weight: normal;' +
              'left: 50%;' +
              'top: 50%;' +
              'position: absolute;' +
              'transform: translate(-50%, -50%);' +
            '}' +
          '</style>'
        );
        $('video').after('<div class="vrt-video-cover"></div>');
      }

      function patchRandomInconsistenciesBetweenRefreshes() {
        var replaceElsSelectors = [
          '.footer-icon-wide-strip',
          '.copyright-wide',
          '.navbar-header'
        ];
        var replaceElSelector = replaceElsSelectors.join(',');
        var replaceElChildrenSelector = replaceElsSelectors.map(function(selector) { return selector + ' *'; }).join(',');
        var replaceElAfterSelector = replaceElsSelectors.map(function(selector) { return selector + '::after'; }).join(',');

        $('body').prepend(
          '<style>' +
            // Patch over different CSS on different Alfresco servers
            '#footer-content-2 .section-list-about .stay-connected{width:350px}' +

            // Remove long narrow box at the bottom of
            // http://www.toyota.com.au/game-of-skills which appears sometimes
            '#ui-datepicker-div { display: none !important; }' +

            // Hide tracking pixel which seems to like inserting itself in the
            // site header or footer at random
            'img[src*="http://secure-gl.imrworldwide.com/cgi-bin/m"] { display: none; }' +

            // Hide "Feedback" tab
            '.usabilla_live_button_container { display: none; }' +

            // CONTROVERSIAL: Hide entire strip footer because sometimes it's
            // empty, sometimes it is missing just the "To view prices, choose
            // a dealer" link, sometimes it is missing the "View Ebrochure"
            // link

            // CONTROVERSIAL: Hide footer-copyright-links because the 'Oh what
            // a feeling' logo incl ABN and copyright notice, or just the
            // copyright notice, are sometimes missing

            // VERY CONTROVERSIAL: Hide the whole .navbar-header (mobile
            // header / desktop logo)

            replaceElSelector + ' { display: block; background: #CCCCCC; position: relative; height: 100px; }' +
            replaceElChildrenSelector + ' { display: none; }' +
            replaceElAfterSelector + '{ ' +
              'content: "(element replaced for VRT stability)";' +
              'display: block;' +
              'padding: 10px;' +
              'background: rgba(0, 0, 0, .2);' +
              'color: white;' +
              'text-shadow: none;' +
              'font-size: 14px;' +
              'letter-spacing: 0;' +
              'line-height: 1;' +
              'font-family: sans-serif;' +
              'font-weight: bold;' +
              'left: 50%;' +
              'top: 50%;' +
              'position: absolute;' +
              'white-space: nowrap;' +
              'transform: translate(-50%, -50%);' +
              'z-index: 1;' +
            ' }' +

            '.navbar-header { display: block; background: #CCCCCC; position: absolute; left: 0; right: 0; top: 0; bottom: 0; height: auto; }' +
          '</style>'
        );
      }

      function resetCarousels() {
        // Bootstrap carousels
        var $bootstrapCarousels = $('.carousel.slide');
        $bootstrapCarousels.each(function() {
          var $bootstrapCarousel = $(this);
          $bootstrapCarousel.carousel(0);
          $bootstrapCarousel.carousel('pause');
        });

        // /static/campaigns/ethnic-landing/js/main.js carousel
        var $ethnicLandingCarousels = $('#media-gallery-controls');
        $ethnicLandingCarousels.each(function() {
          var $ethnicLandingCarousel = $(this);
          $ethnicLandingCarousel.find('.page').first().click();
          $ethnicLandingCarousel.find('.button.pause').click();
        });
      }

      fixVhHeights();
      fixPercentageHeights();
      coverVideo();
      patchRandomInconsistenciesBetweenRefreshes();
      resetCarousels();
    }

    if (typeof jQuery === 'undefined') {
      function getScript(url, success) {
        var script = document.createElement('script');
        script.src = url;
        var head = document.getElementsByTagName('head')[0];
        var done = false;

        // Attach handlers for all browsers
        script.onload = script.onreadystatechange = function() {
          if (!done && (!this.readyState || this.readyState === 'loaded' || this.readyState === 'complete')) {
            done = true;
            // callback function provided as param
            success();
            script.onload = script.onreadystatechange = null;
            head.removeChild(script);
          }
        };
        head.appendChild(script);
      }

      getScript('//code.jquery.com/jquery-3.2.1.min.js', function() {
        if (typeof jQuery === 'undefined') {
          // Super failsafe - still somehow failed...
        } else {
          jQuery.noConflict();
          init(jQuery);
        }
      });
    } else { // jQuery was already loaded
      init(jQuery);
    }
  });
};
