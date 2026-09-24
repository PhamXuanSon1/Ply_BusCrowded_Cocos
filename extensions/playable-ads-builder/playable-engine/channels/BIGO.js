window.PlayableSDK = {
  channel: "BIGO",
  google_url: "",
  apple_url: "",
  detectOS() {
    if (navigator.userAgentData && navigator.userAgentData.platform) {
      const _0x1adbdb = navigator.userAgentData.platform;
      return _0x1adbdb;
    }
    const _0x9a2e42 = navigator.userAgent || "";
    const _0x40f059 = navigator.platform || "";
    if (/android/i.test(_0x9a2e42)) {
      return "Android";
    }
    if (/iPhone|iPad|iPod/i.test(_0x9a2e42) || _0x40f059 === "MacIntel" && "ontouchstart" in window) {
      return "iOS";
    }
    if (/Win/i.test(_0x40f059)) {
      return "Windows";
    }
    if (/Mac/i.test(_0x40f059)) {
      return "macOS";
    }
    if (/Linux/i.test(_0x40f059)) {
      return "Linux";
    }
    return "Unknown OS";
  },
  download() {
    console.log("[PlayableSDK]", this.channel, "download()");
    try {
      window.BGY_MRAID.open();
      return;
    } catch (_0x89ea86) {
      console.warn("[PlayableSDK:" + this.channel + ":download] BGY_MRAID.open failed, falling back to window.open", _0x89ea86);
    }
    const _0x1d386c = this.detectOS();
    if (_0x1d386c === "iOS" || _0x1d386c === "macOS") {
      window.open(this.apple_url || this.google_url, "_blank");
    } else {
      window.open(this.google_url || this.apple_url, "_blank");
    }
  },
  game_ready() {
    console.log("[PlayableSDK]", this.channel, "game_ready()");
    if (window.BGY_MRAID) {
      window.BGY_MRAID.gameReady();
    }
  },
  game_end() {
    console.log("[PlayableSDK]", this.channel, "game_end()");
    if (window.BGY_MRAID) {
      window.BGY_MRAID.gameEnd();
    }
  },
  game_start() {
    console.log("[PlayableSDK]", this.channel, "game_start()");
    System.import("./index.js").then(() => {
      this.game_ready();
    }).catch(_0x5a103f => {
      console.error("[PlayableSDK:" + this.channel + ":gameStart] System.import failed", _0x5a103f);
    });
  },
  onMute(_0x135968) {
    console.log("[PlayableSDK]", this.channel, "onMute()");
  },
  onUnmute(_0x4b19b8) {
    console.log("[PlayableSDK]", this.channel, "onUnmute()");
  },
  onPause(_0x5c085f) {
    console.log("[PlayableSDK]", this.channel, "onPause()");
  },
  onResume(_0x5e6c62) {
    console.log("[PlayableSDK]", this.channel, "onResume()");
  }
};