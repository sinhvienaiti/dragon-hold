# 27/10/2026 · Các hướng chủ dự án chốt: làm và đo từng bước

Chủ dự án chốt 27/10 (00 D33, cùng D27, D29–D32): "Chốt Rồng Giữ Ải theo hết đề xuất của bạn. Bắt đầu làm và đo, cái nào gãy cổng thì báo tôi." Bài này ghi từng bước của lượt làm theo D33, mỗi bước một mục.

Cách làm chung:

- Mỗi bước một nhánh `s<N>-<tên>` cắt từ `main`. Bước được **giữ** khi đạt mục tiêu của nó, không cổng nào đang đạt lúc bắt đầu bị gãy (G1, G3, G5, G6, G8, G9, B2–B6, B8), và B1, B7 không xấu hơn quá độ nhiễu seed. Cổng gãy thì thử tối đa hai biến thể trong hướng chủ dự án đã chọn; vẫn gãy thì không giữ, nhánh để nguyên không gộp, số ghi ở đây và ở 00 D33.
- Máy: Mac mini M4. Bot: `pnpm dh:balance --modes=balanced --seeds=60 --jobs=3` dưới `.local/bin/heavy.sh`, 2 bộ × 60 seed (20261023… và 21261026…), 120 lượt mỗi bot. B4 chạy 300 seed khi biên dưới 3 điểm. Đủ bộ chỉ số BALANCE.md §3: Thắng / S / P / I / O / N / Q, cộng số theo đợt khi bước nhắm vào đợt.
- Dải I của Cân bằng: từ 27/10 cổng chính thức của B1, B7 là ≤ 20 % (D27); báo cáo vẫn in dải chung ≤ 10 % trước.
- Bằng chứng: `tmp/mac-2026-10-27/owner/<bước>/` (gitignored).

## Mốc: `main` `83da970` (Cân bằng, 120 seed)

Sim như `22ceffc`; số khớp từng ô với bảng của `2026-10-27-test-pass.md` §4. Mọi bước sau so với bảng này (`s1-word-ring/base-all.json`, `base-all.md`).

| Bot | Thắng | S | P | I | O | N | Q | Hạ quái (s) |
|---|---|---|---|---|---|---|---|---|
| b25 | 85,8 % | 70,6 % | 20,3 % | 18,5 % | 0,0 % | 0,42 | 40,9 % | 5,3 |
| Chuẩn (b35) | 86,7 % | 60,1 % | 21,3 % | 20,8 % | 0,0 % | 0,48 | 38,4 % | 4,2 |
| b60 | 77,5 % | 36,1 % | 31,3 % | 29,5 % | 0,0 % | 0,76 | 48,4 % | 3,6 |
| Mới | 72,5 % | 61,2 % | 23,9 % | 16,4 % | 0,0 % | 0,85 | 42,7 % | 6,1 |
| Chậm chắc | 94,2 % | 63,5 % | 19,9 % | 18,8 % | 0,0 % | 0,29 | 40,0 % | 4,9 |
| Khá | 75,8 % | 47,5 % | 23,7 % | 26,6 % | 0,0 % | 0,78 | 37,6 % | 3,9 |
| Ẩu | 73,3 % | 61,2 % | 23,8 % | 16,2 % | 0,2 % | 0,65 | 37,7 % | 5,3 |
| Nhanh | 90,0 % | 44,5 % | 30,3 % | 30,7 % | 0,0 % | 0,72 | 48,4 % | 3,5 |
| Chuẩn tốt | 85,8 % | 61,1 % | 19,1 % | 20,5 % | 0,0 % | 0,38 | 40,4 % | 4,1 |
| Chuẩn kém | 40,8 % | 0,0 % | 22,1 % | 18,8 % | 0,0 % | 2,39 | 48,4 % | 4,6 |
| Chuẩn tắt nhịp (B7) | 84,2 % | 67,4 % | 20,5 % | 22,2 % | 0,0 % | 0,26 | 38,1 % | 4,2 |
| Chỉ gõ | 0,0 % | 0,0 % | 24,8 % | 17,7 % | 0,0 % | 0,53 | 47,7 % | 5,1 |
| Không gõ | 0,0 % | 0,0 % | 70,2 % | 4,5 % | 0,0 % | 0,00 | 76,2 % | 9,2 |
| Trẻ em | 9,2 % | 0,0 % | 38,8 % | 7,8 % | 0,0 % | 1,62 | 88,1 % | 9,5 |

Cổng của mốc: G1 86,7 %, G3 85,8 %, G5 0 %, G6 thua 120/120 ở đợt 1, G8 30,3 %, G9 1,40: đạt. B2, B3 (Mới 73 %, Trẻ em Thư giãn 91 %), B4 (S Chậm chắc 64 so với Ẩu 61; 300 seed của đợt test: 64 > 61), B5, B6, B8 đạt. B1, B7 trượt theo cả hai dải. G16 (Tối Thượng 171,5 s, cổng từ ải 15) trượt như trước.

## 1. D27 (i): bỏ vòng 26 m của vùng hiện chữ — đã đo, **không giữ** (gãy G1)

Nhánh `s1-word-ring`, commit `eb54550` (chưa gộp). Bằng chứng: `tmp/mac-2026-10-27/owner/s1-word-ring/`.

### 1.1 Đã làm gì

- `src/sim/words.ts`: `inRevealZone` là vùng hiện chữ mới: quái có chữ khi còn trong T_a giây cuối đường (00 §4.4, cộng một thời gian từ cho mỗi từ thêm), hoặc khi đang đánh, bị chặn. Không còn vòng 26 m. `inWordZone` (vòng 26 m và T_a, như cũ) vẫn là vùng của Héo lan, mục tiêu mặc định của Thiên Hỏa và hàng chờ của bộ điều nhịp.
- `src/sim/combat.ts`, `world.ts`: **Héo lan giữ nguyên như hôm nay.** Chữ hiện trước khi quái vào vòng 26 m thì chờ ngoài đó không mất gì; độ chờ của Héo lan tính từ tick quái lần đầu đứng trong vùng cũ (`EnemyState.seepFrom`). Nghĩa là Héo lan thấm đúng như khi chữ hiện ở mép vùng cũ (00 §4.10: "mục tiêu còn chờ trong Vùng Chữ").
- `src/content/data/waves.ts`: `zoneDelayMs` (kế hoạch đợt) theo vùng hiện chữ mới. Thời lượng đợt nó cho ra không đổi (10 đợt, từng số).
- Test: chữ hiện theo T_a ngoài vòng 26 m (`tests/typing-words.test.ts`); chữ hiện sớm không thấm ngoài vòng, vào vòng thì chờ đủ một độ chờ rồi mới thấm (`tests/sim/balance-pressure.test.ts`). Golden cập nhật bằng `pnpm dh:golden:update` trên nhánh (đổi luật có chủ ý). `pnpm check` đạt 406/406.

### 1.2 Cả ải, Cân bằng, 120 seed (trước → sau)

`pnpm dh:balance --modes=balanced --seeds=60 --jobs=3` trên cây của nhánh (`i2-official.json`, `i2-official.md`); khớp từng ô với lượt chạy cả ba chế độ (`i2-all.json`).

| Bot | Thắng | S | P | I | O | N | Q | Hạ quái (s) |
|---|---|---|---|---|---|---|---|---|
| b25 | 85,8 → **96,7** | 70,6 → **87,4** | 20,3 → 14,3 | 18,5 → 10,4 | 0 → 0 | 0,42 → 0,18 | 40,9 → 28,8 | 5,3 → 6,0 |
| Chuẩn (b35) | 86,7 → **92,5** | 60,1 → 63,3 | 21,3 → 20,5 | 20,8 → 19,1 | 0 → 0 | 0,48 → 0,33 | 38,4 → 31,3 | 4,2 → 4,7 |
| b60 | 77,5 → 68,3 | 36,1 → 34,8 | 31,3 → 29,9 | 29,5 → 28,4 | 0 → 0 | 0,76 → 0,74 | 48,4 → 47,9 | 3,6 → 3,7 |
| Mới | 72,5 → 87,5 | 61,2 → **76,4** | 23,9 → 18,3 | 16,4 → 9,5 | 0 → 0 | 0,85 → 0,49 | 42,7 → 29,4 | 6,1 → 6,9 |
| Chậm chắc | 94,2 → **99,2** | 63,5 → **85,1** | 19,9 → 15,3 | 18,8 → 11,9 | 0 → 0 | 0,29 → 0,10 | 40,0 → 31,5 | 4,9 → 5,6 |
| Khá | 75,8 → **93,3** | 47,5 → 49,3 | 23,7 → 23,4 | 26,6 → 25,8 | 0 → 0 | 0,78 → 0,55 | 37,6 → 31,3 | 3,9 → 4,1 |
| Ẩu | 73,3 → 72,5 | 61,2 → 65,4 | 23,8 → 20,7 | 16,2 → 7,4 | 0,2 → 0,2 | 0,65 → 0,42 | 37,7 → 27,2 | 5,3 → 6,4 |
| Nhanh | 90,0 → **73,3** | 44,5 → 32,1 | 30,3 → 29,4 | 30,7 → 30,4 | 0 → 0 | 0,72 → 0,80 | 48,4 → 48,4 | 3,5 → 3,6 |
| Chuẩn tốt | 85,8 → 88,3 | 61,1 → 71,0 | 19,1 → 18,6 | 20,5 → 20,1 | 0 → 0 | 0,38 → 0,32 | 40,4 → 31,0 | 4,1 → 4,5 |
| Chuẩn kém | 40,8 → 47,5 | 0 → 0 | 22,1 → 22,4 | 18,8 → 17,2 | 0 → 0 | 2,39 → 2,37 | 48,4 → 43,9 | 4,6 → 5,2 |
| Chuẩn tắt nhịp (B7) | 84,2 → **92,5** | 67,4 → 66,7 | 20,5 → 19,2 | 22,2 → 21,4 | 0 → 0 | 0,26 → 0,10 | 38,1 → 29,8 | 4,2 → 4,6 |
| Chỉ gõ | 0 → 0 | 0 → 0 | 24,8 → 24,4 | 17,7 → 17,0 | 0 → 0 | 0,53 → 0,52 | 47,7 → 46,5 | 5,1 → 5,5 |
| Không gõ | 0 → 0 | 0 → 0 | 70,2 → 70,3 | 4,5 → 0,4 | 0 → 0 | 0 → 0 | 76,2 → 63,7 | 9,2 → 11,4 |
| Trẻ em | 9,2 → 4,2 | 0 → 0 | 38,8 → 36,3 | 7,8 → 3,6 | 0 → 0 | 1,62 → 1,45 | 88,1 → 82,4 | 9,5 → 10,9 |

(%; N là số lần; **đậm**: số làm cổng gãy hay đẩy B1 lệch thêm.)

### 1.3 Cổng (trước → sau)

| Cổng | Trước | Sau | |
|---|---|---|---|
| **G1** (b35 thắng 75–90 %) | 86,7 % | **92,5 %** (bộ 20261023: 55/60 = 91,7 %; bộ 21261026: 56/60 = 93,3 %) | **gãy** |
| G3 (b25 ≥ 70 %) | 85,8 % | 96,7 % | đạt |
| G5 (chỉ gõ ≤ 40 %) | 0 % | 0 % | đạt |
| G6 (không gõ thua trước đợt 3) | 120/120 ở đợt 1 | 120/120 ở đợt 1 | đạt |
| G8 (phe ta 20–35 %) | 30,3 % | 27,7 % | đạt |
| G9 (tải đỉnh ≤ 1,40) | 1,40 | 1,40 | đạt |
| B2 | đạt | đạt | không bot nào S ≥ 90 % kèm I ≥ 20 % |
| B3 | Mới 73 %, Trẻ em Thư giãn 91 % | Mới 88 %, Trẻ em Thư giãn 88 % | đạt (lượt cả ba chế độ) |
| B4 | S 64 so với 61; hạ quái 4,21 s so với 5,25 s | S 85 so với 65; 4,74 s so với 6,37 s | đạt, biên 20 điểm |
| B5, B6, B8 | đạt | đạt | B6: Tốt so với Kém 86 / 41 → 88 / 48 % (Cân bằng), 78 / 25 → 82 / 21 % (Thử thách) |
| B1 (dải chung và D27) | trượt | trượt, **lệch thêm** | xem dưới |
| B7 (dải chung và D27) | trượt: S cao, I cao | trượt: **thắng cao**, S cao, I cao | bộ điều nhịp vẫn đạt (≤ 3 bậc mỗi đợt, khoảng sinh ±15 %) |

B1 theo dải D27, bot lệch: trước Mới (thắng thấp), Chậm chắc (thắng cao), Chuẩn (I cao), Khá (I cao), Ẩu (thắng thấp), Nhanh (I cao). Sau: Mới (**S cao**), Chậm chắc (thắng cao, **S cao**), Chuẩn (**thắng cao**; I 19,1 % nay trong dải 20 %), Khá (**thắng cao**, I cao), Ẩu (thắng thấp, **S cao**), Nhanh (thắng thấp, **S thấp**, I cao). Từ 6 ô lệch lên 11 ô ở B1, từ 2 lên 3 ở B7; các bước S (Chậm chắc +21,6 điểm, Mới +15,2, b25 +16,8) và thắng (Nhanh −16,7, Khá +17,5) lớn hơn nhiều độ nhiễu của 120 seed (khoảng ±4–5 điểm). Hai bộ seed cho cùng kết quả từng cổng.

### 1.4 Nhàn I: mục tiêu của bước

Tách I theo nguyên nhân, % thời gian đợt, cả ải (`perwave.ts`, Cân bằng, 2 × 60 seed, `pw-base-i2-all.md`). "Chỉ vòng chặn": có quái trong T_a mà không quái nào trong vòng 26 m, tức chỉ vòng 26 m giữ chữ lại.

| Bot | I | Đầu đợt: chỉ vòng chặn | Đầu đợt: ngoài T_a | Sau chữ đầu: chỉ vòng chặn | Sau chữ đầu: ngoài T_a | Trong vùng, chưa có chữ | Hết quái |
|---|---|---|---|---|---|---|---|
| Mới | 16,7 → 9,5 | 2,9 → 0,2 | 0 → 0 | 8,6 → 0,8 | 0 → 0 | 2,7 → 1,5 | 2,3 → 7,0 |
| Chậm chắc | 18,9 → 11,9 | 2,6 → 0,2 | 0,4 → 0,4 | 7,7 → 0,7 | 2,2 → 3,8 | 3,1 → 1,8 | 2,7 → 5,0 |
| Chuẩn | 21,0 → 19,3 | 2,3 → 0,2 | 1,6 → 1,5 | 3,1 → 0,4 | 8,5 → 11,6 | 3,6 → 2,8 | 1,6 → 2,7 |
| Khá | 26,8 → 25,9 | 2,8 → 0,2 | 3,9 → 3,7 | 2,7 → 0,5 | 12,3 → 16,3 | 4,0 → 3,5 | 0,6 → 1,4 |
| Ẩu | 16,4 → 7,4 | 3,9 → 0,3 | 0 → 0 | 7,9 → 1,1 | 0 → 0 | 3,4 → 1,6 | 1,0 → 4,4 |
| Nhanh | 30,7 → 30,5 | 1,2 → 0,2 | 7,9 → 8,1 | 1,5 → 0,2 | 15,3 → 17,5 | 4,3 → 3,9 | 0,1 → 0,3 |
| Chuẩn tắt nhịp | 22,8 → 21,6 | 2,2 → 0,2 | 1,6 → 1,5 | 3,4 → 0,5 | 9,9 → 13,1 | 3,9 → 3,0 | 1,5 → 3,2 |

- Phần I do vòng 26 m gần như hết ở mọi bot (đầu đợt 1,2–3,9 → 0,2–0,3 điểm; sau chữ đầu 1,5–8,6 → 0,2–1,1).
- Nhưng I chỉ giảm nhiều ở người gõ chậm (k < 1: Mới −7,2, Chậm chắc −7,0, Ẩu −9,0, b25 −8,1 điểm). Ở Chuẩn chỉ −1,7, ở Khá và Nhanh gần như không đổi: quái chết sớm hơn nên quái kế còn ngoài T_a lâu hơn ("ngoài T_a" tăng 2–4 điểm), và với k ≥ 1 thì T_a / k vẫn chặn trước vòng. Cận trên "khoảng 12 điểm I ở Chuẩn" của 26/10 không thành.

Theo đợt, Cân bằng (trước → sau). Thua: số lượt thua ở đợt đó. Chữ đầu: giây từ lúc đợt bắt đầu tới chữ đầu tiên. I 15 s: nhàn trong 15 s đầu đợt. Héo: máu mất do Héo lan mỗi lượt vào đợt.

| Bot | Đợt | Thua | S | P | I | O | N | Q | Chữ đầu (s) | I 15 s đầu | Héo |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Mới | 1 | 0 → 0 | 98,0 → 99,3 | 4,2 → 1,5 | 34,8 → 32,8 | 0 → 0 | 0 → 0 | 49,5 → 33,5 | 2,6 → 0,3 | 34,8 → 33,8 | 10 → 3 |
| Mới | 2 | 1 → 0 | 75,5 → 83,2 | 25,7 → 16,6 | 10,3 → 6,3 | 0 → 0 | 0,02 → 0 | 52,8 → 44,9 | 2,4 → 0,2 | 20,9 → 5,5 | 146 → 92 |
| Chậm chắc | 1 | 0 → 0 | 98,8 → 99,8 | 2,0 → 0,3 | 37,3 → 36,1 | 0 → 0 | 0 → 0 | 47,2 → 35,5 | 2,6 → 1,3 | 36,6 → 36,5 | 6 → 1 |
| Chậm chắc | 2 | 0 → 0 | 84,6 → 91,2 | 16,4 → 9,5 | 12,5 → 8,7 | 0 → 0 | 0 → 0 | 50,1 → 43,7 | 2,4 → 1,0 | 18,5 → 9,7 | 87 → 51 |
| Chuẩn | 1 | 0 → 0 | 97,9 → 97,8 | 4,0 → 4,1 | 34,4 → 34,2 | 0 → 0 | 0 → 0 | 45,8 → 45,7 | 3,0 → 3,0 | 37,2 → 37,0 | 12 → 12 |
| Chuẩn | 2 | 0 → 0 | 79,7 → 79,2 | 21,2 → 21,8 | 12,5 → 12,5 | 0 → 0 | 0 → 0 | 48,8 → 47,3 | 2,7 → 2,7 | 19,6 → 19,6 | 116 → 119 |
| Khá | 1 | 0 → 0 | 96,6 → 96,6 | 8,7 → 8,5 | 35,6 → 35,8 | 0 → 0 | 0 → 0 | 48,5 → 48,3 | 5,5 → 5,5 | 43,2 → 43,6 | 20 → 20 |
| Khá | 2 | 0 → 0 | 86,0 → 86,0 | 19,7 → 19,9 | 22,9 → 22,8 | 0 → 0 | 0 → 0 | 52,8 → 52,8 | 4,6 → 4,6 | 33,1 → 33,1 | 83 → 83 |
| Ẩu | 1 | 0 → 0 | 98,3 → 99,1 | 4,2 → 2,3 | 29,8 → 25,6 | 0 → 0 | 0 → 0 | 44,8 → 27,9 | 2,6 → 0,3 | 32,2 → 25,2 | 9 → 5 |
| Ẩu | 2 | 0 → 0 | 74,0 → 80,4 | 28,9 → 21,1 | 8,7 → 4,1 | 0 → 0 | 0,03 → 0 | 51,6 → 43,8 | 2,4 → 0,2 | 17,9 → 3,5 | 150 → 110 |
| Nhanh | 1 | 0 → 0 | 96,7 → 96,7 | 15,9 → 15,9 | 43,8 → 43,8 | 0 → 0 | 0 → 0 | 53,1 → 53,1 | 7,5 → 7,5 | 54,6 → 54,6 | 22 → 22 |
| Nhanh | 2 | 0 → 0 | 82,9 → 82,9 | 31,6 → 31,6 | 30,5 → 30,5 | 0 → 0 | 0 → 0 | 62,6 → 62,6 | 6,6 → 6,6 | 49,6 → 49,6 | 93 → 93 |
| Chuẩn tắt nhịp | 1 | 0 → 0 | 98,1 → 98,1 | 3,3 → 3,3 | 35,9 → 35,5 | 0 → 0 | 0 → 0 | 45,3 → 44,8 | 3,0 → 3,0 | 39,8 → 39,4 | 10 → 10 |
| Chuẩn tắt nhịp | 2 | 0 → 0 | 80,6 → 80,0 | 20,4 → 21,1 | 13,7 → 13,5 | 0 → 0 | 0 → 0 | 49,2 → 46,2 | 2,7 → 2,7 | 20,5 → 20,5 | 114 → 117 |

- Đợt 1–2: chữ đầu của người gõ chậm từ 2,4–2,6 s xuống 0,2–1,3 s, I 15 s đầu của đợt 2 giảm 9–15 điểm. Ở Chuẩn, Khá, Nhanh đợt 1–2 không đổi (T_a chặn). I cả đợt 1 vẫn 26–44 % ở mọi bot: đợt 1 thưa quái có chủ ý (tải 0,55–0,65), không phải do vòng.
- Đợt 4 (Heo nhiều chữ hiện từ cổng): Chuẩn thua 5 → 3 lượt, Héo 263 → 187; Mới 17 → 12, Ẩu 15 → 20.
- Đợt 10: Mới, Chậm chắc, Chuẩn, Khá tới đợt 10 nhiều hơn (Khá 91 → 113 lượt) và ít thua hơn; Nhanh thua 9 → 21 lượt, b60 21 → 33, Héo lan của Nhanh 393 → 483 máu mỗi lượt. Chưa tách nguyên nhân phần của Nhanh.
- Q giảm như đã báo trước (đánh đổi I ↔ Q của D27): Chuẩn 38,4 → 31,3 %, Mới 42,7 → 29,4, Chậm chắc 40,0 → 31,5, Ẩu 37,7 → 27,2, Khá 37,6 → 31,3; Nhanh, b60 giữ 48 %. Dải Cân bằng 50–70 % và đích 55–70 % của BALANCE §9.1 xa thêm.

### 1.5 Biến thể đã thử

| Biến thể | Khác gì | Kết quả (Cân bằng, 120 seed) |
|---|---|---|
| i1 (đọc theo chữ) | Vùng Héo lan như cũ, nhưng độ chờ tính từ lúc chữ hiện, cả phần chờ ngoài vòng 26 m: vào vòng là thấm ngay nếu chữ đã hiện lâu hơn độ chờ | **G1 gãy thấp** (b35 64,2 %), **G3 gãy** (b25 60,8 %), **B3 gãy** (Mới 37,5 %, Trẻ em Thư giãn 83 %). S về 0–6,8 % ở Mới, Chậm chắc, Ẩu, Khá, Chuẩn tắt nhịp; Chuẩn 26,7 %. Chuẩn 64,2 / 26,7 / 22,3 / 20,9 / 0 / 0,96 / 32,8; Chậm chắc 51,7 / 6,8 / 20,8 / 13,9 / 0 / 1,08 / 31,5; Ẩu 29,2 / 0 / 24,4 / 8,7 / 0,2 / 0,83 / 27,7 (`cmp-i1.txt`) |
| i2 (bản trên nhánh) | Độ chờ tính từ lúc quái vào vùng cũ: Héo lan thấm đúng như hôm nay | **G1 gãy cao** (92,5 %), B1, B7 lệch thêm (mục 1.2, 1.3) |

Hai cách đọc luật Héo lan cho chữ hiện sớm nằm hai phía của dải G1 (64,2 và 92,5 %). Không thử biến thể thứ ba: mọi núm còn lại đổi thứ chủ dự án chưa chọn cho bước này (một hệ số mới cho phần chờ ngoài vòng, T_a là đòn bẩy (ii), tải đợt là hướng D33 (4), tách vùng là D31).

### 1.6 Trình duyệt (Apple M4, Vite riêng 127.0.0.1:4151)

`wave-start.mjs` (script tạm của bước, trong thư mục bằng chứng) chạy qua `scripts/visual/cdp-run.mjs` ở 1280×720 và 1920×1080, 25 WPM (k 0,75): `ok`, 0 exception, 0 tài nguyên lỗi, mã băm phát lại khớp ở cả hai cỡ.

- Đợt 1: chữ đầu hiện trên Yêu Rêu Lính đang ở 30,4 m (1280) và 30,2 m (1920) tính từ bệ, tức ngoài vòng 26 m cũ, ngay miệng đường phía tây. Thẻ "place" / "small" đọc rõ, nằm trong màn, không đè HUD (`browser/w1-first-1280x720.png`, `w1-first-1920x1080.png`).
- Đợt 2: chữ đầu trên quái ở 29,7 m, trên đường phía bắc sau cây cầu; 1,5 s sau có thêm chữ thứ hai, hai thẻ không che nhau (`w2-first+1.5s-1920x1080.png`).

### 1.7 Kết luận, chờ anh

- **Không giữ** theo luật cổng: G1 gãy ở cả hai bộ seed, B1 và B7 xấu hơn rõ (S của người gõ chậm vượt dải, Khá và Chuẩn thắng quá 90 %, Nhanh thua nhiều hơn ở đợt 10). Nhánh `s1-word-ring` giữ mã và golden để anh xem hay chạy lại.
- Bỏ vòng 26 m làm đúng việc của nó (phần I do vòng gần như hết, người gõ chậm có chữ ngay đầu đợt), nhưng phần I còn lại của Chuẩn, Khá, Nhanh là T_a / k chứ không phải vòng; và với người gõ chậm, T_a dài hơn cả đường đi nên chữ hiện từ cổng, ván dễ hẳn.
- Nếu anh vẫn muốn hướng này, cần thêm một thứ kéo độ khó lại cho người gõ chậm, đo cùng (i): ví dụ trần T_a theo đường (đòn bẩy (ii)), hay đo (i) chung với đường cong đợt D33 (4) hoặc với D31. Đó là quyết định của anh; lượt này không làm.

## 2. D31: tách vùng hiện chữ khỏi vùng Héo lan — đã đo, **không giữ** (cùng D27 (i): gãy G1 và trần 90 %; bản trên `main`: Nhanh 92,3 % ở 300 seed)

Hai nhánh, chưa gộp: `s2-d31` (`bef1b1b`, cắt từ `s1-word-ring`: D31 cùng D27 (i), đúng hướng anh chốt) và `s2-d31-alone` (`3ca89b7`, cắt từ `main`: D31 giữ vòng 26 m). Không kèm D30; `DIRECTOR_IDLE_SLACK` giữ 200 (bộ điều nhịp vẫn nhắm 30 %, không lấy phần 200 → 100 của bản thử 26/10). Bằng chứng: `tmp/mac-2026-10-27/owner/s2-d31/`.

### 2.1 Đã làm gì

- `src/sim/world.ts`: `PaceState.revealTicks` = T_a / min(k, 1) (`PACE.revealKMaxPm` 1000 trong `src/content/rules.ts`): người gõ nhanh hơn người chuẩn không thấy chữ muộn hơn người chuẩn. `approachTicks` (T_a / k) giữ nguyên.
- `src/sim/words.ts`: `inRevealZone` (nơi chữ hiện) dùng `revealTicks`, không vòng 26 m trên `s2-d31` (từ bước 1), trong vòng 26 m trên `s2-d31-alone`; `inWordZone` (vòng 26 m và T_a / k, như cũ) vẫn là vùng của Héo lan, mục tiêu mặc định của Thiên Hỏa và hàng chờ của bộ điều nhịp.
- Chỉ bot có k > 1 đổi (`pace.txt`): Khá k 1,21, T_a 7,85 → 9,48 s; b60 k 1,44, 6,23 → 9,00 s; Nhanh k 1,50, 6,00 → 9,00 s. Ẩu k 1,05, 14,40 → 15,05 s nhưng T_a của Ẩu đã dài hơn đường đi nên không đổi số nào (so JSON từng seed). Mọi bot k ≤ 1 (Mới, Chậm chắc, b25, Chuẩn và các biến thể, Trẻ em) chạy giống hệt: mọi số của báo cáo bot trùng từng chữ số.
- Test: `revealTicks` theo k (`tests/sim/smoke.test.ts`); người gõ 70 WPM có chữ ở quái nằm giữa T_a / k và T_a / min(k, 1), người chuẩn thì không (`tests/typing-words.test.ts`); chữ hiện sớm không thấm ngoài vùng T_a / k (`tests/sim/balance-pressure.test.ts`; vào vùng rồi thì trên `s2-d31` chờ đủ một độ chờ, trên `s2-d31-alone` thấm ngay ở nhịp đầu vì độ chờ tính từ lúc chữ hiện). Golden cập nhật bằng `pnpm dh:golden:update` trên cả hai nhánh: các lượt golden ở k = 1 nên chỉ mã băm đổi (thêm trường `revealTicks`), nhật ký lệnh giữ nguyên. `pnpm check`: 408/408 (`s2-d31`), 407/407 (`s2-d31-alone`).

### 2.2 Cùng D27 (i) (nhánh `s2-d31`): gãy G1 và trần 90 %

Độ chờ Héo lan tính từ lúc quái vào vùng T_a / k (`seepFrom` của bước 1). Cân bằng, 120 seed (`v0-all.json`, `cmp-base-v0.txt`); Thắng / S / P / I / O / N / Q (%, N là số lần):

| Bot | Mốc `83da970` | Bước 1 (`s1-word-ring`) | `s2-d31` |
|---|---|---|---|
| Khá | 75,8 / 47,5 / 23,7 / 26,6 / 0 / 0,78 / 37,6 | 93,3 / 49,3 / 23,4 / 25,8 / 0 / 0,55 / 31,3 | **100** / **72,1** / 16,5 / 20,4 / 0 / 0,05 / 26,7 |
| Nhanh | 90,0 / 44,5 / 30,3 / 30,7 / 0 / 0,72 / 48,4 | 73,3 / 32,1 / 29,4 / 30,4 / 0 / 0,80 / 48,4 | **100** / **71,7** / 16,1 / 19,5 / 0 / 0,02 / 29,7 |
| b60 | 77,5 / 36,1 / 31,3 / 29,5 / 0 / 0,76 / 48,4 | 68,3 / 34,8 / 29,9 / 28,4 / 0 / 0,74 / 47,9 | **100** / 67,8 / 18,0 / 19,0 / 0 / 0,03 / 29,4 |

Mọi bot khác giống bước 1 từng số (Chuẩn 92,5 / 63,3 / 20,5 / 19,1 / 0 / 0,33 / 31,3; bảng đủ ở mục 1.2). Cổng: **G1 gãy** như bước 1 (86,7 → 92,5 %); Khá, Nhanh, b60 thắng 120/120, **quá trần 90 %**; B1 theo dải D27 từ 6 lên 11 ô lệch (Khá, Nhanh thêm thắng cao và S cao; I của Nhanh 19,5 % nay trong dải); B4 đạt (S 85 so với 65); B7 như bước 1 (bot tắt nhịp có k = 1). Chữ hiện sớm mà chờ ngoài vùng không mất gì, nên người gõ nhanh gần như không bị Héo lan: Nhanh đợt 10 thua 9 → 0 lượt, Héo 393 → 249 máu mỗi lượt (`pw-base-v0.md`).

### 2.3 Biến thể đã thử (hai, trong hướng D31)

| Biến thể | Khác gì | Kết quả (Cân bằng, 120 seed) |
|---|---|---|
| V1, cùng D27 (i) | Như `s2-d31`, nhưng độ chờ Héo lan tính từ lúc chữ hiện, khi quái đã vào vòng 26 m (cách đọc của bản thử r3 26/10): vào vùng T_a / k là thấm ngay nếu chữ đã chờ quá độ chờ | **G1 gãy** (92,5 %, từ bước 1); **Nhanh 100 %, b60 99,2 %** quá trần; Khá 89,2 / 60,4 / 18,7 / 22,4 / 0 / 0,43 / 25,9; Nhanh 100 / 64,8 / 18,0 / 21,1 / 0 / 0,05 / 28,6; b60 99,2 / 60,9 / 18,9 / 21,6 / 0 / 0,08 / 27,5 (`cmp-base-v1.txt`) |
| V2, không kèm D27 (i) (nhánh `s2-d31-alone`) | D31 trên `main`: chữ hiện trong vòng 26 m và T_a / min(k, 1); Héo lan thấm trong vòng 26 m và T_a / k, độ chờ tính từ lúc chữ hiện (đúng chữ của 00 §4.10: "từ của nó đã hiện lâu hơn độ chờ") | Ở 120 seed qua mọi cổng, xem 2.4. **Ở 300 seed Nhanh thắng 92,3 %**, quá trần 90 % (mốc 90,3 %), xem 2.5 |

Không thử biến thể thứ ba. G1 gãy ở mọi bản cùng D27 (i) vì bot Chuẩn có k = 1, D31 không chạm nó; muốn D31 cùng (i) thì phải có thứ kéo (i) lại trước (mục 1.7).

### 2.4 V2 (D31 trên `main`): cả ải, Cân bằng, 120 seed (trước → sau)

`v2-all.json`, `v2-all.md` (cả ba chế độ, 2 × 60 seed), `cmp-base-v2.txt`. Mã của nhánh chạy giống hệt cây đo (so JSON từng seed của Khá, Nhanh).

| Bot | Thắng | S | P | I | O | N | Q | Hạ quái (s) |
|---|---|---|---|---|---|---|---|---|
| Khá | 75,8 → 85,8 | 47,5 → 62,9 | 23,7 → 19,1 | 26,6 → 23,4 | 0 → 0 | 0,78 → 0,39 | 37,6 → 38,9 | 3,9 → 3,5 |
| Nhanh | 90,0 → 88,3 | 44,5 → 47,6 | 30,3 → 20,9 | 30,7 → 24,0 | 0 → 0 | 0,72 → 0,29 | 48,4 → 37,4 | 3,5 → 3,3 |
| b60 | 77,5 → 87,5 | 36,1 → 46,0 | 31,3 → 22,0 | 29,5 → 24,2 | 0 → 0 | 0,76 → 0,45 | 48,4 → 38,2 | 3,6 → 3,4 |
| Mọi bot khác (b25, Chuẩn, Mới, Chậm chắc, Ẩu, Chuẩn tốt, Chuẩn kém, Chuẩn tắt nhịp, Chỉ gõ, Không gõ, Trẻ em) | không đổi | | | | | | | |

Thư giãn: mọi bot vẫn thắng 100 %. Thử thách: Khá 69,2 → 79,2 %, Nhanh 94,2 → 90,8 %, b60 85,0 → 84,2 %.

Cổng (trước → sau): G1 86,7 → 86,7 %, G3 85,8 → 85,8 %, G5 0 → 0 %, G6 120/120 thua ở đợt 1 → như cũ, G8 30,3 → 30,3 %, G9 1,40 → 1,40, G9b, G10, G11, G13, G13b, G15 đạt như cũ, G16 171,5 s trượt như cũ (cổng từ ải 15). B2, B3 (Mới 73 %, Trẻ em Thư giãn 91 %), B4, B5, B6, B8 đạt, số giống hệt. B1 theo dải D27 vẫn lệch đúng 6 ô như mốc (Mới thắng thấp, Chậm chắc thắng cao, Chuẩn I cao, Khá I cao, Ẩu thắng thấp, Nhanh I cao), không thêm ô nào; I của Khá, Nhanh xuống 3,2 và 6,7 điểm nhưng vẫn trên 20 %. B7 giống hệt (bot tắt nhịp có k = 1). Hai bộ seed cho cùng kết quả từng cổng. Theo từng bộ: Khá 51/60 và 52/60, Nhanh 55/60 (91,7 %, mốc cũng 55/60) và 51/60, b60 51/60 và 54/60.

Nhàn I tách theo nguyên nhân, % thời gian đợt (`pw-base-v2.md`; "ngoài T_a" là ngoài vùng hiện chữ):

| Bot | I | Đầu đợt: chỉ vòng chặn | Đầu đợt: ngoài T_a | Sau chữ đầu: chỉ vòng chặn | Sau chữ đầu: ngoài T_a | Trong vùng, chưa có chữ |
|---|---|---|---|---|---|---|
| Khá | 26,8 → 23,4 | 2,8 → 2,9 | 3,9 → 2,4 | 2,7 → 4,2 | 12,3 → 8,1 | 4,0 → 4,3 |
| Nhanh | 30,7 → 24,0 | 1,2 → 3,4 | 7,9 → 3,0 | 1,5 → 5,4 | 15,3 → 7,0 | 4,3 → 4,4 |
| b60 | 29,5 → 24,3 | 1,7 → 3,3 | 7,1 → 3,0 | 1,5 → 5,2 | 14,7 → 7,6 | 4,0 → 4,2 |

Phần I do T_a / k giảm một nửa, nhưng một phần chuyển sang vòng 26 m: với người gõ nhanh, nay vòng chặn trước (Nhanh: T_a 23,2 → 10,0 điểm, vòng 2,7 → 8,8).

Theo đợt, Cân bằng (trước → sau; Thua: số lượt thua ở đợt; Chữ đầu: giây từ lúc đợt bắt đầu tới chữ đầu; Héo: máu mất do Héo lan mỗi lượt vào đợt):

| Bot | Đợt | Thua | S | P | I | O | N | Q | Chữ đầu (s) | I 15 s đầu | Héo |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Khá | 1 | 0 → 0 | 96,6 → 98,9 | 8,7 → 2,8 | 35,6 → 33,1 | 0 → 0 | 0 → 0 | 48,5 → 48,5 | 5,5 → 3,3 | 43,2 → 34,2 | 20 → 9 |
| Khá | 3 | 0 → 0 | 72,4 → 77,8 | 22,6 → 18,4 | 26,0 → 21,1 | 0 → 0 | 0,02 → 0 | 51,8 → 42,3 | 8,6 → 5,5 | 58,0 → 41,5 | 140 → 114 |
| Khá | 8 | 21 → 9 | 41,6 → 53,4 | 41,7 → 33,4 | 21,3 → 18,8 | 0 → 0 | 0,28 → 0,13 | 21,8 → 21,4 | 2,0 → 2,0 | 37,8 → 25,6 | 304 → 188 |
| Khá | 10 | 0 → 0 | 53,1 → 65,0 | 31,1 → 27,6 | 27,1 → 23,0 | 0 → 0 | 0,13 → 0,07 | 31,6 → 31,2 | 1,6 → 1,6 | 40,4 → 32,6 | 246 → 187 |
| Nhanh | 1 | 0 → 0 | 96,7 → 98,0 | 15,9 → 4,4 | 43,8 → 32,3 | 0 → 0 | 0 → 0 | 53,1 → 45,0 | 7,5 → 3,8 | 54,6 → 42,3 | 22 → 12 |
| Nhanh | 2 | 0 → 0 | 82,9 → 93,7 | 31,6 → 8,5 | 30,5 → 21,2 | 0 → 0 | 0 → 0 | 62,6 → 42,6 | 6,6 → 3,5 | 49,6 → 28,4 | 93 → 37 |
| Nhanh | 3 | 0 → 0 | 65,5 → 82,6 | 34,7 → 17,3 | 33,3 → 20,1 | 0 → 0 | 0 → 0 | 53,4 → 42,0 | 10,6 → 4,7 | 70,5 → 32,0 | 175 → 96 |
| Nhanh | 4 | 0 → 1 | 56,6 → 69,7 | 24,9 → 18,1 | 26,7 → 18,8 | 0 → 0 | 0,04 → 0,01 | 63,3 → 40,2 | 2,6 → 2,6 | 42,9 → 25,2 | 225 → 158 |
| Nhanh | 10 | 9 → 11 | 46,4 → 51,7 | 39,4 → 36,9 | 22,8 → 19,6 | 0 → 0 | 0,36 → 0,20 | 46,7 → 37,3 | 1,6 → 1,6 | 44,0 → 40,1 | 393 → 403 |
| b60 | 1 | 0 → 0 | 96,1 → 97,4 | 20,4 → 5,9 | 40,6 → 30,6 | 0 → 0 | 0 → 0 | 52,1 → 48,2 | 7,5 → 3,8 | 52,6 → 39,2 | 34 → 15 |
| b60 | 3 | 0 → 0 | 64,6 → 79,9 | 34,8 → 18,7 | 32,0 → 23,6 | 0 → 0 | 0 → 0 | 53,4 → 39,0 | 10,6 → 5,4 | 70,9 → 37,2 | 191 → 112 |
| b60 | 10 | 21 → 9 | 42,3 → 49,8 | 40,9 → 38,4 | 21,7 → 19,1 | 0 → 0 | 0,30 → 0,19 | 46,8 → 39,3 | 1,7 → 1,6 | 43,3 → 41,4 | 406 → 393 |

- Đợt 1–3: chữ đầu của người gõ nhanh sớm hơn 1,6–5,9 s (từ 4,6–10,6 s còn 3,0–5,5 s); I 15 s đầu giảm 9–39 điểm (Nhanh đợt 3: 70,5 → 32,0). Từ đợt 4 chữ đầu không đổi (2,6 s): ở đó vòng 26 m chặn trước.
- Đợt 10 vẫn là vực của Nhanh (thua 9 → 11 lượt, Héo 393 → 403); Khá thua ít đi ở đợt 8 (21 → 9), b60 ở đợt 10 (21 → 9).
- Q của Nhanh, b60 xuống 10–11 điểm (48 → 37–38 %), ngang các bot khác, xa thêm đích 55–70 % của BALANCE §9.1.

### 2.5 300 seed (Khá, Nhanh, b60; Cân bằng, 2 × 150 seed)

Ở 120 seed Nhanh 88,3 % chỉ cách trần 1,7 điểm, nhỏ hơn độ nhiễu, nên chạy thêm 300 seed cho cả mốc và V2 (`fast300-base.*`, `fast300-v2.*`):

| Bot | Mốc `83da970` | V2 |
|---|---|---|
| Khá | 75,7 / 50,4 / 23,7 / 26,7 / 0 / 0,74 / 38,2 | 86,0 / 64,3 / 19,2 / 23,4 / 0 / 0,32 / 38,8 |
| Nhanh | 90,3 / 43,2 / 30,2 / 30,7 / 0 / 0,71 / 48,6 | **92,3** / 50,6 / 20,8 / 24,0 / 0 / 0,29 / 37,3 |
| b60 | 79,3 / 37,9 / 31,1 / 29,6 / 0 / 0,80 / 48,4 | 88,3 / 49,8 / 21,7 / 24,2 / 0 / 0,40 / 38,7 |

B4 ở 300 seed (Chậm chắc, Ẩu, Mới, Chuẩn; `b4-v2-300.md`): giống hệt mốc của đợt test (S 64 so với 61, hạ quái 4,29 so với 5,31 s), vì bốn bot này không đổi.

**Nhanh 92,3 % quá trần 90 % mà anh đặt cho D31.** Mốc cũng đã 90,3 % ở 300 seed, nên D31 đẩy Nhanh lên khoảng 2 điểm, trong độ nhiễu (120 seed: −1,7; 300 seed: +2,0). Theo điều kiện của anh, bước này **không giữ**.

### 2.6 Trình duyệt (Apple M4, Vite riêng 127.0.0.1:4151)

Kịch bản tạm của bước `reveal-fast.mjs` (thư mục bằng chứng) chạy qua `scripts/visual/cdp-run.mjs` trên mã của nhánh `s2-d31-alone`, 70 WPM. Ở trình duyệt, hồ sơ 70 WPM không có độ chính xác nên lấy 95 %, CV 0,25: k 1,449, T_a / k 6,9 s, vùng hiện chữ 10,0 s. Kết quả `ok` ở cả 1280×720 và 1920×1080: 0 exception, 0 tài nguyên lỗi, mã băm phát lại khớp.

| Cỡ | Đợt | Chữ đầu sau khi đợt bắt đầu | Quái cách bệ | Quái còn tới chỗ dừng |
|---|---|---|---|---|
| 1280×720 | 1 | 2,9 s ("place") | 25,1 m | 9,8 s |
| 1280×720 | 2 | 2,4 s ("money") | 25,5 m | 9,9 s |
| 1920×1080 | 1 | 2,7 s ("small") | 25,4 m | 10,0 s |
| 1920×1080 | 2 | 2,4 s ("good") | 25,6 m | 9,9 s |

Chữ đầu hiện ngay khi quái vào vòng 26 m, lúc nó còn khoảng 10 s đường; theo luật cũ (T_a / k) chữ chỉ hiện khi còn 6,9 s. Cùng kịch bản trên `main` (`cb9931f`, trước D31; `browser-main/`, cũng `ok`, 0 exception, 0 tài nguyên lỗi, mã băm khớp): chữ đầu đợt 1 hiện sau 6,8 s ở cả hai cỡ, đợt 2 sau 5,6 s (1280) và 5,4 s (1920); quái Lính có chữ ở 19,3–19,6 m, còn 6,7–6,9 s đường (một lần là bầy Kiến Gai ở 25,1 m, đi nhanh nên còn 6,8 s). Tức D31 cho người gõ 70 WPM chữ đầu sớm hơn khoảng 3–4 s mỗi đợt. Ảnh `browser-main/w1-first-1280x720.png`: 6,8 s sau khi đợt bắt đầu mới có "happy" trên bầy Kiến Gai bên kia cầu, Lính ở chỗ lội nước phía tây chưa có chữ; `w1-first-1920x1080.png`: "small" trên Lính đã qua chỗ lội nước, "idea" trên bầy Kiến Gai.

Ảnh đã xem (`browser-alone/`):
- `w1-first-1280x720.png`, `w1-first-1920x1080.png`: thẻ "place" / "small" kèm nghĩa trên Yêu Rêu Lính ở chỗ lội nước của đường phía tây; thẻ rõ, nằm trong màn, không đè HUD.
- `w2-first-1280x720.png`: "money" trên hai quái của đường phía bắc, bên kia cầu.
- `w2-first+1.5s-1920x1080.png`: 1,5 s sau, "problem" và "good" trên hai quái đi sát nhau sau cây cầu; hai thẻ không che nhau.

### 2.7 Kết luận, chờ anh

- **Không giữ.** Cùng D27 (i) (đúng hướng anh chốt): G1 gãy từ bước 1, và Khá, Nhanh, b60 thắng 100 % (cách đọc độ chờ tính từ lúc vào vùng) hay Nhanh 100 %, b60 99,2 % (tính từ lúc chữ hiện). Không kèm (i) (V2): qua mọi cổng ở 120 seed, mọi bot k ≤ 1 không đổi, B4 không đổi, nhưng Nhanh 92,3 % ở 300 seed, quá trần 90 %.
- V2 làm đúng việc của D31: người gõ nhanh có chữ sớm hơn 1,6–5,9 s ở đợt 1–3, I của Khá, Nhanh, b60 giảm 3–7 điểm, P giảm 5–9 điểm, S tăng 3–15 điểm; không bot nào k ≤ 1 bị chạm. Nhưng I của họ vẫn 23–24 % (dải D27 ≤ 20 %): phần còn lại là vòng 26 m.
- Anh cần chọn một trong hai: (a) giữ V2 (nhánh `s2-d31-alone`, cắt từ `cb9931f`, chỉ đổi mã, test và golden nên gộp không xung đột), coi trần 90 % là "không cao hơn mốc quá độ nhiễu" vì mốc Nhanh đã 90,3 %; hoặc (b) chờ D33 (4) (đường cong đợt) rồi đo lại D31 cùng nó. Lưu ý D33 (4) có phần "đợt 10 không còn là vực của người gõ nhanh", phần đó làm Nhanh dễ thêm, nên cần một thứ kéo Nhanh xuống đi kèm.

## 3. D33 (4): đường cong đợt — đã đo, **không giữ** (gãy G1)

Ba việc của hướng (4) mà bước này làm (phát hiện 12, 40, 41 của `2026-10-27-test-pass.md`): dời Heo của Đường Cầu ở đợt 4 ra sau đỉnh, không bớt quái; đợt 10 không còn là vực của người gõ nhanh, phần Héo lan tăng theo tốc độ gõ dừng ở mức đợt 9; bộ điều nhịp không đẩy đỉnh ngắn của đợt giữa quá 1,15. Phần "đợt 5–6 thêm sức ép từ (2)" thuộc bước của hướng (2), bước này không làm.

Nhánh `s3-wave-curve` (chưa gộp), hai commit trên `d2057b6`: `b7ea784` (V0, bản chính) và `9d173e1` (V1, biến thể trên V0). Bằng chứng: `tmp/mac-2026-10-27/owner/s3-wave-curve/`.

### 3.1 Đã làm gì

- **Đợt 4** (`src/content/data/waves.ts`): thêm loại quãng lặng "sau đỉnh" (`LA`). Toán của nó chỉ rời cổng khi chữ của nó hiện lúc người gõ tham chiếu đã gõ xong chữ của đỉnh ngay trước. Heo của Đường Cầu ở đợt 4 dùng loại này; số quái giữ nguyên. Trước đây Heo này rời cổng lúc 17,7 s, chữ hiện lúc 19,65 s, trong khi đỉnh 1 phải tới 23,1 s mới gõ xong: đường Cầu ngắn, không có chỗ lội, nên ba chữ của Heo dồn lên đỉnh. Nay Heo rời cổng lúc 21,2 s, chữ hiện lúc 23,15 s.
  - V0: trần đỉnh của kế hoạch đợt 4 (`fit100` 1,02) đẩy phần sau đợt chậm thêm 2,9 s. Đợt dài 62 → 65 s, tải 0,79 → 0,76.
  - V1: `rate` 94 → 104, `fit100` 102 → 108, để đợt giữ 62 s và tải 0,79. Đỉnh kế hoạch 1,00 → 1,08, vẫn dưới 1,15.
- **Đợt 10** (`src/sim/combat.ts` `blightScale`, `src/content/rules.ts` `PRESSURE.rootKHoldWave` = 9): với người chơi có k > 1, Héo lan từ đợt 10 lấy số lớn hơn giữa "ramp của đợt" và "ramp đợt 9 × √k". Ví dụ Nhanh (√k 1,225): 133 % × 1,225 = 1,63 → 121 % × 1,225 = 1,48 (−9 %). Người có k ≤ 1 không đổi. Người chỉ nhanh hơn chuẩn một chút không bao giờ mất ít hơn người chuẩn ở đợt 10. V0 và V1 giống nhau ở phần này.
- **Bộ điều nhịp** (`src/sim/director.ts` `squeezeCap`): sàn co khoảng sinh của mỗi đợt nay tính theo trần đỉnh ngắn của loại đợt trong 00 §4.4. Đợt giữa trần 1,15, đợt cuối trần của ải (M0: 1,40). Trước đây mọi đợt chung một trần 1,35.
  - V0: đợt giữa 1,15 − 0,05 = 1,10 (giữ 0,05 cho độ lệch của luật cổng như cũ).
  - V1: đợt giữa đúng 1,15; 0,05 chỉ giữ dưới trần cứng 1,40.
  - Sàn theo đợt 2–9, mốc → V0 → V1 (‰ khoảng sinh): 850/850/850/900/850/880/860/880 → 860/850/930/970/910/1000/980/1000 → 850/850/960/950/890/970/960/970. Đợt 10 giữ 1000.
  - Đợt 7 và 9 mở bằng một hàng 3 Sói nên kế hoạch đã ở 1,10, gần như hết chỗ co. Hạ `fit100` của các đợt này xuống 1,00 thì không xếp được: riêng hàng Sói đã đọc trên 1,00.
- **Phát hiện 40** (Đường Cầu 58,2 % đe dọa trên đất ở đợt 7): không đổi. Việc dời Heo chỉ chạm đợt 4 (Suối vẫn 65,1 % ở đợt 4), nên không sửa kèm được. Muốn sửa phải đổi thành phần đợt 7, ví dụ cho Cung ở quãng lặng 3 sang Đường Cầu. Chủ dự án chưa chọn việc đó.
- Test mới: Heo đợt 4 hiện chữ sau khi đỉnh 1 gõ xong (V1 thêm: đợt giữ 62 s, tải 0,79); `blightScale`; sàn của bộ điều nhịp giữ kế hoạch co dưới trần của từng đợt. Golden cập nhật bằng `pnpm dh:golden:update` ở cả hai commit. Mã băm đổi từ tick 60 vì sàn của bộ điều nhịp là trạng thái thế giới; nhật ký lệnh của `sloppy-hard-off-seed3` 623 → 609 (V0) → 615 (V1). `pnpm check` 408/408 ở cả hai.
- Lượt `pnpm dh:balance --modes=balanced --seeds=60 --jobs=3` trên đầu nhánh (`v1-official.json`) khớp 15/15 bot với lượt chạy cả ba chế độ của cây đo (`v1-all.json`).

### 3.2 Cả ải, Cân bằng, 120 seed

Mỗi ô ghi Thắng / S / P / I / O / N / Q (%, N là số lần). `v0-all.json`, `v1-all.json` (cả ba chế độ, 2 × 60 seed), `cmp-base-v0.txt`, `cmp-base-v1.txt`.

| Bot | Mốc `83da970` | V0 (`b7ea784`) | V1 (`9d173e1`) | Hạ quái (s) |
|---|---|---|---|---|
| b25 | 85,8 / 70,6 / 20,3 / 18,5 / 0 / 0,42 / 40,9 | 95,0 / 86,9 / 17,5 / 20,9 / 0 / 0,19 / 40,9 | 96,7 / 79,3 / 18,1 / 20,1 / 0 / 0,33 / 40,9 | 5,3 → 5,0 → 5,1 |
| Chuẩn (b35) | 86,7 / 60,1 / 21,3 / 20,8 / 0 / 0,48 / 38,4 | **97,5** / 64,5 / 19,0 / 22,6 / 0 / 0,18 / 37,7 | **94,2** / 62,7 / 20,0 / 21,8 / 0 / 0,30 / 37,8 | 4,2 → 4,0 → 4,1 |
| b60 | 77,5 / 36,1 / 31,3 / 29,5 / 0 / 0,76 / 48,4 | 90,8 / 47,1 / 29,1 / 32,0 / 0 / 0,38 / 47,0 | 90,8 / 47,8 / 29,5 / 31,4 / 0 / 0,38 / 47,0 | 3,6 → 3,5 → 3,5 |
| Mới | 72,5 / 61,2 / 23,9 / 16,4 / 0 / 0,85 / 42,7 | 87,5 / 73,1 / 21,1 / 18,6 / 0 / 0,55 / 42,4 | 80,8 / 70,1 / 22,0 / 17,7 / 0 / 0,62 / 42,6 | 6,1 → 5,7 → 5,9 |
| Chậm chắc | 94,2 / 63,5 / 19,9 / 18,8 / 0 / 0,29 / 40,0 | 99,2 / 75,1 / 17,4 / 21,1 / 0 / 0,12 / 40,0 | 98,3 / 70,5 / 18,0 / 20,2 / 0 / 0,07 / 39,9 | 4,9 → 4,7 → 4,8 |
| Khá | 75,8 / 47,5 / 23,7 / 26,6 / 0 / 0,78 / 37,6 | 90,0 / 59,4 / 22,4 / 29,1 / 0 / 0,50 / 35,5 | 86,7 / 56,4 / 22,6 / 28,1 / 0 / 0,61 / 36,1 | 3,9 → 3,8 → 3,8 |
| Ẩu | 73,3 / 61,2 / 23,8 / 16,2 / 0,2 / 0,65 / 37,7 | 78,3 / 67,3 / 22,2 / 17,2 / 0,2 / 0,49 / 36,8 | 77,5 / 70,5 / 23,1 / 17,1 / 0,2 / 0,62 / 36,9 | 5,3 → 5,1 → 5,2 |
| Nhanh | 90,0 / 44,5 / 30,3 / 30,7 / 0 / 0,72 / 48,4 | 97,5 / 55,2 / 27,9 / 33,8 / 0 / 0,14 / 48,4 | 95,8 / 50,0 / 28,6 / 33,1 / 0 / 0,34 / 48,4 | 3,5 → 3,3 → 3,3 |
| Chuẩn tốt | 85,8 / 61,1 / 19,1 / 20,5 / 0 / 0,38 / 40,4 | 97,5 / 74,3 / 16,6 / 23,2 / 0 / 0,08 / 38,9 | 94,2 / 71,9 / 17,4 / 22,3 / 0 / 0,14 / 39,9 | 4,1 → 3,8 → 3,9 |
| Chuẩn kém | 40,8 / 0 / 22,1 / 18,8 / 0 / 2,39 / 48,4 | 60,8 / 25,8 / 21,2 / 19,7 / 0 / 2,05 / 48,1 | 62,5 / 26,4 / 21,5 / 19,6 / 0 / 2,24 / 48,4 | 4,6 → 4,5 → 4,5 |
| Chuẩn tắt nhịp (B7) | 84,2 / 67,4 / 20,5 / 22,2 / 0 / 0,26 / 38,1 | 93,3 / 66,1 / 19,3 / 22,9 / 0 / 0,20 / 37,8 | 82,5 / 62,2 / 20,2 / 22,2 / 0 / 0,21 / 38,3 | 4,2 → 4,0 → 4,2 |
| Chỉ gõ | 0 / 0 / 24,8 / 17,7 / 0 / 0,53 / 47,7 | 0 / 0 / 23,8 / 17,9 / 0 / 0,57 / 47,2 | 0 / 0 / 24,3 / 17,9 / 0 / 0,54 / 47,3 | 5,1 → 4,9 → 5,0 |
| Không gõ | 0 / 0 / 70,2 / 4,5 / 0 / 0 / 76,2 | không đổi | không đổi | 9,2 |
| Trẻ em | 9,2 / 0 / 38,8 / 7,8 / 0 / 1,62 / 88,1 | 10,0 / 0 / 38,5 / 7,8 / 0 / 1,72 / 87,2 | 12,5 / 0 / 38,7 / 7,7 / 0 / 1,75 / 87,2 | 9,5 → 9,5 → 9,5 |

- Thư giãn: Trẻ em 90,8 → 90,8 → 90,8 %; mọi bot gõ vẫn thắng 100 %.
- Thử thách: Chuẩn 60,0 → 90,8 → 83,3 %; Khá 69,2 → 95,8 → 93,3 %; Mới 63,3 → 85,0 → 79,2 %; Chuẩn tốt / kém 78,3 / 25,0 → 94,2 / 59,2 → 90,8 / 52,5 %.
- 300 seed (2 × 150; Chậm chắc, Ẩu, Mới, Chuẩn; `b4-v1-300.json`), mốc → V1: Chuẩn thắng 81,7 → 93,3 %; S Chậm chắc so với Ẩu 64,3 / 61,1 → 72,7 / 71,2. Mốc 300 seed lấy từ `s2-d31/b4-v2-300.json`, nơi bốn bot này trùng mốc từng số.

### 3.3 Cổng (mốc → V0 → V1)

| Cổng | Mốc | V0 | V1 | |
|---|---|---|---|---|
| **G1** (b35 thắng 75–90 %) | 86,7 % | **97,5 %** | **94,2 %** (300 seed: 93,3 %, mốc 81,7 %) | **gãy** ở cả hai |
| G3 (b25 ≥ 70 %) | 85,8 % | 95,0 % | 96,7 % | đạt |
| G5 (chỉ gõ ≤ 40 %) | 0 % | 0 % | 0 % | đạt |
| G6 (không gõ thua trước đợt 3) | 120/120 ở đợt 1 | như cũ | như cũ | đạt |
| G8 (phe ta 20–35 %) / G8b | 30,3 / 69,7 % | 30,5 / 69,5 % | 30,4 / 69,6 % | đạt |
| G9 (tải đỉnh ≤ 1,40) | 1,40 | 1,40 | 1,40 | đạt (đợt 10) |
| G9b, G10, G11, G13, G13b, G15 | đạt | đạt | đạt | G11 1,2 → 1,0 → 1,0 %; G13 1333 → 1389 → 1372 vàng |
| G16 (cổng từ ải 15) | 171,5 s | 178,1 s | 178,0 s | trượt như cũ |
| B2 | đạt | đạt | đạt | |
| B3 | Mới 73 %, Trẻ em Thư giãn 91 % | 88 % / 91 % | 81 % / 91 % | đạt |
| B4 | S 64 so với 61; hạ quái 4,21 so với 5,25 s | 75 so với 67; 3,97 so với 5,10 s | 120 seed: 71 so với 71 (trượt); **300 seed: 72,7 so với 71,2**, hạ quái 4,10 so với 5,14 s | đạt (V1 sát: biên 1,5 điểm) |
| B5, B8 | đạt | đạt | đạt | |
| B6 | Tốt / Kém 86 / 41 % (Cân bằng), 78 / 25 % (Thử thách) | 98 / 61 %, 94 / 59 % | 94 / 63 %, 91 / 53 % | đạt |
| B7, phần bộ điều nhịp | đạt (≤ 3 bậc mỗi đợt, khoảng sinh ±15 %) | đạt | đạt | |
| B1 theo dải D27 | 6 ô lệch | **9 ô lệch** | **9 ô lệch** | xấu thêm |
| B7 theo dải D27 (bot tắt nhịp) | 2 ô lệch: S cao, I cao | 3 ô: **thắng cao**, S cao, I cao | 1 ô: I cao | V0 xấu thêm, V1 tốt lên |

B1 theo dải D27, bot lệch:

- Mốc: Mới (thắng thấp), Chậm chắc (thắng cao), Chuẩn (I cao), Khá (I cao), Ẩu (thắng thấp), Nhanh (I cao).
- V0 và V1 cùng một danh sách: Mới (**S cao**), Chậm chắc (thắng cao, **S cao, I cao**), Chuẩn (**thắng cao**, I cao), Khá (I cao), Ẩu (**S cao**), Nhanh (**thắng cao**, I cao).
- Mới và Ẩu không còn thắng thấp nhưng nay S cao. I tăng 1–3 điểm ở mọi bot: bộ điều nhịp đẩy ít hơn nên người chơi chờ chữ lâu hơn ở đợt giữa.
- Hai bộ seed cho cùng kết quả từng cổng. G1 theo từng bộ (20261023 / 21261026): mốc 87 / 87 %, V0 97 / 98 %, V1 95 / 93 %.

### 3.4 Theo đợt (mục tiêu của bước)

Cân bằng, 2 × 60 seed (`perwave.ts`; `pw-base-v0.md`, `pw-base-v1.md`). Thua: số lượt thua ở đợt đó, trên số lượt vào đợt. Héo: máu mất do Héo lan mỗi lượt vào đợt. Q là trung vị của đợt.

**Đợt 4 (bậc khó của phát hiện 12)**, mốc → V0 → V1:

| Bot | Thua | S | P | I | N | Q | Héo | Đòn quái |
|---|---|---|---|---|---|---|---|---|
| Mới | 17 → 7 → 12 /119 | 47,1 → 49,5 → 48,9 | 33,8 → 27,1 → 29,5 | 10,8 → 13,7 → 12,3 | 0,29 → 0,23 → 0,25 | 51,7 → 49,9 → 48,7 | 281 → 236 → 253 | 31 → 27 → 27 |
| Ẩu | 15 → 10 → 14 /119 | 49,8 → 51,6 → 48,9 | 32,4 → 26,7 → 31,2 | 11,7 → 14,1 → 12,6 | 0,24 → 0,18 → 0,27 | 44,7 → 41,2 → 42,2 | 261 → 220 → 260 | 25 → 22 → 24 |
| b25 | 11 → 4 → 4 /120 | 51,9 → 58,5 → 55,4 | 30,6 → 19,8 → 23,2 | 10,5 → 15,1 → 13,4 | 0,24 → 0,10 → 0,17 | 49,0 → 46,2 → 47,0 | 273 → 177 → 209 | 23 → 14 → 17 |
| Chuẩn | 5 → 1 → 3 /120 | 50,0 → 54,7 → 53,4 | 27,2 → 18,9 → 22,4 | 15,7 → 19,3 → 17,0 | 0,22 → 0,09 → 0,17 | 41,4 → 40,6 → 40,5 | 263 → 181 → 218 | 13 → 7 → 9 |
| Chậm chắc | 3 → 0 → 1 /120 | 52,3 → 58,2 → 56,7 | 24,3 → 15,1 → 18,6 | 12,4 → 16,9 → 14,3 | 0,12 → 0,03 → 0,04 | 44,2 → 43,3 → 44,7 | 225 → 136 → 171 | 13 → 7 → 9 |
| Khá | 3 → 0 → 0 /120 | 63,1 → 65,3 → 64,7 | 20,8 → 17,4 → 17,2 | 24,1 → 27,9 → 26,5 | 0,02 → 0,03 → 0,03 | 49,6 → 44,1 → 44,5 | 200 → 156 → 154 | 5 → 5 → 4 |
| Chuẩn tắt nhịp | 16 → 6 → 13 /119 | 51,7 → 57,7 → 55,0 | 26,4 → 18,9 → 23,5 | 15,6 → 19,9 → 16,9 | 0,14 → 0,07 → 0,08 | 41,6 → 39,6 → 40,3 | 242 → 172 → 215 | 12 → 8 → 10 |

Héo lan là nguồn mất máu chính của đợt 4; đòn quái chỉ 4–31 máu mỗi lượt. Ở mốc, Héo dồn ở 15–25 s, lúc chữ của đỉnh 1 và ba chữ của Heo cùng chờ: Chuẩn mất 83 máu trong 10 s đó (`diag-base-w4.txt`, 2 × 40 seed). Bậc khó đợt 4 giảm rõ ở V0. Ở V1 (đợt giữ tải), mức giảm còn rõ ở b25, Chuẩn, Chậm chắc. Mới 17 → 12 và Ẩu 15 → 14 lượt thua thì gần như còn nguyên.

**Đợt 7–9 (bộ điều nhịp, phát hiện 41)**: đỉnh ngắn đo được, lớn nhất qua mọi lượt của các bot gõ có bộ điều nhịp (bảng "Tải gõ theo đợt" của báo cáo; `peaks.py`):

| Đợt | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|
| Mốc | 1,04 | 1,07 | 1,17 | 1,34 | 1,22 | 1,35 | 1,37 | 1,35 | 1,40 |
| V0 | 1,04 | 1,07 | 1,11 | 1,09 | 1,10 | 1,11 | 1,11 | 1,11 | 1,40 |
| V1 | 1,04 | 1,07 | 1,16 | 1,16 | 1,15 | 1,15 | 1,15 | 1,16 | 1,40 |
| Chuẩn tắt nhịp (mốc) | 1,00 | 1,00 | 1,00 | 1,00 | 1,00 | 1,11 | 1,07 | 1,11 | 1,39 |

- V0 đạt mục tiêu: không đợt giữa nào quá 1,15 (lớn nhất 1,11).
- V1 vượt 0,01 ở đợt 4, 5 và 9: kế hoạch co tới đúng 1,15, luật cổng làm lệch thêm khoảng 0,01. Vì vậy V0 giữ 0,05.

Cùng lúc, Héo ở đợt giữa giảm và người chơi thua ít đi, mốc → V1:

| Bot | Đợt | Thua | S | P | I | Héo |
|---|---|---|---|---|---|---|
| Chuẩn | 7 | 4 → 0 | 54,3 → 60,2 | 25,1 → 21,7 | 18,3 → 20,6 | 191 → 144 |
| Chuẩn | 9 | 3 → 1 | 57,7 → 64,0 | 26,8 → 24,6 | 20,6 → 24,8 | 165 → 149 |
| Khá | 8 | 21 → 10 | 41,6 → 44,3 | 41,7 → 38,0 | 21,3 → 23,4 | 304 → 288 |
| Ẩu | 8 | 8 → 2 | 61,9 → 64,0 | 31,3 → 26,8 | 13,2 → 15,9 | 183 → 140 |
| Mới | 8 | 4 → 3 | 58,1 → 67,7 | 28,1 → 22,4 | 13,0 → 17,1 | 195 → 135 |

Ở V0 mức giảm còn lớn hơn: Chuẩn đợt 7 Héo 191 → 126, thua 4 → 0; Khá đợt 8 thua 21 → 6. Q của đợt 7–8 vẫn 20–23 % ở mọi bot.

**Đợt 10 (vực của người gõ nhanh)**, mốc → V0 → V1 (thua / lượt vào; Héo):

| Bot | Đợt 9: thua | Đợt 9: Héo | Đợt 10: thua | Đợt 10: S | Đợt 10: Héo |
|---|---|---|---|---|---|
| Nhanh | 1 → 0 → 1 | 184 → 157 → 177 | 9/117 → 3/120 → 3/118 | 46,4 → 54,9 → 50,4 | 393 → 340 → 380 |
| b60 | 3 → 0 → 0 | 207 → 190 → 201 | 21/114 → 11/120 → 10/119 | 42,3 → 49,2 → 48,8 | 406 → 391 → 373 |
| Khá | 2 → 2 → 0 | 135 → 125 → 127 | 0/91 → 3/111 → 1/105 | 53,1 → 57,9 → 57,2 | 246 → 224 → 221 |

- Riêng phần Héo lan (chỉ `blightScale`, nhánh đo `b-src`): Nhanh đợt 10 thua 9 → 5, Héo 393 → 357; b60 21 → 14, Héo 406 → 378. Phần còn lại ở V0, V1 là do bộ điều nhịp: người chơi vào đợt 10 với nhiều máu hơn.
- b60 vẫn thua 10/119 ở đợt 10, so với 0/119 ở đợt 9; đợt 10 vẫn là vực.
- Theo 5 s (`diag-base-w10a.txt`, `diag-v1-w10.txt`): ở V1, Nhanh và b60 mất 120–125 máu Héo trong khoảng 15–20 s của đợt 10 (mốc 128–136). Cùng khoảng ở đợt 9 chỉ 29–30 (mốc 42–46).
- Phần √k chỉ khoảng 9 % Héo của đợt 10. Vực đến từ cú dồn đầu đợt 10: hàng Sói cách 2,2 s, nén theo 1 / k (1,47 s ở k 1,5), cùng đỉnh 1 tải 1,40. Mục tiêu "đợt 10 không còn là vực" **chưa đạt** bằng đòn bẩy này.

### 3.5 Phần nào gây gì (mỗi phần riêng, Cân bằng, 120 seed)

| Phần (riêng, trên mốc) | Chuẩn (G1) | Chuẩn tắt nhịp | Mới | Khá | Nhanh | b60 | Ghi chú |
|---|---|---|---|---|---|---|---|
| Đợt 4 dạng V0 (`a-src`) | 86,7 → **93,3** | 84,2 → 93,3 | 72,5 → 79,2 | 75,8 → 71,7 | 90,0 → 93,3 | 77,5 → 82,5 | đợt 4: Mới thua 17 → 7, Chuẩn tắt nhịp 16 → 6 |
| Phần Héo lan đợt 10 (`b-src`) | 86,7 → 86,7 | không đổi | không đổi | 75,8 → 75,8 (S 47,5 → 51,3) | 90,0 → **93,3** | 77,5 → 83,3 | chỉ bot k > 1 đổi; 300 seed (`b300.json`): Nhanh 90,3 → 93,3, b60 79,3 → 83,7, Khá 75,7 → 76,3, B4 64,3 so với 61,4 |
| Bộ điều nhịp, trần V0 (`c-src`) | 86,7 → **95,0** | không đổi | 72,5 → 82,5 | 75,8 → 90,8 | 90,0 → 98,3 | 77,5 → 91,7 | Chuẩn tốt / kém 98,3 / 64,2 |
| Đợt 4 dạng V1 + Héo lan, không đổi bộ điều nhịp (`ab1-src`) | 86,7 → **90,8** | 84,2 → 82,5 | 72,5 → 77,5 | 75,8 → 80,0 | 90,0 → 91,7 | 77,5 → 85,8 | B4 S 67 so với 66 |

Số đủ ở `cmp-base-a.txt`, `cmp-base-b.txt`, `cmp-base-c.txt`, `cmp-base-ab1.txt`. Trần đỉnh của bộ điều nhịp gánh phần lớn mức dễ thêm. Bộ điều nhịp chỉ còn ít chỗ để đẩy ở đợt giữa: đợt 7 và 9 còn 0–3 %, các đợt khác 2–15 %. Nhưng nó vẫn giảm khoảng sinh và cho bình máu khi người chơi nóng. Nên với trần này, Chuẩn có bộ điều nhịp thắng 95 %, cao hơn cả khi tắt nhịp (84,2 %).

### 3.6 Biến thể đã thử

| Bản | Khác gì | Kết quả (Cân bằng, 120 seed) |
|---|---|---|
| V0 (`b7ea784`) | Như 3.1; trần đợt giữa 1,10 (1,15 − 0,05); đợt 4 dài 65 s | **G1 97,5 %**, B1 9 ô lệch, B7 thêm thắng cao (93,3 %) |
| V1 (`9d173e1`) | Đợt 4 giữ 62 s và tải 0,79; trần đợt giữa đúng 1,15 | **G1 94,2 %** (300 seed 93,3 %), B4 sát (300 seed 72,7 so với 71,2), B1 9 ô lệch, đỉnh đo được 1,16 ở ba đợt |

Không thử biến thể thứ hai. Mọi cách đọc khác của ba việc vẫn làm ván dễ hơn bản V1:

- Riêng phần đợt 4 dạng V1 và Héo lan, giữ bộ điều nhịp cũ, G1 đã là 90,8 %.
- Mọi trần 1,15 đều lấy bớt chỗ co của bộ điều nhịp, và không còn đòn bẩy nào trong hướng (4) để bù.
- Một bộ điều nhịp đẩy bằng quãng lặng (BALANCE §4.2 "quãng lặng ± 3 s") thay vì co cả đợt, trong trường hợp tốt nhất cũng chỉ trả G1 về khoảng 90,8 %.

### 3.7 Trình duyệt

Vite riêng ở 127.0.0.1:4151 `--strictPort`, mã của đầu nhánh (V1), đã tắt sau khi chạy. Kịch bản tạm của bước là `wave4.mjs` (thư mục bằng chứng), chạy qua `heavy.sh --gpu node scripts/visual/cdp-run.mjs`. Kịch bản chạy nhanh đợt 1–3: một người gõ trong trang gửi phím qua `__dh.send`, tốc 8×. Sau đó đợt 4 chạy tốc 1, gõ bằng phím thật ở 35 WPM (k = 1).

Lượt đầu chạy cả hai cỡ. Ở 1280, người gõ chạy nhanh (không mua bẫy, nhà) dừng ở đợt 3, không tới được đợt 4. Lượt hai (`browser-run-2.json`) chạy lại riêng 1280, người gõ chạy nhanh gõ gấp đôi. Kết quả: 1920×1080 (`browser-run-1.json`) và 1280×720 (`browser-run-2.json`) đều tới đợt 4 và thắng đợt 4; 0 exception, 0 tài nguyên lỗi, mã băm phát lại khớp. `ok` của lượt đầu là false chỉ vì phần 1280 của lượt đó.

| Cỡ | Chữ đỉnh 1 hiện (s sau khi đợt bắt đầu) | Chữ Heo Đường Cầu hiện | Chữ khác còn sống lúc đó | Quái cách bệ |
|---|---|---|---|---|
| 1920×1080 | 10,5; 12,5; 15,0 | 21,7 s ("morning") | 0 | 25,4 m |
| 1280×720 | 10,6; 12,5; 15,1 | 21,5 s ("special") | 0 | 25,9 m |

Theo kế hoạch của mốc, chữ Heo này hiện lúc 19,65 s, khi chữ của đỉnh 1 còn chờ; người chơi ở trình duyệt đã gõ xong đỉnh 1 trước 21,5 s. Ảnh đã xem (`browser/`):

- `w4-boar-cau-1920x1080.png`, `w4-boar-cau-1280x720.png`: đợt 4, sân trống trừ Heo trên đường phía bắc, bên kia cầu. Thẻ "morning" / "special" kèm nghĩa và nhãn MỚI đọc rõ, nằm trong màn, không đè HUD. Máu 538/538.
- `w4-boar-cau+1.5s-*.png`: 1,5 s sau, Heo tới đầu cầu, thẻ đi theo. Chưa có quái nào của đỉnh 2.

### 3.8 Kết luận, chờ anh

- **Không giữ.** G1 gãy ở cả hai bản: Chuẩn thắng 97,5 % (V0) và 94,2 % (V1; 93,3 % ở 300 seed, mốc 81,7 %). B1 theo dải D27 từ 6 lên 9 ô lệch.
- Từng việc đạt hay không:
  - Bậc khó đợt 4 giảm ở V0. Ở V1 thì Mới, Ẩu gần như còn nguyên.
  - Đỉnh đợt giữa ≤ 1,15 đạt ở V0; V1 vượt 0,01.
  - Đợt 10 vẫn là vực với b60: 10–11/120 lượt thua, so với 0 ở đợt 9.
- Cả ba việc đều làm ván dễ đi. Phần lớn đến từ trần 1,15 của bộ điều nhịp: riêng nó đưa Chuẩn lên 95 %. Muốn giữ đường cong này, ván cần thêm sức ép ở chỗ khác. Hướng (4) đã ghi một chỗ: "đợt 5–6 thêm sức ép từ (2)". Nhưng ở mốc G1 đã 86,7 %, mà riêng phần đợt 4 (dạng V1) và Héo lan cộng lại đã đưa G1 lên 90,8 %.
- Anh cần chọn một trong ba:
  - (a) Đo lại (4) cùng (2) và một nút sức ép chung (ví dụ mức Héo lan của đợt giữa), đo cả gói.
  - (b) Chỉ giữ phần Héo lan đợt 10 (`b-src`). Chỉ bot k > 1 đổi; G1 và B4 như mốc (300 seed: S 64,3 so với 61,4). Nhưng Nhanh lên 93,3 % ở cả 120 lẫn 300 seed (mốc 90,0 / 90,3 %), B1 thêm ô "Nhanh thắng cao", và vực đợt 10 chưa hết (b60 thua 14/114 ở đợt 10).
  - (c) Ghi ngoại lệ đỉnh của bộ điều nhịp vào 00 §4.4 thay cho trần 1,15. Đây là cách người test đợt 7–8 nêu thứ hai.
- Đợt 10: phần √k chỉ khoảng 9 % Héo. Muốn hết vực cần chạm cú dồn đầu đợt 10: hàng Sói 2,2 s, đỉnh 1 tải 1,40 (ngoại lệ M0). Việc này ngoài hướng anh chọn cho bước này.
- Phát hiện 40 (Đường Cầu 58,2 % ở đợt 7) chưa sửa, vì không đi kèm việc dời Heo.
