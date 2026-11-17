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
exports.collectExcludedImageHashes = collectExcludedImageHashes;
/**
 * Quet asset-db cua CHINH project dang build, tim nhung anh KHONG duoc nen lai (webp) luc dong goi
 * playable - vi 2 ly do nguoi dung yeu cau:
 *   1. Texture da bat "Use Compress Texture" (userData.compressSettings.useCompressTexture = true
 *      trong .meta) - da xac nhan dung field nay bang cach doc that 1 file .meta trong project.
 *   2. Anh thuoc 1 Auto Atlas (file "*.pac", importer = "auto-atlas") - atlas tu dong gom nhieu
 *      sprite thanh 1 texture lon, ban than file .pac.meta cung co the bat compressSettings rieng.
 *      Nen lai (dac biet la lossy) de sheet atlas co the gay rach/lem mau giua cac sprite da gop.
 *
 * Cach doi chieu VOI FILE THAT trong output web-mobile: Cocos dung uuid "nen" (compressed uuid,
 * khong phai chuoi uuid dang 8-4-4-4-12 thong thuong) de dat ten file trong assets/<bundle>/native/
 * cua build output - KHONG co cong thuc giai ma on dinh/tai lieu hoa de tu suy ra tu ben ngoai. Vi
 * vay module nay KHONG co gang doan ten file: thay vao do, lay truc tiep FILE DA BIEN DICH cua moi
 * asset bi danh dau qua `AssetInfo.library[ext]` (duong dan that tren dia, co san qua asset-db) roi
 * BAM NOI DUNG (sha256). Luc quet file that trong web-mobile (build-engine.ts), moi anh cung duoc
 * bam roi doi chieu tap hop nay - khop theo NOI DUNG BYTE, khong phu thuoc ten file/uuid nen.
 *
 * Tra ve Map (khong phai Set) hash -> nhan mo ta (ten + ly do) de build-engine.ts log ra duoc CHINH
 * XAC anh nao khop voi ly do gi - phuc vu debug khi nguoi dung nghi ngo tinh nang khong hoat dong.
 */
const fs = __importStar(require("fs-extra"));
const crypto = __importStar(require("crypto"));
const IMAGE_LIBRARY_EXT = /\.(png|jpe?g|webp)$/i;
function log(...arg) {
    return console.log('[playable-ads-builder]', ...arg);
}
async function hashFile(filePath) {
    try {
        const data = await fs.readFile(filePath);
        return crypto.createHash('sha256').update(data).digest('hex');
    }
    catch {
        return null; // file co the chua import xong hoac duong dan khong hop le - bo qua, khong lam hong ca lan build
    }
}
async function addLibraryImageHashes(assetInfo, hashes, label) {
    const library = assetInfo?.library || {};
    let added = 0;
    for (const ext in library) {
        if (!IMAGE_LIBRARY_EXT.test(ext))
            continue;
        const hash = await hashFile(library[ext]);
        if (hash) {
            hashes.set(hash, label);
            added++;
        }
    }
    if (added === 0) {
        log(`  ⚠ "${label}": không đọc được file ảnh đã biên dịch nào (library không có .png/.jpg/.webp) - bỏ qua, không loại trừ được asset này.`);
    }
}
/**
 * @returns Map hash sha256 (hex) -> nhan mo ta cua moi file anh KHONG duoc nen. Rong neu quet
 *          loi/khong co gi dac biet - luc do pipeline nen hoat dong binh thuong nhu truoc.
 */
async function collectExcludedImageHashes() {
    const hashes = new Map();
    try {
        // 1) Texture/ImageAsset co bat "Use Compress Texture" rieng tung anh.
        const images = await Editor.Message.request('asset-db', 'query-assets', { ccType: 'cc.ImageAsset' });
        log(`Quét "Use Compress Texture": tìm thấy ${images?.length || 0} cc.ImageAsset trong project.`);
        let compressTextureCount = 0;
        for (const img of images || []) {
            try {
                const meta = await Editor.Message.request('asset-db', 'query-asset-meta', img.uuid);
                if (meta?.userData?.compressSettings?.useCompressTexture === true) {
                    compressTextureCount++;
                    const label = `${img.name || img.uuid} (Use Compress Texture)`;
                    log(`  ✓ ${label} - ${img.source || img.url || img.uuid}`);
                    await addLibraryImageHashes(img, hashes, label);
                }
            }
            catch (err) {
                log(`  ⚠ Không đọc được meta của asset ${img?.uuid} - bỏ qua:`, err);
            }
        }
        log(`  -> ${compressTextureCount}/${images?.length || 0} ảnh có bật "Use Compress Texture".`);
        // 2) Anh sinh ra tu Auto Atlas (.pac) - lay truc tiep texture atlas da gop, khong can
        // doan tung sprite con nao duoc gop vao (removeImageInBundle/removeTextureInBundle mac
        // dinh deu true nen sprite goc khong con xuat hien rieng trong build web-mobile nua).
        const atlases = await Editor.Message.request('asset-db', 'query-assets', { importer: 'auto-atlas' });
        log(`Quét Auto Atlas: tìm thấy ${atlases?.length || 0} file .pac trong project.`);
        for (const atlas of atlases || []) {
            const label = `${atlas.name || atlas.uuid} (Auto Atlas: ${atlas.source || atlas.url || atlas.uuid})`;
            log(`  ✓ ${label}`);
            await addLibraryImageHashes(atlas, hashes, label);
            const subAssets = atlas?.subAssets || {};
            for (const key in subAssets) {
                await addLibraryImageHashes(subAssets[key], hashes, `${label} / sub-asset ${key}`);
            }
        }
        log(`Tổng cộng: ${hashes.size} hash ảnh sẽ được loại trừ khỏi nén (nếu tìm thấy đúng file trong build web-mobile).`);
    }
    catch (err) {
        console.warn('[playable-ads-builder] Quét danh sách ảnh loại trừ (compress texture/auto atlas) thất bại, sẽ nén như bình thường:', err);
    }
    return hashes;
}
