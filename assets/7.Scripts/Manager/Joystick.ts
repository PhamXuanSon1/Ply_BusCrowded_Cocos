import { _decorator, Component, EventTouch, Input, input, Node, v3, Vec2 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('Joystick')
export class Joystick extends Component {

    static instance: Joystick = null;

    @property(Node)
    dot: Node = null;

    @property(Node)
    active: Node = null;

    sPos: Vec2 = null;

    dir: Vec2 = null;

    onLoad() {
        Joystick.instance = this;
    }

    bindingStart() {}
    bindingMove() {}
    bindingEnd() {}

    onTouchStart(event: EventTouch) {
        this.active.active = true;
        let touch = event.touch;
        this.sPos = touch.getUILocation();
        this.node.worldPosition = v3(this.sPos.x, this.sPos.y, 0);
        this.bindingStart();
    }

    onTouchMove(event) {
        let touch = event.touch;
        let pos = touch.getUILocation();
        this.dir = pos.subtract(this.sPos);
        let len = this.dir.length();
        let r = 80;
        this.dir = this.dir.normalize();
        this.dot.worldPosition = v3(this.dir.x, this.dir.y, 0).multiplyScalar(r).add(this.node.worldPosition);
        this.bindingMove();
    }

    onTouchEnd(event) {
        this.active.active = false;
        this.dir = null;
        this.dot.worldPosition = v3(0, 0, 0);
        this.bindingEnd();
        // setTimeout(() => {
        //     if(!this.active.active) {
        //         this.active.active = true;
        //         this.active.position = v3(100, 100, 0);
        //     }
        // }, 2000);
    }

    binding() {
        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        // this.active.active = true;
        // this.active.position = v3(300, 600, 0);
    }

    start() {
    }

    bindingUpdate(dt: number) {}

    update(deltaTime: number) {
        if(this.dir) {
            this.bindingUpdate(deltaTime);
        }
    }
}


