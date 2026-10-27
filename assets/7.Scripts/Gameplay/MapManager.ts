import { _decorator, Color, Component, Enum, Node } from 'cc';
import { EDITOR } from 'cc/env';
import { gm } from './Game';
import { Line3DRing } from '../../Misc/Line2D/Line3DRing';
const { ccclass, property, executeInEditMode } = _decorator;

// Tên enum = phần sau "Map_" của prefab trong MAP_DIR. Thêm map mới: tạo prefab Map_<Tên>.prefab
// (node gốc có component GameMap) rồi thêm 1 dòng ở đây.
export enum MapType {
    Classic,    // main: chữ U + ring (mesh), ring Line2D + 2 hàng chờ
    Road2D,     // V36: Line2DRing + 2 Line2D vẽ đường
    Ring3D,     // V37: Line3DRing xoắn ốc
}
Enum(MapType);

// Tên enum = phần sau "Floor_" của prefab trong FLOOR_DIR. Thêm floor mới: tạo prefab Floor_<Tên>.prefab rồi thêm 1 dòng ở đây.
export enum FloorType {
    BusStation,
    Park,
    PinkSakura,
    Winter,
    GreenScreen,    // phông xanh #00FF00 (unlit) cho quay video tách nền; chỉ floor phía trên, nền khu xe giữ nguyên
}
Enum(FloorType);

/** Màu đường (Line3DRing + RingExitRoad) hợp với ảnh nền của 1 floor. */
@ccclass('FloorRoadColor')
export class FloorRoadColor {
    @property({ type: FloorType }) floor: FloorType = FloorType.BusStation;
    @property({ tooltip: "Màu lòng đường." }) roadColor = new Color(110, 112, 151, 255);
    @property({ tooltip: "Màu gờ / tường mép đường. Nên đậm hơn hẳn ảnh nền để viền đường nổi rõ." }) rimColor = new Color(218, 218, 218, 255);

    constructor(floor = FloorType.BusStation, road?: Color, rim?: Color) {
        this.floor = floor;
        if(road) this.roadColor = road;
        if(rim) this.rimColor = rim;
    }
}

const MAP_DIR = "db://assets/5.Prefabs/Map/";
const FLOOR_DIR = "db://assets/5.Prefabs/Floor/";

/**
 * Chọn map + floor trong Inspector -> xoá instance cũ, tạo instance prefab mới làm con của Map Root / Floor Root.
 * Chỉ lưu đường dẫn prefab (không giữ tham chiếu asset) nên khi build chỉ map / floor đang có trong
 * scene được đóng gói, mesh/ảnh/material của các map / floor khác không làm tăng dung lượng.
 */
@ccclass('MapManager')
@executeInEditMode(true)
export class MapManager extends Component {
    @property({ type: Node, tooltip: "Node chứa map (Gameplay/Linear). Có RenderRoot2D nên đường Line2D vẽ được." })
    mapRoot: Node = null;
    @property({ type: Node, tooltip: "Node chứa floor (Gameplay/Ground)." })
    floorRoot: Node = null;

    @property
    private _map: MapType = MapType.Ring3D;

    @property({ type: MapType, tooltip: "Map dùng cho màn này.\n- Classic: chữ U + ring (main).\n- Road2D: ring + 2 hàng chờ vẽ bằng Line2D (V36).\n- Ring3D: đường xoắn ốc Line3DRing (V37).\nĐổi giá trị: xoá map cũ (node con Map_*) của Map Root, tạo instance prefab Map_<tên> trong 5.Prefabs/Map rồi dựng lại người theo map mới.\nThông số ring nằm trong component GameMap của từng prefab.\nNhớ lưu scene sau khi đổi." })
    get map() { return this._map; }
    set map(v: MapType) {
        if(v === this._map) return;
        this._map = v;
        if(EDITOR) this.applyMap();
    }

    @property
    private _floor: FloorType = FloorType.BusStation;

    @property({ type: FloorType, tooltip: "Floor dùng cho màn này.\n- Đổi giá trị: xoá floor cũ (node con Floor_*) của Floor Root và tạo instance prefab Floor_<tên> trong 5.Prefabs/Floor.\n- Chỉ floor đang chọn nằm trong scene nên chỉ ảnh của nó được build.\n- Nhớ lưu scene sau khi đổi." })
    get floor() { return this._floor; }
    set floor(v: FloorType) {
        if(v === this._floor) return;
        this._floor = v;
        if(EDITOR) this.applyFloor();
    }

    @property({ type: [FloorRoadColor], tooltip: "Màu đường của map theo floor đang chọn (Line3DRing + RingExitRoad trong Map Root).\nĐổi floor là đường tự đổi màu; floor không có trong danh sách thì giữ màu trong prefab map." })
    floorRoadColors: FloorRoadColor[] = [
        new FloorRoadColor(FloorType.BusStation, new Color(110, 112, 151, 255), new Color(56, 64, 150, 255)),
        new FloorRoadColor(FloorType.Park, new Color(132, 102, 78, 255), new Color(34, 88, 40, 255)),
        new FloorRoadColor(FloorType.PinkSakura, new Color(136, 86, 106, 255), new Color(142, 32, 72, 255)),
        new FloorRoadColor(FloorType.Winter, new Color(92, 118, 160, 255), new Color(32, 68, 136, 255)),
        new FloorRoadColor(FloorType.GreenScreen, new Color(110, 110, 134, 255), new Color(255, 255, 255, 255)),
    ];

    @property({ tooltip: "Tick để dựng lại map + floor đang chọn (vd sau khi sửa prefab hoặc lỡ xoá node)." })
    get rebuild() { return false; }
    set rebuild(v: boolean) {
        if(!EDITOR) return;
        this.applyMap();
        this.applyFloor();
    }

    onLoad() {
        this.applyRoadColors();
    }

    lateUpdate() {
        // editor: sửa bảng màu / đổi floor / đổi map là thấy đường đổi màu ngay
        if(EDITOR) this.applyRoadColors();
    }

    /** tô đường của map theo màu của floor đang chọn (chỉ gán khi khác, Line3DRing tự dựng lại mesh; RingExitRoad lấy màu theo ring) */
    applyRoadColors() {
        const c = this.floorRoadColors.find(e => e?.floor === this._floor);
        if(!c || !this.mapRoot) return;
        for(const ring of this.mapRoot.getComponentsInChildren(Line3DRing)) {
            if(!ring.roadColor.equals(c.roadColor)) ring.roadColor = c.roadColor.clone();
            if(!ring.rimColor.equals(c.rimColor)) ring.rimColor = c.rimColor.clone();
        }
    }

    /** node con đang là map (tên trùng 1 map trong MapType) */
    getMapNodes() {
        return this.childrenOf(this.mapRoot, "Map_", MapType);
    }

    /** node con đang là floor (tên trùng 1 floor trong FloorType) */
    getFloorNodes() {
        return this.childrenOf(this.floorRoot, "Floor_", FloorType);
    }

    private childrenOf(root: Node, prefix: string, type: object) {
        if(!root) return [];
        const names = Object.keys(type).filter(k => isNaN(+k)).map(k => prefix + k);
        return root.children.filter(c => names.includes(c.name));
    }

    private async applyMap() {
        if(!await this.replaceChild(this.mapRoot, MAP_DIR, "Map_" + MapType[this._map], this.getMapNodes())) return;
        // người trên ring của map cũ nằm trong map cũ / Human -> dựng lại theo đường của map mới
        gm?.refreshMap();
    }

    private async applyFloor() {
        await this.replaceChild(this.floorRoot, FLOOR_DIR, "Floor_" + FloorType[this._floor], this.getFloorNodes());
    }

    // xoá các node cũ rồi tạo instance prefab <dir><name>.prefab làm con của root
    private async replaceChild(root: Node, dir: string, name: string, olds: Node[]) {
        const Editor = (globalThis as any).Editor;
        if(!Editor) return false;
        if(!root) {
            console.error(`MapManager: chưa gán node chứa cho ${name}`);
            return false;
        }
        const url = dir + name + ".prefab";
        const assetUuid: string = await Editor.Message.request("asset-db", "query-uuid", url);
        if(!assetUuid) {
            console.error(`MapManager: không tìm thấy prefab ${url}`);
            return false;
        }
        for(const n of olds) {
            await Editor.Message.request("scene", "remove-node", { uuid: n.uuid });
        }
        const uuid: string = await Editor.Message.request("scene", "create-node", { parent: root.uuid, assetUuid, name });
        // create-node tạo bản sao rời -> nối lại với prefab để sửa prefab là map/floor trong scene cập nhật theo
        await Editor.Message.request("scene", "link-prefab", uuid, assetUuid);
        console.log(`MapManager: đã đổi sang ${name}`);
        return true;
    }
}
