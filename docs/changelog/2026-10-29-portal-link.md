# Cấu hình đường về cổng lúc build (29/10/2026, phiếu 187)

## Thay đổi và lý do

- `VITE_PORTAL_URL` thay nguồn nhà ghi cứng, mặc định trống. Khi trống,
  màn kết quả chỉ tạo Replay/Retry; phím trái/phải giữ lựa chọn hợp lệ và
  không hiện gợi ý đổi nút. Khi có URL, nút “Back to portal” giữ nguyên
  đường dẫn, query, fragment và `target="_top"`.
- Hai nơi khởi tạo cầu nối học tập dùng chung cấu hình. Cầu nối dùng phần
  nguồn của URL cho `postMessage`; khi chưa đặt cổng, sự kiện giữ trong hàng
  đợi cục bộ kể cả lúc game nằm trong iframe.
- Plugin Vite thay đúng khai báo `PARENT_ORIGIN` trong bộ nhớ lúc biên dịch;
  file kit trên đĩa và manifest giữ nguyên byte. Chỉ truyền `parentOrigin`
  ở nơi gọi chưa đủ loại mặc định nguồn nhà khỏi bundle. Plugin dừng nếu
  không còn đúng một khai báo để thay, không sửa hay nới bộ kiểm gói.
- README ghi cách build độc lập, build có cổng production và demo nhà:
  `VITE_PORTAL_URL=https://typing-game.local/ pnpm deploy:pack:local`.
  Cờ cho phép local không tự đặt URL. Ngừng dùng `VITE_PORTAL_ORIGINS`.

## Số đo và kiểm tra

- Test trước sửa mã: 23 đỏ/9 xanh; sau sửa, 32/32 test liên quan xanh.
  Bao gồm trạng thái thắng/thua, bàn phím với một/hai nút, hàng đợi cục bộ,
  kiểm nguồn nhận tin và thực thi đầu ra Vite trong Node.
- `pnpm check`: mã 0, 57 file và 509/509 test xanh; golden M0 10/10 xanh,
  kit 75/75 file khớp manifest. Test thời gian tag xanh ngay trong lượt này,
  không cần chạy riêng ba lần. Không đổi luật chơi, dữ liệu golden hay kit.
- Trước sửa, `pnpm deploy:pack` mã 1: một lỗi `local-host`, hai tham chiếu.
  Sau sửa, lệnh này mã 0: 240 file, 33.654.248 byte, 0 lỗi, 0 tham chiếu
  `typing-game.local`. Quét riêng HTML/JS/CSS/JSON cũng không thấy nguồn nhà.
- `VITE_PORTAL_URL=https://typing-game.local/ pnpm deploy:pack:local` mã 0:
  240 file, 33.654.591 byte, 0 lỗi. Cùng gói đó vẫn bị bộ kiểm production
  từ chối: mã 1, một lỗi `local-host`, ba tham chiếu local được đặt rõ lúc build.

## Bàn giao

Không chạy server, trình duyệt, mạng, đồng bộ kit hay lệnh Git ghi. Không
kiểm cảm quan hoặc chứng nhận toàn bộ triển khai độc lập qua HTTP trong
phiếu này. Cảnh báo chunk lớn của Vite có sẵn, không thuộc việc đổi cổng.
Báo cáo và JSON ở `docs/codex-queue/187-report.md` và `187/` của repo cha.
Để lại `dist` ở cấu hình production không đặt cổng. Chờ Claude duyệt rồi commit.
