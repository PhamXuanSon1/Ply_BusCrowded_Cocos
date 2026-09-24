// This file is a Cocos Creator "scene script" (registered via package.json ->
// contributions.scene.script). Unlike source/panels/**/*.ts (which run in the panel's own
// Node/webview process and have no engine access), a scene script runs inside the Scene
// process itself, which has the actual running `cc` engine loaded - that's what lets it walk
// the live node tree and read camera pixels. The panel calls the exported `methods` below via:
//   Editor.Message.request('scene', 'execute-scene-script', { name: packageJSON.name, method, args })
import { Camera, CCObject, director, Director, Node, RenderTexture, view } from 'cc';
import { join } from 'path';

// `cc` isn't in this extension's own node_modules - it's provided by the running Editor/Scene
// process at runtime. Without this, `require('cc')` (what the `import` above compiles to)
// would fail to resolve even though it type-checks fine against @cocos/creator-types/engine.
module.paths.push(join(Editor.App.path, 'node_modules'));

export interface CapturedCamera {
    uuid: string;
    name: string;
    priority: number;
    visibility: number;
    width: number;
    height: number;
    /** data:image/png;base64,... - a plain string is what actually crosses the
     *  execute-scene-script bridge cleanly (it appears to serialize through JSON, not a
     *  structured clone - a raw pixel Uint8Array turns into a giant, slow, and broken
     *  `{"0":.., "1":.., ...}` object over that bridge). */
    dataUrl: string;
}

export interface CameraInfo {
    uuid: string;
    name: string;
    priority: number;
    enabled: boolean;
}

export interface SelectionMarker {
    uuid: string;
    name: string;
    /** px, in the same top-left-origin space as the composited image (width/height below). */
    x: number;
    y: number;
}

export interface CaptureResult {
    cameras: CapturedCamera[];
    /** Where the currently-selected node(s) in the Editor project to, so the panel can draw its
     *  own selection marker - a stand-in for the real Editor gizmo, which isn't capturable (see
     *  findCameras: it very likely isn't drawn through this Camera component's normal render
     *  pass at all, so redirecting targetTexture doesn't intercept it - it's Editor-internal
     *  overlay drawing we don't have access to). */
    markers: SelectionMarker[];
}

/**
 * Forces the director through one update+render pass right now via `director.tick()`, instead
 * of passively waiting for the natural (rAF-driven) loop to eventually get around to it. The
 * Editor pauses/throttles that natural loop when the Scene view isn't the focused/visible tab
 * - which is exactly the situation when someone's looking at this panel instead of Scene - so
 * passively waiting on Director.EVENT_AFTER_RENDER could hang indefinitely. Still guarded by a
 * timeout as a last resort in case `tick()` itself doesn't synchronously fire the event.
 */
function forceRenderFrame(timeoutMs = 3000): Promise<void> {
    return new Promise((resolve, reject) => {
        let done = false;
        const timer = setTimeout(() => {
            if (done) return;
            done = true;
            reject(new Error('Timed out waiting for the Scene to render a frame.'));
        }, timeoutMs);

        director.once(Director.EVENT_AFTER_RENDER, () => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve();
        });

        director.tick(1 / 60);
    });
}

/**
 * `node.activeInHierarchy` is a cached/lazily-recomputed flag - in edit mode (as opposed to
 * Play) that cache doesn't always get refreshed right after a scene loads or a node's active
 * state is changed some other way, which showed up as "camera isn't detected until you toggle
 * it off and on". Walking `.active` (a plain, always-live flag) up the parent chain ourselves
 * sidesteps that cache entirely.
 */
function isActiveInHierarchy(node: Node | null): boolean {
    for (let n = node; n; n = n.parent) {
        if (!n.active) return false;
    }
    return true;
}

/** True if this node (or an ancestor) is one of the Editor's own internal/gizmo nodes - these
 * are hidden from the Hierarchy panel but still real nodes a raw component walk will find. */
function isHiddenInHierarchy(node: Node | null): boolean {
    for (let n = node; n; n = n.parent) {
        if (n.hideFlags & CCObject.Flags.HideInHierarchy) return true;
    }
    return false;
}

function findCameras(): Camera[] {
    const scene = director.getScene();
    if (!scene) return [];

    const seen = new Set<string>();
    return scene.getComponentsInChildren(Camera).filter((cam) => {
        if (isHiddenInHierarchy(cam.node)) return false;
        // Defensive de-dupe: a camera node reached through more than one path (e.g. a prefab
        // wrapper) would otherwise get captured/listed twice.
        if (seen.has(cam.node.uuid)) return false;
        seen.add(cam.node.uuid);
        return true;
    });
}

function findNodeByUuid(uuid: string): Node | null {
    const scene = director.getScene();
    if (!scene) return null;
    let found: Node | null = null;
    scene.walk((n) => {
        if (!found && n.uuid === uuid) found = n;
    });
    return found;
}

/**
 * Projects the Editor's current node selection into the same pixel space as the composited
 * capture, so the panel can draw its own selection marker (see SelectionMarker/CaptureResult -
 * this is a stand-in for the real gizmo, which we can't capture). Must run while `cameras`'
 * targetTexture is still pointed at their capture RenderTexture (i.e. before/without resetting
 * it), since Camera.worldToScreen() projects relative to whatever the camera is currently
 * rendering into.
 */
function computeSelectionMarkers(cameras: Camera[], width: number, height: number): SelectionMarker[] {
    const selectedUuids: string[] = Editor.Selection.getSelected('node');
    if (!selectedUuids.length) return [];

    // Highest priority first: if a node projects on-screen for more than one camera (e.g. both
    // the 3D and UI camera technically produce *some* point), prefer whichever camera actually
    // "owns" what ends up on top in the final composite.
    const sortedCameras = [...cameras].sort((a, b) => b.priority - a.priority);

    const markers: SelectionMarker[] = [];
    for (const uuid of selectedUuids) {
        const node = findNodeByUuid(uuid);
        if (!node) continue;

        const worldPos = node.getWorldPosition();
        for (const cam of sortedCameras) {
            const screenPos = cam.worldToScreen(worldPos);
            // worldToScreen is bottom-left origin, in the camera's current render target space
            // (our capture RenderTexture, since that's what's currently assigned) - flip Y to
            // match the top-left-origin composite image.
            const x = screenPos.x;
            const y = height - screenPos.y;
            if (x >= 0 && x <= width && y >= 0 && y <= height && screenPos.z > 0) {
                markers.push({ uuid, name: node.name, x, y });
                break;
            }
        }
    }
    return markers;
}

// --- Per-camera capture resources, reused across calls instead of allocated every tick -----
// Live mode polls this repeatedly (every ~500ms). Two things are cached per camera (by node
// uuid) for the lifetime of that camera being captured:
//  - The RenderTexture/pixel buffers/canvas: recreating a GPU resource and fresh buffers every
//    single tick is wasteful churn.
//  - `cam.targetTexture` itself is assigned ONCE and left pointed at our RenderTexture for as
//    long as we keep capturing that camera, instead of being set then reset back to normal
//    every single tick. Repeatedly reattaching a camera's render target turned out to be why
//    the very first capture of a camera came out blank until you toggled the node off/on in
//    the Hierarchy (which forces the same kind of re-setup) - and caused a visible flash each
//    tick in the real Scene view besides. It's restored to the camera's original texture only
//    when that camera stops being captured (see prune/unload below).
interface CameraResources {
    cam: Camera;
    originalTarget: RenderTexture | null;
    rt: RenderTexture;
    width: number;
    height: number;
    raw: Uint8Array;        // scratch for readPixels' GL row order (bottom-to-top)
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    imageData: ImageData;   // top-to-bottom, refilled in place each capture
    warmedUp: boolean;
}

const resourceCache = new Map<string, CameraResources>();

function createResources(cam: Camera, width: number, height: number): CameraResources {
    const rt = new RenderTexture();
    rt.reset({ width, height });

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    const res: CameraResources = {
        cam,
        originalTarget: cam.targetTexture,
        rt,
        width,
        height,
        raw: new Uint8Array(width * height * 4),
        canvas,
        ctx,
        imageData: ctx.createImageData(width, height),
        warmedUp: false,
    };
    cam.targetTexture = rt;
    return res;
}

function destroyResources(res: CameraResources) {
    try { res.cam.targetTexture = res.originalTarget; } catch (err) {
        console.warn(`[game_view] failed to restore targetTexture on "${res.cam.node.name}":`, err);
    }
    res.rt.destroy();
}

function getResources(cam: Camera, width: number, height: number): CameraResources {
    const uuid = cam.node.uuid;
    const existing = resourceCache.get(uuid);
    if (existing && existing.width === width && existing.height === height) {
        return existing;
    }
    if (existing) destroyResources(existing);

    const res = createResources(cam, width, height);
    resourceCache.set(uuid, res);
    return res;
}

/** Restores + frees resources for any cached camera that isn't in this capture's camera list
 *  anymore (deleted/disabled/renamed away) - keeps its real render target working again. */
function pruneResourceCache(keepUuids: Set<string>) {
    for (const [uuid, res] of resourceCache) {
        if (!keepUuids.has(uuid)) {
            destroyResources(res);
            resourceCache.delete(uuid);
        }
    }
}

/**
 * Drops a camera's cached resources WITHOUT trying to restore its targetTexture ourselves -
 * toggling the node's active state (see refreshCamera/refreshAllCameras below) already resets
 * the camera through its normal onDisable/onEnable lifecycle, which puts targetTexture back to
 * whatever it's meant to default to on its own. The next captureCameras() call will call
 * createResources() again, snapshot a fresh `originalTarget`, and reassign our RenderTexture.
 */
function invalidateResources(uuid: string) {
    const res = resourceCache.get(uuid);
    if (!res) return;
    res.rt.destroy();
    resourceCache.delete(uuid);
}

/** Turns a node off then back on - the manual fix for a camera's first render coming out
 *  blank/stale (see captureCameras' warm-up) turned into something we can trigger ourselves. */
async function toggleNode(node: Node) {
    // node.active = !node.active;
    node.active = false;
    node.active = true;
    await forceRenderFrame();
    await forceRenderFrame();
    // node.active = !node.active;
    // director.tick(1);
    // director.once(Director.EVENT_AFTER_UPDATE, () => node.active = true);
}

/** readPixels() returns GL-convention rows (bottom-to-top); ImageData wants top-to-bottom. */
function flipRowsInto(src: Uint8Array, dst: Uint8ClampedArray, width: number, height: number) {
    const rowBytes = width * 4;
    for (let y = 0; y < height; y++) {
        const srcStart = (height - 1 - y) * rowBytes;
        dst.set(src.subarray(srcStart, srcStart + rowBytes), y * rowBytes);
    }
}

// Guards against two captureCameras() calls running at once (e.g. a Live-mode tick firing
// while a previous, slow/stalled call is still in flight) - overlapping calls would otherwise
// step on each other's use of the (now persistently-assigned) capture RenderTextures.
let capturing = false;

export const methods = {
    /** Lists every Camera component in the scene, without capturing anything (cheap). */
    async listCameras(): Promise<CameraInfo[]> {
        return findCameras().map((cam) => ({
            uuid: cam.node.uuid,
            name: cam.node.name,
            priority: cam.priority,
            enabled: cam.enabled && isActiveInHierarchy(cam.node),
        }));
    },

    /**
     * Toggles one camera's node off then on (see toggleNode) - triggerable by hand from the
     * panel (clicking that camera's row) to force its next capture to be a fresh, correct one.
     */
    async refreshCamera(uuid: string): Promise<void> {
        const cam = findCameras().find((c) => c.node.uuid === uuid);
        if (!cam) return;
        await toggleNode(cam.node);
        invalidateResources(uuid);
    },

    /**
     * Toggles every capturable camera off then on, in ascending priority order (the same order
     * they get composited in) - run once when Live mode starts so every camera shows correctly
     * from the very first capture instead of needing to be touched by hand first.
     */
    async refreshAllCameras(): Promise<void> {
        const cameras = findCameras()
            .filter((cam) => cam.enabled && isActiveInHierarchy(cam.node))
            .sort((a, b) => - a.priority + b.priority);

        for (const cam of cameras) {
            await toggleNode(cam.node);
            invalidateResources(cam.node.uuid);
        }
    },

    /**
     * Captures every enabled Camera in the scene to its own PNG, sorted by priority ascending
     * (lowest first) - the same order Cocos itself composites cameras in, so the caller can
     * reproduce the final game view by drawing these on top of each other in that order.
     */
    async captureCameras(maxSize: number = 1024): Promise<CaptureResult> {
        if (capturing) {
            throw new Error('A capture is already in progress - ignoring this call instead of letting it corrupt the other one\'s camera state.');
        }

        const cameras = findCameras().filter((cam) => cam.enabled && isActiveInHierarchy(cam.node));
        pruneResourceCache(new Set(cameras.map((cam) => cam.node.uuid)));
        if (!cameras.length) return { cameras: [], markers: [] };

        capturing = true;
        try {
            const design = view.getDesignResolutionSize();
            const longSide = Math.max(design.width, design.height, 1);
            const scale = Math.min(1, maxSize / longSide);
            // RenderTexture is capped at 2048x2048 by the engine.
            const width = Math.min(2048, Math.max(1, Math.round(design.width * scale)));
            const height = Math.min(2048, Math.max(1, Math.round(design.height * scale)));

            const results: CapturedCamera[] = [];

            for (const cam of cameras) {
                const res = getResources(cam, width, height);

                if (!res.warmedUp) {
                    // First time this camera's render target is set up - give it a couple of
                    // extra frames before trusting the output. This is the same fix as "toggle
                    // the node off/on", just done automatically instead of by hand.
                    await forceRenderFrame();
                    await forceRenderFrame();
                    res.warmedUp = true;
                }

                await forceRenderFrame();

                const pixels = res.rt.readPixels(0, 0, width, height, res.raw);
                if (pixels) {
                    flipRowsInto(pixels, res.imageData.data, width, height);
                    res.ctx.putImageData(res.imageData, 0, 0);
                    results.push({
                        uuid: cam.node.uuid,
                        name: cam.node.name,
                        priority: cam.priority,
                        visibility: cam.visibility,
                        width,
                        height,
                        dataUrl: res.canvas.toDataURL('image/png'),
                    });
                }
            }

            results.sort((a, b) => a.priority - b.priority);

            // Must happen before targetTexture gets reassigned/reset elsewhere - it relies on
            // each camera's worldToScreen() still projecting into this capture's coordinates.
            const markers = computeSelectionMarkers(cameras, width, height);

            return { cameras: results, markers };
        } finally {
            capturing = false;
        }
    },
};

export function load() { }

export function unload() {
    for (const res of resourceCache.values()) destroyResources(res);
    resourceCache.clear();
}
