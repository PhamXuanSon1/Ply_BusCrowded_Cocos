import { _decorator, Component, MeshRenderer, Node, v3, Vec3 } from 'cc';
import Ulis, { Rect3, rect3 } from '../Misc/Ulis';
import { EDITOR_NOT_IN_PREVIEW } from 'cc/env';
const { ccclass, property } = _decorator;

@ccclass('Bound')
export class Bound extends Component {

    points: Node[] = [];
    
    @property
    center: Vec3 = v3(0, 0);
    @property
    size: Vec3 = v3(0, 0);
    des: Node = null;

    init() {
        if(!EDITOR_NOT_IN_PREVIEW) this.node.getChildByName("Points").active = false;
        let meshes = this.node.getChildByName("Points")
        .getComponentsInChildren(MeshRenderer);
        this.des = meshes.pop().node;
        this.points = meshes.map((m) => m.node);
    }

    getBoxes() {
        return [this.leftBox, this.rightBox, this.topBox, this.bottomBox];
        // let boxes: Rect3[] = [];
        // let ps = [...this.points];
        // this.points.forEach((p, i) => {
        //     let p0 = p.getWorldPosition();
        //     let p1 = ps[(i + 1) % ps.length].getWorldPosition();
        //     p0 =  this.node.inverseTransformPoint(v3(), p0);
        //     p1 =  this.node.inverseTransformPoint(v3(), p1);
        //     let dir = p1.clone().subtract(p0);
        //     let length = dir.length();
        //     let ct = p0.clone().add(p1).multiplyScalar(0.5);
        //     ct.z = this.center.z;
        //     let sz = v3(this.size.x, length, this.size.z*10);
        //     boxes.push(this.getRect3(ct, sz));
        // })
    }

    get leftBox() {
        let p0 = this.points[0].getWorldPosition();
        let p1 = this.points[1].getWorldPosition();

        p0 =  this.node.inverseTransformPoint(v3(), p0);
        p1 =  this.node.inverseTransformPoint(v3(), p1);

        let dir = p1.clone().subtract(p0);
        let length = dir.length();

        let ct = p0.clone().add(p1).multiplyScalar(0.5);
        ct.z = this.center.z;
        let sz = v3(this.size.x, length, this.size.z*10);
        return this.getRect3(ct, sz);
    }

    get rightBox() {
        let p0 = this.points[2].getWorldPosition();
        let p1 = this.points[3].getWorldPosition();

        p0 =  this.node.inverseTransformPoint(v3(), p0);
        p1 =  this.node.inverseTransformPoint(v3(), p1);

        let dir = p1.clone().subtract(p0);
        let length = dir.length();

        let ct = p0.clone().add(p1).multiplyScalar(0.5);
        ct.z = this.center.z;
        let sz = v3(this.size.x, length, this.size.z*10);
        return this.getRect3(ct, sz);
    }

    get bottomBox() {
        let p0 = this.points[1].getWorldPosition();
        let p1 = this.points[2].getWorldPosition();

        p0 =  this.node.inverseTransformPoint(v3(), p0);
        p1 =  this.node.inverseTransformPoint(v3(), p1);

        let dir = p1.clone().subtract(p0);
        let length = dir.length();

        let ct = p0.clone().add(p1).multiplyScalar(0.5);
        ct.z = this.center.z;
        let sz = v3(length, this.size.y, this.size.z);
        return this.getRect3(ct, sz);
    }

    get topBox() {
        let p0 = this.points[0].getWorldPosition();
        let p1 = this.points[3].getWorldPosition();

        p0 =  this.node.inverseTransformPoint(v3(), p0);
        p1 =  this.node.inverseTransformPoint(v3(), p1);

        let dir = p1.clone().subtract(p0);
        let length = dir.length();

        let ct = p0.clone().add(p1).multiplyScalar(0.5);
        ct.z = this.center.z;
        let sz = v3(length, this.size.y, this.size.z);
        return this.getRect3(ct, sz);
    }

    getRect3(ct: Vec3, sz: Vec3) {
        let center = Ulis.getWpos(ct.clone(), this.node);
        let scale = this.node.getWorldScale();
        let size = sz.clone().multiply3f(scale.x, scale.y, scale.z);
        return rect3(center.x - size.x/2, center.y - size.y/2, center.z - size.z/2, size.x, size.y, size.z);
    }

    update(deltaTime: number) {
        
    }
}


