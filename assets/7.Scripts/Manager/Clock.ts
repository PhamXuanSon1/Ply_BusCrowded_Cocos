import { _decorator, Color, Component, Label, Node, Tween, tween, UI, v3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('Clock')
export class Clock extends Component {

    @property
    time: number = 0;
    max: number = 0;
    @property(Label)
    label: Label = null!;
    @property(Node)
    needle: Node = null!;
    tween: Tween<any> = null!;
    changeColor: boolean = false;

    setTime() {
        this.needle.eulerAngles = v3(0, 0, -(this.max - this.time) * 360 / 60);
        let seconds = this.time % 60;
        let secondsStr = seconds < 10 ? '0' + seconds : seconds.toString();

        let minutes = (this.time - seconds) / 60;
        let minutesStr = minutes.toString();
        this.label.string = minutesStr + ' : ' + secondsStr  
        if(!this.changeColor) 
        if(this.time < 20) {
            this.changeColor = true;
            this.label.color = new Color(255, 0, 0);
        }
    }

    onTimeUp() {

    }

    count() {
        this.tween = tween({t: 0})
        .to(this.max, {t: 1}, {
            "onUpdate": (target, ratio) => {
                this.time = this.max - Math.floor(this.max * ratio);
                this.setTime();
            }
        })
        .call(() => {
            this.onTimeUp();
        })
        .start();
    }

    stop() {
        this.tween.stop();
    }

    start() {
        this.max = this.time;
        this.setTime();
        // setTimeout(() => {
        //     this.count();
        // }, 1000);
    }

    update(deltaTime: number) {
        
    }
}


