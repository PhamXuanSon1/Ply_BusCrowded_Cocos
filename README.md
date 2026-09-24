Build ra, tìm trong file Unity


!function(){function __adapter_unzip(){console.time("load resource"),window.__adapter_resource__=window.__adapter_resource__||{};var _=new JSZip;let o=0;_.loadAsync(window.__adapter_zip__,{base64:!0}).then(_=>{for(const n in _.files)if(!_.files[n].dir){o++;let e=n;_.file(e).async("string").then(_=>{window.__adapter_resource__[e]=_,0==--o&&(console.timeEnd("load resource"),__adapter_exec_js())})}}).catch(_=>{throw _})}function __adapter_exec_js(){window.__adapter_js__={};for(const e in window.__adapter_resource__){var _=e.split(".");"js"===_[_.length-1]&&(window.__adapter_js__[e]=window.__adapter_resource__[e])}__adapter_success()}function __adapter_console(){window.__adapter_js__["vconsole.min.js"]&&(eval(window.__adapter_js__["vconsole.min.js"]),delete window.__adapter_js__["vconsole.min.js"],window.VConsole)&&(window.vConsole=new VConsole)}function __adapter_success(){__adapter_console(),window.__adapter_init&&window.__adapter_init()}window.JSZip?__adapter_unzip():__adapter_exec_js()}();

replace thành 

const startCocos=()=>{function __adapter_unzip(){console.time("load resource"),window.__adapter_resource__=window.__adapter_resource__||{};var _=new JSZip;let o=0;_.loadAsync(window.__adapter_zip__,{base64:!0}).then(_=>{for(const n in _.files)if(!_.files[n].dir){o++;let e=n;_.file(e).async("string").then(_=>{window.__adapter_resource__[e]=_,0==--o&&(console.timeEnd("load resource"),__adapter_exec_js())})}}).catch(_=>{throw _})}function __adapter_exec_js(){window.__adapter_js__={};for(const e in window.__adapter_resource__){var _=e.split(".");"js"===_[_.length-1]&&(window.__adapter_js__[e]=window.__adapter_resource__[e])}__adapter_success()}function __adapter_console(){window.__adapter_js__["vconsole.min.js"]&&(eval(window.__adapter_js__["vconsole.min.js"]),delete window.__adapter_js__["vconsole.min.js"],window.VConsole)&&(window.vConsole=new VConsole)}function __adapter_success(){__adapter_console(),window.__adapter_init&&window.__adapter_init()}window.JSZip?__adapter_unzip():__adapter_exec_js()};function waitForRealVisible(cb){const check = () => {if ( document.visibilityState === "visible" && window.innerWidth > 0 && window.innerHeight > 0) {cb();} else {requestAnimationFrame(check);}};check();};waitForRealVisible(startCocos);


thêm link dưới dạng comment vào head file Unity, ví dụ:

    <!--https://play.google.com/store/apps/details?id=com.av.screwout

    -->

    <!--https://apps.apple.com/us/app/screwout-puzzle/id6748551482

    -->
