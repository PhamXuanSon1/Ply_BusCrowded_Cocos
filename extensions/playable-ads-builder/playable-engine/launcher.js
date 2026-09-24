const BINARY_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".ico", ".tiff", ".tga", ".psd", ".exr", ".hdr", ".mp3", ".ogg", ".wav", ".m4a", ".aac", ".flac", ".mp4", ".webm", ".mov", ".avi", ".ttf", ".otf", ".woff", ".woff2", ".eot", ".pkm", ".astc", ".pvr", ".ktx", ".ktx2", ".dds", ".ccz", ".wasm", ".bin", ".node", ".skel", ".dbbin", ".pac", ".cconb", ".glb", ".fbx", ".zip"];
function isBinaryFile(_0x720b6c) {
  const _0xa411b = _0x720b6c.substring(_0x720b6c.lastIndexOf(".")).toLowerCase();
  return BINARY_EXTENSIONS.includes(_0xa411b);
}
window.__launcher = {
  async extractZipArchive() {
    try {
      window.__res = new Map();
      const _0x5be3e5 = new JSZip();
      const _0x310923 = window.__zipEncoding;
      delete window.__zipEncoding;
      var _0x4415c1;
      if (_0x310923 === "base64") {
        _0x4415c1 = await _0x5be3e5.loadAsync(window.__zip, {
          base64: true
        });
        delete window.__zip;
      } else {
        var _0x4b444d = window.base122Decode(window.__zip);
        delete window.__zip;
        _0x4415c1 = await _0x5be3e5.loadAsync(_0x4b444d);
        _0x4b444d = null;
      }
      const _0x1297c6 = Object.keys(_0x4415c1.files).filter(_0x2259bf => !_0x4415c1.files[_0x2259bf].dir).map(async _0x10b92f => {
        const _0x27c35f = isBinaryFile(_0x10b92f) ? "base64" : "string";
        const _0x3a7d73 = await _0x4415c1.file(_0x10b92f).async(_0x27c35f);
        window.__res.set(_0x10b92f, _0x3a7d73);
      });
      await Promise.all(_0x1297c6);
    } catch (_0x5873d4) {
      console.error("ZIP extraction failed:", _0x5873d4);
    }
  },
  executeScript(_0x2ec473) {
    try {
      const _0x17a014 = window.__res.get(_0x2ec473);
      if (!_0x17a014) {
        throw new Error("Empty script content: " + _0x2ec473);
      }
      new Function(_0x17a014)();
      window.__res.delete(_0x2ec473);
    } catch (_0x20d86a) {
      console.error("Script execution failed: " + _0x2ec473, _0x20d86a);
    }
  },
  executeCoreScripts() {
    ["src/polyfills.bundle.js", "src/system.bundle.js", "BingoEngine.js", "PlayableSDK.js"].forEach(_0x50f6de => this.executeScript(_0x50f6de));
  },
  startApplication() {
    BingoEngine.init();
    console.log("Bingo:", window.__BINGO_VERSION__ || "?", "Cocos:", window.__COCOS_VERSION__ || "?", "Channel:", PlayableSDK.channel);
    PlayableSDK.game_start();
  },
  async initialize() {
    await this.extractZipArchive();
    this.executeCoreScripts();
    this.startApplication();
  }
};
window.addEventListener("load", function () {
  __launcher.initialize();
});