import { _decorator, Animation, Camera, CCInteger, CCObject, color, Color, Component, director, Enum, EventKeyboard, EventTouch, ImageAsset, Input, input, instantiate, KeyCode, Label, Layers, Mat4, Material, misc, MeshRenderer, Node, ParticleSystem, quat, Quat, rect, Sprite, SpriteFrame, sys, Texture2D, toDegree, toRadian, Tween, tween, UIOpacity, UITransform, v2, view, v3, Vec2, Vec3 } from 'cc';
import { Mats } from '../Misc/Mats';
import { Bus } from './Bus';
import { EDITOR, EDITOR_NOT_IN_PREVIEW,} from 'cc/env';
import { ui } from '../Manager/UI';
import Ulis, { cEasing, nearestAngle, rect3, Rect3, splitSum } from '../Misc/Ulis';
import { sm, SoundType } from '../Manager/SoundManager';
import { AppLovinAnalytics } from '../Tool/AppLovinAnalytics';
import { Slot } from './Slot';
import { Bound } from './Bound';
import { Human } from './Human';
import { pm } from '../Pool/PoolManager';
import { PoolType } from '../Pool/PoolMember';
import { BusData, CachedPaths, Colors, ColorType, HumanData, LinearHumanData, ObstacleData } from './Data';
import { findNearestColor, getPixel, readImagePixels, SandSimulationChunked, savePNG } from '../Sand/SandSimulation';
import { AStar, getNeightbors } from '../Misc/AStar';
import { truncate } from './BoxCreator';
import { Line3DRing } from '../../Misc/Line2D/Line3DRing';
// Cách sắp thứ tự row người đi vào ring (SpawnMode.Data).
export enum RowOrder {
    Data = 0,       // giữ nguyên thứ tự LinearHumanData
    LoopColors = 1, // màu 0..7 xoay vòng, mỗi màu rowsPerColor row
    BusOrder = 2,   // theo thứ tự xe mở được (ObstacleData) — dễ thắng, luôn có cách giải
}

// Màu row được sinh trên ring: Data = theo LinearHumanData (đúng số row mỗi màu = số ghế xe, sắp theo rowOrder),
// ColorLoop = từng cụm loopRowsMin..loopRowsMax row liên tiếp cùng màu, lần lượt theo màu các xe, lặp vòng mãi (người vô hạn)
export enum SpawnMode { Data, ColorLoop }
Enum(SpawnMode);

// Hết row cần sinh (Data đã phát hết) mà ring còn ô trống: None = để trống,
// WinColors = lấp bằng màu xe còn chờ người (dư người giúp thắng), LevelColors = lấp bằng mọi màu có trong màn
export enum FillMode { None, WinColors, LevelColors }
Enum(FillMode);

const { ccclass, property, executeInEditMode } = _decorator;

export var gm: Game = null;

// 1 row người đang chạy trên Line3DRing (ô cố định trong Game.ringSlots, cả row cùng màu)
export class RingRow {
    humans: Human[] = [];
    color: ColorType = ColorType.White;
    // ô trên ring (Human.onRing() dựa vào đây), -1 = đã rời ring
    slotIndex: number = -1;
    // làn của từng người (song song với humans) -> rời row không làm người còn lại xô lệch
    lanes: number[] = [];
    // quãng đường lần trước, để biết row vừa vòng từ cuối đường về đầu vào
    lastDis: number = -1;
    wrapped: boolean = false;
}

@ccclass('Game')
@executeInEditMode(true)
export class Game extends Component {
    @property({ tooltip: "Số lần bấm xe để chuyển sang Store (native ép thành 9999)" })
    clicksToStore: number = 12;
    count: number = 0;
    progress: number = 0;
    @property({ tooltip: "Số giây chờ trước khi hiện tay hướng dẫn" })
    tutTime: number = 3;
    @property({ type: Animation, tooltip: "Animation phát khi hết slot trống" })
    noSlot: Animation = null!
    humanSize: Vec2 = v2(47, 52);
    @property({ type: [CCInteger], tooltip: "Index các xe (trong buses) mà tay hướng dẫn chỉ vào lần lượt" })
    tapIndices: number[] = [105];
    introBus: Node = null;
    humanDis: Vec2 = v2(0.255, 0.255);
    disHuman: number = 0.016;
    disMul: Vec2 = v2(0.016, 0.016);
    @property({ type: SpriteFrame, tooltip: "Sprite người màu đen (chế độ 2D)" })
    blackHuman: SpriteFrame = null!;

    @property({ type: [Color], tooltip: "Bảng màu gốc, index tương ứng ColorType — không đổi thứ tự" })
    colors: Color[] = [];

    boxMats: Material[] = [];
    humanMats: Material[] = []; 

    mat: Node = null;
    human: Node = null;
    bus: Node = null;
    touch: Node = null;
    touchNode: Node = null;
    slot: Node = null;
    bound: Bound = null;
    sand: Node = null;
    linear: Node = null;
    brain: Node = null;
    brainText: Label = null!;

    @property({ tooltip: "Số người trong 1 row" })
    humanPerRow: number = 4;
    @property({ type: SpawnMode, tooltip: "Data: màu row theo LinearHumanData (đúng số row mỗi màu, sắp theo rowOrder), hết thì lấp theo fillMode. ColorLoop: mỗi màu ra liền 1 cụm loopRowsMin..loopRowsMax row, lần lượt theo màu các xe, hết vòng thì quay lại màu đầu (người vô hạn)" })
    spawnMode: SpawnMode = SpawnMode.ColorLoop;
    @property({ type: Enum(RowOrder), visible() { return this.spawnMode == SpawnMode.Data; }, tooltip: "Thứ tự row: Data = giữ nguyên data; LoopColors = màu 0..7 xoay vòng; BusOrder = người của xe đang thoát được tới trước (dễ thắng)" })
    rowOrder: RowOrder = RowOrder.BusOrder;
    @property({ visible() { return this.spawnMode == SpawnMode.Data; }, tooltip: "Số row liên tiếp cùng màu khi xoay vòng màu (0 = giữ nguyên thứ tự LinearHumanData)" })
    rowsPerColor: number = 4;
    @property({ visible() { return this.spawnMode == SpawnMode.Data; }, tooltip: "BusOrder: số xe được xen kẽ row cùng lúc" })
    busOrderWindow: number = 3;
    @property({ type: CCInteger, min: 1, visible() { return this.spawnMode == SpawnMode.ColorLoop; }, tooltip: "ColorLoop: số row ít nhất của 1 cụm cùng màu" })
    loopRowsMin: number = 4;
    @property({ type: CCInteger, min: 1, visible() { return this.spawnMode == SpawnMode.ColorLoop; }, tooltip: "ColorLoop: số row nhiều nhất của 1 cụm cùng màu (chọn ngẫu nhiên trong khoảng min..max)" })
    loopRowsMax: number = 4;
    @property({ visible() { return this.spawnMode == SpawnMode.ColorLoop; }, tooltip: "Tắt: màu hết xe vẫn giữ nguyên trên ring, chuỗi màu quay đều mọi màu trong màn. Bật: màu hết xe thì đổi ngay cả cụm sang màu còn cần và bỏ khỏi chuỗi màu" })
    recolorFinished: boolean = false;
    @property({ type: FillMode, visible() { return this.spawnMode == SpawnMode.Data; }, tooltip: "Khi đã sinh hết row cho mọi xe mà ring còn ô trống: None = để trống, WinColors = lấp bằng màu xe còn chờ người, LevelColors = lấp bằng mọi màu trong màn" })
    fillMode: FillMode = FillMode.LevelColors;

    @property({ type: Line3DRing, tooltip: "Đường xoắn ốc người chạy vòng. Row đi qua lối ra (exitFromPoint→exitToPoint của Line3DRing) mà cùng màu xe trong slot thì lên xe, tới cuối đường thì quay về đầu vào" })
    line3DRing: Line3DRing = null;
    @property({ tooltip: "Tốc độ chạy của row trên ring (đơn vị local của Line3DRing / giây)" })
    ringSpeed: number = 1;
    @property({ tooltip: "Bật: người chạy từ point cuối về point 0. Tắt: từ point 0 tới point cuối" })
    ringReverse: boolean = true;
    @property({ tooltip: "Khoảng cách giữa 2 row liên tiếp trên ring (local Line3DRing). Lớn hơn = ít người hơn, nhẹ hơn" })
    ringRowSpacing: number = 0.45;
    @property({ tooltip: "Khoảng cách ngang giữa 2 người cạnh nhau trong row trên ring (local Line3DRing)" })
    ringLaneGap: number = 0.3;
    @property({ range: [0, 1, 0.05], slide: true, tooltip: "Tỉ lệ ô trên ring có sẵn người lúc bắt đầu (ô trống được lấp dần ở đầu vào)" })
    ringPrefill: number = 1;
    @property({ tooltip: "Phóng to người trên ring so với người ở node Human (1 = cùng cỡ)" })
    ringHumanScale: number = 1.2;
    @property({ tooltip: "Quãng đường thu nhỏ/hiện dần ở cuối và đầu đường khi row quay về đầu vào" })
    ringFade: number = 0.6;
    @property({ type: [Node], tooltip: "Các điểm người đi qua theo thứ tự sau khi rời lối ra của ring, rồi đi vào xe. Để trống = đi thẳng tới xe" })
    exitPoints: Node[] = [];

    buses: Bus[] = [];
    slots: Slot[] = [];
    humans: Human[] = [];
    movingHumans: Human[] = [];
    movingHumanRoot: Node = null;

    first: boolean = true;

    colorHumans: Human[][] = [];
    humanMatrix: Human[][] = [];
    empties: Vec2[] = [];

    tData: Uint8Array = new Uint8Array(0);

    lose: boolean = false;


    data: any[] = [];

    outsideHumans: Human[] = [];

    busSpeed: number = 1;
    humanSpeed: number = 2;

    sumBus: number[] = [];
    sumHuman: any = [];

    totalChallenge: number = 0;
    taps: Node[] = [];
    tutTween: Tween<any> = null!;

    @property({ tooltip: "Bật: người dùng sprite 2D; tắt: model 3D + shadow" })
    human2D: boolean = false;
    @property({ tooltip: "Chế độ chỉnh level: bấm xe để xoay, A đổi kiểu xoay, Space lưu BusData" })
    tool: boolean = false;

    @property({ tooltip: "Tick để xuất ảnh pixel người ra Human.png" })
    set savePNG(v: boolean) {
        savePNG(this.tData, this.humanSize.x, this.humanSize.y, "Human.png");
    }
    get savePNG() { return false; }

    @property({ tooltip: "Tick để lưu xe trên scene (vị trí, góc, màu, kiểu xe) vào Data.ts — tự tính lại Obstacle Data + Linear Human Data, dựng lại xe và cập nhật ngay" })
    set saveBusData(v: boolean) {
        this.saveBuses();
    }
    get saveBusData() { return false; }

    // Gộp Print Bus Data + Print Block Data + Print Cached Path: đọc xe trên scene → BusData, dựng lại xe
    // từ data (spawn mới theo `type` nên đổi kiểu xe trong Inspector cũng ăn), tính ObstacleData +
    // LinearHumanData từ xe vừa dựng, rồi ghi đè 3 mảng đó trong Data.ts. Mảng import được sửa
    // tại chỗ nên scene dùng data mới luôn, không cần chờ compile lại. Ngoài editor chỉ in ra console.
    async saveBuses() {
        this.printData();
        let sceneBuses = this.bus.getComponentsInChildren(Bus);
        let busData = sceneBuses.map(bus => {
            let x = bus.node.position.x / this.disMul.x;
            let y = bus.node.position.y / this.disMul.y;
            return [bus.type - PoolType.Bus, bus.dColor, truncate(x, 3), truncate(y, 3), truncate(bus.node.eulerAngles.z, 3)];
        });
        BusData.length = 0;
        BusData.push(...busData);

        if(EDITOR) {
            // Xoá hết xe cũ rồi dựng lại từ BusData — xe đổi `type` sẽ được spawn đúng prefab mới.
            this.bus.getComponentsInChildren(Bus).forEach(b => {
                b.node.removeFromParent();
                b.node.destroy();
            });
            this.initBuses();
        } else {
            // Preview (tool mode, Space): không dựng lại giữa game, chỉ tính từ xe hiện có.
            this.buses = this.bus.getComponentsInChildren(Bus);
        }

        let obstacleData = this.buses.map(b => {
            b.obstascles = [];
            this.onBox(b, true);
            return b.obstascles.map(c => this.buses.indexOf(c.getComponent(Bus)));
        });
        ObstacleData.length = 0;
        ObstacleData.push(...obstacleData);

        let humanData = this.getHumanDataFromBuses();
        LinearHumanData.length = 0;
        LinearHumanData.push(...humanData);

        if(!EDITOR) {
            console.log("Bus Data");
            console.log(JSON.stringify(BusData));
            console.log("Obstacle Data");
            console.log(JSON.stringify(ObstacleData));
            console.log("Linear Human Data");
            console.log(JSON.stringify(LinearHumanData));
            return;
        }
        await this.writeDataFile({ BusData, ObstacleData, LinearHumanData });
    }

    // Ghi đè các dòng `export const <tên> = [...]` trong Data.ts (mỗi mảng nằm trên 1 dòng).
    async writeDataFile(values: { [name: string]: any[] }) {
        const url = "db://assets/7.Scripts/Gameplay/Data.ts";
        const Editor = (globalThis as any).Editor;
        const fs = (globalThis as any).require?.("fs");
        if(!Editor || !fs) {
            console.error("Save Bus Data: không truy cập được Editor/fs để ghi Data.ts");
            return;
        }
        const path: string = await Editor.Message.request("asset-db", "query-path", url);
        let text: string = fs.readFileSync(path, "utf8");
        for(let name in values) {
            const reg = new RegExp("(export const " + name + "\\s*=\\s*).*$", "m");
            if(!reg.test(text)) {
                console.error("Save Bus Data: không tìm thấy " + name + " trong Data.ts");
                return;
            }
            text = text.replace(reg, (_, head) => head + JSON.stringify(values[name]) + " ");
        }
        await Editor.Message.request("asset-db", "save-asset", url, text);
        console.log("Save Bus Data: đã lưu " + BusData.length + " xe vào Data.ts");
    }

    onMatChange() {
        let mats = this.mat.getComponentsInChildren(Mats);
        this.boxMats = mats[0].mats;
        this.humanMats = mats[1].mats;
        this.buses.forEach(b => b.setColor());
        this.humans.forEach(h => h.setColor());
    }
    
    
    initTaps() {
        this.taps = this.tapIndices.map(i => this.buses[i].node);
        this.startIntro(this.taps[0]);
        // this.tut();

        setTimeout(() => {
            if(this.first) this.tut();
        }, this.tutTime * 1000);
    }

    // Intro: node World/Scenes/UI/Black (WCam) phủ tối cả màn hình; trong lúc intro ẩn sprite của
    // Black, thay bằng nhóm con "IntroSpot": 1 khung vuông bo góc ôm xe hướng dẫn (trong khung
    // trong suốt, viền trắng phát sáng) + 4 mảng tối phủ phần còn lại. Tự tắt sau introDuration giây.
    startIntro(bus: Node) {
        if(!bus) return;
        this.introBus = bus;
        // Đợi 1 frame cho worldBounds của mesh cập nhật rồi mới đo vị trí/kích thước xe
        this.scheduleOnce(() => this.createIntroSpot(), 0);
        this.scheduleOnce(() => this.autoEndIntro(), this.introDuration);
    }

    @property({ tooltip: "Số giây màn tối intro tự tắt (không cần bấm)" })
    introDuration: number = 2.5;
    @property({ tooltip: "Khoảng hở từ xe tới viền khung (tỉ lệ cạnh ngắn của xe)" })
    spotPadding: number = 0.2;
    @property({ tooltip: "Bo góc khung (tỉ lệ cạnh ngắn của xe)" })
    spotCorner: number = 0.25;
    @property({ tooltip: "Độ dày viền trắng (tỉ lệ cạnh ngắn của xe)" })
    spotLine: number = 0.08;
    @property({ tooltip: "Độ loang của quầng sáng trắng ngoài viền (tỉ lệ cạnh ngắn của xe)" })
    spotGlow: number = 0.5;
    @property({ tooltip: "Độ sáng quầng trắng ngoài viền (0-1)" })
    spotGlowAlpha: number = 0.6;
    introSpot: Node = null;

    getIntroBlack(): Node {
        return ui?.wCamera?.node.parent?.getChildByPath("Scenes/UI/Black");
    }

    // Texture khung: hx/hy = nửa kích thước lỗ, ex/ey = nửa kích thước cả texture (world units).
    // Trong lỗ alpha 0 → viền trắng → quầng trắng mờ dần → mép texture tối đúng bằng Black (darkA)
    // để nối liền với 4 mảng tối xung quanh.
    makeSpotFrame(hx: number, hy: number, ex: number, ey: number, r: number, line: number, glow: number, darkA: number): SpriteFrame {
        const ppu = 256 / (Math.max(ex, ey) * 2);
        const tw = Math.ceil(ex * 2 * ppu), th = Math.ceil(ey * 2 * ppu);
        const aa = 1 / ppu;
        const data = new Uint8Array(tw * th * 4);
        const smooth = (e0: number, e1: number, x: number) => {
            let t = misc.clampf((x - e0) / (e1 - e0), 0, 1);
            return t * t * (3 - 2 * t);
        };
        for(let y = 0; y < th; y++) {
            for(let x = 0; x < tw; x++) {
                let px = ((x + 0.5) / tw - 0.5) * ex * 2;
                let py = ((y + 0.5) / th - 0.5) * ey * 2;
                // khoảng cách có dấu tới hình chữ nhật bo góc
                let qx = Math.abs(px) - (hx - r), qy = Math.abs(py) - (hy - r);
                let sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;

                let lineA = smooth(-aa, 0, sd) * (1 - smooth(line, line + aa, sd));
                let gt = misc.clampf((sd - line) / glow, 0, 1);
                let glowA = sd > line ? (1 - gt) * (1 - gt) * this.spotGlowAlpha : 0;
                let g = Math.max(lineA, glowA);
                let d = darkA * smooth(0, line + glow, sd);
                let a = g + d * (1 - g);
                let i = (y * tw + x) * 4;
                let c = a > 0 ? Math.round(g / a * 255) : 255;
                data[i] = data[i + 1] = data[i + 2] = c;
                data[i + 3] = Math.round(a * 255);
            }
        }
        const tex = new Texture2D();
        tex.reset({ width: tw, height: th, format: Texture2D.PixelFormat.RGBA8888 });
        tex.uploadData(data);
        const sf = new SpriteFrame();
        sf.texture = tex;
        return sf;
    }

    createIntroSpot() {
        const bus = this.introBus;
        const black = this.getIntroBlack();
        const cam = ui?.wCamera;
        const blackSprite = black?.getComponent(Sprite);
        if(!bus || !black || !cam || !blackSprite || !black.activeInHierarchy) return;

        let min = v2(Infinity, Infinity), max = v2(-Infinity, -Infinity);
        bus.getComponentsInChildren(MeshRenderer).forEach(mr => {
            const b = mr.model?.worldBounds;
            if(!b) return;
            min.x = Math.min(min.x, b.center.x - b.halfExtents.x);
            min.y = Math.min(min.y, b.center.y - b.halfExtents.y);
            max.x = Math.max(max.x, b.center.x + b.halfExtents.x);
            max.y = Math.max(max.y, b.center.y + b.halfExtents.y);
        });
        if(!isFinite(min.x)) return;
        const cx = (min.x + max.x) / 2, cy = (min.y + max.y) / 2;
        const s = Math.min(max.x - min.x, max.y - min.y);
        const pad = s * this.spotPadding, line = s * this.spotLine, glow = s * this.spotGlow;
        const hx = (max.x - min.x) / 2 + pad, hy = (max.y - min.y) / 2 + pad;
        const ex = hx + line + glow, ey = hy + line + glow;

        // Vùng cần phủ tối: rộng gấp đôi vùng camera nhìn thấy cho chắc
        const vs = view.getVisibleSize();
        const halfH = cam.orthoHeight * 2, halfW = halfH * vs.width / vs.height;
        const cp = cam.node.worldPosition;
        const L = Math.min(cp.x - halfW, cx - ex), R = Math.max(cp.x + halfW, cx + ex);
        const B = Math.min(cp.y - halfH, cy - ey), T = Math.max(cp.y + halfH, cy + ey);

        // root đặt ở gốc toạ độ world, scale 1 → toạ độ local của các mảng chính là toạ độ world
        const root = new Node("IntroSpot");
        root.layer = black.layer;
        black.addChild(root);
        root.setWorldPosition(0, 0, black.worldPosition.z);
        root.setWorldRotation(Quat.IDENTITY);
        root.setWorldScale(1, 1, 1);
        const piece = (frame: SpriteFrame, col: Color, x0: number, y0: number, x1: number, y1: number) => {
            if(x1 <= x0 || y1 <= y0) return;
            const n = new Node("Piece");
            n.layer = black.layer;
            root.addChild(n);
            n.addComponent(UITransform).setContentSize(x1 - x0, y1 - y0);
            const sp = n.addComponent(Sprite);
            sp.customMaterial = blackSprite.customMaterial;
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.trim = false;
            sp.spriteFrame = frame;
            sp.color = col;
            n.setPosition((x0 + x1) / 2, (y0 + y1) / 2, 0);
        };
        const dark = blackSprite.color;
        piece(this.makeSpotFrame(hx, hy, ex, ey, s * this.spotCorner, line, glow, dark.a / 255),
            Color.WHITE, cx - ex, cy - ey, cx + ex, cy + ey);
        piece(blackSprite.spriteFrame, dark, L, cy + ey, R, T);
        piece(blackSprite.spriteFrame, dark, L, B, R, cy - ey);
        piece(blackSprite.spriteFrame, dark, L, cy - ey, cx - ex, cy + ey);
        piece(blackSprite.spriteFrame, dark, cx + ex, cy - ey, R, cy + ey);
        blackSprite.enabled = false;
        this.introSpot = root;
    }

    autoEndIntro() {
        if(!this.introBus) return;
        const black = this.getIntroBlack();
        if(!black || !black.active) { this.endIntro(); return; }
        const op = black.getComponent(UIOpacity) ?? black.addComponent(UIOpacity);
        tween(op).to(0.3, { opacity: 0 }).call(() => {
            black.active = false;
            op.opacity = 255;
            this.endIntro();
        }).start();
    }

    // HighCam vẽ layer UI_3D (tay hướng dẫn) đè lên màn tối — phải trùng WCam (vị trí, xoay,
    // ortho/fov, near/far) thì tay mới chỉ đúng xe. Chép lại mỗi frame để chỉnh/dời WCam
    // (scene hoặc responsive) không phải sửa tay HighCam theo.
    highCam: Camera = null;
    syncHighCam() {
        let w = ui?.wCamera;
        if(!w) return;
        if(!this.highCam) this.highCam = w.node.parent?.getChildByName("HighCam")?.getComponent(Camera);
        let h = this.highCam;
        if(!h) return;
        h.node.setWorldPosition(w.node.worldPosition);
        h.node.setWorldRotation(w.node.worldRotation);
        h.projection = w.projection;
        h.orthoHeight = w.orthoHeight;
        h.fov = w.fov;
        h.near = w.near;
        h.far = w.far;
    }

    lateUpdate() {
        if(!EDITOR_NOT_IN_PREVIEW) this.syncHighCam();
    }

    endIntro() {
        if(!this.introBus) return;
        this.introBus = null;
        const root = this.introSpot;
        this.introSpot = null;
        if(root?.isValid) {
            const blackSprite = root.parent?.getComponent(Sprite);
            if(blackSprite) blackSprite.enabled = true;
            root.children[0]?.getComponent(Sprite)?.spriteFrame?.texture?.destroy();
            root.destroy();
        }
    }

    checkTut() {
        ui?.offHand();
        this.tutTween?.stop();

        let delay = this.taps[0] ? 0 : this.tutTime;
        delay = this.tutTime;
        this.tutTween = tween({})
        .delay(delay)
        .call(() => this.tut())
        // .start();
    }

    tut() {
        ui?.offHand();
        if(this.taps[0]) {
            ui?.handTap(this.taps[0]);
            return;
        } else {
        }
        let activeColor: number[] = [];
        this.outsideHumans = this.getFrontHumans();
        this.outsideHumans.forEach(h => {
            if(!activeColor.includes(h.color)) activeColor.push(h.color);
        })
        let activeBuses = this.buses.filter(b => b.obstascles.length == 0 
        && activeColor.includes(b.color));
        activeBuses = Ulis.shuffleArray(activeBuses);
        if(activeBuses[0]) ui?.handTap(activeBuses[0].node);
    }

    
    onTutBus(box: Bus) {
        this.taps = this.taps.filter(t => t != box.node);
        this.checkTut();

        this.count++;
        this.progress = this.count / this.totalChallenge * 100;
        ui.onProgress(this.progress);
        if(this.count >= this.clicksToStore || this.progress >= 100) {
            this.offTouch();
            ui.bindingToStore();
        }
    }

    iHuman(v: Vec2) {
        if(!this.humanMatrix[v.x]) return null;
        return this.humanMatrix[v.x][v.y];
    }


    onLoad() {
        gm = this;
    }

    firstMove() {
        if(this.first) {
            this.first = false;
            // Dọn vùng sáng intro cùng lúc UI tắt Black (firstOffTime, sau 1s trong UI.firstMove)
            setTimeout(() => this.endIntro(), 1000);
            sm.playBgMusic();
            ui.firstMove();
            AppLovinAnalytics.challengeStarted();
        }
    }

    start() {
        this.init();      
    }

    onNative() {
        this.clicksToStore = 9999;
        ui?.onNative();
        sm?.onNative();
    }

    init() {
        if(!EDITOR_NOT_IN_PREVIEW) {
            this.node.eulerAngles = v3(-30, 0, 0);
        }
        this.initLayers();
        this.initTouch();
        this.initMats();
        this.initSlots();
        
        if (!sys.isNative) {
            } else {
            this.onNative();
        }
        // Dựng xe TRƯỚC ring: số row mỗi màu phải khớp đúng sức chứa xe màu đó (fitRowsToBuses).
        this.initBuses();
        this.totalChallenge = this.buses.length;
        this.initRowData();
        this.initRing();

        // this.initBusesAvailable();

        console.log("Total human", this.humans.length);
        console.log("Total buses", this.totalChallenge);
        
        
        
        if(!EDITOR_NOT_IN_PREVIEW) {
            this.initTaps();
            setTimeout(() => {
                this.humans.forEach(h => {
                    let st = h.am?.getState("Human");
                    if(!st) return;
                    st.speed = 1 + (Math.random() - 0.5) * 2 * 0.2;
                    st.play();
                })
            }, 0);
            this.buses.forEach((b, i) => {
                if(!ObstacleData[i]) return;
                b.obstascles = ObstacleData[i].map(i => this.buses[i]?.node).filter(n => n);
                b.obstascles.forEach(c => {
                    let bus = c.getComponent(Bus);
                    if(!bus.blockeds.includes(b.node)) bus.blockeds.push(b.node);
                });
            })
        }
        this.schedule(this.checkBuses, 0.5);
    }

    score: number = 0;
    amount: number = 5;
    setScore() {
        this.score += this.amount;
        this.brainText.string = this.score.toString();
    }

    initLayers() {
        this.mat = this.node.getChildByName("Material");
        this.human = this.node.getChildByName("Human");
        this.bus = this.node.getChildByName("Bus");
        this.touch = this.node.getChildByName("Touch");
        this.slot = this.node.getChildByName("Slot");
        this.bound = this.node.getChildByName("Bound").getComponent(Bound);
        this.bound.init();
        this.sand = this.node.getChildByName("Sand");
        this.brain = this.node.getChildByName("Brain");
        this.brainText = this.brain.getComponentInChildren(Label);
        // this.setScore();
        this.linear = this.node.getChildByName("Linear");
        // Batcher2D vẽ các RenderRoot2D theo siblingIndex CỤC BỘ. Scenes/UI (chứa "Black", material
        // 2D.mtl có depthWrite, z=10) có index 1, Linear index 9 → Black vẽ trước, ghi depth phủ màn,
        // road Graphics (depth test) vẽ sau bị loại hết → mất đường khi hiện màn đen. Đưa Linear lên
        // index 0 để road vẽ trước Black, bị phủ mờ như phần còn lại.
        if(!EDITOR_NOT_IN_PREVIEW) {
            this.linear.setSiblingIndex(0);
            director.root.batcher2D.sortScreens();
        }
        if(!EDITOR_NOT_IN_PREVIEW) this.node.getChildByName("Test").active = false;
    }

    chosenColors: Color[] = [];
    initSand() {

        // this.colors = Colors.map(c => color().fromHEX(c));
        const chosenColors = [
            ColorType.White,
            ColorType.Gray,
            ColorType.Black,
            ColorType.LightYellow,
            ColorType.Orange,
            ColorType.LightBrown,
            ColorType.Brown,
            ColorType.Red,
            ColorType.DarkRed,
            ColorType.LightPink,
            ColorType.Pink,
            ColorType.LightBlue,
            ColorType.Blue,
            ColorType.LightPurple,
            ColorType.Purple,
            ColorType.Lemon,
            ColorType.Green,
            ColorType.DarkGreen,
            ColorType.Skin,
            ColorType.Cyan,
            ColorType.LightCyan,
            ColorType.Yellow,
        ];
    
        this.chosenColors = this.colors.filter(
            (c, i) => chosenColors.indexOf(i) !== -1,
        );

        let ref = this.sand.getComponentInChildren(Sprite);
        let tex = ref.spriteFrame.texture as Texture2D;
        let image = tex.image;
        let h = tex.height;
        let w = tex.width;
        
        let refData = readImagePixels(image);
        let data = [];

        this.tData = new Uint8Array(this.humanSize.x * this.humanSize.y * 4);
        let dt = 0.5;
        for (let i = 0; i < this.humanSize.x; i++) {
            for (let j = 0; j < this.humanSize.y; j++) {
                let x = (((i + dt) / this.humanSize.x) * w) | 0;
                let y = (((this.humanSize.y - 1 - j + dt) / this.humanSize.y) * h) | 0;
                // console.log(x, y);
                
                let col = getPixel(x, y, w, refData);
                
                let isTransparent = col.a === 0;        
        
                let rs = findNearestColor(col, [...this.chosenColors]);
                col = rs.color.clone();
                let cIndex = this.colors.indexOf(rs.color);
                
                if(isTransparent) {
                    col.a = 0;
                } else {
                    data.push([i, j, cIndex]);
                }

                let index = this.idx(i, (this.humanSize.y - 1 - j), this.humanSize.x, this.humanSize.y) * 4;
                this.tData[index + 0] = col.r;
                this.tData[index + 1] = col.g;
                this.tData[index + 2] = col.b;
                this.tData[index + 3] = col.a;

            }
        }
        this.data = data;
        
    }

    idx(x: number, y: number, w: number, h: number) {
        return y * w + x;
    }

    initMats() {
        
        let mats = this.mat.getComponentsInChildren(Mats);
        // mats[1].lineWidth = 1;
        // mats[1].brightness = -10/255;
        // // mats[1].sat = 1.5;
        // mats[0].brightness = -20/255;
        mats.forEach((m) => {
            m.init(this.colors);
        });
        this.boxMats = mats[0].mats;
        this.humanMats = mats[1].mats;
        // let colors = this.colors.map((c) => "#" + c.toHEX());
        // console.log(JSON.stringify(colors));
        
    }

    getBusData() {
        
    }

    initBusesAvailable() {
        this.buses = this.bus.getComponentsInChildren(Bus);
        let buses = [];
        this.buses.forEach((bus) => {
            // bus.init(ColorType.Red);
            bus.init(null);
            if(!EDITOR_NOT_IN_PREVIEW) {
                let b = instantiate(bus.node);
                b.parent = bus.node.parent;
                b.name = bus.node.name;
                let comp = b.getComponent(Bus);
                comp.init(null);
                buses.push(comp);
                bus.node.destroy();
            } else {
                buses.push(bus);
            }
        });
        this.buses = buses;
    }
    initBuses() {
        // this.bus.destroyAllChildren();
        this.buses = [];
        let buses = this.bus.getComponentsInChildren(Bus);
        let typeBuses: Bus[][] = [];
        let max = 999;
        let data = BusData.slice(0, max);
        data.forEach((data, i) => {
            let type = data[0] + PoolType.Bus;
            let iColor = data[1];
            // if(iColor == ColorType.Skin) {
            //     iColor = ColorType.LightYellow;
            // }
            let x = data[2];
            let y = data[3];
            let angle = data[4];

            // if(y * this.disMul < -8 ) return;

            if(!typeBuses[type]) {
                typeBuses[type] = buses.filter(b => b.type == type);
            }

            // console.log(type, x, y, angle);
            
            let bus = typeBuses[type].pop();
            if(!bus) bus = pm.spawnType<Bus>(type);
            bus.node.parent = this.bus;
            bus.node.name = PoolType[type] + "_" + i;
            // console.log(bus.node.name);
            
            bus.node.eulerAngles = v3(0, 0, angle);
            bus.node.setPosition(v3(x, y, 0).multiply3f(this.disMul.x, this.disMul.y, 1));
            bus.node._objFlags = 
            // CCObject.Flags.DontSave 
            // | CCObject.Flags.HideInHierarchy; 
            0;
            bus.init(iColor);
            
            if(!EDITOR_NOT_IN_PREVIEW) {
                let b = instantiate(bus.node);
                b.parent = bus.node.parent;
                b.name = bus.node.name;
                let comp = b.getComponent(Bus);
                comp.init(null);
                this.buses.push(comp);
                bus.node.destroy();
            } else {
                this.buses.push(bus);
            }

        })
        typeBuses.forEach((buses) => {
            buses.forEach((bus) => {
                bus.node.destroy();
            })
        })
    }

    initSlots() {
        this.slots = this.getComponentsInChildren(Slot);
        this.slots.forEach((slot) => {
            slot.init();
        });
    }


    validOffset() {
        let dt = v3(- this.humanSize.x / 2 + 0.5, - this.humanSize.y / 2 + 0.5);
        dt.y = 0.5;
        return dt;
    }

    
    initFullHuman() {
        let parent = this.human;
        let hs = parent.getComponentsInChildren(Human);
        for (let j = 0; j < this.humanSize.y; j++) {
            for (let i = 0; i < this.humanSize.x; i++) {
                let human = hs.pop();
                if(!human) human = pm.spawnType<Human>(PoolType.Human);
                let iColor = ColorType.White;
                human.init(iColor, v2(i, j));
                human.node.parent = parent;
                human.node.position = this.getPos(v2(i, j));
                human.node._objFlags = CCObject.Flags.DontSave 
                | CCObject.Flags.HideInHierarchy;
                this.humans.push(human);
                // this.map.set(iColor, this.map.get(iColor) + 1);
                if(!this.colorHumans[human.color]) {
                    this.colorHumans[human.color] = [];
                }
                this.colorHumans[human.color].push(human);
                if(!this.humanMatrix[i]) {
                    this.humanMatrix[i] = [];
                }
                this.humanMatrix[i][j] = human;
            }
        }
        hs.forEach(h => h.node.destroy());
    }
    
    initHuman() {
        let parent = this.human;
        let hs = parent.getComponentsInChildren(Human);
        let data: number[][] = this.data;
        for (let j = this.humanSize.y - 1; j >= 0 ; j--) {
        // for (let j = 0; j < this.humanSize.y ; j++) {
            for (let i = 0; i < this.humanSize.x; i++) {

                let item = data.find((item) => item[0] == i && item[1] == j)
                if(!item) {
                    this.empties.push(v2(i, j));
                    continue;
                }
                
                let human = hs.pop();
                if(!human) human = pm.spawnType<Human>(PoolType.Human);
                let iColor = item[2];
                human.init(iColor, v2(i, j));
                human.node.parent = parent;
                let p = this.getPos(v2(i, j));
                p.z -= j*this.disHuman*0.1 + i * this.disHuman * 0.1/this.humanSize.x;
                human.node.position = p;
                human.node._objFlags = CCObject.Flags.DontSave 
                // | CCObject.Flags.HideInHierarchy;
                this.humans.push(human);
                if(!this.colorHumans[human.color]) {
                    this.colorHumans[human.color] = [];
                }
                this.colorHumans[human.color].push(human);
                if(!this.humanMatrix[i]) {
                    this.humanMatrix[i] = [];
                }
                this.humanMatrix[i][j] = human;
            }
        }
        hs.forEach(h => h.node.destroy());
        
    }


    // ---- Thứ tự row cho SpawnMode.Data ----

    // Mỗi phần tử trong `data` (LinearHumanData) giờ đại diện màu của CẢ 1 ROW (humanPerRow
    // người), không còn phải gom các phần tử cùng màu liền kề như trước — data giữ nguyên giá
    // trị/độ dài, chỉ khi áp dụng (spawn) mới nhân lên humanPerRow người mỗi entry.
    // Sắp lại thứ tự row: màu 0,1,...,n xoay vòng, mỗi màu rowsPerColor row liên tiếp. Giữ nguyên
    // số row của từng màu (phải khớp số ghế xe màu đó) — màu nào hết thì bỏ qua, lượt sau vẫn
    // đi tiếp các màu còn lại; phần lẻ (< rowsPerColor) của 1 màu được xếp nốt ở lượt cuối của nó.
    // Mỗi row = humanPerRow người, mỗi ghế xe (bus.seats) = humanPerRow người → số row màu c phải
    // đúng bằng tổng số ghế các xe màu c. Thừa là người không có xe lên, cứ chạy vòng trên ring
    // làm ring kín → thua chắc; thiếu là xe không bao giờ đầy → không thắng được. Cắt bớt row
    // thừa (giữ thứ tự) và bù row thiếu vào cuối để data luôn khớp với xe đang có.
    // Sắp row theo thứ tự xe MỞ ĐƯỢC: giả lập người chơi luôn chạm 1 xe không bị chặn
    // (ObstacleData[i] = các xe đang chặn xe i), ưu tiên màu lâu chưa dùng cho đa dạng. Row của
    // xe thứ k chỉ tới sau khi các xe trước nó đã có thể chạm → luôn có đường thắng. Tối đa
    // busOrderWindow xe xen kẽ cùng lúc, mỗi lượt rowsPerColor row → vẫn thành từng khối màu.
    orderRowsByBuses(): ColorType[] {
        let n = this.buses.length;
        let removed = new Set<number>();
        let lastUsed = new Map<ColorType, number>();
        let sequence: Bus[] = [];
        for(let step = 0; step < n; step++) {
            let free: number[] = [];
            for(let i = 0; i < n; i++) {
                if(removed.has(i)) continue;
                if((ObstacleData[i] || []).every(j => removed.has(j) || j >= n)) free.push(i);
            }
            // Đồ thị lỗi (vòng chặn nhau) thì lấy đại xe còn lại để không kẹt.
            if(free.length == 0) {
                for(let i = 0; i < n; i++) if(!removed.has(i)) free.push(i);
            }
            free.sort((a, b) => (lastUsed.get(this.buses[a].color) ?? -1) - (lastUsed.get(this.buses[b].color) ?? -1) || a - b);
            let pick = free[0];
            removed.add(pick);
            lastUsed.set(this.buses[pick].color, step);
            sequence.push(this.buses[pick]);
        }

        let block = Math.max(1, this.rowsPerColor);
        let window = Math.max(1, this.busOrderWindow);
        let active: { color: ColorType, left: number }[] = [];
        let result: ColorType[] = [];
        let next = 0;
        while(next < sequence.length || active.length > 0) {
            while(active.length < window && next < sequence.length) {
                let b = sequence[next++];
                active.push({ color: b.color, left: b.seats.length });
            }
            let turn = [...active];
            turn.forEach(a => {
                let k = Math.min(block, a.left);
                for(let i = 0; i < k; i++) result.push(a.color);
                a.left -= k;
            });
            active = active.filter(a => a.left > 0);
        }
        return result;
    }

    fitRowsToBuses(data: ColorType[]): ColorType[] {
        let need = new Map<ColorType, number>();
        this.buses.forEach(b => need.set(b.color, (need.get(b.color) || 0) + b.seats.length));
        let result: ColorType[] = [];
        let used = new Map<ColorType, number>();
        data.forEach(c => {
            let u = used.get(c) || 0;
            if(u < (need.get(c) || 0)) {
                result.push(c);
                used.set(c, u + 1);
            }
        });
        need.forEach((n, c) => {
            for(let i = used.get(c) || 0; i < n; i++) result.push(c);
        });
        if(result.length != data.length) {
            console.warn("Human rows không khớp sức chứa xe:", data.length, "->", result.length);
        }
        return result;
    }

    loopRowColors(data: ColorType[]): ColorType[] {
        if(this.rowsPerColor <= 0) return [...data];
        let remain = new Map<ColorType, number>();
        data.forEach(c => remain.set(c, (remain.get(c) || 0) + 1));
        let order = Array.from(remain.keys()).sort((a, b) => a - b);
        let result: ColorType[] = [];
        while(result.length < data.length) {
            order.forEach(c => {
                let n = Math.min(this.rowsPerColor, remain.get(c));
                for(let i = 0; i < n; i++) result.push(c);
                remain.set(c, remain.get(c) - n);
            });
        }
        return result;
    }

    // Thứ tự row cho SpawnMode.Data: khớp sức chứa xe rồi sắp theo rowOrder
    initRowData() {
        let rows = this.fitRowsToBuses(LinearHumanData);
        if(this.rowOrder == RowOrder.LoopColors) rows = this.loopRowColors(rows);
        else if(this.rowOrder == RowOrder.BusOrder) rows = this.orderRowsByBuses();
        this.data = rows;
    }

    // ---- Ring xoắn ốc (Line3DRing) ----
    // Đường mở: row chạy từ đầu vào tới cuối đường, thu nhỏ rồi hiện lại ở đầu vào. Ring chia thành các ô
    // cách nhau ringRowSpacing, mỗi ô 1 row humanPerRow người đứng ngang cùng màu. Ô trống đi qua đầu vào
    // thì sinh row mới theo màu của ô (người vô hạn). Row đi qua lối ra mà cùng màu xe trong slot thì lên xe.

    ringContainer: Node = null;
    ringSlots: RingRow[] = [];
    // màu của từng ô (giữ cả khi ô trống) để cụm màu liền nhau không bị vỡ khi lấp lại
    ringSlotColors: number[] = [];
    // chiều dài 1 vòng = số ô * khoảng cách row
    ringLoop: number = 0;
    // quãng đường đã chạy, tăng dần theo ringSpeed — vị trí mỗi ô tính tuyệt đối từ index + giá trị này
    ringProgress: number = 0;
    ringScale: number = 1;
    // lối ra [đầu, cuối] tính theo quãng đường trên Line3DRing, null = không có
    ringExit: number[] = null;
    // scale gốc của từng người trên ring (fade nhân vào đây)
    humanBaseScale = new Map<Human, number>();
    // editor: hẹn giờ xếp lại người sau khi Line3DRing dựng lại (0 = không có)
    ringRelayoutTimer = 0;

    ringMode() {
        return !!this.line3DRing?.isValid && this.line3DRing.enabledInHierarchy;
    }

    initRing() {
        this.ringSlots = [];
        this.ringSlotColors = [];
        this.humans = [];
        this.colorHumans = [];
        this.humanBaseScale.clear();
        if(!this.ringMode()) return;
        const road = this.line3DRing;
        // bề ngang đường = đúng 1 hàng humanPerRow người (mỗi người chiếm ringLaneGap) + 2 gờ
        road.width = this.humanPerRow * this.ringLaneGap + 2 * road.rimWidth;
        road.rebuild();
        if(road.totalLength <= 0) return;
        let c = road.node.getChildByName("RingHumans");
        if(!c) {
            c = new Node("RingHumans");
            c.parent = road.node;
        }
        c._objFlags = CCObject.Flags.DontSave;
        c.children.slice().forEach(n => n.destroy());
        c.setPosition(0, 0, 0);
        c.setRotation(0, 0, 0, 1);
        // người trên ring cùng cỡ thế giới với người ở node Human (chỗ đi ra xe)
        this.ringScale = this.human.worldScale.x / road.node.worldScale.x * this.ringHumanScale;
        c.setScale(this.ringScale, this.ringScale, this.ringScale);
        this.ringContainer = c;
        if(EDITOR_NOT_IN_PREVIEW) {
            road.node.off(Line3DRing.REBUILT, this.onRingRebuilt, this);
            road.node.on(Line3DRing.REBUILT, this.onRingRebuilt, this);
        }

        const sp = Math.max(0.05, this.ringRowSpacing);
        const count = Math.max(1, Math.floor(road.totalLength / sp));
        this.ringLoop = count * sp;
        this.ringProgress = 0;
        this.ringSlots = Array(count).fill(null);
        this.ringSlotColors = Array(count).fill(-1);
        this.ringExit = road.getExitRange();

        this.resetSpawnSequence();
        // đổ sẵn từ ô gần cuối đường trở về đầu -> những màu chọn trước nằm gần lối ra hơn
        let fill = Math.round(count * Math.max(0, Math.min(1, this.ringPrefill)));
        for(let i = count - 1; i >= 0 && fill > 0; i--, fill--) {
            let row = this.spawnRingRow(i);
            if(!row) break;
            this.ringSlotColors[i] = row.color;
        }
        // đổ sẵn đi từ ô cuối về ô 0 -> cụm dở dang nằm ở ô 0
        this.fixShortRuns(0);
        this.updateRing(0);
    }

    // sinh 1 row mới ở ô i của ring, màu color (mặc định lấy màu kế tiếp trong chuỗi)
    spawnRingRow(i: number, color: number = undefined): RingRow {
        if(color === undefined) color = this.nextRowColor();
        if(color === undefined) return null;
        let row = new RingRow();
        row.color = color;
        row.slotIndex = i;
        for(let k = 0; k < this.humanPerRow; k++) {
            let h = this.spawnRingHuman(color);
            if(!h) break;
            h.row = row;
            row.humans.push(h);
            row.lanes.push(k);
        }
        this.ringSlots[i] = row;
        return row;
    }

    // 1 người mới trên ring (màu color), chưa gắn vào row
    spawnRingHuman(color: number): Human {
        let h = pm.spawnType<Human>(PoolType.Human);
        if(!h) return null;
        h.init(color, v2(), 0);
        h.node.parent = this.ringContainer;
        h.node._objFlags = CCObject.Flags.DontSave;
        this.humanBaseScale.set(h, h.node.scale.x);
        this.showHuman(h);
        h.setMoving(!EDITOR_NOT_IN_PREVIEW);
        this.humans.push(h);
        (this.colorHumans[color] = this.colorHumans[color] || []).push(h);
        return h;
    }

    showHuman(h: Human) {
        if(this.human2D) {
            h.sprite.node.active = true;
        } else {
            h.shadow.node.active = true;
            h.anim.node.active = true;
        }
    }

    // bỏ người khỏi danh sách humans / colorHumans
    dropHuman(h: Human) {
        let i = this.humans.indexOf(h);
        if(i >= 0) this.humans.splice(i, 1);
        let list = this.colorHumans[h.color];
        if(list && list.indexOf(h) >= 0) list.splice(list.indexOf(h), 1);
    }

    setHumanColor(h: Human, c: number) {
        if(!h?.isValid || h.color == c) return;
        let list = this.colorHumans[h.color];
        if(list && list.indexOf(h) >= 0) list.splice(list.indexOf(h), 1);
        h.color = c;
        (this.colorHumans[c] = this.colorHumans[c] || []).push(h);
    }

    // row bị xe lấy dở (xe còn ít chỗ hơn 1 row) -> lúc quay vòng qua đầu vào thì bù đủ người vào các làn trống
    topUpRingRow(row: RingRow) {
        for(let lane = 0; lane < this.humanPerRow && row.humans.length < this.humanPerRow; lane++) {
            if(row.lanes.includes(lane)) continue;
            let h = this.spawnRingHuman(row.color);
            if(!h) break;
            h.node.setScale(0, 0, 0);
            h.row = row;
            row.humans.push(h);
            row.lanes.push(lane);
        }
    }

    // ---- màu row theo màu xe ----

    // ColorLoop: màu của cụm row đang phát và số row còn lại của cụm
    loopColor: number = -1;
    loopRowsLeft: number = 0;

    // màu cho 1 row mới: Data = lấy lần lượt trong data (hết thì lấp theo fillMode), ColorLoop = theo màu các xe
    nextRowColor(): number {
        if(this.spawnMode == SpawnMode.ColorLoop) return this.nextLoopColor();
        let c = this.data.shift();
        if(c === undefined) c = this.fillColor();
        return c;
    }

    // bắt đầu lại chuỗi màu ColorLoop từ đầu
    resetSpawnSequence() {
        this.loopColor = -1;
        this.loopRowsLeft = 0;
    }

    // mọi xe chưa chạy khỏi map: còn ở bãi (this.buses) + đang chạy vào / đỗ ở slot (bị bỏ khỏi this.buses lúc rời bãi)
    activeBuses(): Bus[] {
        let list = this.buses.filter(b => b?.isValid);
        this.slots.forEach(s => { let b = s.bus; if(b?.isValid && !list.includes(b)) list.push(b); });
        return list;
    }

    // các màu xe có trong màn (theo BusData, dùng được cả lúc xe chưa dựng)
    levelColors(): number[] {
        return Array.from(new Set(BusData.map(d => d[1] as number)));
    }

    // màu cho 1 row mới theo ColorLoop: hết cụm (hoặc màu không còn xe nhận) thì sang màu kế tiếp
    // trong các màu xe (tăng dần theo index màu), qua màu lớn nhất thì vòng về màu nhỏ nhất
    nextLoopColor(): number {
        // recolorFinished tắt: quay đều mọi màu có trong màn (kể cả màu đã hết xe)
        let colors = this.recolorFinished
            ? Array.from(new Set(this.activeBuses().filter(b => b.remain > 0).map(b => b.color as number)))
            : this.levelColors();
        // lúc dựng ring đầu tiên xe có thể chưa có remain -> lấy màu từ BusData
        if(!colors.length) colors = this.levelColors();
        if(!colors.length) return undefined;
        colors.sort((a, b) => a - b);
        if(this.loopRowsLeft <= 0 || !colors.includes(this.loopColor)) {
            this.loopColor = colors.find(c => c > this.loopColor) ?? colors[0];
            let lo = Math.max(1, Math.round(this.loopRowsMin));
            let hi = Math.max(lo, Math.round(this.loopRowsMax));
            this.loopRowsLeft = lo + Math.floor(Math.random() * (hi - lo + 1));
        }
        this.loopRowsLeft--;
        return this.loopColor;
    }

    // màu của row lấp chỗ trống theo fillMode (người dư, không tính vào sức chứa xe)
    fillColor(): number {
        if(this.fillMode == FillMode.None) return undefined;
        let list = this.fillMode == FillMode.WinColors
            ? Array.from(new Set(this.activeBuses().filter(b => b.remain > 0).map(b => b.color as number)))
            : this.levelColors();
        if(!list.length) return undefined;
        return list[(Math.random() * list.length) | 0];
    }

    // màu xe còn chờ người lúc lần trước đổi màu cụm chết (đổi khác thì mới quét lại)
    ringNeedKey: string = '';

    // ColorLoop + recolorFinished: màu nào không còn xe cần thì đổi NGAY cả cụm ô liền nhau mang màu đó (kể cả
    // các row đang chạy trên đó) sang màu kế tiếp còn cần, để gần cuối màn không thành mỗi row 1 màu
    recolorDeadClusters() {
        if(this.spawnMode != SpawnMode.ColorLoop || !this.ringSlots.length) return;
        let need = new Set(this.activeBuses().filter(b => b.remain > 0).map(b => b.color as number));
        let key = [...need].sort((a, b) => a - b).join(',');
        if(key == this.ringNeedKey) return;
        this.ringNeedKey = key;
        if(!need.size) return;
        let n = this.ringSlots.length;
        let colors = this.ringSlotColors;
        // bắt đầu quét ở chỗ đổi màu để không cắt đôi 1 cụm nằm vắt qua ô 0
        let start = 0;
        while(start < n && colors[start] == colors[(start - 1 + n) % n]) start++;
        if(start >= n) start = 0;
        for(let k = 0; k < n; ) {
            let i = (start + k) % n;
            let old = colors[i];
            let len = 1;
            while(len < n - k && colors[(i + len) % n] == old) len++;
            if(old < 0 || !need.has(old)) {
                this.loopRowsLeft = 0;
                let c = this.nextLoopColor();
                this.loopRowsLeft = 0;
                if(c === undefined) return;
                for(let j = 0; j < len; j++) colors[(i + j) % n] = c;
            }
            k += len;
        }
        // row đang chạy mang màu chết -> tô lại theo màu mới của ô
        this.ringSlots.forEach((row, i) => {
            if(!row || need.has(row.color) || colors[i] < 0) return;
            this.recolorRow(row, colors[i]);
        });
    }

    // Số ô trên ring thường không chia hết cho số row mỗi cụm nên chỗ nối vòng còn 1 cụm ngắn lẻ màu.
    // Ưu tiên gộp cụm lẻ nếu tổng không vượt loopRowsMax; nếu vượt thì mượn row từ cụm kế bên.
    // Trước đây luôn gộp cả cụm nên một cụm 6..10 row có thể bị cộng thêm phần lẻ và dài hơn max.
    fixShortRuns(slot: number) {
        if(this.spawnMode != SpawnMode.ColorLoop) return;
        let cols = this.ringSlotColors, n = cols.length;
        if(!n || cols.some(c => c < 0)) return;
        let min = Math.max(1, Math.round(this.loopRowsMin));
        let max = Math.max(min, Math.round(this.loopRowsMax));
        let start = 0;
        while(start < n && cols[start] == cols[(start - 1 + n) % n]) start++;
        if(start >= n) return;
        let runs: number[][] = [];
        for(let k = 0; k < n; ) {
            let i = (start + k) % n, len = 1;
            while(len < n - k && cols[(i + len) % n] == cols[i]) len++;
            runs.push([i, len]);
            k += len;
        }
        if(runs.length < 2) return;
        for(let r = 0; r < runs.length; r++) {
            let [i, len] = runs[r];
            if(len >= min) continue;
            if(((slot - i) % n + n) % n >= len) continue;
            let old = cols[i];
            // Chọn cụm nằm cạnh thật trên đường: ô 0 và ô n-1 chỉ liền nhau qua chỗ dịch chuyển cuối -> đầu đường.
            let touches0 = ((0 - i) % n + n) % n < len;
            let nb = touches0 ? runs[(r + 1) % runs.length] : runs[(r - 1 + runs.length) % runs.length];
            let [nbStart, nbLen] = nb;
            let paint = (s: number, c: number) => {
                cols[s] = c;
                let row = this.ringSlots[s];
                if(row && row.color != c) this.recolorRow(row, c);
            };
            if(len + nbLen <= max) {
                // Gộp vẫn nằm trong giới hạn max.
                let c = cols[nbStart];
                for(let j = 0; j < len; j++) paint((i + j) % n, c);
            } else {
                // Giữ thành hai cụm và chuyển vừa đủ row ở biên. Không làm cụm bên cạnh ngắn hơn min.
                let take = Math.min(min - len, Math.max(0, nbLen - min));
                for(let j = 0; j < take; j++) {
                    let s = touches0 ? (nbStart + j) % n : (nbStart + nbLen - take + j) % n;
                    paint(s, old);
                }
            }
            return;
        }
    }

    recolorRow(row: RingRow, c: number) {
        row.humans.forEach(h => this.setHumanColor(h, c));
        row.color = c;
    }

    // bỏ hẳn 1 row trên ring (trả người về pool)
    removeRingRow(i: number) {
        let row = this.ringSlots[i];
        if(!row) return;
        row.humans.forEach(h => {
            if(!h?.isValid) return;
            this.dropHuman(h);
            this.humanBaseScale.delete(h);
            h.row = null;
            pm.despawn(h);
        });
        row.slotIndex = -1;
        this.ringSlots[i] = null;
    }

    // màu cho ô i đang trống đi qua đầu vào: giữ màu cũ của ô nếu còn xe cần màu đó (hoặc recolorFinished tắt);
    // không thì lấy màu kế tiếp và đổi luôn cả cụm ô liền nhau đang mang màu cũ -> cụm vẫn liền 1 màu
    ringRefillColor(i: number): number {
        if(this.spawnMode != SpawnMode.ColorLoop) return this.nextRowColor();
        let need = new Set(this.activeBuses().filter(b => b.remain > 0).map(b => b.color as number));
        let old = this.ringSlotColors[i];
        if(old >= 0 && (need.has(old) || !this.recolorFinished)) return old;
        let c = this.nextLoopColor();
        if(c === undefined) return undefined;
        this.ringSlotColors[i] = c;
        if(old >= 0) {
            let n = this.ringSlots.length;
            for(const step of [1, -1]) {
                for(let k = 1, j = (i + step + n) % n; k < n && this.ringSlotColors[j] == old; k++, j = (j + step + n) % n) {
                    this.ringSlotColors[j] = c;
                }
            }
            // cụm cũ đã đổi sang màu này -> lần sau lấy màu khác
            this.loopRowsLeft = 0;
        }
        // ô cuối cùng vừa có màu (prefill < 1) -> sửa cụm lẻ ở chỗ nối vòng
        if(old < 0 && !this.ringSlotColors.some(v => v < 0)) this.fixShortRuns(i);
        return this.ringSlotColors[i];
    }

    // đổi quãng đường tính theo chiều chạy (0 = đầu vào) sang quãng đường trên Line3DRing (0 = point 0)
    ringPathDis(d: number) {
        return this.ringReverse ? this.line3DRing.totalLength - d : d;
    }

    // quãng đường đã chạy (local Line3DRing, 0 = đầu vào) của ô i lúc này
    ringSlotDis(i: number) {
        let sp = this.ringLoop / this.ringSlots.length;
        let d = ((i * sp + this.ringProgress) % this.ringLoop + this.ringLoop) % this.ringLoop;
        return d * this.line3DRing.totalLength / this.ringLoop;
    }

    updateRing(dt: number) {
        if(!this.ringSlots.length || !this.ringContainer?.isValid) return;
        const road = this.line3DRing;
        const total = road.totalLength;
        const n = this.humanPerRow;
        const sp = total / this.ringSlots.length;
        this.ringProgress = (this.ringProgress + dt * this.ringSpeed) % this.ringLoop;
        const k = this.ringScale;
        if(dt > 0 && !this.lose && this.recolorFinished) this.recolorDeadClusters();
        this.ringSlots.forEach((row, i) => {
            let d = this.ringSlotDis(i);
            if(!row) {
                // ô trống vừa đi qua đầu vào -> sinh row mới theo màu của ô (người vô hạn), hiện dần như row vừa quay vòng
                if(dt > 0 && d < sp && !this.lose) {
                    let c = this.ringRefillColor(i);
                    let fresh = c === undefined ? null : this.spawnRingRow(i, c);
                    if(fresh) {
                        fresh.wrapped = true;
                        fresh.humans.forEach(h => h.node.setScale(0, 0, 0));
                        this.ringSlotColors[i] = fresh.color;
                    }
                }
                return;
            }
            if(row.lastDis >= 0 && d < row.lastDis - total * 0.5) {
                row.wrapped = true;
                if(dt > 0 && row.humans.length < n) this.topUpRingRow(row);
                // màu không còn xe nào cần -> bỏ row ở cuối đường thay vì quay vòng chiếm chỗ mãi (ô trống sẽ được lấp màu mới)
                if(dt > 0 && this.recolorFinished && this.spawnMode == SpawnMode.ColorLoop
                && !this.activeBuses().some(b => b.remain > 0 && b.color == row.color)) {
                    this.removeRingRow(i);
                    return;
                }
            }
            if(row.wrapped && d > this.ringFade) row.wrapped = false;
            row.lastDis = d;
            let pose = road.getLocalPose(this.ringPathDis(d));
            let ahead = road.getLocalPose(this.ringPathDis(Math.min(total, d + 0.05)));
            let dir = ahead.pos.subtract(pose.pos);
            if(dir.lengthSqr() < 1e-8) dir = pose.tangent.clone().multiplyScalar(this.ringReverse ? -1 : 1);
            let angle = toDegree(Math.atan2(dir.y, dir.x)) - 90;
            // thu nhỏ ở cuối đường, hiện dần ở đầu vào sau khi quay vòng
            let fade = Math.min(1, (total - d) / Math.max(1e-3, this.ringFade));
            if(row.wrapped) fade = Math.min(fade, d / Math.max(1e-3, this.ringFade));
            fade = Math.max(0, fade);
            row.humans.forEach((h, j) => {
                if(!h.isValid) return;
                let off = (row.lanes[j] - (n - 1) / 2) * this.ringLaneGap;
                let target = pose.pos.clone().add(pose.side.clone().multiplyScalar(off)).multiplyScalar(1 / k);
                h.node.setPosition(target);
                h.node.eulerAngles = v3(0, 0, angle);
                let s = (this.humanBaseScale.get(h) ?? h.node.scale.x) * fade;
                h.node.setScale(s, s, s);
                if(dt <= 0) h.spin();
            });
        });
        if(dt > 0 && !this.lose) this.checkRingExit();
    }

    // row đang đi qua lối ra: cùng màu với xe trong slot còn chỗ -> rời row đi lên xe
    checkRingExit() {
        if(!this.ringExit) return;
        const [a, b] = this.ringExit;
        let buses = this.slots.map(s => s.bus).filter(bus => bus && bus.isValid && !bus.moving && bus.remain > 0);
        if(!buses.length) return;
        this.ringSlots.forEach((row, i) => {
            if(!row || !row.humans.length) return;
            let d = this.ringPathDis(this.ringSlotDis(i));
            if(d < a || d > b) return;
            let bus = buses.find(bus => bus.color == row.color && bus.remain > 0);
            if(!bus) return;
            let take = row.humans.slice(0, Math.min(bus.remain, row.humans.length));
            bus.remain -= take.length;
            take.forEach(h => {
                let s = this.humanBaseScale.get(h);
                this.humanBaseScale.delete(h);
                this.removeHuman(h);
                h.bus = bus;
                h.pTween?.stop();
                h.rTween?.stop();
                Ulis.addToParent(h.node, this.getMovingHumanRoot());
                if(s !== undefined) h.node.setScale(s, s, s);
            });
            bus.packing = true;
            bus.pHumans = bus.pHumans.concat(take);
            take.forEach(h => this.moveHuman(h, bus, true));
            if(!row.humans.length) {
                row.slotIndex = -1;
                this.ringSlots[i] = null;
            }
        });
    }

    // còn row nào trên ring cùng màu với xe đang chờ trong slot không (chưa được tính thua)
    ringCanBoard() {
        let need = new Set(this.slots.map(s => s.bus).filter(b => b && b.isValid && b.remain > 0).map(b => b.color as number));
        return this.ringSlots.some(r => r && r.humans.length && need.has(r.color));
    }

    // người trên các row sắp tới lối ra (1/4 vòng trước lối ra) — dùng cho tay hướng dẫn
    getFrontHumans(): Human[] {
        if(!this.ringExit || !this.ringSlots.length) return [];
        const [a, b] = this.ringExit;
        const reach = this.line3DRing.totalLength * 0.25;
        let humans: Human[] = [];
        this.ringSlots.forEach((row, i) => {
            if(!row) return;
            let d = this.ringPathDis(this.ringSlotDis(i));
            let near = this.ringReverse ? d >= a && d <= b + reach : d >= a - reach && d <= b;
            if(near) humans.push(...row.humans);
        });
        return humans;
    }

    printData() {        
        const sizes = [
            [0, 0, 0.4, 1],
            [0, 0, 0.4, 0.8],
            [0, 0, 0.35, 0.75],
        ];
        let splits = [10, 6, 4]
        let data = {
            data: []
        };
        this.buses.forEach(b => {
            let color = b.color;
            let rs = splitSum(b.seats.length, splits);
            // data.data.push([color, b.seats.length, rs.r]);
            let index = splits.indexOf(b.seats.length);
            if(!this.sumBus[index]) this.sumBus[index] = 0;
            this.sumBus[index] ++;
            if(!this.sumHuman[color]) this.sumHuman[color] = [color, 0, 0, 0];
            this.sumHuman[color][index + 1] ++;
        })
        this.sumHuman = this.sumHuman.filter(s => s);

        const sumHuman = this.sumHuman;
        const sumBus = this.sumBus;
        let levelData = {
            sizes, splits, sumHuman, sumBus
        }
        console.log("Human colors");
        console.log(data);
        
        

        console.log("Level Data");        
        console.log(JSON.stringify(levelData));     

    }

    // Trả về mảng phẳng ColorType, mỗi phần tử đại diện màu của 1 ROW (humanPerRow người) —
    // khớp định dạng LinearHumanData mới (buildRowChunks không còn gom nhóm nữa, 1 entry = 1 row).
    // Mỗi xe giờ cần seats.length * humanPerRow người (Bus.totalSeats) nên đúng seats.length
    // row-entry là đủ (1 row-entry = humanPerRow người), không cần chia/dư như trước nữa.
    getHumanDataFromBuses(): ColorType[] {
        let data: ColorType[] = [];
        this.buses.forEach(b => {
            for(let i = 0; i < b.seats.length; i++) {
                data.push(b.color);
            }
        })
        // 1 entry = 1 row = humanPerRow người = đúng 1 ghế, không nhân thêm (trước nhân 4 → thừa
        // gấp 4 số người xe chở được).
        return Ulis.shuffleArray(data);
    }

    // người rời ring đi lên xe: bỏ khỏi danh sách + khỏi row (kèm làn của nó)
    removeHuman(human: Human) {
        this.dropHuman(human);

        let row: RingRow = human.row;
        if(row) {
            let j = row.humans.indexOf(human);
            if(j >= 0) {
                row.humans.splice(j, 1);
                row.lanes.splice(j, 1);
            }
        }
        human.row = null;

        this.movingHumans.push(human);
    }

    getHumansAround(human: Human) {
        return getNeightbors(human.index, this.humanSize).map(v => this.iHuman(v)).filter(h => h);
    }

    getOutside(human: Human, available: Human[]) {
        let neighbors = this.getOutsideHuman(human, available);
        let n = neighbors[0];
        if(n) {
            available.push(n);
            return this.getOutside(n, available);
        } else {
            return available;
        }
    }

    getOutsideHuman(human: Human, available: Human[]) {
        let neighbors = this.getHumansAround(human);
        neighbors = neighbors.filter(h => !available.includes(h)).filter(h => {
            let n = this.getHumansAround(h);
            if(!h.cachedPath && human.cachedPath) {
                h.cachedPath = [human.index.clone() ,...human.cachedPath]
            }
            return n.length < 4;
        })
        return neighbors;
    }
    
    initPaths() {
        

        let iSize = this.humanSize.clone().add(v2(2, 2));
        let empties = this.empties.map(v => v.add(v2(1, 1)))
        let sides: Vec2[] = [];
        for (let i = 0; i < iSize.x; i++) {
            sides.push(v2(i, 0), v2(i, iSize.y - 1));
        }
        for (let i = 1; i < iSize.y - 1; i++) {
            sides.push(v2(0, i), v2(iSize.x - 1, i));  
        }
        let dest = v2(Math.floor(iSize.x / 2));
        empties.push(...sides);
        let paths: any = [];
        this.outsideHumans.forEach((h, i) => {
            let s = h.index.clone().add2f(1, 1);
            let e = [...empties, s];
            let astar = new AStar(e);
            h.cachedPath = Ulis.simplifyPath(astar.find(s, dest)).map(v => v.clone().add2f(-1, -1));
            paths.push([h.index.x, h.index.y, h.cachedPath.map(v => [v.x, v.y])]);
        })

        console.log("Human Data");        
        console.log(JSON.stringify(this.data));

        console.log("Cached paths");        
        console.log(JSON.stringify(paths));

    }

    debugPos(index: Vec2) {
        let human = pm.spawnType<Human>(PoolType.Human);
        let iColor = ColorType.White;
        human.init(iColor, v2());
        human.node.parent = this.human;
        human.node.position = this.getPos(index);
        // human.node.worldPosition = this.getWPos(index);
        human.node._objFlags = CCObject.Flags.DontSave 
        | CCObject.Flags.HideInHierarchy;
    }

    getPos(index: Vec2) {
        let dt = this.validOffset();
        // let mul = 1;
        // if(index.x < 0) {
        //     index.x -= mul;
        // }
        // if(index.x >= this.humanSize.x) {
        //     index.x += mul;
        // }
        // if(index.y < 0) {
        //     index.y -= mul;
        // }
        // if(index.y >= this.humanSize.y) {
        //     index.y += mul;
        // }
        let x = index.x;
        if(x < 0) {
            x = -2;
        } else if (x > this.humanSize.x - 1) {
            x = this.humanSize.x + 1;
        }
        let y = index.y;
        if(y < 0) {
            y = -2;
        }
        let rs = v3(dt.x + x, dt.y + y).multiply3f(this.humanDis.x, this.humanDis.y, 1);
        return rs;
    }
    getWPos(index: Vec2) {
        let lpos = this.getPos(index);
        return Ulis.getWpos(lpos, this.human);
    }

    angleMode: number = 0;
    
    initTouch() {
        this.touchNode = this.touch.getComponentInChildren(Sprite).node;
        this.touchNode.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
        if(this.tool) {
            input.on(Input.EventType.KEY_DOWN, (event: EventKeyboard) => {
                if(event.keyCode == KeyCode.KEY_A) {
                    this.angleMode ++; 
                    if(this.angleMode > 2) this.angleMode = 0;
                    console.log("Angle mode", this.angleMode);
                    
                } else if(event.keyCode == KeyCode.SPACE) {
                    this.saveBusData = true;
                }
            });
        }
    }

    offTouch() {
        this.touchNode.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
    }

    onTouchStart(event: EventTouch) {
        let pos = event.getLocation();

        let rayOrigin: Vec3 = ui.wCamera.screenToWorld(v3(pos.x, pos.y, 0));
        let rayDir: Vec3 = ui.wCamera.node.forward.clone().normalize();
        let planePoint: Vec3 = this.bound.node.getWorldPosition();
        let planeNormal: Vec3 = this.bound.node.forward.clone().normalize();
        
        const invRot = this.bound.node.getWorldRotation();
        let rs = Ulis.rayPlane(rayOrigin, rayDir, planePoint, planeNormal);

        rs = this.bound.node.inverseTransformPoint(v3(), rs);

        let box = this.buses.find(b => {

            let bUp = b.node.up.clone();
            bUp = Vec3.transformQuat(v3(), bUp, invRot);

            let angle = -Math.atan2(bUp.x, bUp.y);
            angle = toDegree(angle);

            let ws = this.bound.node.getWorldScale();

            let r = b.getRect3();
            let ct = v3(r.x + r.width/2, r.y + r.height/2, r.z + r.depth/2);
            let sz = v3(r.width, r.height, r.depth);
            ct = this.bound.node.inverseTransformPoint(v3(), ct);
            sz = sz.multiply3f(1/ws.x, 1/ws.y, 1/ws.z);            
            let rt = rect(ct.x - sz.x/2, ct.y - sz.y/2, sz.x, sz.y);

            return Ulis.pointRect(v2(rs.x, rs.y), rt, angle);
        });

        if(box && !box.moving) {
            // console.log(box.node.name);            
            this.onBox(box);
        }      
        this.firstMove();  
    }

    onTool(bus: Bus) {
        if(this.angleMode == 0) {
            bus.angle180 = true;
        } else if(this.angleMode == 1) {
            bus.angle90 = true;
        } else if(this.angleMode == 2) {
            bus.noramlAngle = true;
        }
    }

    // silent: chỉ tính box.obstascles (dùng khi Save Bus Data) — không xoay xe tool, không phát tiếng.
    onBox(box: Bus, silent: boolean = false) {

        if(this.tool && !silent) {
            this.onTool(box);
            return;
        }


        if(!silent) sm?.playSound(SoundType.Click);
        let nearest: Vec2 = null;
        let rootNearest: Vec2 = null;
        let points: Vec3[] = [];

        let root = box.node.getWorldPosition();

        let rect3 = box.getRect3();
        let normal = box.node.right.clone().normalize();
        let rootLeft = root.clone().add(normal.clone().negative().multiplyScalar(rect3.width * 0.4));
        let rootRight = root.clone().add(normal.clone().multiplyScalar(rect3.width * 0.4));
        
        rootLeft = this.bound.node.inverseTransformPoint(v3(), rootLeft);
        rootRight = this.bound.node.inverseTransformPoint(v3(), rootRight);
        
        let up = box.node.up.clone().normalize();
        const invRot = this.bound.node.getWorldRotation();
        Quat.invert(invRot, invRot);
        up = Vec3.transformQuat(v3(), up, invRot);

        let buses = this.buses.filter(b => b != box);
        let z: Number[] = [];
        let index = 0;
        buses.forEach((b, i) => {

            let iBus = buses[i];

            // let wrot = bus.node.getWorldRotation();
            // const parentRot = this.bound.node.worldRotation.clone();
            // Quat.invert(parentRot, parentRot);

            // const localRot = new Quat();
            // Quat.multiply(localRot, parentRot, wrot);

            let bUp = iBus.node.up.clone();
            bUp = Vec3.transformQuat(v3(), bUp, invRot);

            let angle = -Math.atan2(bUp.x, bUp.y);
            angle = toDegree(angle);
            z.push(angle);

            let ws = this.bound.node.getWorldScale();

            let r = b.getRect3();
            let ct = v3(r.x + r.width/2, r.y + r.height/2, r.z + r.depth/2);
            let sz = v3(r.width, r.height, r.depth);
            ct = this.bound.node.inverseTransformPoint(v3(), ct);
            sz = sz.multiply3f(1/ws.x, 1/ws.y, 1/ws.z);            
            let rt = rect(ct.x - sz.x/2, ct.y - sz.y/2, sz.x, sz.y);

            let pLeft = Ulis.rayRectPoint(v2(rootLeft.x, rootLeft.y), v2(up.x, up.y), rt, angle);
            let pRight = Ulis.rayRectPoint(v2(rootRight.x, rootRight.y), v2(up.x, up.y), rt, angle);

            if (pLeft) {
                points.push(ct);
                if (!nearest) {
                    nearest = pLeft;
                    rootNearest = v2(rootLeft.x, rootLeft.y);
                    index = i;
                } else {
                    let d1 = Vec2.distance(pLeft, v2(rootLeft.x, rootLeft.y));
                    let d2 = Vec2.distance(nearest, rootNearest);
                    if (d1 < d2) {
                        nearest = pLeft;
                        rootNearest = v2(rootLeft.x, rootLeft.y);
                        index = i;
                    }
                }
            }

            if (pRight) {
                points.push(ct);
                if (!nearest) {
                    nearest = pRight;
                    rootNearest = v2(rootRight.x, rootRight.y);
                    index = i;
                } else {
                    let d1 = Vec2.distance(pRight, v2(rootRight.x, rootRight.y));
                    let d2 = Vec2.distance(nearest, rootNearest);
                    if (d1 < d2) {
                        nearest = pRight;
                        rootNearest = v2(rootRight.x, rootRight.y);
                        index = i;
                    }
                }
            }

            if(pLeft || pRight) {
                if(!box.obstascles.includes(iBus.node)) box.obstascles.push(iBus.node);
            }
        });       
    
        if(EDITOR_NOT_IN_PREVIEW || silent) return;


        if(points.length == 0) {
            let slot = this.slots.find(s => !s.bus);
            if(slot) {
                box.setSlot(slot);
                this.onMove(box);                
            } else {
                box.onNoSlot();
                // sm.playSound(SoundType.Collide);
            }
        } else {
            let obstacle = buses[index];
            let n3 = v3(nearest.x, nearest.y, 0);
            let r3 = v3(rootNearest.x, rootNearest.y, 0);

            n3 = Ulis.getWpos(n3, this.bound.node);
            r3 = Ulis.getWpos(r3, this.bound.node);

            this.onObstacle(box, obstacle, n3, r3);
        }
    }

    onMove(box: Bus) {
        box.blockeds.forEach(b => {
            if(!b) return;
            try {
                let bus = b.getComponent(Bus);
                if(bus) bus.obstascles.splice(bus.obstascles.indexOf(box.node), 1);                
            } catch (error) {
                console.log(error);                
            }
        })
        box.blockeds = [];
        this.onTutBus(box);
        let nearest: Vec3 = null;
        let rootNearest: Vec3 = null;
        let points: Vec3[] = [];

        let up = box.node.up.clone().normalize();
        let root = box.node.getWorldPosition();
        root = this.bound.node.inverseTransformPoint(v3(), root);
        const invRot = this.bound.node.getWorldRotation();
        Quat.invert(invRot, invRot);
        up = Vec3.transformQuat(v3(), up, invRot);
        
        let ps = [...this.bound.points];
        let node: Node = null;
        let node2: Node = null;
        let top: boolean = false;
        this.bound.points.forEach((o, i) => {
            let next = ps[(i + 1) % ps.length];
            let p0 = o.getWorldPosition();
            let p1 = next.getWorldPosition();

            p0 = this.bound.node.inverseTransformPoint(v3(), p0);
            p1 = this.bound.node.inverseTransformPoint(v3(), p1);

            let pt = Ulis.rayLinePoint(v2(root.x, root.y), v2(up.x, up.y), 
            v2(p0.x, p0.y), v2(p1.x, p1.y));

            if(pt) {
                let point = v3(pt.x, pt.y, 0);
                points.push(point);
                if(!nearest) {
                    nearest = point;
                    rootNearest = root;

                    // p0 or p1 nearer to nearest
                    let n0 = p0.clone().subtract(nearest).length();
                    let n1 = p1.clone().subtract(nearest).length();
                    node = n0 < n1 ? o : next;
                    node2 = n0 < n1 ? next : o;
                    top = i == ps.length - 1;

                }
                else {
                    let d1 = rootNearest.clone().subtract(nearest).length();
                    let d2 = rootNearest.clone().subtract(point).length();
                    if(d2 < d1) {
                        nearest = point;
                        rootNearest = root;

                        // p0 or p1 nearer to nearest
                        let n0 = p0.clone().subtract(nearest).length();
                        let n1 = p1.clone().subtract(nearest).length();
                        node = n0 < n1 ? o : next;
                        node2 = n0 < n1 ? next : o;
                        top = i == ps.length - 1;
                    }
                }
            }
        });

        if(points.length == 0) {
            console.log("No bound");
        } else {
            nearest = Ulis.getWpos(nearest, this.bound.node);
            this.onBound(box, nearest, node, node2, top);
        }
    }

    
    onBound(bus: Bus, nearest: Vec3, node: Node, node2: Node, top: boolean) {
        bus.moving = true;
        bus.smoking();        
        let p = [...this.bound.points];
        let index = p.indexOf(node);
        let points: Vec3[] = [];
        if(!top) {
            if(index < p.length/2) {
                let ps = p.slice(0, index + 1).reverse();
                points = ps.map(o => o.getWorldPosition());
                if(ps.includes(node2)) {
                    points.shift();
                }
            } else {
                let ps = p.slice(index);
                points = ps.map(o => o.getWorldPosition());
                if(ps.includes(node2)) {
                    points.shift();
                }
            }
        }
        points.unshift(nearest)

        let euler = bus.node.eulerAngles.clone();
        if(euler.z < 0) {
            euler.z += 360;
        }
        bus.node.eulerAngles = euler;

        let sp = this.getSlotPoint(bus.slot);
        let sl = bus.slot.node.getWorldPosition();

        bus.slotTurn = sp.clone();

        // points.push(sp);

        this.buses = this.buses.filter(b => b != bus);

        Ulis.moveToPoints(bus.node, points, () => {
            let time = Ulis.moveTo(bus.node, sp, () => {
                Ulis.moveTo(bus.node, sl, () => {
                    bus.smokint();
                    // người lên xe ở lối ra của ring (checkRingExit)
                    bus.onSlot();
                }, this.busSpeed, true, null, 0.3);
            }, this.busSpeed, true, null, 0.3);
            let paScale = this.bus.getScale();
            let mul = 1.5;
            let scale = bus.node.getScale().multiply3f(mul/paScale.x, mul/paScale.y, mul/paScale.z);
            tween(bus.node)
            .to(time * 0.2, {scale: scale})
            .start();
        }, this.busSpeed, true, null, 0.3);

    }

    getSlotPoint(slot: Slot) {
        let root = slot.node.getWorldPosition();
        let up = slot.node.up.clone().negative().normalize();
        root = this.bound.node.inverseTransformPoint(v3(), root);

        const invRot = this.bound.node.getWorldRotation();
        Quat.invert(invRot, invRot);
        up = Vec3.transformQuat(v3(), up, invRot);

        let ps = [...this.bound.points];
        let p0 = ps[0].getWorldPosition();
        let p1 = ps[ps.length - 1].getWorldPosition();

        p0 = this.bound.node.inverseTransformPoint(v3(), p0);
        p1 = this.bound.node.inverseTransformPoint(v3(), p1);

        let pt = Ulis.rayLinePoint(v2(root.x, root.y), v2(up.x, up.y), 
        v2(p0.x, p0.y), v2(p1.x, p1.y));
        
        return Ulis.getWpos(v3(pt.x, pt.y, 0), this.bound.node);
    }

    onObstacle(box: Bus, obstacle: Bus, nearest: Vec3, rootNearest: Vec3) {
        this.checkTut();
        box.moving = true;
        let dpos = box.node.getWorldPosition();
        let root = box.node.getWorldPosition();
        let dir = nearest.clone().subtract(rootNearest);
        let des = root.clone().add(dir);

        let rect3 = box.getRect3();
        des = des.add(box.node.up.negative()
        .multiplyScalar(rect3.height / 2));

        box.smoking();
        Ulis.moveTo(box.node, des, () => {
            box.shake();
            obstacle?.shake();
            this.spawnColliding(nearest);
            sm.playSound(SoundType.Collide);
            box.smokint();
            Ulis.moveTo(box.node, dpos, () => {
                box.moving = false;
            }, this.busSpeed);
        }, this.busSpeed)
    }


    spawnColliding(pos: Vec3) {
        let lpos = this.node.inverseTransformPoint(v3(), pos);
        let col = pm.spawn(PoolType.VFX);
        col.node.parent = this.node;
        col.node.position = lpos;
        let vfx = col.getComponentInChildren(ParticleSystem);
        vfx.clear();
        vfx.play();
        setTimeout(() => {
            pm.despawn(col);
        }, 2000);
    }

    checkBuses() {
        // người lên xe ở lối ra của ring (checkRingExit, gọi trong updateRing) — ở đây chỉ xét thua
        if(this.movingHumans.length == 0 && !this.slots.find(s => !s.bus)) {

            let buses = this.slots.map(s => s.bus).filter(b => b);
            let movingBus = buses.find(b => b.moving || b.packing);

            if(!movingBus && !this.lose && !this.ringCanBoard() && !this.loseCheckTween) {

                console.log("Check lose");

                this.loseCheckTween = tween({})
                .delay(3)
                .call(() => {
                    this.loseCheckTween = null;

                    if(this.movingHumans.length == 0 && !this.slots.find(s => !s.bus)) {
                        let movingBus = buses.find(b => b.moving || b.packing);
                        if(!movingBus && !this.lose && !this.ringCanBoard() && !this.loseCheckTween) {

                            AppLovinAnalytics.challengeFailed();
                            this.checkTut();
                            this.tutTween?.stop();
                            this.lose = true;
                            this.unschedule(this.checkBuses);
                            this.offTouch();
                            setTimeout(() => {
                                ui.onLose();
                            }, 500);

                        }
                    }
                })
                .start();
            }

        }
    }

    loseCheckTween: Tween<any> = null;

    // fromRing: người vừa rời lối ra của ring -> đi qua các exitPoints (nếu có) rồi vào xe
    getMovingHumanRoot(): Node {
        if(!this.movingHumanRoot?.isValid) {
            this.movingHumanRoot = new Node("MovingHumans");
            this.movingHumanRoot.parent = this.node;
            this.movingHumanRoot._objFlags = CCObject.Flags.DontSave;
        }
        // Giữ cùng hệ tọa độ/kích thước với node Human gốc, nhưng root này luôn active.
        this.movingHumanRoot.setPosition(this.human.position);
        this.movingHumanRoot.setRotation(this.human.rotation);
        this.movingHumanRoot.setScale(this.human.scale);
        this.movingHumanRoot.layer = this.human.layer;
        this.movingHumanRoot.active = true;
        return this.movingHumanRoot;
    }

    moveHuman(human: Human, bus: Bus, fromRing: boolean = false) {
        human.setMoving(true);
        // Ở ring mode, node Human gốc chỉ là template và đang inactive. Chuyển người từ
        // RingHumans sang node đó sẽ làm họ biến mất ngay khi bước ra khỏi ring. Dùng một root
        // active có cùng transform với Human để giữ nguyên cả world position lẫn kích thước.
        let movingParent = fromRing ? this.getMovingHumanRoot() : this.human;
        if(human.node.parent != movingParent) Ulis.addToParent(human.node, movingParent);
        human.node.eulerAngles = v3(0, 0, human.node.eulerAngles.z);
        let points: Vec3[] = [];
        if(fromRing) {
            this.exitPoints.forEach(n => {
                if(n?.isValid) points.push(movingParent.inverseTransformPoint(v3(), n.worldPosition));
            });
        }
        if(!points.length) {
            let p0 = this.getBusHumanPos(bus.p0, bus, human);
            let lpos = human.node.getPosition();
            lpos.y = p0.y + bus.dis * 3.1;
            points.push(lpos);
        }
        Ulis.moveToPoints(human.node, points, () => {
            this.onLastPoint(human, bus);
        }, this.humanSpeed, true, null, 1, true);
    }

    onLastPoint(human: Human, bus: Bus) {
        let sl =  0.793/ this.human.scale.x;
        let p0 = this.getBusHumanPos(bus.p0, bus, human);
        let temp = v3(p0.x, human.node.position.y, p0.z);
        Ulis.moveTo(human.node, temp, () => {            
            let time = Ulis.moveTo(human.node, p0, () => {
                
                bus.addHuman(human);
                let index = bus.humans.length-1;
                // 1 xe giờ cần tới seatPoses.length * humanPerRow người (nhiều hơn số ghế vật lý)
                // nên lặp vòng qua đúng seatPoses.length điểm ghế thay vì index thẳng (tránh undefined).
                let seat = bus.seatPoses[index % bus.seatPoses.length];
                let p1 = seat.clone();
                p1.x = bus.dis;
                p1 = this.getBusHumanPos(p1, bus, human);
                let p2 = this.getBusHumanPos(seat, bus, human);
                p2 = Vec3.lerp(v3(), p1, p2, 0.01);
                Ulis.moveToPoints(human.node, [p1, p2], () => {
                    sm.playSoundDup(SoundType.Sit);
                    human.setMoving(false);
                    let eu = human.node.eulerAngles.clone();
                    setTimeout(() => {
                        human.node.eulerAngles = eu;
                        human.spin();
                    }, 0);
                    Ulis.addToParent(human.node, bus.node);
                    // Lên xe là biến mất luôn (scale về 0), không scale to lại để "ngồi" như
                    // trước nữa — vì giờ 1 xe cần tới seatPoses.length * humanPerRow người,
                    // nhiều hơn hẳn số ghế vật lý nên không đủ chỗ hiện hết mọi người.
                    tween(human.node)
                    .to(0.1, {scale: v3()}, {
                        easing: cEasing("backIn", 1)
                    })
                    .call(() => {
                        human.moving = false;
                        this.movingHumans.splice(this.movingHumans.indexOf(human), 1);
                        bus.checkReady();
                        bus.pHumans.splice(bus.pHumans.indexOf(human), 1);
                        if(bus.pHumans.length == 0) {
                            bus.packing = false;
                        }
                    })
                    .start();
                }, this.humanSpeed, true, null, 1, true );
            }, this.humanSpeed, true, null, 1, true );
            
            let s = human.node.scale.clone();
            tween(human.node)
            .delay(time * 0.5)
            .to(time * 0.5, {scale: s.clone().multiplyScalar(sl)})
            .start();
        }, this.humanSpeed, true, null, 1, true );
    }

    getBusHumanPos(pos: Vec3, bus: Bus, human: Human) {
        let v = Ulis.getWpos(pos, bus.node);
        v = human.node.parent.inverseTransformPoint(v3(), v);
        return v;
    }

    moveBusOut(bus: Bus) {   
        bus.setSlot(null);
        let time = Ulis.moveTo(bus.node, bus.slotTurn, () => {}, this.busSpeed);    

        let angle = -90;
        let z = bus.node.eulerAngles.z;
        angle = nearestAngle(angle, z);
        
        tween(bus.node)
        .delay(time * 0.8)
        .to(time * 0.8, {eulerAngles: v3(0, 0, angle)})
        .call(() => {
            let pos = this.bound.des.getWorldPosition();
            Ulis.moveTo(bus.node, pos, () => {
                bus.onDespawn();
            }, this.busSpeed);

            if(this.progress >= 100 && this.movingHumans.length == 0) {
                ui.onWin();
            }


        })
        .start();
    }


    getBFS(founded: Vec2[] = [], unchecked: Vec2[] = [], max: number, color: ColorType) {
        if(unchecked.length == 0) return;
        if(max <= 0) return;
        let o = unchecked.shift();
        let human = this.iHuman(o);
        let neighbors = this.getHumansAround(human)
        .filter((o, i) => o.color == color &&  i < max && !founded.some(f => f.x == o.index.x && f.y == o.index.y))
        .map(o => o.index); 
        neighbors.forEach(n => {
            let h = this.iHuman(n);            
            if(!h.cachedPath && human.cachedPath) {
                h.cachedPath = [human.index.clone() ,...human.cachedPath]
            }
        });
        founded.push(...neighbors);
        unchecked.push(...neighbors);
        this.getBFS(founded, unchecked, max - neighbors.length, color);
    }

    // editor: đổi height / radius / kéo Point... -> xếp lại người khi ngừng chỉnh 150ms (xếp mỗi frame rất lag).
    // Dùng setTimeout vì scene editor không tick update liên tục khi đứng yên.
    onRingRebuilt() {
        clearTimeout(this.ringRelayoutTimer);
        this.ringRelayoutTimer = setTimeout(() => {
            this.ringRelayoutTimer = 0;
            if(!this.isValid || !this.line3DRing?.isValid) return;
            // vị trí ô tính theo tỉ lệ totalLength nên chỉ cần lấy lại lối ra rồi xếp lại theo đường mới
            this.ringExit = this.line3DRing.getExitRange();
            this.updateRing(0);
            (globalThis as any).cce?.Engine?.repaintInEditMode?.();
        }, 150) as any;
    }

    update(deltaTime: number) {
        if(!EDITOR_NOT_IN_PREVIEW) this.updateRing(deltaTime);
    }

    onDestroy() {
        clearTimeout(this.ringRelayoutTimer);
        if(this.line3DRing?.isValid) this.line3DRing.node.off(Line3DRing.REBUILT, this.onRingRebuilt, this);
    }
}


