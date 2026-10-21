import { _decorator, Component, Enum } from 'cc';
import { EDITOR } from 'cc/env';
const { ccclass, property, executeInEditMode } = _decorator;

// Tên enum = phần sau "Floor_" của prefab trong FLOOR_DIR. Thêm floor mới: tạo prefab Floor_<Tên>.prefab rồi thêm 1 dòng ở đây.
export enum FloorType {
    BusStation,
    Park,
    PinkSakura,
    Winter,
}
Enum(FloorType);

const FLOOR_DIR = "db://assets/5.Prefabs/Floor/";
const floorName = (type: FloorType) => "Floor_" + FloorType[type];

/**
 * Chọn floor trong Inspector -> xoá floor cũ, tạo instance prefab floor mới làm con của node này.
 * Chỉ lưu đường dẫn prefab (không giữ tham chiếu asset) nên khi build chỉ floor đang có trong
 * scene được đóng gói, ảnh/material của các floor khác không làm tăng dung lượng.
 */
@ccclass('FloorSelector')
@executeInEditMode(true)
export class FloorSelector extends Component {
    @property
    private _floor: FloorType = FloorType.BusStation;

    @property({ type: FloorType, tooltip: "Floor dùng cho màn này.\n- Đổi giá trị: xoá floor cũ (node con Floor_*) và tạo instance prefab Floor_<tên> trong 5.Prefabs/Floor.\n- Chỉ floor đang chọn nằm trong scene nên chỉ ảnh của nó được build.\n- Nhớ lưu scene sau khi đổi." })
    get floor() { return this._floor; }
    set floor(v: FloorType) {
        if(v === this._floor) return;
        this._floor = v;
        if(EDITOR) this.applyFloor();
    }

    @property({ tooltip: "Tick để dựng lại floor đang chọn (vd sau khi sửa prefab hoặc lỡ xoá node floor)." })
    get rebuild() { return false; }
    set rebuild(v: boolean) {
        if(EDITOR) this.applyFloor();
    }

    /** node con đang là floor (tên trùng 1 floor trong FloorType) */
    getFloorNodes() {
        const names = Object.keys(FloorType).filter(k => isNaN(+k)).map(k => "Floor_" + k);
        return this.node.children.filter(c => names.includes(c.name));
    }

    private async applyFloor() {
        const Editor = (globalThis as any).Editor;
        if(!Editor) return;
        const name = floorName(this._floor);
        const url = FLOOR_DIR + name + ".prefab";
        const assetUuid: string = await Editor.Message.request("asset-db", "query-uuid", url);
        if(!assetUuid) {
            console.error(`FloorSelector: không tìm thấy prefab ${url}`);
            return;
        }
        for(const n of this.getFloorNodes()) {
            await Editor.Message.request("scene", "remove-node", { uuid: n.uuid });
        }
        const uuid: string = await Editor.Message.request("scene", "create-node", { parent: this.node.uuid, assetUuid, name });
        // create-node tạo bản sao rời -> nối lại với prefab để sửa prefab là floor trong scene cập nhật theo
        await Editor.Message.request("scene", "link-prefab", uuid, assetUuid);
        console.log(`FloorSelector: đã đổi floor sang ${name}`);
    }
}
