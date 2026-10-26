import { _decorator, Component, Enum, Node } from 'cc';
import { EDITOR } from 'cc/env';
import { gm } from './Game';
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
}
Enum(FloorType);

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

    @property({ tooltip: "Tick để dựng lại map + floor đang chọn (vd sau khi sửa prefab hoặc lỡ xoá node)." })
    get rebuild() { return false; }
    set rebuild(v: boolean) {
        if(!EDITOR) return;
        this.applyMap();
        this.applyFloor();
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
