window.PlayableSDK = {
  channel: "IronSource",
  google_url: "",
  apple_url: "",
  _muteCallback: null,
  _unmuteCallback: null,
  _pauseCallback: null,
  _resumeCallback: null,
  _isGameStarted: false,
  _isAudioEnabled: false,
  _isPaused: false,
  onMute(_0x3c5f3e) {
    console.log("[PlayableSDK]", this.channel, "onMute()");
    this._muteCallback = _0x3c5f3e;
    if (!this._isAudioEnabled && _0x3c5f3e) {
      _0x3c5f3e();
    }
  },
  onUnmute(_0x44aff8) {
    console.log("[PlayableSDK]", this.channel, "onUnmute()");
    this._unmuteCallback = _0x44aff8;
    if (this._isAudioEnabled && _0x44aff8) {
      _0x44aff8();
    }
  },
  onPause(_0x5627c7) {
    console.log("[PlayableSDK]", this.channel, "onPause()");
    this._pauseCallback = _0x5627c7;
    if (this._isPaused && this._isGameStarted && _0x5627c7) {
      _0x5627c7();
    }
  },
  onResume(_0x3c26e3) {
    console.log("[PlayableSDK]", this.channel, "onResume()");
    this._resumeCallback = _0x3c26e3;
  },
  detectOS() {
    if (navigator.userAgentData && navigator.userAgentData.platform) {
      const _0x23ccc5 = navigator.userAgentData.platform;
      return _0x23ccc5;
    }
    const _0x33a9dc = navigator.userAgent || "";
    const _0x1f0a21 = navigator.platform || "";
    if (/android/i.test(_0x33a9dc)) {
      return "Android";
    }
    if (/iPhone|iPad|iPod/i.test(_0x33a9dc) || _0x1f0a21 === "MacIntel" && "ontouchstart" in window) {
      return "iOS";
    }
    if (/Win/i.test(_0x1f0a21)) {
      return "Windows";
    }
    if (/Mac/i.test(_0x1f0a21)) {
      return "macOS";
    }
    if (/Linux/i.test(_0x1f0a21)) {
      return "Linux";
    }
    return "Unknown OS";
  },
  download() {
    console.log("[PlayableSDK]", this.channel, "download()");
    try {
      dapi.openStoreUrl();
      return;
    } catch (_0x5f21bd) {
      console.warn("[PlayableSDK:" + this.channel + ":download] dapi.openStoreUrl failed, falling back to window.open", _0x5f21bd);
    }
    const _0x8135a3 = this.detectOS();
    if (_0x8135a3 === "iOS" || _0x8135a3 === "macOS") {
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
    this.init_dapi().then(() => {
      return System.import("./index.js");
    }).then(() => {
      this.game_ready();
    }).catch(_0x177231 => {
      console.error("[PlayableSDK:" + this.channel + ":gameStart] System.import failed", _0x177231);
    });
  },
  init_dapi() {
    const _0x6e83d5 = this.channel;
    return new Promise(_0x347215 => {
      try {
        if (window.location.protocol === "file:") {
          console.log("[PlayableSDK:" + _0x6e83d5 + ":dapi] Loading via file://, resolving directly.");
          window.PlayableSDK._isAudioEnabled = true;
          window.PlayableSDK._isPaused = false;
          _0x347215();
          return;
        }
        if (dapi.isReady()) {
          _0xcf10cf();
        } else {
          dapi.addEventListener("ready", _0xcf10cf);
        }
        function _0xcf10cf() {
          dapi.removeEventListener("ready", _0xcf10cf);
          window.PlayableSDK._isAudioEnabled = !!dapi.getAudioVolume();
          if (dapi.isViewable()) {
            _0x4e24a3({
              isViewable: true
            });
          }
          dapi.addEventListener("viewableChange", _0x4e24a3);
          dapi.addEventListener("adResized", _0x1a9f79);
          dapi.addEventListener("audioVolumeChange", _0x30c026);
        }
        function _0x44dbf6() {
          var _0xd6fda2 = dapi.getScreenSize();
          window.PlayableSDK._isGameStarted = true;
          _0x347215();
        }
        function _0x3de59c() {}
        function _0x4e24a3(_0xc5c988) {
          console.log("[PlayableSDK:" + _0x6e83d5 + ":dapi] isViewable: " + _0xc5c988.isViewable);
          if (_0xc5c988.isViewable) {
            window.PlayableSDK._isPaused = false;
            screenSize = dapi.getScreenSize();
            if (!window.PlayableSDK._isGameStarted) {
              _0x44dbf6();
            } else if (window.PlayableSDK._resumeCallback) {
              window.PlayableSDK._resumeCallback();
            }
          } else {
            window.PlayableSDK._isPaused = true;
            _0x3de59c();
            if (window.PlayableSDK._pauseCallback) {
              window.PlayableSDK._pauseCallback();
            }
          }
        }
        function _0x1a9f79(_0x3ac535) {
          screenSize = _0x3ac535;
          console.log("[PlayableSDK:" + _0x6e83d5 + ":dapi] ad resized width " + _0x3ac535.width + " height " + _0x3ac535.height);
        }
        function _0x30c026(_0x5e0925) {
          window.PlayableSDK._isAudioEnabled = !!_0x5e0925;
          if (window.PlayableSDK._isAudioEnabled) {
            if (window.PlayableSDK._unmuteCallback) {
              window.PlayableSDK._unmuteCallback();
            }
          } else if (window.PlayableSDK._muteCallback) {
            window.PlayableSDK._muteCallback();
          }
        }
      } catch (_0x40bb2b) {
        console.warn("[PlayableSDK:" + _0x6e83d5 + ":dapi] init_dapi error, continuing", _0x40bb2b);
        _0x347215();
      }
    });
  }
};