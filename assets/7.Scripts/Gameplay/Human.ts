import { _decorator, Animation, color, Component, Enum, MeshRenderer, Node, NodeSpace, Quat, SkeletalAnimation, Sprite, toRadian, tween, Tween, v2, v3, Vec2, Vec3 } from 'cc';
import { PoolMember } from '../Pool/PoolMember';
import { ColorType } from './Data';
import { gm } from './Game';
import { pm } from '../Pool/PoolManager';
import { Bus } from './Bus';
import { EDITOR_NOT_IN_PREVIEW } from 'cc/env';
import { AdjustSaturation } from '../Misc/Mats';
const { ccclass, property } = _decorator;
export enum Anim {
    Idle = 'Idle',
    Run = 'Run',
    Sit = 'Sit',
}
@ccclass('Human')
export class Human extends PoolMember {

    @property({type: Enum(ColorType)})
    set color(v: ColorType) {
        this._color = v;
        this.setColor(v);
    }
    get color() { return this._color; }
    _color: ColorType = ColorType.Red;
    @property
    index: Vec2 = v2();
    meshes: MeshRenderer[] = [];
    anim: SkeletalAnimation = null;
    cachedPath: Vec2[] = null;
    @property
    moving: boolean = false;
    sitting: boolean = false;
    bus: Bus = null;
    runSpeed: number = 2;
    sprite: Sprite = null!;
    shadow: MeshRenderer = null!;
    am: Animation = null!;
    @property
    lineIndex: number = 0;
    pTween: Tween<any> = tween({});
    rTween: Tween<any> = tween({});
    @property
    movingIndex: number = 0;
    row: any = null;


    init(color: ColorType, index: Vec2, lineIndex: number = 0) {
        this.color = color;
        this.index = index;
        this.lineIndex = lineIndex;
        this.movingIndex = lineIndex;
        this.cachedPath = null;
        this.moving = false;
        this.sitting = false;

        this.anim = this.getComponentInChildren(SkeletalAnimation);
        
        this.anim.clips.forEach((clip) => {
            clip.speed = this.runSpeed;;
        });

        this.shadow = this.getComponentsInChildren(MeshRenderer).find(m => m.node.name == "Shadow");
        
        
        this.setColor(color);
        this.node.eulerAngles = v3(0, 0, -180);
        this.spin();

        this.shadow.node.active = false;
        this.anim.node.active = false;
        this.sprite.node.active = false;

        this.am = this.node.children[1].getComponentInChildren(Animation);
    }
    
    setColor(cl: ColorType = this.color) {

        if(!this.sprite) {
            this.sprite = this.getComponentInChildren(Sprite);
        }
        if(cl !== ColorType.Black) {
            let c = gm.colors[cl].clone();
            let light = 0;
            let sat = 1.3;
            c.r += light;
            c.g += light;
            c.b += light; 
            let ad = AdjustSaturation(v3(c.r / 255, c.g / 255, c.b / 255), sat).multiplyScalar(255);
            c = color(ad.x, ad.y, ad.z, 255);
            this.sprite.color = c;
        } else {
            this.sprite.spriteFrame = gm.blackHuman;
        }

        if(this.meshes.length == 0) {
            this.meshes = this.getComponentsInChildren(MeshRenderer).filter(m => m.node.name == "Color")
        }
        this.meshes.forEach((mesh) => {
            let mats = mesh.sharedMaterials;
            mats.pop();
            mats.push(gm.humanMats[cl]);
            mesh.sharedMaterials = mats;
        });
    }

    onDespawn() {
        pm.despawn(this);
    }
    
    setMoving(on: boolean) {
        this.moving = on;
        if(on) this.run();
        else this.idle();
    }

    run() {
        this.anim.node.active = true;
        // this.shadow.node.active = true;
        this.sprite.node.active = false;
        this.anim.play(Anim.Run);
    }

    idle() {
        this.anim.play(Anim.Idle);
    }

    sit() {
        this.anim.play(Anim.Sit);
    }

        
    spin(angle: number = -10) {
        this.node.children[0].eulerAngles = v3(-90, 180, 0);
        let vec = v3(1, 0, 0);
        let q = new Quat();
        Quat.fromAxisAngle(q, vec, toRadian(angle));   
        this.node.children[0].rotate(q, NodeSpace.WORLD);     
    }

    onRing() {
        return this.row && this.row.slotIndex >= 0;
    }

    update(deltaTime: number) {
        if(this.moving || this.onRing()) {
            this.spin();
        }
    }
}


