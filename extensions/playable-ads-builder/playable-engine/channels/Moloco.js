window.PlayableSDK = {
  channel: "Moloco",
  google_url: "",
  apple_url: "",
  detectOS() {
    if (navigator.userAgentData && navigator.userAgentData.platform) {
      const _0x4d2630 = navigator.userAgentData.platform;
      return _0x4d2630;
    }
    const _0x2e7a66 = navigator.userAgent || "";
    const _0x220205 = navigator.platform || "";
    if (/android/i.test(_0x2e7a66)) {
      return "Android";
    }
    if (/iPhone|iPad|iPod/i.test(_0x2e7a66) || _0x220205 === "MacIntel" && "ontouchstart" in window) {
      return "iOS";
    }
    if (/Win/i.test(_0x220205)) {
      return "Windows";
    }
    if (/Mac/i.test(_0x220205)) {
      return "macOS";
    }
    if (/Linux/i.test(_0x220205)) {
      return "Linux";
    }
    return "Unknown OS";
  },
  download() {
    console.log("[PlayableSDK]", this.channel, "download()");
    try {
      FbPlayableAd.onCTAClick();
      return;
    } catch (_0x19cf4e) {
      console.warn("[PlayableSDK:" + this.channel + ":download] FbPlayableAd.onCTAClick failed, falling back to window.open", _0x19cf4e);
    }
    const _0x517540 = this.detectOS();
    if (_0x517540 === "iOS" || _0x517540 === "macOS") {
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
    }).catch(_0x2619f3 => {
      console.error("[PlayableSDK:" + this.channel + ":gameStart] System.import failed", _0x2619f3);
    });
  },
  onMute(_0x589406) {
    console.log("[PlayableSDK]", this.channel, "onMute()");
  },
  onUnmute(_0x2c13fa) {
    console.log("[PlayableSDK]", this.channel, "onUnmute()");
  },
  onPause(_0x5b74d4) {
    console.log("[PlayableSDK]", this.channel, "onPause()");
  },
  onResume(_0x4a3f66) {
    console.log("[PlayableSDK]", this.channel, "onResume()");
  }
};