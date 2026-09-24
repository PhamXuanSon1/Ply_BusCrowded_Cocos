window.PlayableSDK = {
  channel: "MRAID",
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
      const _0x5c9aab = navigator.userAgentData.platform;
      return _0x5c9aab;
    }
    const _0x30e498 = navigator.userAgent || "";
    const _0x2899ea = navigator.platform || "";
    if (/android/i.test(_0x30e498)) {
      return "Android";
    }
    if (/iPhone|iPad|iPod/i.test(_0x30e498) || _0x2899ea === "MacIntel" && "ontouchstart" in window) {
      return "iOS";
    }
    if (/Win/i.test(_0x2899ea)) {
      return "Windows";
    }
    if (/Mac/i.test(_0x2899ea)) {
      return "macOS";
    }
    if (/Linux/i.test(_0x2899ea)) {
      return "Linux";
    }
    return "Unknown OS";
  },
  download() {
    console.log("[PlayableSDK]", this.channel, "download()");
    const _0x507aa4 = this.detectOS();
    try {
      if (_0x507aa4 === "Android" && this.google_url) {
        mraid.open(this.google_url);
        return;
      } else if (_0x507aa4 === "iOS" && this.apple_url) {
        mraid.open(this.apple_url);
        return;
      } else if (this.google_url) {
        mraid.open(this.google_url);
        return;
      } else if (this.apple_url) {
        mraid.open(this.apple_url);
        return;
      }
    } catch (_0x5f03d5) {
      console.warn("[PlayableSDK:" + this.channel + ":download] mraid.open failed, falling back to window.open", _0x5f03d5);
    }
    if (_0x507aa4 === "iOS" || _0x507aa4 === "macOS") {
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
    }).catch(_0x2370b0 => {
      console.error("[PlayableSDK:" + this.channel + ":gameStart] System.import failed", _0x2370b0);
    });
  },
  onMute(_0x59f0db) {
    console.log("[PlayableSDK]", this.channel, "onMute()");
    this._muteCallback = _0x59f0db;
    if (!this._isAudioEnabled && _0x59f0db) {
      _0x59f0db();
    }
  },
  onUnmute(_0x2fde74) {
    console.log("[PlayableSDK]", this.channel, "onUnmute()");
    this._unmuteCallback = _0x2fde74;
    if (this._isAudioEnabled && _0x2fde74) {
      _0x2fde74();
    }
  },
  onPause(_0x144361) {
    console.log("[PlayableSDK]", this.channel, "onPause()");
    this._pauseCallback = _0x144361;
    if (this._isPaused && this._isGameStarted && _0x144361) {
      _0x144361();
    }
  },
  onResume(_0xcf3573) {
    console.log("[PlayableSDK]", this.channel, "onResume()");
    this._resumeCallback = _0xcf3573;
  },
  init_mraid() {
    const _0x5efbab = this.channel;
    return new Promise(_0x38f7c9 => {
      if (typeof mraid === "undefined") {
        console.log("[PlayableSDK:" + _0x5efbab + ":mraid] mraid not found, assuming local testing environment.");
        window.PlayableSDK._isAudioEnabled = true;
        window.PlayableSDK._isPaused = false;
        _0x38f7c9();
        return;
      }
      function _0x2ea1fb() {
        window.PlayableSDK._isGameStarted = true;
        _0x38f7c9();
      }
      function _0x1ef6ed(_0x5d177b) {
        console.log("[PlayableSDK:" + _0x5efbab + ":mraid] viewableChange: " + _0x5d177b);
        if (_0x5d177b) {
          window.PlayableSDK._isPaused = false;
          if (!window.PlayableSDK._isGameStarted) {
            _0x2ea1fb();
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
      function _0x2113b7(_0x35795b) {
        console.log("[PlayableSDK:" + _0x5efbab + ":mraid] orientationChange", _0x35795b);
        window.dispatchEvent(new Event("resize"));
      }
      function _0x59a159(_0x179469) {
        console.log("[PlayableSDK:" + _0x5efbab + ":mraid] audioVolumeChange", _0x179469);
        window.PlayableSDK._isAudioEnabled = _0x179469 > 0;
        if (window.PlayableSDK._isAudioEnabled) {
          if (window.PlayableSDK._unmuteCallback) {
            window.PlayableSDK._unmuteCallback();
          }
        } else if (window.PlayableSDK._muteCallback) {
          window.PlayableSDK._muteCallback();
        }
      }
      function _0x4d9e77() {
        mraid.removeEventListener("ready", _0x4d9e77);
        window.PlayableSDK._isAudioEnabled = true;
        mraid.addEventListener("viewableChange", _0x1ef6ed);
        mraid.addEventListener("orientationChange", _0x2113b7);
        mraid.addEventListener("audioVolumeChange", _0x59a159);
        if (mraid.isViewable()) {
          _0x1ef6ed(true);
        }
      }
      const _0x35ab02 = mraid.getState();
      console.log("[PlayableSDK:" + _0x5efbab + ":mraid] mraid state: " + _0x35ab02);
      if (_0x35ab02 === "loading") {
        mraid.addEventListener("ready", _0x4d9e77);
      } else if (_0x35ab02 === "default" || _0x35ab02 === "ready") {
        _0x4d9e77();
      } else {
        console.warn("[PlayableSDK:" + _0x5efbab + ":mraid] unexpected mraid state: " + _0x35ab02);
        try {
          _0x4d9e77();
        } catch (_0x1dbeb6) {
          console.error("[PlayableSDK:" + _0x5efbab + ":mraid] Failed to initialize MRAID:", _0x1dbeb6);
          _0x38f7c9();
        }
      }
    });
  }
};