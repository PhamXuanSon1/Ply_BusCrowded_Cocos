import { _decorator, Component, Label, sys, UITransform, v3, Vec3 } from 'cc';
import { LOCALIZE_DATA } from './LocalizeData';
import { EDITOR } from 'cc/env';

const { ccclass, property, executeInEditMode, requireComponent } = _decorator;

/** Ngôn ngữ gốc bạn gõ text trong editor, cũng là ngôn ngữ dùng khi không có bản dịch. */
const SOURCE_LANGUAGE = 'en';

/**
 * Gắn component này lên node có sẵn Label - tự đọc text trên Label,
 * detect ngôn ngữ máy user rồi thay bằng bản dịch tương ứng trong LocalizeData.
 */
@ccclass('AutoLocalize')
@executeInEditMode(true)
@requireComponent(Label)
export class AutoLocalize extends Component {

    @property
    text: string = '';
    @property({
        tooltip: 'Ép ngôn ngữ dùng để test, VD: ja, ko, zh-cn, fr...\n'
    })
    debug: boolean = false;
    @property({
        visible() {
            return this.debug
        },
        type: String
    })
    debugLanguage: string = '';
    @property

    @property({
        tooltip: 'Tick vào đây để chạy lại dịch + tự co scale ngay trong Editor (không cần chạy game).\n'
            + 'Dùng để xem trước kết quả sau khi đổi Text, Debug Language, hoặc dữ liệu trong LocalizeData.'
    })
    set test(v: boolean) { this.init() }
    get test() { return false }

    @property({
        tooltip: 'Tick vào đây để lưu scale hiện tại của node làm kích thước gốc.\n'
            + 'Kích thước gốc này dùng làm mốc để tự thu nhỏ node khi chữ dịch dài hơn bản gốc.\n'
            + 'Điều kiện: chỉnh scale node về đúng ý muốn (ứng với bản gốc) rồi mới bấm, và bấm TRƯỚC khi dùng nút Test.'
    })
    set setOriginSize(v: boolean) { this.originSize = this.node.getScale() }
    get setOriginSize() { return false }
    @property
    originSize: Vec3 = null;


    init() {

        if(!this.originSize) {
            this.originSize = this.node.getScale();
        }
        this.node.setScale(this.originSize);

        const label = this.getComponent(Label);
        if (!label) {
            return;
        }

        const text = this.text.trim();        
        label.string = text;
        label.updateRenderData(true)
        const uit = this.getComponent(UITransform);
        const size = uit.contentSize.clone();

        const entry = (LOCALIZE_DATA as Record<string, Record<string, string>>)[text];
        if (!entry) {
            return;
        }

        var language = detectLanguage();

        if ( this.debug && this.debugLanguage.length > 0) {
            language = norm(this.debugLanguage);
        }

        const translated = entry[language] || entry[baseOf(language)] || entry[SOURCE_LANGUAGE];
        if (translated) {
            label.string = translated;
            label.updateRenderData(true)
        }
        var nSize = uit.contentSize.clone();

        let sl = nSize.width / size.width
        if(sl > 1) {
            let scale = this.originSize.clone().multiplyScalar(1/sl);
            this.node.setScale(scale);
        } 
        

    }

    protected onLoad (): void {
        this.init();
    }
}

/** Đọc ngôn ngữ thiết bị, ưu tiên navigator (chuẩn nhất trong webview quảng cáo). */
function detectLanguage (): string {
    try {
        const nav: any = typeof navigator !== 'undefined' ? navigator : null;
        if (nav) {
            const list = nav.languages;
            if (list && list.length && typeof list[0] === 'string') {
                return norm(list[0]);
            }
            const single = nav.language || nav.userLanguage || nav.browserLanguage;
            if (typeof single === 'string' && single) {
                return norm(single);
            }
        }
    } catch (e) {
        // một số webview chặn navigator -> rơi xuống sys bên dưới
    }
    try {
        return norm(sys.languageCode || sys.language || SOURCE_LANGUAGE);
    } catch (e) {
        return SOURCE_LANGUAGE;
    }
}

function norm (code: string): string {
    return code.toLowerCase().replace(/_/g, '-').trim();
}

function baseOf (code: string): string {
    const i = code.indexOf('-');
    return i > 0 ? code.substring(0, i) : code;
}
