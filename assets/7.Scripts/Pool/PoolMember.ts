// Learn TypeScript:
//  - https://docs.cocos.com/creator/2.4/manual/en/scripting/typescript.html
// Learn Attribute:
//  - https://docs.cocos.com/creator/2.4/manual/en/scripting/reference/attributes.html
// Learn life-cycle callbacks:
//  - https://docs.cocos.com/creator/2.4/manual/en/scripting/life-cycle-callbacks.html

// const {ccclass, property} = cc._decorator;
import { _decorator, Component, Node, Prefab, instantiate, Vec3, Quat, Enum } from 'cc';

const { ccclass, property } = _decorator;

export enum PoolType {
    Default,
    Bus,
    Van,
    Car,
    Slot,
    Human,
    VFX,
    TextFx,
    Score,
}

@ccclass
export class PoolMember extends Component{
    @property({type: Enum(PoolType)})
    type: PoolType = PoolType.Default;
}