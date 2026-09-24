import { _decorator, BoxCollider, CCObject, Color, Component, EventKeyboard, EventTouch, Input, input, KeyCode, Node, RenderTexture, Sprite, Texture2D, v2, v3, Vec2, Vec3 } from 'cc';
import { colors, ColorType } from '../Gameplay/Data';
const { ccclass, property } = _decorator;


@ccclass('Tool')
export class Tool extends Component {
    init() {
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);

        let tut = "Key_D: increase color\nKey A: decrease color\nKey C: toggle deletable\nKey Z: toggle selectable\nKey X: swap choosings\nKey S: shuffle box color\nKey F: toggle jigsaw\n";

        console.log(tut);
    }

    color: ColorType = ColorType.Red;
    deletable: boolean = false;
    @property
    savePng: boolean = false;
    map: Map<Node, Vec2> = new Map();

    onJigsawTouch(event: EventTouch) {
        let target = event.target as Node;
        this.onTouch(target);
    }

    onTouch(target: Node) {
        let value = this.map.get(target)!;
        if(value.y == 1) {
            value.y = 0;
            target.getComponent(Sprite).color = Color.BLACK;
        }
        else {
            value.y = 1;
            target.getComponent(Sprite).color = Color.WHITE;
        }
        this.map.set(target, value);
        
    }

    onKeyDown(event: EventKeyboard) {

        let length = colors.length;
        

        if(event.keyCode == KeyCode.KEY_D) {
            this.color ++;
            if(this.color >= length) this.color = 0;
            console.log(this.color, ColorType[this.color]);            
        }
        else if(event.keyCode == KeyCode.KEY_A) {
            this.color --;
            if(this.color < 0) this.color = length - 1;
            console.log(this.color, ColorType[this.color]);     
        }
        else if(event.keyCode == KeyCode.KEY_C) {
            if(this.deletable === null) {
                this.deletable = true;
            } else if(this.deletable === true) {
                this.deletable = false;
            } else {
                this.deletable = null;
            }
            console.log("Deletable", this.deletable);
            
        }
        else if(event.keyCode == KeyCode.KEY_S) {
        }
        else if(event.keyCode == KeyCode.KEY_F) {
        }
        else if(event.keyCode == KeyCode.KEY_Z) {      
        }
        else if(event.keyCode == KeyCode.KEY_X) {
        }
        else if(event.keyCode == KeyCode.KEY_E) {
        }
        else if(event.keyCode == KeyCode.KEY_Q) {         
        }
        else if(event.keyCode == KeyCode.KEY_W) {     
        }
        else if(event.keyCode == KeyCode.KEY_B) {              
        }
        else if(event.keyCode == KeyCode.KEY_N) {     
        }
        else if(event.keyCode == KeyCode.KEY_M) {
        }
        else if(event.keyCode == KeyCode.SPACE) {
            this.printData();
        }
    }

    onRayCast(node: Node, hitpoint: Vec3) {
    }



    printData() {
        let data: {
        slots: number[][];
        boxes: number[][];
        pixels: number[][];
        } = {
            slots: [],
            boxes: [],
            pixels: []
        }
        

        console.log("export const Data = " + JSON.stringify(data));
        // if(this.savePng) this.savePNG(sand.texData, sand.index.x, sand.index.y, "sand.png");
        
    }
    savePNG(data: Uint8Array, width:number, height:number, name:string){

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');

        const imgData = ctx.createImageData(width,height);

        // đảo Y vì GPU ngược
        for(let y=0;y<height;y++){
            for(let x=0;x<width;x++){

                let src = ((y)*width+x)*4;
                let dst = (y*width+x)*4;

                imgData.data[dst] = data[src];
                imgData.data[dst+1] = data[src+1];
                imgData.data[dst+2] = data[src+2];
                imgData.data[dst+3] = data[src+3];
            }
        }

        ctx.putImageData(imgData,0,0);


        const link = document.createElement('a');
        link.download=name;
        link.href=canvas.toDataURL("image/png");
        link.click();
    }

    update(deltaTime: number) {
        
    }
}


