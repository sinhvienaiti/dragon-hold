# 30/10/2026 · Đường ảnh icon UI (phiếu 194)

Bảng `src/ui/ui-art.json` chọn 36 icon đã nhận ở 137–140 và 17 icon cũ dùng tạm. `icon()` trả ảnh WebP theo tên hoặc key cũ, chọn cỡ cho mật độ màn hình 2 và `--ui` tối đa 1,2. Ảnh lỗi được ẩn, cảnh báo một lần mỗi URL; không có hình thay thế.

Script `pnpm prepare-ui-art --art-src ../dragon-hold/art-src` đóng gói đủ 159 WebP và manifest: dùng đúng PNG từng cỡ, thiếu thì thu Lanczos từ cỡ lớn hơn gần nhất; không phóng to, không sửa màu. Quality 90, alpha 100; dưới 35 dB PSNR thì chuyển riêng file đó sang lossless. Hoàn tất mọi chuyển đổi trước khi thay đầu ra, ghi manifest sau cùng; `--check` chỉ đọc và kiểm MD5, byte, nguồn và bảng chọn.

Đã gắn ảnh cho HUD, thẻ đợt, thẻ ra mắt, ô đặt, khung học và màn kết quả; giữ chữ tiếng Anh và luật chơi. Family thay bóng quái SVG. Sao sáng/tắt dùng hai ảnh riêng; bỏ rêu CSS của bảng. Trong phạm vi 194, sáu icon chỉ chuẩn bị: `fast-forward`, `keyboard`, `seal-lit`, `seal-unlit`, `edge-arrow`, `lock`; chỗ dùng ngoài phạm vi hoặc chưa có giao diện. `skin.ts` còn SVG `armour` (chờ 161), `dragon`, `white-dragon` (chờ UIC-DH-6); giữ nguyên `tags.ts` theo phạm vi phiếu. Không đụng nút Settings/Sound trong trận. Lượt chạy lại sửa huy hiệu NEW về ô mặc định 20; loa và dấu đúng khung học giữ ô 18.

Kiểm tra lượt chạy lại: **48/48 test tập trung xanh**, gồm 29 test UI/script/kết quả, golden **10/10**, English UI **9/9**. MD5 `tests/golden/m0.json` trước/sau cùng `75f74947dac170d05fd659f99417940e`. `prepare-ui-art --check` mã 0. WebP theo cỡ 64/128/256: 142.184 / 350.914 / 706.946 byte; PSNR nhỏ nhất 35,1794 / 35,0822 / 35,2564 dB; 19 file lossless.

Kiểm chung trước và sau đều có **549 test xanh, 2 test đỏ, 1 suite không thu thập được** trong phần dở 195: thiếu `scripts/balance/idle-estimate.mjs`, hai lỗi ở `tests/app/idle-speed.test.ts`. `deploy:pack` mã 2, dừng tại ba lỗi TypeScript cũng trong hai file test đó; chưa dựng lại `dist` và chưa chạy bộ kiểm gói trên mã hiện tại. Lượt trước 194 đã có check 526/526 và gói 0 lỗi, nhưng đó là số lịch sử trước khi có phần dở 195. Giữ nguyên toàn bộ file 187/195; không sửa để làm xanh kiểm chung. Chưa kiểm trình duyệt theo lệnh cấm của phiếu; Claude hoàn tất 195, chạy lại kiểm chung và xem ở 1280/1920 sau khi duyệt diff.

Giữ nguyên công việc 187 đang có trên `dh-codex`; ảnh và manifest đi qua liên kết `public/assets`, không vào Git. Bằng chứng, bảng gắn và danh sách media nằm ở repo cha: `docs/codex-queue/194-report.md`, `docs/codex-queue/194/`.
