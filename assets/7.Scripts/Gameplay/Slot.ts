import { _decorator, Component, Node } from 'cc';
import { Bus } from './Bus';
import { PoolMember } from '../Pool/PoolMember';
const { ccclass, property } = _decorator;

@ccclass('Slot')
export class Slot extends PoolMember {

    bus: Bus = null;

    init() {

    }

    update(deltaTime: number) {
        
    }
}


