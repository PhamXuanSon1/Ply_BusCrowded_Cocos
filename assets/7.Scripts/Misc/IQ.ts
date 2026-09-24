import { _decorator, Component, Label, Node, Sprite, tween, Tween, UITransform, v3, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('IQ')
export class IQ extends Component {

    
        
    iqTween: Tween<any> = null!;
    // @property(Sprite)
    fill: Sprite = null!
    // @property(Node)
    needle: Node = null!
    label: Label = null!
    total: number = 0;
    count: number = 0;

    init(total: number) {
        this.total = total;
        let sp = this.getComponentsInChildren(Sprite);
        this.fill = sp.find((s) => s.node.name == "Fill")!;
        this.needle = sp.find((s) => s.node.name == "Needle").node;
        this.label = this.getComponentInChildren(Label);
        this.onIq();
    }

    setProgress() {
        this.count++;
        this.onIq();
    }
        
    onIq() {
        const r = this.fill.fillRange;
        let range = this.count/this.total;
        if(range >= 0.9) {
            // ui.bindingToStore();
        }
        
        this.label.string = ((range * 100) | 0)  + "%";
        let dt = range - r;
        let uit = this.fill.getComponent(UITransform);
        let scale = this.fill.node.getWorldScale();
        let pos = this.fill.node.getWorldPosition();
        let pos0 = pos.clone();
        let pos1 = pos.clone();
        pos0.x = pos.x - scale.x * uit.width * 0.5;
        pos1.x = pos.x + scale.x * uit.width * 0.5;
        pos0 = this.needle.parent.inverseTransformPoint(v3(), pos0);
        pos1 = this.needle.parent.inverseTransformPoint(v3(), pos1);
        let t = this;
        t.needle.position = Vec3.lerp(v3(), pos0, pos1, r + 1 * dt);
        this.iqTween?.stop();
        this.iqTween = tween(this.fill)
        .to(0.2, {fillRange: range}, {
            onUpdate(target, ratio) {
                t.needle.position = Vec3.lerp(v3(), pos0, pos1, r + ratio * dt);
            },
        })
        .start();
    }

    update(deltaTime: number) {
        
    }
}


