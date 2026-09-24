# Playable Ads Builder (Cocos Creator build plugin)

Extension build cho Cocos Creator 3.8.8: sau khi build xong platform **Web Mobile**,
tự động đóng gói luôn thành **playable ad** cho nhiều mạng quảng cáo — không cần mở
app PlayableBuilder rời nữa. Toàn bộ pipeline (patch HTML, nén ảnh/audio, đóng gói
zip theo từng kênh) được port trực tiếp từ PlayableBuilder.

## Cài đặt

```bash
npm install
npm run build   # biên dịch source/ (TypeScript) -> dist/
```

Sau đó vào **Extension Manager** trong Cocos Creator, tìm plugin này và bấm
**Reload**. Có thể chạy `tsc -w` (hoặc `npm run build` mỗi lần sửa) để biên dịch lại
khi chỉnh sửa code trong `source/`.

## Cấu trúc

```
source/
├── builder.ts        # khai báo các field hiện trong panel Build (chỉ áp dụng platform Web Mobile)
├── hooks.ts           # hook onAfterBuild — điểm vào chính, gọi playable-build.ts
├── channels.ts        # danh sách 23 kênh quảng cáo + script CTA/SDK riêng từng kênh
├── packager.ts         # sinh tên file, ghi file phụ theo kênh (config.json/luna.json/...), nén zip
├── build-engine.ts      # nén ảnh (sharp/webp), nén audio (ffmpeg/mp3), đóng gói {channel}.zip.js
└── playable-build.ts     # patch index.html Cocos (system.bundle.js/import-map.json) + orchestrate

playable-engine/        # asset engine nhúng vào playable ad (copy từ PlayableBuilder/resources/playable)
├── BingoEngine.js
├── launcher.js
├── jszip.min.js
├── base122-decode.min.js
├── PlayableSDK.d.ts    # type def cho window.PlayableSDK - copy sang project GAME, không dùng ở đây
└── channels/           # PlayableSDK.js adapter riêng từng kênh (AppLovin.js, Facebook.js, ...)
```

## Các field trong panel Build

Chọn platform **Web Mobile** trong Build panel để thấy:

| Field | Ý nghĩa |
|---|---|
| Name *(field gốc của Cocos, ở đầu panel)* | Dùng làm tên game cho `{channel}_Name.html` và `luna.json` (UnityPlayworks) — không có field riêng của plugin |
| iOS Store Link / Android Store Link | Link store, chèn vào CTA (mraid.open, ExitApi.exit, ...) tuỳ kênh |
| 23 checkbox `AppLovin`, `Facebook`, `Google`, ... `PureHTML` | Tick kênh nào build kênh đó. Mỗi kênh là 1 field checkbox độc lập (`channel_<Tên>`) — không gộp chung 1 field, vì field kiểu object gộp bị Cocos serialize sai (xem lịch sử debug) |
| Output Path | Để trống thì xuất ra `<cấp cha của thư mục build>/<Name>` |
| Image Compression | None / Lossless / Lossy — ảnh được convert sang WebP khi build |
| Compression Quality | Áp dụng khi chọn Lossless/Lossy |
| Compress Audio | Bật/tắt nén audio sang mp3 qua ffmpeg |
| Audio Bitrate | kbps, áp dụng khi bật nén audio |

Không tick channel nào thì bỏ qua, không tạo file. Kết quả build được log ra Console của
Editor (đường dẫn + dung lượng từng file/zip).

## PlayableSDK.d.ts — dùng ở đâu?

File này **không phải cho extension**, mà cho **project game**: game gọi
`PlayableSDK.download()` / `game_end()` / `onPause(cb)` / `onResume(cb)` / `onMute` /
`onUnmute` / đọc `PlayableSDK.channel` để tích hợp lifecycle với playable ad. Copy
`playable-engine/PlayableSDK.d.ts` vào đâu đó trong `assets/` của project game (ví dụ
`assets/scripts/typings/`) để TypeScript của game nhận được autocomplete + type-check,
tránh lỗi `Cannot find name 'PlayableSDK'`.

## Lưu ý

- `sharp` và `ffmpeg-static` là native module — nếu Editor log cảnh báo
  "Không load được sharp/fluent-ffmpeg", ảnh/audio sẽ tự fallback giữ nguyên
  (không nén) thay vì làm fail cả build; cân nhắc chạy `npm rebuild` nếu cần nén thật.
- Plugin chỉ chạy khi build platform **Web Mobile** (khớp cấu trúc `index.html` +
  `src/system.bundle.js` + `src/import-map.json` mà pipeline giả định).
