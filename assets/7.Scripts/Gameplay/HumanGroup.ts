import { _decorator, AnimationClip, CCInteger, CCObject, Component, Enum, Node, Tween, tween, v2, v3, Vec3 } from 'cc';
import type { Game } from './Game';
import type { Bus } from './Bus';
import { Anim, Human } from './Human';
import { pm } from '../Pool/PoolManager';
import { PoolType } from '../Pool/PoolMember';
import Ulis from '../Misc/Ulis';
import { EDITOR_NOT_IN_PREVIEW } from 'cc/env';
const { ccclass, property, executeInEditMode } = _decorator;

// Nhóm người đứng riêng (port từ Bus Jam): khách của loại xe Group Bus Type, không lấy người từ ring mà đứng thành 1 nhóm riêng.
// Xe đó vào slot thì cả nhóm đi thẳng lên xe.
// Gắn trên node Gameplay cùng Game (Game tự thêm lúc onLoad nếu thiếu); Game gọi init() sau initBuses,
// gọi board() khi xe vào slot, và bỏ xe đó ra khỏi phần chia row người cho ring.
// Người trong nhóm nằm dưới node MovingHumans (cùng transform với node Human, luôn active).
// Số người của nhóm = Bus.totalSeats (= Capacity, hoặc số ghế * humanPerRow nếu Capacity = 0).

// anim của người trong nhóm lúc đứng chờ
export enum GroupAnim {
    Idle,      // đứng thở (clip Idle)
    Run,       // chạy tại chỗ (clip Run)
    Hop,       // Idle + nhảy lên xuống
    Panic,     // chạy tại chỗ + nhảy lên xuống: hoảng loạn chờ cứu
    Wave,      // vẫy tay kêu cứu (clip Wave Clip)
    PanicWave, // Panic trong Panic Time giây -> Wave trong Wave Time giây -> 1 frame -> lặp lại
    Random,    // bình thường Idle; cứ Random Min..Max giây chọn 1 người trong nhóm làm 1 hành động bốc từ Random Pool rồi về Idle
    WaveHop,   // vẫy tay + nhảy lên xuống (không chạy)
    Leader,    // đứng Idle nhảy Leader Hops lần -> vẫy tay Leader Waves lần -> lặp. Lúc bắt đầu vẫy thì gọi những người Follow vẫy theo
    Follow,    // đứng Idle; mỗi khi Leader bắt đầu vẫy thì vẫy theo 1 lần rồi về Idle
}

@ccclass('HumanGroup')
@executeInEditMode(true)
export class HumanGroup extends Component {
    @property({tooltip: "Khách của xe Group Bus Type đứng thành nhóm riêng. Tắt = xe đó lấy người từ ring như xe thường"})
    separate: boolean = true;
    @property({type: Enum(PoolType), visible() { return this.separate; }, tooltip: "Loại xe có nhóm khách đứng riêng (mặc định Sleigh = xe trượt ông già Noel)"})
    busType: PoolType = PoolType.Sleigh;
    @property({type: CCInteger, min: 0, visible() { return this.separate; }, tooltip: "Số người xe Group Bus Type chở được (= số người trong nhóm của mỗi xe). 0 = theo số ghế * humanPerRow như xe thường"})
    capacity: number = 1;
    @property({type: Enum(PoolType), visible() { return this.separate; }, tooltip: "Loại người của nhóm (prefab trong PoolControl): Fireman = lính cứu hoả, Human = khách thường cùng màu xe. Wave Clip phải hợp rig: Fireman dùng 1.Animations/Fireman/Wave"})
    groupType: PoolType = PoolType.Santa;
    @property({range: [0.5, 4, 0.05], slide: true, visible() { return this.separate; }, tooltip: "Độ to của người trong nhóm so với prefab (1 = như prefab)"})
    humanScale: number = 1.8;
    @property({type: [Node], visible() { return this.separate; }, tooltip: "Đường đi riêng của nhóm ra xe (theo thứ tự): cả nhóm nối đuôi qua các điểm này rồi vào cửa xe. Trống = đi thẳng tới hàng ngay trên xe rồi rẽ ngang vào cửa (như người thường)"})
    exitPoints: Node[] = [];
    @property({range: [-80, 0, 1], slide: true, visible() { return this.separate; }, tooltip: "Góc ngả model về phía camera lúc đứng chờ (Human.spin, khách thường -10)"})
    lean: number = -10;
    @property({type: Node, visible() { return this.separate; }, tooltip: "Node chứa các node con, mỗi con = chỗ đứng của 1 người (theo thứ tự, nhiều xe thì nối tiếp). Kéo node con trong Scene để xếp từng người, kéo node cha để dời cả nhóm. Đổi Cols / Gap / Row Gap / Brick thì các node con tự xếp lại theo lưới quanh node cha (mất chỉnh tay)"})
    layout: Node = null;
    @property({type: Node, visible() { return this.separate && !this.layout; }, tooltip: "Tâm nhóm khách khi không dùng Layout. Để trống = cạnh trái slot ngoài cùng bên trái, dời theo Offset"})
    point: Node = null;
    @property({visible() { return this.separate && !this.layout && !this.point; }, tooltip: "Tâm nhóm so với slot ngoài cùng bên trái (toạ độ local của node Human) khi không có Layout / Point"})
    offset: Vec3 = v3(-1.5, 0.6, 0);
    @property({type: CCInteger, min: 1, visible() { return this.separate; }, tooltip: "Số người mỗi hàng ngang của nhóm"})
    cols: number = 5;
    @property({range: [0.05, 1, 0.01], slide: true, visible() { return this.separate; }, tooltip: "Khoảng cách ngang giữa người trong nhóm (toạ độ local của node Human)"})
    gap: number = 0.3;
    @property({range: [0.05, 1, 0.01], slide: true, visible() { return this.separate; }, tooltip: "Khoảng cách giữa các hàng của nhóm (toạ độ local của node Human)"})
    rowGap: number = 0.3;
    @property({visible() { return this.separate; }, tooltip: "Hàng lẻ lệch nửa ô (kiểu xếp gạch) để người hàng sau không bị người hàng trước che"})
    brick: boolean = true;
    @property({range: [0, 0.5, 0.01], slide: true, visible() { return this.separate && !this.layout; }, tooltip: "Độ lệch ngẫu nhiên vị trí từng người (tỉ lệ Gap). 0 = thẳng hàng gọn gàng"})
    jitter: number = 0;
    @property({range: [0, 1, 0.01], slide: true, visible() { return this.separate; }, tooltip: "Khoảng cách thời gian (giây) giữa 2 người liên tiếp xuất phát lên xe -> nối đuôi thành hàng thay vì ùa xuống cùng lúc"})
    boardGap: number = 0.12;
    @property({type: Enum(GroupAnim), visible() { return this.separate; }, tooltip: "Anim lúc đứng chờ: Idle đứng thở, Run chạy tại chỗ, Hop đứng + nhảy, Panic chạy tại chỗ + nhảy, Wave vẫy tay, WaveHop vẫy tay + nhảy, PanicWave = Panic rồi Wave rồi lặp, Leader / Follow = 1 người dẫn nhịp, cả nhóm vẫy theo"})
    anim: GroupAnim = GroupAnim.Follow;
    @property({type: Enum(GroupAnim), visible() { return this.separate; }, tooltip: "Anim của người đứng lẻ ở hàng cuối (hàng chưa đủ Cols người). Nhóm đủ hàng thì người cuối cùng dùng anim này"})
    soloAnim: GroupAnim = GroupAnim.Leader;
    @property({type: [Enum(GroupAnim)], visible() { return this.separate && this.uses(GroupAnim.Random); }, tooltip: "Random: các hành động được bốc ngẫu nhiên xen giữa Idle (Idle trong danh sách bị bỏ qua; có từ 2 hành động thì không bốc trùng lần trước). Thời gian: Wave = Wave Time, PanicWave = Panic Time + Wave Time, còn lại = Panic Time"})
    randomPool: GroupAnim[] = [GroupAnim.Wave];
    @property({range: [0.5, 20, 0.1], slide: true, visible() { return this.separate && this.uses(GroupAnim.Random); }, tooltip: "Random: cứ ít nhất bao nhiêu giây thì chọn 1 người làm hành động (cả nhóm chung 1 nhịp, mỗi lần 1 người)"})
    randomMin: number = 3;
    @property({range: [0.5, 20, 0.1], slide: true, visible() { return this.separate && this.uses(GroupAnim.Random); }, tooltip: "Random: cứ nhiều nhất bao nhiêu giây thì chọn 1 người làm hành động"})
    randomMax: number = 5;
    @property({type: CCInteger, min: 0, visible() { return this.separate && this.uses(GroupAnim.Leader); }, tooltip: "Leader: số lần nhảy trước khi vẫy"})
    leaderHops: number = 2;
    @property({type: CCInteger, min: 1, visible() { return this.separate && this.uses(GroupAnim.Leader); }, tooltip: "Leader: số lần vẫy (số vòng clip vẫy tay) rồi mới lặp lại từ nhảy"})
    leaderWaves: number = 2;
    @property({type: CCInteger, min: 1, visible() { return this.separate && this.uses(GroupAnim.Follow); }, tooltip: "Follow: số lần vẫy theo mỗi khi Leader bắt đầu vẫy"})
    followWaves: number = 1;
    @property({type: AnimationClip, visible() { return this.separate && this.uses(GroupAnim.Wave, GroupAnim.PanicWave, GroupAnim.Random, GroupAnim.WaveHop, GroupAnim.Leader, GroupAnim.Follow); }, tooltip: "Clip vẫy tay (Fireman: 1.Animations/Fireman/Wave.anim)"})
    waveClip: AnimationClip = null;
    @property({range: [0.2, 3, 0.05], slide: true, visible() { return this.separate && this.uses(GroupAnim.Wave, GroupAnim.PanicWave, GroupAnim.Random, GroupAnim.WaveHop, GroupAnim.Leader, GroupAnim.Follow); }, tooltip: "Tốc độ clip vẫy tay"})
    waveSpeed: number = 1;
    @property({range: [0.2, 10, 0.1], slide: true, visible() { return this.separate && this.uses(GroupAnim.PanicWave, GroupAnim.Random); }, tooltip: "PanicWave / Random: thời gian Panic (chạy tại chỗ + nhảy) mỗi vòng (giây)"})
    panicTime: number = 2;
    @property({range: [0.2, 10, 0.1], slide: true, visible() { return this.separate && this.uses(GroupAnim.PanicWave, GroupAnim.Random); }, tooltip: "PanicWave / Random: thời gian vẫy tay mỗi vòng (giây), xong 1 frame thì lặp lại"})
    waveTime: number = 3;
    @property({range: [0, 0.3, 0.01], slide: true, visible() { return this.separate && this.uses(GroupAnim.Hop, GroupAnim.Panic, GroupAnim.PanicWave, GroupAnim.WaveHop, GroupAnim.Leader); }, tooltip: "Độ cao nhảy (toạ độ local của người)"})
    hopHeight: number = 0.12;
    @property({range: [0.1, 1, 0.01], slide: true, visible() { return this.separate && this.uses(GroupAnim.Hop, GroupAnim.Panic, GroupAnim.PanicWave, GroupAnim.WaveHop, GroupAnim.Leader); }, tooltip: "Thời gian 1 lần nhảy (giây)"})
    hopTime: number = 0.3;
    @property({range: [0, 2, 0.05], slide: true, visible() { return this.separate && this.uses(GroupAnim.Hop, GroupAnim.Panic, GroupAnim.PanicWave, GroupAnim.WaveHop, GroupAnim.Leader); }, tooltip: "Nghỉ ngẫu nhiên tối đa giữa các lần nhảy (giây)"})
    hopRest: number = 0.2;

    // Game gán lúc onLoad
    g: Game = null;

    // người chưa được gọi lên xe, theo từng xe
    groups: Map<Bus, Human[]> = new Map();
    // mọi người của nhóm theo thứ tự sinh (khớp thứ tự node con của layout)
    all: Human[] = [];
    // người đang nhảy lên xuống
    hopping: Set<Human> = new Set();
    // Random: người đang đứng chờ gọi tên / đang làm hành động / người vừa làm, và bộ hẹn giờ chung
    randomers: Set<Human> = new Set();
    acting: Set<Human> = new Set();
    lastActor: Human = null;
    randomTimer: object = null;
    // Follow: những người vẫy theo Leader
    followers: Set<Human> = new Set();
    // editor: tham số lưới lần trước, đổi thì xếp lại node con của layout
    gridSig: string = '';
    // editor (không dùng Layout): chỗ đứng đã đặt cho từng người + [nhóm k, thứ tự i, số người n] để xếp lại khi Point đổi
    homes: Vec3[] = [];
    places: number[][] = [];
    // editor: vị trí world của Point lần trước + tham số lưới, đổi thì xếp lại cả nhóm
    pointSig: string = '';
    // editor: vừa dời Point do kéo người, chờ thả chuột thì ghi 1 bước undo + đánh dấu scene đã đổi
    pendingSnap: boolean = false;

    // xe có khách đứng riêng (loại Group Bus Type)
    isGroupBus(b: Bus) {
        return this.separate && b?.type == this.busType;
    }

    // sức chứa riêng của xe có nhóm khách đứng riêng; 0 = xe thường / không giới hạn riêng (Bus.init dùng)
    capacityOf(b: Bus) {
        return this.isGroupBus(b) && this.capacity > 0 ? this.capacity : 0;
    }

    // anim (thường, người lẻ, hoặc trong Random Pool khi dùng Random) có dùng 1 trong các kiểu này
    uses(...a: GroupAnim[]) {
        let modes = [this.anim, this.soloAnim];
        if(modes.indexOf(GroupAnim.Random) >= 0) modes = modes.concat(this.randomPool);
        return modes.some(m => a.indexOf(m) >= 0);
    }

    // node cha của người trong nhóm: cùng transform với node Human nhưng luôn active
    // (ở ring mode node Human gốc chỉ là template, đang inactive)
    root() { return this.g.getMovingHumanRoot(); }

    // đổi vị trí world sang local của root
    toLocal(w: Readonly<Vec3>) { return this.root().inverseTransformPoint(v3(), w); }

    // tâm nhóm (local trong root): node cha Layout > Point > slot ngoài cùng bên trái + Offset
    center() {
        let ref = this.layout ?? this.point;
        if(ref) return this.toLocal(ref.worldPosition);
        let slots = this.g.slots.filter(s => s?.isValid).map(s => this.toLocal(s.node.worldPosition));
        if(slots.length == 0) return this.offset.clone();
        let left = slots.reduce((a, b) => b.x < a.x ? b : a);
        return left.add(this.offset);
    }

    // sinh nhóm khách cho mỗi xe Group Bus Type (đủ Bus.totalSeats người): đứng theo node con của layout, thiếu thì theo lưới
    init() {
        const g = this.g;
        this.all.forEach(h => { if(h?.isValid) { this.stopAnim(h); h.node.destroy(); } });
        this.groups.clear();
        this.all = [];
        this.homes = [];
        this.places = [];
        this.pointSig = '';
        this.hopping.clear();
        this.randomers.clear();
        this.acting.clear();
        this.lastActor = null;
        if(this.randomTimer) Tween.stopAllByTarget(this.randomTimer);
        this.randomTimer = null;
        this.followers.clear();
        if(!this.separate) return;
        let c = this.center();
        let missing = false;
        g.buses.filter(b => this.isGroupBus(b)).forEach((bus, k) => {
            // sức chứa riêng: đặt lại ở đây cho chắc (trong editor Bus.init có thể chạy lúc HumanGroup chưa sẵn sàng)
            let cap = this.capacityOf(bus);
            if(cap && !bus.humans.length && bus.totalSeats != cap) {
                bus.totalSeats = cap;
                bus.remain = cap;
            }
            let list: Human[] = [];
            let n = bus.totalSeats;
            for(let i = 0; i < n; i++) {
                let h = pm.spawnType<Human>(this.groupType);
                if(!h) {
                    // editor: pool có thể chưa nạp xong lúc Game.start -> thử lại khung hình sau; lúc chơi thì báo lỗi
                    if(EDITOR_NOT_IN_PREVIEW) missing = true;
                    else console.error("HumanGroup: thiếu prefab", PoolType[this.groupType], "trong PoolControl");
                    break;
                }
                h.init(bus.color, v2(), 0);
                h.node.parent = this.root();
                h.node._objFlags = CCObject.Flags.DontSave;
                h.node.setScale(h.node.scale.clone().multiplyScalar(this.humanScale));
                h.node.position = this.layoutPos(this.all.length) ?? this.gridPos(c, k, i, n, true);
                h.node.eulerAngles = v3(0, 0, -180);
                h.spin(this.lean);
                // luôn hiện model 3D (người trên ring có thể đang dùng sprite 2D - human2D - chỉ là bóng tô màu xe)
                h.show3D();
                if(h.shadow) h.shadow.node.active = true;
                this.playAnim(h, this.isSolo(i, n) ? this.soloAnim : this.anim);
                list.push(h);
                this.all.push(h);
                this.homes.push(h.node.position.clone());
                this.places.push([k, i, n]);
            }
            this.groups.set(bus, list);
        });
        if(missing && this.initRetry++ < 20) this.scheduleOnce(() => this.init(), 0.1);
    }
    initRetry: number = 0;

    // người thứ i (trong nhóm n người) đứng ở hàng cuối chưa đủ Cols người;
    // nhóm đủ hàng thì chỉ người cuối cùng (để luôn có 1 Leader khi Solo Anim = Leader)
    isSolo(i: number, n: number) {
        if(n % this.cols == 0) return i == n - 1;
        return i >= n - n % this.cols;
    }

    // chỗ đứng theo lưới của người thứ i trong nhóm k (n người), local trong root quanh tâm c.
    // Hàng cuối ít người hơn thì dồn vào giữa; nhiều nhóm thì nối nhau sang trái
    gridPos(c: Vec3, k: number, i: number, n: number, jitter = false) {
        const step = this.gap;
        const rstep = this.rowGap;
        let rows = Math.ceil(n / this.cols);
        let col = i % this.cols, row = (i / this.cols) | 0;
        let inRow = row == rows - 1 ? n - row * this.cols : this.cols;
        let shift = this.brick && inRow == this.cols ? (row % 2 ? 0.25 : -0.25) : 0;
        let j = jitter ? this.jitter : 0;
        let x = -k * (this.cols + 1) * step + (col - (inRow - 1) / 2 + shift) * step + (Math.random() - 0.5) * 2 * j * step;
        let y = ((rows - 1) / 2 - row) * rstep + (Math.random() - 0.5) * 2 * j * rstep;
        return v3(c.x + x, c.y + y, c.z);
    }

    // editor: xếp lại node con của layout theo lưới (đủ 1 node cho mỗi người, thừa thì xoá); update() đưa người về chỗ mới
    applyGrid() {
        const g = this.g;
        let c = this.center();
        let pos: Vec3[] = [];
        g.buses.filter(b => this.isGroupBus(b)).forEach((bus, k) => {
            let n = bus.totalSeats;
            for(let i = 0; i < n; i++) pos.push(this.gridPos(c, k, i, n));
        });
        if(pos.length == 0) return;
        let kids = this.layout.children.slice();
        pos.forEach((p, i) => {
            let n = kids[i];
            if(!n) {
                n = new Node(String(i + 1));
                n.parent = this.layout;
            }
            n.worldPosition = Vec3.transformMat4(v3(), p, this.root().worldMatrix);
        });
        kids.slice(pos.length).forEach(n => n.destroy());
    }

    // chỗ đứng của người thứ i theo node con của layout (local trong root); null = không có
    layoutPos(i: number) {
        let n = this.layout?.children[i];
        if(!n) return null;
        return this.toLocal(n.worldPosition);
    }

    // model của người (con đầu tiên)
    model(h: Human) { return h.node.children[0]; }

    // đỉnh cú nhảy (local trong người): dọc trục thân model (trục Y của model, spin() đã nghiêng 35° về camera) thay vì
    // thẳng đứng khỏi mặt đất -> model chạy lên trên màn hình, không lại gần camera phối cảnh (trông như cúi đầu)
    hopTop(h: Human) {
        return Vec3.transformQuat(v3(), Vec3.UNIT_Y, this.model(h).rotation).multiplyScalar(this.hopHeight);
    }

    // phát clip (Idle / Run / vẫy tay). phase 0..1 = bắt đầu ở vị trí ngẫu nhiên trong clip, <0 = từ đầu
    playClip(h: Human, clip: string, phase = -1) {
        let wave = clip == 'wave' && !!this.waveClip;
        if(clip == 'wave') clip = wave ? this.waveClip.name : Anim.Idle;
        if(wave) this.makeLive(h);
        h.anim.crossFade(clip, 0.15);
        let st = h.anim.getState(clip);
        if(st) st.speed = wave ? this.waveSpeed : h.runSpeed;
        // phát từ đầu (state cũ có thể vẫn chạy ngầm ở weight 0) -> Leader và Follow vẫy cùng nhịp
        if(phase < 0) { st?.setTime(0); return; }
        // lệch pha để cả nhóm không cử động đồng loạt (đặt sau 1 frame: ngay lúc play, state còn bị reset về 0)
        this.scheduleOnce(() => {
            let s = h.isValid && h.anim.getState(clip);
            if(s && s.isPlaying) s.setTime(phase * s.duration);
        });
    }

    // chuyển người sang skinning thường (1 lần, không bao giờ bật lại baked) để phát được clip vẫy tay:
    // - clip thêm lúc runtime thì baked không dựng được (model phình to)
    // - bật/tắt baked qua lại làm hỏng dữ liệu baked dùng chung -> model to / méo cả người khác
    // - state Idle/Run dựng lúc baked không ghi xương ở non-baked (đứng dang tay) -> dựng lại state
    // Người không bao giờ vẫy thì giữ baked như khách thường
    makeLive(h: Human) {
        if(!h.anim.useBakedAnimation) {
            if(!h.anim.getState(this.waveClip.name)) h.anim.addClip(this.waveClip);
            return;
        }
        h.anim.useBakedAnimation = false;
        h.anim.clips.forEach(c => {
            if(!c) return;
            h.anim.removeState(c.name);
            h.anim.createState(c, c.name);
        });
        if(!h.anim.getState(this.waveClip.name)) h.anim.addClip(this.waveClip);
    }

    playAnim(h: Human, mode: GroupAnim) {
        this.stopAnim(h);
        // người sẽ vẫy tay: chuyển skinning thường ngay từ đầu (không đổi giữa chừng lúc đang chạy)
        const waves = (m: GroupAnim) => m == GroupAnim.Wave || m == GroupAnim.PanicWave || m == GroupAnim.WaveHop || m == GroupAnim.Leader || m == GroupAnim.Follow;
        if(this.waveClip && (waves(mode) || (mode == GroupAnim.Random && this.randomPool.some(waves)))) this.makeLive(h);
        if(mode == GroupAnim.Leader) { this.leaderLoop(h, true); return; }
        if(mode == GroupAnim.Follow) {
            this.applyMode(h, GroupAnim.Idle, true);
            this.followers.add(h);
            return;
        }
        if(mode != GroupAnim.Random) { this.applyMode(h, mode, true); return; }
        // Random: đứng Idle, chờ bộ hẹn giờ chung của nhóm (randomTick) gọi tên mới làm hành động
        this.applyMode(h, GroupAnim.Idle, true);
        this.randomers.add(h);
        this.startRandomTick();
    }

    // bộ hẹn giờ chung của những người Random: cứ Random Min..Max giây chọn 1 người đang Idle
    // (không chọn lại người vừa làm) làm 1 hành động bốc từ Random Pool, xong về Idle.
    // Chung 1 timer để không bao giờ cả nhóm làm hành động cùng lúc
    startRandomTick() {
        if(this.randomTimer) return;
        const lo = Math.min(this.randomMin, this.randomMax), hi = Math.max(this.randomMin, this.randomMax);
        this.randomTimer = {};
        const tick = (first: boolean) => {
            tween(this.randomTimer).delay(first ? Math.random() * lo : lo + Math.random() * (hi - lo)).call(() => {
                this.randomAct();
                tick(false);
            }).start();
        };
        tick(true);
    }

    randomAct() {
        let pool = this.randomPool.filter(m => m != GroupAnim.Random && m != GroupAnim.Idle);
        if(pool.length == 0) return;
        let free = Array.from(this.randomers).filter(h => h.isValid && !h.bus && !this.acting.has(h));
        if(free.length > 1) free = free.filter(h => h != this.lastActor);
        if(free.length == 0) return;
        const h = free[(Math.random() * free.length) | 0];
        this.lastActor = h;
        const mode = pool[(Math.random() * pool.length) | 0];
        this.acting.add(h);
        this.applyMode(h, mode, false);
        tween(h).delay(this.actTime(mode)).call(() => {
            this.acting.delete(h);
            if(!h.isValid || h.bus || !this.randomers.has(h)) return;
            Tween.stopAllByTarget(h.anim);
            this.stopHop(h);
            this.applyMode(h, GroupAnim.Idle, false);
        }).start();
    }

    // thời gian 1 vòng clip vẫy tay (giây, đã tính tốc độ)
    waveDur() { return this.waveClip ? this.waveClip.duration / Math.max(0.01, this.waveSpeed) : 0; }

    // Leader: đứng Idle nhảy leaderHops lần -> vẫy leaderWaves vòng (gọi Follow vẫy theo) -> lặp.
    // Timer + nhảy chạy trên h.anim / model nên stopAnim dừng được
    leaderLoop(h: Human, first: boolean) {
        if(!h.isValid || h.bus) return;
        const m = this.model(h);
        const t = this.hopTime / 2;
        this.playClip(h, Anim.Idle, first ? Math.random() : -1);
        let seq = tween(h.anim);
        // lần đầu chờ chút cho không bật ngay lúc vào game
        if(first) seq = seq.delay(0.3 + Math.random() * 0.5);
        for(let i = 0; i < this.leaderHops; i++) {
            seq = seq.call(() => tween(m)
                    .to(t, {position: this.hopTop(h)}, {easing: 'quadOut'})
                    .to(t, {position: v3(0, 0, 0)}, {easing: 'quadIn'})
                    .start())
                .delay(this.hopTime + 0.05);
        }
        seq.call(() => {
                if(!h.isValid || h.bus) return;
                this.playClip(h, 'wave');
                this.followWave();
            })
            .delay(this.waveDur() * this.leaderWaves)
            .call(() => this.leaderLoop(h, false))
            .start();
    }

    // Leader bắt đầu vẫy: mọi người Follow vẫy followWaves vòng (từ đầu clip, cùng nhịp Leader) rồi về Idle
    followWave() {
        this.followers.forEach(f => {
            if(!f.isValid || f.bus) return;
            Tween.stopAllByTarget(f);
            this.playClip(f, 'wave');
            tween(f).delay(this.waveDur() * this.followWaves).call(() => {
                if(f.isValid && !f.bus && this.followers.has(f)) this.playClip(f, Anim.Idle);
            }).start();
        });
    }

    // Random: thời gian làm 1 hành động trước khi về Idle
    actTime(mode: GroupAnim) {
        switch(mode) {
            case GroupAnim.Wave:
            case GroupAnim.WaveHop: return this.waveTime;
            case GroupAnim.PanicWave: return this.panicTime + this.waveTime;
            default: return this.panicTime;
        }
    }

    // chạy 1 kiểu anim (không phải Random). first = lệch pha ngẫu nhiên cho lần đầu
    applyMode(h: Human, mode: GroupAnim, first: boolean) {
        switch(mode) {
            case GroupAnim.Idle:
            case GroupAnim.Hop:
                this.playClip(h, Anim.Idle, first ? Math.random() : -1);
                if(mode == GroupAnim.Hop) this.startHop(h, first);
                break;
            case GroupAnim.Run:
            case GroupAnim.Panic:
                this.playClip(h, Anim.Run, first ? Math.random() : -1);
                if(mode == GroupAnim.Panic) this.startHop(h, first);
                break;
            case GroupAnim.Wave:
            case GroupAnim.WaveHop:
                this.playClip(h, 'wave', first ? Math.random() : -1);
                if(mode == GroupAnim.WaveHop) this.startHop(h, first);
                break;
            case GroupAnim.PanicWave: {
                // Panic -> Wave -> 1 frame -> lặp. Timer chạy trên h.anim để stopAnim dừng được
                const loop = (first: boolean) => {
                    if(!h.isValid || h.bus) return;
                    this.playClip(h, Anim.Run, first ? Math.random() : -1);
                    this.startHop(h, first);
                    tween(h.anim)
                        .delay(first ? Math.random() * this.panicTime : this.panicTime)
                        .call(() => { this.stopHop(h); this.playClip(h, 'wave'); })
                        .delay(this.waveTime + 1 / 60)
                        .call(() => loop(false))
                        .start();
                };
                loop(first);
                break;
            }
        }
    }

    // nhảy lên xuống liên tục tới khi stopHop
    startHop(h: Human, randomStart: boolean) {
        if(this.hopHeight <= 0) return;
        const m = this.model(h);
        const t = this.hopTime / 2;
        this.hopping.add(h);
        const hop = () => {
            // thôi nhảy: đã stopHop, đã lên xe, hoặc không còn thuộc nhóm (về pool, dùng lại làm khách thường)
            if(!h.isValid || h.bus || !this.hopping.has(h)) { m.isValid && m.setPosition(0, 0, 0); return; }
            tween(m)
                .to(t, {position: this.hopTop(h)}, {easing: 'quadOut'})
                .to(t, {position: v3(0, 0, 0)}, {easing: 'quadIn'})
                .delay(Math.random() * this.hopRest)
                .call(hop)
                .start();
        };
        if(randomStart) tween(m).delay(Math.random() * (this.hopTime + this.hopRest)).call(hop).start();
        else hop();
    }

    stopHop(h: Human) {
        this.hopping.delete(h);
        const m = this.model(h);
        if(!m) return;
        Tween.stopAllByTarget(m);
        m.setPosition(0, 0, 0);
    }

    // dừng mọi anim chờ, model về mặt đất (trước khi đi lên xe / trả về pool). Không bật lại baked (xem makeLive)
    stopAnim(h: Human) {
        if(!h.anim) return;
        this.randomers.delete(h);
        this.acting.delete(h);
        this.followers.delete(h);
        Tween.stopAllByTarget(h);
        Tween.stopAllByTarget(h.anim);
        this.stopHop(h);
    }

    // trong editor: người bám theo node con của layout ngay khi kéo, không cần reload scene;
    // đổi Cols / Gap / Row Gap / Brick thì xếp lại node con theo lưới (lần đầu chỉ ghi nhớ, không đè chỉnh tay)
    update() {
        if(!EDITOR_NOT_IN_PREVIEW || !this.g?.human) return;
        if(!this.layout) { this.followPoint(); return; }
        let sig = [this.cols, this.gap, this.rowGap, this.brick].join();
        if(this.gridSig && sig != this.gridSig) this.applyGrid();
        this.gridSig = sig;
        this.all.forEach((h, i) => {
            if(!h.isValid) return;
            let p = this.layoutPos(i);
            if(p && !p.equals(h.node.position)) h.node.position = p;
        });
    }

    // editor, không dùng Layout: người trong nhóm do code sinh ra (DontSave) nên kéo trực tiếp sẽ không được lưu.
    // - Kéo node Point -> cả nhóm chạy theo ngay.
    // - Kéo 1 người trong nhóm -> dời node Point theo đúng đoạn đã kéo (Point nằm trong scene nên Save là lưu được).
    followPoint() {
        if(!this.point || !this.all.length) return;
        const root = this.root();
        // người bị kéo tay: dời Point theo độ lệch so với chỗ đứng đã đặt
        let dragged = false;
        for(let i = 0; i < this.all.length; i++) {
            let h = this.all[i];
            if(!h?.isValid || h.bus || !this.homes[i]) continue;
            let d = h.node.position.clone().subtract(this.homes[i]);
            if(d.lengthSqr() < 1e-8) continue;
            let w0 = Vec3.transformMat4(v3(), this.homes[i], root.worldMatrix);
            let w1 = Vec3.transformMat4(v3(), h.node.position, root.worldMatrix);
            this.point.worldPosition = this.point.worldPosition.clone().add(w1.subtract(w0));
            dragged = true;
            break;
        }
        if(dragged) this.pendingSnap = true;
        else if(this.pendingSnap) {
            // thả chuột: ghi lại cho editor biết scene đã đổi (Ctrl+S mới lưu vị trí Point), 1 bước undo
            this.pendingSnap = false;
            (globalThis as any).cce?.SceneFacadeManager?.snapshot?.();
        }
        let wp = this.point.worldPosition;
        let sig = [wp.x.toFixed(4), wp.y.toFixed(4), wp.z.toFixed(4), this.cols, this.gap, this.rowGap, this.brick].join();
        if(sig == this.pointSig) return;
        this.pointSig = sig;
        let c = this.center();
        this.all.forEach((h, i) => {
            if(!h?.isValid || h.bus) return;
            let [k, j, n] = this.places[i];
            let p = this.gridPos(c, k, j, n);
            h.node.position = p;
            this.homes[i] = p.clone();
        });
    }

    // xe của nhóm vừa vào slot: gọi tối đa remain người trong nhóm của nó đi lên xe (không đụng tới ring).
    // Người gần xe đi trước, mỗi người xuất phát cách nhau Board Gap giây -> nối đuôi thành hàng
    board(bus: Bus) {
        const g = this.g;
        let list = this.groups.get(bus);
        if(!list || list.length == 0 || bus.remain <= 0) return 0;
        let picked = list.splice(0, bus.remain);
        bus.remain -= picked.length;
        bus.packing = true;
        bus.pHumans = bus.pHumans.concat(picked);
        let door = this.toLocal(Ulis.getWpos(bus.p0.clone(), bus.node));
        let order = picked.slice().sort((a, b) => Vec3.distance(a.node.position, door) - Vec3.distance(b.node.position, door));
        order.forEach((h, i) => {
            this.stopAnim(h);
            h.bus = bus;
            g.movingHumans.push(h);
            tween(h.node).delay(i * this.boardGap).call(() => {
                if(!h.isValid || !bus.isValid) return;
                h.setMoving(true);
                h.node.eulerAngles = v3(0, 0, h.node.eulerAngles.z);
                Ulis.moveToPoints(h.node, this.exitPath(h, bus), () => g.onLastPoint(h, bus), g.humanSpeed, true, null, 1, true);
            }).start();
        });
        return picked.length;
    }

    // đường ra xe: qua Exit Points riêng của nhóm; trống thì đi thẳng tới hàng ngay trên xe
    // (giống Game.moveHuman với người không từ ring). onLastPoint đi tiếp ngang rồi vào cửa
    exitPath(h: Human, bus: Bus) {
        let pts = this.exitPoints.filter(n => n?.isValid).map(n => this.toLocal(n.worldPosition));
        if(pts.length) return pts;
        let p0 = this.g.getBusHumanPos(bus.p0, bus, h);
        let p = h.node.getPosition();
        p.y = p0.y + bus.dis * 3.1;
        return [p];
    }
}
