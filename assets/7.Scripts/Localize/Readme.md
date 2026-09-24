# Hướng dẫn dùng Localize

Bộ script tự động dịch text cho Label theo ngôn ngữ máy user, gồm 2 file:

- **AutoLocalize.ts** — component gắn lên node có Label, tự detect ngôn ngữ + set lại text.
- **LocalizeData.ts** — nơi khai báo bản dịch cho từng chuỗi.

## Cách hoạt động

1. Gắn `AutoLocalize` lên node **đã có sẵn Label**.
2. Gõ chuỗi gốc (tiếng Anh) vào ô **Text** trên Inspector — đây là **key** để tra trong `LOCALIZE_DATA`.
3. Lúc `onLoad`, script sẽ:
   - Set `label.string = text` (bản gốc) trước, đo độ rộng label lúc này làm mốc.
   - Detect ngôn ngữ máy user (qua `navigator.languages` / `sys.language`).
   - Tra `LOCALIZE_DATA[text]` theo thứ tự ưu tiên: **mã ngôn ngữ đầy đủ** (vd `zh-cn`) → **mã gốc 2 ký tự** (vd `zh`) → **`en`** (ngôn ngữ nguồn) nếu không có bản dịch nào khớp.
   - Set text đã dịch, đo lại độ rộng label.
   - Nếu bản dịch **rộng hơn bản gốc**, tự động **thu nhỏ scale của node** theo đúng tỉ lệ chênh lệch để chữ không bị tràn khung.

Nếu `text` không có trong `LOCALIZE_DATA`, script giữ nguyên text gốc (không dịch, không co scale).

## Các thuộc tính trên Inspector


| Thuộc tính             | Công dụng                                                                                                                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Text`                   | Chuỗi gốc (tiếng Anh) — phải khớp**chính xác** với 1 key trong `LOCALIZE_DATA` (khoảng trắng đầu/cuối được tự trim).                                                                |
| `Debug`                  | Bật để ép ngôn ngữ test thay vì dùng ngôn ngữ máy thật.                                                                                                                                   |
| `Debug Language`         | Mã ngôn ngữ muốn ép khi test, vd`ja`, `ko`, `zh-cn`, `fr`... Chỉ có tác dụng khi `Debug` đang bật.                                                                                         |
| `Test` (nút)            | Tick vào đây để chạy lại`init()` ngay trong Editor (không cần bấm Play) — dùng xem trước kết quả dịch + co scale sau khi sửa `Text`, `Debug Language` hoặc sửa `LocalizeData.ts`. |
| `Set Origin Size` (nút) | Lưu scale hiện tại của node làm**kích thước gốc** (`Origin Size`) — dùng làm mốc để tính tỉ lệ thu nhỏ khi chữ dịch dài hơn bản gốc.                                         |
| `Origin Size`            | Giá trị scale gốc đã lưu (tự động lưu lần đầu nếu chưa set).                                                                                                                           |

## Quy trình dùng thực tế

1. Thiết kế UI với text gốc tiếng Anh, canh scale/vị trí Label như ý muốn.
2. Gắn component `AutoLocalize` lên node đó.
3. Gõ đúng chuỗi gốc vào ô **Text**.
4. Bấm **Set Origin Size** để chốt scale gốc hiện tại (làm **trước khi** bấm Test).
5. Bấm **Test** để xem thử bản dịch + kiểm tra co scale có hợp lý không.
6. Muốn kiểm tra riêng 1 ngôn ngữ: bật **Debug**, gõ mã ngôn ngữ vào **Debug Language**, rồi bấm **Test** lại.
7. Lặp lại bước 4–6 mỗi khi chỉnh lại scale gốc của node hoặc đổi nội dung `Text`.

> Lưu ý: nếu chỉnh scale node bằng tay sau khi đã set Origin Size, phải bấm **Set Origin Size** lại rồi mới **Test**, nếu không script sẽ ghi đè về scale gốc cũ đã lưu.

## Thêm chuỗi / ngôn ngữ mới

Chỉ cần sửa **`LocalizeData.ts`**, không đụng vào `AutoLocalize.ts`:

- **Thêm chuỗi mới**: thêm 1 entry vào `LOCALIZE_DATA`, key là chuỗi gốc tiếng Anh y hệt sẽ gõ vào ô `Text`.
- **Thêm ngôn ngữ mới**: thêm mã ngôn ngữ (vd `vi`, `nl`...) vào các entry đã có, không cần khai báo gì thêm ở nơi khác.

```ts
'Chuỗi mới': {
    en: 'New text',
    vi: 'Chữ mới',
    ja: '新しいテキスト',
    // ...
},
```
