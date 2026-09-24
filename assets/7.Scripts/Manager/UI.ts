import { _decorator, Animation, Camera, Color, Component, Enum, Label, misc, Node, Sprite, sys, Tween, tween, UITransform, v3, view} from 'cc';
import { pc, PointerController } from './PointerController';
import { sm, SoundType } from './SoundManager';
import { gc } from '../Tool/GameController';
import { AppLovinAnalytics } from '../Tool/AppLovinAnalytics';
import { truncate } from '../Gameplay/BoxCreator';
const { ccclass, property } = _decorator;

export enum BindUIType {
    Left,
    Right,
    Top,
    Bottom
}

export var ui: UI;

@ccclass("BindingUI")
export class BindingUI {
    @property([Node])
    binds: Node[] = [];
    @property({type: Enum(BindUIType)})
    type: BindUIType = BindUIType.Left;
}

@ccclass('UI')
export class UI extends Component {

    @property(Camera)
    uiCamera: Camera = null!;
    @property(Camera)
    wCamera: Camera = null!;

    @property(Node)
    fail: Node = null!;
    @property(Node)
    win: Node = null!;
    @property(Node)
    hand: Node = null!;

    // @property(Node)
    startHand: Node = null!;
    // @property(Node)
    endHand: Node = null!;
    current: Node = null!;
    cTween: Tween<any> = null!;
    hTween: Tween<any> = null!;

    @property([Node])
    offButtons: Node[] = [];
    @property([Node])
    endOffs: Node[] = [];  
    @property([Node])
    fisrtOn: Node[] = [];
    @property([Node])
    firstOff: Node[] = [];
    @property([Node])
    firstOnTime: Node[] = [];
    @property([Node])
    firstOffTime: Node[] = [];
    @property([Node])
    adaptUIs: Node[] = [];
    @property([Node])
    portraitNodes: Node[] = [];
    @property([Node])
    landscapeNodes: Node[] = [];
    @property([Node])
    gameplays: Node[] = []
    @property([Node])
    widthNodes: Node[] = []
      
    @property([BindingUI])
    bindings: BindingUI[] = [];

    moveDir: number = 0;
    scale: number = 0
    width: number = 0;
    height: number = 0;

    pass25: boolean = false;
    pass50: boolean = false;
    pass75: boolean = false;

    onLoad() {
        // console.log(sys.languageCode, sys.language);
        
        try {
            //@ts-ignore
            if(window.redirectStore.toString() == "function redirectStore(){ExitApi.exit()}") {
                this.offButtons.forEach(node => node.active = false);
            }
            
            
        } catch (error) {
            
        }

        ui = this;
    }

    native: boolean = false;
    onNative() {
        this.native = true;
        this.node.getChildByName("Bindable").active = false;
        this.hand.children[0].active = false;
    }

    bindingToStore() {
        pc?.unBindingEvent();
        pc?.onStore();
    }

    openStore(...args: any) {
        sm.stopAll();
        console.log('openStore');        
        gc.redirectToStore();        
        AppLovinAnalytics.ctaClicked();  
    }

    onProgress(p: number) {
        if(p >= 25 && !this.pass25) {
            this.pass25 = true;
            console.log("Progress", truncate(p, 2));
            AppLovinAnalytics.challenge25();
        }
        if(p >= 50 && !this.pass50) {
            this.pass50 = true;
            console.log("Progress", truncate(p, 2));
            AppLovinAnalytics.challenge50();
        }
        if(p >= 75 && !this.pass75) {
            this.pass75 = true;
            console.log("Progress", truncate(p, 2));
            AppLovinAnalytics.challenge75();
        }
        if(p >= 100) {
            AppLovinAnalytics.challengeSolved();
        }
    }

    
    first: boolean = true;
    firstMove() {
        if(this.first) {
            this.first = false;
            this.fisrtOn.forEach(node => node.active = true);
            this.firstOff.forEach(node => node.active = false);
            setTimeout(() => {                
                this.firstOnTime.forEach(node => node.active = true);
                this.firstOffTime.forEach(node => node.active = false);
            }, 1000);
        }
    }

    onLose() {        
        AppLovinAnalytics.endcardShown();  
        if(this.native) return;
        this.fail.active = true;
        this.bindingToStore();     
        sm.playSound(SoundType.Lose);   
        this.endOffs.forEach(button => {
            button.active = false;
        });
    }

    onWin() {
        AppLovinAnalytics.endcardShown();  
        if(this.native) return;
        this.win.active = true;
        this.bindingToStore();     
        sm.playSound(SoundType.Win);
        this.endOffs.forEach(button => {
            button.active = false;
        });
    }

    handTap(node: Node) {
        this.current = node;
        if(!node) return;
        this.hand.active = true;
        let pos = this.hand.worldPosition.clone();
        this.hand.worldPosition = node.worldPosition.clone();
        this.hand.worldPositionZ = pos.z;
    }

    offHand() {
        this.hand.active = false;
        this.hTween?.stop();
        this.cTween?.stop();
        this.current = null;
    }

    moveHand() {
        if(!this.startHand || !this.endHand) 
            return;
        this.handTap(this.startHand);
        // return;
        let child = this.hand.children[0].getComponent(Sprite)!;
        // child.node.scale = v3(1, 1, 1).multiplyScalar(this.defaultWOrtho / 14 * 0.007);
        const hand = this.hand;
        child.color = new Color(255, 255, 255, 255);
        let pos = this.endHand.getWorldPosition();
        let delta = this.hand.worldPosition.clone().subtract(pos);
        if(this.moveDir == 0) {

            let p = v3(this.hand.worldPosition.x,  this.hand.worldPosition.y, pos.z);
            let dd = this.hand.worldPosition.clone().subtract(p);
            let tt = dd.length() * 0.15;
            // console.log(tt);


            // Board.ins.tutCat.setMove();
            this.hTween = tween(this.hand)
            .delay(0.2)
            .to(tt, {worldPosition: p}, {easing: 'smooth', 
            onUpdate(target, ratio) {
            },})
            .call(() => {          
                p = v3(pos.x, this.hand.worldPosition.y,  this.hand.worldPosition.z);
                let dd = this.hand.worldPosition.clone().subtract(p);
                let tt = dd.length() * 0.15;
                // console.log(tt);
                
                this.hTween = tween(this.hand)
                .to(tt, {worldPosition: p}, {easing: 'smooth', 
                    onUpdate(target, ratio) {
                    },
                })
                .call(() => {
                    this.cTween = tween(child).delay(0.2).to(0.2, {color: new Color(255, 255, 255, 0)}, {easing: 'smooth'})
                    .call(() => {
                        this.moveHand();
                    })
                    .start();   
                })
                .start();
            })
            .start();

        } else if (this.moveDir == 1) {

            let p = v3(pos.x, pos.y, pos.z);
            let time = delta.length() * 0.2;


            this.hTween = tween(this.hand)
            .delay(0.2)
            .to(time, {worldPosition: p}, {easing: 'smooth'})
            .call(() => {          
                this.cTween = tween(child).delay(0.2).to(0.2, {color: new Color(255, 255, 255, 0)}, {easing: 'smooth'})
                .call(() => {
                    this.moveHand();
                })
                .start();   
            })
            .start();

        }
    }

    @property(BindingUI)
    topNode: BindingUI = null!;
    @property(BindingUI)
    bottomNode: BindingUI = null!;
    @property(BindingUI)
    leftNode: BindingUI = null!;
    @property(BindingUI)
    rightNode: BindingUI = null!;

    getEdge(type: BindUIType) {
        switch(type) {
            case BindUIType.Top:
                return this.topNode.binds[0].getWorldPosition().y;
            case BindUIType.Bottom:
                return this.bottomNode.binds[0].getWorldPosition().y;
            case BindUIType.Left:
                return this.leftNode.binds[0].getWorldPosition().x;
            case BindUIType.Right:
                return this.rightNode.binds[0].getWorldPosition().x;
        }
    }

    bind() {
        let pos = this.uiCamera.node.position.clone();
        {
            this.topNode.binds[0].position = this.topNode.binds[0].position.clone();
            this.topNode.binds[0].position = v3(this.topNode.binds[0].position.x + pos.x, 
            this.height + pos.y, 
            this.topNode.binds[0].position.z);

            this.bottomNode.binds[0].position = this.bottomNode.binds[0].position.clone();
            this.bottomNode.binds[0].position = v3(this.bottomNode.binds[0].position.x + pos.x, 
            -this.height + pos.y, 
            this.bottomNode.binds[0].position.z);

            this.leftNode.binds[0].position = this.leftNode.binds[0].position.clone();
            this.leftNode.binds[0].position = v3(-this.width + pos.x, 
            this.leftNode.binds[0].position.y + pos.y, 
            this.leftNode.binds[0].position.z);

            this.rightNode.binds[0].position = this.rightNode.binds[0].position.clone();
            this.rightNode.binds[0].position = v3(this.width + pos.x, 
            this.rightNode.binds[0].position.y + pos.y, 
            this.rightNode.binds[0].position.z);
        }


        this.bindings.forEach(bind => {
            bind.binds.forEach(item => {
                item.position = item.position.clone();
                let pos = item.getWorldPosition();
                switch(bind.type) {
                    case BindUIType.Top:
                        pos.y = this.getEdge(bind.type);
                        break;
                    case BindUIType.Bottom:
                        pos.y = this.getEdge(bind.type);
                        break;
                    case BindUIType.Left:
                        pos.x = this.getEdge(bind.type);
                        break;
                    case BindUIType.Right:
                        pos.x = this.getEdge(bind.type);
                        break;
                }
                let lpos = item.parent.inverseTransformPoint(v3(), pos);
                item.position = lpos;
            })            
        })   
    }

    
    keepTap() {    
        if(this.current && this.hand.active) {
            this.handTap(this.current);
        }   
    }

    resize(scale: number = this.scale) {
        this.scale = scale;
        let time = 0;
        this.height = this.uiCamera.orthoHeight;
        this.width = 1080/2350 * this.height * scale;  
        console.log(this.width / this.height, this.width, this.height);
        setTimeout(() => {            
            this.keepTap();          
        }, time);
        let max = 2;
        if(this.width / this.height < 1.5) {
            scale = misc.clampf(scale, 1, max);
            this.gameplays.forEach((item) => {
                item.scale = v3(1, 1, 1).multiplyScalar(1*scale);          
            })  
            this.portraitNodes.forEach((item) => {
                item.active = true;
            });
            this.landscapeNodes.forEach((item) => {
                item.active = false;
            });
            this.adaptUIs.forEach((item) => {
                item.scale = v3(1, 1, 1);
            });
        } else {
            this.gameplays.forEach((item) => {
                item.scale = v3(1, 1, 1).multiplyScalar(max);          
            })  
            this.portraitNodes.forEach((item) => {
                item.active = false;
            });
            this.landscapeNodes.forEach((item) => {
                item.active = true;
            });
            this.adaptUIs.forEach((item) => {
                item.scale = v3(1, 1, 1).multiplyScalar(2);
            });

        }
        this.widthNodes.forEach((item) => {
            let x = item.getWorldScale().x;
            let uit = item.getComponent(UITransform)!;
            uit.width = this.width / x * 2;
        })
        this.bind();  
        
    }

    update(dt: number) {  
        let size = view.getVisibleSize();
        let scale = size.width/1080;
        if(scale != this.scale) {
            this.resize(scale);
        }

        if(this.current) {
            this.handTap(this.current);
        }
    }
}