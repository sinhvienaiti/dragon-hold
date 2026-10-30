# 30/10/2026 · Báo bộ từ lỗi, chặn Low và tự tua khi hết chữ

- **DH-02:** Bộ từ tải lỗi, rỗng hoặc dưới 70 từ chặn khởi động trận. Bảng tiếng Anh có Retry và Back to portal khi có URL hợp lệ. Retry nạp lại cả bộ thiếu đã được cache; chỉ khởi động một lần khi đủ từ. Giữ cảnh báo console, lý do lỗi và số từ cho app.
- **DH-18:** Bản phát hành chỉ cho Medium, High, Ultra. `?q=low` chuyển thành Medium; dev vẫn cho Low. Settings của phiếu 192 cần dùng `allowedQualities` khi gộp.
- **DH-05, bước 0:** Trong đợt, hết chữ và không quái nào ở hay sắp vào Vùng Chữ trong 90 tick thì tự tua ×1,75 sau 0,3 giây. Tính cả quái sắp xuất hiện và quái bay. Có chữ, mở bảng, đặt/sửa món hoặc dừng thì tắt. Alt + → vẫn bật/tắt ×2 và thắng tự tua.
- Dấu tua dùng ảnh `fast-forward` của phiếu 194, số nhỏ và nhãn hỗ trợ tiếng Anh. Debug thêm `idleSpeed` và `timeScale`.
- Chỉ đổi số bước sim mỗi khung. Giữ nguyên mã sim, tick, golden, nhạc và đồng hồ VFX. Script ước tính ngoại tuyến cho 52,4% trước và 47,8% sau với tầm nhìn 1,5 giây; đây là mô hình từ mẫu, chưa phải số đo trình duyệt.

Kiểm: `pnpm check` xanh 568/568 test; golden 10/10; English UI 9/9. 200 bộ từ ghim ở cấp 1–100 đều có 90 từ. `pnpm deploy:pack` và JSON kiểm gói đạt 0 lỗi. Báo cáo cùng bằng chứng ở `docs/codex-queue/195-report.md` và `195/` của repo cha. Claude còn duyệt diff và đo trình duyệt 1280/1920 trước khi commit.
