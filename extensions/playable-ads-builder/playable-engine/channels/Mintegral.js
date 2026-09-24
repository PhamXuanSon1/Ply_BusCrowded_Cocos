window.PlayableSDK = {
  channel: "Mintegral",
  google_url: "",
  apple_url: "",
  detectOS() {
    if (navigator.userAgentData && navigator.userAgentData.platform) {
      const _0x24b63d = navigator.userAgentData.platform;
      return _0x24b63d;
    }
    const _0x3440d7 = navigator.userAgent || "";
    const _0x2c16ae = navigator.platform || "";
    if (/android/i.test(_0x3440d7)) {
      return "Android";
    }
    if (/iPhone|iPad|iPod/i.test(_0x3440d7) || _0x2c16ae === "MacIntel" && "ontouchstart" in window) {
      return "iOS";
    }
    if (/Win/i.test(_0x2c16ae)) {
      return "Windows";
    }
    if (/Mac/i.test(_0x2c16ae)) {
      return "macOS";
    }
    if (/Linux/i.test(_0x2c16ae)) {
      return "Linux";
    }
    return "Unknown OS";
  },
  download() {
    console.log("[PlayableSDK]", this.channel, "download()");
    try {
      window.install();
      return;
    } catch (_0x4d603d) {
      console.warn("[PlayableSDK:" + this.channel + ":download] window.install failed, falling back to window.open", _0x4d603d);
    }
    // const _0x541c92 = this.detectOS();
    // if (_0x541c92 === "iOS" || _0x541c92 === "macOS") {
    //   window.open(this.apple_url || this.google_url, "_blank");
    // } else {
    //   window.open(this.google_url || this.apple_url, "_blank");
    // }
  },
  game_ready() {
    console.log("[PlayableSDK]", this.channel, "game_ready()");
    window.gameStart = () => {
      console.log("[PlayableSDK:" + this.channel + ":gameReady] Game started");
    };
    window.gameClose = () => {
      console.log("[PlayableSDK:" + this.channel + ":gameReady] Game closed");
    };
    if (window.gameReady) {
      window.gameReady();
    }
  },
  game_end() {
    console.log("[PlayableSDK]", this.channel, "game_end()");
    if (window.gameEnd) {
      window.gameEnd();
    }
  },
  game_start() {
    console.log("[PlayableSDK]", this.channel, "game_start()");
    System.import("./index.js").then(() => {
      this.game_ready();
    }).catch(_0x2df3d4 => {
      console.error("[PlayableSDK:" + this.channel + ":gameStart] System.import failed", _0x2df3d4);
    });
  },
  onMute(_0x2e096e) {
    console.log("[PlayableSDK]", this.channel, "onMute()");
  },
  onUnmute(_0x5b6d3e) {
    console.log("[PlayableSDK]", this.channel, "onUnmute()");
  },
  onPause(_0x14f2d3) {
    console.log("[PlayableSDK]", this.channel, "onPause()");
  },
  onResume(_0x5699b3) {
    console.log("[PlayableSDK]", this.channel, "onResume()");
  }
};