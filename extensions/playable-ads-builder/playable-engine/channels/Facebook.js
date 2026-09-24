window.PlayableSDK = {
  channel: "Facebook",
  google_url: "",
  apple_url: "",
  detectOS() {
    if (navigator.userAgentData && navigator.userAgentData.platform) {
      const _0x228baf = navigator.userAgentData.platform;
      return _0x228baf;
    }
    const _0x33fd8c = navigator.userAgent || "";
    const _0x2e9229 = navigator.platform || "";
    if (/android/i.test(_0x33fd8c)) {
      return "Android";
    }
    if (/iPhone|iPad|iPod/i.test(_0x33fd8c) || _0x2e9229 === "MacIntel" && "ontouchstart" in window) {
      return "iOS";
    }
    if (/Win/i.test(_0x2e9229)) {
      return "Windows";
    }
    if (/Mac/i.test(_0x2e9229)) {
      return "macOS";
    }
    if (/Linux/i.test(_0x2e9229)) {
      return "Linux";
    }
    return "Unknown OS";
  },
  download() {
    console.log("[PlayableSDK]", this.channel, "download()");
    try {
      FbPlayableAd.onCTAClick();
      return;
    } catch (_0x3aa926) {
      console.warn("[PlayableSDK:" + this.channel + ":download] FbPlayableAd.onCTAClick failed, falling back to window.open", _0x3aa926);
    }
    const _0x55a6b1 = this.detectOS();
    if (_0x55a6b1 === "iOS" || _0x55a6b1 === "macOS") {
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
  onMute(_0x42f03a) {
    console.log("[PlayableSDK]", this.channel, "onMute()");
  },
  onUnmute(_0x2dae8b) {
    console.log("[PlayableSDK]", this.channel, "onUnmute()");
  },
  onPause(_0x1e11b5) {
    console.log("[PlayableSDK]", this.channel, "onPause()");
  },
  onResume(_0x27cc71) {
    console.log("[PlayableSDK]", this.channel, "onResume()");
  },
  game_start() {
    console.log("[PlayableSDK]", this.channel, "game_start()");
    try {
      Object.defineProperty(Navigator.prototype, "getGamepads", {
        value: function () {
          return [];
        },
        writable: true,
        configurable: true
      });
    } catch (_0x119c4b) {}
    System.import("./index.js").then(() => {
      this.game_ready();
    }).catch(_0x504885 => {
      console.error("[PlayableSDK:" + this.channel + ":gameStart] System.import failed", _0x504885);
    });
  }
};