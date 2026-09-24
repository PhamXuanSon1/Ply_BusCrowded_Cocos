window.PlayableSDK = {
  channel: "OceanEngine",
  google_url: "",
  apple_url: "",
  detectOS() {
    if (navigator.userAgentData && navigator.userAgentData.platform) {
      const _0x57bc9a = navigator.userAgentData.platform;
      return _0x57bc9a;
    }
    const _0x275128 = navigator.userAgent || "";
    const _0x4615b3 = navigator.platform || "";
    if (/android/i.test(_0x275128)) {
      return "Android";
    }
    if (/iPhone|iPad|iPod/i.test(_0x275128) || _0x4615b3 === "MacIntel" && "ontouchstart" in window) {
      return "iOS";
    }
    if (/Win/i.test(_0x4615b3)) {
      return "Windows";
    }
    if (/Mac/i.test(_0x4615b3)) {
      return "macOS";
    }
    if (/Linux/i.test(_0x4615b3)) {
      return "Linux";
    }
    return "Unknown OS";
  },
  download() {
    console.log("[PlayableSDK]", this.channel, "download()");
    try {
      window.openAppStore();
      return;
    } catch (_0x95b3c0) {
      console.warn("[PlayableSDK:" + this.channel + ":download] window.openAppStore failed, falling back to window.open", _0x95b3c0);
    }
    const _0x15fbdf = this.detectOS();
    if (_0x15fbdf === "iOS" || _0x15fbdf === "macOS") {
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
  onMute(_0x48e657) {
    console.log("[PlayableSDK]", this.channel, "onMute()");
  },
  onUnmute(_0x59c2b5) {
    console.log("[PlayableSDK]", this.channel, "onUnmute()");
  },
  onPause(_0x116034) {
    console.log("[PlayableSDK]", this.channel, "onPause()");
  },
  onResume(_0x27223e) {
    console.log("[PlayableSDK]", this.channel, "onResume()");
  },
  game_start() {
    console.log("[PlayableSDK]", this.channel, "game_start()");
    System.import("./index.js").then(() => {
      this.game_ready();
    }).catch(_0x58aefd => {
      console.error("[PlayableSDK:" + this.channel + ":gameStart] System.import failed", _0x58aefd);
    });
  }
};