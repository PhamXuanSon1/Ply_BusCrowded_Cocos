window.PlayableSDK = {
  channel: "PureHTML",
  google_url: "",
  apple_url: "",
  download() {
    console.log("[PlayableSDK]", this.channel, "download()");
  },
  game_ready() {
    console.log("[PlayableSDK]", this.channel, "game_ready()");
  },
  game_end() {
    console.log("[PlayableSDK]", this.channel, "game_end()");
  },
  onMute(_0xc4b8d7) {
    console.log("[PlayableSDK]", this.channel, "onMute()");
  },
  onUnmute(_0x41c806) {
    console.log("[PlayableSDK]", this.channel, "onUnmute()");
  },
  onPause(_0x217a94) {
    console.log("[PlayableSDK]", this.channel, "onPause()");
  },
  onResume(_0x1888b8) {
    console.log("[PlayableSDK]", this.channel, "onResume()");
  },
  game_start() {
    console.log("[PlayableSDK]", this.channel, "game_start()");
    System.import("./index.js").then(() => {
      this.game_ready();
    }).catch(_0x265343 => {
      console.error("[PlayableSDK:" + this.channel + ":gameStart] System.import failed", _0x265343);
    });
  }
};