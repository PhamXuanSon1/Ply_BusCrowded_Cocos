"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.methods = void 0;
exports.load = load;
exports.unload = unload;
// This file is a Cocos Creator "scene script" (registered via package.json ->
// contributions.scene.script). Unlike source/panels/**/*.ts (which run in the panel's own
// Node/webview process and have no engine access), a scene script runs inside the Scene
// process itself, which has the actual running `cc` engine loaded - that's what lets it walk
// the live node tree and read camera pixels. The panel calls the exported `methods` below via:
//   Editor.Message.request('scene', 'execute-scene-script', { name: packageJSON.name, method, args })
const cc_1 = require("cc");
const path_1 = require("path");
// `cc` isn't in this extension's own node_modules - it's provided by the running Editor/Scene
// process at runtime. Without this, `require('cc')` (what the `import` above compiles to)
// would fail to resolve even though it type-checks fine against @cocos/creator-types/engine.
module.paths.push((0, path_1.join)(Editor.App.path, 'node_modules'));
/**
 * Forces the director through one update+render pass right now via `director.tick()`, instead
 * of passively waiting for the natural (rAF-driven) loop to eventually get around to it. The
 * Editor pauses/throttles that natural loop when the Scene view isn't the focused/visible tab
 * - which is exactly the situation when someone's looking at this panel instead of Scene - so
 * passively waiting on Director.EVENT_AFTER_RENDER could hang indefinitely. Still guarded by a
 * timeout as a last resort in case `tick()` itself doesn't synchronously fire the event.
 */
function forceRenderFrame(timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
        let done = false;
        const timer = setTimeout(() => {
            if (done)
                return;
            done = true;
            reject(new Error('Timed out waiting for the Scene to render a frame.'));
        }, timeoutMs);
        cc_1.director.once(cc_1.Director.EVENT_AFTER_RENDER, () => {
            if (done)
                return;
            done = true;
            clearTimeout(timer);
            resolve();
        });
        cc_1.director.tick(1 / 60);
    });
}
/**
 * `node.activeInHierarchy` is a cached/lazily-recomputed flag - in edit mode (as opposed to
 * Play) that cache doesn't always get refreshed right after a scene loads or a node's active
 * state is changed some other way, which showed up as "camera isn't detected until you toggle
 * it off and on". Walking `.active` (a plain, always-live flag) up the parent chain ourselves
 * sidesteps that cache entirely.
 */
function isActiveInHierarchy(node) {
    for (let n = node; n; n = n.parent) {
        if (!n.active)
            return false;
    }
    return true;
}
/** True if this node (or an ancestor) is one of the Editor's own internal/gizmo nodes - these
 * are hidden from the Hierarchy panel but still real nodes a raw component walk will find. */
function isHiddenInHierarchy(node) {
    for (let n = node; n; n = n.parent) {
        if (n.hideFlags & cc_1.CCObject.Flags.HideInHierarchy)
            return true;
    }
    return false;
}
function findCameras() {
    const scene = cc_1.director.getScene();
    if (!scene)
        return [];
    const seen = new Set();
    return scene.getComponentsInChildren(cc_1.Camera).filter((cam) => {
        if (!isHiddenInHierarchy(cam.node))
            return false;
        // Defensive de-dupe: a camera node reached through more than one path (e.g. a prefab
        // wrapper) would otherwise get captured/listed twice.
        if (seen.has(cam.node.uuid))
            return false;
        seen.add(cam.node.uuid);
        return true;
    });
}
const resourceCache = new Map();
function createResources(cam, width, height) {
    const rt = new cc_1.RenderTexture();
    rt.reset({ width, height });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const res = {
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
function destroyResources(res) {
    try {
        res.cam.targetTexture = res.originalTarget;
    }
    catch (err) {
        console.warn(`[game_view] failed to restore targetTexture on "${res.cam.node.name}":`, err);
    }
    res.rt.destroy();
}
function getResources(cam, width, height) {
    const uuid = cam.node.uuid;
    const existing = resourceCache.get(uuid);
    if (existing && existing.width === width && existing.height === height) {
        return existing;
    }
    if (existing)
        destroyResources(existing);
    const res = createResources(cam, width, height);
    resourceCache.set(uuid, res);
    return res;
}
/** Restores + frees resources for any cached camera that isn't in this capture's camera list
 *  anymore (deleted/disabled/renamed away) - keeps its real render target working again. */
function pruneResourceCache(keepUuids) {
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
function invalidateResources(uuid) {
    const res = resourceCache.get(uuid);
    if (!res)
        return;
    res.rt.destroy();
    resourceCache.delete(uuid);
}
/** Turns a node off then back on - the manual fix for a camera's first render coming out
 *  blank/stale (see captureCameras' warm-up) turned into something we can trigger ourselves. */
async function toggleNode(node) {
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
function flipRowsInto(src, dst, width, height) {
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
exports.methods = {
    /** Lists every Camera component in the scene, without capturing anything (cheap). */
    async listCameras() {
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
    async refreshCamera(uuid) {
        const cam = findCameras().find((c) => c.node.uuid === uuid);
        if (!cam)
            return;
        await toggleNode(cam.node);
        invalidateResources(uuid);
    },
    /**
     * Toggles every capturable camera off then on, in ascending priority order (the same order
     * they get composited in) - run once when Live mode starts so every camera shows correctly
     * from the very first capture instead of needing to be touched by hand first.
     */
    async refreshAllCameras() {
        const cameras = findCameras()
            .filter((cam) => cam.enabled && isActiveInHierarchy(cam.node))
            .sort((a, b) => -a.priority + b.priority);
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
    async captureCameras(maxSize = 1024) {
        if (capturing) {
            throw new Error('A capture is already in progress - ignoring this call instead of letting it corrupt the other one\'s camera state.');
        }
        const cameras = findCameras().filter((cam) => cam.enabled && isActiveInHierarchy(cam.node));
        pruneResourceCache(new Set(cameras.map((cam) => cam.node.uuid)));
        if (!cameras.length)
            return [];
        capturing = true;
        try {
            const design = cc_1.view.getDesignResolutionSize();
            const longSide = Math.max(design.width, design.height, 1);
            const scale = Math.min(1, maxSize / longSide);
            // RenderTexture is capped at 2048x2048 by the engine.
            const width = Math.min(2048, Math.max(1, Math.round(design.width * scale)));
            const height = Math.min(2048, Math.max(1, Math.round(design.height * scale)));
            const results = [];
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
            return results;
        }
        finally {
            capturing = false;
        }
    },
};
function load() { }
function unload() {
    for (const res of resourceCache.values())
        destroyResources(res);
    resourceCache.clear();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2Uvc2NlbmUvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBc1VBLG9CQUEwQjtBQUUxQix3QkFHQztBQTNVRCw4RUFBOEU7QUFDOUUsMEZBQTBGO0FBQzFGLHdGQUF3RjtBQUN4Riw2RkFBNkY7QUFDN0YsK0ZBQStGO0FBQy9GLHNHQUFzRztBQUN0RywyQkFBcUY7QUFDckYsK0JBQTRCO0FBRTVCLDhGQUE4RjtBQUM5RiwwRkFBMEY7QUFDMUYsNkZBQTZGO0FBQzdGLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUEsV0FBSSxFQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUM7QUF1QnpEOzs7Ozs7O0dBT0c7QUFDSCxTQUFTLGdCQUFnQixDQUFDLFNBQVMsR0FBRyxJQUFJO0lBQ3RDLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7UUFDbkMsSUFBSSxJQUFJLEdBQUcsS0FBSyxDQUFDO1FBQ2pCLE1BQU0sS0FBSyxHQUFHLFVBQVUsQ0FBQyxHQUFHLEVBQUU7WUFDMUIsSUFBSSxJQUFJO2dCQUFFLE9BQU87WUFDakIsSUFBSSxHQUFHLElBQUksQ0FBQztZQUNaLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxvREFBb0QsQ0FBQyxDQUFDLENBQUM7UUFDNUUsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBRWQsYUFBUSxDQUFDLElBQUksQ0FBQyxhQUFRLENBQUMsa0JBQWtCLEVBQUUsR0FBRyxFQUFFO1lBQzVDLElBQUksSUFBSTtnQkFBRSxPQUFPO1lBQ2pCLElBQUksR0FBRyxJQUFJLENBQUM7WUFDWixZQUFZLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDcEIsT0FBTyxFQUFFLENBQUM7UUFDZCxDQUFDLENBQUMsQ0FBQztRQUVILGFBQVEsQ0FBQyxJ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RyxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztvQkFDMUMsT0FBTyxDQUFDLElBQUksQ0FBQzt3QkFDVCxJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJO3dCQUNuQixJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJO3dCQUNuQixRQUFRLEVBQUUsR0FBRyxDQUFDLFFBQVE7d0JBQ3RCLFVBQVUsRUFBRSxHQUFHLENBQUMsVUFBVTt3QkFDMUIsS0FBSzt3QkFDTCxNQUFNO3dCQUNOLE9BQU8sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUM7cUJBQzdDLENBQUMsQ0FBQztnQkFDUCxDQUFDO1lBQ0wsQ0FBQztZQUVELE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxHQUFHLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUNoRCxPQUFPLE9BQU8sQ0FBQztRQUNuQixDQUFDO2dCQUFTLENBQUM7WUFDUCxTQUFTLEdBQUcsS0FBSyxDQUFDO1FBQ3RCLENBQUM7SUFDTCxDQUFDO0NBQ0osQ0FBQztBQUVGLFNBQWdCLElBQUksS0FBSyxDQUFDO0FBRTFCLFNBQWdCLE1BQU07SUFDbEIsS0FBSyxNQUFNLEdBQUcsSUFBSSxhQUFhLENBQUMsTUFBTSxFQUFFO1FBQUUsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDaEUsYUFBYSxDQUFDLEtBQUssRUFBRSxDQUFDO0FBQzFCLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBUaGlzIGZpbGUgaXMgYSBDb2NvcyBDcmVhdG9yIFwic2NlbmUgc2NyaXB0XCIgKHJlZ2lzdGVyZWQgdmlhIHBhY2thZ2UuanNvbiAtPlxyXG4vLyBjb250cmlidXRpb25zLnNjZW5lLnNjcmlwdCkuIFVubGlrZSBzb3VyY2UvcGFuZWxzLyoqLyoudHMgKHdoaWNoIHJ1biBpbiB0aGUgcGFuZWwncyBvd25cclxuLy8gTm9kZS93ZWJ2aWV3IHByb2Nlc3MgYW5kIGhhdmUgbm8gZW5naW5lIGFjY2VzcyksIGEgc2NlbmUgc2NyaXB0IHJ1bnMgaW5zaWRlIHRoZSBTY2VuZVxyXG4vLyBwcm9jZXNzIGl0c2VsZiwgd2hpY2ggaGFzIHRoZSBhY3R1YWwgcnVubmluZyBgY2NgIGVuZ2luZSBsb2FkZWQgLSB0aGF0J3Mgd2hhdCBsZXRzIGl0IHdhbGtcclxuLy8gdGhlIGxpdmUgbm9kZSB0cmVlIGFuZCByZWFkIGNhbWVyYSBwaXhlbHMuIFRoZSBwYW5lbCBjYWxscyB0aGUgZXhwb3J0ZWQgYG1ldGhvZHNgIGJlbG93IHZpYTpcclxuLy8gICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdleGVjdXRlLXNjZW5lLXNjcmlwdCcsIHsgbmFtZTogcGFja2FnZUpTT04ubmFtZSwgbWV0aG9kLCBhcmdzIH0pXHJcbmltcG9ydCB7IENhbWVyYSwgQ0NPYmplY3QsIGRpcmVjdG9yLCBEaXJlY3RvciwgTm9kZSwgUmVuZGVyVGV4dHVyZSwgdmlldyB9IGZyb20gJ2NjJztcclxuaW1wb3J0IHsgam9pbiB9IGZyb20gJ3BhdGgnO1xyXG5cclxuLy8gYGNjYCBpc24ndCBpbiB0aGlzIGV4dGVuc2lvbidzIG93biBub2RlX21vZHVsZXMgLSBpdCdzIHByb3ZpZGVkIGJ5IHRoZSBydW5uaW5nIEVkaXRvci9TY2VuZVxyXG4vLyBwcm9jZXNzIGF0IHJ1bnRpbWUuIFdpdGhvdXQgdGhpcywgYHJlcXVpcmUoJ2NjJylgICh3aGF0IHRoZSBgaW1wb3J0YCBhYm92ZSBjb21waWxlcyB0bylcclxuLy8gd291bGQgZmFpbCB0byByZXNvbHZlIGV2ZW4gdGhvdWdoIGl0IHR5cGUtY2hlY2tzIGZpbmUgYWdhaW5zdCBAY29jb3MvY3JlYXRvci10eXBlcy9lbmdpbmUuXHJcbm1vZHVsZS5wYXRocy5wdXNoKGpvaW4oRWRpdG9yLkFwcC5wYXRoLCAnbm9kZV9tb2R1bGVzJykpO1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBDYXB0dXJlZENhbWVyYSB7XHJcbiAgICB1dWlkOiBzdHJpbmc7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwcmlvcml0eTogbnVtYmVyO1xyXG4gICAgdmlzaWJpbGl0eTogbnVtYmVyO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgLyoqIGRhdGE6aW1hZ2UvcG5nO2Jhc2U2NCwuLi4gLSBhIHBsYWluIHN0cmluZyBpcyB3aGF0IGFjdHVhbGx5IGNyb3NzZXMgdGhlXHJcbiAgICAgKiAgZXhlY3V0ZS1zY2VuZS1zY3JpcHQgYnJpZGdlIGNsZWFubHkgKGl0IGFwcGVhcnMgdG8gc2VyaWFsaXplIHRocm91Z2ggSlNPTiwgbm90IGFcclxuICAgICAqICBzdHJ1Y3R1cmVkIGNsb25lIC0gYSByYXcgcGl4ZWwgVWludDhBcnJheSB0dXJucyBpbnRvIGEgZ2lhbnQsIHNsb3csIGFuZCBicm9rZW5cclxuICAgICAqICBge1wiMFwiOi4uLCBcIjFcIjouLiwgLi4ufWAgb2JqZWN0IG92ZXIgdGhhdCBicmlkZ2UpLiAqL1xyXG4gICAgZGF0YVVybDogc3RyaW5nO1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIENhbWVyYUluZm8ge1xyXG4gICAgdXVpZDogc3RyaW5nO1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgcHJpb3JpdHk6IG51bWJlcjtcclxuICAgIGVuYWJsZWQ6IGJvb2xlYW47XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBGb3JjZXMgdGhlIGRpcmVjdG9yIHRocm91Z2ggb25lIHVwZGF0ZStyZW5kZXIgcGFzcyByaWdodCBub3cgdmlhIGBkaXJlY3Rvci50aWNrKClgLCBpbnN0ZWFkXHJcbiAqIG9mIHBhc3NpdmVseSB3YWl0aW5nIGZvciB0aGUgbmF0dXJhbCAockFGLWRyaXZlbikgbG9vcCB0byBldmVudHVhbGx5IGdldCBhcm91bmQgdG8gaXQuIFRoZVxyXG4gKiBFZGl0b3IgcGF1c2VzL3Rocm90dGxlcyB0aGF0IG5hdHVyYWwgbG9vcCB3aGVuIHRoZSBTY2VuZSB2aWV3IGlzbid0IHRoZSBmb2N1c2VkL3Zpc2libGUgdGFiXHJcbiAqIC0gd2hpY2ggaXMgZXhhY3RseSB0aGUgc2l0dWF0aW9uIHdoZW4gc29tZW9uZSdzIGxvb2tpbmcgYXQgdGhpcyBwYW5lbCBpbnN0ZWFkIG9mIFNjZW5lIC0gc29cclxuICogcGFzc2l2ZWx5IHdhaXRpbmcgb24gRGlyZWN0b3IuRVZFTlRfQUZURVJfUkVOREVSIGNvdWxkIGhhbmcgaW5kZWZpbml0ZWx5LiBTdGlsbCBndWFyZGVkIGJ5IGFcclxuICogdGltZW91dCBhcyBhIGxhc3QgcmVzb3J0IGluIGNhc2UgYHRpY2soKWAgaXRzZWxmIGRvZXNuJ3Qgc3luY2hyb25vdXNseSBmaXJlIHRoZSBldmVudC5cclxuICovXHJcbmZ1bmN0aW9uIGZvcmNlUmVuZGVyRnJhbWUodGltZW91dE1zID0gMzAwMCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICBsZXQgZG9uZSA9IGZhbHNlO1xyXG4gICAgICAgIGNvbnN0IHRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChkb25lKSByZXR1cm47XHJcbiAgICAgICAgICAgIGRvbmUgPSB0cnVlO1xyXG4gICAgICAgICAgICByZWplY3QobmV3IEVycm9yKCdUaW1lZCBvdXQgd2FpdGluZyBmb3IgdGhlIFNjZW5lIHRvIHJlbmRlciBhIGZyYW1lLicpKTtcclxuICAgICAgICB9LCB0aW1lb3V0TXMpO1xyXG5cclxuICAgICAgICBkaXJlY3Rvci5vbmNlKERpcmVjdG9yLkVWRU5UX0FGVEVSX1JFTkRFUiwgKCkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoZG9uZSkgcmV0dXJuO1xyXG4gICAgICAgICAgICBkb25lID0gdHJ1ZTtcclxuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVyKTtcclxuICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBkaXJlY3Rvci50aWNrKDEgLyA2MCk7XHJcbiAgICB9KTtcclxufVxyXG5cclxuLyoqXHJcbiAqIGBub2RlLmFjdGl2ZUluSGllcmFyY2h5YCBpcyBhIGNhY2hlZC9sYXppbHktcmVjb21wdXRlZCBmbGFnIC0gaW4gZWRpdCBtb2RlIChhcyBvcHBvc2VkIHRvXHJcbiAqIFBsYXkpIHRoYXQgY2FjaGUgZG9lc24ndCBhbHdheXMgZ2V0IHJlZnJlc2hlZCByaWdodCBhZnRlciBhIHNjZW5lIGxvYWRzIG9yIGEgbm9kZSdzIGFjdGl2ZVxyXG4gKiBzdGF0ZSBpcyBjaGFuZ2VkIHNvbWUgb3RoZXIgd2F5LCB3aGljaCBzaG93ZWQgdXAgYXMgXCJjYW1lcmEgaXNuJ3QgZGV0ZWN0ZWQgdW50aWwgeW91IHRvZ2dsZVxyXG4gKiBpdCBvZmYgYW5kIG9uXCIuIFdhbGtpbmcgYC5hY3RpdmVgIChhIHBsYWluLCBhbHdheXMtbGl2ZSBmbGFnKSB1cCB0aGUgcGFyZW50IGNoYWluIG91cnNlbHZlc1xyXG4gKiBzaWRlc3RlcHMgdGhhdCBjYWNoZSBlbnRpcmVseS5cclxuICovXHJcbmZ1bmN0aW9uIGlzQWN0aXZlSW5IaWVyYXJjaHkobm9kZTogTm9kZSB8IG51bGwpOiBib29sZWFuIHtcclxuICAgIGZvciAobGV0IG4gPSBub2RlOyBuOyBuID0gbi5wYXJlbnQpIHtcclxuICAgICAgICBpZiAoIW4uYWN0aXZlKSByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdHJ1ZTtcclxufVxyXG5cclxuLyoqIFRydWUgaWYgdGhpcyBub2RlIChvciBhbiBhbmNlc3RvcikgaXMgb25lIG9mIHRoZSBFZGl0b3IncyBvd24gaW50ZXJuYWwvZ2l6bW8gbm9kZXMgLSB0aGVzZVxyXG4gKiBhcmUgaGlkZGVuIGZyb20gdGhlIEhpZXJhcmNoeSBwYW5lbCBidXQgc3RpbGwgcmVhbCBub2RlcyBhIHJhdyBjb21wb25lbnQgd2FsayB3aWxsIGZpbmQuICovXHJcbmZ1bmN0aW9uIGlzSGlkZGVuSW5IaWVyYXJjaHkobm9kZTogTm9kZSB8IG51bGwpOiBib29sZWFuIHtcclxuICAgIGZvciAobGV0IG4gPSBub2RlOyBuOyBuID0gbi5wYXJlbnQpIHtcclxuICAgICAgICBpZiAobi5oaWRlRmxhZ3MgJiBDQ09iamVjdC5GbGFncy5IaWRlSW5IaWVyYXJjaHkpIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG59XHJcblxyXG5mdW5jdGlvbiBmaW5kQ2FtZXJhcygpOiBDYW1lcmFbXSB7XHJcbiAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XHJcbiAgICBpZiAoIXNjZW5lKSByZXR1cm4gW107XHJcblxyXG4gICAgY29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xyXG4gICAgcmV0dXJuIHNjZW5lLmdldENvbXBvbmVudHNJbkNoaWxkcmVuKENhbWVyYSkuZmlsdGVyKChjYW0pID0+IHtcclxuICAgICAgICBpZiAoIWlzSGlkZGVuSW5IaWVyYXJjaHkoY2FtLm5vZGUpKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgLy8gRGVmZW5zaXZlIGRlLWR1cGU6IGEgY2FtZXJhIG5vZGUgcmVhY2hlZCB0aHJvdWdoIG1vcmUgdGhhbiBvbmUgcGF0aCAoZS5nLiBhIHByZWZhYlxyXG4gICAgICAgIC8vIHdyYXBwZXIpIHdvdWxkIG90aGVyd2lzZSBnZXQgY2FwdHVyZWQvbGlzdGVkIHR3aWNlLlxyXG4gICAgICAgIGlmIChzZWVuLmhhcyhjYW0ubm9kZS51dWlkKSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIHNlZW4uYWRkKGNhbS5ub2RlLnV1aWQpO1xyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfSk7XHJcbn1cclxuXHJcbi8vIC0tLSBQZXItY2FtZXJhIGNhcHR1cmUgcmVzb3VyY2VzLCByZXVzZWQgYWNyb3NzIGNhbGxzIGluc3RlYWQgb2YgYWxsb2NhdGVkIGV2ZXJ5IHRpY2sgLS0tLS1cclxuLy8gTGl2ZSBtb2RlIHBvbGxzIHRoaXMgcmVwZWF0ZWRseSAoZXZlcnkgfjUwMG1zKS4gVHdvIHRoaW5ncyBhcmUgY2FjaGVkIHBlciBjYW1lcmEgKGJ5IG5vZGVcclxuLy8gdXVpZCkgZm9yIHRoZSBsaWZldGltZSBvZiB0aGF0IGNhbWVyYSBiZWluZyBjYXB0dXJlZDpcclxuLy8gIC0gVGhlIFJlbmRlclRleHR1cmUvcGl4ZWwgYnVmZmVycy9jYW52YXM6IHJlY3JlYXRpbmcgYSBHUFUgcmVzb3VyY2UgYW5kIGZyZXNoIGJ1ZmZlcnMgZXZlcnlcclxuLy8gICAgc2luZ2xlIHRpY2sgaXMgd2FzdGVmdWwgY2h1cm4uXHJcbi8vICAtIGBjYW0udGFyZ2V0VGV4dHVyZWAgaXRzZWxmIGlzIGFzc2lnbmVkIE9OQ0UgYW5kIGxlZnQgcG9pbnRlZCBhdCBvdXIgUmVuZGVyVGV4dHVyZSBmb3IgYXNcclxuLy8gICAgbG9uZyBhcyB3ZSBrZWVwIGNhcHR1cmluZyB0aGF0IGNhbWVyYSwgaW5zdGVhZCBvZiBiZWluZyBzZXQgdGhlbiByZXNldCBiYWNrIHRvIG5vcm1hbFxyXG4vLyAgICBldmVyeSBzaW5nbGUgdGljay4gUmVwZWF0ZWRseSByZWF0dGFjaGluZyBhIGNhbWVyYSdzIHJlbmRlciB0YXJnZXQgdHVybmVkIG91dCB0byBiZSB3aHlcclxuLy8gICAgdGhlIHZlcnkgZmlyc3QgY2FwdHVyZSBvZiBhIGNhbWVyYSBjYW1lIG91dCBibGFuayB1bnRpbCB5b3UgdG9nZ2xlZCB0aGUgbm9kZSBvZmYvb24gaW5cclxuLy8gICAgdGhlIEhpZXJhcmNoeSAod2hpY2ggZm9yY2VzIHRoZSBzYW1lIGtpbmQgb2YgcmUtc2V0dXApIC0gYW5kIGNhdXNlZCBhIHZpc2libGUgZmxhc2ggZWFjaFxyXG4vLyAgICB0aWNrIGluIHRoZSByZWFsIFNjZW5lIHZpZXcgYmVzaWRlcy4gSXQncyByZXN0b3JlZCB0byB0aGUgY2FtZXJhJ3Mgb3JpZ2luYWwgdGV4dHVyZSBvbmx5XHJcbi8vICAgIHdoZW4gdGhhdCBjYW1lcmEgc3RvcHMgYmVpbmcgY2FwdHVyZWQgKHNlZSBwcnVuZS91bmxvYWQgYmVsb3cpLlxyXG5pbnRlcmZhY2UgQ2FtZXJhUmVzb3VyY2VzIHtcclxuICAgIGNhbTogQ2FtZXJhO1xyXG4gICAgb3JpZ2luYWxUYXJnZXQ6IFJlbmRlclRleHR1cmUgfCBudWxsO1xyXG4gICAgcnQ6IFJlbmRlclRleHR1cmU7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICByYXc6IFVpbnQ4QXJyYXk7ICAgICAgICAvLyBzY3JhdGNoIGZvciByZWFkUGl4ZWxzJyBHTCByb3cgb3JkZXIgKGJvdHRvbS10by10b3ApXHJcbiAgICBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XHJcbiAgICBpbWFnZURhdGE6IEltYWdlRGF0YTsgICAvLyB0b3AtdG8tYm90dG9tLCByZWZpbGxlZCBpbiBwbGFjZSBlYWNoIGNhcHR1cmVcclxuICAgIHdhcm1lZFVwOiBib29sZWFuO1xyXG59XHJcblxyXG5jb25zdCByZXNvdXJjZUNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIENhbWVyYVJlc291cmNlcz4oKTtcclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZVJlc291cmNlcyhjYW06IENhbWVyYSwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiBDYW1lcmFSZXNvdXJjZXMge1xyXG4gICAgY29uc3QgcnQgPSBuZXcgUmVuZGVyVGV4dHVyZSgpO1xyXG4gICAgcnQucmVzZXQoeyB3aWR0aCwgaGVpZ2h0IH0pO1xyXG5cclxuICAgIGNvbnN0IGNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpO1xyXG4gICAgY2FudmFzLndpZHRoID0gd2lkdGg7XHJcbiAgICBjYW52YXMuaGVpZ2h0ID0gaGVpZ2h0O1xyXG4gICAgY29uc3QgY3R4ID0gY2FudmFzLmdldENvbnRleHQoJzJkJykhO1xyXG5cclxuICAgIGNvbnN0IHJlczogQ2FtZXJhUmVzb3VyY2VzID0ge1xyXG4gICAgICAgIGNhbSxcclxuICAgICAgICBvcmlnaW5hbFRhcmdldDogY2FtLnRhcmdldFRleHR1cmUsXHJcbiAgICAgICAgcnQsXHJcbiAgICAgICAgd2lkdGgsXHJcbiAgICAgICAgaGVpZ2h0LFxyXG4gICAgICAgIHJhdzogbmV3IFVpbnQ4QXJyYXkod2lkdGggKiBoZWlnaHQgKiA0KSxcclxuICAgICAgICBjYW52YXMsXHJcbiAgICAgICAgY3R4LFxyXG4gICAgICAgIGltYWdlRGF0YTogY3R4LmNyZWF0ZUltYWdlRGF0YSh3aWR0aCwgaGVpZ2h0KSxcclxuICAgICAgICB3YXJtZWRVcDogZmFsc2UsXHJcbiAgICB9O1xyXG4gICAgY2FtLnRhcmdldFRleHR1cmUgPSBydDtcclxuICAgIHJldHVybiByZXM7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRlc3Ryb3lSZXNvdXJjZXMocmVzOiBDYW1lcmFSZXNvdXJjZXMpIHtcclxuICAgIHRyeSB7IHJlcy5jYW0udGFyZ2V0VGV4dHVyZSA9IHJlcy5vcmlnaW5hbFRhcmdldDsgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgICAgY29uc29sZS53YXJuKGBbZ2FtZV92aWV3XSBmYWlsZWQgdG8gcmVzdG9yZSB0YXJnZXRUZXh0dXJlIG9uIFwiJHtyZXMuY2FtLm5vZGUubmFtZX1cIjpgLCBlcnIpO1xyXG4gICAgfVxyXG4gICAgcmVzLnJ0LmRlc3Ryb3koKTtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0UmVzb3VyY2VzKGNhbTogQ2FtZXJhLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IENhbWVyYVJlc291cmNlcyB7XHJcbiAgICBjb25zdCB1dWlkID0gY2FtLm5vZGUudXVpZDtcclxuICAgIGNvbnN0IGV4aXN0aW5nID0gcmVzb3VyY2VDYWNoZS5nZXQodXVpZCk7XHJcbiAgICBpZiAoZXhpc3RpbmcgJiYgZXhpc3Rpbmcud2lkdGggPT09IHdpZHRoICYmIGV4aXN0aW5nLmhlaWdodCA9PT0gaGVpZ2h0KSB7XHJcbiAgICAgICAgcmV0dXJuIGV4aXN0aW5nO1xyXG4gICAgfVxyXG4gICAgaWYgKGV4aXN0aW5nKSBkZXN0cm95UmVzb3VyY2VzKGV4aXN0aW5nKTtcclxuXHJcbiAgICBjb25zdCByZXMgPSBjcmVhdGVSZXNvdXJjZXMoY2FtLCB3aWR0aCwgaGVpZ2h0KTtcclxuICAgIHJlc291cmNlQ2FjaGUuc2V0KHV1aWQsIHJlcyk7XHJcbiAgICByZXR1cm4gcmVzO1xyXG59XHJcblxyXG4vKiogUmVzdG9yZXMgKyBmcmVlcyByZXNvdXJjZXMgZm9yIGFueSBjYWNoZWQgY2FtZXJhIHRoYXQgaXNuJ3QgaW4gdGhpcyBjYXB0dXJlJ3MgY2FtZXJhIGxpc3RcclxuICogIGFueW1vcmUgKGRlbGV0ZWQvZGlzYWJsZWQvcmVuYW1lZCBhd2F5KSAtIGtlZXBzIGl0cyByZWFsIHJlbmRlciB0YXJnZXQgd29ya2luZyBhZ2Fpbi4gKi9cclxuZnVuY3Rpb24gcHJ1bmVSZXNvdXJjZUNhY2hlKGtlZXBVdWlkczogU2V0PHN0cmluZz4pIHtcclxuICAgIGZvciAoY29uc3QgW3V1aWQsIHJlc10gb2YgcmVzb3VyY2VDYWNoZSkge1xyXG4gICAgICAgIGlmICgha2VlcFV1aWRzLmhhcyh1dWlkKSkge1xyXG4gICAgICAgICAgICBkZXN0cm95UmVzb3VyY2VzKHJlcyk7XHJcbiAgICAgICAgICAgIHJlc291cmNlQ2FjaGUuZGVsZXRlKHV1aWQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIERyb3BzIGEgY2FtZXJhJ3MgY2FjaGVkIHJlc291cmNlcyBXSVRIT1VUIHRyeWluZyB0byByZXN0b3JlIGl0cyB0YXJnZXRUZXh0dXJlIG91cnNlbHZlcyAtXHJcbiAqIHRvZ2dsaW5nIHRoZSBub2RlJ3MgYWN0aXZlIHN0YXRlIChzZWUgcmVmcmVzaENhbWVyYS9yZWZyZXNoQWxsQ2FtZXJhcyBiZWxvdykgYWxyZWFkeSByZXNldHNcclxuICogdGhlIGNhbWVyYSB0aHJvdWdoIGl0cyBub3JtYWwgb25EaXNhYmxlL29uRW5hYmxlIGxpZmVjeWNsZSwgd2hpY2ggcHV0cyB0YXJnZXRUZXh0dXJlIGJhY2sgdG9cclxuICogd2hhdGV2ZXIgaXQncyBtZWFudCB0byBkZWZhdWx0IHRvIG9uIGl0cyBvd24uIFRoZSBuZXh0IGNhcHR1cmVDYW1lcmFzKCkgY2FsbCB3aWxsIGNhbGxcclxuICogY3JlYXRlUmVzb3VyY2VzKCkgYWdhaW4sIHNuYXBzaG90IGEgZnJlc2ggYG9yaWdpbmFsVGFyZ2V0YCwgYW5kIHJlYXNzaWduIG91ciBSZW5kZXJUZXh0dXJlLlxyXG4gKi9cclxuZnVuY3Rpb24gaW52YWxpZGF0ZVJlc291cmNlcyh1dWlkOiBzdHJpbmcpIHtcclxuICAgIGNvbnN0IHJlcyA9IHJlc291cmNlQ2FjaGUuZ2V0KHV1aWQpO1xyXG4gICAgaWYgKCFyZXMpIHJldHVybjtcclxuICAgIHJlcy5ydC5kZXN0cm95KCk7XHJcbiAgICByZXNvdXJjZUNhY2hlLmRlbGV0ZSh1dWlkKTtcclxufVxyXG5cclxuLyoqIFR1cm5zIGEgbm9kZSBvZmYgdGhlbiBiYWNrIG9uIC0gdGhlIG1hbnVhbCBmaXggZm9yIGEgY2FtZXJhJ3MgZmlyc3QgcmVuZGVyIGNvbWluZyBvdXRcclxuICogIGJsYW5rL3N0YWxlIChzZWUgY2FwdHVyZUNhbWVyYXMnIHdhcm0tdXApIHR1cm5lZCBpbnRvIHNvbWV0aGluZyB3ZSBjYW4gdHJpZ2dlciBvdXJzZWx2ZXMuICovXHJcbmFzeW5jIGZ1bmN0aW9uIHRvZ2dsZU5vZGUobm9kZTogTm9kZSkge1xyXG4gICAgLy8gbm9kZS5hY3RpdmUgPSAhbm9kZS5hY3RpdmU7XHJcbiAgICBub2RlLmFjdGl2ZSA9IGZhbHNlO1xyXG4gICAgbm9kZS5hY3RpdmUgPSB0cnVlO1xyXG4gICAgYXdhaXQgZm9yY2VSZW5kZXJGcmFtZSgpO1xyXG4gICAgYXdhaXQgZm9yY2VSZW5kZXJGcmFtZSgpO1xyXG4gICAgLy8gbm9kZS5hY3RpdmUgPSAhbm9kZS5hY3RpdmU7XHJcbiAgICAvLyBkaXJlY3Rvci50aWNrKDEpO1xyXG4gICAgLy8gZGlyZWN0b3Iub25jZShEaXJlY3Rvci5FVkVOVF9BRlRFUl9VUERBVEUsICgpID0+IG5vZGUuYWN0aXZlID0gdHJ1ZSk7XHJcbn1cclxuXHJcbi8qKiByZWFkUGl4ZWxzKCkgcmV0dXJucyBHTC1jb252ZW50aW9uIHJvd3MgKGJvdHRvbS10by10b3ApOyBJbWFnZURhdGEgd2FudHMgdG9wLXRvLWJvdHRvbS4gKi9cclxuZnVuY3Rpb24gZmxpcFJvd3NJbnRvKHNyYzogVWludDhBcnJheSwgZHN0OiBVaW50OENsYW1wZWRBcnJheSwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpIHtcclxuICAgIGNvbnN0IHJvd0J5dGVzID0gd2lkdGggKiA0O1xyXG4gICAgZm9yIChsZXQgeSA9IDA7IHkgPCBoZWlnaHQ7IHkrKykge1xyXG4gICAgICAgIGNvbnN0IHNyY1N0YXJ0ID0gKGhlaWdodCAtIDEgLSB5KSAqIHJvd0J5dGVzO1xyXG4gICAgICAgIGRzdC5zZXQoc3JjLnN1YmFycmF5KHNyY1N0YXJ0LCBzcmNTdGFydCArIHJvd0J5dGVzKSwgeSAqIHJvd0J5dGVzKTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gR3VhcmRzIGFnYWluc3QgdHdvIGNhcHR1cmVDYW1lcmFzKCkgY2FsbHMgcnVubmluZyBhdCBvbmNlIChlLmcuIGEgTGl2ZS1tb2RlIHRpY2sgZmlyaW5nXHJcbi8vIHdoaWxlIGEgcHJldmlvdXMsIHNsb3cvc3RhbGxlZCBjYWxsIGlzIHN0aWxsIGluIGZsaWdodCkgLSBvdmVybGFwcGluZyBjYWxscyB3b3VsZCBvdGhlcndpc2VcclxuLy8gc3RlcCBvbiBlYWNoIG90aGVyJ3MgdXNlIG9mIHRoZSAobm93IHBlcnNpc3RlbnRseS1hc3NpZ25lZCkgY2FwdHVyZSBSZW5kZXJUZXh0dXJlcy5cclxubGV0IGNhcHR1cmluZyA9IGZhbHNlO1xyXG5cclxuZXhwb3J0IGNvbnN0IG1ldGhvZHMgPSB7XHJcbiAgICAvKiogTGlzdHMgZXZlcnkgQ2FtZXJhIGNvbXBvbmVudCBpbiB0aGUgc2NlbmUsIHdpdGhvdXQgY2FwdHVyaW5nIGFueXRoaW5nIChjaGVhcCkuICovXHJcbiAgICBhc3luYyBsaXN0Q2FtZXJhcygpOiBQcm9taXNlPENhbWVyYUluZm9bXT4ge1xyXG4gICAgICAgIHJldHVybiBmaW5kQ2FtZXJhcygpLm1hcCgoY2FtKSA9PiAoe1xyXG4gICAgICAgICAgICB1dWlkOiBjYW0ubm9kZS51dWlkLFxyXG4gICAgICAgICAgICBuYW1lOiBjYW0ubm9kZS5uYW1lLFxyXG4gICAgICAgICAgICBwcmlvcml0eTogY2FtLnByaW9yaXR5LFxyXG4gICAgICAgICAgICBlbmFibGVkOiBjYW0uZW5hYmxlZCAmJiBpc0FjdGl2ZUluSGllcmFyY2h5KGNhbS5ub2RlKSxcclxuICAgICAgICB9KSk7XHJcbiAgICB9LFxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVG9nZ2xlcyBvbmUgY2FtZXJhJ3Mgbm9kZSBvZmYgdGhlbiBvbiAoc2VlIHRvZ2dsZU5vZGUpIC0gdHJpZ2dlcmFibGUgYnkgaGFuZCBmcm9tIHRoZVxyXG4gICAgICogcGFuZWwgKGNsaWNraW5nIHRoYXQgY2FtZXJhJ3Mgcm93KSB0byBmb3JjZSBpdHMgbmV4dCBjYXB0dXJlIHRvIGJlIGEgZnJlc2gsIGNvcnJlY3Qgb25lLlxyXG4gICAgICovXHJcbiAgICBhc3luYyByZWZyZXNoQ2FtZXJhKHV1aWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIGNvbnN0IGNhbSA9IGZpbmRDYW1lcmFzKCkuZmluZCgoYykgPT4gYy5ub2RlLnV1aWQgPT09IHV1aWQpO1xyXG4gICAgICAgIGlmICghY2FtKSByZXR1cm47XHJcbiAgICAgICAgYXdhaXQgdG9nZ2xlTm9kZShjYW0ubm9kZSk7XHJcbiAgICAgICAgaW52YWxpZGF0ZVJlc291cmNlcyh1dWlkKTtcclxuICAgIH0sXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBUb2dnbGVzIGV2ZXJ5IGNhcHR1cmFibGUgY2FtZXJhIG9mZiB0aGVuIG9uLCBpbiBhc2NlbmRpbmcgcHJpb3JpdHkgb3JkZXIgKHRoZSBzYW1lIG9yZGVyXHJcbiAgICAgKiB0aGV5IGdldCBjb21wb3NpdGVkIGluKSAtIHJ1biBvbmNlIHdoZW4gTGl2ZSBtb2RlIHN0YXJ0cyBzbyBldmVyeSBjYW1lcmEgc2hvd3MgY29ycmVjdGx5XHJcbiAgICAgKiBmcm9tIHRoZSB2ZXJ5IGZpcnN0IGNhcHR1cmUgaW5zdGVhZCBvZiBuZWVkaW5nIHRvIGJlIHRvdWNoZWQgYnkgaGFuZCBmaXJzdC5cclxuICAgICAqL1xyXG4gICAgYXN5bmMgcmVmcmVzaEFsbENhbWVyYXMoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgY29uc3QgY2FtZXJhcyA9IGZpbmRDYW1lcmFzKClcclxuICAgICAgICAgICAgLmZpbHRlcigoY2FtKSA9PiBjYW0uZW5hYmxlZCAmJiBpc0FjdGl2ZUluSGllcmFyY2h5KGNhbS5ub2RlKSlcclxuICAgICAgICAgICAgLnNvcnQoKGEsIGIpID0+IC0gYS5wcmlvcml0eSArIGIucHJpb3JpdHkpO1xyXG5cclxuICAgICAgICBmb3IgKGNvbnN0IGNhbSBvZiBjYW1lcmFzKSB7XHJcbiAgICAgICAgICAgIGF3YWl0IHRvZ2dsZU5vZGUoY2FtLm5vZGUpO1xyXG4gICAgICAgICAgICBpbnZhbGlkYXRlUmVzb3VyY2VzKGNhbS5ub2RlLnV1aWQpO1xyXG4gICAgICAgIH1cclxuICAgIH0sXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDYXB0dXJlcyBldmVyeSBlbmFibGVkIENhbWVyYSBpbiB0aGUgc2NlbmUgdG8gaXRzIG93biBQTkcsIHNvcnRlZCBieSBwcmlvcml0eSBhc2NlbmRpbmdcclxuICAgICAqIChsb3dlc3QgZmlyc3QpIC0gdGhlIHNhbWUgb3JkZXIgQ29jb3MgaXRzZWxmIGNvbXBvc2l0ZXMgY2FtZXJhcyBpbiwgc28gdGhlIGNhbGxlciBjYW5cclxuICAgICAqIHJlcHJvZHVjZSB0aGUgZmluYWwgZ2FtZSB2aWV3IGJ5IGRyYXdpbmcgdGhlc2Ugb24gdG9wIG9mIGVhY2ggb3RoZXIgaW4gdGhhdCBvcmRlci5cclxuICAgICAqL1xyXG4gICAgYXN5bmMgY2FwdHVyZUNhbWVyYXMobWF4U2l6ZTogbnVtYmVyID0gMTAyNCk6IFByb21pc2U8Q2FwdHVyZWRDYW1lcmFbXT4ge1xyXG4gICAgICAgIGlmIChjYXB0dXJpbmcpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdBIGNhcHR1cmUgaXMgYWxyZWFkeSBpbiBwcm9ncmVzcyAtIGlnbm9yaW5nIHRoaXMgY2FsbCBpbnN0ZWFkIG9mIGxldHRpbmcgaXQgY29ycnVwdCB0aGUgb3RoZXIgb25lXFwncyBjYW1lcmEgc3RhdGUuJyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBjYW1lcmFzID0gZmluZENhbWVyYXMoKS5maWx0ZXIoKGNhbSkgPT4gY2FtLmVuYWJsZWQgJiYgaXNBY3RpdmVJbkhpZXJhcmNoeShjYW0ubm9kZSkpO1xyXG4gICAgICAgIHBydW5lUmVzb3VyY2VDYWNoZShuZXcgU2V0KGNhbWVyYXMubWFwKChjYW0pID0+IGNhbS5ub2RlLnV1aWQpKSk7XHJcbiAgICAgICAgaWYgKCFjYW1lcmFzLmxlbmd0aCkgcmV0dXJuIFtdO1xyXG5cclxuICAgICAgICBjYXB0dXJpbmcgPSB0cnVlO1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGRlc2lnbiA9IHZpZXcuZ2V0RGVzaWduUmVzb2x1dGlvblNpemUoKTtcclxuICAgICAgICAgICAgY29uc3QgbG9uZ1NpZGUgPSBNYXRoLm1heChkZXNpZ24ud2lkdGgsIGRlc2lnbi5oZWlnaHQsIDEpO1xyXG4gICAgICAgICAgICBjb25zdCBzY2FsZSA9IE1hdGgubWluKDEsIG1heFNpemUgLyBsb25nU2lkZSk7XHJcbiAgICAgICAgICAgIC8vIFJlbmRlclRleHR1cmUgaXMgY2FwcGVkIGF0IDIwNDh4MjA0OCBieSB0aGUgZW5naW5lLlxyXG4gICAgICAgICAgICBjb25zdCB3aWR0aCA9IE1hdGgubWluKDIwNDgsIE1hdGgubWF4KDEsIE1hdGgucm91bmQoZGVzaWduLndpZHRoICogc2NhbGUpKSk7XHJcbiAgICAgICAgICAgIGNvbnN0IGhlaWdodCA9IE1hdGgubWluKDIwNDgsIE1hdGgubWF4KDEsIE1hdGgucm91bmQoZGVzaWduLmhlaWdodCAqIHNjYWxlKSkpO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgcmVzdWx0czogQ2FwdHVyZWRDYW1lcmFbXSA9IFtdO1xyXG5cclxuICAgICAgICAgICAgZm9yIChjb25zdCBjYW0gb2YgY2FtZXJhcykge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcmVzID0gZ2V0UmVzb3VyY2VzKGNhbSwgd2lkdGgsIGhlaWdodCk7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKCFyZXMud2FybWVkVXApIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBGaXJzdCB0aW1lIHRoaXMgY2FtZXJhJ3MgcmVuZGVyIHRhcmdldCBpcyBzZXQgdXAgLSBnaXZlIGl0IGEgY291cGxlIG9mXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gZXh0cmEgZnJhbWVzIGJlZm9yZSB0cnVzdGluZyB0aGUgb3V0cHV0LiBUaGlzIGlzIHRoZSBzYW1lIGZpeCBhcyBcInRvZ2dsZVxyXG4gICAgICAgICAgICAgICAgICAgIC8vIHRoZSBub2RlIG9mZi9vblwiLCBqdXN0IGRvbmUgYXV0b21hdGljYWxseSBpbnN0ZWFkIG9mIGJ5IGhhbmQuXHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgZm9yY2VSZW5kZXJGcmFtZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IGZvcmNlUmVuZGVyRnJhbWUoKTtcclxuICAgICAgICAgICAgICAgICAgICByZXMud2FybWVkVXAgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGF3YWl0IGZvcmNlUmVuZGVyRnJhbWUoKTtcclxuXHJcbiAgICAgICAgICAgICAgICBjb25zdCBwaXhlbHMgPSByZXMucnQucmVhZFBpeGVscygwLCAwLCB3aWR0aCwgaGVpZ2h0LCByZXMucmF3KTtcclxuICAgICAgICAgICAgICAgIGlmIChwaXhlbHMpIHtcclxuICAgICAgICAgICAgICAgICAgICBmbGlwUm93c0ludG8ocGl4ZWxzLCByZXMuaW1hZ2VEYXRhLmRhdGEsIHdpZHRoLCBoZWlnaHQpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlcy5jdHgucHV0SW1hZ2VEYXRhKHJlcy5pbWFnZURhdGEsIDAsIDApO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IGNhbS5ub2RlLnV1aWQsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IGNhbS5ub2RlLm5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHByaW9yaXR5OiBjYW0ucHJpb3JpdHksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHZpc2liaWxpdHk6IGNhbS52aXNpYmlsaXR5LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB3aWR0aCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgaGVpZ2h0LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhVXJsOiByZXMuY2FudmFzLnRvRGF0YVVSTCgnaW1hZ2UvcG5nJyksXHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHJlc3VsdHMuc29ydCgoYSwgYikgPT4gYS5wcmlvcml0eSAtIGIucHJpb3JpdHkpO1xyXG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0cztcclxuICAgICAgICB9IGZpbmFsbHkge1xyXG4gICAgICAgICAgICBjYXB0dXJpbmcgPSBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICB9LFxyXG59O1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGxvYWQoKSB7IH1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiB1bmxvYWQoKSB7XHJcbiAgICBmb3IgKGNvbnN0IHJlcyBvZiByZXNvdXJjZUNhY2hlLnZhbHVlcygpKSBkZXN0cm95UmVzb3VyY2VzKHJlcyk7XHJcbiAgICByZXNvdXJjZUNhY2hlLmNsZWFyKCk7XHJcbn1cclxuIl19