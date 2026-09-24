import { LevelDataLike } from './box-data';

// @cocos/box2d's index.d.ts re-exports types straight from its raw .ts sources (not
// precompiled .d.ts), which pulls its particle/liquid module - unused here, and not
// strict-mode clean - into our compilation. A plain `require()` keeps its own type errors
// from blocking our build; we only rely on the documented World/Body/Shape/Vec2 API below.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const b2: any = require('@cocos/box2d');

export interface SimBox {
    id: number;
    type: number;
    /** ColorType id assigned via sumHuman, or -1 when not part of any human group. */
    humanColor: number;
    x: number;
    y: number;
    /** degrees, synced from the Box2D body each step for rendering. */
    angle: number;
    w: number;
    h: number;
    fill: string;
    /** @internal physics body backing this box (b2.Body, kept untyped - see the require() above). */
    body: any;
}

function hexToRgb(hex: string) {
    const v = hex.replace('#', '');
    const bigint = parseInt(v, 16);
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}

function rgbToHex(r: number, g: number, b: number) {
    const c = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
    return `#${c(r)}${c(g)}${c(b)}`;
}

/** Mirrors BoxCreator.applyIndexNoise: deterministic-ish per-index noise on top of a random strength. */
export function applyIndexNoise(hex: string, pixelIndex: number): string {
    const { r, g, b } = hexToRgb(hex);
    const noise = (((pixelIndex * 73) + 17) % 21) - 10;
    var strength = Math.random() * 0.1;
    strength = 0;
    const scale = 1 + noise * strength;
    return rgbToHex(r * scale, g * scale, b * scale);
}

/** Mirrors Ulis.shuffleArray (Fisher-Yates, in place). */
export function shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/** Mirrors BoxCreator.truncate. */
export function truncate(n: number, m: number): number {
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
const toM = (px: number) => px / PTM;
const toPx = (m: number) => m * PTM;

// @cocos/box2d's index.d.ts doesn't re-export the b2BodyType enum, but numeric enums in
// TS accept plain numbers - these match b2BodyType.b2_staticBody / b2_dynamicBody exactly.
const BODY_TYPE_STATIC = 0;
const BODY_TYPE_DYNAMIC = 2;

let uid = 0;

/** 3x3 anchor grid (like a Cocos/Unity anchor picker) used as the (0, 0) origin for exportData(). */
export type ExportOrigin =
    | 'top-left' | 'top-center' | 'top-right'
    | 'middle-left' | 'center' | 'middle-right'
    | 'bottom-left' | 'bottom-center' | 'bottom-right';

// fraction across the world rect (0 = left/top edge, 1 = right/bottom edge) for each anchor.
const EXPORT_ORIGIN_FRACTIONS: Record<ExportOrigin, { fx: number; fy: number }> = {
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
export class BoxSimulation {
    boxes: SimBox[] = [];
    private typeBoxes: SimBox[][] = [];

    // World rect in world-space. minX/minY let each edge be resized independently (e.g. dragging
    // the left edge grows minX while shrinking width, so the right edge stays put) instead of the
    // rect always being pinned to the origin.
    minX = 0;
    minY = 0;
    width = 800;
    height = 600;

    baseSize = 60;        // px for a size scale of 1.0
    sizeMul = 1.2;         // BoxCreator's sizeMul
    impulse = 15;          // BoxCreator's onTouchStart "max" (both linear and angular use 15)

    private impulseLinearScale = 40;   // px/s per impulse unit, tuned for the canvas
    private impulseAngularScale = 1.8; // rad/s per impulse unit, tuned for the canvas

    density = 1;
    friction = 0.4;
    restitution = 0.15;
    linearDamping = 0.05;
    angularDamping = 0.05;

    // 1 gravity slider unit -> this many px/s^2 (Box2D gravity is a real acceleration, unlike
    // Matter's gravity.y/gravity.scale pair - this keeps the -3..3 slider range feeling similar).
    private static readonly GRAVITY_SCALE = 700;

    private world: any; // b2.World, kept untyped - see the require() at the top of the file
    private walls: any[] = []; // b2.Body[]

    constructor() {
        this.world = new b2.World(new b2.Vec2(0, toM(1.2 * BoxSimulation.GRAVITY_SCALE)));
        this.world.m_allowSleep = false; // boxes should never go to sleep, see scatter()
    }

    get gravity() { return toPx(this.world.GetGravity().y) / BoxSimulation.GRAVITY_SCALE; }
    set gravity(v: number) { this.world.SetGravity(new b2.Vec2(0, toM(v * BoxSimulation.GRAVITY_SCALE))); }

    /** Resize the world keeping its top-left corner pinned at (0, 0). */
    setBounds(w: number, h: number) {
        this.setWorldRect(this.minX, this.minY, w, h);
    }

    /** Move and/or resize the world rect - lets each edge be dragged independently. */
    setWorldRect(minX: number, minY: number, w: number, h: number) {
        if (minX === this.minX && minY === this.minY && w === this.width && h === this.height && this.walls.length) return;
        this.minX = minX;
        this.minY = minY;
        this.width = w;
        this.height = h;

        this.walls.forEach((wall) => this.world.DestroyBody(wall));
        this.walls = [];

        const t = 60; // wall thickness, kept off-screen so box corners never visually clip it
        const cx = minX + w / 2;
        const cy = minY + h / 2;

        const makeWall = (x: number, y: number, hw: number, hh: number) => {
            const body = this.world.CreateBody({ type: BODY_TYPE_STATIC, position: new b2.Vec2(toM(x), toM(y)) });
            const shape = new b2.PolygonShape();
            shape.SetAsBox(toM(hw), toM(hh));
            body.CreateFixture({ shape, friction: this.friction });
            return body;
        };

        this.walls = [
            makeWall(cx, minY + h + t / 2, w / 2 + t, t / 2), // floor
            makeWall(cx, minY - t / 2, w / 2 + t, t / 2),     // ceiling
            makeWall(minX - t / 2, cy, t / 2, h / 2 + t),     // left
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

            if (x - hw < minX) { x = minX + hw + margin; clamped = true; }
            if (x + hw > minX + w) { x = minX + w - hw - margin; clamped = true; }
            if (y - hh < minY) { y = minY + hh + margin; clamped = true; }
            if (y + hh > minY + h) { y = minY + h - hh - margin; clamped = true; }

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
    spawn(data: LevelDataLike, typeColors: string[], humanColors: string[]) {
        this.clear();

        const spawnX = this.minX + this.width / 2;
        const spawnY = this.minY + this.height * 0.5;

        data.sizes.forEach((size, i) => {
            const amount = data.sumBus[i] ?? 0;
            if (!this.typeBoxes[i]) this.typeBoxes[i] = [];

            for (let j = 0; j < amount; j++) {
                const w = Math.max(4, size[2] * this.sizeMul * this.baseSize);
                const h = Math.max(4, size[3] * this.sizeMul * this.baseSize);

                const body = this.world.CreateBody({
                    type: BODY_TYPE_DYNAMIC,
                    position: new b2.Vec2(
                        toM(spawnX + (Math.random() - 0.5) * 20),
                        toM(spawnY + (Math.random() - 0.5) * 20),
                    ),
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

                const box: SimBox = {
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
            const iColor = iAmount.shift()!;
            iAmount.forEach((item, i) => {
                const list = this.typeBoxes[i];
                if (!list) return;
                const picked = list.splice(0, item);
                picked.forEach((b) => { b.humanColor = iColor; });
            });
        });

        // Box fill = its assigned bus/human color (matches HumanColors, i.e. what it'll look
        // like once it becomes a passenger), falling back to a type tint for any box sumHuman
        // left unassigned.
        this.boxes.forEach((b) => {
            const baseHex = b.humanColor >= 0
                ? humanColors[b.humanColor % humanColors.length] ?? typeColors[b.type % typeColors.length]
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
    exportData(origin: ExportOrigin = 'bottom-left'): any[] {
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
        const byType: Record<number, number> = {};
        const byColor: Record<number, number> = {};
        this.boxes.forEach((b) => {
            byType[b.type] = (byType[b.type] || 0) + 1;
            byColor[b.humanColor] = (byColor[b.humanColor] || 0) + 1;
        });
        return { total: this.boxes.length, byType, byColor };
    }

    step(dt: number) {
        if (dt <= 0) return;

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
