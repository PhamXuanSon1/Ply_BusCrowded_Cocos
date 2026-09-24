window.PlayableSDK = {
  channel: "UnityPlayworks",
  google_url: "",
  apple_url: "",
  _muteCallback: null,
  _unmuteCallback: null,
  _pauseCallback: null,
  _resumeCallback: null,
  _isGameEnded: false,
  _eventsBound: false,
  _bindEvents() {
    if (this._eventsBound) {
      return;
    }
    this._eventsBound = true;
    window.addEventListener("luna:mute", () => {
      console.log("[PlayableSDK:" + this.channel + ":luna] mute");
      if (this._muteCallback) {
        this._muteCallback();
      }
    });
    window.addEventListener("luna:unmute", () => {
      console.log("[PlayableSDK:" + this.channel + ":luna] unmute");
      if (this._unmuteCallback) {
        this._unmuteCallback();
      }
    });
    window.addEventListener("luna:pause", () => {
      console.log("[PlayableSDK:" + this.channel + ":luna] pause");
      if (this._pauseCallback) {
        this._pauseCallback();
      }
    });
    window.addEventListener("luna:resume", () => {
      console.log("[PlayableSDK:" + this.channel + ":luna] resume");
      if (this._resumeCallback) {
        this._resumeCallback();
      }
    });
  },
  download() {
    console.log("[PlayableSDK]", this.channel, "download()");
    const _0x1c5da5 = window;
    try {
      if ("platformCTACall" in _0x1c5da5 && typeof _0x1c5da5.platformCTACall === "function") {
        _0x1c5da5.platformCTACall.call(null);
        return;
      }
      if (_0x1c5da5.Luna && _0x1c5da5.Luna.Unity && _0x1c5da5.Luna.Unity.Playable && typeof _0x1c5da5.Luna.Unity.Playable.InstallFullGame === "function") {
        _0x1c5da5.Luna.Unity.Playable.InstallFullGame();
        return;
      }
    } catch (_0x7ab15b) {
      console.warn("[PlayableSDK:" + this.channel + ":download] Luna CTA failed, falling back to window.open", _0x7ab15b);
    }
    if (this.google_url || this.apple_url) {
      window.open(this.google_url || this.apple_url, "_blank");
    }
  },
  game_ready() {
    console.log("[PlayableSDK]", this.channel, "game_ready()");
  },
  game_end() {
    console.log("[PlayableSDK]", this.channel, "game_end()");
    if (this._isGameEnded) {
      return;
    }
    this._isGameEnded = true;
    const _0x2c81bf = window;
    try {
      if ("platformGameEnded" in _0x2c81bf && typeof _0x2c81bf.platformGameEnded === "function") {
        _0x2c81bf.platformGameEnded.call(null);
        return;
      }
      if (_0x2c81bf.Luna && _0x2c81bf.Luna.Unity && _0x2c81bf.Luna.Unity.LifeCycle && typeof _0x2c81bf.Luna.Unity.LifeCycle.GameEnded === "function") {
        _0x2c81bf.Luna.Unity.LifeCycle.GameEnded();
      }
    } catch (_0x42ca26) {
      console.warn("[PlayableSDK:" + this.channel + ":game_end] Luna GameEnded failed", _0x42ca26);
    }
  },
  game_start() {
    console.log("[PlayableSDK]", this.channel, "game_start()");
    this._bindEvents();
    System.import("./index.js").then(() => {
      this.game_ready();
    }).catch(_0x31939e => {
      console.error("[PlayableSDK:" + this.channel + ":gameStart] System.import failed", _0x31939e);
    });
  },
  onMute(_0xa4f609) {
    console.log("[PlayableSDK]", this.channel, "onMute()");
    this._muteCallback = _0xa4f609;
  },
  onUnmute(_0x51c1ce) {
    console.log("[PlayableSDK]", this.channel, "onUnmute()");
    this._unmuteCallback = _0x51c1ce;
  },
  onPause(_0x56aba3) {
    console.log("[PlayableSDK]", this.channel, "onPause()");
    this._pauseCallback = _0x56aba3;
  },
  onResume(_0x51aafa) {
    console.log("[PlayableSDK]", this.channel, "onResume()");
    this._resumeCallback = _0x51aafa;
  }
};