window.PlayableSDK = {
  channel: "AppLovin",
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
      const _0x3af945 = navigator.userAgentData.platform;
      return _0x3af945;
    }
    const _0x280c6a = navigator.userAgent || "";
    const _0x59bbdb = navigator.platform || "";
    if (/android/i.test(_0x280c6a)) {
      return "Android";
    }
    if (/iPhone|iPad|iPod/i.test(_0x280c6a) || _0x59bbdb === "MacIntel" && "ontouchstart" in window) {
      return "iOS";
    }
    if (/Win/i.test(_0x59bbdb)) {
      return "Windows";
    }
    if (/Mac/i.test(_0x59bbdb)) {
      return "macOS";
    }
    if (/Linux/i.test(_0x59bbdb)) {
      return "Linux";
    }
    return "Unknown OS";
  },
  download() {
    console.log("[PlayableSDK]", this.channel, "download()");
    const _0x32bc99 = this.detectOS();
    try {
      if (_0x32bc99 === "Android" && this.google_url) {
        mraid.open(this.google_url);
        return;
      } else if (_0x32bc99 === "iOS" && this.apple_url) {
        mraid.open(this.apple_url);
        return;
      } else if (this.google_url) {
        mraid.open(this.google_url);
        return;
      } else if (this.apple_url) {
        mraid.open(this.apple_url);
        return;
      }
    } catch (_0x5b502e) {
      console.warn("[PlayableSDK:" + this.channel + ":download] mraid.open failed, falling back to window.open", _0x5b502e);
    }
    if (_0x32bc99 === "iOS" || _0x32bc99 === "macOS") {
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
    }).catch(_0x463dd7 => {
      console.error("[PlayableSDK:" + this.channel + ":gameStart] System.import failed", _0x463dd7);
    });
  },
  onMute(_0x1cd786) {
    console.log("[PlayableSDK]", this.channel, "onMute()");
    this._muteCallback = _0x1cd786;
    if (!this._isAudioEnabled && _0x1cd786) {
      _0x1cd786();
    }
  },
  onUnmute(_0x558a80) {
    console.log("[PlayableSDK]", this.channel, "onUnmute()");
    this._unmuteCallback = _0x558a80;
    if (this._isAudioEnabled && _0x558a80) {
      _0x558a80();
    }
  },
  onPause(_0x3d2fae) {
    console.log("[PlayableSDK]", this.channel, "onPause()");
    this._pauseCallback = _0x3d2fae;
    if (this._isPaused && this._isGameStarted && _0x3d2fae) {
      _0x3d2fae();
    }
  },
  onResume(_0x388c35) {
    console.log("[PlayableSDK]", this.channel, "onResume()");
    this._resumeCallback = _0x388c35;
  },
  init_mraid() {
    const _0x1340dc = this.channel;
    return new Promise(_0x512953 => {
      if (typeof mraid === "undefined") {
        console.log("[PlayableSDK:" + _0x1340dc + ":mraid] mraid not found, assuming local testing environment.");
        window.PlayableSDK._isAudioEnabled = true;
        window.PlayableSDK._isPaused = false;
        _0x512953();
        return;
      }
      function _0x19e2ba() {
        window.PlayableSDK._isGameStarted = true;
        _0x512953();
      }
      function _0x3b8234(_0x221304) {
        console.log("[PlayableSDK:" + _0x1340dc + ":mraid] viewableChange: " + _0x221304);
        if (_0x221304) {
          window.PlayableSDK._isPaused = false;
          if (!window.PlayableSDK._isGameStarted) {
            _0x19e2ba();
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
      function _0x3c67f0(_0x24acca) {
        console.log("[PlayableSDK:" + _0x1340dc + ":mraid] orientationChange", _0x24acca);
        window.dispatchEvent(new Event("resize"));
      }
      function _0x4e3ccd(_0x345c4d) {
        console.log("[PlayableSDK:" + _0x1340dc + ":mraid] audioVolumeChange", _0x345c4d);
        window.PlayableSDK._isAudioEnabled = _0x345c4d > 0;
        if (window.PlayableSDK._isAudioEnabled) {
          if (window.PlayableSDK._unmuteCallback) {
            window.PlayableSDK._unmuteCallback();
          }
        } else if (window.PlayableSDK._muteCallback) {
          window.PlayableSDK._muteCallback();
        }
      }
      function _0xf3e791() {
        mraid.removeEventListener("ready", _0xf3e791);
        window.PlayableSDK._isAudioEnabled = true;
        mraid.addEventListener("viewableChange", _0x3b8234);
        mraid.addEventListener("orientationChange", _0x3c67f0);
        mraid.addEventListener("audioVolumeChange", _0x4e3ccd);
        if (mraid.isViewable()) {
          _0x3b8234(true);
        }
      }
      const _0x459f6f = mraid.getState();
      console.log("[PlayableSDK:" + _0x1340dc + ":mraid] mraid state: " + _0x459f6f);
      if (_0x459f6f === "loading") {
        mraid.addEventListener("ready", _0xf3e791);
      } else if (_0x459f6f === "default" || _0x459f6f === "ready") {
        _0xf3e791();
      } else {
        console.warn("[PlayableSDK:" + _0x1340dc + ":mraid] unexpected mraid state: " + _0x459f6f);
        try {
          _0xf3e791();
        } catch (_0x2eb189) {
          console.error("[PlayableSDK:" + _0x1340dc + ":mraid] Failed to initialize MRAID:", _0x2eb189);
          _0x512953();
        }
      }
    });
  }
};