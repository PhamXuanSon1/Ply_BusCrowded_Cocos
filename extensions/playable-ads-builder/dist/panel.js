'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.$ = exports.template = exports.style = void 0;
exports.update = update;
exports.ready = ready;
exports.close = close;
const global_1 = require("./global");
const channels_1 = require("./channels");
let panel;
// listener của từng chip kênh quảng cáo (danh sách kênh sinh động, không khai báo cứng trong $)
let channelChipBindings = [];
/**
 * Build-task option (packages.playable-ads-builder.*) không đáng tin cậy để cache các field do
 * panel này tự vẽ (đã test thực tế: field không có "render" trong builder.ts options thì mất giá
 * trị mỗi lần đóng/mở lại Build panel). Nên tự lưu/đọc riêng theo project bằng Editor.Profile -
 * đây là API chính thức, độc lập hoàn toàn với cơ chế lưu build-task, chắc chắn cache được.
 * Giá trị vẫn được dispatch vào build task option như cũ để hooks.ts nhận đúng khi build.
 */
const PROFILE_TYPE = 'project';
const PROFILE_KEYS = [
    'appleUrl', 'googleUrl', 'compressionType', 'compressionQuality', 'audioCompressionEnabled', 'audioBitrate',
];
async function loadSavedConfig() {
    try {
        const saved = await Editor.Profile.getProject(global_1.PACKAGE_NAME, '', PROFILE_TYPE);
        return saved || {};
    }
    catch (err) {
        console.warn(`[${global_1.PACKAGE_NAME}] Không đọc được cấu hình đã lưu:`, err);
        return {};
    }
}
function saveConfig(key, value) {
    Editor.Profile.setProject(global_1.PACKAGE_NAME, key, value, PROFILE_TYPE).catch((err) => {
        console.warn(`[${global_1.PACKAGE_NAME}] Không lưu được cấu hình:`, err);
    });
}
function applySavedConfig(saved) {
    PROFILE_KEYS.forEach(key => {
        if (saved[key] !== undefined) {
            panel.options[key] = saved[key];
            panel.dispatch('update', `packages.${global_1.PACKAGE_NAME}.${key}`, saved[key]);
        }
    });
    channels_1.CHANNEL_SORTED.forEach(channel => {
        const fieldKey = `${channels_1.CHANNEL_FIELD_PREFIX}${channel}`;
        if (saved[fieldKey] !== undefined) {
            panel.options[fieldKey] = saved[fieldKey];
            panel.dispatch('update', `packages.${global_1.PACKAGE_NAME}.${fieldKey}`, saved[fieldKey]);
        }
    });
}
exports.style = `
.playable-ads-panel .link-row {
    display: flex;
    flex: 1;
    align-items: center;
}
.playable-ads-panel .link-row ui-input {
    flex: 1;
}
.playable-ads-panel .link-row ui-button {
    margin-left: 4px;
}
.playable-ads-panel .section-title {
    display: block;
    margin: 12px 0 4px;
    font-weight: bold;
}
.playable-ads-panel .channel-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 4px 0;
}
.playable-ads-panel .channel-chip {
    padding: 3px 10px;
    border: 1px solid #666;
    border-radius: 12px;
    font-size: 12px;
    cursor: pointer;
    user-select: none;
    background: transparent;
    color: inherit;
}
.playable-ads-panel .channel-chip:hover {
    border-color: #1a73e8;
}
.playable-ads-panel .channel-chip.selected {
    background: #1a73e8;
    border-color: #1a73e8;
    color: #fff;
}
.playable-ads-panel .selected-channels-value {
    opacity: 0.85;
}
`;
// mỗi kênh 1 chip bấm để chọn/bỏ chọn (dạng enum, không phải checkbox), đánh dấu bằng
// data-channel để wire động ở init()
const channelRowsHtml = channels_1.CHANNEL_SORTED.map(channel => `<div class="channel-chip" data-channel="${channel}">${channel}</div>`).join('');
exports.template = `
<div class="playable-ads-panel">
    <ui-prop id="appleUrlProp">
        <ui-label slot="label" value="i18n:${global_1.PACKAGE_NAME}.options.appleUrl"></ui-label>
        <div slot="content" class="link-row">
            <ui-input placeholder="https://apps.apple.com/..."></ui-input>
            <ui-button>Open</ui-button>
        </div>
    </ui-prop>
    <ui-prop id="googleUrlProp">
        <ui-label slot="label" value="i18n:${global_1.PACKAGE_NAME}.options.googleUrl"></ui-label>
        <div slot="content" class="link-row">
            <ui-input placeholder="https://play.google.com/store/apps/..."></ui-input>
            <ui-button>Open</ui-button>
        </div>
    </ui-prop>

    <ui-prop id="compressionTypeProp">
        <ui-label slot="label" value="i18n:${global_1.PACKAGE_NAME}.options.compressionType"></ui-label>
        <ui-select slot="content">
            <option value="none">i18n:${global_1.PACKAGE_NAME}.options.compressionNone</option>
            <option value="lossless">i18n:${global_1.PACKAGE_NAME}.options.compressionLossless</option>
            <option value="lossy">i18n:${global_1.PACKAGE_NAME}.options.compressionLossy</option>
        </ui-select>
    </ui-prop>
    <ui-prop id="compressionQualityProp">
        <ui-label slot="label" value="i18n:${global_1.PACKAGE_NAME}.options.compressionQuality"></ui-label>
        <ui-num-input slot="content" step="1" min="0" max="100"></ui-num-input>
    </ui-prop>

    <ui-prop id="audioCompressionEnabledProp">
        <ui-label slot="label" value="i18n:${global_1.PACKAGE_NAME}.options.audioCompressionEnabled"></ui-label>
        <ui-checkbox slot="content"></ui-checkbox>
    </ui-prop>
    <ui-prop id="audioBitrateProp">
        <ui-label slot="label" value="i18n:${global_1.PACKAGE_NAME}.options.audioBitrate"></ui-label>
        <ui-num-input slot="content" step="8" min="8" max="320"></ui-num-input>
    </ui-prop>

    <ui-label class="section-title" value="i18n:${global_1.PACKAGE_NAME}.options.channels"></ui-label>
    <div id="channelsSection" class="channel-chips">${channelRowsHtml}</div>
    <ui-prop id="selectedChannelsProp">
        <ui-label slot="label" value="i18n:${global_1.PACKAGE_NAME}.options.selectedChannels"></ui-label>
        <span slot="content" class="selected-channels-value">—</span>
    </ui-prop>
</div>
`;
exports.$ = {
    root: '.playable-ads-panel',
    appleUrlInput: '#appleUrlProp ui-input',
    appleUrlOpenBtn: '#appleUrlProp ui-button',
    googleUrlInput: '#googleUrlProp ui-input',
    googleUrlOpenBtn: '#googleUrlProp ui-button',
    compressionType: '#compressionTypeProp ui-select',
    compressionQualityProp: '#compressionQualityProp',
    compressionQuality: '#compressionQualityProp ui-num-input',
    audioCompressionEnabled: '#audioCompressionEnabledProp ui-checkbox',
    audioBitrateProp: '#audioBitrateProp',
    audioBitrate: '#audioBitrateProp ui-num-input',
    channelsSection: '#channelsSection',
    selectedChannelsValue: '#selectedChannelsProp .selected-channels-value',
};
/**
 * all change of options dispatched will enter here
 * @param options
 * @param key
 * @returns
 */
async function update(options, key) {
    if (key) {
        return;
    }
    // when import build options, key will bey ''
    init();
}
async function ready(options) {
    // @ts-ignore
    panel = this;
    panel.options = options;
    const saved = await loadSavedConfig();
    applySavedConfig(saved);
    init();
}
function close() {
    panel.$.appleUrlInput.removeEventListener('confirm', onAppleUrlChange);
    panel.$.appleUrlOpenBtn.removeEventListener('click', onOpenAppleUrlClick);
    panel.$.googleUrlInput.removeEventListener('confirm', onGoogleUrlChange);
    panel.$.googleUrlOpenBtn.removeEventListener('click', onOpenGoogleUrlClick);
    panel.$.compressionType.removeEventListener('change', onCompressionTypeChange);
    panel.$.compressionQuality.removeEventListener('confirm', onCompressionQualityChange);
    panel.$.audioCompressionEnabled.removeEventListener('change', onAudioCompressionEnabledChange);
    panel.$.audioBitrate.removeEventListener('confirm', onAudioBitrateChange);
    closeChannels();
}
function init() {
    panel.$.appleUrlInput.value = panel.options.appleUrl || '';
    panel.$.appleUrlInput.addEventListener('confirm', onAppleUrlChange);
    panel.$.appleUrlOpenBtn.addEventListener('click', onOpenAppleUrlClick);
    panel.$.googleUrlInput.value = panel.options.googleUrl || '';
    panel.$.googleUrlInput.addEventListener('confirm', onGoogleUrlChange);
    panel.$.googleUrlOpenBtn.addEventListener('click', onOpenGoogleUrlClick);
    panel.$.compressionType.value = panel.options.compressionType || channels_1.CompressionType.Lossy;
    panel.$.compressionType.addEventListener('change', onCompressionTypeChange);
    panel.$.compressionQuality.value = typeof panel.options.compressionQuality === 'number' ? panel.options.compressionQuality : 80;
    panel.$.compressionQuality.addEventListener('confirm', onCompressionQualityChange);
    updateCompressionQualityVisibility();
    panel.$.audioCompressionEnabled.value = panel.options.audioCompressionEnabled !== false;
    panel.$.audioCompressionEnabled.addEventListener('change', onAudioCompressionEnabledChange);
    panel.$.audioBitrate.value = typeof panel.options.audioBitrate === 'number' ? panel.options.audioBitrate : 64;
    panel.$.audioBitrate.addEventListener('confirm', onAudioBitrateChange);
    updateAudioBitrateVisibility();
    initChannels();
}
function initChannels() {
    closeChannels();
    const chips = Array.from(panel.$.channelsSection.querySelectorAll('.channel-chip'));
    channelChipBindings = chips.map(el => {
        const fieldKey = `${channels_1.CHANNEL_FIELD_PREFIX}${el.dataset.channel}`;
        el.classList.toggle('selected', panel.options[fieldKey] === true);
        // dạng enum: bấm để chọn, bấm lại (đang chọn) để bỏ chọn
        const handler = () => {
            const next = panel.options[fieldKey] !== true;
            panel.options[fieldKey] = next;
            el.classList.toggle('selected', next);
            panel.dispatch('update', `packages.${global_1.PACKAGE_NAME}.${fieldKey}`, next);
            saveConfig(fieldKey, next);
            updateSelectedChannelsSummary();
        };
        el.addEventListener('click', handler);
        return { el, handler };
    });
    updateSelectedChannelsSummary();
}
function closeChannels() {
    channelChipBindings.forEach(({ el, handler }) => el.removeEventListener('click', handler));
    channelChipBindings = [];
}
function updateSelectedChannelsSummary() {
    const selected = channels_1.CHANNEL_SORTED.filter(channel => panel.options[`${channels_1.CHANNEL_FIELD_PREFIX}${channel}`] === true);
    panel.$.selectedChannelsValue.textContent = selected.length ? selected.join(', ') : '—';
}
function onAppleUrlChange(event) {
    panel.options.appleUrl = event.target.value;
    panel.dispatch('update', `packages.${global_1.PACKAGE_NAME}.appleUrl`, panel.options.appleUrl);
    saveConfig('appleUrl', panel.options.appleUrl);
}
function onGoogleUrlChange(event) {
    panel.options.googleUrl = event.target.value;
    panel.dispatch('update', `packages.${global_1.PACKAGE_NAME}.googleUrl`, panel.options.googleUrl);
    saveConfig('googleUrl', panel.options.googleUrl);
}
function onOpenAppleUrlClick() {
    openLink(panel.$.appleUrlInput.value);
}
function onOpenGoogleUrlClick() {
    openLink(panel.$.googleUrlInput.value);
}
function openLink(url) {
    if (!url) {
        return;
    }
    const { shell } = require('electron');
    shell.openExternal(url);
}
function onCompressionTypeChange(event) {
    panel.options.compressionType = event.target.value;
    panel.dispatch('update', `packages.${global_1.PACKAGE_NAME}.compressionType`, panel.options.compressionType);
    saveConfig('compressionType', panel.options.compressionType);
    updateCompressionQualityVisibility();
}
function onCompressionQualityChange(event) {
    panel.options.compressionQuality = event.target.value;
    panel.dispatch('update', `packages.${global_1.PACKAGE_NAME}.compressionQuality`, panel.options.compressionQuality);
    saveConfig('compressionQuality', panel.options.compressionQuality);
}
function updateCompressionQualityVisibility() {
    // Compression Quality chỉ thực sự có tác dụng khi Lossy (xem build-engine.ts:
    // Lossless luôn gọi sharp với { lossless: true }, không dùng quality) -> ẩn với cả
    // None lẫn Lossless để tránh hiểu lầm field này có ảnh hưởng.
    panel.$.compressionQualityProp.style.display = panel.$.compressionType.value === channels_1.CompressionType.Lossy ? 'block' : 'none';
}
function onAudioCompressionEnabledChange(event) {
    panel.options.audioCompressionEnabled = event.target.value;
    panel.dispatch('update', `packages.${global_1.PACKAGE_NAME}.audioCompressionEnabled`, panel.options.audioCompressionEnabled);
    saveConfig('audioCompressionEnabled', panel.options.audioCompressionEnabled);
    updateAudioBitrateVisibility();
}
function onAudioBitrateChange(event) {
    panel.options.audioBitrate = event.target.value;
    panel.dispatch('update', `packages.${global_1.PACKAGE_NAME}.audioBitrate`, panel.options.audioBitrate);
    saveConfig('audioBitrate', panel.options.audioBitrate);
}
function updateAudioBitrateVisibility() {
    // Bỏ tick Compress Audio thì ẩn field Audio Bitrate
    panel.$.audioBitrateProp.style.display = panel.$.audioCompressionEnabled.value === false ? 'none' : 'block';
}
