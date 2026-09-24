window.PlayableSDK = {
  channel: "Kuaishou",
  google_url: "",
  apple_url: "",
  detectOS() {
    if (navigator.userAgentData && navigator.userAgentData.platform) {
      return navigator.userAgentData.platform;
    }
    const _0x5c03e6 = navigator.userAgent || "";
    const _0x22cc64 = navigator.platform || "";
    if (/android/i.test(_0x5c03e6)) {
      return "Android";
    }
    if (/iPhone|iPad|iPod/i.test(_0x5c03e6) || _0x22cc64 === "MacIntel" && "ontouchstart" in window) {
      return "iOS";
    }
    if (/Win/i.test(_0x22cc64)) {
      return "Windows";
    }
    if (/Mac/i.test(_0x22cc64)) {
      return "macOS";
    }
    if (/Linux/i.test(_0x22cc64)) {
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
    } catch (_0x7a464d) {
      console.warn("[PlayableSDK:" + this.channel + ":download] playableSDK.openAppStore failed", _0x7a464d);
    }
    const _0xdac63d = this.detectOS();
    if (_0xdac63d === "iOS" || _0xdac63d === "macOS") {
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
    } catch (_0x390ae4) {
      console.warn("[PlayableSDK:" + this.channel + ":game_ready] sendEvent(AD_TRY_PLAY_GAME_START) failed", _0x390ae4);
    }
  },
  game_end() {
    console.log("[PlayableSDK]", this.channel, "game_end()");
    try {
      if (window.playableSDK && typeof window.playableSDK.sendEvent === "function" && window.playableSDK.CONSTANTS && window.playableSDK.CONSTANTS.AD_TRY_PLAY_GAME_END !== undefined) {
        window.playableSDK.sendEvent(window.playableSDK.CONSTANTS.AD_TRY_PLAY_GAME_END);
      }
    } catch (_0x17ca43) {
      console.warn("[PlayableSDK:" + this.channel + ":game_end] sendEvent(AD_TRY_PLAY_GAME_END) failed", _0x17ca43);
    }
  },
  onMute(_0x2eece5) {
    console.log("[PlayableSDK]", this.channel, "onMute()");
  },
  onUnmute(_0x42da45) {
    console.log("[PlayableSDK]", this.channel, "onUnmute()");
  },
  onPause(_0x51dcfa) {
    console.log("[PlayableSDK]", this.channel, "onPause()");
  },
  onResume(_0x1875fe) {
    console.log("[PlayableSDK]", this.channel, "onResume()");
  },
  game_start() {
    console.log("[PlayableSDK]", this.channel, "game_start()");
    System.import("./index.js").then(() => {
      this.game_ready();
    }).catch(_0x38e03a => {
      console.error("[PlayableSDK:" + this.channel + ":gameStart] System.import failed", _0x38e03a);
    });
  }
};