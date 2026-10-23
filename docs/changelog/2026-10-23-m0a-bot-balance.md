# 23/10/2026 · M0a: bot cân bằng, golden

Làn bot-balance của mốc M0a. Bot chơi ải M0 không cần trình duyệt, bằng đúng các lệnh mà bàn phím và chuột gửi.

## Đã làm

- **Bot gõ** (`scripts/balance/hands.ts`, `typist.ts`, `reader.ts`): sức gõ theo DESIGN.md §5.2. Mỗi từ có thời gian phản xạ 0,45 s, cộng một phím cho mắt chuyển, rồi từng chữ 12 / (E × d) giây, d theo nhóm từ. Phím trượt sang phím bên cạnh theo độ chính xác (95 %, 60 WPM là 97 %). Thỉnh thoảng bấm Backspace sau phím trượt. Khoảng phím được co lại để tốc độ ròng vẫn bằng C(E). Bot chọn từ có ưu tiên cao nhất: Từ Khẩn trước, rồi đe dọa theo 01 §3.2. Bot 25 WPM chọn con gần tâm trước (03 §13.1). Bot theo khóa mà game hiện ra, gõ chữ thứ hai khi gặp cặp chữ đầu tầng 2.
- **Bot mua** (`policy.ts`): ba kiểu.
  - "Cân bằng" (đồ trung bình): chấm điểm từng việc mua theo thẻ đợt kế, chọn việc có điểm trên mỗi Vàng cao nhất, giữ 10 % Vàng.
  - "Tốt nhất": cho bot không gõ. Tiêu hết Vàng, nghiêng về bẫy nổ, gai và lính.
  - "Không mua".
  - Bot dùng Phun Lửa, Thiên Hỏa, Viêm Đế bằng phím, uống thuốc khi máu dưới 45 %, làm Học trước và Thẻ Ôn.
- **Sáu bot** (`bot.ts`): b0, b25, b35, b60 mua kiểu cân bằng; typingOnly gõ 35 WPM và không mua; noTyping không gõ và mua tốt nhất. Mỗi lệnh ghi kèm tick để chạy lại y hệt. Xúc xắc của bot tách khỏi RNG của thế giới.
- **Đo** (`meter.ts`, `load.ts`):
  - sát thương theo nguồn (gõ, kỹ năng, phe ta);
  - khống chế cứng trên từng con quái (G15);
  - tải gõ từng đợt và đỉnh;
  - mất khóa (G11), vàng đầu và cuối mỗi đợt (G13);
  - số chữ sống và quái sống tối đa, Tối Thượng, lệnh bị từ chối;
  - thời gian mỗi bước sim.
- **Tải đỉnh:** công việc của mỗi con quái trải theo nhịp gõ tham chiếu 22,7 từ mỗi phút. Vì vậy một con quái một mình không vượt quá 1,0. Cổng đo bằng cửa sổ 8 s. Làn sim-battle dùng cùng cách đo trong `src/sim/waves.ts`. Test kiểm hai bản cho cùng số.
- **Báo cáo** (`run.ts`, `report.ts`): lệnh `pnpm dh:balance` in Markdown tiếng Việt, gồm:
  - cổng M0 và các cổng khác của 00 §7;
  - hệ nào chưa có tác dụng, kèm tên làn;
  - từng bot, tải từng đợt, sát thương, khống chế, vàng, sức chạy sim;
  - kế hoạch đợt tính tay;
  - ghi chú bản đồ.
  
  Lệnh chạy song song nhiều tiến trình (`--jobs`). Có `--json` và `--trace=b35:<seed>`.
- **Hiệu chỉnh** (`calibrate.ts`, `words-bench.ts`): đo bot gõ trên bộ định tuyến của kit và trên kho chữ thật của game.
- **Golden** (`golden-spec.ts`, `golden-update.ts`, `tests/golden/m0.json`): 3 ca. Một ca thế giới đứng yên. Hai ca dài 3 phút: bot 35 WPM và bot không gõ. Mỗi ca giữ log lệnh và bộ từ, nên test kiểm được cả luật lẫn bot.
- **Bộ từ của bot** (`deck.ts`): 100 từ cố định lấy từ cấp 1–3, dài 3–10 chữ. Tỉ lệ nhóm: mới 15, đến hạn 35, đang học 30, đã thuộc 20.

## Kiểm

- Bot gõ trên bộ định tuyến của kit (20 phút mỗi mức) và trên kho chữ thật của game (180 s mỗi mức). Tốc độ đo được khớp C(E) của chính các từ đã gõ, lệch dưới 4 %. Ở 35 WPM, Chớp và Hoàn hảo chiếm khoảng 80 %.
- Cách đo tải và đỉnh của bot khớp với `src/sim/waves.ts` của sim-battle, lệch dưới 0,015.
- 38 test của làn đều qua: `tests/sim/bot-*.test.ts`, `tests/sim/smoke.test.ts`, `tests/golden/golden.test.ts`. `tsc --noEmit` sạch cả dự án.
- `pnpm dh:balance` chạy 6 bot × 20 seed trong khoảng 4 s (8 tiến trình). Một bước sim trung bình 0,003–0,006 ms, nhanh hơn thời gian thực 2.800–9.900 lần.

## Kết quả cổng M0 (20 seed, sim lúc 23/10)

| Cổng | Cần | Đo được | Kết quả |
|---|---|---|---|
| G1: 35 WPM, đồ trung bình | thắng 75–90 % | 100 %, máu Rồng cuối 100 % | trượt |
| G3: 25 WPM | thắng ≥ 70 % | 100 % | đạt |
| G5: chỉ gõ, không mua | thắng ≤ 40 % | 100 %, máu cuối 97 % | trượt |
| G6: không gõ | thua trước hết đợt 3 | 20/20 thua ở đợt 2–3 | đạt |
| G9: tải đỉnh cửa sổ 8 s | ≤ 1,40 | 1,39 | đạt |

- Ải M0 quá dễ với người gõ. Thử nghiệm ngoài ải thật:
  - Chỉ tăng tải lên 1,8 lần: bot chỉ gõ vẫn thắng 100 %.
  - Chỉ tăng sát thương quái lên 6 lần: bot chỉ gõ vẫn thắng 100 %, còn 84 % máu.
  - Tăng cả hai (tải × 1,8, sát thương × 4): bot chỉ gõ còn thắng 30 %. Nhưng bot 35 WPM có đồ vẫn thắng 100 % với 97 % máu. Phe ta gánh phần còn lại; chưa đo món nào gánh nhiều nhất.
- Cửa sổ 6 s và 10 s cho đỉnh 1,59 và 1,54, vượt 1,40. Cổng M0 hiện đo ở 8 s.

## Còn mở

- Golden phải ghi lại sau khi ráp đủ các làn: `npx tsx scripts/balance/golden-update.ts`.
- Cổng G1 và G5 cần làn sim-battle, làn sim-ourside và chủ dự án chỉnh số trong dữ liệu.
