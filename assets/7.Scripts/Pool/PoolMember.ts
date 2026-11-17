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
    // xe cứu hoả (khung + ghế như Bus), port từ Bus Jam. Thêm cuối để không lệch số các loại đã lưu trong scene/prefab;
    // trong BusData loại = FireCar - Bus = 8. Khách của nó đứng nhóm riêng (HumanGroup)
    FireCar,
    // lính cứu hoả: người trong nhóm riêng của xe cứu hoả (HumanGroup), dùng component Human như người thường
    Fireman,
    // xe trượt ông già Noel (khách đứng riêng HumanGroup), loại riêng không dùng chung FireCar; BusData loại = Sleigh - Bus = 10
    Sleigh,
    // ông già Noel: khách của xe trượt (HumanGroup), dùng component Human, rig giống Fireman
    Santa,
}

@ccclass
export class PoolMember extends Component{
    @property({type: Enum(PoolType)})
    type: PoolType = PoolType.Default;
}