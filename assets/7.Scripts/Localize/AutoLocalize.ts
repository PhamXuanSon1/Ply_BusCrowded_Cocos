import { _decorator, Component, Enum, Label, RichText, sys, TTFFont, UITransform, v3, Vec3 } from 'cc';
import { LOCALIZE_DATA } from './LocalizeData';
import { EDITOR_NOT_IN_PREVIEW } from 'cc/env';

const { ccclass, property, executeInEditMode } = _decorator;

/** Ngôn ngữ gốc bạn gõ text trong editor, cũng là ngôn ngữ dùng khi không có bản dịch. */
const SOURCE_LANGUAGE = 'en';

/** Các ngôn ngữ có trong LocalizeData — hiện thành dropdown Debug Language trong Inspector. */
const LANGUAGES = ['en', 'es', 'pt', 'fr', 'de', 'it', 'ru', 'tr', 'ja', 'ko', 'zh-cn', 'zh-tw', 'th', 'id', 'ar', 'hi', 'vi'];
const LanguageEnum = Enum(LANGUAGES.reduce((o, l, i) => { o[l] = i; return o; }, {} as Record<string, number>));

/**
 * Gắn component này lên node có sẵn Label hoặc RichText - tự đọc text trên Label,
 * detect ngôn ngữ máy user rồi thay bằng bản dịch tương ứng trong LocalizeData.
 * Bản dịch có thể chứa tag RichText (VD <color=#ff1fa0>Pink</color>): node dùng RichText sẽ
 * hiện màu, node dùng Label thường thì tag bị bỏ đi.
 */
@ccclass('AutoLocalize')
@executeInEditMode(true)
export class AutoLocalize extends Component {

    @property
    text: string = '';
    @property({
        tooltip: 'Bật để ép ngôn ngữ test — chọn ở dropdown Debug Language bên dưới'
    })
    debug: boolean = false;
    // Lưu dạng chuỗi (giữ tương thích scene cũ), chỉnh qua dropdown debugLang bên dưới.
    @property({ visible: false })
    debugLanguage: string = '';
    @property({
        visible() {
            return this.debug
        },
        type: LanguageEnum,
        displayName: 'Debug Language',
        tooltip: 'Chọn ngôn ngữ để xem thử — chữ đổi ngay trong editor'
    })
    get debugLang() { return Math.max(0, LANGUAGES.indexOf(norm(this.debugLanguage))); }
    set debugLang(v: number) {
        this.debugLanguage = LANGUAGES[v] || SOURCE_LANGUAGE;
        this.init();
    }
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
        let rich = this.getComponent(RichText);
        if (!label && !rich) {
            return;
        }

        const text = this.text.trim();
        const entry = (LOCALIZE_DATA as Record<string, Record<string, string>>)[text];
        let language = detectLanguage();
        if ( this.debug && this.debugLanguage.length > 0) {
            language = norm(this.debugLanguage);
        }
        const translated = entry && (entry[language] || entry[baseOf(language)] || entry[SOURCE_LANGUAGE]);

        // Bản dịch có tag màu mà node chỉ có Label → lúc chạy game tự đổi sang RichText (chép
        // font/cỡ/màu/căn lề từ Label) để khỏi phải thay component tay trong scene.
        if (!rich && !EDITOR_NOT_IN_PREVIEW && translated && stripTags(translated) != translated) {
            rich = this.addComponent(RichText);
            rich.font = label.font as TTFFont;
            rich.useSystemFont = label.useSystemFont;
            rich.fontFamily = label.fontFamily;
            rich.fontSize = label.fontSize;
            rich.lineHeight = label.lineHeight;
            rich.fontColor = label.color.clone();
            rich.horizontalAlign = label.horizontalAlign;
            rich.verticalAlign = label.verticalAlign;
            rich.cacheMode = label.cacheMode;
            label.enabled = false;
        }

        const setText = (str: string) => {
            if (rich) {
                rich.string = escapeRichText(str);
            } else {
                label.string = stripTags(str);
                label.updateRenderData(true);
            }
        };

        setText(text);
        const uit = this.getComponent(UITransform);
        const size = uit.contentSize.clone();

        if (translated) {
            setText(translated);
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

const RICH_TAG = /(<\/?(?:color|b|i|u|size|outline)[^>]*>)/;

/** Bỏ tag RichText (<color=...>, </b>, ...) để hiện trên Label thường. */
function stripTags (str: string): string {
    return str.split(RICH_TAG).filter((_, i) => i % 2 == 0).join('');
}

/** Escape < > & trong phần chữ (giữ nguyên tag) — parser RichText hiểu sai "IQ >160" là tag. */
function escapeRichText (str: string): string {
    return str.split(RICH_TAG).map((part, i) => i % 2 == 1 ? part
        : part.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')).join('');
}

function norm (code: string): string {
    return code.toLowerCase().replace(/_/g, '-').trim();
}

function baseOf (code: string): string {
    const i = code.indexOf('-');
    return i > 0 ? code.substring(0, i) : code;
}
