window.PlayableSDK = {
  channel: "Kwai",
  google_url: "",
  apple_url: "",
  detectOS() {
    if (navigator.userAgentData && navigator.userAgentData.platform) {
      return navigator.userAgentData.platform;
    }
    const _0x11dc16 = navigator.userAgent || "";
    const _0x5000d2 = navigator.platform || "";
    if (/android/i.test(_0x11dc16)) {
      return "Android";
    }
    if (/iPhone|iPad|iPod/i.test(_0x11dc16) || _0x5000d2 === "MacIntel" && "ontouchstart" in window) {
      return "iOS";
    }
    if (/Win/i.test(_0x5000d2)) {
      return "Windows";
    }
    if (/Mac/i.test(_0x5000d2)) {
      return "macOS";
    }
    if (/Linux/i.test(_0x5000d2)) {
      return "Linux";
    }
    return "Unknown OS";
  },
  download() {
    console.log("[PlayableSDK]", this.channel, "download()");
    try {
      if (window.playableSDK && typeof window.playableSDK.openAppStore === "function") {
        window.playableSDK.openAppStore();
        return;
      }
    } catch (_0x565177) {
      console.warn("[PlayableSDK:" + this.channel + ":download] playableSDK.openAppStore failed", _0x565177);
    }
    const _0x43bd94 = this.detectOS();
    if (_0x43bd94 === "iOS" || _0x43bd94 === "macOS") {
      window.open(this.apple_url || this.google_url, "_blank");
    } else {
      window.open(this.google_url || this.apple_url, "_blank");
    }
  },
  game_ready() {
    console.log("[PlayableSDK]", this.channel, "game_ready()");
    try {
      if (window.playableSDK && typeof window.playableSDK.sendEvent === "function" && window.playableSDK.CONSTANTS && window.playableSDK.CONSTANTS.AD_TRY_PLAY_GAME_START !== undefined) {
        window.playableSDK.sendEvent(window.playableSDK.CONSTANTS.AD_TRY_PLAY_GAME_START);
      }
    } catch (_0x45ab9f) {
      console.warn("[PlayableSDK:" + this.channel + ":game_ready] sendEvent(AD_TRY_PLAY_GAME_START) failed", _0x45ab9f);
    }
  },
  game_end() {
    console.log("[PlayableSDK]", this.channel, "game_end()");
    try {
      if (window.playableSDK && typeof window.playableSDK.sendEvent === "function" && window.playableSDK.CONSTANTS && window.playableSDK.CONSTANTS.AD_TRY_PLAY_GAME_END !== undefined) {
        window.playableSDK.sendEvent(window.playableSDK.CONSTANTS.AD_TRY_PLAY_GAME_END);
      }
    } catch (_0x40ee70) {
      console.warn("[PlayableSDK:" + this.channel + ":game_end] sendEvent(AD_TRY_PLAY_GAME_END) failed", _0x40ee70);
    }
  },
  onMute(_0x2383df) {
    console.log("[PlayableSDK]", this.channel, "onMute()");
  },
  onUnmute(_0x58c002) {
    console.log("[PlayableSDK]", this.channel, "onUnmute()");
  },
  onPause(_0x4c9bd7) {
    console.log("[PlayableSDK]", this.channel, "onPause()");
  },
  onResume(_0x103f5a) {
    console.log("[PlayableSDK]", this.channel, "onResume()");
  },
  game_start() {
    console.log("[PlayableSDK]", this.channel, "game_start()");
    System.import("./index.js").then(() => {
      this.game_ready();
    }).catch(_0x4979e1 => {
      console.error("[PlayableSDK:" + this.channel + ":gameStart] System.import failed", _0x4979e1);
    });
  }
};