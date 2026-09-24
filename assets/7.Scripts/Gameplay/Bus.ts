import { _decorator, Animation, Enum, Label, MeshRenderer, Node, ParticleSystem, rect, toRadian, tween, v3, Vec3 } from 'cc';
import { ColorType } from './Data';
import { gm } from './Game';
import { PoolMember, PoolType } from '../Pool/PoolMember';
import { PREVIEW } from 'cc/env';
import Ulis, { Rect3, rect3 } from '../Misc/Ulis';
import { Slot } from './Slot';
import { Human } from './Human';
import { sm, SoundType } from '../Manager/SoundManager';
import { pm } from '../Pool/PoolManager';
const { ccclass, property } = _decorator;

@ccclass('Bus')
export class Bus extends PoolMember {

    // boxCollider: BoxCollider = null;
    particle: ParticleSystem = null;
    box: Node = null;
    open: Node = null;
    seats: Node[] = [];
    seatPoses: Vec3[] = [];
    p0: Vec3 = v3();
    slotTurn: Vec3 = v3();
    meshes: MeshRenderer[] = [];
    @property({type: Enum(ColorType), visible: true})
    dColor: ColorType = ColorType.Red;
    slot: Slot = null;
    anim: Animation = null;
    dis: number = 0.2;

    obstascles: Node[] = [];
    blockeds: Node[] = [];
    moving: boolean = false;
    label: Label = null!;

    remain: number = 0;
    // Tổng số người xe này cần (seatPoses.length * humanPerRow — nhiều hơn số ghế vật lý
    // vì giờ mỗi lần lên xe lấy nguyên 1 row humanPerRow người).
    totalSeats: number = 0;

    @property([Human])
    humans: Human[] = [];
    pHumans: Human[] = [];

    @property
    set resetColor(v: boolean) { this.color = this.dColor; }
    get resetColor() { return false; }

    @property

    @property({type: Enum(ColorType)})
    set color(v: ColorType) {
        this._color = v;
        this.dColor = v;
        this.setColor(v);
    }
    get color() { return this._color; }
    _color: ColorType = ColorType.Red;

    @property
    set angle180(v: boolean) {  this.node.angle += 180;}
    get angle180() { return false;}
    @property
    set angle90(v: boolean) {  this.node.angle += 90;}
    get angle90() { return false;}
    @property
    set noramlAngle(v: boolean) {
      let eu = this.node.eulerAngles.clone();
      if((eu.x == -180 && eu.y == -180) || (eu.x == 180 && eu.y == 180)) {
        eu.x = 0;
        eu.y = 0;
        eu.z = 180 + - eu.z;
        this.node.eulerAngles = eu;
      }  
    }
    get noramlAngle() { return false;}

    
    @property
    center: Vec3 = v3(0, 0);
    @property
    size: Vec3 = v3(0, 0);

    packing: boolean = false;


    init(color: ColorType) {
        this.color = color === null ? this.dColor : color;
        this.particle = this.getComponentInChildren(ParticleSystem);
        this.anim = this.getComponent(Animation);
        // this.boxCollider = this.getComponent(BoxCollider);

        // this.center = this.boxCollider.center.clone();
        // this.size = this.boxCollider.size.clone();

        this.box = this.node.children[0].getChildByName("Render").getChildByName("Box");
        this.open = this.node.children[0].getChildByName("Render").getChildByName("Open");
        this.label = this.box.getComponentInChildren(Label);
        this.label.node.active = false;
        this.seats = this.node.children[0].getChildByName("Seats").getComponentsInChildren(MeshRenderer).map((seat) => seat.node);
        this.seatPoses = this.seats.map((seat) => {
            let wpos = seat.getWorldPosition();
            let lpos = this.node.inverseTransformPoint(v3(), wpos);
            lpos.z = 0;
            return lpos;
        });
        this.p0 = this.seatPoses[this.seatPoses.length - 1].clone();
        this.p0.x = this.dis;
        this.totalSeats = this.seats.length * gm.humanPerRow;
        this.remain = this.totalSeats;
        this.label.string = this.remain + "";
        this.setColor(this.color);
        // this.getRect();
    }

    setColor(color: ColorType = this.color) {
        if(this.meshes.length == 0) {
            this.meshes = this.getComponentsInChildren(MeshRenderer).filter(m => m.node.name == "Color")
        }
        this.meshes.forEach((mesh) => {
            let mats = mesh.sharedMaterials;
            mats.pop();
            mats.push(gm.boxMats[color]);
            mesh.sharedMaterials = mats;
        });
    }

    getRect() {
        let center = Ulis.getWpos(this.center.clone(), this.node);
        let scale = this.node.getWorldScale();
        let size = this.size.clone().multiply3f(scale.x, scale.y, scale.z);
        let rct = rect(center.x - size.x/2, center.y - size.y/2, size.x, size.y);
        return rct;
    }

    getRect3() {
        let center = Ulis.getWpos(this.center.clone(), this.node);
        let scale = this.node.getWorldScale();
        let size = this.size.clone().multiply3f(scale.x, scale.y, scale.z);
        return rect3(center.x - size.x/2, center.y - size.y/2, center.z - size.z/2, size.x, size.y, size.z);
    }

    setSlot(slot: Slot) {
        if(this.slot) {
            this.slot.bus = null;
        }
        this.slot = slot;
        if(this.slot)
        this.slot.bus = this;
    }

    addHuman(human: Human) {
        this.humans.push(human);
        human.bus = this;
        let r = this.totalSeats - this.humans.length;
        if(r < 0) r = 0;
        this.label.string = r + "";
        if(r == 0) {
            this.label.node.active = false; 
            this.spawnScore();
        }
    }

    spawnScore() {
        let sc = pm.spawn(PoolType.Score);
        sc.node.parent = gm.brain;
        sc.node.worldPosition = this.node.getWorldPosition();
        sc.node.eulerAngles = v3(0, 0, 0);
        sc.node._objFlags = 0;
        sc.getComponentInChildren(Label).string = gm.amount.toString();
        let pos = gm.brainText.node.getWorldPosition();
        sc.node.position = sc.node.position.add(v3(0, 0, 2));
        pos = sc.node.parent.inverseTransformPoint(v3(), pos);
        let time = Vec3.distance(sc.node.getPosition(), pos) / 10 * 0.5;
        tween(sc.node)
        .to(time, {position: pos})
        .call(() => {
            pm.despawn(sc);
            gm.setScore();
        })
        .start();
    }

    smoking() {
        this.particle.node.active = true;
        this.particle.capacity = 1000;
        this.particle.rateOverTime.constant = 50;
        this.particle.play();
    }

    smokint() {
        this.particle.capacity = 0;
        setTimeout(() => {
            this.particle.clear();
            this.particle.node.active = false;
        }, 300);
    }

    shake() {
        this.anim.play();
    }

    onNoSlot() {
        // this.shake();
        // let fx = pm.spawn(PoolType.TextFx);
        // fx.node.parent = gm.node;
        // fx.node.worldPosition = this.node.getWorldPosition();
        // fx.getComponent(Animation).play();
        // setTimeout(() => {
        //     pm.despawn(fx);
        // }, 1000);
        gm.noSlot.play();
    }

    onSlot() {
        this.box.getChildByName("Arrow").active = false;
        this.label.node.active = true;
        this.moving = false;
    }

    checked: boolean = false;
    checkReady() {
        if(this.humans.length == this.totalSeats) {
            let movingHuman = this.humans.find(h => h.moving || h.sitting);
            if(!movingHuman && !this.checked) {
                this.checked = true;
                sm.playSoundDup(SoundType.Ting);
                gm.moveBusOut(this);
            }
        }
    }

    onDespawn() {
        this.obstascles.forEach(o =>{
            if(!o) return;
            try {
                let bus = o.getComponent(Bus);
                bus.blockeds.splice(bus.blockeds.indexOf(this.node), 1);                
            } catch (error) {
                // console.log(error);
            }
        })
        this.node.destroy(); 
    }

    update(deltaTime: number) {
        
    }
}


