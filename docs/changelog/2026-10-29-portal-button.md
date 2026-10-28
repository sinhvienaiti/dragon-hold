# Địa chỉ cổng game và giới hạn trang thử HUD (29/10/2026)

## Thay đổi và lý do

Phiếu 105 hiện làm một phần. Thêm `src/app/portal.ts` xuất
`portalHome(origins: string | undefined)` để các màn dùng chung: tách bằng dấu
phẩy, bỏ khoảng trắng, lấy nguồn đầu tiên khác rỗng, mặc định
`https://typing-game.local`, rồi nối `/`.

Viết `tests/app/portal.test.ts` trước helper, gồm năm ca: `undefined`, chuỗi
rỗng, danh sách chỉ có khoảng trắng, hai nguồn hợp lệ và nguồn rỗng đứng đầu.
Chưa chạy các ca này vì chỉ dẫn phiên cấm chạy bộ test.

`src/main.ts` chỉ nạp `ui-preview` khi `import.meta.env.DEV`; chú thích dòng 3
nêu rõ trang thử chỉ dành cho dev. Chưa build để xác nhận chunk bị loại.

## Phần dừng và số đo

- Chưa thêm nút hoặc đổi bàn phím màn kết quả: Esc đang có chức năng mở bảng
  kết quả ngay trong đoạn chờ thắng `VICTORY_HOLD_MS = 2600`. Phiếu yêu cầu
  dừng và báo nếu Esc đã có việc khác; đã hỏi chủ có giữ hành vi đoạn chờ và
  chỉ gán về cổng khi bảng đã mở hay không.
- Không đổi CSS. File chứa kiểu màn kết quả là `src/ui/styles/dh.css`.
- 118/118 file thay đổi có sẵn giữ nguyên SHA-256, gồm phiếu 094/101 và 080.
- Golden: `git diff --stat -- tests/golden` không có đầu ra; kiểm khoảng
  trắng `git diff --check` cũng không có đầu ra, cả hai mã thoát 0.
- `dist/assets/` có sẵn 5 file JS, tổng 1.241.854 byte, có chunk
  `ui-preview-jAwQWz9e.js`. Đây là bản cũ, không phải số đo sau thay đổi.
- Chưa chạy `pnpm check`, `pnpm build`, đột biến hoặc trình duyệt. Chưa có số
  test trước/sau thực chạy của phiếu 105; không xác nhận năm mục nghiệm thu.

Báo cáo và bằng chứng nằm trong repo cha:
`docs/codex-queue/105-report.md`, `docs/codex-queue/105/`.
