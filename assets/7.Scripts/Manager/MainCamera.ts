import { _decorator, Camera, Color, Component, Node, v3, Vec2, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('MainCamera')
export class MainCamera extends Component {
    
    @property(Camera)
    camera: Camera = null!;

    onLoad() {
    }

    start() {
    }

    update(deltaTime: number) {
    }
}


