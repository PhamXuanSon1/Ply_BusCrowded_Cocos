// Learn TypeScript:
//  - https://docs.cocos.com/creator/2.4/manual/en/scripting/typescript.html
// Learn Attribute:
//  - https://docs.cocos.com/creator/2.4/manual/en/scripting/reference/attributes.html
// Learn life-cycle callbacks:
//  - https://docs.cocos.com/creator/2.4/manual/en/scripting/life-cycle-callbacks.html

import { CCInteger, Component, Node, Prefab, Quat, Vec3, _decorator, instantiate, log, v3 } from "cc"; 
// import { PoolAmount } from "./PoolAmount";
import { PoolMember, PoolType } from "./PoolMember";
import { PoolManager } from "./PoolManager";

const { ccclass, property, executeInEditMode } = _decorator;

@ccclass('PoolAmount')
export class PoolAmount {
  // @property(Node)
  public root: Node = null;

  @property(Prefab)
  public prefab: PoolMember = null;

  @property(CCInteger)
  public amount: number = 0;
}

@ccclass
@executeInEditMode(true)
export default class PoolControl extends Component {

  @property(Node)
  root: Node = null;
  // @property([Prefab])
  // prefabs: PoolMember[] = [];

  @property([PoolAmount])
  poolAmounts: PoolAmount[] = [];

  preLoad() {
    // this.prefabs.forEach((prefab, index) => {
    //   let poolAmount = new PoolAmount();
    //   poolAmount.root = this.root;
    //   poolAmount.prefab = prefab;
    //   poolAmount.amount = 0;
    //   this.poolAmounts.push(poolAmount);
    // })
    this.poolAmounts.forEach((poolAmount, index) => {
      poolAmount.root = this.root;
    })
  }

  // LIFE-CYCLE CALLBACKS:

  onLoad() {
    this.preLoad();
  }

  start() {
  }

  // update (dt) {}
}