window.PlayableSDK = {
  channel: "Pangle",
  google_url: "",
  apple_url: "",
  detectOS() {
    if (navigator.userAgentData && navigator.userAgentData.platform) {
      const _0x41b79e = navigator.userAgentData.platform;
      return _0x41b79e;
    }
    const _0x49d61c = navigator.userAgent || "";
    const _0x133e99 = navigator.platform || "";
    if (/android/i.test(_0x49d61c)) {
      return "Android";
    }
    if (/iPhone|iPad|iPod/i.test(_0x49d61c) || _0x133e99 === "MacIntel" && "ontouchstart" in window) {
      return "iOS";
    }
    if (/Win/i.test(_0x133e99)) {
      return "Windows";
    }
    if (/Mac/i.test(_0x133e99)) {
      return "macOS";
    }
    if (/Linux/i.test(_0x133e99)) {
      return "Linux";
    }
    return "Unknown OS";
  },
  download() {
    console.log("[PlayableSDK]", this.channel, "download()");
    try {
      window.openAppStore();
      return;
    } catch (_0x396c52) {
      console.warn("[PlayableSDK:" + this.channel + ":download] window.openAppStore failed, falling back to window.open", _0x396c52);
    }
    const _0xda831f = this.detectOS();
    if (_0xda831f === "iOS" || _0xda831f === "macOS") {
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
  onMute(_0x2d19d2) {
    console.log("[PlayableSDK]", this.channel, "onMute()");
  },
  onUnmute(_0x5d701e) {
    console.log("[PlayableSDK]", this.channel, "onUnmute()");
  },
  onPause(_0x563262) {
    console.log("[PlayableSDK]", this.channel, "onPause()");
  },
  onResume(_0x361233) {
    console.log("[PlayableSDK]", this.channel, "onResume()");
  },
  game_start() {
    console.log("[PlayableSDK]", this.channel, "game_start()");
    System.import("./index.js").then(() => {
      this.game_ready();
    }).catch(_0x1ae359 => {
      console.error("[PlayableSDK:" + this.channel + ":gameStart] System.import failed", _0x1ae359);
    });
  }
};