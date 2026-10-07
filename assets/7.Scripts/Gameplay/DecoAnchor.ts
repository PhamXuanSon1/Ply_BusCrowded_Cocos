import { _decorator, Camera, Component, director, Node, view } from 'cc';
const { ccclass, property } = _decorator;

// Giữ các cụm trang trí ở góc (con của node này) bám sát mép trái/phải màn hình:
// màn rộng hơn khung dọc thiết kế (ngang / tablet) thì đẩy ra, màn dài hẹp hơn thì kéo vào để không bị cắt.
@ccclass('DecoAnchor')
export class DecoAnchor extends Component {

    @property(Camera)
    cam: Camera = null;
    // Nửa bề ngang khung thiết kế (world) — ảnh mẫu 9:16 phủ đúng camera ortho cao 22
    @property
    designHalfWidth = 6.19;
    // Con có |x| lớn hơn ngưỡng này được coi là đồ trang trí bên hông
    @property
    sideThreshold = 2.0;

    private baseX: Map<Node, number> = new Map();

    start() {
        if(!this.cam) this.cam = director.getScene().getComponentsInChildren(Camera).find(c => c.node.name == "WCam");
        this.node.children.forEach(c => this.baseX.set(c, c.position.x));
    }

    lateUpdate() {
        if(!this.cam) return;
        const vs = view.getVisibleSize();
        const halfW = this.cam.orthoHeight * vs.width / vs.height;
        const s = this.node.worldScale.x || 1;
        const extra = (halfW - this.designHalfWidth) / s;
        this.baseX.forEach((x0, c) => {
            if(Math.abs(x0) < this.sideThreshold) return;
            const p = c.position;
            const x = x0 + Math.sign(x0) * extra;
            if(p.x != x) c.setPosition(x, p.y, p.z);
        });
    }
}
