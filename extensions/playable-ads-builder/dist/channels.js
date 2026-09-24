"use strict";
/**
 * Danh sách kênh quảng cáo hỗ trợ + logic sinh script đặc thù cho từng kênh.
 * Port trực tiếp từ PlayableBuilder (Bingo Playable Ad Build Tool) main process,
 * giữ nguyên hành vi (giá trị enum, nội dung script) để output tương thích.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHANNEL_OPTION_FIELDS = exports.CHANNEL_FIELD_PREFIX = exports.CHANNEL_SORTED = exports.CHANNELS_REQUIRING_ZIP = exports.CompressionType = exports.CHANNEL = void 0;
exports.channelFieldKey = channelFieldKey;
exports.getChannelApiText = getChannelApiText;
exports.getChannelSpecificScript = getChannelSpecificScript;
var CHANNEL;
(function (CHANNEL) {
    CHANNEL["AppLovin"] = "AppLovin";
    CHANNEL["Facebook"] = "Facebook";
    CHANNEL["Unity"] = "Unity";
    CHANNEL["UnityPlayworks"] = "UnityPlayworks";
    CHANNEL["Mintegral"] = "Mintegral";
    CHANNEL["Google"] = "Google";
    CHANNEL["IronSource"] = "IronSource";
    CHANNEL["InMobi"] = "InMobi";
    CHANNEL["Kuaishou"] = "Kuaishou";
    CHANNEL["TikTok"] = "TikTok";
    CHANNEL["OceanEngine"] = "OceanEngine";
    CHANNEL["Pangle"] = "Pangle";
    CHANNEL["Vungle"] = "Vungle";
    CHANNEL["Moloco"] = "Moloco";
    CHANNEL["Chartboost"] = "Chartboost";
    CHANNEL["MRAID"] = "MRAID";
    CHANNEL["PureHTML"] = "PureHTML";
    CHANNEL["Tencent"] = "Tencent";
    CHANNEL["Liftoff"] = "Liftoff";
    CHANNEL["BIGO"] = "BIGO";
    CHANNEL["MyTarget"] = "MyTarget";
    CHANNEL["Snapchat"] = "Snapchat";
    CHANNEL["Kwai"] = "Kwai";
})(CHANNEL || (exports.CHANNEL = CHANNEL = {}));
var CompressionType;
(function (CompressionType) {
    CompressionType["None"] = "none";
    CompressionType["Lossless"] = "lossless";
    CompressionType["Lossy"] = "lossy";
})(CompressionType || (exports.CompressionType = CompressionType = {}));
/** Các kênh yêu cầu đóng gói zip (kèm config.json/luna.json/... riêng) thay vì xuất thẳng 1 file .html */
exports.CHANNELS_REQUIRING_ZIP = [
    CHANNEL.UnityPlayworks,
    CHANNEL.Mintegral,
    CHANNEL.Facebook,
    CHANNEL.Google,
    CHANNEL.TikTok,
    CHANNEL.OceanEngine,
    CHANNEL.Pangle,
    CHANNEL.Kuaishou,
    CHANNEL.Tencent,
    CHANNEL.BIGO,
    CHANNEL.Vungle,
    CHANNEL.Liftoff,
    CHANNEL.MyTarget,
    CHANNEL.Kwai,
];
exports.CHANNEL_SORTED = Object.values(CHANNEL)
    .sort((a, b) => a === CHANNEL.PureHTML ? 1 : b === CHANNEL.PureHTML ? -1 : a.localeCompare(b));
/**
 * field type:'object' + itemConfigs (gộp tất cả kênh vào 1 object) lưu dữ liệu KHÔNG đáng tin
 * cậy - test thực tế bị lệch/đánh index sai (bug "Kênh 0 không hợp lệ", rồi vẫn tự tick sai
 * kênh dù user không tick gì) -> bỏ hẳn cách gộp, mỗi kênh là 1 field checkbox ĐỘC LẬP ở
 * top-level (giống hệt field audioCompressionEnabled - loại field duy nhất chưa từng có bug suốt
 * quá trình test). Tên field = CHANNEL_FIELD_PREFIX + tên kênh, ví dụ "channel_AppLovin".
 */
exports.CHANNEL_FIELD_PREFIX = 'channel_';
function channelFieldKey(channel) {
    return `${exports.CHANNEL_FIELD_PREFIX}${channel}`;
}
/**
 * Không có "render" -> field vẫn được Editor coi là 1 phần dữ liệu build task hợp lệ (khởi tạo
 * default, lưu/cache giữa các lần mở Build panel) nhưng không có gì để tự vẽ control trong khu vực
 * "options", vì UI thật (checkbox, đặt xuống cuối panel) đã được ./panel.ts tự vẽ.
 */
exports.CHANNEL_OPTION_FIELDS = exports.CHANNEL_SORTED.reduce((acc, channel) => {
    acc[channelFieldKey(channel)] = { default: false };
    return acc;
}, {});
/**
 * Script gọi API mở store / kết thúc game cho từng kênh, chèn vào trước </head>.
 * Hàm `bingoPlayableApiDemo()` được BingoEngine.js / PlayableSDK.js (channel adapter) gọi khi
 * người chơi bấm CTA.
 */
function getChannelApiText(channel, product) {
    const appleUrl = product.appleUrl || '';
    const googleUrl = product.googleUrl || '';
    const mraidOpenScript = () => `
        <script type="text/javascript">
        function bingoPlayableApiDemo(){if(typeof mraid==='undefined')return;var _i="${appleUrl}",_a="${googleUrl}",_u=/iPhone|iPad|iPod/i.test(navigator.userAgent)?(_i||_a):(_a||_i),_s=mraid.getState();if(_s==='loading'){mraid.addEventListener('ready',function(){mraid.open(_u);});}else{mraid.open(_u);}mraid.addEventListener('orientationChange',function(){window.dispatchEvent(new Event('resize'));});}
        </script>
    `;
    switch (channel) {
        case CHANNEL.AppLovin:
        case CHANNEL.MRAID:
        case CHANNEL.Chartboost:
        case CHANNEL.Unity:
            return mraidOpenScript();
        case CHANNEL.BIGO:
            return '\n        <script type="text/javascript">\n        function bingoPlayableApiDemo(){window.BGY_MRAID.open(),window.BGY_MRAID.gameReady(),window.BGY_MRAID.gameEnd()}\n        </script>\n    ';
        case CHANNEL.Facebook:
            return '\n        <script type="text/javascript">\n        function bingoPlayableApiDemo(){FbPlayableAd.onCTAClick()}\n        </script>\n    ';
        case CHANNEL.Google:
            return '\n        <script type="text/javascript">\n        function bingoPlayableApiDemo(){ExitApi.exit()}\n        </script>\n    ';
        case CHANNEL.IronSource:
            return '\n        <script type="text/javascript">\n        function bingoPlayableApiDemo(){dapi.openStoreUrl()}\n        </script>\n    ';
        case CHANNEL.InMobi:
            return `
        <script type="text/javascript">
        function bingoPlayableApiDemo(){typeof FbPlayableAd!=="undefined"&&FbPlayableAd.onCTAClick&&FbPlayableAd.onCTAClick();if(typeof mraid==='undefined')return;var _i="${appleUrl}",_a="${googleUrl}",_u=/iPhone|iPad|iPod/i.test(navigator.userAgent)?(_i||_a):(_a||_i),_s=mraid.getState();if(_s==='loading'){mraid.addEventListener('ready',function(){mraid.open(_u);});}else{mraid.open(_u);}mraid.addEventListener('orientationChange',function(){window.dispatchEvent(new Event('resize'));});}
        </script>
    `;
        case CHANNEL.Kuaishou:
        case CHANNEL.Kwai:
            return '\n        <script type="text/javascript">\n        function bingoPlayableApiDemo(){window.playableSDK&&window.playableSDK.openAppStore&&window.playableSDK.openAppStore(),window.playableSDK&&window.playableSDK.sendEvent&&window.playableSDK.sendEvent()}\n        </script>\n    ';
        case CHANNEL.Liftoff:
            return '\n        <script type="text/javascript">\n        function bingoPlayableApiDemo(){parent.postMessage("download", "*"),parent.postMessage("complete", "*")}\n        </script>\n    ';
        case CHANNEL.Mintegral:
            return '\n        <script type="text/javascript">\n        function bingoPlayableApiDemo(){window.install(),window.gameReady(),window.gameEnd()}\n        </script>\n    ';
        case CHANNEL.Moloco:
            return '\n        <script type="text/javascript">\n        function bingoPlayableApiDemo(){FbPlayableAd.onCTAClick()}\n        </script>\n    ';
        case CHANNEL.MyTarget:
            return '\n        <script type="text/javascript">\n        function bingoPlayableApiDemo(){MTRG.onCTAClick()}\n        </script>\n    ';
        case CHANNEL.Snapchat:
            return '\n        <script type="text/javascript">\n        function bingoPlayableApiDemo(){snapchatCta()}\n        </script>\n    ';
        case CHANNEL.Tencent:
            return '\n        <script type="text/javascript">\n        function bingoPlayableApiDemo(){window._gdtUnSdk=new window.GDTUnSdk({type:"playable",onSuccess:function(n){console.log(n)},onError:n=>{console.log(n)}}),window._gdtUnSdk.playAble.onClick()}\n        </script>\n    ';
        case CHANNEL.TikTok:
        case CHANNEL.OceanEngine:
        case CHANNEL.Pangle:
            return '\n        <script type="text/javascript">\n        function bingoPlayableApiDemo(){window.openAppStore()}\n        </script>\n    ';
        case CHANNEL.Vungle:
            return '\n        <script type="text/javascript">\n        function bingoPlayableApiDemo(){parent.postMessage("download", "*"),parent.postMessage("complete", "*")}\n        </script>\n    ';
        case CHANNEL.UnityPlayworks:
            return '\n        <script type="text/javascript">\n        function bingoPlayableApiDemo(){var w=window;if("platformCTACall"in w&&typeof w.platformCTACall==="function"){w.platformCTACall.call(null);}else if(w.Luna&&w.Luna.Unity&&w.Luna.Unity.Playable&&typeof w.Luna.Unity.Playable.InstallFullGame==="function"){w.Luna.Unity.Playable.InstallFullGame();}if("platformGameEnded"in w&&typeof w.platformGameEnded==="function"){w.platformGameEnded.call(null);}else if(w.Luna&&w.Luna.Unity&&w.Luna.Unity.LifeCycle&&typeof w.Luna.Unity.LifeCycle.GameEnded==="function"){w.Luna.Unity.LifeCycle.GameEnded();}}\n        </script>\n    ';
        default:
            return '';
    }
}
/** SDK ngoài (CDN) mà một số kênh yêu cầu chèn vào <head> */
function getChannelSpecificScript(channel) {
    switch (channel) {
        case CHANNEL.UnityPlayworks:
            return {
                scriptContent: '<script type="text/javascript" src="https://code.lunalabs.io/js-sdk/v0.0.10/index.js"></script>',
                replaceTarget: '</head>',
            };
        case CHANNEL.Google:
            return {
                scriptContent: '<meta name="ad.orientation" content="portrait,landscape">\n<script type="text/javascript" src="https://tpc.googlesyndication.com/pagead/gadgets/html5/api/exitapi.js"></script>',
                replaceTarget: '</head>',
            };
        case CHANNEL.TikTok:
        case CHANNEL.OceanEngine:
        case CHANNEL.Pangle:
            return {
                scriptContent: '<script type="text/javascript" src="https://sf16-muse-va.ibytedtos.com/obj/union-fe-nc-i18n/playable/sdk/playable-sdk.js"></script>',
                replaceTarget: '</head>',
            };
        case CHANNEL.Kuaishou:
        case CHANNEL.Kwai:
            return {
                scriptContent: '<script type="text/javascript" src="https://static.yximgs.com/kos/nlav10715/playable-sdk.js"></script>',
                replaceTarget: '</head>',
            };
        case CHANNEL.Tencent:
            return {
                scriptContent: '<script type="text/javascript" src="https://qzs.gdtimg.com/union/res/union_sdk/page/unjs/unsdk.js"></script>',
                replaceTarget: '</head>',
            };
        case CHANNEL.IronSource:
            return {
                scriptContent: '<script type="text/javascript">function getScript(e,i){var n=document.createElement("script");n.type="text/javascript",n.async=!0,i&&(n.onload=i),n.src=e,document.head.appendChild(n)}function parseMessage(e){var i=e.data,n=i.indexOf(DOLLAR_PREFIX+RECEIVE_MSG_PREFIX);return-1!==n?getMessageParams(i.slice(n+2)):{}}function getMessageParams(e){var i,n=[],t=e.split("/"),a=t.length;if(-1===e.indexOf(RECEIVE_MSG_PREFIX)){if(a>=2&&a%2==0)for(i=0;a>i;i+=2)n[t[i]]=t.length<i+1?null:decodeURIComponent(t[i+1])}else{var o=e.split(RECEIVE_MSG_PREFIX);void 0!==o[1]&&(n=JSON&&JSON.parse(o[1]))}return n}function getDapi(e){var i=parseMessage(e);i&&i.name!==GET_DAPI_URL_MSG_NAME||getScript(i.data,onDapiReceived)}function invokeDapiListeners(){for(var e in dapiEventsPool)dapiEventsPool.hasOwnProperty(e)&&dapi.addEventListener(e,dapiEventsPool[e])}function onDapiReceived(){dapi=window.dapi,window.removeEventListener("message",getDapi),invokeDapiListeners()}function init(){window.dapi.isDemoDapi&&(window.parent.postMessage(DOLLAR_PREFIX+SEND_MSG_PREFIX+JSON.stringify({state:"getDapiUrl"}),"*"),window.addEventListener("message",getDapi,!1))}var DOLLAR_PREFIX="$$",RECEIVE_MSG_PREFIX="DAPI_SERVICE:",SEND_MSG_PREFIX="DAPI_AD:",GET_DAPI_URL_MSG_NAME="connection.getDapiUrl",dapiEventsPool={},dapi=window.dapi||{isReady:function(){return!1},addEventListener:function(e,i){dapiEventsPool[e]=i},removeEventListener:function(e){delete dapiEventsPool[e]},isDemoDapi:!0};init();</script>',
                replaceTarget: '</head>',
            };
        case CHANNEL.BIGO:
            return {
                scriptContent: '<script type="text/javascript" src="https://static-web.likeevideo.com/as/common-static/big-data/dsp-public/bgy-mraid-sdk.js"></script>',
                replaceTarget: '</head>',
            };
        case CHANNEL.Unity:
        case CHANNEL.MRAID:
            return {
                scriptContent: '<script src="mraid.js"></script>',
                replaceTarget: '</head>',
            };
        default:
            return { replaceTarget: '' };
    }
}
