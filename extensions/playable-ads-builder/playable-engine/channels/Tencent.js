window.PlayableSDK = {
  channel: "Tencent",
  google_url: "",
  apple_url: "",
  detectOS() {
    if (navigator.userAgentData && navigator.userAgentData.platform) {
      const _0xb18a82 = navigator.userAgentData.platform;
      return _0xb18a82;
    }
    const _0x595161 = navigator.userAgent || "";
    const _0x581beb = navigator.platform || "";
    if (/android/i.test(_0x595161)) {
      return "Android";
    }
    if (/iPhone|iPad|iPod/i.test(_0x595161) || _0x581beb === "MacIntel" && "ontouchstart" in window) {
      return "iOS";
    }
    if (/Win/i.test(_0x581beb)) {
      return "Windows";
    }
    if (/Mac/i.test(_0x581beb)) {
      return "macOS";
    }
    if (/Linux/i.test(_0x581beb)) {
      return "Linux";
    }
    return "Unknown OS";
  },
  download() {
    console.log("[PlayableSDK]", this.channel, "download()");
    try {
      window._gdtUnSdk.playAble.onClick();
      return;
    } catch (_0x4f3c05) {
      console.warn("[PlayableSDK:" + this.channel + ":download] _gdtUnSdk.playAble.onClick failed, falling back to window.open", _0x4f3c05);
    }
    const _0x3ebbd4 = this.detectOS();
    if (_0x3ebbd4 === "iOS" || _0x3ebbd4 === "macOS") {
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
  onMute(_0x2358dc) {
    console.log("[PlayableSDK]", this.channel, "onMute()");
  },
  onUnmute(_0xa2d636) {
    console.log("[PlayableSDK]", this.channel, "onUnmute()");
  },
  onPause(_0x5da4bb) {
    console.log("[PlayableSDK]", this.channel, "onPause()");
  },
  onResume(_0x200f35) {
    console.log("[PlayableSDK]", this.channel, "onResume()");
  },
  game_start() {
    console.log("[PlayableSDK]", this.channel, "game_start()");
    this.init_unsdk().then(() => {
      return System.import("./index.js");
    }).then(() => {
      this.game_ready();
    }).catch(_0xb89aef => {
      console.error("[PlayableSDK:" + this.channel + ":gameStart] System.import failed", _0xb89aef);
    });
  },
  init_unsdk() {
    const _0x60f1f3 = this.channel;
    return new Promise(_0xcbe76 => {
      try {
        window._gdtUnSdk = new window.GDTUnSdk({
          type: "playable",
          onSuccess: function (_0x28e754) {
            console.log("[PlayableSDK:" + _0x60f1f3 + ":init] onClick success", _0x28e754);
          },
          onError: _0x3d5a1b => {
            console.warn("[PlayableSDK:" + _0x60f1f3 + ":init] onClick error", _0x3d5a1b);
          }
        });
        _0xcbe76();
      } catch (_0x152f4b) {
        console.error("[PlayableSDK:" + _0x60f1f3 + ":init] init_unsdk failed", _0x152f4b);
        _0xcbe76();
      }
    });
  }
};