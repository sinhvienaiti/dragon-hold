# Về cổng game từ màn kết quả (29/10/2026)

## Thay đổi và lý do

Phiếu 105b, map 1 DH-24, cổng G5: màn thắng và màn thua có thêm “Về cổng
game” cạnh nút chơi lại. Đây là liên kết dùng
`portalHome(import.meta.env.VITE_PORTAL_ORIGINS)` và `target="_top"`, để về
cổng ở cả trang ngoài khi game nằm trong khung portal. Nhãn Enter lấy từ
`keyLabel`, cùng cách với nút chơi lại.

Khi bảng kết quả đã mở, trái/phải chuyển lựa chọn giữa hai nút, Enter kích
hoạt nút đang chọn. Mỗi lần mở bảng đều chọn chơi lại trước. Viền sáng thể
hiện lựa chọn; bộ định tuyến phím của cửa sổ tiếp tục nhận phím như các nút
UI hiện có. Esc/Enter vẫn mở bảng ngay trong đoạn chờ thắng 2,6 giây;
lên/xuống vẫn chọn từ, Tab vẫn nghe từ. Phím chơi lại mức dễ hơn giữ nguyên.

CSS màn kết quả nằm trong `src/ui/styles/dh.css`: hai nút cùng hàng, hai cột
rộng bằng nhau và cùng kiểu. Hàng gợi ý phím và nút mức dễ hơn (nếu có) nằm
bên dưới; Sổ Từ Ải giữ hàng riêng có cuộn. Chưa kiểm chứng bố cục bằng trình
duyệt vì phiếu cấm chạy trình duyệt; Claude kiểm tiếp ở 1280×720 và 1920×1080.

## Kiểm tra

- Viết 10 test màn kết quả trước mã: 10 đỏ trước sửa, 10 xanh sau sửa.
- `pnpm check` trước sửa: 53 file, 465 test xanh; sau sửa và khôi phục đột
  biến: 54 file, 475 test xanh; kiểm kit, TypeScript và build đều đạt.
- Lượt kiểm sau sửa đầu tiên chỉ trượt ngân sách thời gian `tags-bodies`
  (1,305 ms so với ngưỡng dưới 1 ms). Chạy riêng ba lần đều đạt 21/21 test;
  lượt `pnpm check` cuối cũng xanh.
- Bỏ riêng xử lý phím phải: 4 test đỏ, 6 xanh. Khôi phục xử lý: toàn bộ
  475 test xanh. Không sửa golden.
- Báo cáo và nhật ký: `docs/codex-queue/105b-report.md`, `docs/codex-queue/105b/`.
