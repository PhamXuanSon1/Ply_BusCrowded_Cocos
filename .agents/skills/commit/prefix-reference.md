# Bảng Tra Cứu Commit Prefix (Conventional Commits)

Tài liệu hướng dẫn chọn Prefix chuẩn cho Git Commit, áp dụng cho toàn bộ dự án và quy trình làm việc.

---

## Danh Sách Prefix Chuẩn

| Prefix       | Phân loại               | Ý nghĩa & Trường hợp sử dụng                                         |
| ------------ | ----------------------- | -------------------------------------------------------------------- |
| **feat**     | Tính năng mới           | Thêm chức năng mới, cơ chế gameplay mới hoặc hệ thống mới            |
| **update**   | Cập nhật / Cải tiến     | Cải tiến, nâng cấp hoặc tinh chỉnh chức năng hiện có (không phải lỗi)|
| **fix**      | Sửa lỗi                 | Sửa lỗi logic, sửa bug crash, lỗi hiển thị hoặc sai lệch dữ liệu     |
| **hotfix**   | Sửa lỗi khẩn cấp        | Sửa lỗi nghiêm trọng làm tắc luồng game hoặc dừng build khẩn cấp    |
| **refactor** | Tái cấu trúc            | Sắp xếp lại code, đổi cấu trúc module mà không đổi hành vi logic     |
| **perf**     | Tối ưu hiệu năng        | Tối ưu giảm drawcall, giảm dung lượng asset, tối ưu FPS / bộ nhớ     |
| **clean**    | Dọn dẹp                 | Xóa code thừa, console.log debug, biến không dùng, file rác          |
| **add**      | Bổ sung thành phần      | Thêm file asset mới, prefab mới, resource phụ hoặc cấu hình nhỏ      |
| **remove**   | Xóa bỏ                  | Xóa hẳn file, thư viện, hoặc tính năng cũ không còn dùng             |
| **style**    | Định dạng code          | Format code, khoảng trắng, dấu chấm phẩy, không ảnh hưởng logic      |
| **build**    | Đóng gói / Bản build    | Cấu hình build playable, file bundle, export HTML/ZIP, setting Cocos |
| **chore**    | Bảo trì công việc phụ   | Cập nhật package, chỉnh sửa gitignore, cấu hình tool nội bộ          |
| **revert**   | Hoàn tác commit         | Khôi phục lại trạng thái trước đó, hủy bỏ một commit cũ              |
| **docs**     | Tài liệu                | Cập nhật README, ghi chú kỹ thuật, hướng dẫn hoặc comment giải thích |

---

## Định Dạng Commit Chuẩn

```
<type>(<scope>): <tiêu đề ngắn gọn bằng tiếng Việt>

- <Mô tả chi tiết 1: cụ thể những gì đã làm ở hàm/class/node nào>
- <Mô tả chi tiết 2: lý do thay đổi hoặc hành vi logic mới>
- <Mô tả chi tiết 3: các thành phần/file phụ thuộc liên quan (nếu có)>
```

### Yêu cầu định dạng:
1. **`<type>`**: Chọn chính xác từ bảng prefix ở trên (chữ thường).
2. **`(<scope>)`**: Phạm vi ảnh hưởng, viết thường trong ngoặc đơn. Ví dụ: `(gameplay)`, `(map)`, `(bus)`, `(camera)`, `(floor)`, `(ui)`, `(manager)`, `(level)`.
3. **`<tiêu đề>`**: Viết bằng **tiếng Việt**, súc tích, dưới 50 ký tự, không kết thúc bằng dấu chấm.
4. **`<body>`**: BẮT BUỘC viết chi tiết bằng **tiếng Việt**, sử dụng các gạch đầu dòng `-`, giải thích rõ ràng chi tiết kỹ thuật.

---

## Ví Dụ Cụ Thể Trong Dự Án

### ✅ Chuẩn (Good)
```
feat(camera): đưa eulerAngles của Camera lên Inspector Game.ts

- Bổ sung nhóm thuộc tính G_CAM chứa tham chiếu cam và góc quay camEulerAngles.
- Thêm hàm applyCamRotation() để xoay WCam và đồng bộ HighCam cả trong edit mode lẫn runtime.
- Xóa bỏ việc ép xoay node Gameplay trong Game.init().
```

```
update(level): căn chỉnh vị trí bãi đỗ xe và cập nhật dữ liệu màn chơi

- Điều chỉnh lại vị trí và góc xoay các xe trên PlayScene.scene.
- Chạy Save Bus Data để đồng bộ lại BusData, ObstacleData và LinearHumanData trong Data.ts.
```

```
perf(floor): nén dung lượng texture nền và tối ưu vật liệu sàn

- Nén các file ảnh nền Park1, Park2, SakuraBG giảm ~80% dung lượng.
- Căn chỉnh lại tilingOffset trên các material Floor_*.mtl để hiển thị chuẩn tỷ lệ.
```

```
fix(ring): sửa lỗi người bị kẹt khi đổi làn thoát ra xe

- Bổ sung kiểm tra trạng thái di chuyển moving của human trước khi gán slot mới.
- Khắc phục hiện tượng góc quay người bị giật khi chuyển từ tọa độ local sang world.
```

### ❌ Sai quy cách (Bad)
- `update files` *(Quá chung chung, không rõ thay đổi gì)*
- `sửa map` *(Cộc lốc, không có prefix chuẩn, không có body mô tả chi tiết)*
- `fix stuff` *(Thiếu thông tin kỹ thuật)*
- `Done logic` *(Không biết đã làm những logic gì, file nào bị ảnh hưởng)*
- `wip` *(Không có thông tin về tính năng)*
