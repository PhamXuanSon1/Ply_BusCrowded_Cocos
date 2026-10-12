import { _decorator, Animation, Component, Node } from 'cc';
import { EDITOR } from 'cc/env';
const { ccclass, property, executeInEditMode, executionOrder } = _decorator;

/**
 * Một ô tick gom nhiều thứ cần tắt cho bản Google:
 * `googleMode` = false: game như thường. `googleMode` = true: ẩn các node trong `hideNodes`
 * (nút tải...) và tắt các Animation trong `stopAnims` (lúc chạy game).
 *
 * Khi chạy game, các script khác có thể bật lại node (UI.showFirstOn bật nút tải sau tutorial)
 * hoặc phát lại animation (WinPopup phát anim nút), nên mỗi frame kiểm tra và tắt lại.
 * Trong editor: tick là thấy ngay; node bị ẩn được ghi lại để bỏ tick (hoặc chạy game với
 * googleMode = false) thì bật lại đúng những node đó.
 */
@ccclass('GoogleMode')
@executeInEditMode
@executionOrder(-900)
export class GoogleMode extends Component {
    @property({ type: [Node], tooltip: 'Các node bị ẩn khi bật Google Mode (nút tải, logo...)' })
    hideNodes: Node[] = [];

    @property({ type: [Animation], tooltip: 'Các Animation bị tắt khi bật Google Mode' })
    stopAnims: Animation[] = [];

    @property
    private _googleMode = false;

    /** Các node đang bật mà GoogleMode đã ẩn trong editor; lưu cùng scene để bật lại khi cần. */
    @property({ type: [Node], visible: false })
    private hiddenByMode: Node[] = [];

    @property({ tooltip: 'Bật: ẩn Hide Nodes + tắt Stop Anims. Tắt: như thường' })
    get googleMode(): boolean {
        return this._googleMode;
    }
    set googleMode(v: boolean) {
        this._googleMode = v;
        if (EDITOR) this.applyInEditor();
    }

    onLoad(): void {
        if (EDITOR) return;
        // Chạy game: trả lại các node đã bị ẩn lúc tick trong editor, rồi áp dụng theo `googleMode`.
        for (const n of this.hiddenByMode) if (n?.isValid) n.active = true;
        if (this._googleMode) this.enforce();
    }

    lateUpdate(): void {
        if (EDITOR || !this._googleMode) return;
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
        if (!this._googleMode) return;
        for (const n of this.hideNodes) {
            if (!n?.isValid || !n.active) continue;
            n.active = false;
            this.hiddenByMode.push(n);
        }
    }
}
