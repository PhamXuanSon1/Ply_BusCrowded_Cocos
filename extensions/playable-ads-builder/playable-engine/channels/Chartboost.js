window.PlayableSDK = {
  channel: "Chartboost",
  google_url: "",
  apple_url: "",
  _muteCallback: null,
  _unmuteCallback: null,
  _pauseCallback: null,
  _resumeCallback: null,
  _isGameStarted: false,
  _isAudioEnabled: false,
  _isPaused: false,
  detectOS() {
    if (navigator.userAgentData && navigator.userAgentData.platform) {
      const _0xab87f2 = navigator.userAgentData.platform;
      return _0xab87f2;
    }
    const _0x536659 = navigator.userAgent || "";
    const _0x3b6cee = navigator.platform || "";
    if (/android/i.test(_0x536659)) {
      return "Android";
    }
    if (/iPhone|iPad|iPod/i.test(_0x536659) || _0x3b6cee === "MacIntel" && "ontouchstart" in window) {
      return "iOS";
    }
    if (/Win/i.test(_0x3b6cee)) {
      return "Windows";
    }
    if (/Mac/i.test(_0x3b6cee)) {
      return "macOS";
    }
    if (/Linux/i.test(_0x3b6cee)) {
      return "Linux";
    }
    return "Unknown OS";
  },
  download() {
    console.log("[PlayableSDK]", this.channel, "download()");
    const _0x7d6b52 = this.detectOS();
    try {
      if (_0x7d6b52 === "Android" && this.google_url) {
        mraid.open(this.google_url);
        return;
      } else if (_0x7d6b52 === "iOS" && this.apple_url) {
        mraid.open(this.apple_url);
        return;
      } else if (this.google_url) {
        mraid.open(this.google_url);
        return;
      } else if (this.apple_url) {
        mraid.open(this.apple_url);
        return;
      }
    } catch (_0xf0b12b) {
      console.warn("[PlayableSDK:" + this.channel + ":download] mraid.open failed, falling back to window.open", _0xf0b12b);
    }
    if (_0x7d6b52 === "iOS" || _0x7d6b52 === "macOS") {
      window.open(this.apple_url || this.google_url, "_blank");
    } else {
      window.open(this.google_url || this.apple_url, "_blank");
    }
  },
  game_ready() {
    console.log("[PlayableSDK]", this.channel, "game_ready()");
  },
  game_end() {
    console.log("[PlayableSDK]", this.channel, "game_end()");
  },
  game_start() {
    console.log("[PlayableSDK]", this.channel, "game_start()");
    this.init_mraid().then(() => {
      return System.import("./index.js");
    }).then(() => {
      this.game_ready();
    }).catch(_0x5b2e81 => {
      console.error("[PlayableSDK:" + this.channel + ":gameStart] System.import failed", _0x5b2e81);
    });
  },
  onMute(_0x2f572c) {
    console.log("[PlayableSDK]", this.channel, "onMute()");
    this._muteCallback = _0x2f572c;
    if (!this._isAudioEnabled && _0x2f572c) {
      _0x2f572c();
    }
  },
  onUnmute(_0x2e69ff) {
    console.log("[PlayableSDK]", this.channel, "onUnmute()");
    this._unmuteCallback = _0x2e69ff;
    if (this._isAudioEnabled && _0x2e69ff) {
      _0x2e69ff();
    }
  },
  onPause(_0x2a7461) {
    console.log("[PlayableSDK]", this.channel, "onPause()");
    this._pauseCallback = _0x2a7461;
    if (this._isPaused && this._isGameStarted && _0x2a7461) {
      _0x2a7461();
    }
  },
  onResume(_0x5eab11) {
    console.log("[PlayableSDK]", this.channel, "onResume()");
    this._resumeCallback = _0x5eab11;
  },
  init_mraid() {
    const _0x226740 = this.channel;
    return new Promise(_0x499295 => {
      if (typeof mraid === "undefined") {
        console.log("[PlayableSDK:" + _0x226740 + ":mraid] mraid not found, assuming local testing environment.");
        window.PlayableSDK._isAudioEnabled = true;
        window.PlayableSDK._isPaused = false;
        _0x499295();
        return;
      }
      function _0x29b720() {
        window.PlayableSDK._isGameStarted = true;
        _0x499295();
      }
      function _0x8c9777(_0x58d8e3) {
        console.log("[PlayableSDK:" + _0x226740 + ":mraid] viewableChange: " + _0x58d8e3);
        if (_0x58d8e3) {
          window.PlayableSDK._isPaused = false;
          if (!window.PlayableSDK._isGameStarted) {
            _0x29b720();
          } else if (window.PlayableSDK._resumeCallback) {
            window.PlayableSDK._resumeCallback();
          }
        } else {
          window.PlayableSDK._isPaused = true;
          if (window.PlayableSDK._isGameStarted && window.PlayableSDK._pauseCallback) {
            window.PlayableSDK._pauseCallback();
          }
        }
      }
      function _0x102256(_0x8cfe4f) {
        console.log("[PlayableSDK:" + _0x226740 + ":mraid] orientationChange", _0x8cfe4f);
        window.dispatchEvent(new Event("resize"));
      }
      function _0x5f2f05(_0x3a8abf) {
        console.log("[PlayableSDK:" + _0x226740 + ":mraid] audioVolumeChange", _0x3a8abf);
        window.PlayableSDK._isAudioEnabled = _0x3a8abf > 0;
        if (window.PlayableSDK._isAudioEnabled) {
          if (window.PlayableSDK._unmuteCallback) {
            window.PlayableSDK._unmuteCallback();
          }
        } else if (window.PlayableSDK._muteCallback) {
          window.PlayableSDK._muteCallback();
        }
      }
      function _0x18341f() {
        mraid.removeEventListener("ready", _0x18341f);
        window.PlayableSDK._isAudioEnabled = true;
        mraid.addEventListener("viewableChange", _0x8c9777);
        mraid.addEventListener("orientationChange", _0x102256);
        mraid.addEventListener("audioVolumeChange", _0x5f2f05);
        if (mraid.isViewable()) {
          _0x8c9777(true);
        }
      }
      const _0x41f7ce = mraid.getState();
      console.log("[PlayableSDK:" + _0x226740 + ":mraid] mraid state: " + _0x41f7ce);
      if (_0x41f7ce === "loading") {
        mraid.addEventListener("ready", _0x18341f);
      } else if (_0x41f7ce === "default" || _0x41f7ce === "ready") {
        _0x18341f();
      } else {
        console.warn("[PlayableSDK:" + _0x226740 + ":mraid] unexpected mraid state: " + _0x41f7ce);
        try {
          _0x18341f();
        } catch (_0x4b0e0e) {
          console.error("[PlayableSDK:" + _0x226740 + ":mraid] Failed to initialize MRAID:", _0x4b0e0e);
          _0x499295();
        }
      }
    });
  }
};