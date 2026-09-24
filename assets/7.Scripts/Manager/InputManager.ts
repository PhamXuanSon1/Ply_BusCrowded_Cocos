import { _decorator, Component, EventTouch, Input, input, misc, Node, v2, Vec2 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('InputManager')
export class InputManager extends Component {

    static instance: InputManager = null;

    onLoad() {
        InputManager.instance = this;
    }

    startPos: Vec2 = null;

    dir: Vec2 = null;

    bindingStart() {}
    bindingMove() {}
    bindingEnd() {}
    bindingUpdate() {}

    onTouchStart(event: EventTouch) {
        this.startPos = event.getUILocation();
        this.bindingStart();
    }

    onTouchMove(event: EventTouch) {
        // console.log('move');
        
        let touch = event.touch;
        let pos = touch.getUILocation();
        this.dir = pos.clone().subtract(this.startPos);
        let len = misc.clampf(this.dir.length(), 0, 5);
        // let r = 80;
        // this.dir = this.dir.normalize().multiplyScalar(len);
        this.bindingMove();
        this.startPos = pos;
        this.dir = null;
    }

    onTouchEnd(event: EventTouch) {
        this.bindingEnd();
        this.startPos = null;
        this.dir = null;
    }

    binding() {
        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    }

    start() {
        this.binding()
    }

    update(deltaTime: number) {
       this.bindingUpdate(); 
    }
}


