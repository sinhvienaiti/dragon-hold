# Theo kit tiếng Anh và kiểm gói deploy (29/10/2026, phiếu 169)

## Thay đổi và lý do

- Test báo cáo bot đợi `Vùng cuốn: Balanced`, đúng nhãn mới của kit; giữ
  nguyên các kiểm tra cổng và dải chung/D27.
- `NUMBER_FEEL` dùng thẳng `DRAGON` vì kit đã có nhãn `PERFECT`. Test vẫn
  kiểm nguyên văn nhãn và thêm kiểm tra kế thừa cấu hình kit.
- Thêm `deploy:pack`: build rồi chạy bộ kiểm kit trên `dist` với
  `--game dragon-hold`. `deploy:pack:local` thêm `--allow-local-host` cho
  demo nhà. README ghi cách dùng và giới hạn của hai lệnh.
- Thêm 8 test lệnh đóng gói: thứ tự build/kiểm, dừng khi build lỗi, chặn
  tài nguyên game khác và phân biệt nguồn portal production/demo.

## Số đo và kiểm tra

- Test trước sửa mã: lượt nền có 1 đỏ/33 xanh do nhãn cũ; 9 test mới đỏ
  đúng lý do thiếu lệnh và còn ghi đè cấu hình số, 8 test cũ xanh.
- `pnpm check`: mã 0, 56 file và 492/492 test xanh; golden 10/10 xanh,
  kit 75/75 file khớp manifest. Giữ nguyên byte cả 76 file kit, gồm manifest.
- Test tag chạy riêng 3 lần: 0,352 / 0,316 / 0,301 ms, đều dưới 1 ms;
  không sửa file test hay mã bố trí tag. Plugin tạm chỉ in số đo trước
  assertion, không đổi vòng đo hoặc ngưỡng.
- Build trước và sau sửa đều đủ 103 file từ vựng, gồm 100 level,
  index, manifest và attribution; 102 hash khớp manifest, tổng 2.675.955 byte.
  Không cần sửa cấu hình chép từ vựng.
- Chạy thật `pnpm deploy:pack`: build qua, kiểm gói mã 1 vì hai chỗ dùng
  `typing-game.local` trong cùng bundle. Kiểm cùng gói với cờ demo mã 0.
  Gói có 229 file, 29.949.229 byte. Chưa đạt production/G7.

## Giữ lại và bàn giao

Không sửa kit, golden, luật chơi, nguồn portal, media hay Vite config.
Hai nguồn local còn ở cầu nối học tập và nút về portal; cần làn cấu hình
production xử lý cả hai, không chỉ đặt `VITE_PORTAL_ORIGINS` cho nút.
Không chạy server, trình duyệt hoặc mạng theo phạm vi phiếu.

Báo cáo và JSON nằm ở `docs/codex-queue/169-report.md` và
`docs/codex-queue/169/` của repo cha.
