"use strict";

exports.__esModule = true;
exports["default"] = void 0;

var animationFrame = _interopRequireWildcard(require("dom-helpers/animationFrame"));

var _scrollLeft = _interopRequireDefault(require("dom-helpers/scrollLeft"));

var _scrollTop = _interopRequireDefault(require("dom-helpers/scrollTop"));

var _invariant = _interopRequireDefault(require("invariant"));

var _lifecycle = _interopRequireDefault(require("page-lifecycle/dist/lifecycle.es5"));

var _afterframe = _interopRequireDefault(require("afterframe"));

var _utils = require("./utils");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function _getRequireWildcardCache() { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { "default": obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj["default"] = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

/* eslint-disable no-underscore-dangle */
function cancelableAfterFrame(callback) {
  var handle = {
    cancelled: false
  };
  (0, _afterframe["default"])(function () {
    if (!handle.cancelled) {
      callback();
    }
  });
  return handle;
}

function cancelAfterFrame(handle) {
  if (handle && Object.prototype.hasOwnProperty.call(handle, 'cancelled')) {
    handle.cancelled = true;
  }
} // Try at most this many times to scroll, to avoid getting stuck.


var MAX_SCROLL_ATTEMPTS = 2;

var ScrollBehavior = /*#__PURE__*/function () {
  function ScrollBehavior(_ref) {
    var _this = this;

    var addNavigationListener = _ref.addNavigationListener,
        stateStorage = _ref.stateStorage,
        getCurrentLocation = _ref.getCurrentLocation,
        shouldUpdateScroll = _ref.shouldUpdateScroll;

    this._setScrollRestoration = function () {
      if (_this._oldScrollRestoration) {
        // It's possible that we already set the scroll restoration.
        return;
      }

      if ('scrollRestoration' in window.history && // Unfortunately, Safari on iOS freezes for 2-6s after the user swipes to
      //  navigate through history with scrollRestoration being 'manual', so we
      //  need to detect this browser and exclude it from the following code
      //  until this bug is fixed by Apple.
      !(0, _utils.isMobileSafari)()) {
        _this._oldScrollRestoration = window.history.scrollRestoration;

        try {
          window.history.scrollRestoration = 'manual';
        } catch (e) {
          _this._oldScrollRestoration = null;
        }
      }
    };

    this._restoreScrollRestoration = function () {
      /* istanbul ignore if: not supported by any browsers on Travis */
      if (_this._oldScrollRestoration) {
        try {
          window.history.scrollRestoration = _this._oldScrollRestoration;
        } catch (e) {
          /* silence */
        }

        _this._oldScrollRestoration = null;
      }
    };

    this._onWindowScroll = function () {
      if (_this._ignoreScrollEvents) {
        // Don't save the scroll position until navigation is complete.
        return;
      } // It's possible that this scroll operation was triggered by what will be a
      //  `POP` navigation. Instead of updating the saved location immediately,
      //  we have to enqueue the update, then potentially cancel it if we observe
      //  a location update.


      _this._saveWindowPosition();

      if (_this._windowScrollTarget) {
        var _this$_windowScrollTa = _this._windowScrollTarget,
            xTarget = _this$_windowScrollTa[0],
            yTarget = _this$_windowScrollTa[1];
        var x = (0, _scrollLeft["default"])(window);
        var y = (0, _scrollTop["default"])(window);

        if (x === xTarget && y === yTarget) {
          _this._windowScrollTarget = null;

          _this._cancelCheckWindowScroll();
        }
      }
    };

    this._saveWindowPosition = function () {
      if (!_this._saveWindowPositionHandle) {
        _this._saveWindowPositionHandle = cancelableAfterFrame(function () {
          _this._saveWindowPositionHandle = null;

          _this._savePosition(null, window);
        });
      }
    };

    this._checkWindowScrollPosition = function () {
      _this._checkWindowScrollHandle = null; // We can only get here if scrollTarget is set. Every code path that unsets
      //  scroll target also cancels the handle to avoid calling this handler.
      //  Still, check anyway just in case.

      /* istanbul ignore if: paranoid guard */

      if (!_this._windowScrollTarget) {
        return Promise.resolve();
      }

      _this.scrollToTarget(window, _this._windowScrollTarget);

      ++_this._numWindowScrollAttempts;
      /* istanbul ignore if: paranoid guard */

      if (_this._numWindowScrollAttempts >= MAX_SCROLL_ATTEMPTS) {
        // This might happen if the scroll position was already set to the target
        _this._windowScrollTarget = null;
        return Promise.resolve();
      }

      return new Promise(function (resolve) {
        _this._checkWindowScrollHandle = animationFrame.request(function () {
          return resolve(_this._checkWindowScrollPosition());
        });
      });
    };

    this._stateStorage = stateStorage;
    this._getCurrentLocation = getCurrentLocation;
    this._shouldUpdateScroll = shouldUpdateScroll;
    this._oldScrollRestoration = null; // This helps avoid some jankiness in fighting against the browser's
    //  default scroll behavior on `POP` navigations.

    /* istanbul ignore else: Travis browsers all support this */

    this._setScrollRestoration();

    this._saveWindowPositionHandle = null;
    this._checkWindowScrollHandle = null;
    this._windowScrollTarget = null;
    this._numWindowScrollAttempts = 0;
    this._ignoreScrollEvents = false;
    this._scrollElements = {}; // We have to listen to each window scroll update rather than to just
    //  location updates, because some browsers will update scroll position
    //  before emitting the location change.

    window.addEventListener('scroll', this._onWindowScroll, {
      passive: true
    });

    var handleNavigation = function handleNavigation(saveWindowPosition) {
      cancelAfterFrame(_this._saveWindowPositionHandle);
      _this._saveWindowPositionHandle = null;

      if (saveWindowPosition && !_this._ignoreScrollEvents) {
        _this._saveWindowPosition();
      }

      Object.keys(_this._scrollElements).forEach(function (key) {
        var scrollElement = _this._scrollElements[key];
        animationFrame.cancel(scrollElement.savePositionHandle);
        scrollElement.savePositionHandle = null; // It's always fine to save element scroll positions here; the browser
        //  won't modify them.

        if (!_this._ignoreScrollEvents) {
          _this._saveElementPosition(key);
        }
      });
    };

    this._removeNavigationListener = addNavigationListener(function (_ref2) {
      var action = _ref2.action;
      // Don't save window position on POP, as the browser may have already
      //  updated it.
      handleNavigation(action !== 'POP');
    });

    _lifecycle["default"].addEventListener('statechange', function (_ref3) {
      var newState = _ref3.newState;

      if (newState === 'terminated' || newState === 'frozen' || newState === 'discarded') {
        handleNavigation(true); // Scroll restoration persists across page reloads. We want to reset
        //  this to the original value, so that we can let the browser handle
        //  restoring the initial scroll position on server-rendered pages.

        _this._restoreScrollRestoration();
      } else {
        _this._setScrollRestoration();
      }
    });
  }

  var _proto = ScrollBehavior.prototype;

  _proto.registerElement = function registerElement(key, element, shouldUpdateScroll, context) {
    var _this2 = this;

    !!this._scrollElements[key] ? process.env.NODE_ENV !== "production" ? (0, _invariant["default"])(false, 'ScrollBehavior: There is already an element registered for `%s`.', key) : invariant(false) : void 0;

    var saveElementPosition = function saveElementPosition() {
      _this2._saveElementPosition(key);
    };

    var scrollElement = {
      element: element,
      shouldUpdateScroll: shouldUpdateScroll,
      savePositionHandle: null,
      onScroll: function onScroll() {
        if (!scrollElement.savePositionHandle && !_this2._ignoreScrollEvents) {
          scrollElement.savePositionHandle = animationFrame.request(saveElementPosition);
        }
      }
    }; // In case no scrolling occurs, save the initial position

    if (!scrollElement.savePositionHandle && !this._ignoreScrollEvents) {
      scrollElement.savePositionHandle = animationFrame.request(saveElementPosition);
    }

    this._scrollElements[key] = scrollElement;
    element.addEventListener('scroll', scrollElement.onScroll);

    this._updateElementScroll(key, null, context);
  };

  _proto.unregisterElement = function unregisterElement(key) {
    !this._scrollElements[key] ? process.env.NODE_ENV !== "production" ? (0, _invariant["default"])(false, 'ScrollBehavior: There is no element registered for `%s`.', key) : invariant(false) : void 0;
    var _this$_scrollElements = this._scrollElements[key],
        element = _this$_scrollElements.element,
        onScroll = _this$_scrollElements.onScroll,
        savePositionHandle = _this$_scrollElements.savePositionHandle;
    element.removeEventListener('scroll', onScroll);
    animationFrame.cancel(savePositionHandle);
    delete this._scrollElements[key];
  };

  _proto.updateScroll = function updateScroll(prevContext, context) {
    var _this3 = this;

    this._updateWindowScroll(prevContext, context).then(function () {
      // Save the position immediately after navigation so that if no scrolling
      //  occurs, there is still a saved position.
      _this3._saveWindowPosition();
    });

    Object.keys(this._scrollElements).forEach(function (key) {
      _this3._updateElementScroll(key, prevContext, context);
    });
  };

  _proto.stop = function stop() {
    this._restoreScrollRestoration();

    window.removeEventListener('scroll', this._onWindowScroll, {
      passive: true
    });

    this._cancelCheckWindowScroll();

    this._removeNavigationListener();
  };

  _proto.startIgnoringScrollEvents = function startIgnoringScrollEvents() {
    this._ignoreScrollEvents = true;
  };

  _proto.stopIgnoringScrollEvents = function stopIgnoringScrollEvents() {
    this._ignoreScrollEvents = false;
  };

  _proto._cancelCheckWindowScroll = function _cancelCheckWindowScroll() {
    animationFrame.cancel(this._checkWindowScrollHandle);
    this._checkWindowScrollHandle = null;
  };

  _proto._saveElementPosition = function _saveElementPosition(key) {
    var _this4 = this;

    var scrollElement = this._scrollElements[key];
    scrollElement.savePositionHandle = null;
    (0, _afterframe["default"])(function () {
      _this4._savePosition(key, scrollElement.element);
    });
  };

  _proto._savePosition = function _savePosition(key, element) {
    this._stateStorage.save(this._getCurrentLocation(), key, [(0, _scrollLeft["default"])(element), (0, _scrollTop["default"])(element)]);
  };

  _proto._updateWindowScroll = function _updateWindowScroll(prevContext, context) {
    // Whatever we were doing before isn't relevant any more.
    this._cancelCheckWindowScroll();

    this._windowScrollTarget = this._getScrollTarget(null, this._shouldUpdateScroll, prevContext, context); // Updating the window scroll position is really flaky. Just trying to
    //  scroll it isn't enough. Instead, try to scroll a few times until it
    //  works.

    this._numWindowScrollAttempts = 0;
    return this._checkWindowScrollPosition();
  };

  _proto._updateElementScroll = function _updateElementScroll(key, prevContext, context) {
    var _this$_scrollElements2 = this._scrollElements[key],
        element = _this$_scrollElements2.element,
        shouldUpdateScroll = _this$_scrollElements2.shouldUpdateScroll;

    var scrollTarget = this._getScrollTarget(key, shouldUpdateScroll, prevContext, context);

    if (!scrollTarget) {
      return;
    } // Unlike with the window, there shouldn't be any flakiness to deal with
    //  here.


    this.scrollToTarget(element, scrollTarget);
  };

  _proto._getDefaultScrollTarget = function _getDefaultScrollTarget(location) {
    var hash = location.hash;

    if (hash && hash !== '#') {
      return hash.charAt(0) === '#' ? hash.slice(1) : hash;
    }

    return [0, 0];
  };

  _proto._getScrollTarget = function _getScrollTarget(key, shouldUpdateScroll, prevContext, context) {
    var scrollTarget = shouldUpdateScroll ? shouldUpdateScroll.call(this, prevContext, context) : true;

    if (!scrollTarget || Array.isArray(scrollTarget) || typeof scrollTarget === 'string') {
      return scrollTarget;
    }

    var location = this._getCurrentLocation();

    return this._getSavedScrollTarget(key, location) || this._getDefaultScrollTarget(location);
  };

  _proto._getSavedScrollTarget = function _getSavedScrollTarget(key, location) {
    if (location.action === 'PUSH') {
      return null;
    }

    return this._stateStorage.read(location, key);
  };

  _proto.scrollToTarget = function scrollToTarget(element, target) {
    if (typeof target === 'string') {
      var targetElement = document.getElementById(target) || document.getElementsByName(target)[0];

      if (targetElement) {
        targetElement.scrollIntoView();
        return;
      } // Fallback to scrolling to top when target fragment doesn't exist.


      target = [0, 0]; // eslint-disable-line no-param-reassign
    }

    var _target = target,
        left = _target[0],
        top = _target[1];
    (0, _scrollLeft["default"])(element, left);
    (0, _scrollTop["default"])(element, top);
  };

  return ScrollBehavior;
}();

exports["default"] = ScrollBehavior;
module.exports = exports.default;