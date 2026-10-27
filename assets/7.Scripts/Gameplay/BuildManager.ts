import { _decorator, Animation, CCString, Component, Node } from 'cc';
import { EDITOR } from 'cc/env';
import { Game } from './Game';
import { FloorType, MapManager } from './MapManager';
const { ccclass, property, executeInEditMode, executionOrder } = _decorator;

const G_GOOGLE = "Google Mode";
const G_VIDEO = "Video Mode";
const G_BUILD = "Build";

/**
 * Gộp GoogleMode + VideoMode + build nhiều bản theo floor.
 *
 * Google / Video: mỗi chế độ 1 ô tick, bật thì ẩn các node trong Hide Nodes và tắt các Animation trong
 * Stop Anims (lúc chạy game). Video còn tắt tay hướng dẫn + đặt `Game.clicksToStore`.
 * Bản build kênh Google (PlayableSDK.channel = "Google") luôn bật Google Mode, không cần tick.
 * Khi chạy game, script khác có thể bật lại node / phát lại anim nên mỗi frame kiểm tra và tắt lại.
 * Trong editor: tick là thấy ngay; node bị ẩn được ghi vào `hiddenByMode` để bỏ tick thì bật lại đúng những node đó.
 *
 * Build: tick Start Build -> với mỗi floor trong Build Floors: đổi floor (MapManager), lưu scene, chạy build
 * web-mobile (copy cấu hình lần build gần nhất trong panel Build) với Name = <Build Name>_<Floor>[_Video],
 * playable-ads-builder đóng gói ra folder cùng tên. Xong trả lại floor + Video Mode cũ.
 * Hook build nhận bản Video qua cặp field `_videoMode` + `hiddenByMode` trong scene: đừng đổi tên 2 field này.
 */
@ccclass('BuildManager')
@executeInEditMode
@executionOrder(-900)
export class BuildManager extends Component {
    // ---------- Google ----------
    @property({ group: G_GOOGLE, type: [Node], tooltip: "Các node bị ẩn khi bật Google Mode (nút tải, logo...)." })
    googleHideNodes: Node[] = [];

    @property({ group: G_GOOGLE, type: [Animation], tooltip: "Các Animation bị tắt khi bật Google Mode." })
    googleStopAnims: Animation[] = [];

    @property
    private _googleMode = false;

    @property({ group: G_GOOGLE, tooltip: "Bật: ẩn Google Hide Nodes + tắt Google Stop Anims. Tắt: như thường.\nBản build kênh Google luôn bật, không cần tick." })
    get googleMode() { return this._googleMode; }
    set googleMode(v: boolean) {
        this._googleMode = v;
        if(EDITOR) this.applyInEditor();
    }

    // ---------- Video ----------
    @property({ group: G_VIDEO, type: [Node], tooltip: "Các node bị ẩn khi bật Video Mode (nút tải, logo, điểm Brain, nhạc...)." })
    videoHideNodes: Node[] = [];

    @property({ group: G_VIDEO, type: [Animation], tooltip: "Các Animation bị tắt khi bật Video Mode." })
    videoStopAnims: Animation[] = [];

    @property({ group: G_VIDEO, type: Game, tooltip: "Game để tắt tay hướng dẫn và đổi Clicks To Store khi bật Video Mode." })
    game: Game = null!;

    @property({ group: G_VIDEO, tooltip: "Clicks To Store khi bật Video Mode. Đặt lớn để chơi hết map (tiến độ 100%) mới mở Store." })
    clicksToStore = 9999;

    @property
    private _videoMode = false;

    @property({ group: G_VIDEO, tooltip: "Bật: ẩn Video Hide Nodes + tắt Video Stop Anims + tắt tay + đổi Clicks To Store.\nBuild khi bật thì ảnh + audio không nén." })
    get videoMode() { return this._videoMode; }
    set videoMode(v: boolean) {
        this._videoMode = v;
        if(EDITOR) this.applyInEditor();
    }

    /** Các node đang bật mà Google / Video Mode đã ẩn trong editor; lưu cùng scene để bật lại khi cần. */
    @property({ type: [Node], visible: false })
    private hiddenByMode: Node[] = [];

    // ---------- Build ----------
    @property({ group: G_BUILD, type: MapManager, tooltip: "MapManager để đổi floor trước mỗi lần build." })
    mapManager: MapManager = null!;

    @property({ group: G_BUILD, type: [FloorType], tooltip: "Các floor cần build, mỗi floor ra 1 folder <Build Name>_<Floor>.\nĐể trống: chỉ build floor đang chọn." })
    buildFloors: FloorType[] = [];

    @property({ group: G_BUILD, tooltip: "Bật: build bản Video (bật Video Mode, folder thêm hậu tố _Video, ảnh + audio không nén).\nTắt: build bản thường." })
    buildVideo = false;

    @property({ group: G_BUILD, type: CCString, tooltip: "Tên gốc của các folder build.\nĐể trống: lấy Name của lần build web-mobile gần nhất (bỏ hậu tố _<Floor> / _Video nếu có)." })
    buildName = "";

    @property({ group: G_BUILD, tooltip: "Tick để build lần lượt từng floor trong Build Floors.\n- Cần build web-mobile 1 lần bằng panel Build trước (lấy cấu hình + kênh quảng cáo từ đó).\n- Mỗi lần build sẽ đổi floor + lưu scene; xong trả lại floor / Video Mode cũ và lưu scene.\n- Xem tiến độ trong Console, đừng sửa scene khi đang build." })
    get startBuild() { return false; }
    set startBuild(v: boolean) {
        if(EDITOR) this.buildAll();
    }

    private googleOn = false;
    private videoOn = false;
    private building = false;

    onLoad(): void {
        if(EDITOR) return;
        // Chạy game: trả lại các node đã bị ẩn lúc tick trong editor, rồi áp dụng theo chế độ đang bật.
        for(const n of this.hiddenByMode) if(n?.isValid) n.active = true;
        this.googleOn = this._googleMode || BuildManager.isGoogleBuild();
        this.videoOn = this._videoMode;
        // Chạy trước Game.start nên Game init với cấu hình video: không tay, không mở Store giữa chừng.
        if(this.videoOn && this.game) {
            this.game.useHand = false;
            this.game.clicksToStore = this.clicksToStore;
        }
        this.enforce();
    }

    lateUpdate(): void {
        if(EDITOR) return;
        this.enforce();
    }

    /** Bản build kênh Google: playable-ads-builder gắn `PlayableSDK.channel = "Google"`. */
    static isGoogleBuild(): boolean {
        return typeof PlayableSDK !== 'undefined' && (PlayableSDK?.channel as string) === 'Google';
    }

    private enforce(): void {
        if(this.googleOn) this.hideAndStop(this.googleHideNodes, this.googleStopAnims);
        if(this.videoOn) this.hideAndStop(this.videoHideNodes, this.videoStopAnims);
    }

    private hideAndStop(nodes: Node[], anims: Animation[]): void {
        for(const n of nodes) if(n?.isValid && n.active) n.active = false;
        for(const a of anims) {
            if(!a?.isValid) continue;
            if(a.enabled) a.enabled = false;
            for(const clip of a.clips) {
                const state = clip ? a.getState(clip.name) : null;
                if(state?.isPlaying) a.stop();
            }
        }
    }

    private applyInEditor(): void {
        for(const n of this.hiddenByMode) if(n?.isValid) n.active = true;
        this.hiddenByMode = [];
        // Animation không chạy trong editor nên chỉ cần ẩn / hiện node; tắt anim làm lúc chạy game.
        const nodes = [
            ...(this._googleMode ? this.googleHideNodes : []),
            ...(this._videoMode ? this.videoHideNodes : []),
        ];
        for(const n of nodes) {
            if(!n?.isValid || !n.active) continue;
            n.active = false;
            this.hiddenByMode.push(n);
        }
    }

    private async buildAll() {
        const Editor = (globalThis as any).Editor;
        if(!Editor || this.building) return;
        if(!this.mapManager) {
            console.error("BuildManager: chưa gán Map Manager");
            return;
        }
        const info = await Editor.Message.request("builder", "query-tasks-info");
        const last = Object.values<any>(info?.queue || {})
            .filter(t => t?.options?.platform === "web-mobile")
            .sort((a, b) => +b.id - +a.id)[0];
        if(!last) {
            console.error("BuildManager: chưa có lần build web-mobile nào, build 1 lần bằng panel Build trước");
            return;
        }
        const floorNames = Object.keys(FloorType).filter(k => isNaN(+k));
        const suffix = new RegExp("(_(" + floorNames.join("|") + "))?(_Video)?$");
        const baseName = this.buildName.trim() || String(last.options.name || "").replace(suffix, "");
        if(!baseName) {
            console.error("BuildManager: chưa có Build Name");
            return;
        }
        const floors = this.buildFloors.length ? [...new Set(this.buildFloors)] : [this.mapManager.floor];

        const oldFloor = this.mapManager.floor;
        const oldVideo = this._videoMode;
        this.building = true;
        const results: string[] = [];
        try {
            this.videoMode = this.buildVideo;
            for(const floor of floors) {
                await this.mapManager.setFloor(floor);
                await Editor.Message.request("scene", "save-scene");

                const name = baseName + "_" + FloorType[floor] + (this.buildVideo ? "_Video" : "");
                const options = JSON.parse(JSON.stringify(last.options));
                options.name = name;
                delete options.logDest;
                // outputPath tự đặt trong panel: mỗi bản 1 folder con, không ghi đè nhau
                const pkg = options.packages?.["playable-ads-builder"];
                if(pkg?.outputPath?.trim()) pkg.outputPath = pkg.outputPath.trim().replace(/[\\/]+$/, "") + "/" + name;

                console.log(`BuildManager: build ${name} (${results.length + 1}/${floors.length})...`);
                const code = await Editor.Message.request("builder", "add-task", options, true);
                const ok = code === 36; // BuildExitCode.BUILD_SUCCESS
                results.push(`${name}: ${ok ? "OK" : "lỗi (" + JSON.stringify(code) + ")"}`);
                console.log(`BuildManager: ${results[results.length - 1]}`);
            }
        } catch(err) {
            console.error("BuildManager: build thất bại", err);
        } finally {
            this.videoMode = oldVideo;
            await this.mapManager.setFloor(oldFloor);
            await Editor.Message.request("scene", "save-scene");
            this.building = false;
            console.log("BuildManager: xong\n" + results.join("\n"));
        }
    }
}
