window.PlayableSDK = {
  channel: "Unity",
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
      const _0x525008 = navigator.userAgentData.platform;
      return _0x525008;
    }
    const _0x375428 = navigator.userAgent || "";
    const _0x187f2e = navigator.platform || "";
    if (/android/i.test(_0x375428)) {
      return "Android";
    }
    if (/iPhone|iPad|iPod/i.test(_0x375428) || _0x187f2e === "MacIntel" && "ontouchstart" in window) {
      return "iOS";
    }
    if (/Win/i.test(_0x187f2e)) {
      return "Windows";
    }
    if (/Mac/i.test(_0x187f2e)) {
      return "macOS";
    }
    if (/Linux/i.test(_0x187f2e)) {
      return "Linux";
    }
    return "Unknown OS";
  },
  download() {
    console.log("[PlayableSDK]", this.channel, "download()");
    const _0xbbcf3b = this.detectOS();
    try {
      if (_0xbbcf3b === "Android" && this.google_url) {
        mraid.open(this.google_url);
        return;
      } else if (_0xbbcf3b === "iOS" && this.apple_url) {
        mraid.open(this.apple_url);
        return;
      } else if (this.google_url) {
        mraid.open(this.google_url);
        return;
      } else if (this.apple_url) {
        mraid.open(this.apple_url);
        return;
      }
    } catch (_0x4788ad) {
      console.warn("[PlayableSDK:" + this.channel + ":download] mraid.open failed, falling back to window.open", _0x4788ad);
    }
    if (_0xbbcf3b === "iOS" || _0xbbcf3b === "macOS") {
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
    }).catch(_0x34c2a7 => {
      console.error("[PlayableSDK:" + this.channel + ":gameStart] System.import failed", _0x34c2a7);
    });
  },
  onMute(_0x59214d) {
    console.log("[PlayableSDK]", this.channel, "onMute()");
    this._muteCallback = _0x59214d;
    if (!this._isAudioEnabled && _0x59214d) {
      _0x59214d();
    }
  },
  onUnmute(_0x312370) {
    console.log("[PlayableSDK]", this.channel, "onUnmute()");
    this._unmuteCallback = _0x312370;
    if (this._isAudioEnabled && _0x312370) {
      _0x312370();
    }
  },
  onPause(_0x552845) {
    console.log("[PlayableSDK]", this.channel, "onPause()");
    this._pauseCallback = _0x552845;
    if (this._isPaused && this._isGameStarted && _0x552845) {
      _0x552845();
    }
  },
  onResume(_0x188d02) {
    console.log("[PlayableSDK]", this.channel, "onResume()");
    this._resumeCallback = _0x188d02;
  },
  init_mraid() {
    const _0x34d803 = this.channel;
    return new Promise(_0x141cc => {
      if (typeof mraid === "undefined") {
        console.log("[PlayableSDK:" + _0x34d803 + ":mraid] mraid not found, assuming local testing environment.");
        window.PlayableSDK._isAudioEnabled = true;
        window.PlayableSDK._isPaused = false;
        _0x141cc();
        return;
      }
      function _0x3a63d4() {
        window.PlayableSDK._isGameStarted = true;
        _0x141cc();
      }
      function _0x14fef0(_0x3c9c0d) {
        console.log("[PlayableSDK:" + _0x34d803 + ":mraid] viewableChange: " + _0x3c9c0d);
        if (_0x3c9c0d) {
          window.PlayableSDK._isPaused = false;
          if (!window.PlayableSDK._isGameStarted) {
            _0x3a63d4();
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
      function _0x3f7405(_0x16b31c) {
        console.log("[PlayableSDK:" + _0x34d803 + ":mraid] orientationChange", _0x16b31c);
        window.dispatchEvent(new Event("resize"));
      }
      function _0x4af13c(_0x8bc295) {
        console.log("[PlayableSDK:" + _0x34d803 + ":mraid] audioVolumeChange", _0x8bc295);
        window.PlayableSDK._isAudioEnabled = _0x8bc295 > 0;
        if (window.PlayableSDK._isAudioEnabled) {
          if (window.PlayableSDK._unmuteCallback) {
            window.PlayableSDK._unmuteCallback();
          }
        } else if (window.PlayableSDK._muteCallback) {
          window.PlayableSDK._muteCallback();
        }
      }
      function _0x37c529() {
        mraid.removeEventListener("ready", _0x37c529);
        window.PlayableSDK._isAudioEnabled = true;
        mraid.addEventListener("viewableChange", _0x14fef0);
        mraid.addEventListener("orientationChange", _0x3f7405);
        mraid.addEventListener("audioVolumeChange", _0x4af13c);
        if (mraid.isViewable()) {
          _0x14fef0(true);
        }
      }
      const _0x3482d3 = mraid.getState();
      console.log("[PlayableSDK:" + _0x34d803 + ":mraid] mraid state: " + _0x3482d3);
      if (_0x3482d3 === "loading") {
        mraid.addEventListener("ready", _0x37c529);
      } else if (_0x3482d3 === "default" || _0x3482d3 === "ready") {
        _0x37c529();
      } else {
        console.warn("[PlayableSDK:" + _0x34d803 + ":mraid] unexpected mraid state: " + _0x3482d3);
        try {
          _0x37c529();
        } catch (_0xfc8d09) {
          console.error("[PlayableSDK:" + _0x34d803 + ":mraid] Failed to initialize MRAID:", _0xfc8d09);
          _0x141cc();
        }
      }
    });
  }
};