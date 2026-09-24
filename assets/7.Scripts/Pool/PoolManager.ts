// Learn TypeScript:
//  - https://docs.cocos.com/creator/2.4/manual/en/scripting/typescript.html
// Learn Attribute:
//  - https://docs.cocos.com/creator/2.4/manual/en/scripting/reference/attributes.html
// Learn life-cycle callbacks:
//  - https://docs.cocos.com/creator/2.4/manual/en/scripting/life-cycle-callbacks.html

import { CCInteger, CCObject, Component, Node, Prefab, Quat, Vec3, _decorator, instantiate, log, v3 } from "cc"; 
// import { PoolAmount } from "./PoolAmount";
import { PoolMember, PoolType } from "./PoolMember";
import PoolControl, { PoolAmount } from "./PoolControl";

const { ccclass, property, executeInEditMode } = _decorator;


export class Pool {
  list: PoolMember[] = [];
  prefab: PoolMember = null;
  root: Node = null;
  constructor(root: Node, prefab: PoolMember, amount: number) {
    this.prefab = prefab;
    this.root = root;
    for (let i = 0; i < amount; i++) {
      let clone = instantiate(prefab).getComponent(PoolMember);
      clone.node._objFlags = CCObject.Flags.DontSave | CCObject.Flags.HideInHierarchy;
      clone.node.parent = root;
      clone.node.active = false;
      this.list.push(clone);
    }
  }

  spawn(position: Vec3, rotation: Quat): PoolMember {
    var clone: PoolMember = null;
    if (this.list.length == 0) {
      clone = instantiate(this.prefab).getComponent(PoolMember);
      clone.node._objFlags = CCObject.Flags.DontSave | CCObject.Flags.HideInHierarchy;
      clone.node.parent = this.root;
    } else {
      clone = this.list.pop();
    }
    clone.node.position = position;
    clone.node.rotation = rotation;
    clone.node.active = true;
    return clone;
  }

  despawn(clone: PoolMember) {
    clone.node.parent = this.root;
    clone.node.active = false;
    clone.node.scale = v3(1, 1, 1);
    clone.node.position = v3(0, 0, 0);
    this.list.push(clone);
  }
}


export var pm: PoolManager = null;

@ccclass
@executeInEditMode(true)
export class PoolManager extends Component{

  
  @property(PoolControl)
  poolControll: PoolControl = null;
  
  link: Map<PoolType, Pool> = new Map<PoolType, Pool>();

  preLoad(poolAmounts: PoolAmount[]) {
    for (let i = 0; i < poolAmounts.length; i++) {
      let poolAmount = poolAmounts[i];
      let pool = new Pool(
        poolAmount.root,
        poolAmount.prefab,
        poolAmount.amount
      );
      let type = instantiate(poolAmount.prefab).getComponent(PoolMember).type;

      if (!this.link.has(type)) {
        this.link.set(type, pool);        
      }
      // console.log(this.link.get(type));
      
    }
  }

  spawn(type: PoolType, position: Vec3 = v3(), rotation: Quat = Quat.fromEuler(new Quat(), 0, 0, 0)): PoolMember {
    let pool = this.link.get(type);    
    return pool.spawn(position, rotation);
  }
  
  spawnType<T>(type: PoolType, position: Vec3 = v3(), rotation: Quat = Quat.fromEuler(new Quat(), 0, 0, 0)): T {
    let pool = this.link.get(type);
    // console.log('pool', pool, type);    
    return pool.spawn(position, rotation) as T;
  }

  despawn(clone: PoolMember) {
    let pool = this.link.get(clone.type);
    pool.despawn(clone);
  }

  onLoad() {
    pm = this;
    this.preLoad(this.poolControll.poolAmounts);
  }
    
}

