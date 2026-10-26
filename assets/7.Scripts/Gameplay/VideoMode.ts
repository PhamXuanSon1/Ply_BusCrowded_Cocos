import { _decorator, Animation, Component, Node } from 'cc';
import { EDITOR } from 'cc/env';
import { Game } from './Game';
const { ccclass, property, executeInEditMode, executionOrder } = _decorator;

/**
 * Một ô tick gom nhiều thứ cần tắt cho bản Video (giống GoogleMode):
 * `videoMode` = false: game như thường. `videoMode` = true: ẩn các node trong `hideNodes`
 * (nút tải, logo, điểm Brain...), tắt các Animation trong `stopAnims`, và lúc chạy game thì
 * tắt tay hướng dẫn + đặt `Game.clicksToStore` = `clicksToStore` (chơi hết map mới mở Store).
 *
 * Khi chạy game, các script khác có thể bật lại node hoặc phát lại animation,
 * nên mỗi frame kiểm tra và tắt lại.
 * Trong editor: tick là thấy ngay; node bị ẩn được ghi lại để bỏ tick (hoặc chạy game với
 * videoMode = false) thì bật lại đúng những node đó.
 */
@ccclass('VideoMode')
@executeInEditMode
@executionOrder(-900)
export class VideoMode extends Component {
    @property({ type: [Node], tooltip: 'Các node bị ẩn khi bật Video Mode (nút tải, tay hướng dẫn...)' })
    hideNodes: Node[] = [];

    @property({ type: [Animation], tooltip: 'Các Animation bị tắt khi bật Video Mode' })
    stopAnims: Animation[] = [];

    @property({ type: Game, tooltip: 'Game để tắt tay hướng dẫn và đổi Clicks To Store khi bật Video Mode' })
    game: Game = null!;

    @property({ tooltip: 'Clicks To Store khi bật Video Mode. Đặt lớn để chơi hết map (tiến độ 100%) mới mở Store' })
    clicksToStore = 9999;

    @property
    private _videoMode = false;

    /** Các node đang bật mà VideoMode đã ẩn trong editor; lưu cùng scene để bật lại khi cần. */
    @property({ type: [Node], visible: false })
    private hiddenByMode: Node[] = [];

    @property({ tooltip: 'Bật: ẩn Hide Nodes + tắt Stop Anims. Tắt: như thường' })
    get videoMode(): boolean {
        return this._videoMode;
    }
    set videoMode(v: boolean) {
        this._videoMode = v;
        if (EDITOR) this.applyInEditor();
    }

    onLoad(): void {
        if (EDITOR) return;
        // Chạy game: trả lại các node đã bị ẩn lúc tick trong editor, rồi áp dụng theo `videoMode`.
        for (const n of this.hiddenByMode) if (n?.isValid) n.active = true;
        if (!this._videoMode) return;
        // Chạy trước Game.start nên Game init với cấu hình video: không tay, không mở Store giữa chừng.
        if (this.game) {
            this.game.useHand = false;
            this.game.clicksToStore = this.clicksToStore;
        }
        this.enforce();
    }

    lateUpdate(): void {
        if (EDITOR || !this._videoMode) return;
        this.enforce();
    }

    private enforce(): void {
        for (const n of this.hideNodes) if (n?.isValid && n.active) n.active = false;
        for (const a of this.stopAnims) {
            if (!a?.isValid) continue;
            if (a.enabled) a.enabled = false;
            for (const clip of a.clips) {
                const state = clip ? a.getState(clip.name) : null;
                if (state?.isPlaying) a.stop();
            }
        }
    }

    private applyInEditor(): void {
        for (const n of this.hiddenByMode) if (n?.isValid) n.active = true;
        this.hiddenByMode = [];
        // Animation không chạy trong editor nên chỉ cần ẩn / hiện node; tắt anim làm lúc chạy game.
        if (!this._videoMode) return;
        for (const n of this.hideNodes) {
            if (!n?.isValid || !n.active) continue;
            n.active = false;
            this.hiddenByMode.push(n);
        }
    }
}
