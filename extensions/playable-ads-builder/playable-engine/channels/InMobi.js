window.PlayableSDK = {
  channel: "InMobi",
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
      const _0x421d67 = navigator.userAgentData.platform;
      return _0x421d67;
    }
    const _0x4cbb1c = navigator.userAgent || "";
    const _0xd0abbb = navigator.platform || "";
    if (/android/i.test(_0x4cbb1c)) {
      return "Android";
    }
    if (/iPhone|iPad|iPod/i.test(_0x4cbb1c) || _0xd0abbb === "MacIntel" && "ontouchstart" in window) {
      return "iOS";
    }
    if (/Win/i.test(_0xd0abbb)) {
      return "Windows";
    }
    if (/Mac/i.test(_0xd0abbb)) {
      return "macOS";
    }
    if (/Linux/i.test(_0xd0abbb)) {
      return "Linux";
    }
    return "Unknown OS";
  },
  download() {
    console.log("[PlayableSDK]", this.channel, "download()");
    const _0x4e3111 = this.detectOS();
    let _0x30c553 = "";
    if (_0x4e3111 === "Android" && this.google_url) {
      _0x30c553 = this.google_url;
    } else if (_0x4e3111 === "iOS" && this.apple_url) {
      _0x30c553 = this.apple_url;
    } else if (this.google_url) {
      _0x30c553 = this.google_url;
    } else if (this.apple_url) {
      _0x30c553 = this.apple_url;
    }
    try {
      if (typeof FbPlayableAd !== "undefined" && typeof FbPlayableAd.onCTAClick === "function") {
        FbPlayableAd.onCTAClick();
      }
    } catch (_0x3bf515) {
      console.warn("[PlayableSDK:" + this.channel + ":download] FbPlayableAd.onCTAClick failed", _0x3bf515);
    }
    if (_0x30c553) {
      try {
        if (typeof mraid !== "undefined" && typeof mraid.open === "function") {
          mraid.open(_0x30c553);
          return;
        }
      } catch (_0x5df2e0) {
        console.warn("[PlayableSDK:" + this.channel + ":download] mraid.open failed, falling back to window.open", _0x5df2e0);
      }
    }
    if (_0x4e3111 === "iOS" || _0x4e3111 === "macOS") {
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
    }).catch(_0xbed5bf => {
      console.error("[PlayableSDK:" + this.channel + ":gameStart] System.import failed", _0xbed5bf);
    });
  },
  onMute(_0x41861d) {
    console.log("[PlayableSDK]", this.channel, "onMute()");
    this._muteCallback = _0x41861d;
    if (!this._isAudioEnabled && _0x41861d) {
      _0x41861d();
    }
  },
  onUnmute(_0x1a394f) {
    console.log("[PlayableSDK]", this.channel, "onUnmute()");
    this._unmuteCallback = _0x1a394f;
    if (this._isAudioEnabled && _0x1a394f) {
      _0x1a394f();
    }
  },
  onPause(_0x11eaef) {
    console.log("[PlayableSDK]", this.channel, "onPause()");
    this._pauseCallback = _0x11eaef;
    if (this._isPaused && this._isGameStarted && _0x11eaef) {
      _0x11eaef();
    }
  },
  onResume(_0x165b98) {
    console.log("[PlayableSDK]", this.channel, "onResume()");
    this._resumeCallback = _0x165b98;
  },
  init_mraid() {
    const _0x35d605 = this.channel;
    return new Promise(_0x45afb5 => {
      if (typeof mraid === "undefined") {
        console.log("[PlayableSDK:" + _0x35d605 + ":mraid] mraid not found, assuming local testing environment.");
        window.PlayableSDK._isAudioEnabled = true;
        window.PlayableSDK._isPaused = false;
        _0x45afb5();
        return;
      }
      function _0x173e10() {
        window.PlayableSDK._isGameStarted = true;
        _0x45afb5();
      }
      function _0x4d5321(_0x352e6a) {
        console.log("[PlayableSDK:" + _0x35d605 + ":mraid] viewableChange: " + _0x352e6a);
        if (_0x352e6a) {
          window.PlayableSDK._isPaused = false;
          if (!window.PlayableSDK._isGameStarted) {
            _0x173e10();
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
      function _0x31d160(_0x263082) {
        console.log("[PlayableSDK:" + _0x35d605 + ":mraid] orientationChange", _0x263082);
        window.dispatchEvent(new Event("resize"));
      }
      function _0x43b90c(_0x22d466) {
        console.log("[PlayableSDK:" + _0x35d605 + ":mraid] audioVolumeChange", _0x22d466);
        window.PlayableSDK._isAudioEnabled = _0x22d466 > 0;
        if (window.PlayableSDK._isAudioEnabled) {
          if (window.PlayableSDK._unmuteCallback) {
            window.PlayableSDK._unmuteCallback();
          }
        } else if (window.PlayableSDK._muteCallback) {
          window.PlayableSDK._muteCallback();
        }
      }
      function _0x40c376() {
        mraid.removeEventListener("ready", _0x40c376);
        window.PlayableSDK._isAudioEnabled = true;
        mraid.addEventListener("viewableChange", _0x4d5321);
        mraid.addEventListener("orientationChange", _0x31d160);
        mraid.addEventListener("audioVolumeChange", _0x43b90c);
        if (mraid.isViewable()) {
          _0x4d5321(true);
        }
      }
      const _0x15fdb0 = mraid.getState();
      console.log("[PlayableSDK:" + _0x35d605 + ":mraid] mraid state: " + _0x15fdb0);
      if (_0x15fdb0 === "loading") {
        mraid.addEventListener("ready", _0x40c376);
      } else if (_0x15fdb0 === "default" || _0x15fdb0 === "ready") {
        _0x40c376();
      } else {
        console.warn("[PlayableSDK:" + _0x35d605 + ":mraid] unexpected mraid state: " + _0x15fdb0);
        try {
          _0x40c376();
        } catch (_0x21a469) {
          console.error("[PlayableSDK:" + _0x35d605 + ":mraid] Failed to initialize MRAID:", _0x21a469);
          _0x45afb5();
        }
      }
    });
  }
};