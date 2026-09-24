window.PlayableSDK = {
  channel: "Vungle",
  google_url: "",
  apple_url: "",
  _pauseCallback: null,
  _resumeCallback: null,
  _isPaused: false,
  _isGameStarted: false,
  detectOS() {
    if (navigator.userAgentData && navigator.userAgentData.platform) {
      const _0x1f2f70 = navigator.userAgentData.platform;
      return _0x1f2f70;
    }
    const _0x569e09 = navigator.userAgent || "";
    const _0x366e27 = navigator.platform || "";
    if (/android/i.test(_0x569e09)) {
      return "Android";
    }
    if (/iPhone|iPad|iPod/i.test(_0x569e09) || _0x366e27 === "MacIntel" && "ontouchstart" in window) {
      return "iOS";
    }
    if (/Win/i.test(_0x366e27)) {
      return "Windows";
    }
    if (/Mac/i.test(_0x366e27)) {
      return "macOS";
    }
    if (/Linux/i.test(_0x366e27)) {
      return "Linux";
    }
    return "Unknown OS";
  },
  download() {
    console.log("[PlayableSDK]", this.channel, "download()");
    try {
      parent.postMessage("download", "*");
      return;
    } catch (_0x37abff) {
      console.warn("[PlayableSDK:" + this.channel + ":download] parent.postMessage failed, falling back to window.open", _0x37abff);
    }
    const _0x11351d = this.detectOS();
    if (_0x11351d === "iOS" || _0x11351d === "macOS") {
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
    try {
      parent.postMessage("complete", "*");
    } catch (_0x3abfa9) {
      console.error("[PlayableSDK:" + this.channel + ":gameEnd] parent.postMessage(complete) failed", _0x3abfa9);
    }
  },
  game_start() {
    console.log("[PlayableSDK]", this.channel, "game_start()");
    System.import("./index.js").then(() => {
      this._isGameStarted = true;
      this.game_ready();
    }).catch(_0xb014d9 => {
      console.error("[PlayableSDK:" + this.channel + ":gameStart] System.import failed", _0xb014d9);
    });
  },
  onMute(_0xeb46ae) {
    console.log("[PlayableSDK]", this.channel, "onMute()");
  },
  onUnmute(_0x4e7d77) {
    console.log("[PlayableSDK]", this.channel, "onUnmute()");
  },
  onPause(_0x2f0b6e) {
    console.log("[PlayableSDK]", this.channel, "onPause()");
    this._pauseCallback = _0x2f0b6e;
    if (this._isPaused && this._isGameStarted && _0x2f0b6e) {
      _0x2f0b6e();
    }
    if (!this._pauseEventRegistered) {
      this._pauseEventRegistered = true;
      window.addEventListener("ad-event-pause", () => {
        this._isPaused = true;
        if (this._pauseCallback && typeof this._pauseCallback === "function") {
          this._pauseCallback();
        }
      });
    }
  },
  onResume(_0x26f3e8) {
    console.log("[PlayableSDK]", this.channel, "onResume()");
    this._resumeCallback = _0x26f3e8;
    if (!this._resumeEventRegistered) {
      this._resumeEventRegistered = true;
      window.addEventListener("ad-event-resume", () => {
        this._isPaused = false;
        if (this._resumeCallback && typeof this._resumeCallback === "function") {
          this._resumeCallback();
        }
      });
    }
  }
};