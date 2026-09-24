import { readFileSync } from 'fs-extra';
import { join } from 'path';
import { BoxSimulation, ExportOrigin } from './box-sim';
import { DefaultLevelData, TypeColors, HumanColors, LevelDataLike } from './box-data';

/**
 * @zh 如果希望兼容 3.3 之前的版本可以使用下方的代码
 * @en You can add the code below if you want compatibility with versions prior to 3.3
 */
// Editor.Panel.define = Editor.Panel.define || function(options: any) { return options }

let sim: BoxSimulation | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let canvasEl: HTMLCanvasElement | null = null;
let rafId = 0;
let paused = false;
let lastTime = 0;
let resizeObserver: any = null;
let currentData: LevelDataLike = DefaultLevelData;
let keydownHandler: ((e: KeyboardEvent) => void) | null = null;
let statsIntervalId: any = null;

// ---- View camera: pan/zoom of the canvas, completely separate from the simulated world
// size (sim.width/height, draggable via the edges) and from box scale (sim.sizeMul). ----
const camera = { zoom: 1, x: 0, y: 0 }; // x/y = world-space point shown at the canvas center
let viewW = 0;
let viewH = 0;
let dpr = 1;

const MIN_WORLD_SIZE = 150;
const EDGE_GRAB_PX = 10; // hit-test thickness around each world edge, in screen px

type Edge = 'left' | 'right' | 'top' | 'bottom';
type Drag =
    | { kind: 'pan'; lastX: number; lastY: number }
    | { kind: 'resize'; edges: Edge[]; lastX: number; lastY: number }
    | null;
let drag: Drag = null;

function fitCanvas(wrap: HTMLElement) {
    if (!canvasEl) return;
    const rect = wrap.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    viewW = Math.max(100, Math.floor(rect.width));
    viewH = Math.max(100, Math.floor(rect.height));

    canvasEl.width = Math.floor(viewW * dpr);
    canvasEl.height = Math.floor(viewH * dpr);
    canvasEl.style.width = `${viewW}px`;
    canvasEl.style.height = `${viewH}px`;

    ctx = canvasEl.getContext('2d');
}

/** Reset pan/zoom to frame the world 1:1, centered. Does not touch sim.sizeMul. */
function resetView(zoomLabel?: HTMLElement) {
    if (!sim) return;
    camera.zoom = 1;
    camera.x = sim.minX + sim.width / 2;
    camera.y = sim.minY + sim.height / 2;
    if (zoomLabel) zoomLabel.textContent = '100%';
}

function screenToWorld(sx: number, sy: number) {
    return {
        x: camera.x + (sx - viewW / 2) / camera.zoom,
        y: camera.y + (sy - viewH / 2) / camera.zoom,
    };
}

/** Which edge(s) of the world rect are within grab distance of a screen point (corners hit two). */
function hitEdges(sx: number, sy: number): Edge[] {
    if (!sim) return [];
    const { minX, minY, width, height } = sim;
    const world = screenToWorld(sx, sy);
    const grab = EDGE_GRAB_PX / camera.zoom;
    const edges: Edge[] = [];

    const withinY = world.y > minY - grab && world.y < minY + height + grab;
    const withinX = world.x > minX - grab && world.x < minX + width + grab;
    if (withinY && Math.abs(world.x - minX) <= grab) edges.push('left');
    if (withinY && Math.abs(world.x - (minX + width)) <= grab) edges.push('right');
    if (withinX && Math.abs(world.y - minY) <= grab) edges.push('top');
    if (withinX && Math.abs(world.y - (minY + height)) <= grab) edges.push('bottom');
    return edges;
}

function cursorForEdges(edges: Edge[]): string {
    const l = edges.includes('left');
    const r = edges.includes('right');
    const t = edges.includes('top');
    const b = edges.includes('bottom');
    if ((l && t) || (r && b)) return 'nwse-resize';
    if ((r && t) || (l && b)) return 'nesw-resize';
    if (l || r) return 'ew-resize';
    if (t || b) return 'ns-resize';
    return 'grab';
}

function onPointerDown(e: PointerEvent) {
    if (!sim || !canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const edges = hitEdges(sx, sy);

    canvasEl.setPointerCapture(e.pointerId);
    if (edges.length) {
        drag = { kind: 'resize', edges, lastX: sx, lastY: sy };
    } else {
        drag = { kind: 'pan', lastX: sx, lastY: sy };
        canvasEl.style.cursor = 'grabbing';
    }
}

function onPointerMove(e: PointerEvent) {
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (!drag) {
        canvasEl.style.cursor = cursorForEdges(hitEdges(sx, sy));
        return;
    }

    const dx = sx - drag.lastX;
    const dy = sy - drag.lastY;
    drag.lastX = sx;
    drag.lastY = sy;

    if (drag.kind === 'pan') {
        camera.x -= dx / camera.zoom;
        camera.y -= dy / camera.zoom;
        return;
    }

    const s = sim;
    if (!s) return;

    const wdx = dx / camera.zoom;
    const wdy = dy / camera.zoom;
    let { minX, minY, width, height } = s;

    if (drag.edges.includes('left')) {
        const newMinX = Math.min(minX + wdx, minX + width - MIN_WORLD_SIZE);
        width += minX - newMinX;
        minX = newMinX;
    }
    if (drag.edges.includes('right')) {
        width = Math.max(MIN_WORLD_SIZE, width + wdx);
    }
    if (drag.edges.includes('top')) {
        const newMinY = Math.min(minY + wdy, minY + height - MIN_WORLD_SIZE);
        height += minY - newMinY;
        minY = newMinY;
    }
    if (drag.edges.includes('bottom')) {
        height = Math.max(MIN_WORLD_SIZE, height + wdy);
    }

    s.setWorldRect(minX, minY, width, height);
}

function onPointerUp() {
    drag = null;
    if (canvasEl) canvasEl.style.cursor = 'default';
}

function onWheel(e: WheelEvent, zoomLabel?: HTMLElement) {
    if (!canvasEl) return;
    e.preventDefault();
    const rect = canvasEl.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const before = screenToWorld(sx, sy);

    const factor = Math.exp(-e.deltaY * 0.001);
    camera.zoom = Math.min(6, Math.max(0.15, camera.zoom * factor));

    // Keep the point under the cursor fixed on screen while zooming.
    const after = screenToWorld(sx, sy);
    camera.x += before.x - after.x;
    camera.y += before.y - after.y;

    if (zoomLabel) zoomLabel.textContent = `${Math.round(camera.zoom * 100)}%`;
}

function renderStats(el: HTMLElement) {
    if (!sim) return;
    const s = sim.stats();

    const typeRows = Object.keys(s.byType)
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => {
            const i = Number(k);
            const c = TypeColors[i % TypeColors.length];
            return `<div class="stat-row"><span class="swatch" style="background:${c}"></span>Type ${i}: <b>${s.byType[i]}</b></div>`;
        })
        .join('');

    const colorRows = Object.keys(s.byColor)
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => {
            const i = Number(k);
            const c = i >= 0 ? (HumanColors[i] || '#555') : 'transparent';
            const label = i >= 0 ? `Color ${i}` : 'Unassigned';
            return `<div class="stat-row"><span class="swatch" style="background:${c}"></span>${label}: <b>${s.byColor[i]}</b></div>`;
        })
        .join('');

    el.innerHTML = `<div class="stat-total">Total boxes: <b>${s.total}</b></div>${typeRows}${colorRows}`;
}

function render() {
    if (!ctx || !sim || !canvasEl) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewW, viewH);
    ctx.fillStyle = '#0b0b0b';
    ctx.fillRect(0, 0, viewW, viewH);

    // Camera transform: everything from here on is drawn in world space.
    ctx.save();
    ctx.translate(viewW / 2, viewH / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    const { minX, minY, width, height } = sim;
    ctx.fillStyle = '#141414';
    ctx.fillRect(minX, minY, width, height);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2 / camera.zoom;
    ctx.strokeRect(minX, minY, width, height);

    for (const b of sim.boxes) {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate((b.angle * Math.PI) / 180);

        // Fill = the box's assigned bus/human color (see BoxSimulation.spawn); border = its
        // type, so both groupings stay visible at once.
        ctx.fillStyle = b.fill;
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);

        ctx.strokeStyle = TypeColors[b.type % TypeColors.length] || 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 3 / camera.zoom;
        ctx.strokeRect(-b.w / 2 + 1.5, -b.h / 2 + 1.5, Math.max(0, b.w - 3), Math.max(0, b.h - 3));

        ctx.restore();
    }

    ctx.restore();
}

function loop() {
    rafId = requestAnimationFrame(loop);
    if (!sim || !ctx) return;

    const now = performance.now();
    const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.033) : 0;
    lastTime = now;

    if (!paused) sim.step(dt);
    render();
}
function removeLineBreaks(str: string): string {
    return str.replace(/[\r\n]+/g, '');
}
function parseCustomData(raw: string): LevelDataLike | null {
    if (!raw.trim()) return DefaultLevelData;
    try {
        const parsed = JSON.parse(removeLineBreaks(raw));
        return {
            sizes: parsed.sizes ?? DefaultLevelData.sizes,
            sumBus: parsed.sumBus ?? DefaultLevelData.sumBus,
            sumHuman: parsed.sumHuman ?? DefaultLevelData.sumHuman,
        };
    } catch (e) {
        console.error('[box_arrange] Invalid LevelData JSON:', e);
        return null;
    }
}

module.exports = Editor.Panel.define({
    listeners: {
        show() { console.log('show'); },
        hide() { console.log('hide'); },
    },
    template: readFileSync(join(__dirname, '../../../static/template/default/index.html'), 'utf-8'),
    style: readFileSync(join(__dirname, '../../../static/style/default/index.css'), 'utf-8'),
    $: {
        app: '#app',
        canvasWrap: '.canvas-wrap',
        canvas: '#sim-canvas',
        stats: '#stats',
        btnRegenerate: '#btn-regenerate',
        btnClear: '#btn-clear',
        btnScatter: '#btn-scatter',
        btnPause: '#btn-pause',
        btnLog: '#btn-log',
        exportOrigin: '#export-origin',
        impulse: '#impulse',
        impulseVal: '#impulse-val',
        gravity: '#gravity',
        gravityVal: '#gravity-val',
        sizeMul: '#size-mul',
        sizeMulVal: '#size-mul-val',
        btnResetView: '#btn-reset-view',
        zoomVal: '#zoom-val',
        customData: '#custom-data',
        btnApplyData: '#btn-apply-data',
    },
    methods: {
        hello() {
            console.log('[box_arrange]: hello');
        },
    },
    ready() {
        const $: any = (this as any).$;

        canvasEl = $.canvas as HTMLCanvasElement;
        sim = new BoxSimulation();
        paused = false;
        lastTime = 0;
        currentData = DefaultLevelData;

        // World size is independent of the panel's pixel size - it only changes when the user
        // drags one of its edges (or pastes custom data). Give it a sane default here.
        sim.setBounds(800, 600);

        fitCanvas($.canvasWrap as HTMLElement);
        resetView($.zoomVal as HTMLElement);
        // Starts empty (no spawn/physics work) until the user clicks Regenerate - opening the
        // panel shouldn't pay the cost of a full sim just to look at it.
        renderStats($.stats as HTMLElement);

        const ResizeObserverCtor = (window as any).ResizeObserver;
        if (ResizeObserverCtor) {
            // Only refits the canvas backing store - never touches world size or the camera,
            // so panel resizes don't fight the user's manual pan/zoom/edge-drag.
            resizeObserver = new ResizeObserverCtor(() => fitCanvas($.canvasWrap as HTMLElement));
            resizeObserver.observe($.canvasWrap);
        }

        canvasEl.style.touchAction = 'none';
        canvasEl.addEventListener('pointerdown', onPointerDown);
        canvasEl.addEventListener('pointermove', onPointerMove);
        canvasEl.addEventListener('pointerup', onPointerUp);
        canvasEl.addEventListener('pointercancel', onPointerUp);
        canvasEl.addEventListener('pointerleave', () => {
            if (!drag && canvasEl) canvasEl.style.cursor = 'default';
        });
        canvasEl.addEventListener('wheel', (e: WheelEvent) => onWheel(e, $.zoomVal as HTMLElement), { passive: false });

        $.btnResetView.addEventListener('click', () => resetView($.zoomVal as HTMLElement));

        $.btnRegenerate.addEventListener('click', () => {
            sim!.sizeMul = parseFloat($.sizeMul.value);
            sim!.spawn(currentData, TypeColors, HumanColors);
            renderStats($.stats);
        });

        $.btnClear.addEventListener('click', () => {
            sim!.clear();
            renderStats($.stats);
        });

        $.btnScatter.addEventListener('click', () => {
            sim!.impulse = parseFloat($.impulse.value);
            sim!.scatter();
        });

        $.btnPause.addEventListener('click', () => {
            paused = !paused;
            $.btnPause.textContent = paused ? '▶ Resume' : '⏸ Pause';
        });

        $.btnLog.addEventListener('click', () => {
            console.log(JSON.stringify(sim!.exportData($.exportOrigin.value as ExportOrigin)));
        });

        $.impulse.addEventListener('input', () => {
            $.impulseVal.textContent = $.impulse.value;
            sim!.impulse = parseFloat($.impulse.value);
        });
        $.gravity.addEventListener('input', () => {
            $.gravityVal.textContent = $.gravity.value;
            sim!.gravity = parseFloat($.gravity.value);
        });
        $.sizeMul.addEventListener('input', () => {
            $.sizeMulVal.textContent = $.sizeMul.value;
        });

        $.btnApplyData.addEventListener('click', () => {
            const parsed = parseCustomData($.customData.value);
            if (!parsed) return;
            currentData = parsed;
            sim!.sizeMul = parseFloat($.sizeMul.value);
            sim!.spawn(currentData, TypeColors, HumanColors);
            renderStats($.stats);
        });

        // Mirrors BoxCreator.onKeyDown: SPACE logs the export data, Z re-scatters.
        // keydownHandler = (e: KeyboardEvent) => {
        //     if (e.code === 'Space') {
        //         e.preventDefault();
        //         console.log(JSON.stringify(sim!.exportData($.exportOrigin.value as ExportOrigin)));
        //     } else if (e.code === 'KeyZ') {
        //         sim!.scatter();
        //     }
        // };
        // ($.app as HTMLElement).ownerDocument.addEventListener('keydown', keydownHandler);

        statsIntervalId = setInterval(() => {
            if (sim) renderStats($.stats as HTMLElement);
        }, 500);

        loop();
    },
    beforeClose() {
        if (rafId) cancelAnimationFrame(rafId);
        if (resizeObserver) resizeObserver.disconnect();
        if (statsIntervalId) clearInterval(statsIntervalId);
        drag = null;

        const $: any = (this as any).$;
        if (keydownHandler && $.app) {
            ($.app as HTMLElement).ownerDocument.removeEventListener('keydown', keydownHandler);
        }
        if (canvasEl) {
            canvasEl.removeEventListener('pointerdown', onPointerDown);
            canvasEl.removeEventListener('pointermove', onPointerMove);
            canvasEl.removeEventListener('pointerup', onPointerUp);
            canvasEl.removeEventListener('pointercancel', onPointerUp);
        }
    },
    close() { },
});
