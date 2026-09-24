if (typeof snapchatCta === "undefined") {
  window.snapchatCta = function () {
    console.log("[snapchatCta] placeholder called (local test only)");
    const _0x518f76 = window.PlayableSDK ? window.PlayableSDK.detectOS() : "Unknown OS";
    if (_0x518f76 === "iOS" || _0x518f76 === "macOS") {
      window.open(window.PlayableSDK ? window.PlayableSDK.apple_url || window.PlayableSDK.google_url : "", "_blank");
    } else {
      window.open(window.PlayableSDK ? window.PlayableSDK.google_url || window.PlayableSDK.apple_url : "", "_blank");
    }
  };
}
window.PlayableSDK = {
  channel: "Snapchat",
  google_url: "",
  apple_url: "",
  detectOS() {
    if (navigator.userAgentData && navigator.userAgentData.platform) {
      const _0x1e0ef5 = navigator.userAgentData.platform;
      return _0x1e0ef5;
    }
    const _0x40d751 = navigator.userAgent || "";
    const _0x270fd5 = navigator.platform || "";
    if (/android/i.test(_0x40d751)) {
      return "Android";
    }
    if (/iPhone|iPad|iPod/i.test(_0x40d751) || _0x270fd5 === "MacIntel" && "ontouchstart" in window) {
      return "iOS";
    }
    if (/Win/i.test(_0x270fd5)) {
      return "Windows";
    }
    if (/Mac/i.test(_0x270fd5)) {
      return "macOS";
    }
    if (/Linux/i.test(_0x270fd5)) {
      return "Linux";
    }
    return "Unknown OS";
  },
  download() {
    console.log("[PlayableSDK]", this.channel, "download()");
    try {
      snapchatCta();
      return;
    } catch (_0x3acc27) {
      console.warn("[PlayableSDK:" + this.channel + ":download] snapchatCta failed, falling back to window.open", _0x3acc27);
    }
    const _0x4feda8 = this.detectOS();
    if (_0x4feda8 === "iOS" || _0x4feda8 === "macOS") {
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
  onMute(_0x433de3) {
    console.log("[PlayableSDK]", this.channel, "onMute()");
  },
  onUnmute(_0x205727) {
    console.log("[PlayableSDK]", this.channel, "onUnmute()");
  },
  onPause(_0x32f715) {
    console.log("[PlayableSDK]", this.channel, "onPause()");
  },
  onResume(_0x21f663) {
    console.log("[PlayableSDK]", this.channel, "onResume()");
  },
  game_start() {
    console.log("[PlayableSDK]", this.channel, "game_start()");
    System.import("./index.js").then(() => {
      this.game_ready();
    }).catch(_0x5eb2c6 => {
      console.error("[PlayableSDK:" + this.channel + ":gameStart] System.import failed", _0x5eb2c6);
    });
  }
};