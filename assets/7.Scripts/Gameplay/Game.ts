import { _decorator, Animation, Camera, CCInteger, CCObject, color, Color, Component, director, Enum, EventKeyboard, EventTouch, ImageAsset, Input, input, instantiate, KeyCode, Label, Layers, Mat4, Material, misc, MeshRenderer, Node, ParticleSystem, quat, Quat, rect, Sprite, SpriteFrame, sys, Texture2D, toDegree, toRadian, Tween, tween, UIOpacity, UITransform, v2, view, v3, Vec2, Vec3 } from 'cc';
import { Mats } from '../Misc/Mats';
import { Bus } from './Bus';
import { EDITOR_NOT_IN_PREVIEW,} from 'cc/env';
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
import { Line2D } from '../../Misc/Line2D/Line2D';
// Cách sắp thứ tự row người đi vào ring.
export enum RowOrder {
    Data = 0,       // giữ nguyên thứ tự LinearHumanData
    LoopColors = 1, // màu 0..7 xoay vòng, mỗi màu rowsPerColor row
    BusOrder = 2,   // theo thứ tự xe mở được (ObstacleData) — dễ thắng, luôn có cách giải
}

const { ccclass, property, executeInEditMode } = _decorator;

export var gm: Game = null;

export class HumanRow {
    node: Node = null;
    humans: Human[] = [];
    color: ColorType = ColorType.White;
    // Row trên ring: index CỐ ĐỊNH trong this.ringRows (0..ringSlotCount-1) — node/index không
    // bao giờ đổi trong suốt game, chỉ có `humans`/`color` bên trong thay đổi khi feed vào/ra
    // (xem Game.updateRingSlots()/feedSlotFrom()). Row trên hàng chờ: không dùng.
    slotIndex: number = -1;
    highlighted: boolean = false;
    // true trong lúc đang chuyển người từ hàng chờ vào (feedSlotFrom) — updateRingSlots() tạm
    // bỏ qua, tween riêng tự lo vị trí; cũng chặn checkBus()/tryFeedEmptySlots() động vào.
    moving: boolean = false;
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

    line2D: Line2D = null!;
    line2D2: Line2D = null!;
    // Đường tuỳ chỉnh cho ring — khép kín: hết điểm cuối thì coi như quay lại điểm đầu.
    ringLine2D: Line2D = null!;

    ringNode: Node = null;
    // Điểm tâm ring, vị trí = trung bình cộng các Point của ringLine2D — tạo 1 lần duy nhất,
    // các lần init() sau nếu đã có sẵn trên scene thì giữ nguyên (không tính lại).
    ringOrigin: Node = null;
    rowLeftNode: Node = null;
    rowRightNode: Node = null;
    // Node phụ dùng tạm khi chỉnh lại người trong row (feedSlotFrom) — tạo 1 lần, tái sử dụng
    // mãi về sau thay vì new Node()/destroy() mỗi lần gọi.
    tempRowNode: Node = null;
    ringRows: HumanRow[] = [];
    leftQueue: HumanRow[] = [];
    rightQueue: HumanRow[] = [];
    leftLposes: Vec3[] = [];
    rightLposes: Vec3[] = [];
    pendingRows: ColorType[][] = [];
    // Tiến trình xoay vòng, 0..1, tăng dần mỗi frame theo deltaTime/ringRevolveSeconds (xem
    // updateRingSlots()) — vị trí mỗi slot luôn tính TUYỆT ĐỐI từ index cố định + giá trị này,
    // không cộng dồn qua từng chặng tween nhỏ, nên không thể bị trôi/lệch theo thời gian.
    ringProgress: number = 0;

    @property({ tooltip: "Số người trong 1 row" })
    humanPerRow: number = 4;
    @property({ tooltip: "Số row liên tiếp cùng màu khi xoay vòng màu (0 = giữ nguyên thứ tự LinearHumanData)" })
    rowsPerColor: number = 4;
    @property({ type: Enum(RowOrder), tooltip: "Thứ tự row: Data = giữ nguyên data; LoopColors = màu 0..7 xoay vòng; BusOrder = người của xe đang thoát được tới trước (dễ thắng)" })
    rowOrder: RowOrder = RowOrder.BusOrder;
    @property({ tooltip: "BusOrder: số xe được xen kẽ row cùng lúc (càng lớn càng khó, không vượt số slot)" })
    busOrderWindow: number = 3;
    @property({ tooltip: "Số slot cố định trên ring" })
    ringSlotCount: number = 12;
    // Đảo chiều xoay ring (updateRingSlots/getSlotAngle) — bật vì chiều hiện tại đang ngược.
    @property({ tooltip: "Đảo chiều xoay ring" })
    ringReverse: boolean = true;
    // Cộng thêm vào góc mỗi slot (getSlotAngle) để bù lệch 180° giữa slot 0 và vị trí chính
    // diện/feed thực tế — chỉnh số này trong Inspector nếu vẫn còn lệch.
    @property({ tooltip: "Góc (độ) cộng thêm vào góc mỗi slot để bù lệch" })
    ringAngleOffset: number = 180;
    @property({ tooltip: "(Không dùng) Bán kính ring cũ — ring giờ đi theo Line2D" })
    ringRadius: number = 3;
    @property({ tooltip: "Số giây để ring quay hết 1 vòng" })
    ringRevolveSeconds: number = 30;
    @property({ tooltip: "Góc bắt đầu vùng chính diện (người được lên xe)" })
    ringFrontAngleMin: number = 150;
    @property({ tooltip: "Góc kết thúc vùng chính diện (có thể cắt qua mốc 0°)" })
    ringFrontAngleMax: number = 210;
    @property({ tooltip: "Góc slot nhận row từ hàng chờ trái" })
    leftFeedAngle: number = 300;
    @property({ tooltip: "Góc slot nhận row từ hàng chờ phải" })
    rightFeedAngle: number = 60;
    @property({ tooltip: "Sai số (±độ) quanh leftFeedAngle để được feed" })
    leftFeedAngleTolerance: number = 20;
    @property({ tooltip: "Sai số (±độ) quanh rightFeedAngle để được feed" })
    rightFeedAngleTolerance: number = 20;
    @property({ tooltip: "Khoảng cách giữa các row trên hàng chờ (quyết định số row mỗi line)" })
    rowLineSpacing: number = 0.3;
    @property({ tooltip: "Scale row khi ở vùng chính diện / vùng feed" })
    rowHighlightScale: number = 1.15;
    @property({ tooltip: "(Không dùng) Thời gian tween highlight — tween đang comment" })
    rowHighlightTime: number = 0.15;
    @property({ tooltip: "Căn tâm row (không phải người đầu tiên) vào đúng path — áp dụng cho cả ring lẫn 2 hàng chờ" })
    rowCentered: boolean = true;
    
    buses: Bus[] = [];
    slots: Slot[] = [];
    humans: Human[] = [];
    movingHumans: Human[] = [];

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
    @property({ tooltip: "Chế độ chỉnh level: bấm xe để xoay, A đổi kiểu xoay, Space in BusData" })
    tool: boolean = false;

    @property({ tooltip: "Tick để xuất ảnh pixel người ra Human.png" })
    set savePNG(v: boolean) {
        savePNG(this.tData, this.humanSize.x, this.humanSize.y, "Human.png");
    }
    get savePNG() { return false; }

    @property({ tooltip: "Tick để in Level Data, Bus Data, Linear Human Data ra console" })
    set printBusData(v: boolean) {
        
        this.printData();
        let data = [];
        let buses = this.bus.getComponentsInChildren(Bus);
        buses.forEach((bus) => {
            let type = bus.type - PoolType.Bus;
            let iColor = bus.dColor;
            let x = bus.node.position.x / this.disMul.x;
            let y = bus.node.position.y / this.disMul.y;
            let angle = bus.node.eulerAngles.z;
            data.push([type, iColor, truncate(x, 3), truncate(y, 3), truncate(angle, 3)]);
        })

        console.log("Bus Data");        
        console.log(JSON.stringify(data));


        // Mỗi phần tử đã là 1 row (không flatten nữa) — mỗi row sẽ thành humanPerRow người khi áp dụng.
        let hm = this.getHumanDataFromBuses();
        console.log("Linear Human Data");
        console.log(JSON.stringify(hm));        
    }
    get printBusData() { return false; }


    @property({ tooltip: "Tick để tính và in Obstacle Data ra console" })
    set printBlockData(v: boolean) {
        let ostacleData = [];
        this.buses.forEach(b => {
            this.onBox(b);
            ostacleData.push(b.obstascles.map(c => this.buses.indexOf(c.getComponent(Bus))));
        })
        console.log("Obstacle Data");
        
        console.log(JSON.stringify(ostacleData));        
    }
    get printBlockData() { return false; }

    @property({ tooltip: "Tick để chạy A* và in Human Data + Cached paths (logic lưới cũ)" })
    set printCachedPath(v: boolean) {
        this.initPaths();       
    }
    get printCachedPath() { return false; }

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
            this.node.eulerAngles = v3(-25, 0, 0);
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
        let rows = this.fitRowsToBuses(LinearHumanData);
        if(this.rowOrder == RowOrder.LoopColors) rows = this.loopRowColors(rows);
        else if(this.rowOrder == RowOrder.BusOrder) rows = this.orderRowsByBuses();
        this.data = rows;
        this.initRing();
        this.humans.forEach(h => {
            // if(this.humanSize.x * this.humanSize.y > 40*40) 
            if(this.human2D)   {
                h.sprite.node.active = true;
            } else {
                h.shadow.node.active = true;
                h.anim.node.active = true;
            }
        });  

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


    // ---- Ring + 2 feeder-line human queue ----

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

    buildRowChunks(data: ColorType[]): ColorType[][] {
        return data.map(color => Array(this.humanPerRow).fill(color));
    }

    // `existingRows`: các Row node còn sót lại từ lần initRing() trước (đang trên scene) để tái
    // sử dụng thay vì destroy hết rồi spawn lại mỗi lần init chạy (VD Editor reload script).
    // Row/Human nào lấy ra dùng thì bị pop khỏi mảng này; còn dư lại sau khi initRing() xong
    // xử lý hết rowsData thì mới bị destroy/despawn (xem initRing()).
    // `perHumanOffset`: khoảng dịch (cục bộ) giữa người thứ i và i+1 trong row, mặc định dọc +Y
    // (dùng cho row trên ring và trên line 2 — giữ nguyên). Line 1 truyền v3(0, -humanDis.y, 0)
    // để người xếp theo -Y giảm dần thay vì +Y.
    spawnRow(colors: ColorType[], parent: Node, localPos: Vec3, existingRows: Node[] = [], perHumanOffset: Vec3 = null): HumanRow {
        let row = new HumanRow();
        row.color = colors[0];
        let offset = perHumanOffset || v3(0, this.humanDis.y, 0);

        let node = existingRows.pop();
        if(node) {
            row.node = node;
            row.node.parent = parent;
        } else {
            row.node = new Node("Row");
            row.node.parent = parent;
            row.node._objFlags = CCObject.Flags.DontSave;
        }
        row.node.position = localPos;

        let hs = row.node.children.map(c => c.getComponent(Human)).filter(h => h);

        let n = colors.length;
        colors.forEach((c, i) => {
            let human = hs.pop();
            if(!human) {
                human = pm.spawnType<Human>(PoolType.Human);
                human.node.parent = row.node;
                human.node._objFlags = CCObject.Flags.DontSave;
            }
            human.init(c, v2(), 0);
            human.node.position = this.rowLocalPos(i, n, offset);
            this.humans.push(human);
            if(!this.colorHumans[human.color]) {
                this.colorHumans[human.color] = [];
            }
            this.colorHumans[human.color].push(human);
            human.row = row;
            row.humans.push(human);
        });

        // Human dư ra trong row cũ (row hiện cần ít người hơn lần trước) thì trả về pool.
        hs.forEach(h => pm.despawn(h));

        return row;
    }

    // Vị trí local của người thứ i trong row n người, xếp theo `offset` mỗi bước. rowCentered:
    // dời cả dãy lùi nửa chiều dài để TÂM row (không phải người 0) trùng gốc row — gốc row luôn
    // đặt đúng trên path (ring/hàng chờ) nên người nằm giữa lòng đường thay vì dồn về 1 mép.
    rowLocalPos(i: number, n: number, offset: Vec3): Vec3 {
        let k = this.rowCentered ? i - (n - 1) * 0.5 : i;
        return offset.clone().multiplyScalar(k);
    }

    // Lấy mẫu trên ringLine2D tại 1 ratio (0-1) bất kỳ dọc path, khép kín (qua 1 thì vòng lại từ
    // đầu — path cần điểm cuối trùng điểm đầu để không hụt ở mốc nối). Trả về LOCAL theo ringNode.
    ringPointAt(ratio: number): Vec3 {
        ratio = ((ratio % 1) + 1) % 1;
        this.ringLine2D.init();
        let p = this.ringLine2D.getPositionByRatio(ratio).pos;
        return this.ringNode.inverseTransformPoint(p, p);
    }

    // Tính góc z (độ) để đứng ở `fromPos` thì hướng về phía `target` (cùng hệ toạ độ cha).
    // `extraAngle`: lệch thêm cục bộ (độ) sau khi đã hướng về target.
    computeFacingAngle(fromPos: Vec3, target: Vec3, extraAngle: number = 0): number {
        let dir = target.clone().subtract(fromPos);
        return toDegree(Math.atan2(dir.y, dir.x)) - 90 + extraAngle;
    }

    // Xoay row (đứng ở local position `fromPos`) sao cho nó hướng về phía `target`. Vị trí người
    // trong row (spawnRow) giữ nguyên.
    faceTowards(row: HumanRow, fromPos: Vec3, target: Vec3, extraAngle: number = 0) {
        row.node.eulerAngles = v3(0, 0, this.computeFacingAngle(fromPos, target, extraAngle));
    }

    // Row đang xếp trên 1 trong 2 hàng chờ: hướng về phía row phía trước nó (gần vòng tròn hơn)
    // — các row nối đuôi hướng về nhau, cùng hướng dọc theo line. Row đầu tiên (không có
    // prevPos) suy ra hướng từ row kế tiếp (nextPos) theo chiều ngược lại, để hướng nhất quán
    // với các row phía sau thay vì lệch hẳn sang hướng tâm vòng tròn. Lệch thêm 90° cục bộ.
    faceQueueRow(row: HumanRow, fromPos: Vec3, prevPos: Vec3 | null, nextPos: Vec3 | null = null) {
        let target = prevPos
            || (nextPos && fromPos.clone().add(fromPos.clone().subtract(nextPos)))
            || fromPos.clone().add(v3(0, 1, 0));
        this.faceTowards(row, fromPos, target, 90);
    }

    // Người trên ring: bật chạy (run). row.node đã hướng vào ringOrigin (updateRingSlots) để
    // trục -Y của row là hướng ra ngoài theo bán kính (chỗ xếp người) — lệch thêm 90° cục bộ
    // để người hướng tiếp tuyến (vuông góc bán kính) thay vì hướng vào tâm.
    activateRingHumans(row: HumanRow, isLeft: boolean = false) {
        row.humans.forEach(h => {
            h.node.eulerAngles = v3(0, 0, isLeft ? -90 : 90 );
            h.setMoving(true);
        });
    }

    // Người trên hàng chờ: lệch cục bộ -90° so với hướng của row, đứng yên.
    orientQueueHumans(row: HumanRow) {
        row.humans.forEach(h => {
            h.node.eulerAngles = v3(0, 0, -90);
        });
    }

    // Góc tuyệt đối của slot i, tính thẳng từ index cố định + ringProgress hiện tại — không phụ
    // thuộc trạng thái của bất kỳ row/tween nào (mọi slot 0..ringSlotCount-1 đều có công thức
    // như nhau, kể cả khi đang rỗng/đang moving), nên luôn nhất quán, không thể lệch/trôi.
    getSlotAngle(slotIndex: number): number {
        if(this.ringSlotCount == 0) return 0;
        let dir = this.ringReverse ? -1 : 1;
        let a = (slotIndex / this.ringSlotCount) * 360 + dir * this.ringProgress * 360 + this.ringAngleOffset;
        return ((a % 360) + 360) % 360;
    }


    // So khoảng [min, max] có xử lý trường hợp khoảng CẮT QUA mốc 0/360 (VD min=350, max=10 —
    // tức từ 350° vòng qua 0° rồi tới 10°) — dùng chung cho mọi chỗ so ringFrontAngleMin/Max.
    isInAngleRange(a: number, min: number, max: number): boolean {
        a = ((a % 360) + 360) % 360;
        min = ((min % 360) + 360) % 360;
        max = ((max % 360) + 360) % 360;
        if(min <= max) return a >= min && a <= max;
        return a >= min || a <= max;
    }

    // Cửa sổ chính diện (ringFrontAngleMin/Max) rộng hơn khoảng cách giữa 2 slot liền kề nên có
    // thể có nhiều hơn 1 row cùng ở trong đó — trả về hết để checkBus() dò đủ các row, tránh miss
    // khi row đúng màu không phải là row đầu tiên gặp trong vòng lặp.
    getFrontRows(): HumanRow[] {
        if(!this.ringNode) return [];
        let rows: HumanRow[] = [];
        for(let i = 0; i < this.ringRows.length; i++) {
            let row = this.ringRows[i];
            if(!row || row.moving) continue;
            let a = this.getSlotAngle(i);
            if(this.isInAngleRange(a, this.ringFrontAngleMin, this.ringFrontAngleMax)) {
                rows.push(row);
            }
        }
        return rows;
    }

    getFrontHumans(): Human[] {
        return this.getFrontRows().reduce((acc, row) => acc.concat(row.humans), [] as Human[]);
    }


    getFrontRow(): HumanRow {
        return this.getFrontRows()[0] || null;
    }


    // Tìm Line2D theo TÊN node dưới this.linear. Scene giờ có thêm Line2D không thuộc luồng
    // gameplay (VD "Line2DExit" — đường đi ra chỉ để vẽ), nên không thể dựa vào thứ tự
    // getComponentsInChildren nữa; tên không khớp thì trả null để caller fallback cách cũ.
    findLineByName(name: string): Line2D {
        let lines = this.linear.getComponentsInChildren(Line2D);
        return lines.find(l => l.node.name == name) || null;
    }

    getOrCreateSecondLine() {
        let lines = this.linear.getComponentsInChildren(Line2D);
        let existing = this.findLineByName("Line2D2") || lines.find(l => l != this.line2D);
        if(existing) {
            this.line2D2 = existing;
            this.line2D2.node.active = true;
            return;
        }

        let node = instantiate(this.line2D.node);
        node.name = this.line2D.node.name + "2";
        node.parent = this.line2D.node.parent;
        let s = this.line2D.node.scale.clone();
        node.setScale(-s.x, s.y, s.z);
        node.active = true;
        this.line2D2 = node.getComponentInChildren(Line2D);
    }

    // Đường path riêng cho ring (thay công thức hình tròn sin/cos cũ). Cùng cơ chế tìm-hoặc-clone
    // như getOrCreateSecondLine(): nếu scene đã có sẵn 1 Line2D thứ 3 (khác line2D/line2D2) thì
    // dùng luôn, không thì clone thêm 1 bản từ line2D — bạn tự kéo lại "Points" trong Editor cho
    // thành hình dạng ring mong muốn (đặt điểm cuối trùng/khớp điểm đầu để path khép kín mượt).
    getOrCreateRingLine() {
        let lines = this.linear.getComponentsInChildren(Line2D);
        let existing = this.findLineByName("Line2DRing") || lines.find(l => l != this.line2D && l != this.line2D2);
        if(existing) {
            this.ringLine2D = existing;
            this.ringLine2D.node.active = true;
            return;
        }

        let node = instantiate(this.line2D.node);
        node.name = this.line2D.node.name + "Ring";
        node.parent = this.line2D.node.parent;
        node.active = true;
        this.ringLine2D = node.getComponentInChildren(Line2D);
    }

    // Tạo (1 lần duy nhất) node "Origin" làm tâm ring, vị trí = trung bình cộng world position
    // các Point của ringLine2D. Nếu scene đã có sẵn node "Origin" (con của ringNode) rồi thì
    // giữ nguyên, không tính/ghi đè lại vị trí — phòng trường hợp bạn đã tự chỉnh tay. Local theo
    // ringNode (không phải this.human) — khớp hệ toạ độ của row (cũng là con ringNode).
    getOrCreateRingOrigin() {
        let existing = this.ringNode.getChildByName("Origin");
        if(existing) {
            this.ringOrigin = existing;
            return;
        }

        this.ringLine2D.init();
        let pts = this.ringLine2D.points;
        let sum = v3();
        pts.forEach(p => sum.add(p.getWorldPosition()));
        let avgWorld = pts.length > 0 ? sum.multiplyScalar(1 / pts.length) : sum;

        let node = new Node("Origin");
        node.parent = this.ringNode;
        node.position = this.ringNode.inverseTransformPoint(v3(), avgWorld);
        this.ringOrigin = node;
    }

    sampleLine(line2D: Line2D, spacing: number): Vec3[] {
        line2D.init();
        let amount = Math.max(1, Math.floor(line2D.totalLength / spacing));
        let poses: Vec3[] = [];
        for(let i = 0; i < amount; i++) {
            let p = line2D.getPositionByRatio(i/amount).pos;
            p = this.human.inverseTransformPoint(p, p);
            poses.push(p);
        }
        poses.reverse();
        return poses;
    }

    // Đặt vị trí/góc TUYỆT ĐỐI cho từng slot trên ring mỗi frame — thay cho việc tween nối tiếp
    // qua từng waypoint trước đây (dễ trôi/lệch do cộng dồn qua nhiều chặng). ringProgress tăng
    // dần liên tục; vị trí mỗi slot luôn = hàm số của (index cố định, ringProgress hiện tại),
    // không phụ thuộc lịch sử các frame trước, nên không thể tích luỹ sai số theo thời gian.
    // Slot đang `moving` (giữa chừng feedSlotFrom()) thì bỏ qua — tween riêng của nó tự lo vị trí.
    updateRingSlots(deltaTime: number) {
        if(!this.ringNode || this.ringSlotCount == 0) return;
        this.ringProgress = (this.ringProgress + deltaTime / this.ringRevolveSeconds) % 1;
        let dir = this.ringReverse ? -1 : 1;
        for(let i = 0; i < this.ringRows.length; i++) {
            let row = this.ringRows[i];
            if(!row || row.moving) continue;
            let ratio = i / this.ringSlotCount + dir * this.ringProgress;
            let pos = this.ringPointAt(ratio);
            row.node.position = pos;
            row.node.eulerAngles = v3(0, 0, this.computeFacingAngle(pos, this.ringOrigin.position));
        }
    }

    initRing() {
        this.linear.active = true;
        this.line2D = this.findLineByName("Line2D") || this.linear.getComponentInChildren(Line2D);
        // this.line2D.init();
        this.getOrCreateSecondLine();
        this.getOrCreateRingLine();

        // Tạo/tìm ringNode — giữ nguyên position/eulerAngles hiện có (không ép về v3()) để bạn
        // tự kéo/chỉnh vị trí cả cụm ring trong Editor; mọi toạ độ ring tính THEO ĐÚNG ringNode
        // (ringNode.inverseTransformPoint), nên di chuyển/xoay ringNode thoải mái mà row vẫn
        // bám đúng path.
        this.ringNode = this.human.getChildByName("Ring") || new Node("Ring");
        this.ringNode.parent = this.human;
        this.ringNode._objFlags = 0;
        //  CCObject.Flags.DontSave;

        this.getOrCreateRingOrigin();
        this.leftLposes = this.sampleLine(this.line2D, this.rowLineSpacing);
        this.rightLposes = this.sampleLine(this.line2D2, this.rowLineSpacing);

        // leftLposes/rightLposes tính local theo this.human nên 2 node cha này vẫn cần đứng
        // đúng gốc (0,0,0) của this.human.
        this.rowLeftNode = this.human.getChildByName("RowLeft") || new Node("RowLeft");
        this.rowLeftNode.parent = this.human;
        this.rowLeftNode.position = v3();
        this.rowLeftNode._objFlags = 0;

        this.rowRightNode = this.human.getChildByName("RowRight") || new Node("RowRight");
        this.rowRightNode.parent = this.human;
        this.rowRightNode.position = v3();
        this.rowRightNode._objFlags = 0;

        // Gom hết Row (kèm Human bên trong) còn sót lại trên scene từ lần initRing() trước —
        // ví dụ sau khi Editor reload script — để tái sử dụng thay vì destroy hết rồi spawn lại.
        let existingRows: Node[] = [];
        Ulis.allNode(this.human, (n: Node) => {
            if(n.name == "Row") existingRows.push(n);
        });

        this.ringRows = [];
        this.leftQueue = [];
        this.rightQueue = [];
        this.humans = [];
        this.colorHumans = [];

        let rowsData = this.buildRowChunks(this.data as ColorType[]);

        // Mỗi slot 0..ringSlotCount-1 LUÔN có 1 node cố định (kể cả chưa có người — row rỗng),
        // không còn push(null) như trước: nhờ vậy getSlotAngle()/updateRingSlots() không cần xử
        // lý riêng trường hợp slot null nữa, mọi slot đều có công thức vị trí/góc như nhau.
        for(let i = 0; i < this.ringSlotCount; i++) {
            let colors = rowsData.shift();
            let row: HumanRow;
            if(colors && colors.length > 0) {
                row = this.spawnRow(colors, this.ringNode, v3(), existingRows);
                this.activateRingHumans(row);
            } else {
                row = new HumanRow();
                row.node = existingRows.pop() || new Node("Row");
                row.node.parent = this.ringNode;
                row.node._objFlags = CCObject.Flags.DontSave;
            }
            row.slotIndex = i;
            this.ringRows.push(row);
        }
        // Đặt vị trí/góc ban đầu ngay (deltaTime=0, ringProgress không đổi) — tránh 1 frame đầu
        // các row còn nằm ở vị trí mặc định (0,0,0) trước khi update() kịp chạy.
        this.updateRingSlots(0);

        // Chỉ đẻ đúng số row vừa khít số vị trí lấy mẫu được trên mỗi line (leftLposes/rightLposes),
        // luân phiên 2 bên; phần dữ liệu còn lại giữ nguyên trong pendingRows, đẻ dần sau này —
        // mỗi khi 1 row trên line được đưa vào ring trống (feedSlotFrom), mới đẻ tiếp 1 row mới
        // lấp vào chỗ trống cuối line đó.
        this.pendingRows = rowsData;
        // Line 1 xếp người theo -Y giảm dần; line 2 (mirror của line 1, giống row trên ring)
        // dùng offset mặc định +Y của spawnRow.
        let sides = [
            { queue: this.leftQueue, lposes: this.leftLposes, offset: v3(0, -this.humanDis.y, 0), parent: this.rowLeftNode },
            { queue: this.rightQueue, lposes: this.rightLposes, offset: null as Vec3, parent: this.rowRightNode },
        ];
        let side = 0;
        while(this.pendingRows.length > 0
        && (this.leftQueue.length < this.leftLposes.length || this.rightQueue.length < this.rightLposes.length)) {
            let s = sides[side];
            side = 1 - side;
            if(s.queue.length >= s.lposes.length) continue;

            let colors = this.pendingRows.shift();
            let idx = s.queue.length;
            let pos = s.lposes[idx];
            let row = this.spawnRow(colors, s.parent, pos, existingRows, s.offset);
            let prevPos = idx > 0 ? s.lposes[idx - 1] : null;
            let nextPos = s.lposes[idx + 1] || null;
            this.faceQueueRow(row, pos, prevPos, nextPos);
            this.orientQueueHumans(row);
            s.queue.push(row);
        }

        // Row cũ còn dư (không dùng hết) thì mới destroy, kèm despawn Human bên trong về pool.
        existingRows.forEach(n => {
            n.children.forEach(c => {
                let h = c.getComponent(Human);
                if(h) pm.despawn(h);
            });
            n.destroy();
        });

        this.outsideHumans = this.getFrontHumans();
    }

    // Khoảng cách góc ngắn nhất giữa 2 góc (0-360), có xử lý vòng qua mốc 0/360.
    angleDist(a: number, b: number): number {
        let d = Math.abs(a - b);
        return Math.min(d, 360 - d);
    }

    isEmptySlot(i: number): boolean {
        let row = this.ringRows[i];
        return !!row && !row.moving && row.humans.length == 0;
    }

    // Gom các slot rỗng liền kề (theo index, có xử lý vòng qua mốc đầu/cuối mảng vì ring khép
    // kín) thành từng "khoảng" (gap) riêng biệt, trả về mảng các mảng index — mỗi phần tử là 1
    // khoảng, theo đúng thứ tự gặp khi quét quanh vòng. Bắt đầu quét từ slot rỗng ngay SAU 1 slot
    // không rỗng đầu tiên (nếu có) để 1 khoảng không bị cắt làm đôi do vòng qua mốc index 0/n-1
    // (VD slot cuối và slot đầu đều rỗng nhưng nếu quét thẳng từ 0 sẽ bị tính thành 2 khoảng riêng).
    getEmptyGaps(): number[][] {
        let n = this.ringRows.length;
        let gaps: number[][] = [];
        if(n == 0) return gaps;

        let start = 0;
        for(let i = 0; i < n; i++) {
            if(!this.isEmptySlot(i)) { start = (i + 1) % n; break; }
        }

        let visited = new Array(n).fill(false);
        for(let k = 0; k < n; k++) {
            let i = (start + k) % n;
            if(visited[i] || !this.isEmptySlot(i)) continue;
            let gap: number[] = [];
            let j = i;
            while(!visited[j] && this.isEmptySlot(j)) {
                visited[j] = true;
                gap.push(j);
                j = (j + 1) % n;
            }
            gaps.push(gap);
        }
        return gaps;
    }

    // Mỗi khoảng trống liên tiếp trên ring được gán luân phiên cho 1 bên: khoảng 1, 3, 5... do
    // bên trái feed; khoảng 2, 4, 6... do bên phải feed — thay cho cách cũ (feed theo lượt đếm
    // số row, không quan tâm khoảng). Trong 1 khoảng, slot nào tới đúng góc feed của bên được
    // gán mới thực sự feed (leftFeedAngle/rightFeedAngle ± tolerance vẫn quyết định THỜI ĐIỂM).
    tryFeedEmptySlots() {
        let gaps = this.getEmptyGaps();
        gaps.forEach((gap, gapIndex) => {
            let isLeftGap = gapIndex % 2 == 0;
            gap.forEach(i => {
                let a = this.getSlotAngle(i);
                // Hết người bên phải (rightQueue rỗng) thì bên trái feed không cần điều kiện
                // isLeftGap nữa — coi như mọi khoảng đều là của trái luôn.
                if(isLeftGap || this.rightQueue.length == 0) {
                    if(this.angleDist(a, this.leftFeedAngle) <= this.leftFeedAngleTolerance) {
                        this.feedSlotFrom(this.leftQueue, this.leftLposes, i);
                    }
                }
                //  else
                    {
                    if(this.angleDist(a, this.rightFeedAngle) <= this.rightFeedAngleTolerance) {
                        this.feedSlotFrom(this.rightQueue, this.rightLposes, i);
                    }
                }
            });
        });
    }

    // Phóng to (rowHighlightScale) row nào đang ở vùng chính diện (ringFrontAngleMin/Max) hoặc
    // vùng nối hàng chờ (leftFeedAngle ± leftFeedAngleTolerance / rightFeedAngle ±
    // rightFeedAngleTolerance); qua khỏi vùng thì trả về scale bình thường.
    updateRowHighlights() {
        for(let i = 0; i < this.ringRows.length; i++) {
            let row = this.ringRows[i];
            if(!row || !row.node) continue;

            let a = this.getSlotAngle(i);
            let inFront = this.isInAngleRange(a, this.ringFrontAngleMin, this.ringFrontAngleMax);
            let inFeed = this.angleDist(a, this.leftFeedAngle) <= this.leftFeedAngleTolerance
                || this.angleDist(a, this.rightFeedAngle) <= this.rightFeedAngleTolerance;
            let highlight = inFront
             || inFeed;

            if(highlight == row.highlighted) continue;
            row.highlighted = highlight;
            let s = highlight ? this.rowHighlightScale : 1;
            // Tween.stopAllByTarget(row.node);
            // tween(row.node)
            // .to(this.rowHighlightTime, { scale: v3(s, s, s) })
            // .start();
            row.node.scale = v3(s, s, s);
        }
    }

    // ringRow (this.ringRows[slotIndex]) là node CỐ ĐỊNH, không bao giờ bị thay/destroy — chỉ có
    // NGƯỜI được chuyển từ feederRow (lấy từ hàng chờ) vào bên trong nó. feederRow.node tween
    // đuổi theo vị trí/góc HIỆN TẠI của ringRow (ringRow vẫn đang tiếp tục di chuyển theo
    // updateRingSlots() suốt lúc này, nên phải tính lại target mỗi frame trong onUpdate, không
    // thể tween tới 1 điểm cố định) bằng lerp world position theo ratio; xong thì add người vào
    // ringRow.node và destroy feederRow.node.
    feedSlotFrom(queue: HumanRow[], lposes: Vec3[], slotIndex: number) {
        let feederRow = queue.shift();
        if(!feederRow) return;

        let ringRow = this.ringRows[slotIndex];
        if(!ringRow) return;

        // updateRingSlots() vẫn cập nhật vị trí/góc ringRow.node bình thường trong lúc `moving`
        // (không skip nữa) — cờ `moving` giờ chỉ dùng để chặn feed đè lần 2 lên cùng slot/checkBus.
        ringRow.moving = true;

        let duration = 0.2;
        let humans = feederRow.humans;
        let doneCount = 0;

        // Phòng trường hợp row rỗng (không có người) — finalize ngay, tránh ringRow.moving kẹt
        // mãi true vì không có tween nào chạy để trigger doneCount == humans.length bên dưới.
        if(humans.length == 0) {
            ringRow.humans = humans;
            ringRow.color = feederRow.color;
            feederRow.node.destroy();
            ringRow.moving = false;
        }

        // Add người ngay vào ringRow.node (cha) thay vì tween cả feederRow.node đuổi theo rồi mới
        // add lúc xong. addToParent() giữ nguyên world pos/rot nên local position ngay sau đó
        // chính là điểm xuất phát đúng để tween tới chỗ trong row theo index (0, i*humanDis.y, 0).
        // Vì giờ h.node là CON của ringRow.node (đang tự di chuyển/xoay theo updateRingSlots() mỗi
        // frame), người tự động bám đúng vị trí/góc của ring suốt lúc tween — khỏi cần tính lại
        // world position mỗi frame theo ratio như cách cũ.
        humans.forEach((h, i) => {
            Ulis.addToParent(h.node, ringRow.node);
            h.row = ringRow;
            h.setMoving(true);

            let startAngle = h.node.eulerAngles.z;
            let targetAngle = nearestAngle(90, startAngle);

            tween(h.node)
            .to(duration, {
                position: this.rowLocalPos(i, humans.length, v3(0, this.humanDis.y, 0)),
                eulerAngles: v3(0, 0, targetAngle),
            })
            .call(() => {
                doneCount++;
                // Chỉ finalize (gán humans/color, bỏ cờ moving) khi TẤT CẢ người trong row đã
                // tween xong — tránh checkBus()/tryFeedEmptySlots() nhận nhầm row này lúc còn
                // đang dở dang giữa chừng.
                if(doneCount == humans.length) {
                    ringRow.humans = humans;
                    ringRow.color = feederRow.color;
                    this.activateRingHumans(ringRow);
                    feederRow.node.destroy();
                    ringRow.moving = false;
                }
            })
            .start();
        });

        // Các row còn lại trong hàng chờ dịch lên lấp chỗ trống: bật chạy lúc di chuyển, xong thì idle.
        queue.forEach((r, i) => {
            let target = lposes[i] || r.node.position;
            this.faceQueueRow(r, target, i > 0 ? lposes[i - 1] : null, lposes[i + 1] || null);
            r.humans.forEach(h => h.setMoving(true));
            tween(r.node)
            .to(0.4, { position: target })
            .call(() => {
                r.humans.forEach(h => h.setMoving(false));
            })
            .start();
        });

        // Còn dữ liệu chưa dùng thì đẻ thêm 1 row mới lấp đúng chỗ trống cuối hàng chờ vừa dịch ra.
        if(this.pendingRows.length > 0 && queue.length < lposes.length) {
            let colors = this.pendingRows.shift();
            let idx = queue.length;
            let pos = lposes[idx];
            // Line 1 (left queue) xếp người theo -Y giảm dần; line 2 dùng offset mặc định +Y.
            let isLeft = queue === this.leftQueue;
            let offset = isLeft ? v3(0, -this.humanDis.y, 0) : null;
            let parent = isLeft ? this.rowLeftNode : this.rowRightNode;
            let newRow = this.spawnRow(colors, parent, pos, [], offset);
            let prevPos = idx > 0 ? lposes[idx - 1] : null;
            let nextPos = lposes[idx + 1] || null;
            this.faceQueueRow(newRow, pos, prevPos, nextPos);
            this.orientQueueHumans(newRow);
            queue.push(newRow);
        }
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

    removeHuman(human: Human) {
        this.humans.splice(this.humans.indexOf(human), 1);
        this.colorHumans[human.color].splice(this.colorHumans[human.color].indexOf(human), 1);

        let row: HumanRow = human.row;
        if(row) row.humans.splice(row.humans.indexOf(human), 1);
        human.row = null;

        this.outsideHumans = this.getFrontHumans();

        this.movingHumans.push(human);
        // human.onDespawn();
    }

    removeHumans(humans: Human[]) {
        humans.forEach((human) => {
            this.removeHuman(human);
        })
        this.tryFeedEmptySlots();
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
                    this.printBusData = true;
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

    onBox(box: Bus) {

        if(this.tool) {
            this.onTool(box);
            return;
        }


        sm?.playSound(SoundType.Click);
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
    
        if(EDITOR_NOT_IN_PREVIEW) return;


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
                    bus.onSlot();
                    let humans = this.checkBus(bus);
                    if(humans.length > 0) {
                        this.removeHumans(humans);
                    }
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
        this.tryFeedEmptySlots();
        this.outsideHumans = this.getFrontHumans();

        let buses = this.slots.map(s => s.bus).filter(b => b);
        let humans: Human[] = [];
        buses.forEach(b => {
            let h = this.checkBus(b);
            humans = humans.concat(h);
        });

        if(humans.length > 0) {
            this.removeHumans(humans);
        }

        if(this.movingHumans.length == 0 && !this.slots.find(s => !s.bus)) {

            let movingBus = buses.find(b => b.moving || b.packing);

            if(!movingBus && !this.lose && this.isRingFull() && !this.loseCheckTween) {

                console.log("Check lose");
                
                this.loseCheckTween = tween({})
                .delay(3)
                .call(() => {
                    this.loseCheckTween = null;

                    if(this.movingHumans.length == 0 && !this.slots.find(s => !s.bus)) {
                        let movingBus = buses.find(b => b.moving || b.packing);
                        if(!movingBus && !this.lose && this.isRingFull() && !this.loseCheckTween) {

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
    isRingFull(): boolean {
        if(this.ringRows.length == 0) return false;
        let ringFull = this.ringRows.every(r => r && r.humans.length > 0);
        return ringFull;
    }

    checkBus(bus: Bus) {

        let humans: Human[] = [];
        // Bỏ điều kiện bus.packing — vẫn cho check/thêm người dù đang có người khác chạy tới xe,
        // miễn còn remain > 0 (check bên dưới) là còn nạp thêm được, không cần đợi đợt trước
        // yên vị xong mới cho đợt tiếp theo.
        if(bus.moving) return humans;

        let color = bus.color;
        let remain = bus.remain;
        if(remain == 0) return humans;
        let r = remain;

        // Cửa sổ chính diện có thể chứa nhiều row cùng lúc — dò hết, row nào đúng màu thì lấy
        // người (tối đa r), hết r thì dừng, chưa hết thì sang row tiếp theo.
        let frontRows = this.getFrontRows().filter(row => row.color == color);

        for(let frontRow of frontRows) {
            if(r <= 0) break;
            let iHumans = [...frontRow.humans];
            let h = iHumans[0];
            while(h && !h.bus && h.color == color
            && r > 0 && iHumans.length > 0 && !bus.humans.includes(h)) {
                iHumans.shift();
                humans.push(h);
                h.bus = bus;
                h.pTween?.stop();
                h.rTween?.stop();
                r--;
                h = iHumans[0];
            }
        }

        bus.remain = r;

        if(humans.length > 0) {
            bus.packing = true;
            bus.pHumans = bus.pHumans.concat(humans);
            humans.forEach(h => {
                Ulis.addToParent(h.node, this.human);
                this.moveHuman(h, bus);
            });
        }

        return humans;
    }

    moveHuman(human: Human, bus: Bus) {
        human.setMoving(true);
        Ulis.addToParent(human.node, this.human);
        human.node.eulerAngles = v3(0, 0, human.node.eulerAngles.z);
        let p0 = this.getBusHumanPos(bus.p0, bus, human);
        let lpos = human.node.getPosition();
        lpos.y = p0.y + bus.dis * 3.1;
        let points = [lpos];
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

    update(deltaTime: number) {
        if(!EDITOR_NOT_IN_PREVIEW)
        this.updateRingSlots(deltaTime);
        // this.updateRowHighlights();
    }
}


