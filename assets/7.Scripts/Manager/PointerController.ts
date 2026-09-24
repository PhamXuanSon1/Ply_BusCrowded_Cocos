import { _decorator, Camera, Component, EventMouse, EventTouch, geometry, Input, input, Node, PhysicsSystem, Quat, v3, Vec2, Vec3 } from 'cc';
import { ui } from './UI';
import { sm } from './SoundManager';
const { ccclass, property } = _decorator;

export var pc: PointerController = null!;

@ccclass('PointerController')
export class PointerController extends Component {

    raycast: geometry.Ray = new geometry.Ray();
    pos: Vec3 = null;

    onLoad() {
        pc = this;
    }

    bindingEvent() {
        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END || Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        input.on(Input.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
    }

    unBindingEvent() {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END || Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        input.off(Input.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
    }
    
    onMouseWheel(event: EventMouse) {
        let y = event.getScrollY();   
    }


    bindingStart() {}
    bindingMove() {}
    bindingEnd() {}
    
    onStore() {
        input.on(Input.EventType.TOUCH_START, ui.openStore, ui);
    }

    current: Node = null!;
    location: Vec2 = null!;

    s1: Vec2 = null!;
    s2: Vec2 = null!;

    
    first: boolean = true;
    firstMove() {
        if(this.first) {
            this.first = false;
            console.log("First");
            sm.playBgMusic();
            ui.firstMove();
            // if(!room.tool.node.active) room.stopRotate();
        }
    }

    onTouchStart(event: EventTouch) {  
        this.firstMove();
        this.location = event.getLocation();  
        if(this.s1 == null) {
            this.s1 = this.location.clone();
        } else if(this.s2 == null) {
            this.s2 = this.location.clone();
        }
        if(this.s1 && this.s2) {
            return;
        }
        let result = this.closestRayCastDetect(this.location, ui.wCamera);
        // console.log(result);
        
        if(result) {  
        }
    }

    onTouchMove(event: EventTouch) { 
        this.location = event.getLocation();  
        let touches = event.getTouches();
        
        if(this.s1 && this.s2 && touches.length > 1) {
            return;
        }

        let delta = event.getDelta();
        // convert to rotation
        let speed = 0.01;
        let rotationX = Quat.fromAxisAngle(new Quat(), v3(0, 1, 0), delta.x * speed);
        let rotationY = Quat.fromAxisAngle(new Quat(), v3(1, 0, 0), -delta.y * speed);

        let mul = Quat.multiply(new Quat(), rotationX, rotationY);
        // let mul2 = Quat.multiply(new Quat(), mul, room.pixel.rotation);
    }

    onTouchEnd(event: EventTouch) {
        this.current = null;
        if(this.s1 && this.s2) {
            this.s2 = null;
        } else if (this.s1) {
            this.s1 = null;
        }
    }

    closestRayCastDetect(pos: Vec2, camera: Camera = ui.uiCamera) {
        camera.screenPointToRay(pos.x, pos.y, this.raycast);
        if(PhysicsSystem.instance.raycastClosest(this.raycast)) {
            let result = PhysicsSystem.instance.raycastClosestResult;
            let slot = result.collider.node;
            let hitPoint = result.hitPoint;            
            return {
                slot: slot,
                hitPoint: hitPoint
            }
        }
        return null;
    }

    rayCastDetect(pos: Vec2, layer: number = 1,camera: Camera = ui.uiCamera) {
        camera.screenPointToRay(pos.x, pos.y, this.raycast);
        if(PhysicsSystem.instance.raycast(this.raycast)) {
            let result = PhysicsSystem.instance.raycastResults;
            for(let i = 0; i < result.length; i++) {
                let slot = result[i].collider.node;
                let hitPoint = result[i].hitPoint;
                if(slot.layer === layer) {                    
                    return {
                        slot: slot,
                        hitPoint: hitPoint
                    }
                }
            }
            return null;            
        }
    }

    start() {
        // this.bindingEvent();
    }

    

    update(deltaTime: number) {
    }
}


