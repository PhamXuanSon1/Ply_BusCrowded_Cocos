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
import { Line2D } from '../../Misc/Line2D/Line2D';
import { GameMap, MapKind } from './GameMap';
// Cách sắp thứ tự row người đi vào ring (SpawnMode.Data / map RingFeeder).
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

// Nhóm (header) hiển thị trong Inspector
const G_STORE = { name: "Store & Hướng dẫn", id: "store", displayOrder: 1, style: "section" };
const G_LOOK = { name: "Màu & Hiển thị người", id: "look", displayOrder: 2, style: "section" };
const G_SPAWN = { name: "Sinh người lên ring", id: "spawn", displayOrder: 3, style: "section" };
const G_INTRO = { name: "Intro (màn tối + khung sáng)", id: "intro", displayOrder: 5, style: "section" };
const G_TOOL = { name: "Công cụ Editor", id: "tool", displayOrder: 6, style: "section" };

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

// 1 row người của map RingFeeder: trên ring (node cố định theo slot) hoặc trên 1 trong 2 hàng chờ
export class HumanRow {
    node: Node = null;
    humans: Human[] = [];
    color: ColorType = ColorType.White;
    // Row trên ring: index CỐ ĐỊNH trong this.ringRows (0..ringSlotCount-1) — node/index không
    // bao giờ đổi trong suốt game, chỉ có `humans`/`color` bên trong thay đổi khi feed vào/ra
    // (xem Game.updateRingSlots()/feedSlotFrom()). Row trên hàng chờ: không dùng.
    slotIndex: number = -1;
    // true trong lúc đang chuyển người từ hàng chờ vào (feedSlotFrom) — chặn checkBus()/
    // tryFeedEmptySlots() động vào.
    moving: boolean = false;
}

@ccclass('Game')
@executeInEditMode(true)
export class Game extends Component {
    @property({ group: G_STORE, tooltip: "Số lần bấm xe để mở Store.\n- Mỗi lần bấm 1 xe đi ra (count++) được tính 1 lần.\n- Đủ số này HOẶC tiến độ đạt 100% (hết xe) thì khoá chạm và gọi ui.bindingToStore().\n- Bản native tự ép thành 9999 (không mở Store giữa chừng)." })
    clicksToStore: number = 12;
    count: number = 0;
    progress: number = 0;
    @property({ group: G_STORE, tooltip: "Bật/tắt tay hướng dẫn (hand tutorial).\nTắt thì không hiện tay ở bất kỳ đâu; Intro vẫn khoanh sáng xe đầu tiên trong Tap Indices." })
    useHand: boolean = true;
    @property({ group: G_STORE, visible() { return this.useHand; }, tooltip: "Số giây chờ kể từ lúc vào game, nếu người chơi vẫn chưa bấm lần nào thì hiện tay hướng dẫn (tut).\nBấm trước thời gian này thì không hiện." })
    tutTime: number = 3;
    @property({ group: G_STORE, type: Animation, tooltip: "Animation báo hết slot trống (Bus.ts gọi play() khi bấm xe mà không còn slot để đỗ)." })
    noSlot: Animation = null!
    humanSize: Vec2 = v2(47, 52);
    @property({ group: G_STORE, type: [CCInteger], tooltip: "Index các xe (theo thứ tự mảng buses = thứ tự BusData) mà tay hướng dẫn chỉ vào lần lượt.\n- Phần tử đầu cũng là xe được khoanh sáng ở Intro.\n- Bấm đúng xe đang chỉ thì tay chuyển sang xe tiếp theo.\n- Lưu ý: sau khi Save Bus Data hoặc đổi map, kiểm tra lại index còn trỏ đúng xe đi được không." })
    tapIndices: number[] = [105];
    introBus: Node = null;
    humanDis: Vec2 = v2(0.255, 0.255);
    disHuman: number = 0.016;
    disMul: Vec2 = v2(0.016, 0.016);
    @property({ group: G_LOOK, type: SpriteFrame, tooltip: "Sprite người màu đen, chỉ dùng khi bật human2D (Human.ts gán cho người màu Black)." })
    blackHuman: SpriteFrame = null!;

    @property({ group: G_LOOK, type: [Color], tooltip: "Bảng màu dùng chung cho xe và người.\n- Index phải khớp enum ColorType trong Data.ts (0 = White, 1 = Gray, ...).\n- BusData / LinearHumanData lưu màu theo index này nên KHÔNG đổi thứ tự / chèn giữa; chỉ chỉnh giá trị màu." })
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

    @property({ group: G_SPAWN, tooltip: "Số người đứng ngang trong 1 row trên ring (cả row cùng màu).\n- Bề ngang đường Line3DRing tự tính = humanPerRow * ringLaneGap + 2 gờ.\n- Xe lấy người theo row, nên số ghế xe nên là bội số của số này." })
    humanPerRow: number = 4;
    @property({ group: G_SPAWN, type: SpawnMode, visible() { return !this.isFeeder(); }, tooltip: "(Map Ring3D) Cách chọn màu cho row mới sinh trên ring:\n- Data: theo LinearHumanData, đúng số row mỗi màu = số ghế xe màu đó, sắp theo Row Order. Phát hết thì lấp ô trống theo Fill Mode.\n- ColorLoop: mỗi màu ra liền 1 cụm Loop Rows Min..Max row, lần lượt theo màu các xe, hết vòng quay lại màu đầu (người vô hạn, không bao giờ hết).\nMap RingFeeder luôn theo Data (Row Order)." })
    spawnMode: SpawnMode = SpawnMode.ColorLoop;
    @property({ group: G_SPAWN, type: Enum(RowOrder), visible() { return this.usesRowData(); }, tooltip: "(Data / map RingFeeder) Thứ tự các row:\n- Data: giữ nguyên thứ tự LinearHumanData.\n- LoopColors: màu 0..7 xoay vòng, mỗi lượt Rows Per Color row.\n- BusOrder: người của các xe đang thoát được (theo ObstacleData) ra trước → dễ thắng, luôn có cách giải." })
    rowOrder: RowOrder = RowOrder.BusOrder;
    @property({ group: G_SPAWN, visible() { return this.usesRowData(); }, tooltip: "(Data / map RingFeeder) Số row liên tiếp cùng màu mỗi lượt khi xoay vòng màu (LoopColors / BusOrder).\n0 = giữ nguyên thứ tự LinearHumanData." })
    rowsPerColor: number = 4;
    @property({ group: G_SPAWN, visible() { return this.usesRowData(); }, tooltip: "(Data / map RingFeeder + BusOrder) Số xe được xen kẽ row cùng lúc.\n1 = phát hết người của xe này mới sang xe sau; lớn hơn = các màu đan xen nhiều hơn, khó hơn." })
    busOrderWindow: number = 3;
    @property({ group: G_SPAWN, type: CCInteger, min: 1, visible() { return !this.isFeeder() && this.spawnMode == SpawnMode.ColorLoop; }, tooltip: "(ColorLoop) Số row ít nhất của 1 cụm cùng màu." })
    loopRowsMin: number = 4;
    @property({ group: G_SPAWN, type: CCInteger, min: 1, visible() { return !this.isFeeder() && this.spawnMode == SpawnMode.ColorLoop; }, tooltip: "(ColorLoop) Số row nhiều nhất của 1 cụm cùng màu.\nMỗi cụm chọn ngẫu nhiên trong khoảng Min..Max; đặt Min = Max để mọi cụm dài bằng nhau." })
    loopRowsMax: number = 4;
    @property({ group: G_SPAWN, visible() { return !this.isFeeder() && this.spawnMode == SpawnMode.ColorLoop; }, tooltip: "(ColorLoop) Xử lý màu đã hết xe cần người:\n- Tắt: cụm màu đó vẫn chạy trên ring, chuỗi màu vẫn quay đều mọi màu trong màn.\n- Bật: đổi ngay cả cụm sang màu còn cần và bỏ màu đó khỏi chuỗi → ring chỉ còn màu có ích, dễ thắng hơn." })
    recolorFinished: boolean = false;
    @property({ group: G_SPAWN, type: FillMode, visible() { return !this.isFeeder() && this.spawnMode == SpawnMode.Data; }, tooltip: "(Data) Khi đã phát hết row cho mọi xe mà ring còn ô trống:\n- None: để trống.\n- WinColors: lấp bằng màu các xe còn chờ người (dư người giúp thắng).\n- LevelColors: lấp bằng mọi màu có trong màn." })
    fillMode: FillMode = FillMode.LevelColors;

    // Map đang dùng (GameMap ở gốc prefab Map_* dưới Linear, MapManager chọn). Đường đi + thông số
    // ring nằm trong map; các getter dưới đây đọc từ map để code ring giữ nguyên cách gọi.
    map: GameMap = null;

    isFeeder() { return this.map?.kind == MapKind.RingFeeder; }
    usesRowData() { return this.isFeeder() || this.spawnMode == SpawnMode.Data; }

    get line3DRing() { return this.map?.line3DRing ?? null; }
    get exitPoints() { return this.map?.exitPoints ?? []; }
    get ringSpeed() { return this.map.ringSpeed; }
    get ringReverse() { return this.map.ringReverse; }
    get ringRowSpacing() { return this.map.ringRowSpacing; }
    get ringLaneGap() { return this.map.ringLaneGap; }
    get ringPrefill() { return this.map.ringPrefill; }
    get ringHumanScale() { return this.map.ringHumanScale; }
    get ringFade() { return this.map.ringFade; }

    get ringSlotCount() { return this.map.ringSlotCount; }
    get ringRevolveSeconds() { return this.map.ringRevolveSeconds; }
    get ringAngleOffset() { return this.map.ringAngleOffset; }
    get ringFrontAngleMin() { return this.map.ringFrontAngleMin; }
    get ringFrontAngleMax() { return this.map.ringFrontAngleMax; }
    get leftFeedAngle() { return this.map.leftFeedAngle; }
    get rightFeedAngle() { return this.map.rightFeedAngle; }
    get leftFeedAngleTolerance() { return this.map.leftFeedAngleTolerance; }
    get rightFeedAngleTolerance() { return this.map.rightFeedAngleTolerance; }
    get rowLineSpacing() { return this.map.rowLineSpacing; }
    get rowCentered() { return this.map.rowCentered; }
    get startPinkRows() { return this.map.startPinkRows; }
    get startPinkColor() { return this.map.startPinkColor; }
    get startPinkAngle() { return this.map.startPinkAngle; }

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

    @property({ group: G_LOOK, tooltip: "Kiểu hiển thị người:\n- Bật: sprite 2D (nhẹ, hợp playable nhiều người).\n- Tắt: model 3D có animation + bóng.\nĐổi xong cần mở lại scene / chạy lại để người được sinh lại." })
    human2D: boolean = false;
    @property({ group: G_TOOL, tooltip: "Chế độ chỉnh level khi chạy preview (không dùng khi build thật):\n- Bấm xe để xoay thay vì cho xe chạy.\n- Phím A: đổi kiểu xoay (180° → 90° → góc thường).\n- Phím Space: lưu BusData (như Save Bus Data, nhưng chỉ in ra console)." })
    tool: boolean = false;

    @property({ group: G_TOOL, tooltip: "Tick để xuất dữ liệu pixel người hiện tại ra file Human.png (công cụ, không lưu giá trị)." })
    set savePNG(v: boolean) {
        savePNG(this.tData, this.humanSize.x, this.humanSize.y, "Human.png");
    }
    get savePNG() { return false; }

    @property({ group: G_TOOL, tooltip: "Tick để lưu toàn bộ xe đang có trên scene vào Data.ts:\n- Ghi BusData (kiểu xe, màu, vị trí, góc).\n- Tự tính lại ObstacleData (xe nào chặn xe nào) và LinearHumanData (người theo số ghế xe).\n- Dựng lại xe từ data mới ngay trong editor.\nNhớ lưu scene sau khi chỉnh xe, và kiểm tra lại Tap Indices." })
    set saveBusData(v: boolean) {
        this.saveBuses();
    }
    get saveBusData() { return false; }

    @property
    private _busScale: number = 1;
    @property({ group: G_TOOL, min: 0.1, step: 0.01, tooltip: "Kích thước xe (scale node của từng xe trong Bus), không đổi vị trí / hướng / số lượng xe.\n- Va chạm (Bus.size) phóng theo nên ObstacleData phải tính lại: đổi xong tick Save Bus Data.\n- Xe vào slot vẫn giữ cỡ cũ." })
    get busScale() { return this._busScale; }
    set busScale(v: number) {
        this._busScale = v;
        this.bus?.getComponentsInChildren(Bus).forEach(b => b.node.setScale(v, v, v));
    }

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

    @property({ group: G_INTRO, tooltip: "Số giây màn tối intro tự tắt (không cần bấm).\nIntro phủ tối cả màn, chỉ chừa khung sáng quanh xe đầu tiên trong Tap Indices." })
    introDuration: number = 2.5;
    @property({ group: G_INTRO, tooltip: "Khoảng hở từ xe tới viền khung sáng, tính theo tỉ lệ cạnh ngắn của xe (0.2 = 20% bề ngang xe)." })
    spotPadding: number = 0.2;
    @property({ group: G_INTRO, tooltip: "Bán kính bo góc khung sáng, tỉ lệ cạnh ngắn của xe (0 = góc vuông)." })
    spotCorner: number = 0.25;
    @property({ group: G_INTRO, tooltip: "Độ dày viền trắng của khung, tỉ lệ cạnh ngắn của xe." })
    spotLine: number = 0.08;
    @property({ group: G_INTRO, tooltip: "Độ loang của quầng sáng trắng bên ngoài viền, tỉ lệ cạnh ngắn của xe (0 = không có quầng)." })
    spotGlow: number = 0.5;
    @property({ group: G_INTRO, range: [0, 1, 0.05], slide: true, tooltip: "Độ sáng của quầng trắng ngoài viền (0 = tắt, 1 = trắng đặc)." })
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
        if(!this.useHand) return;
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
            this.node.eulerAngles = v3(this.findMap()?.tilt ?? -30, 0, 0);
        }
        this.initLayers();
        if(!EDITOR_NOT_IN_PREVIEW) this.applyMapCamera();
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
        this.map = this.findMap();
        if(!this.map) console.warn("Game: không có map (GameMap) nào đang bật dưới Linear — chọn map ở MapManager");
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

    // map đang dùng = GameMap đang bật dưới Linear (MapManager tạo instance prefab Map_* ở đây)
    findMap(): GameMap {
        let linear = this.node.getChildByName("Linear");
        return linear?.getComponentsInChildren(GameMap).find(m => m.enabledInHierarchy) ?? null;
    }

    // map bật overrideCamera: đặt WCam theo map (HighCam tự chép theo WCam mỗi frame — syncHighCam)
    applyMapCamera() {
        let cam = ui?.wCamera;
        if(!this.map?.overrideCamera || !cam) return;
        let p = cam.node.position;
        cam.node.setPosition(p.x, this.map.cameraY, p.z);
        cam.orthoHeight = this.map.orthoHeight;
    }

    // editor: MapManager vừa đổi map -> bỏ người của map cũ rồi dựng lại người theo đường của map mới
    refreshMap() {
        if(!this.linear?.isValid) return;
        let road = this.line3DRing;
        if(road?.isValid) road.node.off(Line3DRing.REBUILT, this.onRingRebuilt, this);
        if(this.ringContainer?.isValid) this.ringContainer.destroy();
        this.ringContainer = null;
        this.clearFeederRing();
        this.map = this.findMap();
        this.ringProgress = 0;
        this.initRowData();
        this.initRing();
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
            bus.node.setScale(this._busScale, this._busScale, this._busScale);
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

    // Thứ tự row cho SpawnMode.Data / map RingFeeder: khớp sức chứa xe rồi sắp theo rowOrder
    initRowData() {
        let rows = this.fitRowsToBuses(LinearHumanData);
        if(this.rowOrder == RowOrder.LoopColors) rows = this.loopRowColors(rows);
        else if(this.rowOrder == RowOrder.BusOrder) rows = this.orderRowsByBuses();
        if(this.isFeeder()) rows = this.placeStartPinkRows(rows);
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
        return this.map?.kind == MapKind.Ring3D && !!this.line3DRing?.isValid && this.line3DRing.enabledInHierarchy;
    }

    initRing() {
        this.ringSlots = [];
        this.ringSlotColors = [];
        this.humans = [];
        this.colorHumans = [];
        this.humanBaseScale.clear();
        if(this.isFeeder()) {
            this.initFeederRing();
            return;
        }
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

    // người trên các row sắp tới lối ra (1/4 vòng trước lối ra) — dùng cho tay hướng dẫn.
    // Map RingFeeder: người trên các row đang ở vùng chính diện.
    getFrontHumans(): Human[] {
        if(this.isFeeder()) return this.getFrontRows().reduce((acc, row) => acc.concat(row.humans), [] as Human[]);
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

    // ---- Ring + 2 hàng chờ (map RingFeeder) ----
    // Ring khép kín (map.ringLine2D) chia ringSlotCount slot cố định quay vòng; 2 hàng chờ (map.line2D /
    // map.line2D2) xếp row đứng yên, slot trống quay tới góc feed thì row đầu hàng chờ nhảy vào. Row ở
    // vùng chính diện cùng màu xe trong slot thì lên xe (checkBus).

    ringRows: HumanRow[] = [];
    leftQueue: HumanRow[] = [];
    rightQueue: HumanRow[] = [];
    leftLposes: Vec3[] = [];
    rightLposes: Vec3[] = [];
    pendingRows: ColorType[][] = [];
    // node chứa row trên ring / 2 hàng chờ (con của Human, không lưu vào scene)
    ringNode: Node = null;
    rowLeftNode: Node = null;
    rowRightNode: Node = null;
    // tâm ring (local theo ringNode) — row trên ring luôn quay mặt về đây
    ringCenter: Vec3 = v3();

    initFeederRing() {
        this.clearFeederRing();
        const m = this.map;
        if(!m.line2D || !m.line2D2 || !m.ringLine2D) {
            console.error("Game: map RingFeeder thiếu Line2D / Line2D2 / Ring Line2D trong GameMap");
            return;
        }
        this.linear.active = true;
        this.ringNode = this.createRowRoot("RingRows");
        this.rowLeftNode = this.createRowRoot("QueueLeft");
        this.rowRightNode = this.createRowRoot("QueueRight");
        this.ringCenter = this.getRingCenter();
        this.leftLposes = this.sampleLine(m.line2D, this.rowLineSpacing);
        this.rightLposes = this.sampleLine(m.line2D2, this.rowLineSpacing);
        this.slotOwner = [];
        this.leftAssigned = 0;
        this.rightAssigned = 0;

        let rowsData = this.buildRowChunks(this.data as ColorType[]);

        // Mỗi slot 0..ringSlotCount-1 LUÔN có 1 node cố định (kể cả chưa có người — row rỗng) nên
        // getSlotAngle()/updateRingSlots() không cần xử lý riêng slot null.
        for(let i = 0; i < this.ringSlotCount; i++) {
            let colors = rowsData.shift();
            let row: HumanRow;
            if(colors && colors.length > 0) {
                row = this.spawnRow(colors, this.ringNode, v3());
                this.activateRingHumans(row);
            } else {
                row = new HumanRow();
                row.node = new Node("Row");
                row.node.parent = this.ringNode;
                row.node._objFlags = CCObject.Flags.DontSave;
            }
            row.slotIndex = i;
            this.ringRows.push(row);
        }
        // Đặt vị trí/góc ban đầu ngay — tránh 1 frame đầu các row còn nằm ở (0,0,0).
        this.updateRingSlots(0);

        // Chỉ đẻ đúng số row vừa khít số vị trí lấy mẫu được trên mỗi hàng chờ, luân phiên 2 bên; phần
        // còn lại giữ trong pendingRows, mỗi khi 1 row hàng chờ được đưa vào ring (feedSlotFrom) mới đẻ
        // tiếp 1 row lấp chỗ trống cuối hàng đó. Hàng trái xếp người theo -Y, hàng phải theo +Y.
        this.pendingRows = rowsData;
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
            let row = this.spawnRow(colors, s.parent, pos, s.offset);
            this.faceQueueRow(row, pos, idx > 0 ? s.lposes[idx - 1] : null, s.lposes[idx + 1] || null);
            this.orientQueueHumans(row);
            s.queue.push(row);
        }

        this.outsideHumans = this.getFrontHumans();
    }

    createRowRoot(name: string): Node {
        let n = new Node(name);
        n.parent = this.human;
        n._objFlags = CCObject.Flags.DontSave;
        return n;
    }

    // bỏ hết row của map RingFeeder (trả người về pool)
    clearFeederRing() {
        [this.ringNode, this.rowLeftNode, this.rowRightNode].forEach(n => {
            if(!n?.isValid) return;
            n.getComponentsInChildren(Human).forEach(h => pm?.despawn(h));
            n.destroy();
        });
        this.ringNode = this.rowLeftNode = this.rowRightNode = null;
        this.ringRows = [];
        this.leftQueue = [];
        this.rightQueue = [];
        this.pendingRows = [];
    }

    // tâm ring local theo ringNode: node Ring Origin của map, không có thì trung bình cộng các Point của ring
    getRingCenter(): Vec3 {
        let w = v3();
        let origin = this.map.ringOrigin;
        if(origin?.isValid) {
            w.set(origin.worldPosition);
        } else {
            let line = this.map.ringLine2D;
            line.init();
            line.points.forEach(p => w.add(p.worldPosition));
            if(line.points.length) w.multiplyScalar(1 / line.points.length);
        }
        return this.ringNode.inverseTransformPoint(v3(), w);
    }

    // Lấy startPinkRows row màu startPinkColor đầu tiên trong `rows` đặt vào các slot ring gần startPinkAngle nhất
    // (liền nhau) để lúc mới vào game ring có 1 dải cùng màu; các slot còn lại + hàng chờ giữ nguyên
    // thứ tự cũ. Số row tổng không đổi nên vẫn khớp sức chứa xe.
    placeStartPinkRows(rows: ColorType[]): ColorType[] {
        let n = this.ringSlotCount;
        let pink: ColorType[] = [];
        let others: ColorType[] = [];
        rows.forEach(c => {
            if(c == this.startPinkColor && pink.length < this.startPinkRows) pink.push(c);
            else others.push(c);
        });
        if(pink.length == 0 || n <= 0) return rows;

        let slots = Array.from({ length: n }, (_, i) => i)
            .sort((a, b) => this.angleDist(this.getSlotAngle(a), this.startPinkAngle)
                          - this.angleDist(this.getSlotAngle(b), this.startPinkAngle))
            .slice(0, Math.min(pink.length, n));
        let ring: ColorType[] = [];
        for(let i = 0; i < n; i++) {
            ring.push(slots.includes(i) ? pink.pop() : others.shift());
        }
        return [...ring.filter(c => c !== undefined), ...others];
    }

    buildRowChunks(data: ColorType[]): ColorType[][] {
        return data.map(color => Array(this.humanPerRow).fill(color));
    }

    // `perHumanOffset`: khoảng dịch (cục bộ) giữa người thứ i và i+1 trong row, mặc định dọc +Y
    // (row trên ring và hàng phải). Hàng trái truyền v3(0, -humanDis.y, 0) để người xếp theo -Y.
    spawnRow(colors: ColorType[], parent: Node, localPos: Vec3, perHumanOffset: Vec3 = null): HumanRow {
        let row = new HumanRow();
        row.color = colors[0];
        let offset = perHumanOffset || v3(0, this.humanDis.y, 0);

        row.node = new Node("Row");
        row.node.parent = parent;
        row.node._objFlags = CCObject.Flags.DontSave;
        row.node.position = localPos;

        let n = colors.length;
        colors.forEach((c, i) => {
            let human = pm.spawnType<Human>(PoolType.Human);
            human.node.parent = row.node;
            human.node._objFlags = CCObject.Flags.DontSave;
            human.init(c, v2(), 0);
            human.node.position = this.rowLocalPos(i, n, offset);
            this.showHuman(human);
            // lúc chạy game người hiện 3D ngay (Ring3D cũng vậy vì người chạy luôn); người đứng yên
            // trên hàng chờ không gọi run() nên phải tự chuyển, không thì giữ sprite 2D tới lúc di chuyển
            if(!EDITOR_NOT_IN_PREVIEW) {
                human.show3D();
                human.idle();
            }
            this.humans.push(human);
            (this.colorHumans[human.color] = this.colorHumans[human.color] || []).push(human);
            human.row = row;
            row.humans.push(human);
        });
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
        let line = this.map.ringLine2D;
        line.init();
        let p = line.getPositionByRatio(ratio).pos;
        return this.ringNode.inverseTransformPoint(v3(), p);
    }

    // Tính góc z (độ) để đứng ở `fromPos` thì hướng về phía `target` (cùng hệ toạ độ cha).
    // `extraAngle`: lệch thêm cục bộ (độ) sau khi đã hướng về target.
    computeFacingAngle(fromPos: Vec3, target: Vec3, extraAngle: number = 0): number {
        let dir = target.clone().subtract(fromPos);
        return toDegree(Math.atan2(dir.y, dir.x)) - 90 + extraAngle;
    }

    faceTowards(row: HumanRow, fromPos: Vec3, target: Vec3, extraAngle: number = 0) {
        row.node.eulerAngles = v3(0, 0, this.computeFacingAngle(fromPos, target, extraAngle));
    }

    // Row trên hàng chờ hướng về row phía trước nó (gần ring hơn). Row đầu tiên (không có prevPos)
    // suy ra hướng từ row kế tiếp (nextPos) theo chiều ngược lại. Lệch thêm 90° cục bộ.
    faceQueueRow(row: HumanRow, fromPos: Vec3, prevPos: Vec3 | null, nextPos: Vec3 | null = null) {
        let target = prevPos
            || (nextPos && fromPos.clone().add(fromPos.clone().subtract(nextPos)))
            || fromPos.clone().add(v3(0, 1, 0));
        this.faceTowards(row, fromPos, target, 90);
    }

    // Người trên ring: bật chạy. row.node đã hướng vào tâm ring (updateRingSlots) — lệch thêm 90°
    // cục bộ để người hướng tiếp tuyến thay vì hướng vào tâm.
    activateRingHumans(row: HumanRow) {
        row.humans.forEach(h => {
            h.node.eulerAngles = v3(0, 0, 90);
            h.setMoving(!EDITOR_NOT_IN_PREVIEW);
        });
    }

    // Người trên hàng chờ: lệch cục bộ -90° so với hướng của row, đứng yên.
    orientQueueHumans(row: HumanRow) {
        row.humans.forEach(h => {
            h.node.eulerAngles = v3(0, 0, -90);
        });
    }

    // Góc tuyệt đối của slot i, tính thẳng từ index cố định + ringProgress hiện tại (0..1) — không phụ
    // thuộc trạng thái row/tween nào nên luôn nhất quán, không thể lệch/trôi.
    getSlotAngle(slotIndex: number): number {
        if(this.ringSlotCount == 0) return 0;
        let dir = this.ringReverse ? -1 : 1;
        let a = (slotIndex / this.ringSlotCount) * 360 + dir * this.ringProgress * 360 + this.ringAngleOffset;
        return ((a % 360) + 360) % 360;
    }

    // So khoảng [min, max] có xử lý khoảng CẮT QUA mốc 0/360 (VD min=350, max=10).
    isInAngleRange(a: number, min: number, max: number): boolean {
        a = ((a % 360) + 360) % 360;
        min = ((min % 360) + 360) % 360;
        max = ((max % 360) + 360) % 360;
        if(min <= max) return a >= min && a <= max;
        return a >= min || a <= max;
    }

    // Khoảng cách góc ngắn nhất giữa 2 góc (0-360), có xử lý vòng qua mốc 0/360.
    angleDist(a: number, b: number): number {
        let d = Math.abs(a - b);
        return Math.min(d, 360 - d);
    }

    // Cửa sổ chính diện có thể chứa nhiều row cùng lúc — trả về hết để checkBus() dò đủ.
    getFrontRows(): HumanRow[] {
        if(!this.ringNode) return [];
        let rows: HumanRow[] = [];
        for(let i = 0; i < this.ringRows.length; i++) {
            let row = this.ringRows[i];
            if(!row || row.moving) continue;
            if(this.isInAngleRange(this.getSlotAngle(i), this.ringFrontAngleMin, this.ringFrontAngleMax)) {
                rows.push(row);
            }
        }
        return rows;
    }

    sampleLine(line2D: Line2D, spacing: number): Vec3[] {
        line2D.init();
        let amount = Math.max(1, Math.floor(line2D.totalLength / spacing));
        let poses: Vec3[] = [];
        for(let i = 0; i < amount; i++) {
            let p = line2D.getPositionByRatio(i/amount).pos;
            poses.push(this.human.inverseTransformPoint(v3(), p));
        }
        poses.reverse();
        return poses;
    }

    // Đặt vị trí/góc TUYỆT ĐỐI cho từng slot trên ring mỗi frame: ringProgress tăng dần liên tục, vị trí
    // mỗi slot = hàm số của (index cố định, ringProgress) nên không tích luỹ sai số theo thời gian.
    updateRingSlots(deltaTime: number) {
        if(!this.ringNode?.isValid || this.ringSlotCount == 0) return;
        this.ringProgress = (this.ringProgress + deltaTime / this.ringRevolveSeconds) % 1;
        let dir = this.ringReverse ? -1 : 1;
        for(let i = 0; i < this.ringRows.length; i++) {
            let row = this.ringRows[i];
            if(!row || row.moving) continue;
            let pos = this.ringPointAt(i / this.ringSlotCount + dir * this.ringProgress);
            row.node.position = pos;
            row.node.eulerAngles = v3(0, 0, this.computeFacingAngle(pos, this.ringCenter));
        }
    }

    isEmptySlot(i: number): boolean {
        let row = this.ringRows[i];
        return !!row && !row.moving && row.humans.length == 0;
    }

    // Gom các slot rỗng liền kề (có xử lý vòng qua mốc đầu/cuối vì ring khép kín) thành từng khoảng.
    // Bắt đầu quét ngay SAU 1 slot không rỗng để 1 khoảng không bị cắt đôi ở mốc index 0/n-1.
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

    // Mỗi slot trống được gán CỐ ĐỊNH cho 1 bên (slotOwner) từ lúc trống tới lúc được feed. Trong 1 khoảng
    // trống liền nhau, slot kề nhau gán xen kẽ trái/phải; slot đầu tiên của khoảng gán cho bên đang được
    // gán ít hơn → tổng thể 50/50. Bên nào hết người thì bên kia lấy luôn slot đó.
    // (leftFeedAngle/rightFeedAngle ± tolerance quyết định THỜI ĐIỂM feed.)
    slotOwner: ('L' | 'R')[] = [];
    leftAssigned: number = 0;
    rightAssigned: number = 0;
    assignSlot(i: number, owner: 'L' | 'R') {
        this.slotOwner[i] = owner;
        if(owner == 'L') this.leftAssigned++;
        else this.rightAssigned++;
    }
    tryFeedEmptySlots() {
        let n = this.ringRows.length;
        for(let i = 0; i < n; i++) {
            if(!this.isEmptySlot(i)) this.slotOwner[i] = undefined;
        }
        this.getEmptyGaps().forEach(gap => {
            let first = gap.findIndex(i => this.slotOwner[i]);
            if(first < 0) {
                first = 0;
                this.assignSlot(gap[0], this.leftAssigned <= this.rightAssigned ? 'L' : 'R');
            }
            // lan ra 2 phía từ slot đã có chủ, slot kề nhau khác bên nhau
            for(let k = first + 1; k < gap.length; k++) {
                if(!this.slotOwner[gap[k]]) this.assignSlot(gap[k], this.slotOwner[gap[k - 1]] == 'L' ? 'R' : 'L');
            }
            for(let k = first - 1; k >= 0; k--) {
                if(!this.slotOwner[gap[k]]) this.assignSlot(gap[k], this.slotOwner[gap[k + 1]] == 'L' ? 'R' : 'L');
            }
        });

        for(let i = 0; i < n; i++) {
            if(!this.isEmptySlot(i)) continue;
            let a = this.getSlotAngle(i);
            let owner = this.slotOwner[i];
            let leftOk = owner == 'L' || this.rightQueue.length == 0;
            let rightOk = owner == 'R' || this.leftQueue.length == 0;
            if(leftOk && this.leftQueue.length > 0
            && this.angleDist(a, this.leftFeedAngle) <= this.leftFeedAngleTolerance) {
                this.feedSlotFrom(this.leftQueue, this.leftLposes, i);
            } else if(rightOk && this.rightQueue.length > 0
            && this.angleDist(a, this.rightFeedAngle) <= this.rightFeedAngleTolerance) {
                this.feedSlotFrom(this.rightQueue, this.rightLposes, i);
            }
        }
    }

    // ringRow (this.ringRows[slotIndex]) là node CỐ ĐỊNH, chỉ có NGƯỜI được chuyển từ feederRow (đầu hàng
    // chờ) vào bên trong nó. Người được add ngay vào ringRow.node (addToParent giữ world pos/rot) rồi tween
    // tới chỗ trong row, nên tự bám theo ring đang quay suốt lúc tween.
    feedSlotFrom(queue: HumanRow[], lposes: Vec3[], slotIndex: number) {
        let feederRow = queue.shift();
        if(!feederRow) return;

        let ringRow = this.ringRows[slotIndex];
        if(!ringRow) return;

        // chặn feed đè lần 2 lên cùng slot / checkBus lấy người lúc đang dở dang
        ringRow.moving = true;

        let duration = 0.2;
        let humans = feederRow.humans;
        let doneCount = 0;

        // Row rỗng thì finalize ngay, tránh ringRow.moving kẹt mãi true.
        if(humans.length == 0) {
            ringRow.humans = humans;
            ringRow.color = feederRow.color;
            feederRow.node.destroy();
            ringRow.moving = false;
        }

        humans.forEach((h, i) => {
            Ulis.addToParent(h.node, ringRow.node);
            h.row = ringRow;
            h.setMoving(true);

            let targetAngle = nearestAngle(90, h.node.eulerAngles.z);

            tween(h.node)
            .to(duration, {
                position: this.rowLocalPos(i, humans.length, v3(0, this.humanDis.y, 0)),
                eulerAngles: v3(0, 0, targetAngle),
            })
            .call(() => {
                doneCount++;
                // Chỉ finalize khi TẤT CẢ người trong row đã tween xong.
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
            let isLeft = queue === this.leftQueue;
            let offset = isLeft ? v3(0, -this.humanDis.y, 0) : null;
            let newRow = this.spawnRow(colors, isLeft ? this.rowLeftNode : this.rowRightNode, pos, offset);
            this.faceQueueRow(newRow, pos, idx > 0 ? lposes[idx - 1] : null, lposes[idx + 1] || null);
            this.orientQueueHumans(newRow);
            queue.push(newRow);
        }
    }

    // ring kín (mọi slot đều có người) — điều kiện thua của map RingFeeder
    isRingFull(): boolean {
        if(this.ringRows.length == 0) return false;
        return this.ringRows.every(r => r && r.humans.length > 0);
    }

    // xe trong slot lấy người từ các row đúng màu đang ở vùng chính diện (tối đa bus.remain người)
    checkBus(bus: Bus): Human[] {
        let humans: Human[] = [];
        if(bus.moving) return humans;

        let color = bus.color;
        let r = bus.remain;
        if(r == 0) return humans;

        for(let frontRow of this.getFrontRows().filter(row => row.color == color)) {
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

    // map RingFeeder: đổ row từ hàng chờ vào slot trống, xe trong slot lấy người ở vùng chính diện
    boardFeederRing() {
        this.tryFeedEmptySlots();
        this.outsideHumans = this.getFrontHumans();
        let humans: Human[] = [];
        this.slots.map(s => s.bus).filter(b => b).forEach(b => {
            humans = humans.concat(this.checkBus(b));
        });
        if(humans.length > 0) this.removeHumans(humans);
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

        let row: RingRow | HumanRow = human.row;
        if(row) {
            let j = row.humans.indexOf(human);
            if(j >= 0) {
                row.humans.splice(j, 1);
                if(row instanceof RingRow) row.lanes.splice(j, 1);
            }
        }
        human.row = null;
        if(this.isFeeder()) this.outsideHumans = this.getFrontHumans();

        this.movingHumans.push(human);
    }

    removeHumans(humans: Human[]) {
        humans.forEach(h => this.removeHuman(h));
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
                    // Ring3D: người lên xe ở lối ra của ring (checkRingExit); RingFeeder: lấy luôn người ở vùng chính diện
                    bus.onSlot();
                    if(this.isFeeder()) {
                        let humans = this.checkBus(bus);
                        if(humans.length > 0) this.removeHumans(humans);
                    }
                }, this.busSpeed, true, null, 0.3);
            }, this.busSpeed, true, null, 0.3);
            let paScale = this.bus.getScale();
            let mul = 1.5;
            // cỡ trong slot cố định, không phụ thuộc busScale
            let scale = v3(mul/paScale.x, mul/paScale.y, mul/paScale.z);
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

    // ring hết đường cứu: Ring3D = không row nào cùng màu xe đang chờ; RingFeeder = ring kín người
    ringStuck() {
        return this.isFeeder() ? this.isRingFull() : !this.ringCanBoard();
    }

    checkBuses() {
        // Ring3D: người lên xe ở lối ra của ring (checkRingExit, gọi trong updateRing) — ở đây chỉ xét thua
        if(this.isFeeder()) this.boardFeederRing();
        if(this.movingHumans.length == 0 && !this.slots.find(s => !s.bus)) {

            let buses = this.slots.map(s => s.bus).filter(b => b);
            let movingBus = buses.find(b => b.moving || b.packing);

            if(!movingBus && !this.lose && this.ringStuck() && !this.loseCheckTween) {

                console.log("Check lose");

                this.loseCheckTween = tween({})
                .delay(3)
                .call(() => {
                    this.loseCheckTween = null;

                    if(this.movingHumans.length == 0 && !this.slots.find(s => !s.bus)) {
                        let movingBus = buses.find(b => b.moving || b.packing);
                        if(!movingBus && !this.lose && this.ringStuck() && !this.loseCheckTween) {

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
        if(EDITOR_NOT_IN_PREVIEW) return;
        if(this.isFeeder()) this.updateRingSlots(deltaTime);
        else this.updateRing(deltaTime);
    }

    onDestroy() {
        clearTimeout(this.ringRelayoutTimer);
        if(this.line3DRing?.isValid) this.line3DRing.node.off(Line3DRing.REBUILT, this.onRingRebuilt, this);
    }
}


