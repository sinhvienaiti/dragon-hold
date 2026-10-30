# 30/10/2026 · DH-08 · Bot giống lượt phím thật

Thêm `b35cdp` để đối chiếu kịch bản CDP 35 WPM/97 %, và `b35human` dùng tay b35 35 WPM/95 %/CV 0,25, chọn mục tiêu theo trọng số danger/nearest/first = 0,2/0,7/0,1, phản xạ neo vào `bornTick`. Giữ nguyên bộ 15 bot mặc định, sáu bot M0 và các luật sim.

Gọi riêng: `pnpm dh:balance --bots=b35cdp,b35human`, `pnpm dh:balance --trace=b35human:1`. Nếu CLI tsx báo `listen EPERM`: dùng `TSX_DISABLE_CACHE=1 node --import=tsx scripts/balance/run.ts` với cùng tham số.

B35cdp mô phỏng thứ tự PICK, NEAR, nhịp phím, kỹ năng giữa hai từ, dừng chụp ảnh và gọi sớm sau khi Plan im lặng 1 s. Hiệu chỉnh ba lần 0/50/100 ms trễ chọn từ, giữ 100 ms: đạt **8/10 đợt trong ±15 HP** trên seed 1. Đây là bản gần đúng của lượt CDP; 100 ms/mark và chu kỳ hỏi 106–110 ms là giả định có căn cứ đo, không phải thời gian chụp/PICK được log trực tiếp. Bộ từ và cách mua vẫn của bot.

Kiểm trước: **69 file / 593 test**, kit 75, golden 10/10. Test viết trước: **1 suite đỏ vì chưa có module human, 0 test được nạp** (13 ca đã khai báo); thêm một ca chứng minh hàm đo không đổi log/hash sau khi sửa thời điểm đo lựa chọn. Kiểm sau: **70 file / 607 test = 593 + 14**, 0 đỏ, kit 75, golden 10/10, TypeScript/build xanh. File test mới chạy 0,320 s, toàn lệnh 0,683 s. Golden MD5 giữ `75f74947dac170d05fd659f99417940e`; `src/` và golden 0 file đổi. Hai JSON mặc định giống nhau khi bỏ `steps`.

| Bot | Bộ 20261023 | Bộ 21261026 | G1 gộp | G1 [75–90] | B4 killSeconds < sloppy | Tụt HP p50/p90 | heroDamage p50/p90 |
|---|---|---|---|---|---|---|---|
| b35 | 90.0 % | 80.0 % | 85.0 % | đạt | 4.186 · đạt | 84/228 | 125/320 |
| b35cdp | 100.0 % | 100.0 % | 100.0 % | vượt trần | 2.197 · đạt | 0/26 | 0/50 |
| b35human | 100.0 % | 100.0 % | 100.0 % | vượt trần | 3.560 · đạt | 40/140 | 67/184 |
| steady | 90.0 % | 90.0 % | 90.0 % | đạt | 4.971 · đạt | 67/214 | 118/302 |
| sloppy | 75.0 % | 75.0 % | 75.0 % | đạt | 5.234 · mốc | 63/242 | 95/387 |

`steady.kit.s = 636` và `sloppy.kit.s = 577` (63,6 % > 57,7 %) giữ nguyên; B4 vẫn đạt cho cả ba lựa chọn Chuẩn. CLI vẫn chấm G1 bằng b35 vì hai bot mới không có `standard`.

Đề xuất Claude chọn **b35human** làm ứng viên đại diện G1 và nhánh Chuẩn của B4: cùng tay gõ chuẩn, chỉ sửa hai điểm DH-08. Dùng b35cdp làm đối chứng của bản ghi, giữ b35 làm mốc lịch sử. Chưa đổi bộ bot/gate mặc định trong phiếu này. Với b35human, pace ×1,1, pace ×0,9 và Héo lan mức Thường 1000→1100 trong bộ nhớ đều vẫn thắng 40/40; chưa có cơ sở nói tăng 10 % sẽ đủ đưa G1 về dải. Không sửa dữ liệu gameplay.

Bằng chứng và giới hạn đầy đủ: `docs/codex-queue/223-report.md` và `223/` ở repo cha. Nguồn “35 WPM thật” là script CDP, không phải người; dữ liệu thô cho thấy đợt 9 tụt 47 HP từ đầu đợt, khác mức 33 trong diễn giải cũ.
