import { _decorator, CCInteger, Component, Graphics, Node, Sprite, tween, v3, v4, Vec3 } from 'cc';
import { EDITOR_NOT_IN_PREVIEW } from 'cc/env';

const { ccclass, property, executeInEditMode } = _decorator;


@ccclass('Line2D')
@executeInEditMode(true)
export class Line2D extends Component {
    
    pointLength: number = 0;

    posMap: Map<number, Vec3> = new Map();
    scaleMap: Map<number, Vec3> = new Map();
    points: Node[] = [];
    pointNodes: Node = null;
    paraMap: Map<string, number> = new Map();
    changableMesh: boolean = false;
    graphics: Graphics[] = [];
    arrayKeys: string[] = [];
    wposes: Vec3[] = [];
    lposes: Vec3[] = [];
    lengths: number[] = [];
    totalLength: number = 0;
    mark: Node = null;

    matPoses: Vec3[] = [];
    matLengths: number[] = [];
    maxTotalLength: number = 0;

    @property({group: {name: 'Adjust', style: "section"}})
    strokeWidth: number = 0.2;
    @property({group: {name: 'Adjust'}, type: CCInteger })
    smoothStep: number = 10;
    @property({group: {name: 'Adjust'}})
    tension: number = 0;

    @property
    memRatio: number = 0;
    _ratio: number = 0;
    get ratio() {
        return this._ratio;
    }
    @property({slide: true, range: [0, 1], step: 0.01})
    set ratio(value) {
        this._ratio = value;
        this.memRatio = value;
        this.setRatio();
    }

    inited: boolean = false;

    start() {
        this.init();
    }

    init() {
        if(this.inited) return;
        this.inited = true;
        this.mark = this.node.getChildByName("Mark").children[0];
        this.pointNodes = this.node.getChildByName("Points");
        this.points = this.pointNodes.children;
        this.points.forEach((p, i) => {
            p.name = "" + i;
            if(!EDITOR_NOT_IN_PREVIEW) p.active = false;
        });
        this.graphics = this.getComponentsInChildren(Graphics);
        this.setPointMap();
        let keys = this.paraMap.keys();
        this.arrayKeys = Array.from(keys);
        this.change();

        // const t = this;
        // tween({})
        // .to(5, {}, {
        //     onUpdate(target, ratio) {
        //         t.ratio = ratio;
        //     },
        // })
        // .start();
    }

    getPositionByRatio(ratio: number) {
        return getPositionByRatio(this.wposes, ratio, this.lengths, this.totalLength);
    }

    setRatio() {
        let result = getPositionByRatio(this.wposes, this.ratio, this.lengths, this.totalLength);
        let pos = result.pos.clone();
        this.mark.setWorldPosition(pos);
        let prev = this.wposes[result.i];
        let foward = Vec3.subtract(v3(), pos, prev).normalize();
        let angel = Math.atan2(foward.y, foward.x) * 180 / Math.PI;
        this.mark.eulerAngles = new Vec3(0, 0, angel);
    }

    change() {
        this.setPointMap();
        this.wposes = generateSmoothPoints(this.points.map(p => p.getWorldPosition()), this.smoothStep, this.tension);
        this.ratio = this.memRatio;

        this.lengths = [];
        this.totalLength = 0;
        for (let i = 0; i < this.wposes.length - 1; i++) {
            const len = Vec3.distance(this.wposes[i], this.wposes[i + 1]);
            this.lengths.push(len);
            this.totalLength += len;
        }        
        this.lposes = this.wposes.map(p => {
            let lp = this.graphics[0].node.inverseTransformPoint(v3(), p);
            return lp;
        })
        const maxlength = 100;
        let remove = this.lposes.length - maxlength;
        if(remove > 0) {
            this.matPoses = removeEvenly(this.lposes, remove);
        } else {
            this.matPoses = [...this.lposes];
        }
        this.maxTotalLength = this.matPoses.length;
        this.matLengths = [];
        for (let i = 0; i < this.matPoses.length - 1; i++) {
            const len = Vec3.distance(this.matPoses[i], this.matPoses[i + 1]);
            this.matLengths.push(len + (this.matLengths[i-1] || 0));
        }      

        let pos4 = [];
        this.matPoses.forEach((p, i) => {
            let mp = v4(p.x, p.y, p.z, this.matLengths[i] || 0);
            pos4.push(mp);
        })
        
        this.graphics.forEach(g => {
            let mat = g.material;
            if(!mat) return;
            mat.setProperty("matPoses", pos4);
            mat.setProperty("maxTotalLength", this.maxTotalLength);

            g.clear();
            g.moveTo(this.lposes[0].x, this.lposes[0].y);
            for(let i = 1; i < this.lposes.length; i++) {
                g.lineTo(this.lposes[i].x, this.lposes[i].y);
            }
            g.stroke();            
        })

    }

    setPointMap() {
        this.points = this.pointNodes.children;
        this.pointLength = this.points.length;
        this.points.forEach((point, index) => {
            this.posMap.set(index, point.position.clone());
            this.scaleMap.set(index, point.worldScale.clone());
        })
        this.paraMap.set("strokeWidth", this.strokeWidth);
        this.paraMap.set("smoothStep", this.smoothStep);
        this.paraMap.set("tension", this.tension);
        this.graphics.forEach(g => {
            g.lineWidth = this.strokeWidth;           
        })
    }

    checkPointChange() {
        if(!this.inited) return false;
        if(this.pointLength !== this.pointNodes.children.length) {
            this.changableMesh = true;
            return true;
        }
        for(let [index, pos] of this.posMap) {
            let point = this.pointNodes.children[index];
            if(!point) return true;
            if(!point.position.equals(pos)) return true;
        }
        for(let [index, scale] of this.scaleMap) {
            let point = this.pointNodes.children[index];
            if(!point) return true;
            if(!point.worldScale.equals(scale)) return true;
        }

        for(let key of this.arrayKeys) {
            if(this.paraMap.get(key) !== this[key]) {
                this.changableMesh = true;
                return true;
            }
        }
        

        return false;
    }
    update(deltaTime: number) {
        if(this.checkPointChange()) {
            this.change();            
        }
    }
}

function removeEvenly<T>(arr: T[], removeCount: number): T[] {
    const removeSet = new Set<number>();

    for (let i = 0; i < removeCount; i++) {
        removeSet.add(
            Math.floor((i + 0.5) * arr.length / removeCount)
        );
    }

    return arr.filter((_, idx) => !removeSet.has(idx));
}

function getPositionByRatio(wposes: Vec3[], ratio: number, lengths: number[] = [], totalLength: number = 0) {
    if (wposes.length === 0) {
        return {i: 0, pos: new Vec3()};
    }

    if (wposes.length === 1) {
        return {i: 0, pos: wposes[0]};
    }

    ratio = Math.max(0, Math.min(1, ratio));

    if(ratio == 0) {
        return {i: 0, pos: Vec3.lerp(v3(), wposes[0], wposes[1], 0.001)};
    }

    if(lengths.length == 0 && totalLength == 0) {
        for (let i = 0; i < wposes.length - 1; i++) {
            const len = Vec3.distance(wposes[i], wposes[i + 1]);
            lengths.push(len);
            totalLength += len;
        }
    }

    const targetDistance = totalLength * ratio;

    let accumulated = 0;

    for (let i = 0; i < lengths.length; i++) {
        const segLength = lengths[i];

        if (accumulated + segLength >= targetDistance) {
            const t = (targetDistance - accumulated) / segLength;

            const pos = new Vec3();
            Vec3.lerp(pos, wposes[i], wposes[i + 1], t);

            return {i, pos};
        }

        accumulated += segLength;
    }

    return {i: lengths.length - 1, pos: wposes[wposes.length - 1]};
}



export function catmullRom(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number, tension: number): Vec3 {
    const t2 = t * t;
    const t3 = t2 * t;

    // tính hệ số (m1, m2) có tension
    const m1 = Vec3.subtract(v3(), p2, p0).multiplyScalar((1 - tension) * 0.5);
    const m2 = Vec3.subtract(v3(), p3, p1).multiplyScalar((1 - tension) * 0.5);

    const a = (2 * t3 - 3 * t2 + 1);
    const b = (t3 - 2 * t2 + t);
    const c = (-2 * t3 + 3 * t2);
    const d = (t3 - t2);

    const result = new Vec3();
    result.x = a * p1.x + b * m1.x + c * p2.x + d * m2.x;
    result.y = a * p1.y + b * m1.y + c * p2.y + d * m2.y;
    result.z = a * p1.z + b * m1.z + c * p2.z + d * m2.z;
    return result;
}

// Generate smooth polyline from node list
export function generateSmoothPoints(points: Vec3[], nSamples: number = 10, tension: number = 0): Vec3[] {
    if (points.length < 2) return points;

    const result: Vec3[] = [];
    const n = points.length;

    for (let i = 0; i < n - 1; i++) {
        const p0 = i === 0 ? points[i] : points[i - 1];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = i + 2 < n ? points[i + 2] : points[i + 1];

        for (let j = 0; j < nSamples; j++) {
            const t = j / nSamples;
            result.push(catmullRom(p0, p1, p2, p3, t, tension));
        }
    }

    // luôn thêm điểm cuối
    result.push(points[n - 1].clone());

    return result;
}