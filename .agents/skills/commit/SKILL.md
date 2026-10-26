---
name: commit
description: Thực hiện commit git chuẩn semantic tự động, bóc tách commit riêng từng chức năng (atomic commit), viết commit message chi tiết bằng tiếng Việt và stage từng file cụ thể mà không cần hỏi duyệt lại. Sử dụng khi commit code, quản lý lịch sử git, hoặc khi người dùng yêu cầu commit/push.
allowed-tools: Bash(git *), Read
---

# Quy Trình Git Commit Chuẩn Semantic & Bóc Tách Từng Chức Năng (Tự Động)

Quy trình tự động hóa toàn bộ việc commit: bóc tách từng chức năng, stage từng file cụ thể, tạo commit message chi tiết bằng Tiếng Việt và thực thi commit trực tiếp mà **không cần hỏi duyệt lại**.

---

## 3 Nguyên Tắc Cốt Lõi Bắt Buộc

1. **LUÔN COMMIT RIÊNG TỪNG CHỨC NĂNG (Atomic Commit)**:
   - **Tuyệt đối KHÔNG gộp nhiều tính năng / chức năng khác nhau vào 1 commit duy nhất**.
   - Phân tích kỹ `git diff` và bóc tách thành các nhóm độc lập theo từng chức năng (ví dụ: logic gameplay, layout level/scene, tối ưu asset/material, sửa bug...).
   - Nếu có 2 hay nhiều chức năng khác nhau được thay đổi trong phiên làm việc, **BẮT BUỘC phải tạo các commit riêng biệt tương ứng cho từng chức năng**.

2. **COMMIT BẰNG TIẾNG VIỆT CHI TIẾT**:
   - Toàn bộ commit message (tiêu đề và nội dung mô tả) **phải được viết bằng Tiếng Việt chuẩn mực, rõ ràng**.
   - Định dạng bắt buộc:
     ```
     <type>(<scope>): <tiêu đề ngắn gọn bằng tiếng Việt>

     - <Chi tiết 1: cụ thể những gì đã làm ở hàm/class/node nào>
     - <Chi tiết 2: lý do thay đổi hoặc hành vi mới>
     - <Chi tiết 3: các thành phần/file phụ thuộc liên quan (nếu có)>
     ```
   - Tiêu đề: dưới 50 ký tự, súc tích.
   - Body: Bắt buộc dùng các gạch đầu dòng `-` mô tả chi tiết từng thay đổi kỹ thuật.

3. **STAGE TỪNG FILE CỤ THỂ (No Wildcards)**:
   - **Nghiêm cấm** sử dụng `git add -A` hoặc `git add .`.
   - Phải dùng lệnh `git add <đường_dẫn_file>` cụ thể cho từng file thuộc về chức năng đang được commit.
   - Các file thuộc chức năng khác phải để lại cho commit tiếp theo.

---

## Điều Cấm (Strict Prohibitions)

- **CẤM** dừng lại hỏi duyệt hay dùng `ask_question` để xin xác nhận commit (người dùng đã ủy quyền tự động commit).
- **CẤM** `git add -A` hoặc `git add .` (ngoại trừ trường hợp đặc biệt cập nhật hàng loạt qua công cụ tự động).
- **CẤM** gộp các thay đổi không liên quan vào cùng một commit (ví dụ: vừa sửa shader vừa đổi logic xe).
- **CẤM** commit thông điệp cẩu thả, qua loa (ví dụ: `update files`, `sửa map`, `fix stuff`, `Done logic`, `wip`).
- **CẤM** chèn bất kỳ dòng credit / watermark nào của AI vào commit message:
  - `Generated with [Claude Code](https://claude.com/claude-code)`
  - `Co-Authored-By: Claude <noreply@anthropic.com>`

---

## Quy Trình Tự Động Thực Hiện

Sao chép tiến trình này để theo dõi khi thực hiện:

Task Progress:
- [ ] Bước 1: Kiểm tra trạng thái thay đổi (`git status`, `git diff`)
- [ ] Bước 2: Bóc tách thay đổi theo từng chức năng độc lập (Atomic Commit)
- [ ] Bước 3: Chọn Prefix chuẩn & Soạn message tiếng Việt chi tiết cho từng commit
- [ ] Bước 4: Tự động stage từng file cụ thể và commit tuần tự (Không cần hỏi duyệt)
- [ ] Bước 5: Báo cáo kết quả tổng kết chi tiết từng commit

---

### Bước 1: Kiểm Tra Trạng Thái Thay Đổi

Chạy các lệnh kiểm tra:
```bash
git status
git diff
git diff --cached
git log --oneline -5
```

---

### Bước 2: Bóc Tách Thay Đổi Theo Từng Chức Năng

Phân tích `git diff` và phân loại danh sách file thay đổi thành các **nhóm chức năng riêng biệt**:
- **Nhóm Tính năng/Logic**: Code script TypeScript xử lý gameplay, manager, controller...
- **Nhóm Level/Scene**: Scene (`.scene`), dữ liệu layout bàn chơi (`Data.ts`), cấu hình level...
- **Nhóm Asset/Đồ họa**: Prefab, Material (`.mtl`), Texture/Sprite (`.png`), Shader...
- **Nhóm Tối ưu/Dọn dẹp**: Nén file, xóa code thừa, refactor cấu trúc...

> [!IMPORTANT]
> Nếu các thay đổi có mục đích khác nhau, **bắt buộc phải chia thành nhiều commit tuần tự**, không được gom làm một.

---

### Bước 3: Chọn Prefix & Soạn Commit Message Tiếng Việt Chi Tiết

Tra cứu danh sách prefix tại [prefix-reference.md](prefix-reference.md):
- `feat`: Tính năng / cơ chế mới
- `update`: Cải tiến, cập nhật chức năng hiện có
- `fix`: Sửa lỗi logic / bug
- `perf`: Tối ưu hiệu năng / nén dung lượng asset
- `refactor`: Tái cấu trúc code mà không đổi hành vi
- `clean`: Dọn dẹp code thừa / file rác
- `style`: Định dạng code / giao diện thẩm mỹ
- `build`: Cấu hình đóng gói, xuất bản

**Soạn thảo nội dung commit chi tiết**:
- Nêu rõ tên hàm, tên thuộc tính, tên node/prefab bị chỉnh sửa.
- Nêu rõ nguyên nhân và kết quả mong muốn sau thay đổi.

---

### Bước 4: Tự Động Stage & Commit Tuần Tự (Không Cần Hỏi Duyệt)

**Thực thi ngay lập tức**, không dừng lại hỏi người dùng hay gọi `ask_question`. Stage đích danh từng file và commit từng chức năng một:

```bash
# Commit chức năng 1
git add path/to/feature1.ts
git add path/to/component1.ts
git commit -m "feat(scope): tiêu đề tiếng Việt" -m "- Chi tiết thay đổi 1" -m "- Chi tiết thay đổi 2"

# Commit chức năng 2 (nếu có chức năng tiếp theo)
git add path/to/scene.scene
git add path/to/Data.ts
git commit -m "update(level): tiêu đề tiếng Việt" -m "- Chi tiết thay đổi 1" -m "- Chi tiết thay đổi 2"
```

---

### Bước 5: Báo Cáo Kết Quả

Sau khi hoàn thành commit tất cả các chức năng, hiển thị bảng tổng kết:
- Mã hash ngắn (`7 ký tự`) của từng commit
- Tiêu đề commit message
- Danh sách file và số dòng thay đổi (`+insertions / -deletions`)
- Trạng thái working tree hiện tại (`git status`)
