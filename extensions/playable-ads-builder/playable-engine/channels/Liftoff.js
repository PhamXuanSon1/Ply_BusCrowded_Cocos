window.PlayableSDK = {
  channel: "Liftoff",
  google_url: "",
  apple_url: "",
  _pauseCallback: null,
  _resumeCallback: null,
  _isPaused: false,
  _isGameStarted: false,
  detectOS() {
    if (navigator.userAgentData && navigator.userAgentData.platform) {
      const _0x37f905 = navigator.userAgentData.platform;
      return _0x37f905;
    }
    const _0x4ef04d = navigator.userAgent || "";
    const _0x35260e = navigator.platform || "";
    if (/android/i.test(_0x4ef04d)) {
      return "Android";
    }
    if (/iPhone|iPad|iPod/i.test(_0x4ef04d) || _0x35260e === "MacIntel" && "ontouchstart" in window) {
      return "iOS";
    }
    if (/Win/i.test(_0x35260e)) {
      return "Windows";
    }
    if (/Mac/i.test(_0x35260e)) {
      return "macOS";
    }
    if (/Linux/i.test(_0x35260e)) {
      return "Linux";
    }
    return "Unknown OS";
  },
  download() {
    console.log("[PlayableSDK]", this.channel, "download()");
    try {
      parent.postMessage("download", "*");
      return;
    } catch (_0x22ed37) {
      console.warn("[PlayableSDK:" + this.channel + ":download] parent.postMessage failed, falling back to window.open", _0x22ed37);
    }
    const _0x192e6d = this.detectOS();
    if (_0x192e6d === "iOS" || _0x192e6d === "macOS") {
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
    } catch (_0x249408) {
      console.error("[PlayableSDK:" + this.channel + ":gameEnd] parent.postMessage(complete) failed", _0x249408);
    }
  },
  game_start() {
    console.log("[PlayableSDK]", this.channel, "game_start()");
    System.import("./index.js").then(() => {
      this._isGameStarted = true;
      this.game_ready();
    }).catch(_0x4127a7 => {
      console.error("[PlayableSDK:" + this.channel + ":gameStart] System.import failed", _0x4127a7);
    });
  },
  onMute(_0x118f60) {
    console.log("[PlayableSDK]", this.channel, "onMute()");
  },
  onUnmute(_0x525d3b) {
    console.log("[PlayableSDK]", this.channel, "onUnmute()");
  },
  onPause(_0x4d7889) {
    console.log("[PlayableSDK]", this.channel, "onPause()");
    this._pauseCallback = _0x4d7889;
    if (this._isPaused && this._isGameStarted && _0x4d7889) {
      _0x4d7889();
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
  onResume(_0x545912) {
    console.log("[PlayableSDK]", this.channel, "onResume()");
    this._resumeCallback = _0x545912;
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