window.PlayableSDK = {
  channel: "Google",
  google_url: "",
  apple_url: "",
  detectOS() {
    if (navigator.userAgentData && navigator.userAgentData.platform) {
      const _0x414d95 = navigator.userAgentData.platform;
      return _0x414d95;
    }
    const _0x2099fb = navigator.userAgent || "";
    const _0x205260 = navigator.platform || "";
    if (/android/i.test(_0x2099fb)) {
      return "Android";
    }
    if (/iPhone|iPad|iPod/i.test(_0x2099fb) || _0x205260 === "MacIntel" && "ontouchstart" in window) {
      return "iOS";
    }
    if (/Win/i.test(_0x205260)) {
      return "Windows";
    }
    if (/Mac/i.test(_0x205260)) {
      return "macOS";
    }
    if (/Linux/i.test(_0x205260)) {
      return "Linux";
    }
    return "Unknown OS";
  },
  download() {
    console.log("[PlayableSDK]", this.channel, "download()");
    try {
      ExitApi.exit();
      return;
    } catch (_0x397a83) {
      console.warn("[PlayableSDK:" + this.channel + ":download] ExitApi.exit failed, falling back to window.open", _0x397a83);
    }
    // const _0xfbc5cf = this.detectOS();
    // if (_0xfbc5cf === "iOS" || _0xfbc5cf === "macOS") {
    //   window.open(this.apple_url || this.google_url, "_blank");
    // } else {
    //   window.open(this.google_url || this.apple_url, "_blank");
    // }
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
    }).catch(_0x22f6b4 => {
      console.error("[PlayableSDK:" + this.channel + ":gameStart] System.import failed", _0x22f6b4);
    });
  },
  onMute(_0x5bc56f) {
    console.log("[PlayableSDK]", this.channel, "onMute()");
  },
  onUnmute(_0x178e24) {
    console.log("[PlayableSDK]", this.channel, "onUnmute()");
  },
  onPause(_0x3e5dfd) {
    console.log("[PlayableSDK]", this.channel, "onPause()");
  },
  onResume(_0x4f23b8) {
    console.log("[PlayableSDK]", this.channel, "onResume()");
  }
};