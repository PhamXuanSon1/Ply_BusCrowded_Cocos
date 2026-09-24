import { _decorator, assetManager, Component, Font, Node } from "cc";
const { ccclass, property } = _decorator;

// openFullscreen();

export var gc: GameController;

@ccclass("GameController")
export class GameController extends Component {

  onLoad() {
    gc = this;
  }
  
  start() {
  }

  update(deltaTime: number) {}

 

  redirectToStore() {    
    try {
      PlayableSDK.download();
      PlayableSDK.game_end();            
    } catch (error) {
      
    }
  }
}



type GameLoad = {
  gameName: string;
  font: string;
  customScale: number;
  customHeight: number;
  customTop: number;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  textBaseline: CanvasTextBaseline;
  textAlign: CanvasTextAlign;
  callback?: Function;
};

var loaded = false;

const gameLoad: GameLoad = {
    gameName: " Crowd Escape: Bus Puzzle ",
    font: "Arial",
    customScale: 1.5,
    customHeight: 100,
    customTop: 30,
    fillStyle: "#ffffff",
    strokeStyle: "#000000",
    lineWidth: 3,
    textBaseline: "top",
    textAlign: "center",
    callback: async (sp: any) => {

      if(loaded) return;
      loaded = true;
      await loadFont();
      sp.initWaterMark();
    },
  };

try {
  //@ts-ignore
  window.gameLoad = gameLoad;
  //@ts-ignore ms
  window.totalTime = 1000;
} catch (error) {  
}


async function loadFont() {
  const fontName = "DVN-Fredoka-Bold"; 
  const fontUuid = "cejhIaZllGjbSR0e8PaJLH";
  await new Promise((resolve, reject) => {
    assetManager.loadAny(fontUuid, async (err, asset: Font) => {
      if (err) {
        console.error(err);
        reject(err);
        return;
      }

      gameLoad.font = fontName;

      // Build single-file (playable-ads-builder) đã tự đăng ký font qua BingoEngine.fontLoader
      // (hook vào cc.assetManager.downloader cho .ttf/.woff/...) NGAY khi assetManager.loadAny
      // tải xong - nhưng nó đặt tên font-family theo đường dẫn resource nội bộ đã sanitize, KHÔNG
      // phải theo `fontName` ("DVN-Fredoka-Bold") mà code này dùng -> ctx.font yêu cầu đúng tên
      // "DVN-Fredoka-Bold" sẽ không khớp font đã đăng ký, fallback về font mặc định.
      //
      // Trước đây tự tạo `new FontFace(fontName, \`url(${asset.nativeUrl})\`)` để dự phòng riêng
      // cho localhost, NHƯNG FontFace với nguồn là chuỗi url() để chính trình duyệt tự fetch qua
      // tầng network RIÊNG - không đi qua fetch/XMLHttpRequest mà bản build single-file đã patch để
      // phục vụ asset nhúng base64 trong file (BingoEngine chỉ patch `fetch` cho .wasm/.bin, còn lại
      // rơi về fetch gốc -> 404 vì asset.nativeUrl không phải URL thật trong bản single-file).
      //
      // Fix: tự đọc bytes qua XMLHttpRequest (BingoEngine patch tổng quát cho MỌI loại resource
      // nhúng qua responseType=arraybuffer, không giới hạn như fetch) rồi tự dựng FontFace với
      // ĐÚNG TÊN mình muốn - hoạt động giống nhau ở cả localhost (XHR thật) lẫn bản single-file
      // (XHR đã patch).
      try {
        const buffer = await new Promise<ArrayBuffer>((res, rej) => {
          const xhr = new XMLHttpRequest();
          xhr.open('GET', asset.nativeUrl, true);
          xhr.responseType = 'arraybuffer';
          xhr.onload = () => res(xhr.response as ArrayBuffer);
          xhr.onerror = () => rej(new Error(`Không tải được font: ${asset.nativeUrl}`));
          xhr.send();
        });
        const fontFace = new FontFace(fontName, buffer);
        await fontFace.load();
        document.fonts.add(fontFace);
      } catch (e) {
        console.warn('Add font to document failed:', e);
        reject(e);
        return;
      }

      resolve(null);

    });
    
  });
}



// full screen

function openFullscreen() {
  let fullscreenRequested = false;

  async function enterFullscreen() {
      if (fullscreenRequested) return;

      fullscreenRequested = true;

      try {
          if (!document.fullscreenElement) {
              await document.documentElement.requestFullscreen();
          }
      } catch (e) {
          console.warn('Fullscreen failed:', e);
      }
  }

  document.addEventListener('pointerdown', enterFullscreen, { once: true });
}



