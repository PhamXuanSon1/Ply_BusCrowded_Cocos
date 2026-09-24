"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BoxSimulation = void 0;
exports.applyIndexNoise = applyIndexNoise;
exports.shuffleArray = shuffleArray;
exports.truncate = truncate;
// @cocos/box2d's index.d.ts re-exports types straight from its raw .ts sources (not
// precompiled .d.ts), which pulls its particle/liquid module - unused here, and not
// strict-mode clean - into our compilation. A plain `require()` keeps its own type errors
// from blocking our build; we only rely on the documented World/Body/Shape/Vec2 API below.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const b2 = require('@cocos/box2d');
function hexToRgb(hex) {
    const v = hex.replace('#', '');
    const bigint = parseInt(v, 16);
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}
function rgbToHex(r, g, b) {
    const c = (n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
    return `#${c(r)}${c(g)}${c(b)}`;
}
/** Mirrors BoxCreator.applyIndexNoise: deterministic-ish per-index noise on top of a random strength. */
function applyIndexNoise(hex, pixelIndex) {
    const { r, g, b } = hexToRgb(hex);
    const noise = (((pixelIndex * 73) + 17) % 21) - 10;
    var strength = Math.random() * 0.1;
    strength = 0;
    const scale = 1 + noise * strength;
    return rgbToHex(r * scale, g * scale, b * scale);
}
/** Mirrors Ulis.shuffleArray (Fisher-Yates, in place). */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
/** Mirrors BoxCreator.truncate. */
function truncate(n, m) {
    const factor = 10 ** m;
    return Math.trunc(n * factor) / factor;
}
const RAD2DEG = 180 / Math.PI;
// Box2D's internal constants (linearSlop, maxLinearCorrection, ...) assume "1 unit ≈ 1 meter".
// Feeding it raw pixel values (a 60px box = a 60 "meter" box to Box2D) makes its per-iteration
// overlap-correction budget tiny relative to our scale, so dense/fast piles never fully resolve
// their overlap. Converting to/at meters at the Box2D boundary - same PTM_RATIO idea Cocos's own
// PhysicsSystem2D uses - keeps the solver working at the scale it was tuned for. Everything
// outside these px<->m calls (SimBox.x/y/w/h, minX/width/height, exportData, rendering) stays
// in plain pixels, unaffected.
const PTM = 32; // pixels per meter
const toM = (px) => px / PTM;
const toPx = (m) => m * PTM;
// @cocos/box2d's index.d.ts doesn't re-export the b2BodyType enum, but numeric enums in
// TS accept plain numbers - these match b2BodyType.b2_staticBody / b2_dynamicBody exactly.
const BODY_TYPE_STATIC = 0;
const BODY_TYPE_DYNAMIC = 2;
let uid = 0;
// fraction across the world rect (0 = left/top edge, 1 = right/bottom edge) for each anchor.
const EXPORT_ORIGIN_FRACTIONS = {
    'top-left': { fx: 0, fy: 0 },
    'top-center': { fx: 0.5, fy: 0 },
    'top-right': { fx: 1, fy: 0 },
    'middle-left': { fx: 0, fy: 0.5 },
    'center': { fx: 0.5, fy: 0.5 },
    'middle-right': { fx: 1, fy: 0.5 },
    'bottom-left': { fx: 0, fy: 1 },
    'bottom-center': { fx: 0.5, fy: 1 },
    'bottom-right': { fx: 1, fy: 1 },
};
/**
 * Box "arrange" preview backed by @cocos/box2d - the same TypeScript port of Box2D that Cocos
 * Creator's PhysicsSystem2D/RigidBody2D use under the hood, running standalone (no `cc`/Scene
 * needed) so it works inside a plain editor panel. Boxes are dynamic b2Bodies with a box
 * fixture that fall under gravity and collide with proper rectangle-vs-rectangle (SAT, not an
 * approximation), then settle into a pile like the in-game setup.
 */
class BoxSimulation {
    constructor() {
        this.boxes = [];
        this.typeBoxes = [];
        // World rect in world-space. minX/minY let each edge be resized independently (e.g. dragging
        // the left edge grows minX while shrinking width, so the right edge stays put) instead of the
        // rect always being pinned to the origin.
        this.minX = 0;
        this.minY = 0;
        this.width = 800;
        this.height = 600;
        this.baseSize = 60; // px for a size scale of 1.0
        this.sizeMul = 1.2; // BoxCreator's sizeMul
        this.impulse = 15; // BoxCreator's onTouchStart "max" (both linear and angular use 15)
        this.impulseLinearScale = 40; // px/s per impulse unit, tuned for the canvas
        this.impulseAngularScale = 1.8; // rad/s per impulse unit, tuned for the canvas
        this.density = 1;
        this.friction = 0.4;
        this.restitution = 0.15;
        this.linearDamping = 0.05;
        this.angularDamping = 0.05;
        this.walls = []; // b2.Body[]
        this.world = new b2.World(new b2.Vec2(0, toM(1.2 * BoxSimulation.GRAVITY_SCALE)));
        this.world.m_allowSleep = false; // boxes should never go to sleep, see scatter()
    }
    get gravity() { return toPx(this.world.GetGravity().y) / BoxSimulation.GRAVITY_SCALE; }
    set gravity(v) { this.world.SetGravity(new b2.Vec2(0, toM(v * BoxSimulation.GRAVITY_SCALE))); }
    /** Resize the world keeping its top-left corner pinned at (0, 0). */
    setBounds(w, h) {
        this.setWorldRect(this.minX, this.minY, w, h);
    }
    /** Move and/or resize the world rect - lets each edge be dragged independently. */
    setWorldRect(minX, minY, w, h) {
        if (minX === this.minX && minY === this.minY && w === this.width && h === this.height && this.walls.length)
            return;
        this.minX = minX;
        this.minY = minY;
        this.width = w;
        this.height = h;
        this.walls.forEach((wall) => this.world.DestroyBody(wall));
        this.walls = [];
        const t = 60; // wall thickness, kept off-screen so box corners never visually clip it
        const cx = minX + w / 2;
        const cy = minY + h / 2;
        const makeWall = (x, y, hw, hh) => {
            const body = this.world.CreateBody({ type: BODY_TYPE_STATIC, position: new b2.Vec2(toM(x), toM(y)) });
            const shape = new b2.PolygonShape();
            shape.SetAsBox(toM(hw), toM(hh));
            body.CreateFixture({ shape, friction: this.friction });
            return body;
        };
        this.walls = [
            makeWall(cx, minY + h + t / 2, w / 2 + t, t / 2), // floor
            makeWall(cx, minY - t / 2, w / 2 + t, t / 2), // ceiling
            makeWall(minX - t / 2, cy, t / 2, h / 2 + t), // left
            makeWall(minX + w + t / 2, cy, t / 2, h / 2 + t), // right
        ];
        // The walls just teleported - if a box was sitting where a wall now is (e.g. the user
        // dragged an edge in past it), Box2D's solver would see deep interpenetration and
        // resolve it with a huge separating velocity, launching the box away. Avoid that by
        // directly clamping any now-overlapping box back inside the new bounds instead of
        // letting the solver "explode" it out.
        const margin = 1;
        this.boxes.forEach((b) => {
            const hw = b.w / 2;
            const hh = b.h / 2;
            const pos = b.body.GetPosition(); // meters
            let x = toPx(pos.x);
            let y = toPx(pos.y);
            let clamped = false;
            if (x - hw < minX) {
                x = minX + hw + margin;
                clamped = true;
            }
            if (x + hw > minX + w) {
                x = minX + w - hw - margin;
                clamped = true;
            }
            if (y - hh < minY) {
                y = minY + hh + margin;
                clamped = true;
            }
            if (y + hh > minY + h) {
                y = minY + h - hh - margin;
                clamped = true;
            }
            if (clamped) {
                b.body.SetPositionXY(toM(x), toM(y));
                b.body.SetLinearVelocity(new b2.Vec2(0, 0));
                b.body.SetAngularVelocity(0);
            }
        });
    }
    /** Destroy every box body and empty the simulation, without spawning new ones. */
    clear() {
        this.boxes.forEach((b) => this.world.DestroyBody(b.body));
        this.boxes = [];
        this.typeBoxes = [];
    }
    /** Mirrors BoxCreator.init(). */
    spawn(data, typeColors, humanColors) {
        this.clear();
        const spawnX = this.minX + this.width / 2;
        const spawnY = this.minY + this.height * 0.5;
        data.sizes.forEach((size, i) => {
            var _a;
            const amount = (_a = data.sumBus[i]) !== null && _a !== void 0 ? _a : 0;
            if (!this.typeBoxes[i])
                this.typeBoxes[i] = [];
            for (let j = 0; j < amount; j++) {
                const w = Math.max(4, size[2] * this.sizeMul * this.baseSize);
                const h = Math.max(4, size[3] * this.sizeMul * this.baseSize);
                const body = this.world.CreateBody({
                    type: BODY_TYPE_DYNAMIC,
                    position: new b2.Vec2(toM(spawnX + (Math.random() - 0.5) * 20), toM(spawnY + (Math.random() - 0.5) * 20)),
                    angle: Math.random() * Math.PI * 2,
                    linearDamping: this.linearDamping,
                    angularDamping: this.angularDamping,
                    // Continuous collision detection: without this, a box moving fast enough
                    // (strong Scatter impulse or strong gravity building up speed in a stack)
                    // can travel farther than its own size in a single physics step and tunnel
                    // through another box before a collision is even detected.
                    bullet: true,
                });
                const shape = new b2.PolygonShape();
                shape.SetAsBox(toM(w / 2), toM(h / 2));
                body.CreateFixture({ shape, density: this.density, friction: this.friction, restitution: this.restitution });
                const box = {
                    id: uid++,
                    type: i,
                    humanColor: -1,
                    x: toPx(body.GetPosition().x),
                    y: toPx(body.GetPosition().y),
                    angle: body.GetAngle() * RAD2DEG,
                    w, h,
                    fill: applyIndexNoise(typeColors[i % typeColors.length], i + j), // placeholder until colored below
                    body,
                };
                this.typeBoxes[i].push(box);
                this.boxes.push(box);
            }
        });
        // Coloring boxes via sumHuman (bus color groups), same order of operations as BoxCreator.
        this.typeBoxes.forEach((list) => shuffleArray(list));
        data.sumHuman.forEach((row) => {
            const iAmount = [...row];
            const iColor = iAmount.shift();
            iAmount.forEach((item, i) => {
                const list = this.typeBoxes[i];
                if (!list)
                    return;
                const picked = list.splice(0, item);
                picked.forEach((b) => { b.humanColor = iColor; });
            });
        });
        // Box fill = its assigned bus/human color (matches HumanColors, i.e. what it'll look
        // like once it becomes a passenger), falling back to a type tint for any box sumHuman
        // left unassigned.
        this.boxes.forEach((b) => {
            var _a;
            const baseHex = b.humanColor >= 0
                ? (_a = humanColors[b.humanColor % humanColors.length]) !== null && _a !== void 0 ? _a : typeColors[b.type % typeColors.length]
                : typeColors[b.type % typeColors.length];
            b.fill = applyIndexNoise(baseHex, b.id);
        });
        this.scatter();
    }
    /** Mirrors BoxCreator.onTouchStart: give every box a random burst of linear + angular velocity. */
    scatter() {
        const maxLinear = this.impulse * this.impulseLinearScale;
        const maxAngular = this.impulse * this.impulseAngularScale;
        this.boxes.forEach((b) => {
            const angle = Math.random() * Math.PI * 2;
            const speed = maxLinear * (0.5 + Math.random() * 0.5);
            b.body.SetAwake(true);
            let randomSignX = Math.random() < 0.5 ? -1 : 1;
            let randomSignY = Math.random() < 0.5 ? -1 : 1;
            b.body.SetLinearVelocity(new b2.Vec2(toM(Math.cos(angle) * speed * randomSignX), toM(Math.sin(angle) * speed * randomSignY)));
            b.body.SetAngularVelocity((Math.random() * 2 - 1) * maxAngular);
        });
    }
    /** Mirrors the SPACE handler in BoxCreator.onKeyDown, coordinates relative to `origin`. */
    exportData(origin = 'bottom-left') {
        const { fx, fy } = EXPORT_ORIGIN_FRACTIONS[origin];
        const originX = this.minX + fx * this.width;
        const originY = this.minY + fy * this.height;
        return this.boxes.map((b) => [
            b.type,
            b.humanColor,
            truncate(b.x - originX, 3),
            truncate(-(b.y - originY), 3),
            truncate(-b.angle, 3),
        ]);
    }
    stats() {
        const byType = {};
        const byColor = {};
        this.boxes.forEach((b) => {
            byType[b.type] = (byType[b.type] || 0) + 1;
            byColor[b.humanColor] = (byColor[b.humanColor] || 0) + 1;
        });
        return { total: this.boxes.length, byType, byColor };
    }
    step(dt) {
        if (dt <= 0)
            return;
        // Smaller sub-steps instead of one big Step() per frame: caps how far a fast box can
        // move before the next collision check, so strong gravity/impulse can't tunnel it
        // through another box - and gives the position solver more, smaller passes to fully
        // resolve any overlap instead of hitting its per-step correction limit.
        const substeps = 4;
        const sub = dt / substeps;
        for (let i = 0; i < substeps; i++) {
            this.world.Step(sub, 8, 3);
        }
        for (const b of this.boxes) {
            const pos = b.body.GetPosition();
            b.x = toPx(pos.x);
            b.y = toPx(pos.y);
            b.angle = b.body.GetAngle() * RAD2DEG;
        }
    }
}
exports.BoxSimulation = BoxSimulation;
// 1 gravity slider unit -> this many px/s^2 (Box2D gravity is a real acceleration, unlike
// Matter's gravity.y/gravity.scale pair - this keeps the -3..3 slider range feeling similar).
BoxSimulation.GRAVITY_SCALE = 700;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYm94LXNpbS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NvdXJjZS9wYW5lbHMvZGVmYXVsdC9ib3gtc2ltLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQXFDQSwwQ0FPQztBQUdELG9DQU1DO0FBR0QsNEJBR0M7QUF6REQsb0ZBQW9GO0FBQ3BGLG9GQUFvRjtBQUNwRiwwRkFBMEY7QUFDMUYsMkZBQTJGO0FBQzNGLDhEQUE4RDtBQUM5RCxNQUFNLEVBQUUsR0FBUSxPQUFPLENBQUMsY0FBYyxDQUFDLENBQUM7QUFrQnhDLFNBQVMsUUFBUSxDQUFDLEdBQVc7SUFDekIsTUFBTSxDQUFDLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDL0IsTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUMvQixPQUFPLEVBQUUsQ0FBQyxFQUFFLENBQUMsTUFBTSxJQUFJLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxNQUFNLElBQUksQ0FBQyxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUMsRUFBRSxNQUFNLEdBQUcsR0FBRyxFQUFFLENBQUM7QUFDaEYsQ0FBQztBQUVELFNBQVMsUUFBUSxDQUFDLENBQVMsRUFBRSxDQUFTLEVBQUUsQ0FBUztJQUM3QyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQVMsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDakcsT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxD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QUFFLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsQ0FBQztJQUN6RCxDQUFDO0lBRUQsSUFBSSxDQUFDLEVBQVU7UUFDWCxJQUFJLEVBQUUsSUFBSSxDQUFDO1lBQUUsT0FBTztRQUVwQixxRkFBcUY7UUFDckYsa0ZBQWtGO1FBQ2xGLG9GQUFvRjtRQUNwRix3RUFBd0U7UUFDeEUsTUFBTSxRQUFRLEdBQUcsQ0FBQyxDQUFDO1FBQ25CLE1BQU0sR0FBRyxHQUFHLEVBQUUsR0FBRyxRQUFRLENBQUM7UUFDMUIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFFBQVEsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2hDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDL0IsQ0FBQztRQUVELEtBQUssTUFBTSxDQUFDLElBQUksSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ3pCLE1BQU0sR0FBRyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDakMsQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2xCLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNsQixDQUFDLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLEdBQUcsT0FBTyxDQUFDO1FBQzFDLENBQUM7SUFDTCxDQUFDOztBQXZQTCxzQ0F3UEM7QUEvTkcsMEZBQTBGO0FBQzFGLDhGQUE4RjtBQUN0RSwyQkFBYSxHQUFHLEdBQUcsQUFBTixDQUFPIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgTGV2ZWxEYXRhTGlrZSB9IGZyb20gJy4vYm94LWRhdGEnO1xyXG5cclxuLy8gQGNvY29zL2JveDJkJ3MgaW5kZXguZC50cyByZS1leHBvcnRzIHR5cGVzIHN0cmFpZ2h0IGZyb20gaXRzIHJhdyAudHMgc291cmNlcyAobm90XHJcbi8vIHByZWNvbXBpbGVkIC5kLnRzKSwgd2hpY2ggcHVsbHMgaXRzIHBhcnRpY2xlL2xpcXVpZCBtb2R1bGUgLSB1bnVzZWQgaGVyZSwgYW5kIG5vdFxyXG4vLyBzdHJpY3QtbW9kZSBjbGVhbiAtIGludG8gb3VyIGNvbXBpbGF0aW9uLiBBIHBsYWluIGByZXF1aXJlKClgIGtlZXBzIGl0cyBvd24gdHlwZSBlcnJvcnNcclxuLy8gZnJvbSBibG9ja2luZyBvdXIgYnVpbGQ7IHdlIG9ubHkgcmVseSBvbiB0aGUgZG9jdW1lbnRlZCBXb3JsZC9Cb2R5L1NoYXBlL1ZlYzIgQVBJIGJlbG93LlxyXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXZhci1yZXF1aXJlc1xyXG5jb25zdCBiMjogYW55ID0gcmVxdWlyZSgnQGNvY29zL2JveDJkJyk7XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFNpbUJveCB7XHJcbiAgICBpZDogbnVtYmVyO1xyXG4gICAgdHlwZTogbnVtYmVyO1xyXG4gICAgLyoqIENvbG9yVHlwZSBpZCBhc3NpZ25lZCB2aWEgc3VtSHVtYW4sIG9yIC0xIHdoZW4gbm90IHBhcnQgb2YgYW55IGh1bWFuIGdyb3VwLiAqL1xyXG4gICAgaHVtYW5Db2xvcjogbnVtYmVyO1xyXG4gICAgeDogbnVtYmVyO1xyXG4gICAgeTogbnVtYmVyO1xyXG4gICAgLyoqIGRlZ3JlZXMsIHN5bmNlZCBmcm9tIHRoZSBCb3gyRCBib2R5IGVhY2ggc3RlcCBmb3IgcmVuZGVyaW5nLiAqL1xyXG4gICAgYW5nbGU6IG51bWJlcjtcclxuICAgIHc6IG51bWJlcjtcclxuICAgIGg6IG51bWJlcjtcclxuICAgIGZpbGw6IHN0cmluZztcclxuICAgIC8qKiBAaW50ZXJuYWwgcGh5c2ljcyBib2R5IGJhY2tpbmcgdGhpcyBib3ggKGIyLkJvZHksIGtlcHQgdW50eXBlZCAtIHNlZSB0aGUgcmVxdWlyZSgpIGFib3ZlKS4gKi9cclxuICAgIGJvZHk6IGFueTtcclxufVxyXG5cclxuZnVuY3Rpb24gaGV4VG9SZ2IoaGV4OiBzdHJpbmcpIHtcclxuICAgIGNvbnN0IHYgPSBoZXgucmVwbGFjZSgnIycsICcnKTtcclxuICAgIGNvbnN0IGJpZ2ludCA9IHBhcnNlSW50KHYsIDE2KTtcclxuICAgIHJldHVybiB7IHI6IChiaWdpbnQgPj4gMTYpICYgMjU1LCBnOiAoYmlnaW50ID4+IDgpICYgMjU1LCBiOiBiaWdpbnQgJiAyNTUgfTtcclxufVxyXG5cclxuZnVuY3Rpb24gcmdiVG9IZXgocjogbnVtYmVyLCBnOiBudW1iZXIsIGI6IG51bWJlcikge1xyXG4gICAgY29uc3QgYyA9IChuOiBudW1iZXIpID0+IE1hdGgucm91bmQoTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBuKSkpLnRvU3RyaW5nKDE2KS5wYWRTdGFydCgyLCAnMCcpO1xyXG4gICAgcmV0dXJuIGAjJHtjKHIpfSR7YyhnKX0ke2MoYil9YDtcclxufVxyXG5cclxuLyoqIE1pcnJvcnMgQm94Q3JlYXRvci5hcHBseUluZGV4Tm9pc2U6IGRldGVybWluaXN0aWMtaXNoIHBlci1pbmRleCBub2lzZSBvbiB0b3Agb2YgYSByYW5kb20gc3RyZW5ndGguICovXHJcbmV4cG9ydCBmdW5jdGlvbiBhcHBseUluZGV4Tm9pc2UoaGV4OiBzdHJpbmcsIHBpeGVsSW5kZXg6IG51bWJlcik6IHN0cmluZyB7XHJcbiAgICBjb25zdCB7IHIsIGcsIGIgfSA9IGhleFRvUmdiKGhleCk7XHJcbiAgICBjb25zdCBub2lzZSA9ICgoKHBpeGVsSW5kZXggKiA3MykgKyAxNykgJSAyMSkgLSAxMDtcclxuICAgIHZhciBzdHJlbmd0aCA9IE1hdGgucmFuZG9tKCkgKiAwLjE7XHJcbiAgICBzdHJlbmd0aCA9IDA7XHJcbiAgICBjb25zdCBzY2FsZSA9IDEgKyBub2lzZSAqIHN0cmVuZ3RoO1xyXG4gICAgcmV0dXJuIHJnYlRvSGV4KHIgKiBzY2FsZSwgZyAqIHNjYWxlLCBiICogc2NhbGUpO1xyXG59XHJcblxyXG4vKiogTWlycm9ycyBVbGlzLnNodWZmbGVBcnJheSAoRmlzaGVyLVlhdGVzLCBpbiBwbGFjZSkuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBzaHVmZmxlQXJyYXk8VD4oYXJyYXk6IFRbXSk6IFRbXSB7XHJcbiAgICBmb3IgKGxldCBpID0gYXJyYXkubGVuZ3RoIC0gMTsgaSA+IDA7IGktLSkge1xyXG4gICAgICAgIGNvbnN0IGogPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAoaSArIDEpKTtcclxuICAgICAgICBbYXJyYXlbaV0sIGFycmF5W2pdXSA9IFthcnJheVtqXSwgYXJyYXlbaV1dO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGFycmF5O1xyXG59XHJcblxyXG4vKiogTWlycm9ycyBCb3hDcmVhdG9yLnRydW5jYXRlLiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gdHJ1bmNhdGUobjogbnVtYmVyLCBtOiBudW1iZXIpOiBudW1iZXIge1xyXG4gICAgY29uc3QgZmFjdG9yID0gMTAgKiogbTtcclxuICAgIHJldHVybiBNYXRoLnRydW5jKG4gKiBmYWN0b3IpIC8gZmFjdG9yO1xyXG59XHJcblxyXG5jb25zdCBSQUQyREVHID0gMTgwIC8gTWF0aC5QSTtcclxuXHJcbi8vIEJveDJEJ3MgaW50ZXJuYWwgY29uc3RhbnRzIChsaW5lYXJTbG9wLCBtYXhMaW5lYXJDb3JyZWN0aW9uLCAuLi4pIGFzc3VtZSBcIjEgdW5pdCDiiYggMSBtZXRlclwiLlxyXG4vLyBGZWVkaW5nIGl0IHJhdyBwaXhlbCB2YWx1ZXMgKGEgNjBweCBib3ggPSBhIDYwIFwibWV0ZXJcIiBib3ggdG8gQm94MkQpIG1ha2VzIGl0cyBwZXItaXRlcmF0aW9uXHJcbi8vIG92ZXJsYXAtY29ycmVjdGlvbiBidWRnZXQgdGlueSByZWxhdGl2ZSB0byBvdXIgc2NhbGUsIHNvIGRlbnNlL2Zhc3QgcGlsZXMgbmV2ZXIgZnVsbHkgcmVzb2x2ZVxyXG4vLyB0aGVpciBvdmVybGFwLiBDb252ZXJ0aW5nIHRvL2F0IG1ldGVycyBhdCB0aGUgQm94MkQgYm91bmRhcnkgLSBzYW1lIFBUTV9SQVRJTyBpZGVhIENvY29zJ3Mgb3duXHJcbi8vIFBoeXNpY3NTeXN0ZW0yRCB1c2VzIC0ga2VlcHMgdGhlIHNvbHZlciB3b3JraW5nIGF0IHRoZSBzY2FsZSBpdCB3YXMgdHVuZWQgZm9yLiBFdmVyeXRoaW5nXHJcbi8vIG91dHNpZGUgdGhlc2UgcHg8LT5tIGNhbGxzIChTaW1Cb3gueC95L3cvaCwgbWluWC93aWR0aC9oZWlnaHQsIGV4cG9ydERhdGEsIHJlbmRlcmluZykgc3RheXNcclxuLy8gaW4gcGxhaW4gcGl4ZWxzLCB1bmFmZmVjdGVkLlxyXG5jb25zdCBQVE0gPSAzMjsgLy8gcGl4ZWxzIHBlciBtZXRlclxyXG5jb25zdCB0b00gPSAocHg6IG51bWJlcikgPT4gcHggLyBQVE07XHJcbmNvbnN0IHRvUHggPSAobTogbnVtYmVyKSA9PiBtICogUFRNO1xyXG5cclxuLy8gQGNvY29zL2JveDJkJ3MgaW5kZXguZC50cyBkb2Vzbid0IHJlLWV4cG9ydCB0aGUgYjJCb2R5VHlwZSBlbnVtLCBidXQgbnVtZXJpYyBlbnVtcyBpblxyXG4vLyBUUyBhY2NlcHQgcGxhaW4gbnVtYmVycyAtIHRoZXNlIG1hdGNoIGIyQm9keVR5cGUuYjJfc3RhdGljQm9keSAvIGIyX2R5bmFtaWNCb2R5IGV4YWN0bHkuXHJcbmNvbnN0IEJPRFlfVFlQRV9TVEFUSUMgPSAwO1xyXG5jb25zdCBCT0RZX1RZUEVfRFlOQU1JQyA9IDI7XHJcblxyXG5sZXQgdWlkID0gMDtcclxuXHJcbi8qKiAzeDMgYW5jaG9yIGdyaWQgKGxpa2UgYSBDb2Nvcy9Vbml0eSBhbmNob3IgcGlja2VyKSB1c2VkIGFzIHRoZSAoMCwgMCkgb3JpZ2luIGZvciBleHBvcnREYXRhKCkuICovXHJcbmV4cG9ydCB0eXBlIEV4cG9ydE9yaWdpbiA9XHJcbiAgICB8ICd0b3AtbGVmdCcgfCAndG9wLWNlbnRlcicgfCAndG9wLXJpZ2h0J1xyXG4gICAgfCAnbWlkZGxlLWxlZnQnIHwgJ2NlbnRlcicgfCAnbWlkZGxlLXJpZ2h0J1xyXG4gICAgfCAnYm90dG9tLWxlZnQnIHwgJ2JvdHRvbS1jZW50ZXInIHwgJ2JvdHRvbS1yaWdodCc7XHJcblxyXG4vLyBmcmFjdGlvbiBhY3Jvc3MgdGhlIHdvcmxkIHJlY3QgKDAgPSBsZWZ0L3RvcCBlZGdlLCAxID0gcmlnaHQvYm90dG9tIGVkZ2UpIGZvciBlYWNoIGFuY2hvci5cclxuY29uc3QgRVhQT1JUX09SSUdJTl9GUkFDVElPTlM6IFJlY29yZDxFeHBvcnRPcmlnaW4sIHsgZng6IG51bWJlcjsgZnk6IG51bWJlciB9PiA9IHtcclxuICAgICd0b3AtbGVmdCc6IHsgZng6IDAsIGZ5OiAwIH0sXHJcbiAgICAndG9wLWNlbnRlcic6IHsgZng6IDAuNSwgZnk6IDAgfSxcclxuICAgICd0b3AtcmlnaHQnOiB7IGZ4OiAxLCBmeTogMCB9LFxyXG4gICAgJ21pZGRsZS1sZWZ0JzogeyBmeDogMCwgZnk6IDAuNSB9LFxyXG4gICAgJ2NlbnRlcic6IHsgZng6IDAuNSwgZnk6IDAuNSB9LFxyXG4gICAgJ21pZGRsZS1yaWdodCc6IHsgZng6IDEsIGZ5OiAwLjUgfSxcclxuICAgICdib3R0b20tbGVmdCc6IHsgZng6IDAsIGZ5OiAxIH0sXHJcbiAgICAnYm90dG9tLWNlbnRlcic6IHsgZng6IDAuNSwgZnk6IDEgfSxcclxuICAgICdib3R0b20tcmlnaHQnOiB7IGZ4OiAxLCBmeTogMSB9LFxyXG59O1xyXG5cclxuLyoqXHJcbiAqIEJveCBcImFycmFuZ2VcIiBwcmV2aWV3IGJhY2tlZCBieSBAY29jb3MvYm94MmQgLSB0aGUgc2FtZSBUeXBlU2NyaXB0IHBvcnQgb2YgQm94MkQgdGhhdCBDb2Nvc1xyXG4gKiBDcmVhdG9yJ3MgUGh5c2ljc1N5c3RlbTJEL1JpZ2lkQm9keTJEIHVzZSB1bmRlciB0aGUgaG9vZCwgcnVubmluZyBzdGFuZGFsb25lIChubyBgY2NgL1NjZW5lXHJcbiAqIG5lZWRlZCkgc28gaXQgd29ya3MgaW5zaWRlIGEgcGxhaW4gZWRpdG9yIHBhbmVsLiBCb3hlcyBhcmUgZHluYW1pYyBiMkJvZGllcyB3aXRoIGEgYm94XHJcbiAqIGZpeHR1cmUgdGhhdCBmYWxsIHVuZGVyIGdyYXZpdHkgYW5kIGNvbGxpZGUgd2l0aCBwcm9wZXIgcmVjdGFuZ2xlLXZzLXJlY3RhbmdsZSAoU0FULCBub3QgYW5cclxuICogYXBwcm94aW1hdGlvbiksIHRoZW4gc2V0dGxlIGludG8gYSBwaWxlIGxpa2UgdGhlIGluLWdhbWUgc2V0dXAuXHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgQm94U2ltdWxhdGlvbiB7XHJcbiAgICBib3hlczogU2ltQm94W10gPSBbXTtcclxuICAgIHByaXZhdGUgdHlwZUJveGVzOiBTaW1Cb3hbXVtdID0gW107XHJcblxyXG4gICAgLy8gV29ybGQgcmVjdCBpbiB3b3JsZC1zcGFjZS4gbWluWC9taW5ZIGxldCBlYWNoIGVkZ2UgYmUgcmVzaXplZCBpbmRlcGVuZGVudGx5IChlLmcuIGRyYWdnaW5nXHJcbiAgICAvLyB0aGUgbGVmdCBlZGdlIGdyb3dzIG1pblggd2hpbGUgc2hyaW5raW5nIHdpZHRoLCBzbyB0aGUgcmlnaHQgZWRnZSBzdGF5cyBwdXQpIGluc3RlYWQgb2YgdGhlXHJcbiAgICAvLyByZWN0IGFsd2F5cyBiZWluZyBwaW5uZWQgdG8gdGhlIG9yaWdpbi5cclxuICAgIG1pblggPSAwO1xyXG4gICAgbWluWSA9IDA7XHJcbiAgICB3aWR0aCA9IDgwMDtcclxuICAgIGhlaWdodCA9IDYwMDtcclxuXHJcbiAgICBiYXNlU2l6ZSA9IDYwOyAgICAgICAgLy8gcHggZm9yIGEgc2l6ZSBzY2FsZSBvZiAxLjBcclxuICAgIHNpemVNdWwgPSAxLjI7ICAgICAgICAgLy8gQm94Q3JlYXRvcidzIHNpemVNdWxcclxuICAgIGltcHVsc2UgPSAxNTsgICAgICAgICAgLy8gQm94Q3JlYXRvcidzIG9uVG91Y2hTdGFydCBcIm1heFwiIChib3RoIGxpbmVhciBhbmQgYW5ndWxhciB1c2UgMTUpXHJcblxyXG4gICAgcHJpdmF0ZSBpbXB1bHNlTGluZWFyU2NhbGUgPSA0MDsgICAvLyBweC9zIHBlciBpbXB1bHNlIHVuaXQsIHR1bmVkIGZvciB0aGUgY2FudmFzXHJcbiAgICBwcml2YXRlIGltcHVsc2VBbmd1bGFyU2NhbGUgPSAxLjg7IC8vIHJhZC9zIHBlciBpbXB1bHNlIHVuaXQsIHR1bmVkIGZvciB0aGUgY2FudmFzXHJcblxyXG4gICAgZGVuc2l0eSA9IDE7XHJcbiAgICBmcmljdGlvbiA9IDAuNDtcclxuICAgIHJlc3RpdHV0aW9uID0gMC4xNTtcclxuICAgIGxpbmVhckRhbXBpbmcgPSAwLjA1O1xyXG4gICAgYW5ndWxhckRhbXBpbmcgPSAwLjA1O1xyXG5cclxuICAgIC8vIDEgZ3Jhdml0eSBzbGlkZXIgdW5pdCAtPiB0aGlzIG1hbnkgcHgvc14yIChCb3gyRCBncmF2aXR5IGlzIGEgcmVhbCBhY2NlbGVyYXRpb24sIHVubGlrZVxyXG4gICAgLy8gTWF0dGVyJ3MgZ3Jhdml0eS55L2dyYXZpdHkuc2NhbGUgcGFpciAtIHRoaXMga2VlcHMgdGhlIC0zLi4zIHNsaWRlciByYW5nZSBmZWVsaW5nIHNpbWlsYXIpLlxyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgR1JBVklUWV9TQ0FMRSA9IDcwMDtcclxuXHJcbiAgICBwcml2YXRlIHdvcmxkOiBhbnk7IC8vIGIyLldvcmxkLCBrZXB0IHVudHlwZWQgLSBzZWUgdGhlIHJlcXVpcmUoKSBhdCB0aGUgdG9wIG9mIHRoZSBmaWxlXHJcbiAgICBwcml2YXRlIHdhbGxzOiBhbnlbXSA9IFtdOyAvLyBiMi5Cb2R5W11cclxuXHJcbiAgICBjb25zdHJ1Y3RvcigpIHtcclxuICAgICAgICB0aGlzLndvcmxkID0gbmV3IGIyLldvcmxkKG5ldyBiMi5WZWMyKDAsIHRvTSgxLjIgKiBCb3hTaW11bGF0aW9uLkdSQVZJVFlfU0NBTEUpKSk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5tX2FsbG93U2xlZXAgPSBmYWxzZTsgLy8gYm94ZXMgc2hvdWxkIG5ldmVyIGdvIHRvIHNsZWVwLCBzZWUgc2NhdHRlcigpXHJcbiAgICB9XHJcblxyXG4gICAgZ2V0IGdyYXZpdHkoKSB7IHJldHVybiB0b1B4KHRoaXMud29ybGQuR2V0R3Jhdml0eSgpLnkpIC8gQm94U2ltdWxhdGlvbi5HUkFWSVRZX1NDQUxFOyB9XHJcbiAgICBzZXQgZ3Jhdml0eSh2OiBudW1iZXIpIHsgdGhpcy53b3JsZC5TZXRHcmF2aXR5KG5ldyBiMi5WZWMyKDAsIHRvTSh2ICogQm94U2ltdWxhdGlvbi5HUkFWSVRZX1NDQUxFKSkpOyB9XHJcblxyXG4gICAgLyoqIFJlc2l6ZSB0aGUgd29ybGQga2VlcGluZyBpdHMgdG9wLWxlZnQgY29ybmVyIHBpbm5lZCBhdCAoMCwgMCkuICovXHJcbiAgICBzZXRCb3VuZHModzogbnVtYmVyLCBoOiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLnNldFdvcmxkUmVjdCh0aGlzLm1pblgsIHRoaXMubWluWSwgdywgaCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIE1vdmUgYW5kL29yIHJlc2l6ZSB0aGUgd29ybGQgcmVjdCAtIGxldHMgZWFjaCBlZGdlIGJlIGRyYWdnZWQgaW5kZXBlbmRlbnRseS4gKi9cclxuICAgIHNldFdvcmxkUmVjdChtaW5YOiBudW1iZXIsIG1pblk6IG51bWJlciwgdzogbnVtYmVyLCBoOiBudW1iZXIpIHtcclxuICAgICAgICBpZiAobWluWCA9PT0gdGhpcy5taW5YICYmIG1pblkgPT09IHRoaXMubWluWSAmJiB3ID09PSB0aGlzLndpZHRoICYmIGggPT09IHRoaXMuaGVpZ2h0ICYmIHRoaXMud2FsbHMubGVuZ3RoKSByZXR1cm47XHJcbiAgICAgICAgdGhpcy5taW5YID0gbWluWDtcclxuICAgICAgICB0aGlzLm1pblkgPSBtaW5ZO1xyXG4gICAgICAgIHRoaXMud2lkdGggPSB3O1xyXG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaDtcclxuXHJcbiAgICAgICAgdGhpcy53YWxscy5mb3JFYWNoKCh3YWxsKSA9PiB0aGlzLndvcmxkLkRlc3Ryb3lCb2R5KHdhbGwpKTtcclxuICAgICAgICB0aGlzLndhbGxzID0gW107XHJcblxyXG4gICAgICAgIGNvbnN0IHQgPSA2MDsgLy8gd2FsbCB0aGlja25lc3MsIGtlcHQgb2ZmLXNjcmVlbiBzbyBib3ggY29ybmVycyBuZXZlciB2aXN1YWxseSBjbGlwIGl0XHJcbiAgICAgICAgY29uc3QgY3ggPSBtaW5YICsgdyAvIDI7XHJcbiAgICAgICAgY29uc3QgY3kgPSBtaW5ZICsgaCAvIDI7XHJcblxyXG4gICAgICAgIGNvbnN0IG1ha2VXYWxsID0gKHg6IG51bWJlciwgeTogbnVtYmVyLCBodzogbnVtYmVyLCBoaDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGJvZHkgPSB0aGlzLndvcmxkLkNyZWF0ZUJvZHkoeyB0eXBlOiBCT0RZX1RZUEVfU1RBVElDLCBwb3NpdGlvbjogbmV3IGIyLlZlYzIodG9NKHgpLCB0b00oeSkpIH0pO1xyXG4gICAgICAgICAgICBjb25zdCBzaGFwZSA9IG5ldyBiMi5Qb2x5Z29uU2hhcGUoKTtcclxuICAgICAgICAgICAgc2hhcGUuU2V0QXNCb3godG9NKGh3KSwgdG9NKGhoKSk7XHJcbiAgICAgICAgICAgIGJvZHkuQ3JlYXRlRml4dHVyZSh7IHNoYXBlLCBmcmljdGlvbjogdGhpcy5mcmljdGlvbiB9KTtcclxuICAgICAgICAgICAgcmV0dXJuIGJvZHk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgdGhpcy53YWxscyA9IFtcclxuICAgICAgICAgICAgbWFrZVdhbGwoY3gsIG1pblkgKyBoICsgdCAvIDIsIHcgLyAyICsgdCwgdCAvIDIpLCAvLyBmbG9vclxyXG4gICAgICAgICAgICBtYWtlV2FsbChjeCwgbWluWSAtIHQgLyAyLCB3IC8gMiArIHQsIHQgLyAyKSwgICAgIC8vIGNlaWxpbmdcclxuICAgICAgICAgICAgbWFrZVdhbGwobWluWCAtIHQgLyAyLCBjeSwgdCAvIDIsIGggLyAyICsgdCksICAgICAvLyBsZWZ0XHJcbiAgICAgICAgICAgIG1ha2VXYWxsKG1pblggKyB3ICsgdCAvIDIsIGN5LCB0IC8gMiwgaCAvIDIgKyB0KSwgLy8gcmlnaHRcclxuICAgICAgICBdO1xyXG5cclxuICAgICAgICAvLyBUaGUgd2FsbHMganVzdCB0ZWxlcG9ydGVkIC0gaWYgYSBib3ggd2FzIHNpdHRpbmcgd2hlcmUgYSB3YWxsIG5vdyBpcyAoZS5nLiB0aGUgdXNlclxyXG4gICAgICAgIC8vIGRyYWdnZWQgYW4gZWRnZSBpbiBwYXN0IGl0KSwgQm94MkQncyBzb2x2ZXIgd291bGQgc2VlIGRlZXAgaW50ZXJwZW5ldHJhdGlvbiBhbmRcclxuICAgICAgICAvLyByZXNvbHZlIGl0IHdpdGggYSBodWdlIHNlcGFyYXRpbmcgdmVsb2NpdHksIGxhdW5jaGluZyB0aGUgYm94IGF3YXkuIEF2b2lkIHRoYXQgYnlcclxuICAgICAgICAvLyBkaXJlY3RseSBjbGFtcGluZyBhbnkgbm93LW92ZXJsYXBwaW5nIGJveCBiYWNrIGluc2lkZSB0aGUgbmV3IGJvdW5kcyBpbnN0ZWFkIG9mXHJcbiAgICAgICAgLy8gbGV0dGluZyB0aGUgc29sdmVyIFwiZXhwbG9kZVwiIGl0IG91dC5cclxuICAgICAgICBjb25zdCBtYXJnaW4gPSAxO1xyXG4gICAgICAgIHRoaXMuYm94ZXMuZm9yRWFjaCgoYikgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBodyA9IGIudyAvIDI7XHJcbiAgICAgICAgICAgIGNvbnN0IGhoID0gYi5oIC8gMjtcclxuICAgICAgICAgICAgY29uc3QgcG9zID0gYi5ib2R5LkdldFBvc2l0aW9uKCk7IC8vIG1ldGVyc1xyXG4gICAgICAgICAgICBsZXQgeCA9IHRvUHgocG9zLngpO1xyXG4gICAgICAgICAgICBsZXQgeSA9IHRvUHgocG9zLnkpO1xyXG4gICAgICAgICAgICBsZXQgY2xhbXBlZCA9IGZhbHNlO1xyXG5cclxuICAgICAgICAgICAgaWYgKHggLSBodyA8IG1pblgpIHsgeCA9IG1pblggKyBodyArIG1hcmdpbjsgY2xhbXBlZCA9IHRydWU7IH1cclxuICAgICAgICAgICAgaWYgKHggKyBodyA+IG1pblggKyB3KSB7IHggPSBtaW5YICsgdyAtIGh3IC0gbWFyZ2luOyBjbGFtcGVkID0gdHJ1ZTsgfVxyXG4gICAgICAgICAgICBpZiAoeSAtIGhoIDwgbWluWSkgeyB5ID0gbWluWSArIGhoICsgbWFyZ2luOyBjbGFtcGVkID0gdHJ1ZTsgfVxyXG4gICAgICAgICAgICBpZiAoeSArIGhoID4gbWluWSArIGgpIHsgeSA9IG1pblkgKyBoIC0gaGggLSBtYXJnaW47IGNsYW1wZWQgPSB0cnVlOyB9XHJcblxyXG4gICAgICAgICAgICBpZiAoY2xhbXBlZCkge1xyXG4gICAgICAgICAgICAgICAgYi5ib2R5LlNldFBvc2l0aW9uWFkodG9NKHgpLCB0b00oeSkpO1xyXG4gICAgICAgICAgICAgICAgYi5ib2R5LlNldExpbmVhclZlbG9jaXR5KG5ldyBiMi5WZWMyKDAsIDApKTtcclxuICAgICAgICAgICAgICAgIGIuYm9keS5TZXRBbmd1bGFyVmVsb2NpdHkoMCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRGVzdHJveSBldmVyeSBib3ggYm9keSBhbmQgZW1wdHkgdGhlIHNpbXVsYXRpb24sIHdpdGhvdXQgc3Bhd25pbmcgbmV3IG9uZXMuICovXHJcbiAgICBjbGVhcigpIHtcclxuICAgICAgICB0aGlzLmJveGVzLmZvckVhY2goKGIpID0+IHRoaXMud29ybGQuRGVzdHJveUJvZHkoYi5ib2R5KSk7XHJcbiAgICAgICAgdGhpcy5ib3hlcyA9IFtdO1xyXG4gICAgICAgIHRoaXMudHlwZUJveGVzID0gW107XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIE1pcnJvcnMgQm94Q3JlYXRvci5pbml0KCkuICovXHJcbiAgICBzcGF3bihkYXRhOiBMZXZlbERhdGFMaWtlLCB0eXBlQ29sb3JzOiBzdHJpbmdbXSwgaHVtYW5Db2xvcnM6IHN0cmluZ1tdKSB7XHJcbiAgICAgICAgdGhpcy5jbGVhcigpO1xyXG5cclxuICAgICAgICBjb25zdCBzcGF3blggPSB0aGlzLm1pblggKyB0aGlzLndpZHRoIC8gMjtcclxuICAgICAgICBjb25zdCBzcGF3blkgPSB0aGlzLm1pblkgKyB0aGlzLmhlaWdodCAqIDAuNTtcclxuXHJcbiAgICAgICAgZGF0YS5zaXplcy5mb3JFYWNoKChzaXplLCBpKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGFtb3VudCA9IGRhdGEuc3VtQnVzW2ldID8/IDA7XHJcbiAgICAgICAgICAgIGlmICghdGhpcy50eXBlQm94ZXNbaV0pIHRoaXMudHlwZUJveGVzW2ldID0gW107XHJcblxyXG4gICAgICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IGFtb3VudDsgaisrKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB3ID0gTWF0aC5tYXgoNCwgc2l6ZVsyXSAqIHRoaXMuc2l6ZU11bCAqIHRoaXMuYmFzZVNpemUpO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgaCA9IE1hdGgubWF4KDQsIHNpemVbM10gKiB0aGlzLnNpemVNdWwgKiB0aGlzLmJhc2VTaXplKTtcclxuXHJcbiAgICAgICAgICAgICAgICBjb25zdCBib2R5ID0gdGhpcy53b3JsZC5DcmVhdGVCb2R5KHtcclxuICAgICAgICAgICAgICAgICAgICB0eXBlOiBCT0RZX1RZUEVfRFlOQU1JQyxcclxuICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbjogbmV3IGIyLlZlYzIoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRvTShzcGF3blggKyAoTWF0aC5yYW5kb20oKSAtIDAuNSkgKiAyMCksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRvTShzcGF3blkgKyAoTWF0aC5yYW5kb20oKSAtIDAuNSkgKiAyMCksXHJcbiAgICAgICAgICAgICAgICAgICAgKSxcclxuICAgICAgICAgICAgICAgICAgICBhbmdsZTogTWF0aC5yYW5kb20oKSAqIE1hdGguUEkgKiAyLFxyXG4gICAgICAgICAgICAgICAgICAgIGxpbmVhckRhbXBpbmc6IHRoaXMubGluZWFyRGFtcGluZyxcclxuICAgICAgICAgICAgICAgICAgICBhbmd1bGFyRGFtcGluZzogdGhpcy5hbmd1bGFyRGFtcGluZyxcclxuICAgICAgICAgICAgICAgICAgICAvLyBDb250aW51b3VzIGNvbGxpc2lvbiBkZXRlY3Rpb246IHdpdGhvdXQgdGhpcywgYSBib3ggbW92aW5nIGZhc3QgZW5vdWdoXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gKHN0cm9uZyBTY2F0dGVyIGltcHVsc2Ugb3Igc3Ryb25nIGdyYXZpdHkgYnVpbGRpbmcgdXAgc3BlZWQgaW4gYSBzdGFjaylcclxuICAgICAgICAgICAgICAgICAgICAvLyBjYW4gdHJhdmVsIGZhcnRoZXIgdGhhbiBpdHMgb3duIHNpemUgaW4gYSBzaW5nbGUgcGh5c2ljcyBzdGVwIGFuZCB0dW5uZWxcclxuICAgICAgICAgICAgICAgICAgICAvLyB0aHJvdWdoIGFub3RoZXIgYm94IGJlZm9yZSBhIGNvbGxpc2lvbiBpcyBldmVuIGRldGVjdGVkLlxyXG4gICAgICAgICAgICAgICAgICAgIGJ1bGxldDogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgIGNvbnN0IHNoYXBlID0gbmV3IGIyLlBvbHlnb25TaGFwZSgpO1xyXG4gICAgICAgICAgICAgICAgc2hhcGUuU2V0QXNCb3godG9NKHcgLyAyKSwgdG9NKGggLyAyKSk7XHJcbiAgICAgICAgICAgICAgICBib2R5LkNyZWF0ZUZpeHR1cmUoeyBzaGFwZSwgZGVuc2l0eTogdGhpcy5kZW5zaXR5LCBmcmljdGlvbjogdGhpcy5mcmljdGlvbiwgcmVzdGl0dXRpb246IHRoaXMucmVzdGl0dXRpb24gfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgY29uc3QgYm94OiBTaW1Cb3ggPSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWQ6IHVpZCsrLFxyXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IGksXHJcbiAgICAgICAgICAgICAgICAgICAgaHVtYW5Db2xvcjogLTEsXHJcbiAgICAgICAgICAgICAgICAgICAgeDogdG9QeChib2R5LkdldFBvc2l0aW9uKCkueCksXHJcbiAgICAgICAgICAgICAgICAgICAgeTogdG9QeChib2R5LkdldFBvc2l0aW9uKCkueSksXHJcbiAgICAgICAgICAgICAgICAgICAgYW5nbGU6IGJvZHkuR2V0QW5nbGUoKSAqIFJBRDJERUcsXHJcbiAgICAgICAgICAgICAgICAgICAgdywgaCxcclxuICAgICAgICAgICAgICAgICAgICBmaWxsOiBhcHBseUluZGV4Tm9pc2UodHlwZUNvbG9yc1tpICUgdHlwZUNvbG9ycy5sZW5ndGhdLCBpICsgaiksIC8vIHBsYWNlaG9sZGVyIHVudGlsIGNvbG9yZWQgYmVsb3dcclxuICAgICAgICAgICAgICAgICAgICBib2R5LFxyXG4gICAgICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgICAgICB0aGlzLnR5cGVCb3hlc1tpXS5wdXNoKGJveCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJveGVzLnB1c2goYm94KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBDb2xvcmluZyBib3hlcyB2aWEgc3VtSHVtYW4gKGJ1cyBjb2xvciBncm91cHMpLCBzYW1lIG9yZGVyIG9mIG9wZXJhdGlvbnMgYXMgQm94Q3JlYXRvci5cclxuICAgICAgICB0aGlzLnR5cGVCb3hlcy5mb3JFYWNoKChsaXN0KSA9PiBzaHVmZmxlQXJyYXkobGlzdCkpO1xyXG5cclxuICAgICAgICBkYXRhLnN1bUh1bWFuLmZvckVhY2goKHJvdykgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBpQW1vdW50ID0gWy4uLnJvd107XHJcbiAgICAgICAgICAgIGNvbnN0IGlDb2xvciA9IGlBbW91bnQuc2hpZnQoKSE7XHJcbiAgICAgICAgICAgIGlBbW91bnQuZm9yRWFjaCgoaXRlbSwgaSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgbGlzdCA9IHRoaXMudHlwZUJveGVzW2ldO1xyXG4gICAgICAgICAgICAgICAgaWYgKCFsaXN0KSByZXR1cm47XHJcbiAgICAgICAgICAgICAgICBjb25zdCBwaWNrZWQgPSBsaXN0LnNwbGljZSgwLCBpdGVtKTtcclxuICAgICAgICAgICAgICAgIHBpY2tlZC5mb3JFYWNoKChiKSA9PiB7IGIuaHVtYW5Db2xvciA9IGlDb2xvcjsgfSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBCb3ggZmlsbCA9IGl0cyBhc3NpZ25lZCBidXMvaHVtYW4gY29sb3IgKG1hdGNoZXMgSHVtYW5Db2xvcnMsIGkuZS4gd2hhdCBpdCdsbCBsb29rXHJcbiAgICAgICAgLy8gbGlrZSBvbmNlIGl0IGJlY29tZXMgYSBwYXNzZW5nZXIpLCBmYWxsaW5nIGJhY2sgdG8gYSB0eXBlIHRpbnQgZm9yIGFueSBib3ggc3VtSHVtYW5cclxuICAgICAgICAvLyBsZWZ0IHVuYXNzaWduZWQuXHJcbiAgICAgICAgdGhpcy5ib3hlcy5mb3JFYWNoKChiKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGJhc2VIZXggPSBiLmh1bWFuQ29sb3IgPj0gMFxyXG4gICAgICAgICAgICAgICAgPyBodW1hbkNvbG9yc1tiLmh1bWFuQ29sb3IgJSBodW1hbkNvbG9ycy5sZW5ndGhdID8/IHR5cGVDb2xvcnNbYi50eXBlICUgdHlwZUNvbG9ycy5sZW5ndGhdXHJcbiAgICAgICAgICAgICAgICA6IHR5cGVDb2xvcnNbYi50eXBlICUgdHlwZUNvbG9ycy5sZW5ndGhdO1xyXG4gICAgICAgICAgICBiLmZpbGwgPSBhcHBseUluZGV4Tm9pc2UoYmFzZUhleCwgYi5pZCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRoaXMuc2NhdHRlcigpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBNaXJyb3JzIEJveENyZWF0b3Iub25Ub3VjaFN0YXJ0OiBnaXZlIGV2ZXJ5IGJveCBhIHJhbmRvbSBidXJzdCBvZiBsaW5lYXIgKyBhbmd1bGFyIHZlbG9jaXR5LiAqL1xyXG4gICAgc2NhdHRlcigpIHtcclxuICAgICAgICBjb25zdCBtYXhMaW5lYXIgPSB0aGlzLmltcHVsc2UgKiB0aGlzLmltcHVsc2VMaW5lYXJTY2FsZTtcclxuICAgICAgICBjb25zdCBtYXhBbmd1bGFyID0gdGhpcy5pbXB1bHNlICogdGhpcy5pbXB1bHNlQW5ndWxhclNjYWxlO1xyXG4gICAgICAgIHRoaXMuYm94ZXMuZm9yRWFjaCgoYikgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBhbmdsZSA9IE1hdGgucmFuZG9tKCkgKiBNYXRoLlBJICogMjtcclxuICAgICAgICAgICAgY29uc3Qgc3BlZWQgPSBtYXhMaW5lYXIgKiAoMC41ICsgTWF0aC5yYW5kb20oKSAqIDAuNSk7XHJcbiAgICAgICAgICAgIGIuYm9keS5TZXRBd2FrZSh0cnVlKTtcclxuICAgICAgICAgICAgbGV0IHJhbmRvbVNpZ25YID0gTWF0aC5yYW5kb20oKSA8IDAuNSA/IC0xIDogMTtcclxuICAgICAgICAgICAgbGV0IHJhbmRvbVNpZ25ZID0gTWF0aC5yYW5kb20oKSA8IDAuNSA/IC0xIDogMTtcclxuICAgICAgICAgICAgYi5ib2R5LlNldExpbmVhclZlbG9jaXR5KG5ldyBiMi5WZWMyKHRvTShNYXRoLmNvcyhhbmdsZSkgKiBzcGVlZCAqIHJhbmRvbVNpZ25YKSwgdG9NKE1hdGguc2luKGFuZ2xlKSAqIHNwZWVkICogcmFuZG9tU2lnblkpKSk7XHJcbiAgICAgICAgICAgIGIuYm9keS5TZXRBbmd1bGFyVmVsb2NpdHkoKE1hdGgucmFuZG9tKCkgKiAyIC0gMSkgKiBtYXhBbmd1bGFyKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogTWlycm9ycyB0aGUgU1BBQ0UgaGFuZGxlciBpbiBCb3hDcmVhdG9yLm9uS2V5RG93biwgY29vcmRpbmF0ZXMgcmVsYXRpdmUgdG8gYG9yaWdpbmAuICovXHJcbiAgICBleHBvcnREYXRhKG9yaWdpbjogRXhwb3J0T3JpZ2luID0gJ2JvdHRvbS1sZWZ0Jyk6IGFueVtdIHtcclxuICAgICAgICBjb25zdCB7IGZ4LCBmeSB9ID0gRVhQT1JUX09SSUdJTl9GUkFDVElPTlNbb3JpZ2luXTtcclxuICAgICAgICBjb25zdCBvcmlnaW5YID0gdGhpcy5taW5YICsgZnggKiB0aGlzLndpZHRoO1xyXG4gICAgICAgIGNvbnN0IG9yaWdpblkgPSB0aGlzLm1pblkgKyBmeSAqIHRoaXMuaGVpZ2h0O1xyXG5cclxuICAgICAgICByZXR1cm4gdGhpcy5ib3hlcy5tYXAoKGIpID0+IFtcclxuICAgICAgICAgICAgYi50eXBlLFxyXG4gICAgICAgICAgICBiLmh1bWFuQ29sb3IsXHJcbiAgICAgICAgICAgIHRydW5jYXRlKGIueCAtIG9yaWdpblgsIDMpLFxyXG4gICAgICAgICAgICB0cnVuY2F0ZSgtKGIueSAtIG9yaWdpblkpLCAzKSxcclxuICAgICAgICAgICAgdHJ1bmNhdGUoLWIuYW5nbGUsIDMpLFxyXG4gICAgICAgIF0pO1xyXG4gICAgfVxyXG5cclxuICAgIHN0YXRzKCkge1xyXG4gICAgICAgIGNvbnN0IGJ5VHlwZTogUmVjb3JkPG51bWJlciwgbnVtYmVyPiA9IHt9O1xyXG4gICAgICAgIGNvbnN0IGJ5Q29sb3I6IFJlY29yZDxudW1iZXIsIG51bWJlcj4gPSB7fTtcclxuICAgICAgICB0aGlzLmJveGVzLmZvckVhY2goKGIpID0+IHtcclxuICAgICAgICAgICAgYnlUeXBlW2IudHlwZV0gPSAoYnlUeXBlW2IudHlwZV0gfHwgMCkgKyAxO1xyXG4gICAgICAgICAgICBieUNvbG9yW2IuaHVtYW5Db2xvcl0gPSAoYnlDb2xvcltiLmh1bWFuQ29sb3JdIHx8IDApICsgMTtcclxuICAgICAgICB9KTtcclxuICAgICAgICByZXR1cm4geyB0b3RhbDogdGhpcy5ib3hlcy5sZW5ndGgsIGJ5VHlwZSwgYnlDb2xvciB9O1xyXG4gICAgfVxyXG5cclxuICAgIHN0ZXAoZHQ6IG51bWJlcikge1xyXG4gICAgICAgIGlmIChkdCA8PSAwKSByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIFNtYWxsZXIgc3ViLXN0ZXBzIGluc3RlYWQgb2Ygb25lIGJpZyBTdGVwKCkgcGVyIGZyYW1lOiBjYXBzIGhvdyBmYXIgYSBmYXN0IGJveCBjYW5cclxuICAgICAgICAvLyBtb3ZlIGJlZm9yZSB0aGUgbmV4dCBjb2xsaXNpb24gY2hlY2ssIHNvIHN0cm9uZyBncmF2aXR5L2ltcHVsc2UgY2FuJ3QgdHVubmVsIGl0XHJcbiAgICAgICAgLy8gdGhyb3VnaCBhbm90aGVyIGJveCAtIGFuZCBnaXZlcyB0aGUgcG9zaXRpb24gc29sdmVyIG1vcmUsIHNtYWxsZXIgcGFzc2VzIHRvIGZ1bGx5XHJcbiAgICAgICAgLy8gcmVzb2x2ZSBhbnkgb3ZlcmxhcCBpbnN0ZWFkIG9mIGhpdHRpbmcgaXRzIHBlci1zdGVwIGNvcnJlY3Rpb24gbGltaXQuXHJcbiAgICAgICAgY29uc3Qgc3Vic3RlcHMgPSA0O1xyXG4gICAgICAgIGNvbnN0IHN1YiA9IGR0IC8gc3Vic3RlcHM7XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdWJzdGVwczsgaSsrKSB7XHJcbiAgICAgICAgICAgIHRoaXMud29ybGQuU3RlcChzdWIsIDgsIDMpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgZm9yIChjb25zdCBiIG9mIHRoaXMuYm94ZXMpIHtcclxuICAgICAgICAgICAgY29uc3QgcG9zID0gYi5ib2R5LkdldFBvc2l0aW9uKCk7XHJcbiAgICAgICAgICAgIGIueCA9IHRvUHgocG9zLngpO1xyXG4gICAgICAgICAgICBiLnkgPSB0b1B4KHBvcy55KTtcclxuICAgICAgICAgICAgYi5hbmdsZSA9IGIuYm9keS5HZXRBbmdsZSgpICogUkFEMkRFRztcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuIl19