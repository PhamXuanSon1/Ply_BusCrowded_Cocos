import { readFileSync } from 'fs-extra';
import { join } from 'path';
// @ts-ignore
import packageJSON from '../../../package.json';
import type { CapturedCamera } from '../../scene';

let canvasEl: HTMLCanvasElement | null = null;
let panelEls: any = null;
let liveTimeoutId: any = null;
let liveActive = false;
let panelVisible = true;
let capturing = false;

/** Cap the long side of each captured camera texture, in px - keeps the round trip cheap. */
const MAX_CAPTURE_SIZE = 1024;
const LIVE_INTERVAL_MS = 500;

// Reused across ticks so decoding a camera's image doesn't allocate a new <img> element and
// wait on a fresh load event every single time.
const cameraImages = new Map<string, HTMLImageElement>();

function loadImage(el: HTMLImageElement, src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = src;
    });
}

function renderCameraList(el: HTMLElement, cameras: CapturedCamera[]) {
    if (!cameras.length) {
        el.innerHTML = '<div class="empty">No cameras found.</div>';
        return;
    }
    // Highest priority (drawn last / on top) first, easier to scan.
    const sorted = [...cameras].sort((a, b) => b.priority - a.priority);
    el.innerHTML = sorted.map((c) => `
        <div class="camera-row" data-uuid="${escapeHtml(c.uuid)}" title="Click to refresh this camera">
            <span class="name">${escapeHtml(c.name)}</span>
            <span class="meta">priority ${c.priority} · visibility ${c.visibility} · ${c.width}x${c.height}</span>
        </div>
    `).join('');
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

const SIDEBAR_COLLAPSED_KEY = 'game_view.sidebarCollapsed';

function setSidebarCollapsed(sidebar: HTMLElement, toggleBtn: HTMLElement, collapsed: boolean) {
    sidebar.classList.toggle('collapsed', collapsed);
    toggleBtn.textContent = collapsed ? '▸' : '◂';
    toggleBtn.title = collapsed ? 'Expand' : 'Collapse';
    try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0'); } catch { /* ignore */ }
}

async function renderComposite(cameras: CapturedCamera[], placeholder: HTMLElement) {
    if (!canvasEl) return;

    if (!cameras.length) {
        canvasEl.style.display = 'none';
        placeholder.style.display = 'block';
        return;
    }

    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    // Decode all of this tick's images BEFORE touching the canvas at all - the previous frame
    // stays on screen the whole time instead of flashing black while the new one loads.
    // Already sorted ascending by priority (see scene script) - draw in that order so higher
    // priority cameras end up on top, matching how Cocos itself composites cameras.
    const images = await Promise.all(cameras.map((cam) => {
        let img = cameraImages.get(cam.uuid);
        if (!img) {
            img = new Image();
            cameraImages.set(cam.uuid, img);
        }
        return loadImage(img, cam.dataUrl);
    }));

    const { width, height } = cameras[0];
    // Assigning canvas.width/height clears it even when set to the same value it already had -
    // only do it when the size actually changed, so we're not needlessly wiping the canvas
    // (and causing a flash) on every single tick.
    if (canvasEl.width !== width || canvasEl.height !== height) {
        canvasEl.width = width;
        canvasEl.height = height;
    }
    ctx.clearRect(0, 0, width, height);
    images.forEach((img) => ctx.drawImage(img, 0, 0, width, height));

    canvasEl.style.display = 'block';
    placeholder.style.display = 'none';
}

async function capture($: any) {
    if (capturing) return; // don't overlap requests, e.g. if Live fires faster than a capture completes
    capturing = true;

    try {
        const cameras: CapturedCamera[] = await Editor.Message.request('scene', 'execute-scene-script', {
            name: packageJSON.name,
            method: 'captureCameras',
            args: [MAX_CAPTURE_SIZE],
        });

        await renderComposite(cameras, $.placeholder);
        renderCameraList($.cameraList, cameras);
    } catch (e) {
        console.error('[game_view] capture failed:', e);
    } finally {
        capturing = false;
    }
}

/**
 * Runs one capture, then - only once it has actually finished (success or failure) - schedules
 * the next one. A plain setInterval would keep firing on a fixed clock even if a capture is
 * still in flight (e.g. slow render, or a scene-side stall); that overlap is exactly what
 * corrupted camera.targetTexture state and produced the intermittent crashes/timeouts.
 */
async function runLiveTick($: any) {
    await capture($);
    // Also stops on its own if the panel got hidden while this capture was in flight - no point
    // burning cycles capturing something nobody's looking at.
    if (liveActive && panelVisible) {
        liveTimeoutId = setTimeout(() => runLiveTick($), LIVE_INTERVAL_MS);
    }
}

function resumeLiveIfNeeded() {
    if (liveActive && panelVisible && !liveTimeoutId && panelEls) {
        runLiveTick(panelEls);
    }
}

/** Click a camera's row in the sidebar to toggle its node off/on (see scene script) and
 *  immediately re-capture, instead of waiting for the next Live tick (or doing nothing at all
 *  if Live is off). */
async function refreshCamera(uuid: string, $: any) {
    try {
        await Editor.Message.request('scene', 'execute-scene-script', {
            name: packageJSON.name,
            method: 'refreshCamera',
            args: [uuid],
        });
    } catch (e) {
        console.error('[game_view] refreshCamera failed:', e);
    }
    await capture($);
}

/** Run once when Live starts: toggles every camera off/on in priority order so each one shows
 *  correctly from the very first capture, instead of needing to be clicked by hand first. */
async function warmUpThenGoLive($: any) {
    try {
        await Editor.Message.request('scene', 'execute-scene-script', {
            name: packageJSON.name,
            method: 'refreshAllCameras',
            args: [],
        });
    } catch (e) {
        console.error('[game_view] refreshAllCameras failed:', e);
    }
    runLiveTick($);
}

module.exports = Editor.Panel.define({
    listeners: {
        show() {
            panelVisible = true;
            resumeLiveIfNeeded();
        },
        hide() {
            panelVisible = false;
            if (liveTimeoutId) { clearTimeout(liveTimeoutId); liveTimeoutId = null; }
        },
    },
    template: readFileSync(join(__dirname, '../../../static/template/default/index.html'), 'utf-8'),
    style: readFileSync(join(__dirname, '../../../static/style/default/index.css'), 'utf-8'),
    $: {
        app: '#app',
        canvas: '#view-canvas',
        placeholder: '#placeholder',
        sidebar: '#sidebar',
        btnToggleSidebar: '#btn-toggle-sidebar',
        cameraList: '#camera-list',
        live: '#live',
    },
    methods: {
        hello() {
            console.log('[game_view]: hello');
        },
    },
    ready() {
        const $: any = (this as any).$;
        panelEls = $;
        canvasEl = $.canvas as HTMLCanvasElement;

        let collapsed = false;
        try { collapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'; } catch { /* ignore */ }
        setSidebarCollapsed($.sidebar, $.btnToggleSidebar, collapsed);
        $.btnToggleSidebar.addEventListener('click', () => {
            setSidebarCollapsed($.sidebar, $.btnToggleSidebar, !$.sidebar.classList.contains('collapsed'));
        });

        $.cameraList.addEventListener('click', (e: MouseEvent) => {
            const row = (e.target as HTMLElement).closest('.camera-row[data-uuid]') as HTMLElement | null;
            if (!row || !row.dataset.uuid) return;
            refreshCamera(row.dataset.uuid, $);
        });

        $.live.addEventListener('change', () => {
            liveActive = $.live.checked;
            if (liveTimeoutId) { clearTimeout(liveTimeoutId); liveTimeoutId = null; }
            if (liveActive) warmUpThenGoLive($);
        });
    },
    beforeClose() {
        liveActive = false;
        if (liveTimeoutId) { clearTimeout(liveTimeoutId); liveTimeoutId = null; }
        cameraImages.clear();
    },
    close() { },
});
