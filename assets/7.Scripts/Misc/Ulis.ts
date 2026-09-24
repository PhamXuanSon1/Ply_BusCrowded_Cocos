// Learn TypeScript:
//  - https://docs.cocos.com/creator/2.4/manual/en/scripting/typescript.html
// Learn Attribute:
//  - https://docs.cocos.com/creator/2.4/manual/en/scripting/reference/attributes.html
// Learn life-cycle callbacks:
//  - https://docs.cocos.com/creator/2.4/manual/en/scripting/life-cycle-callbacks.html

import { EventTouch, Node, Rect, Sprite, SpriteFrame, Tween, TweenEasing, UITransform, Vec2, Vec3, _decorator, misc, rect, resources, toDegree, tween, v2, v3 } from 'cc';
import { pc } from '../Manager/PointerController';
import { ui } from '../Manager/UI';
const {ccclass, property} = _decorator;



export interface Rect3 {
    x: number;
    y: number;
    z: number;
    width: number;
    height: number;
    depth: number;
}

export function rect3(x: number, y: number, z: number, width: number, height: number, depth: number): Rect3 {
    return { x, y, z, width, height, depth };
}

@ccclass
export default class Ulis {
  static allNode(node: Node, callback: Function = () => {}) {
    callback(node);
    node.children.forEach((child) => {
      this.allNode(child, callback);
    });
  }

  static getPlatform() {
    var userAgent = navigator.userAgent || navigator.vendor;
    if (/android|Android/i.test(userAgent)) {
      return "android";
    }
    // iOS detection from: http://stackoverflow.com/a/9039885/177710
    if (/iPad|iPhone|iPod|Macintosh/.test(userAgent)) {
      return "ios";
    }
    return "android";
  }

  static iRand(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 0.9)) + min;
  }

  static addToParent(node: Node, parent: Node) {
    let des = node.getWorldPosition();
    let rot = node.getWorldRotation();
    let scale = node.getWorldScale();
    node.parent = parent;
    node.setWorldPosition(des);
    node.setWorldRotation(rot);
    node.setWorldScale(scale);
  }

  static totalLenght(posses: Vec3[]) {
    let total = 0;
    for (let i = 1; i < posses.length; i++) {
      total += Vec3.distance(posses[i - 1], posses[i]);
    }
    return total;
  }

  static shuffleArray<T>(array: T[], indices: number[] = []): T[] {
    // Lấy độ dài của mảng
    const n = array.length;
    // Thực hiện xáo trộn theo thuật toán Fisher-Yates
    for (let i = n - 1; i > 0; i--) {
      // Chọn một chỉ số ngẫu nhiên từ 0 đến i
      let j = 0;
      if (indices.length == 0) {
        j = Math.floor(Math.random() * (i + 1));
      } else {
        j = indices.shift() || 0;
      }
      // Hoán đổi phần tử tại vị trí i với phần tử tại vị trí j
      [array[i], array[j]] = [array[j], array[i]];
    }
    // console.log(JSON.stringify(ind));

    return array;
  }
  static lerpParabola(
    A: Vec3,
    B: Vec3,
    t: number,
    height: number,
    peak: number,
  ): Vec3 {
    const linear = new Vec3();
    Vec3.lerp(linear, A, B, t);

    // Parabola: 0 tại t=0, t=1; đạt max tại peak
    let curve = (t * (1 - t)) / (peak * (1 - peak));

    // tránh vượt quá do sai số
    // curve = Math.max(0, Math.min(1, curve));

    const offset = new Vec3(0, curve * height, 0);

    return linear.add(offset);
  }

  /**
   * @en Test rect and rect
   * @zh 测试矩形与矩形是否相交
   */
  static rectRect(a: Rect, b: Rect, delta: number = 0): boolean {
    // jshint camelcase:false

    const a_min_x = a.x;
    const a_min_y = a.y;
    const a_max_x = a.x + a.width;
    const a_max_y = a.y + a.height;

    const b_min_x = b.x;
    const b_min_y = b.y;
    const b_max_x = b.x + b.width;
    const b_max_y = b.y + b.height;

    return (
      (a_min_x < b_max_x - delta &&
        a_max_x - delta > b_min_x &&
        a_min_y < b_max_y - delta &&
        a_max_y - delta > b_min_y) ||
      (b_min_x < a_max_x - delta &&
        b_max_x - delta > a_min_x &&
        b_min_y < a_max_y - delta &&
        b_max_y - delta > a_min_y)
    );
  }

    static pointRect(p: Vec2, r: Rect, angle: number): boolean {
        // Tâm Rect
        const cx = r.x + r.width * 0.5;
        const cy = r.y + r.height * 0.5;

        // Đưa point về hệ tọa độ local của Rect
        // => xoay ngược lại angle
        const rad = -angle * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        const dx = p.x - cx;
        const dy = p.y - cy;

        const localX = dx * cos - dy * sin;
        const localY = dx * sin + dy * cos;

        // Kiểm tra trong Rect local
        return (
            localX >= -r.width * 0.5 &&
            localX <=  r.width * 0.5 &&
            localY >= -r.height * 0.5 &&
            localY <=  r.height * 0.5
        );
    }

  static rayPlane(
    rayOrigin: Vec3,
    rayDir: Vec3,
    planePoint: Vec3,
    planeNormal: Vec3
    ): Vec3 | null {
        const denom = Vec3.dot(rayDir, planeNormal);

        // Ray song song với mặt phẳng
        if (Math.abs(denom) < 1e-6) {
            return null;
        }

        const diff = new Vec3();
        Vec3.subtract(diff, planePoint, rayOrigin);

        const t = Vec3.dot(diff, planeNormal) / denom;

        // Chỉ lấy giao điểm nằm phía trước ray
        if (t < 0) {
            return null;
        }

        const result = new Vec3();
        Vec3.scaleAndAdd(result, rayOrigin, rayDir, t);

        return result;
    }

  static rayRect(root: Vec2, dir: Vec2, rect: Rect): boolean {
    let tMin = -Infinity;
    let tMax = Infinity;

    // X
    if (Math.abs(dir.x) < 1e-6) {
      if (root.x < rect.x || root.x > rect.x + rect.width) return false;
    } else {
      let tx1 = (rect.x - root.x) / dir.x;
      let tx2 = (rect.x + rect.width - root.x) / dir.x;

      tMin = Math.max(tMin, Math.min(tx1, tx2));
      tMax = Math.min(tMax, Math.max(tx1, tx2));
    }

    // Y
    if (Math.abs(dir.y) < 1e-6) {
      if (root.y < rect.y || root.y > rect.y + rect.height) return false;
    } else {
      let ty1 = (rect.y - root.y) / dir.y;
      let ty2 = (rect.y + rect.height - root.y) / dir.y;

      tMin = Math.max(tMin, Math.min(ty1, ty2));
      tMax = Math.min(tMax, Math.max(ty1, ty2));
    }

    return tMax >= Math.max(0, tMin);
  }

  static rayRectPoint(
    root: Vec2,
    dir: Vec2,
    rect: Rect,
    angle: number
): Vec2 | null {
    // angle: độ
    const rad = -angle * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Tâm rect
    const center = new Vec2(
        rect.x + rect.width * 0.5,
        rect.y + rect.height * 0.5
    );

    // Đưa point về local space của rect
    const localRoot = new Vec2(
        root.x - center.x,
        root.y - center.y
    );

    {
        const x = localRoot.x * cos - localRoot.y * sin;
        const y = localRoot.x * sin + localRoot.y * cos;

        localRoot.set(x, y);
    }

    // Đưa direction về local space
    const localDir = new Vec2(
        dir.x * cos - dir.y * sin,
        dir.x * sin + dir.y * cos
    );

    // Rect local có tâm tại 0
    const halfW = rect.width * 0.5;
    const halfH = rect.height * 0.5;

    let tMin = -Infinity;
    let tMax = Infinity;

    // X
    if (Math.abs(localDir.x) < 1e-8) {
        if (localRoot.x < -halfW || localRoot.x > halfW)
            return null;
    } else {
        let t1 = (-halfW - localRoot.x) / localDir.x;
        let t2 = ( halfW - localRoot.x) / localDir.x;

        if (t1 > t2) [t1, t2] = [t2, t1];

        tMin = Math.max(tMin, t1);
        tMax = Math.min(tMax, t2);
    }

    // Y
    if (Math.abs(localDir.y) < 1e-8) {
        if (localRoot.y < -halfH || localRoot.y > halfH)
            return null;
    } else {
        let t1 = (-halfH - localRoot.y) / localDir.y;
        let t2 = ( halfH - localRoot.y) / localDir.y;

        if (t1 > t2) [t1, t2] = [t2, t1];

        tMin = Math.max(tMin, t1);
        tMax = Math.min(tMax, t2);
    }

    if (tMin > tMax || tMax < 0)
        return null;

    const t = tMin >= 0 ? tMin : tMax;

    // Điểm giao trong local space
    const localHit = new Vec2(
        localRoot.x + localDir.x * t,
        localRoot.y + localDir.y * t
    );

    // Đưa điểm giao về world space
    const c = Math.cos(-rad);
    const s = Math.sin(-rad);

    return new Vec2(
        center.x + localHit.x * c - localHit.y * s,
        center.y + localHit.x * s + localHit.y * c
    );
}

  static rayRect3(root: Vec3, dir: Vec3, box: Rect3): boolean {
    let tMin = -Infinity;
    let tMax = Infinity;

    // X
    if (Math.abs(dir.x) < Number.EPSILON) {
      if (root.x < box.x || root.x > box.x + box.width) {
        return false;
      }
    } else {
      const tx1 = (box.x - root.x) / dir.x;
      const tx2 = (box.x + box.width - root.x) / dir.x;

      tMin = Math.max(tMin, Math.min(tx1, tx2));
      tMax = Math.min(tMax, Math.max(tx1, tx2));
    }

    // Y
    if (Math.abs(dir.y) < Number.EPSILON) {
      if (root.y < box.y || root.y > box.y + box.height) {
        return false;
      }
    } else {
      const ty1 = (box.y - root.y) / dir.y;
      const ty2 = (box.y + box.height - root.y) / dir.y;

      tMin = Math.max(tMin, Math.min(ty1, ty2));
      tMax = Math.min(tMax, Math.max(ty1, ty2));
    }

    // Z
    if (Math.abs(dir.z) < Number.EPSILON) {
      if (root.z < box.z || root.z > box.z + box.depth) {
        return false;
      }
    } else {
      const tz1 = (box.z - root.z) / dir.z;
      const tz2 = (box.z + box.depth - root.z) / dir.z;

      tMin = Math.max(tMin, Math.min(tz1, tz2));
      tMax = Math.min(tMax, Math.max(tz1, tz2));
    }

    // tMax < 0 nghĩa là cả hộp nằm phía sau tia
    return tMax >= Math.max(0, tMin);
  }

  static rayRect3Point(root: Vec3, dir: Vec3, box: Rect3): Vec3 | null {
    let tMin = -Infinity;
    let tMax = Infinity;

    const update = (origin: number, dir: number, min: number, max: number) => {
      if (Math.abs(dir) < Number.EPSILON) {
        if (origin < min || origin > max) return false;
        return true;
      }

      const t1 = (min - origin) / dir;
      const t2 = (max - origin) / dir;

      tMin = Math.max(tMin, Math.min(t1, t2));
      tMax = Math.min(tMax, Math.max(t1, t2));

      return tMin <= tMax;
    };

    if (
      !update(root.x, dir.x, box.x, box.x + box.width) ||
      !update(root.y, dir.y, box.y, box.y + box.height) ||
      !update(root.z, dir.z, box.z, box.z + box.depth)
    ) {
      return null;
    }

    if (tMax < 0) return null;

    const t = Math.max(0, tMin);

    return new Vec3(root.x + dir.x * t, root.y + dir.y * t, root.z + dir.z * t);
  }

  static rayLinePoint(
    root: Vec2,
    dir: Vec2,
    start: Vec2,
    end: Vec2,
  ): Vec2 | null {
    const EPS = 1e-6;

    const line = end.clone().subtract(start);

    const cross = dir.x * line.y - dir.y * line.x;

    // Song song
    if (Math.abs(cross) < EPS) {
      return null;
    }

    const diff = start.clone().subtract(root);

    const t = (diff.x * line.y - diff.y * line.x) / cross;
    const u = (diff.x * dir.y - diff.y * dir.x) / cross;

    // Không nằm trên tia hoặc không nằm trên đoạn
    if (t < 0 || u < 0 || u > 1) {
      return null;
    }

    return new Vec2(root.x + dir.x * t, root.y + dir.y * t);
  }

  static getBox(b: Node) {
    let ut1 = b.getComponent(UITransform);
    let scale1 = b.getWorldScale();
    let w1 = ut1.width * scale1.x;
    let h1 = ut1.height * scale1.y;
    let wpos1 = b.getWorldPosition();
    let box = rect(wpos1.x - w1 / 2, wpos1.y - h1 / 2, w1, h1);
    return box;
  }

  static simplifyPath(path: Vec2[]): Vec2[] {
    if (path.length <= 2) return path;

    const result: Vec2[] = [];

    result.push(path[0]);

    for (let i = 1; i < path.length - 1; i++) {
      const prev = path[i - 1];
      const curr = path[i];
      const next = path[i + 1];

      const v1 = new Vec2(curr.x - prev.x, curr.y - prev.y);

      const v2 = new Vec2(next.x - curr.x, next.y - curr.y);

      // cross 2D
      const cross = v1.x * v2.y - v1.y * v2.x;

      // cùng hướng => bỏ điểm giữa
      if (Math.abs(cross) < 0.0001) {
        continue;
      }

      result.push(curr);
    }

    result.push(path[path.length - 1]);

    return result;
  }
  static simplifyPathWRange(path: Vec3[], minDistance: number): Vec3[] {
    if (path.length <= 2) return [...path];

    const result: Vec3[] = [];
    result.push(path[0]);

    let i = 1;

    while (i < path.length - 1) {
      const prev = result[result.length - 1];
      const curr = path[i];

      if (Vec3.distance(prev, curr) < minDistance) {
        // Bỏ điểm hiện tại
        i++;
        continue;
      }

      result.push(curr);
      i++;
    }

    // luôn giữ điểm cuối
    result.push(path[path.length - 1]);

    return result;
  }

  static getWpos(lpos: Vec3, node: Node): Vec3 {
    let matrix = node.getWorldMatrix();
    return Vec3.transformMat4(v3(), lpos, matrix);
  }

  static moveToPoints(
    node: Node,
    path: Vec3[],
    callback: Function,
    mTimeMul: number = 1,
    rotable: boolean = false,
    eu: Vec3 = null,
    euTimeMul: number = 1,
    islpos: boolean = false,
    pTween: Tween<any> = tween({}),
    rTween: Tween<any> = tween({}),
    checkStop: Function = () => {return false;},
    update1: Function = () => {},
    update2: Function = () => {},
  ) {
    let point = path.shift()!;
    if (point == undefined) {
      callback && callback();
      return;
    }
    Ulis.moveTo(
      node,
      point,
      () => {
        Ulis.moveToPoints(node, path, callback, mTimeMul, rotable, eu, euTimeMul, islpos, pTween, rTween, checkStop, update1, update2);
      },
      mTimeMul, rotable, eu, euTimeMul, islpos, pTween, rTween, checkStop, update1, update2
    );
  }

  static moveTo(
    node: Node,
    point: Vec3,
    callback: Function,
    mTimeMul: number = 1,
    rotable: boolean = false,
    eu: Vec3 = null,
    euTimeMul: number = 1,
    islpos: boolean = false,
    pTween: Tween<any> = tween({}),
    rTween: Tween<any> = tween({}),
    checkStop: Function = () => {return false;},
    update1: Function = () => {},
    update2: Function = () => {},
  ) {
    if(checkStop(pTween, rTween)) return;
    let lpos = node.parent.inverseTransformPoint(v3(), point);
    if(islpos) lpos = point;
    let dpos = node.getPosition();
    let dir = lpos.clone().subtract(dpos);
    
    let time = (dir.length() / 10) * mTimeMul;

    pTween = tween(node)
      .to(time, { position: lpos }, { easing: "linear" })
      .call(() => {
        callback && callback();
      })
      .start();

    update1(pTween, rTween);

    // try {
    //   // if this node has a Human component, keep its pTween reference in sync
    //   const comp: any = node.getComponent && node.getComponent('Human');
    //   if (comp) comp.pTween = pTween;
    // } catch (e) {}

    if (!rotable) return time;
    
    
    let euler = node.eulerAngles.clone();

    if (!eu) {
        let angle = toDegree(Math.atan2(dir.y, dir.x)) - 90;

        angle = nearestAngle(angle, euler.z);

        eu = v3(0, 0, angle);
    }
    
    let eTime = time * euTimeMul;
    
    eTime = Math.min(eTime, 0.1);

    rTween = tween(node)
    .to(
        eTime,
        { eulerAngles: eu },
        {
        easing: "linear",
        },
    )
    .call(() => {})
    .start();

    update2(pTween, rTween);

    // try {
    //   // also sync rTween to Human component when present
    //   const comp: any = node.getComponent && node.getComponent('Human');
    //   if (comp) comp.rTween = rTween;
    // } catch (e) {}

    return time;
  }

  static signedAngle(dir: Vec3, normal: Vec3) {
    let angle = Math.atan2(dir.y, dir.x);
    let cross = Vec3.cross(v3(), dir, normal);
    if (cross.z < 0) {
      angle = -angle;
    }
    return angle;
  }

}

export function nearestAngle(angle: number, current: number): number {
    return current + ((((angle - current) + 180) % 360 + 360) % 360 - 180);
}

export function splitSum(
    n: number,
    splits: number[] = [10, 6, 4]
): { count: number[], r: number } {
    const target = Math.floor(n);
    const previous = new Array<number>(target + 1).fill(-1);
    previous[0] = -2;

    for (let sum = 1; sum <= target; sum++) {
        for (let index = 0; index < splits.length; index++) {
            const value = splits[index];
            if (value > 0 && sum >= value && previous[sum - value] !== -1) {
                previous[sum] = index;
                break;
            }
        }
    }

    let best = target;
    while (best > 0 && previous[best] === -1) {
        best--;
    }

    const count = new Array<number>(splits.length).fill(0);
    for (let sum = best; sum > 0;) {
        const index = previous[sum];
        count[index]++;
        sum -= splits[index];
    }

    return {
        count,
        r: n - best,
    };
}

export const cEasing = (type: TweenEasing, param: number = 2) => {
    switch(type) {
        case 'linear':
            return (k: number) => k;
        case 'smooth':
            return (k: number) => k * k * (3 - 2 * k);
        case 'fade':
            return (k: number) => k * k * k * (k * (k * 6 - 15) + 10);
        case 'constant':
            return (k: number) => k >= 1 ? 1 : 0;
        case 'quadIn':
            return (k: number) => Math.pow(k, 2);
        case 'quadOut':
            return (k: number) => 1 - Math.pow(1 - k, 2);
        case 'quadInOut':
            return (k: number) => k < 0.5 ? 2 * Math.pow(k, 2) : 1 - 2 * Math.pow(1 - k, 2);
        case 'quadOutIn':
            return (k: number) => k < 0.5 ? 1 - 2 * Math.pow(1 - 2 * k, 2) : 2 * Math.pow(2 * k - 1, 2);
        case 'cubicIn':
            return (k: number) => Math.pow(k, 3);
        case 'cubicOut':
            return (k: number) => 1 - Math.pow(1 - k, 3);
        case 'cubicInOut':
            return (k: number) => k < 0.5 ? 4 * Math.pow(k, 3) : 1 - 4 * Math.pow(1 - k, 3);
        case 'cubicOutIn':
            return (k: number) => k < 0.5 ? 1 - 4 * Math.pow(1 - 2 * k, 3) : 4 * Math.pow(2 * k - 1, 3);
        case 'quartIn':
            return (k: number) => Math.pow(k, 4);
        case 'quartOut':
            return (k: number) => 1 - Math.pow(1 - k, 4);
        case 'quartInOut':
            return (k: number) => k < 0.5 ? 8 * Math.pow(k, 4) : 1 - 8 * Math.pow(1 - k, 4);
        case 'quartOutIn':
            return (k: number) => k < 0.5 ? 1 - 8 * Math.pow(1 - 2 * k, 4) : 8 * Math.pow(2 * k - 1, 4);
        case 'quintIn':
            return (k: number) => Math.pow(k, 5);
        case 'quintOut':
            return (k: number) => 1 - Math.pow(1 - k, 5);
        case 'quintInOut':
            return (k: number) => k < 0.5 ? 16 * Math.pow(k, 5) : 1 - 16 * Math.pow(1 - k, 5);
        case 'quintOutIn':
            return (k: number) => k < 0.5 ? 1 - 16 * Math.pow(1 - 2 * k, 5) : 16 * Math.pow(2 * k - 1, 5);
        case 'sineIn':
            return (k: number) => 1 - Math.cos(k * Math.PI / 2);
        case 'sineOut':
            return (k: number) => Math.sin(k * Math.PI / 2);
        case 'sineInOut':
            return (k: number) => -(Math.cos(Math.PI * k) - 1) / 2;
        case 'sineOutIn':
            return (k: number) => k < 0.5 ? Math.sin(Math.PI * k) / 2 : 1 - Math.sin(Math.PI * (k - 0.5)) / 2;
        case 'expoIn':
            return (k: number) => k === 0 ? 0 : Math.pow(2, 10 * (k - 1));
        case 'expoOut':
            return (k: number) => k === 1 ? 1 : 1 - Math.pow(2, -10 * k);
        case 'expoInOut':
            return (k: number) => k === 0 ? 0 : k === 1 ? 1 : k < 0.5 ? Math.pow(2, 20 * k - 10) / 2 : (2 - Math.pow(2, -20 * k + 10)) / 2;
        case 'expoOutIn':
            return (k: number) => k < 0.5 ? (1 - Math.pow(2, -20 * k)) / 2 : (Math.pow(2, 20 * k - 10) + 1) / 2;
        case 'circIn':
            return (k: number) => 1 - Math.sqrt(1 - Math.pow(k, 2));
        case 'circOut':
            return (k: number) => Math.sqrt(1 - Math.pow(k - 1, 2));
        case 'circInOut':
            return (k: number) => k < 0.5 ? (1 - Math.sqrt(1 - 4 * Math.pow(k, 2))) / 2 : (Math.sqrt(1 - 4 * Math.pow(k - 1, 2)) + 1) / 2;
        case 'circOutIn':
            return (k: number) => k < 0.5 ? Math.sqrt(1 - Math.pow(2 * k - 1, 2)) / 2 : (2 - Math.sqrt(1 - Math.pow(2 * k - 1, 2))) / 2;
        case 'elasticIn':
            return (k: number) => {
                const p = param / 10; // period
                const a = 1; // amplitude
                return k === 0 ? 0 : k === 1 ? 1 : -a * Math.pow(2, 10 * (k - 1)) * Math.sin((k - 1 - p / 4) * (2 * Math.PI) / p);
            };
        case 'elasticOut':
            return (k: number) => {
                const p = param / 10;
                const a = 1;
                return k === 0 ? 0 : k === 1 ? 1 : a * Math.pow(2, -10 * k) * Math.sin((k - p / 4) * (2 * Math.PI) / p) + 1;
            };
        case 'elasticInOut':
            return (k: number) => {
                const p = param / 10;
                const a = 1;
                if (k === 0) return 0;
                if (k === 1) return 1;
                if (k < 0.5) return -0.5 * a * Math.pow(2, 20 * k - 10) * Math.sin((20 * k - 11.125) * (2 * Math.PI) / p);
                return 0.5 * a * Math.pow(2, -20 * k + 10) * Math.sin((20 * k - 11.125) * (2 * Math.PI) / p) + 1;
            };
        case 'elasticOutIn':
            return (k: number) => k < 0.5 ? cEasing('elasticOut')(2 * k) / 2 : cEasing('elasticIn')(2 * k - 1) / 2 + 0.5;
        case 'backIn':
            return (k: number) => k * k * ((param + 1) * k - param);
        case 'backOut':
            return (k: number) => {
                const s = param;
                return 1 + (k - 1) * (k - 1) * ((s + 1) * (k - 1) + s);
            };
        case 'backInOut':
            return (k: number) => {
                const s = param;
                if (k < 0.5) return 2 * k * k * ((s + 1) * 2 * k - s);
                return 1 + 2 * (k - 1) * (k - 1) * ((s + 1) * (k - 1) + s);
            };
        case 'backOutIn':
            return (k: number) => k < 0.5 ? cEasing('backOut')(2 * k) / 2 : cEasing('backIn')(2 * k - 1) / 2 + 0.5;
        case 'bounceIn':
            return (k: number) => {
                const bounceFactor = Math.max(0.00001, param);
                return 1 - cEasing('bounceOut', bounceFactor)(1 - k);
            };
        case 'bounceOut':
            return (k: number) => {
                if (k <= 0) return 0;
                if (k >= 1) return 1;

                const bounceFactor = Math.max(1, Math.round(param));
                let adjustedK = k * bounceFactor;
                if (adjustedK >= 1) return 1;

                if (adjustedK < 1 / 2.75) return 7.5625 * adjustedK * adjustedK;
                if (adjustedK < 2 / 2.75) return 7.5625 * (adjustedK -= 1.5 / 2.75) * adjustedK + 0.75;
                if (adjustedK < 2.5 / 2.75) return 7.5625 * (adjustedK -= 2.25 / 2.75) * adjustedK + 0.9375;
                return 7.5625 * (adjustedK -= 2.625 / 2.75) * adjustedK + 0.984375;
            };
        case 'bounceInOut':
            return (k: number) => k < 0.5 ? cEasing('bounceIn')(2 * k) / 2 : cEasing('bounceOut')(2 * k - 1) / 2 + 0.5;
        case 'bounceOutIn':
            return (k: number) => k < 0.5 ? cEasing('bounceOut')(2 * k) / 2 : cEasing('bounceIn')(2 * k - 1) / 2 + 0.5;
        default:
            return (k: number) => k;
    }
}


export class Zoom {
    
    
    binding() {
        if(!pc) return;
        pc.bindingStart = this.onTouchStart.bind(this);
        pc.bindingMove = this.onTouchMove.bind(this);
        pc.bindingEnd = this.onTouchEnd.bind(this);
    }
    startPos: Vec3 = null
    s1: Vec2 = null!;
    s2: Vec2 = null!;
    location: Vec2 = null!;
    @property(Node)
    thingNode: Node = null
    maxScale: number = 3;
    maxMoveX: number = 1000;
    maxMoveY: number = 1000;
    onTouchStart(event: EventTouch) {
        if(!event) return;
        this.location = event.getUILocation(); 
        if(this.s1 == null) {
            this.s1 = this.location.clone();
        } else if(this.s2 == null) {
            this.s2 = this.location.clone();
        }
        if(this.s1 && this.s2) {
            return;
        }

        this.startPos = v3(this.location.x, this.location.y, 0);
    }

    zoomBy(delta: number) {
        let scale = this.thingNode.scale.x;
        scale += delta;
        scale = misc.clampf(scale, 0.5, this.maxScale);
        this.thingNode.scale = v3(scale, scale, scale);
        ui.keepTap();
    }

    onTouchMove(event: EventTouch) {

        
        if(!event) return;
        
        
        let touches = event.getTouches();

        if(this.s1 && this.s2 && touches.length >= 2) {
            let e1 = touches[0].getUILocation();
            let e2 = touches[1].getUILocation();
            let sDis = this.s2.clone().subtract(this.s1).length();
            let eDis = e2.clone().subtract(e1).length();
            let scale = eDis - sDis;
            this.s1 = e1.clone();
            this.s2 = e2.clone();
            console.log(scale);
            this.zoomBy(scale/2000);
            return;
        }


        if(!this.startPos) return;
        
        let delta = event.getUIDelta();
        this.thingNode.worldPosition = this.thingNode.getWorldPosition().add3f(delta.x, delta.y, 0);
        let tp = this.thingNode.position.clone();
        let maxX = this.thingNode.scale.x * this.maxMoveX;
        let maxY = this.thingNode.scale.y * (this.maxMoveY);
        tp.x = misc.clampf(tp.x, -maxX, maxX);
        tp.y = misc.clampf(tp.y, -maxY, maxY);
        ui.keepTap();
        this.thingNode.position = tp;
    }

    onTouchEnd(event: EventTouch) {
        if(!event) return;
        this.startPos = null;
        let out = event.getUILocation();
        if(this.s1 && this.s2) {
            if(this.s1.equals(out)) {
                this.s1 = this.s2.clone();
            }
            this.startPos = v3(this.s1.x, this.s1.y, 0);
            this.s2 = null;
        } else if (this.s1) {
            this.s1 = null;
        }
    }
}