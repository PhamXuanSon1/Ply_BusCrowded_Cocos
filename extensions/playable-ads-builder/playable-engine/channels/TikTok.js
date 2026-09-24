window.PlayableSDK = {
  channel: "TikTok",
  google_url: "",
  apple_url: "",
  detectOS() {
    if (navigator.userAgentData && navigator.userAgentData.platform) {
      const _0xfecead = navigator.userAgentData.platform;
      return _0xfecead;
    }
    const _0x23a421 = navigator.userAgent || "";
    const _0x28a1ef = navigator.platform || "";
    if (/android/i.test(_0x23a421)) {
      return "Android";
    }
    if (/iPhone|iPad|iPod/i.test(_0x23a421) || _0x28a1ef === "MacIntel" && "ontouchstart" in window) {
      return "iOS";
    }
    if (/Win/i.test(_0x28a1ef)) {
      return "Windows";
    }
    if (/Mac/i.test(_0x28a1ef)) {
      return "macOS";
    }
    if (/Linux/i.test(_0x28a1ef)) {
      return "Linux";
    }
    return "Unknown OS";
  },
  download() {
    console.log("[PlayableSDK]", this.channel, "download()");
    try {
      window.openAppStore();
      return;
    } catch (_0x16421c) {
      console.warn("[PlayableSDK:" + this.channel + ":download] window.openAppStore failed, falling back to window.open", _0x16421c);
    }
    const _0x48c6c6 = this.detectOS();
    if (_0x48c6c6 === "iOS" || _0x48c6c6 === "macOS") {
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
  onMute(_0x522e1f) {
    console.log("[PlayableSDK]", this.channel, "onMute()");
  },
  onUnmute(_0xddd1ea) {
    console.log("[PlayableSDK]", this.channel, "onUnmute()");
  },
  onPause(_0x597ce8) {
    console.log("[PlayableSDK]", this.channel, "onPause()");
  },
  onResume(_0x8c91cc) {
    console.log("[PlayableSDK]", this.channel, "onResume()");
  },
  game_start() {
    console.log("[PlayableSDK]", this.channel, "game_start()");
    System.import("./index.js").then(() => {
      this.game_ready();
    }).catch(_0x50d9e5 => {
      console.error("[PlayableSDK:" + this.channel + ":gameStart] System.import failed", _0x50d9e5);
    });
  }
};