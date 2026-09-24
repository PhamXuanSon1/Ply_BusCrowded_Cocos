"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetProcessedFiles = resetProcessedFiles;
exports.getProcessedFiles = getProcessedFiles;
exports.ensureDirectoryExists = ensureDirectoryExists;
exports.sanitizeFileName = sanitizeFileName;
exports.sanitizeFolderName = sanitizeFolderName;
exports.generateFileName = generateFileName;
exports.processChannelFiles = processChannelFiles;
const path = __importStar(require("path"));
const fs = __importStar(require("fs-extra"));
// @ts-ignore - no bundled types published under this import path in this project's node_modules layout
const AdmZip = require("adm-zip");
const channels_1 = require("./channels");
let processedFiles = [];
function resetProcessedFiles() {
    processedFiles = [];
}
function getProcessedFiles() {
    return processedFiles;
}
async function ensureDirectoryExists(dir) {
    try {
        if (!(await fs.pathExists(dir))) {
            await fs.mkdir(dir);
        }
    }
    catch (err) {
        console.error(`Lỗi khi tạo thư mục ${dir}:`, err);
        throw err;
    }
}
function sanitizeFileName(name) {
    return name.replace(/[^a-zA-Z0-9_]/g, '');
}
/** Loại ký tự không hợp lệ trong tên thư mục Windows/macOS, dùng khi lấy tên game làm output folder mặc định */
function sanitizeFolderName(name) {
    return name.replace(/[<>:"/\\|?*]/g, '_');
}
const FILENAME_CHANNEL_PLACEHOLDERS = ['{渠道}', '{channel}', '{kênh}'];
/** filename = "{channel}_TênGame" -> "AppLovin_TênGame.html" */
function generateFileName(filenameTemplate, channel) {
    let name = filenameTemplate;
    FILENAME_CHANNEL_PLACEHOLDERS.forEach(p => {
        name = name.replace(p, channel);
    });
    name = name.replace('渠道', channel);
    if (channel === channels_1.CHANNEL.Mintegral) {
        name = sanitizeFileName(name);
    }
    return name + '.html';
}
async function recordProcessedFile(filePath, size) {
    const mb = (size / 1048576).toFixed(1);
    console.log(`[playable-ads-builder] ${path.basename(filePath)} đã xử lý xong.`);
    processedFiles.push(`${filePath} ${mb}MB`);
}
async function zipFolder(dir, zip) {
    const entries = await fs.readdir(dir);
    await Promise.all(entries.map(async (entry) => {
        const full = path.join(dir, entry);
        if ((await fs.stat(full)).isDirectory()) {
            zip.addLocalFolder(full);
            await zipFolder(full, zip);
        }
        else {
            zip.addLocalFile(full);
        }
    }));
}
/**
 * Ghi các file phụ theo yêu cầu riêng của từng kênh (config.json/luna.json/...) vào thư mục `dir`
 * trước khi nén thành zip. `htmlContent` = html đã patch, `zipJsContent` = nội dung {channel}.zip.js,
 * `product` = thông tin game (dùng cho luna.json của UnityPlayworks).
 */
async function writeChannelSpecificFiles(channel, dir, htmlContent, zipJsContent, product) {
    const htmlFileName = path.basename(dir) + '.html';
    switch (channel) {
        case channels_1.CHANNEL.UnityPlayworks: {
            const withStartGame = (html) => {
                const script = '<script> !function(){var i=window.__launcher;if(i&&"function"==typeof i.initialize){var n=i.initialize.bind(i),a=!1;window.startGame=function(){a||(a=!0,n())},i.initialize=function(){"Luna"in window||window.startGame()}}else console.error("[PlayableSDK:UnityPlayworks:startGame] window.__launcher not in the expected shape; aborting.")}(); </script>';
                return html.includes('</body>') ? html.replace('</body>', () => `${script}</body>`) : `${html}${script}`;
            };
            await fs.writeFile(path.join(dir, 'source.html'), withStartGame(htmlContent), 'utf-8');
            const displayName = product.name || 'Playable';
            await fs.writeFile(path.join(dir, 'luna.json'), JSON.stringify({
                unity: {
                    packages: {
                        default: {
                            applicationName: displayName,
                            iosLink: product.appleUrl || '',
                            androidLink: product.googleUrl || '',
                            orientation: 'unspecified',
                            supportedLanguages: ['en'],
                        },
                        ironsource: { appID: '', assetID: '', applicationGenre: '', versionName: '', apiType: 0, playableMode: 0, packageType: 0 },
                        facebook: { assetID: '', packageType: 0 },
                        tiktok: { orientation: 0 },
                    },
                },
            }, null, 4), 'utf-8');
            await fs.writeFile(path.join(dir, 'playground.json'), JSON.stringify({
                title: displayName, icon: null, fields: {}, assets: {}, sections: [],
            }, null, 4), 'utf-8');
            break;
        }
        case channels_1.CHANNEL.Mintegral:
            await fs.writeFile(path.join(dir, htmlFileName), htmlContent, 'utf-8');
            break;
        case channels_1.CHANNEL.Facebook:
            await fs.writeFile(path.join(dir, 'zip.js'), zipJsContent, 'utf-8');
            await fs.writeFile(path.join(dir, 'index.html'), htmlContent, 'utf-8');
            break;
        case channels_1.CHANNEL.Google:
            await fs.writeFile(path.join(dir, 'index.html'), htmlContent, 'utf-8');
            break;
        case channels_1.CHANNEL.TikTok:
        case channels_1.CHANNEL.OceanEngine:
        case channels_1.CHANNEL.Pangle:
            await fs.writeFile(path.join(dir, 'config.json'), '{ "playable_orientation": 0 }', 'utf-8');
            await fs.writeFile(path.join(dir, 'index.html'), htmlContent, 'utf-8');
            break;
        case channels_1.CHANNEL.Kuaishou:
        case channels_1.CHANNEL.Kwai:
            await fs.writeFile(path.join(dir, 'config.json'), JSON.stringify({
                name: 'playable', version: '0.0.1', config: { playable_orientation: 0 },
            }, null, 2), 'utf-8');
            await fs.writeFile(path.join(dir, 'index.html'), htmlContent, 'utf-8');
            break;
        case channels_1.CHANNEL.Tencent:
            await fs.writeFile(path.join(dir, 'config.json'), '{"name":"Playable","version":"0.0.1","config":{"play_direction":0}}', 'utf-8');
            await fs.writeFile(path.join(dir, 'index.html'), htmlContent, 'utf-8');
            break;
        case channels_1.CHANNEL.BIGO:
            await fs.writeFile(path.join(dir, 'config.json'), '{ "orientation": 0 }', 'utf-8');
            await fs.writeFile(path.join(dir, 'index.html'), htmlContent, 'utf-8');
            break;
        case channels_1.CHANNEL.Vungle:
        case channels_1.CHANNEL.Liftoff:
        case channels_1.CHANNEL.MyTarget:
            await fs.writeFile(path.join(dir, 'index.html'), htmlContent, 'utf-8');
            break;
        default:
            return;
    }
}
/**
 * Ghi output cuối cùng cho 1 kênh: kênh cần zip -> tạo thư mục tạm, ghi các file phụ, nén .zip;
 * kênh không cần zip -> ghi thẳng file .html vào outputPath.
 */
async function processChannelFiles(channel, fileName, outputPath, htmlContent, zipJsContent, product) {
    try {
        if (channels_1.CHANNELS_REQUIRING_ZIP.includes(channel)) {
            const baseName = fileName.replace('.html', '');
            const workDir = path.join(outputPath, baseName);
            await ensureDirectoryExists(workDir);
            await writeChannelSpecificFiles(channel, workDir, htmlContent, zipJsContent, product);
            const zip = new AdmZip();
            await zipFolder(workDir, zip);
            const zipPath = workDir + '.zip';
            zip.writeZip(zipPath);
            await fs.remove(workDir);
            const stat = await fs.stat(zipPath);
            await recordProcessedFile(zipPath, stat.size);
        }
        else {
            const outFile = path.join(outputPath, fileName);
            await fs.writeFile(outFile, htmlContent, 'utf-8');
            const stat = await fs.stat(outFile);
            await recordProcessedFile(outFile, stat.size);
        }
    }
    catch (err) {
        console.error('[playable-ads-builder] Xử lý kênh thất bại:', err);
        throw err;
    }
}
