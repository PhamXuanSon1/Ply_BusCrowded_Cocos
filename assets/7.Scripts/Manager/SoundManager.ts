// Learn TypeScript:
//  - https://docs.cocos.com/creator/2.4/manual/en/scripting/typescript.html
// Learn Attribute:
//  - https://docs.cocos.com/creator/2.4/manual/en/scripting/reference/attributes.html
// Learn life-cycle callbacks:
//  - https://docs.cocos.com/creator/2.4/manual/en/scripting/life-cycle-callbacks.html

import { AudioSource, CCObject, Component, Game, _decorator, game, instantiate} from 'cc';
const {ccclass, property} = _decorator;

export enum SoundType{
    BGM,
    Click,
    Collide,
    Sit,
    Ting,
    Lose,
    Win,
}

export var sm: SoundManager = null;

@ccclass
export default class SoundManager extends Component {

    onLoad() {
        sm = this;
    }

    // @property(AudioSource)
    audiosource: AudioSource[] = [];
    volumes: number[] = [];
    fail: boolean = false;
    playBG: boolean = false;

    pools: AudioSource[][] = [];
    currents: AudioSource[][] = [];

    // voiceIndex: number = SoundType.Match - 1;

    playVoice() {
        // this.voiceIndex++;
        // if(this.voiceIndex > SoundType.Coin) this.voiceIndex = SoundType.Match;

        // if(this.voiceIndex == SoundType.Match) {
        //     lm.room.setTextVfx('EXCELLENT!');
        // } else if(this.voiceIndex == SoundType.Coin) {
        //     lm.room.setTextVfx('GOOD JOB!');
        // }

        // this.playSoundDup(this.voiceIndex);
    }

    playSound(type: SoundType, loop: boolean = false, call = () => {}): AudioSource{
        if(this.fail) return;
        if(this.audiosource[type]){
            if(this.audiosource[type].playing) {
            }
            this.audiosource[type].play();
            this.audiosource[type].loop = loop;
            setTimeout(() => {
                call();
            }, this.audiosource[type].duration*1000);

        }
        return this.audiosource[type];
    }
    maxDup: number = 10;
    playSoundDup(type: SoundType, loop: boolean = false, call = () => {}): AudioSource{
        if(this.fail) return;
        if(this.currents[type].length >= this.maxDup) return;
        if(this.audiosource[type]){      
            let audio = this.pools[type][1];  
            if(audio) {
                this.pools[type].shift();
            } else {
                audio = instantiate(this.pools[type][0].node).getComponent(AudioSource);
                audio.node.parent = this.node;
            }
            audio.node.parent = this.node;
            audio.node["type"] = type;
            audio.node._objFlags = CCObject.Flags.DontSave | CCObject.Flags.HideInHierarchy;
            audio.loop = loop;
            audio.play();
            this.currents[type].push(audio);
            setTimeout(() => {
                call();
                this.despawn(audio);
            }, audio.duration*1000);
            return audio;
        }
        return this.audiosource[type];
    }

    despawn(audio: AudioSource) {
        let type = audio.node["type"];
        this.currents[type].splice(this.currents[type].indexOf(audio), 1);
        this.pools[type].push(audio);
    }

    validPlayDub(audio: AudioSource) {
        if(this.fail) return;
        if(!audio) return;
        if(audio.playing) return;
        audio.play();
    }

    isPlaying(type: SoundType): boolean {
        return this.audiosource[type]?.playing;
    }
    

    playSounds(types: SoundType[], loop: boolean = false, step: number = 0, call = () => {}){        
        this.playNext(types, 0, loop, step, call);
    }

    playNext(types: SoundType[], index: number, loop: boolean = false, step: number = 0, call = () => {}){
        if(index >= types.length) return;
        let beLoop = false;
        if(index == types.length-1) {
            beLoop = loop;
            call();
        }
        let audio = this.playSound(types[index], beLoop);
        if(!audio) return;
        setTimeout(() => {
            this.playNext(types, index+1, loop, step, call);
        }, (audio.duration + step)*1000*0.5);
    }

    stopAll(){
        this.fail = true;
        for(let i = 0; i < this.audiosource.length; i++){
            this.audiosource[i]?.stop();
            this.pools[i].forEach(a => a.stop());
            this.currents[i].forEach(a => a.stop());
        }
    }

    stopSound(type: SoundType){
        this.audiosource[type]?.stop();
    }


    checkAudio() {
        //@ts-ignore
        if(window.volume !== undefined) {
            //@ts-ignore
            if(window.volume >= 10) {
                this.unMuteAll();
            } else {
                this.muteAll();
            }
        }
    }

    playBgMusic() {
        if(this.playBG) return;
        this.playBG = true;
        
        setTimeout(() => {
            this.playSound(SoundType.BGM, false, () => { 
                console.log("Next bgm");
                               
                this.playSound(SoundType.BGM, true);
            });            
        }, 100);
    }

    onNative() {
        let audio = this.audiosource[SoundType.BGM];
        audio.volume = 0;
        this.volumes[SoundType.BGM] = 0;
    }

    start () {
        // this.playBgMusic();
        
        this.audiosource = this.node.getComponentsInChildren(AudioSource);
        // console.log(this.audiosource);
        
        this.volumes = this.audiosource.map(a => a.volume);
        this.eventSound();        
        this.schedule(this.checkAudio, 1);
        this.checkAudio();
        let keys = Object.keys(SoundType);
        keys.splice(0, keys.length/2)
        this.pools = keys.map((k, i) => []);
        this.currents = keys.map((k, i) => []);
        this.audiosource.forEach((a, i) => {
            for(let index = 0; index < 10; index ++) {
                let aa = instantiate(a.node).getComponent(AudioSource);
                aa.node._objFlags = CCObject.Flags.DontSave | CCObject.Flags.HideInHierarchy;
                aa.node.parent = this.node;
                this.pools[i].push(aa);
                // aa.play();
                // setTimeout(() => {
                //     aa.stop();
                // }, 0);
            }
        })
        // console.log(this.pools);
        
        
    }
    eventSound() {
        
        game.on(Game.EVENT_HIDE, () => {
           this.muteAll(); 
        });

        game.on(Game.EVENT_SHOW, () => {
           this.unMuteAll(); 
        });

        window.addEventListener("audioChanged", (e: CustomEvent) => {
            if (e.detail.mute) {
                this.muteAll();
            } else {
                this.unMuteAll();

            }
        });

        document.addEventListener("visibilitychange", () => {
            if(document.hidden) {
                this.muteAll();
            } else {
                this.unMuteAll();
            }
          });
          
          document.addEventListener("pause", () => {
            // Thiết bị bị khóa màn hình
            console.log("Màn hình đã bị khóa");
            this.muteAll();
          });
          
          document.addEventListener("play", () => {
            // Thiết bị mở màn hình trở lại
            console.log("Màn hình đã được mở lại");
            this.unMuteAll();
          });
          
    }

    public muteAll(): void {
        console.log("muteAll");
        
        for(let i = 0; i < this.audiosource.length; i++){
            if(this.audiosource[i]) this.audiosource[i].volume = 0;
            this.pools[i].forEach(a => a.volume = 0);
            this.currents[i].forEach(a => a.volume = 0);
        }
    }

   public unMuteAll(): void {
        console.log("unMuteAll");
        
        for(let i = 0; i < this.audiosource.length; i++){
            if(this.audiosource[i]) this.audiosource[i].volume = this.volumes[i];
            this.pools[i].forEach(a => a.volume = this.volumes[i]);
            this.currents[i].forEach(a => a.volume = this.volumes[i]);
        }
    }

    update (dt) {
    }
}
