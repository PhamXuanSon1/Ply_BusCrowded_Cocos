window.PlayableSDK = {
  channel: "MyTarget",
  google_url: "",
  apple_url: "",
  detectOS() {
    if (navigator.userAgentData && navigator.userAgentData.platform) {
      const _0x230aa8 = navigator.userAgentData.platform;
      return _0x230aa8;
    }
    const _0x33f5a7 = navigator.userAgent || "";
    const _0x16db50 = navigator.platform || "";
    if (/android/i.test(_0x33f5a7)) {
      return "Android";
    }
    if (/iPhone|iPad|iPod/i.test(_0x33f5a7) || _0x16db50 === "MacIntel" && "ontouchstart" in window) {
      return "iOS";
    }
    if (/Win/i.test(_0x16db50)) {
      return "Windows";
    }
    if (/Mac/i.test(_0x16db50)) {
      return "macOS";
    }
    if (/Linux/i.test(_0x16db50)) {
      return "Linux";
    }
    return "Unknown OS";
  },
  download() {
    console.log("[PlayableSDK]", this.channel, "download()");
    try {
      MTRG.onCTAClick();
      return;
    } catch (_0xb18822) {
      console.warn("[PlayableSDK:" + this.channel + ":download] MTRG.onCTAClick failed, trying FbPlayableAd", _0xb18822);
    }
    try {
      FbPlayableAd.onCTAClick();
      return;
    } catch (_0x3b56a1) {
      console.warn("[PlayableSDK:" + this.channel + ":download] FbPlayableAd.onCTAClick failed, falling back to window.open", _0x3b56a1);
    }
    const _0x34a8f8 = this.detectOS();
    if (_0x34a8f8 === "iOS" || _0x34a8f8 === "macOS") {
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
    System.import("./index.js").then(() => {
      this.game_ready();
    }).catch(_0x4954fc => {
      console.error("[PlayableSDK:" + this.channel + ":gameStart] System.import failed", _0x4954fc);
    });
  },
  onMute(_0x4fc9a0) {
    console.log("[PlayableSDK]", this.channel, "onMute()");
  },
  onUnmute(_0x1370bd) {
    console.log("[PlayableSDK]", this.channel, "onUnmute()");
  },
  onPause(_0x1edc85) {
    console.log("[PlayableSDK]", this.channel, "onPause()");
  },
  onResume(_0x2df208) {
    console.log("[PlayableSDK]", this.channel, "onResume()");
  }
};