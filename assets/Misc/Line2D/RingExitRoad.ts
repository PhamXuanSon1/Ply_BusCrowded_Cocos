import { _decorator, CCInteger, Color, Component, Material, Mesh, MeshRenderer, Node, Vec3, utils } from 'cc';
import { Line3DRing } from './Line3DRing';

const { ccclass, property, executeInEditMode } = _decorator;

/**
 * Đoạn đường nối lối ra của Line3DRing (khoảng không có tường ngoài, exitFromPoint→exitToPoint) xuống Pavement.
 * Đầu đường lấy mẫu đúng mép ngoài của tháp ở lối ra (cong + dốc theo vòng xoắn) nên nối khít, không hở / không lòi;
 * cuối đường là 1 mép thẳng nằm ngang quanh endPoint. Local XY = mặt sân, +Z = cao độ (node để phẳng, không xoay).
 */
@ccclass('RingExitRoad')
@executeInEditMode(true)
export class RingExitRoad extends Component {
    @property({ type: Line3DRing, tooltip: 'Tháp có lối ra (exitFromPoint → exitToPoint)' }) ring: Line3DRing = null;
    @property({ type: Node, tooltip: 'Tâm mép cuối đường (trên Pavement). Kéo node này để đổi chiều dài / hướng đường' }) endPoint: Node = null;
    @property({ tooltip: 'Bề ngang mép cuối. 0 = bằng bề ngang lối ra' }) endWidth = 0;
    @property({ tooltip: 'Nâng mép cuối khỏi mặt endPoint một chút cho khỏi chìm vào Pavement' }) endLift = 0.004;
    @property({ type: CCInteger, min: 2, max: 40, tooltip: 'Số điểm lấy mẫu dọc mép lối ra' }) samples = 16;
    @property({ min: 0 }) rimWidth = 0.06;
    @property({ min: 0 }) rimHeight = 0.06;
    @property({ min: 0.005, tooltip: 'Độ dày thân đường (mặt bên trắng)' }) thickness = 0.06;
    @property(Color) roadColor = new Color(86, 88, 119, 255);
    @property(Color) rimColor = new Color(218, 218, 218, 255);
    @property(MeshRenderer) meshRenderer: MeshRenderer = null;

    private mesh: Mesh = null;
    private material: Material = null;
    private signature = '';

    onEnable() { this.signature = ''; }

    lateUpdate() {
        const ring = this.ring;
        const sig = JSON.stringify([
            ring?.node.worldMatrix, ring?.getExitRange?.(), ring?.width, ring?.clockwise, ring?.totalLength,
            this.endPoint?.worldPosition, this.node.worldMatrix, this.endWidth, this.endLift, this.samples,
            this.rimWidth, this.rimHeight, this.thickness, this.roadColor, this.rimColor,
        ]);
        if (sig === this.signature) return;
        this.signature = sig;
        this.rebuild();
    }

    rebuild() {
        const ring = this.ring, mr = this.meshRenderer;
        if (!mr) return;
        const range = ring?.isValid ? ring.getExitRange() : null;
        if (!range || !this.endPoint?.isValid) { mr.mesh = null; return; }

        // mép ngoài tháp ở lối ra, đổi sang local của node này
        const n = Math.max(2, Math.round(this.samples));
        const out = ring.clockwise ? -1 : 1, half = ring.width / 2;
        const toLocal = (p: Vec3) => this.node.inverseTransformPoint(new Vec3(), Vec3.transformMat4(new Vec3(), p, ring.node.worldMatrix));
        const top: Vec3[] = [];
        for (let i = 0; i < n; i++) {
            const d = range[0] + (range[1] - range[0]) * i / (n - 1);
            const pose = ring.getLocalPose(d);
            pose.pos.z -= 0.012;   // getLocalPose nâng sẵn 0.012 cho người đứng, mặt đường thật ở dưới
            top.push(toLocal(pose.pos.add(pose.side.multiplyScalar(out * half))));
        }
        // mép cuối thẳng, vuông góc hướng từ tâm lối ra tới endPoint, cùng chiều trái-phải với mép trên
        const end = this.node.inverseTransformPoint(new Vec3(), this.endPoint.worldPosition);
        end.z += this.endLift;
        const topMid = top[0].clone().add(top[n - 1]).multiplyScalar(0.5);
        const fwd = new Vec3(end.x - topMid.x, end.y - topMid.y, 0);
        if (fwd.lengthSqr() < 1e-8) fwd.set(0, -1, 0);
        fwd.normalize();
        let across = new Vec3(-fwd.y, fwd.x, 0);
        const span = top[n - 1].clone().subtract(top[0]);
        if (Vec3.dot(span, across) < 0) across.multiplyScalar(-1);
        const w = this.endWidth > 0 ? this.endWidth : Vec3.distance(top[0], top[n - 1]);
        const bottom: Vec3[] = [];
        for (let i = 0; i < n; i++) bottom.push(end.clone().add(across.clone().multiplyScalar(w * (i / (n - 1) - 0.5))));

        const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
        const col = (c: Color, shade: number) => [c.r / 255 * shade, c.g / 255 * shade, c.b / 255 * shade, 1];
        const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: number[]) => {
            const base = positions.length / 3;
            const nrm = Vec3.cross(new Vec3(), b.clone().subtract(a), d.clone().subtract(a)).normalize();
            for (const p of [a, b, c, d]) { positions.push(p.x, p.y, p.z); normals.push(nrm.x, nrm.y, nrm.z); colors.push(...color); }
            indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        };
        const up = (p: Vec3, h: number) => new Vec3(p.x, p.y, p.z + h);
        // mặt đường giữa 2 gờ (gờ chiếm rimWidth ở 2 bên)
        // điểm trên hàng row (mép trên / mép cuối) tại vị trí t (0..1 theo bề ngang)
        const inset = (row: Vec3[], t: number) => {
            const tt = Math.min(1, Math.max(0, t));
            const idx = tt * (n - 1), i0 = Math.min(n - 2, Math.floor(idx)), f = idx - i0;
            return Vec3.lerp(new Vec3(), row[i0], row[i0 + 1], f);
        };
        const tTop = this.rimWidth / Math.max(1e-4, Vec3.distance(top[0], top[n - 1]));
        const tBot = this.rimWidth / Math.max(1e-4, w);
        const road = col(this.roadColor, 1), roadSide = col(this.roadColor, 0.7);
        const rimTop = col(this.rimColor, 1), rimSide = col(this.rimColor, 0.8), rimDark = col(this.rimColor, 0.6);
        // lòng đường: chia theo các mẫu của mép trên
        for (let i = 1; i < n; i++) {
            const t0 = (i - 1) / (n - 1), t1 = i / (n - 1);
            const a = inset(top, tTop + (1 - 2 * tTop) * t0), b = inset(top, tTop + (1 - 2 * tTop) * t1);
            const c = inset(bottom, tBot + (1 - 2 * tBot) * t1), d = inset(bottom, tBot + (1 - 2 * tBot) * t0);
            quad(a, b, c, d, road);
        }
        // 2 gờ trắng dọc 2 bên + mặt bên thân đường
        for (const side of [0, 1]) {
            const oT = side ? top[n - 1] : top[0], oB = side ? bottom[n - 1] : bottom[0];
            const iT = inset(top, side ? 1 - tTop : tTop), iB = inset(bottom, side ? 1 - tBot : tBot);
            const h = this.rimHeight;
            quad(up(oT, h), up(iT, h), up(iB, h), up(oB, h), rimTop);           // mặt trên gờ
            quad(up(iT, h), iT, iB, up(iB, h), rimSide);                         // mặt trong gờ
            quad(oT, up(oT, h), up(oB, h), oB, rimSide);                         // mặt ngoài gờ
            quad(up(oT, -this.thickness), oT, oB, up(oB, -this.thickness), rimDark); // mặt bên thân đường
        }
        // mép cuối (đứng) cho thân đường không bị hở khi nhìn nghiêng
        quad(bottom[0], bottom[n - 1], up(bottom[n - 1], -this.thickness), up(bottom[0], -this.thickness), roadSide);

        const mesh = utils.MeshUtils.createMesh({ positions, normals, colors, indices });
        if (!this.material) {
            this.material = new Material();
            const opaque = { rasterizerState: { cullMode: 0 }, depthStencilState: { depthTest: true, depthWrite: true } };
            this.material.initialize({ effectName: 'builtin-unlit', defines: { USE_VERTEX_COLOR: true }, states: [opaque, {}, opaque] });
        }
        mr.setSharedMaterial(this.material, 0);
        mr.mesh = mesh;
        this.mesh?.destroy();
        this.mesh = mesh;
    }

    onDestroy() {
        if (this.meshRenderer?.isValid && this.meshRenderer.mesh === this.mesh) this.meshRenderer.mesh = null;
        this.mesh?.destroy();
        this.material?.destroy();
    }
}
