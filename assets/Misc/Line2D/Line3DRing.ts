import { _decorator, CCInteger, Color, Component, Material, Mesh, MeshRenderer, Node, Vec3, utils } from 'cc';
import { EDITOR } from 'cc/env';
import { generateSmoothPoints } from './Line2D';

const { ccclass, property, executeInEditMode } = _decorator;

export type RingPose = { pos: Vec3; tangent: Vec3; up: Vec3 };

/** Local XY = mặt bằng, +Z = cao độ, cùng hệ trục với gameplay BusJam. */
@ccclass('Line3DRing')
@executeInEditMode(true)
export class Line3DRing extends Component {
    /** node event: đường vừa dựng lại (đổi Point / thông số) */
    static readonly REBUILT = 'line3dring-rebuilt';
    @property({ min: 0.5 }) radius = 1.6;
    @property({ min: 0.25, max: 6 }) turns = 3;
    @property({ min: 0.1, tooltip: 'Chênh cao từ đầu vào tới đầu ra.' }) height = 3.6;
    @property startAngle = 90;
    @property({ tooltip: 'Chiều xoáy khi nhìn từ trên xuống, tính từ đầu vào.' }) clockwise = true;
    @property({ min: 0.1 }) width = 1.5;
    @property({ min: 0.01 }) thickness = 0.12;
    @property({ min: 0.005 }) rimWidth = 0.06;
    @property({ min: 0, tooltip: 'Gờ mép trong.' }) rimHeight = 0.06;
    @property({ min: 0, tooltip: 'Tường mép ngoài, cao hơn gờ trong để thành tháp nhìn dày như ảnh mẫu.' }) outerWallHeight = 0.16;
    @property({ min: 0 }) entranceLength = 3;
    @property({ min: 0 }) exitLength = 2.5;
    @property({ type: CCInteger, min: 4, max: 24 }) smoothStep = 24;
    @property({ tooltip: 'Bật để dựng đường theo các node con của Points (kéo tay được). Đổi thông số xoắn ốc sẽ rải lại các point theo hình mới.' })
    useCustomPoints = false;
    @property(Node) pointNodes: Node = null;
    @property({ type: CCInteger, min: -1, tooltip: 'Lối ra của human: bỏ tường ngoài từ point này... (-1 = không có lối ra)' })
    exitFromPoint = 38;
    @property({ type: CCInteger, min: -1, tooltip: '...tới point này (theo thứ tự node con của Points).' })
    exitToPoint = 40;
    @property(MeshRenderer) meshRenderer: MeshRenderer = null;
    @property(Color) roadColor = new Color(68, 72, 98, 255);
    @property(Color) rimColor = new Color(244, 242, 251, 255);
    @property({ tooltip: 'Hướng chiếu sáng giả (local), đổ bóng bake vào vertex color.' }) lightDir = new Vec3(-0.35, -0.6, 0.75);
    @property({ min: 0, max: 1 }) ambient = 0.55;
    @property({ min: 0, max: 0.8, tooltip: 'Tầng thấp tối dần để các vòng chồng nhau tách lớp.' }) depthShade = 0.25;

    totalLength = 0;
    private samples: Vec3[] = [];
    // khoảng mẫu [đầu, cuối] của lối ra (không có tường ngoài), null = không có
    private exitSamples: number[] = null;
    private distances: number[] = [];
    private mesh: Mesh = null;
    private material: Material = null;
    private signature = '';
    private spiralSignature = '';

    onLoad() {
        // Point chỉ là tay nắm để chỉnh trong editor.
        if (!EDITOR) this.pointNodes?.children.forEach(n => { const r = n.getComponent(MeshRenderer); if (r) r.enabled = false; });
    }

    onEnable() { this.signature = ''; }

    lateUpdate() {
        if (EDITOR) {
            const spiral = JSON.stringify([this.radius, this.turns, this.height, this.startAngle, this.clockwise,
                this.entranceLength, this.exitLength]);
            // Lần đầu sau khi load chỉ ghi nhận, để không đè các point đã kéo tay.
            if (spiral !== this.spiralSignature && (this.spiralSignature || !this.useCustomPoints)) this.syncPoints(this.makeControls());
            this.spiralSignature = spiral;
        }
        const signature = JSON.stringify([
            this.radius, this.turns, this.height, this.startAngle, this.clockwise, this.width, this.thickness,
            this.rimWidth, this.rimHeight, this.outerWallHeight, this.entranceLength, this.exitLength, this.smoothStep,
            this.useCustomPoints, this.roadColor, this.rimColor, this.lightDir, this.ambient, this.depthShade,
            this.exitFromPoint, this.exitToPoint, this.pointNodes?.children.length,
            this.useCustomPoints ? this.pointNodes?.children.map(n => n.worldPosition) : null,
            this.useCustomPoints ? this.node.worldMatrix : null,
        ]);
        if (signature !== this.signature) {
            this.rebuild();
            this.signature = signature;
            // báo cho Game xếp lại người trên ring ngay trong frame này (editor: kéo Point là thấy người đi theo)
            this.node.emit(Line3DRing.REBUILT);
        }
    }

    /** Đường mở: đầu vào ở tầng trên, đầu ra ở tầng dưới, không teleport về đầu vòng. */
    makeControls(): Vec3[] {
        const radius = Math.max(0.5, this.radius);
        const turns = Math.max(0.25, Math.min(6, this.turns));
        const angle = this.startAngle * Math.PI / 180, dir = this.clockwise ? -1 : 1;
        const count = Math.max(8, Math.ceil(turns * 20));
        const start = new Vec3(radius * Math.cos(angle), radius * Math.sin(angle), this.height);
        const tangent = new Vec3(-Math.sin(angle) * dir, Math.cos(angle) * dir, 0);
        const controls: Vec3[] = [];
        if (this.entranceLength > 0) {
            controls.push(start.clone().subtract(tangent.clone().multiplyScalar(this.entranceLength)));
            controls.push(start.clone().subtract(tangent.clone().multiplyScalar(this.entranceLength * 0.45)));
        }
        for (let i = 0; i <= count; i++) {
            const t = i / count, a = angle + dir * t * turns * Math.PI * 2;
            controls.push(new Vec3(radius * Math.cos(a), radius * Math.sin(a), this.height * (1 - t)));
        }
        const end = controls[controls.length - 1];
        const a = angle + dir * turns * Math.PI * 2;
        const forward = new Vec3(-Math.sin(a) * dir, Math.cos(a) * dir, 0);
        if (this.exitLength > 0) {
            controls.push(end.clone().add(forward.clone().multiplyScalar(this.exitLength * 0.5)));
            controls.push(end.clone().add(forward.clone().multiplyScalar(this.exitLength)));
        }
        return controls;
    }

    init() { if (!this.samples.length) this.rebuild(); }

    rebuild() {
        if (!this.meshRenderer) return;
        const controls = this.useCustomPoints
            ? (this.pointNodes?.children || []).map(n => this.node.inverseTransformPoint(new Vec3(), n.worldPosition))
            : this.makeControls();
        const unique = controls.filter((p, i) => !i || Vec3.distance(p, controls[i - 1]) > 0.00001);
        const sampled = generateSmoothPoints(unique, Math.max(4, Math.min(24, Math.round(this.smoothStep))), 0);
        // Mỗi mẫu cần tối đa 40 đỉnh; giữ index buffer dưới 65535 kể cả khi tăng số vòng.
        this.samples = sampled.length <= 1600 ? sampled : Array.from({length: 1600},
            (_, i) => sampled[Math.round(i * (sampled.length - 1) / 1599)]);
        this.distances = [0];
        this.totalLength = 0;
        for (let i = 1; i < this.samples.length; i++) {
            this.totalLength += Vec3.distance(this.samples[i - 1], this.samples[i]);
            this.distances.push(this.totalLength);
        }
        this.exitSamples = this.findExitSamples();
        if (this.samples.length < 2) {
            this.meshRenderer.mesh = null;
            this.mesh?.destroy();
            this.mesh = null;
            return;
        }

        const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
        // Bên phải tiếp tuyến là phía ngoài khi xoáy ngược chiều kim đồng hồ.
        const out = this.clockwise ? -1 : 1;
        const half = Math.max(0.1, Math.min(this.width, (this.useCustomPoints ? Infinity : this.radius * 2 - 0.2))) / 2;
        const rim = Math.min(half * 0.4, Math.max(0.005, this.rimWidth));
        const depth = Math.max(0.01, this.thickness), inner = Math.max(0, this.rimHeight);
        const wall = Math.max(inner, this.outerWallHeight);
        // Mặt cắt [độ lệch về phía ngoài, cao độ, loại mặt]: 0 = lòng đường, 1 = gờ/tường, 2 = thân dưới.
        const profile: number[][] = [
            [-half, -depth], [-half, 0, 2], [-half, inner, 1], [-half + rim, inner, 1], [-half + rim, 0, 1],
            [half - rim, 0, 0], [half - rim, wall, 1], [half, wall, 1], [half, 0, 1], [half, -depth, 1], [-half, -depth, 2],
        ];
        const light = this.lightDir.clone();
        if (light.lengthSqr() < 1e-6) light.set(0, 0, 1);
        light.normalize();
        const amb = Math.max(0, Math.min(1, this.ambient));
        const zs = this.samples.map(p => p.z);
        const zMin = Math.min(...zs), zRange = Math.max(1e-4, Math.max(...zs) - zMin);
        const tint = (c: Color, normal: Vec3, z: number) => {
            const lit = Math.max(0, Math.min(1, Vec3.dot(normal, light) / Math.max(0.2, light.z)));
            const shade = (amb + (1 - amb) * lit) * (1 - this.depthShade * (1 - (z - zMin) / zRange));
            return [c.r / 255 * shade, c.g / 255 * shade, c.b / 255 * shade, 1];
        };
        const at = (i: number, offset: number, lift: number) => {
            const p = this.samples[i], side = this.sideAt(i);
            return new Vec3(p.x + side.x * offset * out, p.y + side.y * offset * out, p.z + lift);
        };
        const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: Color) => {
            const base = positions.length / 3;
            // Mặt cắt đi theo chiều kim đồng hồ nên lấy c-a × b-a để pháp tuyến hướng ra ngoài khối.
            const normal = Vec3.cross(new Vec3(), c.clone().subtract(a), b.clone().subtract(a)).normalize();
            if (out < 0) Vec3.negate(normal, normal);
            const rgba = tint(color, normal, (a.z + b.z + c.z + d.z) / 4);
            for (const p of [a, b, c, d]) {
                positions.push(p.x, p.y, p.z);
                normals.push(normal.x, normal.y, normal.z);
                colors.push(...rgba);
            }
            indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        };
        // Lối ra: hạ tường ngoài xuống bằng mặt đường, gờ trên cùng tô màu đường để thành 1 khoảng hở.
        const gapProfile = profile.map((p, j) => j >= 6 && j <= 7 ? [p[0], 0, 0] : p);
        const [g0, g1] = this.exitSamples || [-1, -1];
        for (let i = 1; i < this.samples.length; i++) {
            const prof = i > g0 && i <= g1 ? gapProfile : profile;
            for (let j = 1; j < prof.length; j++) {
                const a = prof[j - 1], b = prof[j];
                if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) continue;
                quad(at(i - 1, a[0], a[1]), at(i, a[0], a[1]), at(i, b[0], b[1]), at(i - 1, b[0], b[1]),
                    b[2] === 1 ? this.rimColor : this.roadColor);
            }
        }
        // bịt 2 đầu tường ở mép lối ra
        for (const i of g0 >= 0 ? [g0, g1] : []) {
            quad(at(i, half - rim, 0), at(i, half - rim, wall), at(i, half, wall), at(i, half, 0), this.rimColor);
        }
        const last = this.samples.length - 1;
        quad(at(0, -half, 0), at(0, half, 0), at(0, half, -depth), at(0, -half, -depth), this.roadColor);
        quad(at(last, -half, -depth), at(last, half, -depth), at(last, half, 0), at(last, -half, 0), this.roadColor);
        const mesh = utils.MeshUtils.createMesh({ positions, normals, colors, indices });
        if (!this.material) {
            this.material = new Material();
            // Pass 1 là planar-shadow: để nguyên state gốc (không ghi depth, stencil chống chồng bóng).
            const opaque = { rasterizerState: { cullMode: 0 }, depthStencilState: { depthTest: true, depthWrite: true } };
            this.material.initialize({ effectName: 'builtin-unlit', defines: { USE_VERTEX_COLOR: true },
                states: [opaque, {}, opaque] });
        }
        this.meshRenderer.setSharedMaterial(this.material, 0);
        this.meshRenderer.mesh = mesh;
        this.mesh?.destroy();
        this.mesh = mesh;
    }

    /** Mẫu gần point exitFromPoint/exitToPoint nhất -> khoảng không có tường ngoài. */
    private findExitSamples(): number[] {
        const nodes = this.pointNodes?.children;
        if (!nodes || this.exitFromPoint < 0 || this.exitToPoint < 0) return null;
        // Một số scene giữ tên point theo số thứ tự cũ nên tên và child index có thể lệch nhau.
        // Ưu tiên tìm theo tên hiển thị trong Hierarchy (VD 38 → 40), rồi mới fallback về index.
        const nodeAt = (key: number) => nodes.find(n => Number(n.name) === key) || nodes[key];
        const a = nodeAt(this.exitFromPoint), b = nodeAt(this.exitToPoint);
        if (!a || !b || this.samples.length < 2) return null;
        const nearest = (n: Node) => {
            const p = this.node.inverseTransformPoint(new Vec3(), n.worldPosition);
            let best = 0, bestD = Infinity;
            this.samples.forEach((s, i) => { const d = Vec3.squaredDistance(s, p); if (d < bestD) { bestD = d; best = i; } });
            return best;
        };
        const i0 = nearest(a), i1 = nearest(b);
        return i0 == i1 ? null : [Math.min(i0, i1), Math.max(i0, i1)];
    }

    /** Quãng đường (tính từ đầu vào) của 2 đầu lối ra, null = không có lối ra. */
    getExitRange(): number[] {
        this.init();
        return this.exitSamples ? this.exitSamples.map(i => this.distances[i]) : null;
    }

    /** Vị trí local trên mặt đường + hướng đi + hướng ngang (local, đã chuẩn hoá). */
    getLocalPose(distance: number) {
        this.init();
        if (this.samples.length < 2) return { pos: new Vec3(), tangent: new Vec3(1, 0, 0), side: new Vec3(0, 1, 0) };
        distance = Math.max(0, Math.min(this.totalLength, distance));
        let lo = 1, hi = this.distances.length - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (this.distances[mid] < distance) lo = mid + 1; else hi = mid; }
        const t = (distance - this.distances[lo - 1]) / Math.max(1e-8, this.distances[lo] - this.distances[lo - 1]);
        const pos = Vec3.lerp(new Vec3(), this.samples[lo - 1], this.samples[lo], t);
        pos.z += 0.012;
        const tangent = this.samples[lo].clone().subtract(this.samples[lo - 1]).normalize();
        return { pos, tangent, side: this.sideAt(lo) };
    }

    /** Rải đều các point theo chiều dài đường xoắn ốc. */
    private syncPoints(controls: Vec3[]) {
        const nodes = this.pointNodes?.children;
        if (!nodes?.length || controls.length < 2) return;
        const lengths = [0];
        for (let i = 1; i < controls.length; i++) lengths.push(lengths[i - 1] + Vec3.distance(controls[i - 1], controls[i]));
        const total = lengths[lengths.length - 1];
        let k = 1;
        nodes.forEach((n, i) => {
            const d = nodes.length === 1 ? 0 : total * i / (nodes.length - 1);
            while (k < lengths.length - 1 && lengths[k] < d) k++;
            const t = (d - lengths[k - 1]) / Math.max(1e-8, lengths[k] - lengths[k - 1]);
            const local = Vec3.lerp(new Vec3(), controls[k - 1], controls[k], Math.min(1, t));
            n.setWorldPosition(Vec3.transformMat4(local, local, this.node.worldMatrix));
        });
    }

    private sideAt(i: number) {
        const a = this.samples[Math.max(0, i - 1)], b = this.samples[Math.min(this.samples.length - 1, i + 1)];
        const side = new Vec3(b.y - a.y, a.x - b.x, 0);
        return side.lengthSqr() > 1e-8 ? side.normalize() : new Vec3(1, 0, 0);
    }

    /** Quãng đường tính từ đầu vào. Trả bản sao, không làm thay đổi cache spline. */
    getPoseAtDistance(distance: number): RingPose {
        this.init();
        if (this.samples.length < 2) return { pos: this.node.worldPosition.clone(), tangent: new Vec3(1, 0, 0), up: new Vec3(0, 0, 1) };
        distance = Math.max(0, Math.min(this.totalLength, distance));
        let lo = 1, hi = this.distances.length - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (this.distances[mid] < distance) lo = mid + 1; else hi = mid; }
        const i = lo;
        const t = (distance - this.distances[i - 1]) / Math.max(1e-8, this.distances[i] - this.distances[i - 1]);
        const pos = Vec3.lerp(new Vec3(), this.samples[i - 1], this.samples[i], t);
        pos.z += 0.012;
        const tangent = this.samples[i].clone().subtract(this.samples[i - 1]).normalize();
        const up = new Vec3(0, 0, 1);
        Vec3.transformQuat(tangent, tangent, this.node.worldRotation);
        Vec3.transformQuat(up, up, this.node.worldRotation);
        Vec3.transformMat4(pos, pos, this.node.worldMatrix);
        return { pos, tangent, up };
    }

    getPositionByRatio(ratio: number) {
        this.init();
        return { pos: this.getPoseAtDistance(Math.max(0, Math.min(1, ratio)) * this.totalLength).pos };
    }

    onDestroy() {
        if (this.meshRenderer?.isValid && this.meshRenderer.mesh === this.mesh) this.meshRenderer.mesh = null;
        this.mesh?.destroy();
        this.material?.destroy();
    }
}
