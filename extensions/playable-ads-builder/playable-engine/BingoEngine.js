window.BingoEngine = {
  base64ToArrayBuffer(_0x4a97c4) {
    try {
      const _0x4d2d06 = "data:";
      const _0x3d4654 = ";base64,";
      let _0x5eb6ee = _0x4a97c4;
      if (_0x4a97c4.startsWith(_0x4d2d06)) {
        const _0x3811cc = _0x4a97c4.indexOf(_0x3d4654);
        if (_0x3811cc === -1) {
          throw new Error("Invalid base64 data URL format");
        }
        _0x5eb6ee = _0x4a97c4.substring(_0x3811cc + _0x3d4654.length);
      }
      return Uint8Array.from(atob(_0x5eb6ee), _0x1a4311 => _0x1a4311.charCodeAt(0)).buffer;
    } catch (_0xe0c785) {
      console.error("BingoEngine: Failed to convert base64 to ArrayBuffer:", _0xe0c785);
      throw _0xe0c785;
    }
  },
  getResourcePath(_0xf80e18, _0x39e763) {
    _0xf80e18 = _0xf80e18 != null ? String(_0xf80e18) : "";
    if (!_0x39e763 || typeof _0x39e763.keys !== "function") {
      return null;
    }
    for (let _0x491f3b of _0x39e763.keys()) {
      if (_0x491f3b === _0xf80e18) {
        return _0x491f3b;
      }
      if (_0xf80e18.endsWith(_0x491f3b)) {
        return _0x491f3b;
      }
    }
    return null;
  },
  getResource(_0x269913) {
    const _0x2696b8 = this.getResourcePath(_0x269913, window.__res);
    if (_0x2696b8) {
      return window.__res.get(_0x2696b8);
    } else {
      return null;
    }
  },
  getScript(_0x5290b9) {
    const _0x43afaf = this.getResourcePath(_0x5290b9, window.__res);
    if (!_0x43afaf) {
      return null;
    }
    const _0x108e17 = window.__res.get(_0x43afaf);
    if (_0x108e17) {
      window.__res.delete(_0x43afaf);
    }
    return _0x108e17;
  },
  fontLoader(_0x462105, _0x25719e, _0x585813) {
    const _0x3f3d56 = _0x462105.replace(/[.\/ "'\\]*/g, "");
    const _0x50c7e4 = BingoEngine.getResource(_0x462105);
    if (!_0x50c7e4) {
      _0x585813();
    } else {
      const _0x44f27e = BingoEngine.base64ToArrayBuffer(_0x50c7e4);
      const _0x2dfb84 = new FontFace(_0x3f3d56, _0x44f27e);
      _0x2dfb84.load().then(() => {
        document.fonts.add(_0x2dfb84);
        _0x585813(null, _0x3f3d56);
      }, _0x4cb0ae => {
        console.error(_0x4cb0ae);
        _0x585813(null, _0x3f3d56);
      });
    }
  },
  imageLoader(_0x578a32, _0x14cf72, _0x199fd2) {
    const _0x93df55 = new Image();
    const _0x5ee335 = () => {
      _0x93df55.removeEventListener("load", _0x5ee335);
      _0x93df55.removeEventListener("error", _0x4ab824);
      _0x199fd2(null, _0x93df55);
    };
    const _0x4ab824 = () => {
      _0x93df55.removeEventListener("load", _0x5ee335);
      _0x93df55.removeEventListener("error", _0x4ab824);
      _0x199fd2(new Error("BingoEngine: Image load failed: " + _0x578a32));
    };
    _0x93df55.addEventListener("load", _0x5ee335);
    _0x93df55.addEventListener("error", _0x4ab824);
    const _0x8eb4bd = BingoEngine.getResource(_0x578a32);
    if (!_0x8eb4bd) {
      _0x199fd2(new Error("BingoEngine: Image not found: " + _0x578a32));
      return;
    }
    let _0x49c745 = "webp";
    if (_0x8eb4bd.startsWith("iVBORw0KGgo")) {
      _0x49c745 = "png";
    } else if (_0x8eb4bd.startsWith("/9j/")) {
      _0x49c745 = "jpeg";
    }
    _0x93df55.src = "data:image/" + _0x49c745 + ";base64," + _0x8eb4bd;
  },
  customCocos() {
    if (window.__custom_cc) {
      return;
    }
    window.__custom_cc = true;
    if (cc.internal.VideoPlayerImplManager) {
      function _0x322294(_0x298418, _0x4b90b2, _0x3a67c5) {
        const _0x1b4c9c = document.createElement("video");
        const _0x41cf11 = document.createElement("source");
        _0x1b4c9c.appendChild(_0x41cf11);
        _0x3a67c5(null, _0x1b4c9c);
      }
      cc.assetManager.downloader.register({
        ".mp4": _0x322294,
        ".avi": _0x322294,
        ".mov": _0x322294,
        ".mpg": _0x322294,
        ".mpeg": _0x322294,
        ".rm": _0x322294,
        ".rmvb": _0x322294
      });
      const _0x59a3d8 = cc.internal.VideoPlayerImplManager.getImpl;
      cc.internal.VideoPlayerImplManager.getImpl = function (_0x550662) {
        const _0x765291 = _0x59a3d8.call(this, _0x550662);
        const _0x52374d = _0x765291.createVideoPlayer;
        _0x765291.createVideoPlayer = function (_0x33e266) {
          const _0x12b950 = BingoEngine.getResource(_0x33e266);
          if (_0x12b950) {
            const _0x4c10b0 = typeof Blob !== "undefined" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function";
            if (_0x4c10b0) {
              try {
                const _0x5c897c = BingoEngine.base64ToArrayBuffer(_0x12b950);
                const _0x5a6141 = new Blob([_0x5c897c], {
                  type: "video/mp4"
                });
                const _0x45923d = URL.createObjectURL(_0x5a6141);
                return _0x52374d.call(this, _0x45923d);
              } catch (_0x5f2005) {
                console.warn("Blob creation failed, falling back to Data URL:", _0x5f2005);
              }
            }
            const _0x5ac4f0 = "data:video/mp4;base64," + _0x12b950;
            return _0x52374d.call(this, _0x5ac4f0);
          } else {
            return _0x52374d.call(this, _0x33e266);
          }
        };
        return _0x765291;
      };
    }
    cc.assetManager.downloader.register({
      ".font": this.fontLoader,
      ".eot": this.fontLoader,
      ".ttf": this.fontLoader,
      ".woff": this.fontLoader,
      ".svg": this.fontLoader,
      ".ttc": this.fontLoader
    });
    cc.assetManager.downloader.register({
      ".png": this.imageLoader,
      ".jpg": this.imageLoader,
      ".bmp": this.imageLoader,
      ".jpeg": this.imageLoader,
      ".gif": this.imageLoader,
      ".ico": this.imageLoader,
      ".tiff": this.imageLoader,
      ".webp": this.imageLoader,
      ".image": this.imageLoader
    });
  },
  initXMLHttpRequest() {
    const _0xc3a4b3 = window.XMLHttpRequest;
    window.XMLHttpRequest = function () {
      return new window._XMLLocalRequest();
    };
    window._XMLLocalRequest = function () {
      this.url = "";
      this.method = "";
      this.status = 200;
      this.responseType = "";
      this.response = null;
      this.headers = {};
      this._onLoadCallback = () => {
        if (this.onload) {
          this.onload();
        }
      };
    };
    _XMLLocalRequest.prototype.open = function (_0x2435c1, _0x340a2e) {
      this.method = _0x2435c1;
      this.url = _0x340a2e;
    };
    _XMLLocalRequest.prototype.overrideMimeType = function () {};
    _XMLLocalRequest.prototype.setRequestHeader = function (_0x301b81, _0x22f00e) {
      this.headers[_0x301b81] = _0x22f00e;
    };
    _XMLLocalRequest.prototype.send = function () {
      try {
        const _0x2eac8c = BingoEngine.getResource(this.url);
        if (!_0x2eac8c) {
          const _0x16e8f3 = new _0xc3a4b3();
          _0x16e8f3.onload = () => {
            this.status = _0x16e8f3.status;
            this.response = _0x16e8f3.response;
            Promise.resolve().then(this._onLoadCallback);
          };
          _0x16e8f3.onerror = () => {
            this.status = _0x16e8f3.status || 0;
            Promise.resolve().then(() => {
              if (this.onerror) {
                this.onerror(new Error("BingoEngine: Failed to load " + this.url));
              }
            });
          };
          _0x16e8f3.onabort = () => {
            if (this.onabort) {
              this.onabort();
            }
          };
          _0x16e8f3.open(this.method, this.url, true);
          _0x16e8f3.responseType = this.responseType;
          for (const _0xa3f7d5 in this.headers) {
            _0x16e8f3.setRequestHeader(_0xa3f7d5, this.headers[_0xa3f7d5]);
          }
          _0x16e8f3.send();
          return;
        }
        const _0x36f7c2 = {
          json: _0x374645 => {
            try {
              return JSON.parse(_0x374645);
            } catch (_0x22855a) {
              if (_0x374645.startsWith("eyJ")) {
                try {
                  return JSON.parse(atob(_0x374645));
                } catch (_0x208c74) {}
              }
              throw _0x22855a;
            }
          },
          text: _0x3ac81f => _0x3ac81f,
          arraybuffer: _0x1e112a => BingoEngine.base64ToArrayBuffer(_0x1e112a),
          default: () => {
            console.error("BingoEngine: unsupported response type:", this.responseType);
            return null;
          }
        };
        const _0x2f0f7a = _0x36f7c2[this.responseType] || _0x36f7c2.default;
        this.response = _0x2f0f7a(_0x2eac8c);
        Promise.resolve().then(this._onLoadCallback);
      } catch (_0x513c1a) {
        this.status = 404;
        Promise.resolve().then(() => {
          if (this.onerror) {
            this.onerror(new Error("BingoEngine: Failed to load " + this.url));
          }
        });
      }
    };
  },
  _srcPropertyWorks: true,
  _handleScriptSrc(_0x563714, _0x47d0aa) {
    const _0x2ad2da = BingoEngine.getScript(_0x47d0aa);
    if (_0x2ad2da) {
      _0x563714.removeAttribute("src");
      Promise.resolve().then(() => {
        try {
          new Function(_0x2ad2da)();
          _0x563714.dispatchEvent(new Event("load"));
          if (window.cc) {
            BingoEngine.customCocos();
          }
        } catch (_0x46643c) {
          console.error("BingoEngine: Script execution error:", _0x46643c);
          _0x563714.dispatchEvent(new Event("error"));
        }
      });
      return true;
    }
    return false;
  },
  initLocalJSElement() {
    const _0x1e0a78 = this;
    const _0x4b00a8 = document.createElement;
    document.createElement = function (_0x1dee34, _0xde00cc) {
      const _0x2684cc = _0x4b00a8.call(document, _0x1dee34, _0xde00cc);
      if (_0x1dee34.toLowerCase() === "script") {
        let _0x348db5 = "";
        if (_0x1e0a78._srcPropertyWorks) {
          try {
            Object.defineProperty(_0x2684cc, "src", {
              get() {
                return _0x348db5;
              },
              set(_0x37c289) {
                _0x348db5 = _0x37c289;
                if (!_0x1e0a78._handleScriptSrc(_0x2684cc, _0x37c289)) {
                  _0x2684cc.setAttribute("src", _0x37c289 ?? "");
                }
              },
              configurable: true
            });
          } catch (_0x3db921) {
            _0x1e0a78._srcPropertyWorks = false;
            console.warn("BingoEngine: Cannot redefine src property, using fallback");
          }
        }
      }
      return _0x2684cc;
    };
    const _0x2d74ed = _0x13c53b => {
      return function (_0x22b9d, ..._0x1ae0af) {
        if (!_0x1e0a78._srcPropertyWorks && _0x22b9d && _0x22b9d.tagName === "SCRIPT" && _0x22b9d.src) {
          const _0x85ab87 = _0x22b9d.src;
          if (_0x1e0a78._handleScriptSrc(_0x22b9d, _0x85ab87)) {
            return _0x13c53b.call(this, _0x22b9d, ..._0x1ae0af);
          }
        }
        return _0x13c53b.call(this, _0x22b9d, ..._0x1ae0af);
      };
    };
    const _0x5507ac = Node.prototype.appendChild;
    const _0x378838 = Node.prototype.insertBefore;
    Node.prototype.appendChild = _0x2d74ed(_0x5507ac);
    Node.prototype.insertBefore = _0x2d74ed(_0x378838);
  },
  initLocalFetch() {
    const _0x58872f = window.fetch;
    window.fetch = async function (_0x509531, _0x4c03cc) {
      const _0x2a8363 = typeof _0x509531 === "string" ? _0x509531 : _0x509531.url;
      if (_0x2a8363.endsWith(".wasm") || _0x2a8363.endsWith(".bin")) {
        const _0x144489 = BingoEngine.getResource(_0x2a8363);
        if (_0x144489) {
          const _0x57cfe8 = BingoEngine.base64ToArrayBuffer(_0x144489);
          const _0x9aac21 = new Response(_0x57cfe8);
          return Promise.resolve(_0x9aac21);
        } else {
          console.error("BingoEngine: getResource not found:", _0x2a8363);
        }
      } else {
        console.error("BingoEngine: unsupported fetch url:", _0x2a8363);
      }
      return _0x58872f.call(window, _0x509531, _0x4c03cc);
    };
  },
  init() {
    this.initLocalJSElement();
    this.initXMLHttpRequest();
    this.initLocalFetch();
  }
};