import { _decorator, Color, color, Component, EventKeyboard, EventTouch, Input, input, instantiate, KeyCode, Node, RigidBody2D, Sprite, v2, v3 } from 'cc';
import Ulis from '../Misc/Ulis';
import { LevelData } from './Data';
const { ccclass, property } = _decorator;


export const Colors = [
    "#da563f",
    "#2046c1",
    "#14323c",
]

@ccclass('BoxCreator')
export class BoxCreator extends Component {

    temp: Node
    box: Node
    boxes: Node[] = [];
    typeBoxes: Node[][] = [];

    start() {
        this.init();
    }

    applyIndexNoise(baseColor: Color, pixelIndex: number): Color {

        const noise = (((pixelIndex * 73) + 17) % 21) - 10;
        const strength = Math.random() * 0.1;
        const scale = 1 + noise * strength;

        const r = Math.round(Math.min(255, Math.max(0, baseColor.r * scale)));
        const g = Math.round(Math.min(255, Math.max(0, baseColor.g * scale)));
        const b = Math.round(Math.min(255, Math.max(0, baseColor.b * scale)));

        return color(r, g, b, baseColor.a);
    }

    init() {
        this.temp = this.node.getChildByName("Temp");
        this.box = this.node.getChildByName("Box");

        let sizeMul = 1.2;

        LevelData.sizes.forEach((size, i) => {
            let amount = LevelData.sumBus[i];
            for (let j = 0; j < amount; j++) {
                let clone = instantiate(this.temp);
                let c = color().fromHEX(Colors[i]);
                c = this.applyIndexNoise(c, i + j);
                clone.getComponent(Sprite).color = c;
                clone.parent = this.box;
                clone.worldPosition = this.temp.getWorldPosition();
                clone.scale = v3(size[2], size[3], 1).multiplyScalar(sizeMul);
                clone.active = true;
                clone["type"] = i;          
                
                if(!this.typeBoxes[i]) this.typeBoxes[i] = [];
                this.typeBoxes[i].push(clone);
                
                this.boxes.push(clone);
            }
        })

        //Coloring box via ColorAmounts
        this.typeBoxes.forEach((boxes, i) => {
            boxes = Ulis.shuffleArray(boxes);            
        })
        LevelData.sumHuman.forEach((amount, i) => {
            let iAmount = [...amount]
            let iColor = iAmount.shift();
            iAmount.forEach((item, i) => {
                let boxes = this.typeBoxes[i].splice(0, item);
                boxes.forEach(b => {
                    b["color"] = iColor;
                })
            })
        })

        this.onTouchStart(null);
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    }

    onTouchStart(event: EventTouch) {
        let max = 15;
        this.boxes.forEach(b => {
            let f = v2(1, 1).multiplyScalar(max);
            f.x = Math.random() > 0.5 ? -f.x : f.x;
            f.y = Math.random() > 0.5 ? -f.y : f.y;
            
            let body = b.getComponent(RigidBody2D);
            body.linearVelocity = f;

            let maxA = 15;
            body.angularVelocity = Math.random() > 0.5 ? maxA : -maxA;

        })
    }

    onKeyDown(event: EventKeyboard) {
        if(event.keyCode == KeyCode.SPACE) {
            let data = [];
            this.boxes.forEach(b => {
                data.push([b["type"], b["color"] ,truncate(b.position.x, 3), truncate(b.position.y, 3), truncate(b.angle, 3)]);
            })
            console.log(JSON.stringify(data));
        } else if(event.keyCode == KeyCode.KEY_Z) {
            this.onTouchStart(null);
        }   
    }

    update(deltaTime: number) {
        
    }
}

export function truncate(n: number, m: number): number {
    const factor = 10 ** m;
    return Math.trunc(n * factor) / factor;
}


