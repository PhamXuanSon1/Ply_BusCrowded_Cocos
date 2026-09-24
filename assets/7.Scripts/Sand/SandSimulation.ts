import {
  _decorator,
  BoxCollider,
  color,
  Color,
  Component,
  ImageAsset,
  Rect,
  Sprite,
  SpriteFrame,
  Texture2D,
  UITransform,
  v2,
  v3,
  v4,
  Vec2,
  Vec3,
  Vec4,
} from "cc";
export enum ColorType {
  Red = 0,
  Blue = 1,
  Green = 2,
  Yellow = 3,
  Purple = 4,
  LightBlue = 5,
  Pink = 6,
  Black = 7,
  Orange = 8,
  White = 9,
  Brown = 10,
  LightBrown = 11,
  Skin = 12,
  DarkGreen = 13,
  Gray = 14,
}
export const Colors = ["#da563f","#2046c1","#14323c","#f4d4a3","#6600ff","#5ca0eb","#ff5391","#000000","#ff9d44","#d9d9d9","#68533e","#a79476","#fdeacc","#246400","#939393"]


const { ccclass, property, executeInEditMode } = _decorator;

/* ================= CONFIG ================= */

var WIDTH = 200;
var HEIGHT = 200;

var RenderWidth = 1200;
var RenderHeight = 1200;

export enum CellType {
  Empty = 0, // alpha = 0
  Sand = 1, // normal
  Solid = 2, // is choosing
  None = 3, // border cutted
}

export var sand: SandSimulationChunked = null!;

/* ================= COMPONENT ================= */

@ccclass("SandSimulationChunked")
@executeInEditMode(true)
export class SandSimulationChunked extends Component {
  @property(Sprite)
  sprite: Sprite = null!;
  @property(Sprite)
  spriteRef: Sprite = null!;
  @property(Sprite)
  spriteMix: Sprite = null!;
  @property(Sprite)
  spriteMixRef: Sprite = null!;
  refData: Uint8ClampedArray = null!;
  // Texture data used exclusively by spriteMix. It keeps the full-resolution
  // Mix image while the simulation grid is still kept at WIDTH x HEIGHT.
  mixTextData: Uint8Array = new Uint8Array();
  mixSourceData: Uint8ClampedArray = null!;
  mixSourceWidth: number = 0;
  mixSourceHeight: number = 0;

  @property([Color])
  colors: Color[] = [];
  // @property([Color])
  chosenColors: Color[] = [];

  /* ================= DATA ================= */

  grid = new Uint8Array(WIDTH * HEIGHT);
  cGrid = new Uint8Array(WIDTH * HEIGHT);
  parent = new Uint16Array(WIDTH * HEIGHT);
  texData = new Uint8Array(WIDTH * HEIGHT * 4);
  colData = new Array(WIDTH * HEIGHT).fill(color());
  texture!: Texture2D;
  mixTexture!: Texture2D;
  empties: Vec2[] = [];
  paths: Vec2[][] = [];
  @property
  original: boolean = true;
  // @property
  noiseDensity: number = 0.01;
  // @property
  noiseCoverage: number = 1;
  mixParam: number = 0.4;

  acc = 0;
  STEP = 1 / 30;

  DIR8 = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];

  inited: boolean = false;
  index: Vec2 = v2(200, 200);
  uT: UITransform = null!;
  // box: BoxCollider = null!;

  map: Map<number, number> = new Map();
  colorData: number[][] = [];
  total: number = 0;
  mulSize: Vec2 = v2(1, 1);

  /* ================= LIFECYCLE ================= */

  onLoad() {
    sand = this;
  }

  getSize() {
    let w = this.uT.node.getWorldScale().x * this.uT.width;
    let h = this.uT.node.getWorldScale().y * this.uT.height;
    return v2(w, h);
  }

  initialize(): void {
    this.init([], this.index);
    let colorArray = this.colors.map((c) => "#" + c.toHEX());
    console.log(JSON.stringify(colorArray));
  }

  isUndefined(x: number, y: number) {
    return x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT;
  }

  setParent(x: number, y: number, p: number) {
    this.parent[this.idx(x, y)] = p;
  }
  getParent(x: number, y: number) {
    let p = this.parent[this.idx(x, y)];
    let id = this.revertIdx(p);
    if(this.isUndefined(id.x, id.y)) return -1;
    return p;
  }

  

  init(colorData: number[], index: Vec2) {
    // index = v2(285, 315);
    this.inited = true;
    WIDTH = index.x;
    HEIGHT = index.y;
    this.spriteMix.spriteFrame = this.spriteMixRef.spriteFrame;
    let mix = this.spriteMix.spriteFrame.texture as Texture2D;
    RenderHeight = mix.height;
    RenderWidth = mix.width;

    this.mulSize = v2(mix.width / WIDTH, mix.height / HEIGHT);

    this.index = v2(WIDTH, HEIGHT);
    this.grid = new Uint8Array(WIDTH * HEIGHT);
    this.cGrid = new Uint8Array(WIDTH * HEIGHT);
    this.parent = new Uint16Array(WIDTH * HEIGHT);
    this.parent.fill(65535); // use 65535 to represent -1 for unsigned array
    this.texData = new Uint8Array(WIDTH * HEIGHT * 4);
    this.mixTextData = new Uint8Array(RenderWidth * RenderHeight * 4);
    this.colData = new Array(WIDTH * HEIGHT).fill(color());

    const chosenColors = [
      // ColorType.Red,
      ColorType.Blue,
      ColorType.Green,
      ColorType.Yellow,
      // ColorType.Purple,
      ColorType.LightBlue,
      ColorType.Pink,
      ColorType.Black,
      // ColorType.Orange,
      ColorType.White,
      ColorType.Brown,
      ColorType.LightBrown,
      // ColorType.Skin,
      // ColorType.DarkGreen,
      // ColorType.Gray,
    ];

    this.chosenColors = this.colors.filter(
      (c, i) => chosenColors.indexOf(i) !== -1,
    );

    this.initTexture();
    this.initMap(colorData);
    this.initMixTexture();
    this.updateTextureChunked();
    this.updateMixTextureData();

    // setTimeout(() => {
    //   console.log(this.bottoms);

    //   this.bottoms.forEach(b => {
    //     let v = this.revertIdx(b);
    //     this.setNonePixel(v);
    //   })
    //   this.updateTextureChunked();
    // }, 2000);
  }

  randomId = 0;
  public randomType(): ColorType {
    let r = this.randomId % 2;
    this.randomId++;
    if (r < 1) return ColorType.Green;
    return ColorType.LightBlue;
  }

  linear: number = 0;
  update(dt: number) {
    return;
    if (!this.inited) return;
    this.acc += dt;
    let mul = (this.acc / this.STEP) | 0;
    if (this.linear != mul) {
      this.linear = mul;
      for (let i = 0; i < 5; i++) {
        this.stepFallChunked(false);
        this.updateTextureChunked();
      }
    }
    if (this.linear < 5) return;
    this.acc = 0;
    this.linear = 0;
    for (let i = 0; i < 2; i++) {
      this.stepFallChunked(true);
      this.updateTextureChunked();
    }
  }

  /* ================= INIT ================= */

  initTexture() {
    this.texture = new Texture2D();
    this.texture.reset({
      width: WIDTH,
      height: HEIGHT,
      format: 35,
    });
    this.texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);

    let fr = new SpriteFrame();
    fr.packable = false;
    fr.rect = new Rect(0, 0, WIDTH, HEIGHT);
    fr.texture = this.texture;
    this.sprite.spriteFrame = fr;
    this.uT = this.sprite.getComponent(UITransform);

    // this.box = this.sprite.getComponent(BoxCollider);
    // this.box.size = v3(this.uT.width, this.uT.height, 0);
  }

  /**
   * Creates a separate high-resolution texture for Mix. The low-resolution
   * simulation texture remains assigned to sprite, so existing code that uses
   * it continues to work unchanged.
   */
  initMixTexture() {
    if (!this.spriteMix) return;

    this.mixTexture = new Texture2D();
    this.mixTexture.reset({
      width: RenderWidth,
      height: RenderHeight,
      format: 35,
    });
    this.mixTexture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);

    const fr = new SpriteFrame();
    fr.packable = false;
    fr.rect = new Rect(0, 0, RenderWidth, RenderHeight);
    fr.texture = this.mixTexture;
    this.spriteMix.spriteFrame = fr;

    // Mix is the visual sprite; sprite is retained as the simulation texture.
    // this.sprite.node.active = false;
    // this.spriteMix.node.active = true;
  }

  setNonePixel(index: Vec2) {
    let x = index.x;
    let y = index.y;

    this.grid[this.idx(x, y)] = CellType.None;
  }

  roundRectPixels(radius: number = 5) {
    const w = this.index.x;
    const h = this.index.y;
    const r2 = radius * radius;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let cx = -1,
          cy = -1;

        // bottom-left
        if (x < radius && y < radius) {
          cx = radius;
          cy = radius;
        }
        // bottom-right
        else if (x >= w - radius && y < radius) {
          cx = w - 1 - radius;
          cy = radius;
        }
        // top-left
        else if (x < radius && y >= h - radius) {
          cx = radius;
          cy = h - 1 - radius;
        }
        // top-right
        else if (x >= w - radius && y >= h - radius) {
          cx = w - 1 - radius;
          cy = h - 1 - radius;
        }

        // nếu pixel nằm trong vùng góc
        if (cx !== -1) {
          const dx = x - cx;
          const dy = y - cy;

          // ngoài hình tròn → cắt
          if (dx * dx + dy * dy > r2) {
            this.setNonePixel(v2(x, y));
          }
        }
      }
    }
  }
  private shouldApplyNoise(pixelIndex: number): boolean {
    const coverage = Math.max(0, Math.min(1, this.noiseCoverage));
    if (coverage <= 0) return false;
    if (coverage >= 1) return true;

    const randomValue = (((pixelIndex * 97) + 31) % 1000) / 1000;
    return randomValue < coverage;
  }

  private applyIndexNoise(baseColor: Color, pixelIndex: number): Color {
    if (!this.shouldApplyNoise(pixelIndex)) {
      return baseColor;
    }

    const noise = (((pixelIndex * 73) + 17) % 21) - 10;
    const strength = Math.max(0, this.noiseDensity);
    const scale = 1 + noise * strength;

    const r = Math.round(Math.min(255, Math.max(0, baseColor.r * scale)));
    const g = Math.round(Math.min(255, Math.max(0, baseColor.g * scale)));
    const b = Math.round(Math.min(255, Math.max(0, baseColor.b * scale)));

    return color(r, g, b, baseColor.a);
  }

  initMap(colorData: number[]) {
    let sr = this.spriteRef.spriteFrame.texture as Texture2D;
    let h = sr.height;
    let w = sr.width;
    let image = sr.image;
    
    let mix = this.spriteMix.spriteFrame.texture as Texture2D;
    this.refData = readImagePixels(image);
    let mixData = readImagePixels(mix.image);
    let mh = mix.height;
    let mw = mix.width;

    if (!this.refData || !mixData) {
      throw new Error("SandSimulation requires readable Ref and Mix textures.");
    }
    this.mixSourceData = mixData;
    this.mixSourceWidth = mw;
    this.mixSourceHeight = mh;

    this.map = new Map();

    // this.roundRectPixels();

    for (let i = WIDTH * 0; i < WIDTH; i++) {
      for (let j = HEIGHT * 0; j < HEIGHT; j++) {
        if (this.grid[this.idx(i, j)] === CellType.None) continue;

        let x = ((i / WIDTH) * w) | 0;
        let y = (((HEIGHT - 1 - j) / HEIGHT) * h) | 0;
        let col = getPixel(x, y, w, this.refData);

        let mx = ((i / WIDTH) * mw) | 0;
        let my = (((HEIGHT - 1 - j) / HEIGHT) * mh) | 0;
        let mix = getPixel(mx, my, mw, mixData);

        // if(col.a === 0) {
        //   this.grid[this.idx(i, j)] = CellType.None;
        //   // this.removePixel(v2(i, j));
        //   continue;
        // }

        let rs = findNearestColor(col, [...this.chosenColors]);
        col = rs.color.clone();
        let cIndex = this.colors.indexOf(rs.color);

        if (!this.map.has(cIndex)) {
          this.map.set(cIndex, 0);
        }

        this.map.set(cIndex, this.map.get(cIndex) + 1);

        let index = this.idx(i, j);
        let p = index * 4;
        this.texData[p] = col.r;
        this.texData[p + 1] = col.g;
        this.texData[p + 2] = col.b;
        this.texData[p + 3] = 255;

        this.grid[index] = CellType.Sand;
        this.cGrid[index] = cIndex;
        this.colData[index] = color(col.r, col.g, col.b, 255);
      }
    }
    this.texture.uploadData(this.texData);
    // console.log(this.map);

    let keys = Array.from(this.map.keys()).sort(
      (a, b) => this.map.get(b) - this.map.get(a),
    );
    keys = keys.filter((k) => this.map.get(k) > 0);
    this.total = keys.reduce((a, b) => a + this.map.get(b), 0);
    console.log("Total", this.total);
    keys.forEach((k, i) => {
      this.colorData.push([k, this.map.get(k), this.map.get(k) / this.total]);
      console.log(k, ColorType[k], this.map.get(k));
    });
  }

  indexToWpos(x: number, y: number) {
    let w = this.uT.width;
    let h = this.uT.height;
    x = (x * w) / WIDTH - w / 2;
    y = (y * h) / HEIGHT - h / 2;
    let local = v3(x, y, -5);
    let wpos = v3();
    let m = this.sprite.node.parent.worldMatrix.clone();
    wpos = Vec3.transformMat4(wpos, local, m);
    wpos.z = this.sprite.node.worldPosition.z;
    return wpos;
  }

  wposToIndex(wpos: Vec3) {
    let local = this.sprite.node.parent.inverseTransformPoint(v3(), wpos);
    let w = this.uT.width;
    let h = this.uT.height;
    local.x += w / 2;
    local.y += h / 2;
    local.x = (local.x / w) * WIDTH;
    local.y = (local.y / h) * HEIGHT;
    local.x = local.x | 0;
    local.y = local.y | 0;
    return local;
  }

  checkPoint(hitPoint: Vec3, color: ColorType) {
    let local = this.wposToIndex(hitPoint);
    let i = this.idx(local.x, local.y);
    this.cGrid[i] = color;

    this.updateTextureChunked();
  }

  setSolidPixel(index: Vec2) {
    let x = index.x;
    let y = index.y;

    let i = this.idx(x, y);
    this.grid[i] = CellType.Solid;
  }

  removePixel(index: Vec2) {
    let x = index.x;
    let y = index.y;
    let i = this.idx(x, y);
    this.grid[i] = CellType.Empty;
    this.empties.push(index);
  }

  setSandPixel(index: Vec2) {
    let x = index.x;
    let y = index.y;
    let i = this.idx(x, y);
    this.grid[i] = CellType.Sand;
  }

  /* ================= FALL ================= */

  stepFallChunked(linear: boolean = false) {
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        if (this.grid[this.idx(x, y)] === CellType.Sand) {
          if (!linear) this.tryMove(x, y);
          else this.tryMoveLinear(x, y);
        }
      }
    }
  }
  tryMove(x: number, y: number) {
    const dirs = Math.random() < 0.5 ? [-1, 1] : [1, -1];

    for (const dx of dirs) {
      const nx = x + dx;
      const ny = y - 1;
      if (nx < 0 || nx >= WIDTH || ny < 0) continue;

      if (this.grid[this.idx(nx, ny)] === CellType.Empty) {
        this.swap(x, y, nx, ny);
        return;
      }
    }
  }
  tryMoveLinear(x: number, y: number) {
    const dirs = [0];

    for (const dx of dirs) {
      const nx = x + dx;
      const ny = y - 1;
      if (nx < 0 || nx >= WIDTH || ny < 0) continue;

      if (this.grid[this.idx(nx, ny)] === CellType.Empty) {
        this.swap(x, y, nx, ny);
        return;
      }
    }
  }

  updateTextureChunked() {

    for (let y = HEIGHT - 1; y >= 0; y--) {
      for (let x = 0; x < WIDTH; x++) {
        const i = this.idx(x, y);
        const ty = HEIGHT - 1 - y;
        const p = (ty * WIDTH + x) * 4;

        if (this.grid[i] === CellType.Empty || this.grid[i] === CellType.None) {
          this.texData[p + 3] = 0;
          const mX = RenderWidth / WIDTH;
          const mY = RenderHeight / HEIGHT;

          const startX = x * mX;
          const startY = (HEIGHT - 1 - y) * mY;

          for (let mYi = 0; mYi < mY; mYi++) {
            for (let mXi = 0; mXi < mX; mXi++) {
              const mx = startX + mXi;
              const my = startY + mYi;
              const mi = (mx + my * RenderWidth) * 4;

              this.mixTextData[mi + 3] = 0;
            }
          }
        } else {
          let color = this.colors[this.cGrid[i]].clone();
          color = this.colData[i];
          this.texData[p] = color.r;
          this.texData[p + 1] = color.g;
          this.texData[p + 2] = color.b;
          this.texData[p + 3] = color.a;


        }
      }
    }
    this.texture.uploadData(this.texData);
    this.mixTexture.uploadData(this.mixTextData);
  }

  /**
   * Updates the high-resolution Mix texture from the simulation grid.
   * One grid cell controls its proportional region in RenderWidth x
   * RenderHeight, e.g. a 200x200 grid controls 6x6 Mix pixels at 1200x1200.
   */
  updateMixTextureData() {
    
    if (!this.mixTexture || !this.mixSourceData) return;

    const sourceWidth = this.mixSourceWidth;
    const sourceHeight = this.mixSourceHeight;

    for (let renderY = 0; renderY < RenderHeight; renderY++) {
      const gridY = HEIGHT - 1 - Math.floor((renderY * HEIGHT) / RenderHeight);
      const sourceY = Math.min(
        sourceHeight - 1,
        Math.floor((renderY * sourceHeight) / RenderHeight),
      );

      for (let renderX = 0; renderX < RenderWidth; renderX++) {
        const gridX = Math.min(WIDTH - 1, Math.floor((renderX * WIDTH) / RenderWidth));
        const sourceX = Math.min(
          sourceWidth - 1,
          Math.floor((renderX * sourceWidth) / RenderWidth),
        );
        const sourcePixel = (sourceY * sourceWidth + sourceX) * 4;
        const targetPixel = (renderY * RenderWidth + renderX) * 4;
        const gridCell = this.grid[this.idx(gridX, gridY)];

        let col = color(this.mixSourceData[sourcePixel]
          , this.mixSourceData[sourcePixel + 1]
          , this.mixSourceData[sourcePixel + 2]);

        let p = this.mixIdxToRefIdx(this.mixIdx(renderX, renderY));
        let refColor = this.colors[this.cGrid[p]].clone();
        

        if(!this.original) {
          col = Color.lerp(color(), col, refColor, this.mixParam);
          col = this.applyIndexNoise(col, this.idx(renderX, renderY));
        }

        this.mixTextData[targetPixel] = col.r;
        this.mixTextData[targetPixel + 1] = col.g;
        this.mixTextData[targetPixel + 2] = col.b;
        this.mixTextData[targetPixel + 3] =
          gridCell === CellType.Empty || gridCell === CellType.None
            ? 0
            : this.mixSourceData[sourcePixel + 3];
      }
    }

    this.mixTexture.uploadData(this.mixTextData);
  }

  /* ================= UTIL ================= */

  idx(x: number, y: number) {
    return y * WIDTH + x;
  }

  revertIdx(i: number) {
    return v2(i % WIDTH, (i / WIDTH) | 0);
  }

  /** Pixel index in the RenderWidth x RenderHeight Mix texture. */
  mixIdx(x: number, y: number) {
    return y * RenderWidth + x;
  }

  /** Converts a Mix pixel index back to its texture-space coordinates. */
  revertMixIdx(i: number) {
    return v2(i % RenderWidth, (i / RenderWidth) | 0);
  }

  /**
   * Returns every Mix pixel controlled by one Ref/simulation cell.
   * Returned values are pixel indexes; multiply an index by 4 when reading or
   * writing mixTextData because the texture is RGBA.
   */
  refIdxToMixIdx(refIndex: number): number[] {
    const ref = this.revertIdx(refIndex);
    const startX = Math.floor((ref.x * RenderWidth) / WIDTH);
    const endX = Math.floor(((ref.x + 1) * RenderWidth) / WIDTH);

    // Mix texture data starts at the top row, while simulation y starts at
    // the bottom row, matching updateTextureChunked's HEIGHT - 1 - y logic.
    const startY = Math.floor(((HEIGHT - 1 - ref.y) * RenderHeight) / HEIGHT);
    const endY = Math.floor(((HEIGHT - ref.y) * RenderHeight) / HEIGHT);
    const mixIndices: number[] = [];

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        mixIndices.push(this.mixIdx(x, y));
      }
    }

    return mixIndices;
  }

  /**
   * Returns the Ref/simulation cell that controls a Mix pixel.
   * mixIndex uses texture-space coordinates (top-to-bottom), so y is flipped
   * before converting back to the simulation's bottom-to-top coordinates.
   */
  mixIdxToRefIdx(mixIndex: number): number {
    const mix = this.revertMixIdx(mixIndex);
    const refX = Math.min(WIDTH - 1, Math.floor((mix.x * WIDTH) / RenderWidth));
    const refY = Math.max(
      0,
      HEIGHT - 1 - Math.floor((mix.y * HEIGHT) / RenderHeight),
    );

    return this.idx(refX, refY);
  }

  revertAll() {
    let data = [];
    for (let i = 0; i < WIDTH; i++) {
      for (let j = 0; j < HEIGHT; j++) {
        let index = this.idx(i, j);
        let c = this.cGrid[index];
        data.push(c);
      }
    }
    console.log(JSON.stringify(data));
  }

  swap(x1: number, y1: number, x2: number, y2: number) {
    const i1 = this.idx(x1, y1);
    const i2 = this.idx(x2, y2);

    const t = this.grid[i1];
    this.grid[i1] = this.grid[i2];
    this.grid[i2] = t;

    let c = this.cGrid[i1];
    this.cGrid[i1] = this.cGrid[i2];
    this.cGrid[i2] = c;

    let col = this.colData[i1];
    this.colData[i1] = this.colData[i2];
    this.colData[i2] = col;
  }
}

export function getPixel(
  x: number,
  y: number,
  width: number,
  refData: Uint8ClampedArray,
) {
  let i = (y * width + x) * 4;
  return color(refData[i], refData[i + 1], refData[i + 2], refData[i + 3]);
}

export function readImagePixels(image: ImageAsset): Uint8ClampedArray | null {
  if (image.isCompressed) return null;

  const src = image.data;

  if (!src) return null;

  if (src instanceof Uint8Array || src instanceof Uint8ClampedArray) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;

  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(src as any, 0, 0);

  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

export function findNearestColor(
  target: Color,
  palette: Color[],
): { color: Color; index: number; distance: number } {
  let bestIndex = -1;
  let bestDist = Infinity;

  for (let i = 0; i < palette.length; i++) {
    const c = palette[i];

    const dr = target.r - c.r;
    const dg = target.g - c.g;
    const db = target.b - c.b;

    const dist = dr * dr + dg * dg + db * db;

    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
  }

  return {
    color: palette[bestIndex],
    index: bestIndex,
    distance: Math.sqrt(bestDist),
  };
}


export function savePNG(data: Uint8Array, width:number, height:number, name:string){
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');

    const imgData = ctx.createImageData(width,height);

    // đảo Y vì GPU ngược
    for(let y=0;y<height;y++){
        for(let x=0;x<width;x++){

            let src = ((y)*width+x)*4;
            let dst = (y*width+x)*4;

            imgData.data[dst] = data[src];
            imgData.data[dst+1] = data[src+1];
            imgData.data[dst+2] = data[src+2];
            imgData.data[dst+3] = data[src+3];
        }
    }

    ctx.putImageData(imgData,0,0);


    const link = document.createElement('a');
    link.download=name;
    link.href=canvas.toDataURL("image/png");
    link.click();
}