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

## 4. D33 (2): G01 đi giữa toán ở đợt 5 — đã đo, **không giữ** (mục tiêu chưa đạt; bản toán hộ tống đúng 02 §5.2 gãy G9)

Hướng (2) của D33: G01 đi giữa một toán ở đợt 5 (02, bảng trình bày G01 "Đi giữa toán"). Luật cắm cờ giữ như nay: G01 cắm khi có ≥ 2 quân trong 5 m, hoặc khi tới điểm dừng 8 m; sớm nhất 4 s sau khi sinh, hồi 16 s. Mục tiêu của bước: cờ được cắm và từ cờ được gõ ở đợt 5; đợt 5 bớt nhàn (P lên, I xuống); không gãy B4 (bản cắm cờ khi vào Vùng Chữ đã gãy B4: 59 < 60 ở 300 seed, `2026-10-27-test-pass.md` mục 2.2).

Nhánh `s4-g01-squad` (chưa gộp), hai commit trên `3733bd8`: `aaed85a` (V0) và `35ae539` (V1). V2 chỉ là cây tạm, không commit: bản này đọc 1,71 ở đỉnh ngắn của kế hoạch, vượt trần 1,15 của đợt giữa (00 §4.4) mà test kế hoạch giữ, và gãy G9. Bằng chứng: `tmp/mac-2026-10-27/owner/s4-g01-squad/`.

Lượt trước của bước này bị cắt vì hết hạn mức, để lại sửa chưa commit trên nhánh. Lượt này đọc lại từng file: giữ phần toán hộ tống (mã toán, chỗ đứng 2 m quanh tướng) và trường `gatherMs`; bỏ phần "đỉnh riêng của toán" trong `layOut` (phần này cho một toán 1 s quanh tướng, đọc 1,71, lọt qua trần `fit100`); phần đó chỉ còn ở cây V2.

### 4.1 Đã làm gì

- **Toán hộ tống trong sim** (`src/sim/spawn.ts`, `movement.ts`, `world.ts`, `waves.ts`; `rules.ts` `BATTLE.squadGapMm` = 2000). Các con của một toán hộ tống (02 §5.2) chung một mã toán. Khi tướng còn đi tự do trên đường, mỗi lính giữ chỗ của mình: con đi trước giữ 2 m trước tướng, con đi sau giữ 2 m sau, không vượt chỗ đó, nên chờ tướng rồi đi theo nhịp tướng. Khi tướng bị chặn, đang đánh, tới điểm dừng hay chết, lính đi tiếp một mình. Lính đi nhanh hơn tướng (2,0 m/s, thêm 15 % trong hào quang Xung Phong, so với 1,8 m/s), nên luôn bắt kịp chỗ của mình.
- **Toán gom** (`SpawnGroupDef.escort.gatherMs`; `src/content/data/waves.ts`, `src/sim/waves.ts` `groupMembers` và `scripts/balance/load.ts` xếp giống nhau): lính rời cổng trước, cách nhau `gatherMs`, rồi mới tới tướng; lính chờ tướng trên đường rồi vây quanh nó.
- **V0** (`aaed85a`): đợt 5, G01 giữa 2 Yêu Rêu Lính, gom cách nhau đúng một thời gian từ của người gõ tham chiếu (2643 ms). Đỉnh ngắn của kế hoạch giữ 1,00 (G01 một mình cũng 1,00). Con Lính cuối của đỉnh 3 chuyển sang Đường Cầu để đường chính giữ dải 02 §5.5 (Đường Suối 73,3 → 70,4 %). Đợt 5 dài 72 → 75 s, tải 0,90 → 0,93, W_gõ 24,4 → 26,4.
- **V1** (`35ae539`, biến thể 1 trên V0): 2 W của toán thành sức ép (D33 (4): "đợt 5–6 thêm sức ép từ (2)"). `rate` của đợt 5 100 → 104: đợt giữ 73 s, tải 0,90 → 0,96, đỉnh kế hoạch 1,00 → 1,06 (trần `fit100`), dưới trần 1,15.
- **V2** (cây tạm `v2-src`, biến thể 2): toán đúng chữ của 02 §5.2, "lính trước và sau 1 s" (lính trước, tướng sau 1 s, lính sau sau 2 s), `rate` 100. Đỉnh kế hoạch 1,71 / 1,54 / 1,43 ở cửa sổ 6 / 8 / 10 s.
- Test mới: toán đi và cắm cờ (`tests/sim/battle-auras.test.ts`: lính rời cổng trước, giữ 2 m trước và sau, G01 cắm cờ khi đủ 4 s, lính đi tiếp khi G01 chết); toán của đợt 5 (`battle-waves.test.ts`; V1 thêm: đợt 5 ≤ 73 s, tải ≥ 0,95); tải của toán gom (`bot-load.test.ts`). Golden cập nhật bằng `pnpm dh:golden:update` ở cả hai commit: `EnemyState` có thêm trường toán nên mã băm đổi từ con quái đầu; nhật ký `sloppy-hard-off-seed3` 623 → 610 lệnh (V0), giữ 610 (V1). `pnpm check` 407/407 ở cả hai.

### 4.2 Vì sao toán gom, không phải toán 1 s

Thước đỉnh ngắn của 00 §4.4 tính việc gõ từ lúc quái rời cổng. G01 có 6 W, người gõ tham chiếu cần 16 s, nên G01 một mình đã đọc 1,00 ở mọi cửa sổ. Một con Lính còn sống cạnh G01 là việc gõ chồng lên chuỗi của nó (`squadpeak.ts`):

| Cách xếp (giây so với lúc G01 rời cổng) | Đỉnh 6 / 8 / 10 s |
|---|---|
| G01 một mình | 1,00 / 1,00 / 1,00 |
| 02 §5.2: Lính −1 s và +1 s | **1,71** / 1,54 / 1,43 |
| Một Lính +1 s (đi sau) | 1,44 / 1,33 / 1,26 |
| Một Lính −1,5 s | 1,19 / 1,14 / 1,11 |
| Hai Lính −1,5 / −3 s | 1,38 / 1,29 / 1,23 |
| Hai Lính gom −2,64 / −5,29 s (V0, V1) | 1,01 / 1,00 / 1,00 |

Trong trận, bộ điều nhịp co khoảng sinh nên đỉnh đo được cao hơn kế hoạch khoảng 0,3: đợt 5 của mốc đọc 1,34, kế hoạch 1,00. Vậy chỉ toán gom giữ được trần 1,15 của kế hoạch và G9 (≤ 1,40) trong trận. Nhưng với toán gom, người gõ tham chiếu có đủ thời gian gõ từng con Lính trước khi con sau tới, nên hai Lính thường đã chết trước khi G01 được 4 s. Chữ của Lính hiện khi nó còn đứng chờ tướng trong vòng 26 m: ở trình duyệt, lúc G01 vừa rời cổng, con Lính cách cổng 9,0 m đã có chữ.

### 4.3 Cả ải, Cân bằng, 120 seed

Mỗi ô ghi Thắng / S / P / I / O / N / Q (%, N là số lần). `v0-all.json`, `v1-all.json` (cả ba chế độ, 2 × 60 seed), `v2-bal.json` (Cân bằng); `table-all.md`, `cmp-base-v0-all.txt`, `cmp-base-v1.txt`, `cmp-base-v2.txt`.

| Bot | Mốc `83da970` | V0 (`aaed85a`) | V1 (`35ae539`) | V2 (cây tạm) | Hạ quái (s) |
|---|---|---|---|---|---|
| b25 | 85,8 / 70,6 / 20,3 / 18,5 / 0 / 0,42 / 40,9 | 80,8 / 68,6 / 20,7 / 18,4 / 0 / 0,46 / 40,9 | 84,2 / 65,9 / 20,6 / 18,4 / 0 / 0,47 / 40,7 | 80,8 / 64,7 / 20,5 / 19,0 / 0 / 0,46 / 41,0 | 5,3 → 5,4 → 5,4 → 5,4 |
| Chuẩn (b35) | 86,7 / 60,1 / 21,3 / 20,8 / 0 / 0,48 / 38,4 | 85,8 / 63,1 / 21,1 / 20,8 / 0 / 0,42 / 38,4 | 85,0 / 62,6 / 20,9 / 20,8 / 0 / 0,41 / 38,4 | 85,8 / 60,5 / 21,0 / 20,9 / 0 / 0,44 / 38,6 | 4,2 ở cả bốn |
| b60 | 77,5 / 36,1 / 31,3 / 29,5 / 0 / 0,76 / 48,4 | 75,8 / 35,4 / 31,0 / 29,5 / 0 / 0,78 / 48,4 | 79,2 / 38,8 / 31,0 / 29,7 / 0 / 0,76 / 48,4 | 88,3 / 39,4 / 30,7 / 30,6 / 0 / 0,72 / 48,4 | 3,6 ở cả bốn |
| Mới | 72,5 / 61,2 / 23,9 / 16,4 / 0 / 0,85 / 42,7 | 74,2 / 56,4 / 23,9 / 16,7 / 0 / 0,85 / 42,2 | 75,0 / 61,4 / 23,9 / 16,4 / 0 / 0,75 / 42,6 | 74,2 / 61,1 / 23,7 / 16,9 / 0 / 0,88 / 42,7 | 6,1 → 6,0 → 6,1 → 6,1 |
| Chậm chắc | 94,2 / 63,5 / 19,9 / 18,8 / 0 / 0,29 / 40,0 | 88,3 / 66,2 / 20,0 / 18,7 / 0 / 0,37 / 40,2 | 89,2 / 62,4 / 20,2 / 18,6 / 0 / 0,38 / 40,2 | 90,0 / 61,7 / 20,2 / 18,9 / 0 / 0,42 / 40,0 | 4,9 → 5,0 → 5,0 → 5,0 |
| Khá | 75,8 / 47,5 / 23,7 / 26,6 / 0 / 0,78 / 37,6 | 75,8 / 43,4 / 23,9 / 26,5 / 0 / 0,78 / 37,8 | 71,7 / 49,8 / 23,8 / 26,5 / 0 / 0,62 / 37,6 | 74,2 / 50,2 / 23,6 / 27,4 / 0 / 0,73 / 37,5 | 3,9 → 3,9 → 4,0 → 3,9 |
| Ẩu | 73,3 / 61,2 / 23,8 / 16,2 / 0,2 / 0,65 / 37,7 | 74,2 / 60,8 / 24,2 / 16,2 / 0,2 / 0,61 / 37,4 | 72,5 / 61,5 / 24,2 / 16,3 / 0,2 / 0,79 / 37,6 | 69,2 / 61,0 / 24,1 / 16,4 / 0,2 / 0,68 / 37,8 | 5,3 ở cả bốn |
| Nhanh | 90,0 / 44,5 / 30,3 / 30,7 / 0 / 0,72 / 48,4 | 86,7 / 48,3 / 29,7 / 31,2 / 0 / 0,41 / 48,7 | 90,0 / 45,6 / 29,7 / 31,3 / 0 / 0,50 / 48,4 | 84,2 / 44,9 / 30,1 / 31,7 / 0 / 0,64 / 48,6 | 3,5 → 3,4 → 3,4 → 3,4 |
| Chuẩn tốt | 85,8 / 61,1 / 19,1 / 20,5 / 0 / 0,38 / 40,4 | 88,3 / 65,1 / 18,9 / 20,9 / 0 / 0,41 / 39,8 | 90,8 / 66,7 / 19,0 / 20,7 / 0 / 0,33 / 40,3 | 85,8 / 67,0 / 18,7 / 21,8 / 0 / 0,28 / 40,2 | 4,1 ở cả bốn |
| Chuẩn kém | 40,8 / 0 / 22,1 / 18,8 / 0 / 2,39 / 48,4 | 39,2 / 0 / 21,9 / 19,1 / 0 / 2,43 / 48,8 | 43,3 / 0 / 22,1 / 18,9 / 0 / 2,50 / 49,2 | 37,5 / 0 / 21,9 / 19,5 / 0 / 2,35 / 48,4 | 4,6 ở cả bốn |
| Chuẩn tắt nhịp (B7) | 84,2 / 67,4 / 20,5 / 22,2 / 0 / 0,26 / 38,1 | 76,7 / 64,0 / 20,8 / 22,1 / 0 / 0,28 / 38,5 | 82,5 / 65,9 / 20,7 / 22,2 / 0 / 0,28 / 38,2 | 80,8 / 64,0 / 20,8 / 22,4 / 0 / 0,24 / 38,3 | 4,2 → 4,3 → 4,2 → 4,3 |
| Chỉ gõ | 0 / 0 / 24,8 / 17,7 / 0 / 0,53 / 47,7 | 0 / 0 / 25,0 / 17,8 / 0 / 0,47 / 47,8 | 0 / 0 / 25,1 / 17,7 / 0 / 0,48 / 47,9 | 0 / 0 / 25,0 / 17,9 / 0 / 0,51 / 47,7 | 5,1 ở cả bốn |
| Không gõ | 0 / 0 / 70,2 / 4,5 / 0 / 0 / 76,2 | không đổi | không đổi | không đổi | 9,2 |
| Trẻ em | 9,2 / 0 / 38,8 / 7,8 / 0 / 1,62 / 88,1 | 3,3 / 0 / 38,6 / 7,8 / 0 / 1,42 / 88,1 | 2,5 / 0 / 38,7 / 7,7 / 0 / 1,46 / 88,1 | 2,5 / 0 / 38,6 / 7,8 / 0 / 1,40 / 88,1 | 9,5 → 9,6 → 9,6 → 9,6 |

- Thư giãn (V0, V1): mọi bot gõ vẫn thắng 100 %, Trẻ em 90,8 %.
- Thử thách, mốc → V0 → V1: Chuẩn 60,0 → 55,8 → 63,3 %; Chậm chắc 81,7 → 72,5 → 71,7 %; Ẩu 53,3 → 46,7 → 55,0 %; Khá 69,2 → 70,0 → 76,7 %; Chuẩn tốt / kém 78,3 / 25,0 → 76,7 / 21,7 → 76,7 / 25,8 %.
- 300 seed (2 × 150; Chậm chắc, Ẩu, Mới, Chuẩn; `b4-v1-300.json`, `b4-v2-300.json`), mốc → V1 → V2: S Chậm chắc so với Ẩu 64,3 / 61,1 → 63,8 / 60,9 → 61,7 / 59,4; hạ quái Chuẩn so với Ẩu 4,29 / 5,31 → 4,29 / 5,31 → 4,29 / 5,33 s; Chuẩn thắng 81,7 → 81,3 → 82,7 %; Mới thắng 80,0 → 76,3 → 74,0 %. Mốc 300 seed lấy từ `s2-d31/b4-v2-300.json`, nơi bốn bot này trùng mốc từng số.
- Số thua ở đợt 4 cũng đổi (ví dụ Mới 17 → 14) dù đợt 1–4 không đổi: vàng mỗi lần hạ quái chia theo tổng đe dọa của ải (`stageThreat10`), nay có thêm 2 Lính, nên mỗi lần hạ ở đợt 1–4 được ít vàng hơn một chút và bot mua khác từ đầu ải.

### 4.4 Cổng (mốc → V0 → V1 → V2)

| Cổng | Mốc | V0 | V1 | V2 | |
|---|---|---|---|---|---|
| G1 (b35 thắng 75–90 %) | 86,7 % | 85,8 % | 85,0 % | 85,8 % | đạt |
| G3 (b25 ≥ 70 %) | 85,8 % | 80,8 % | 84,2 % | 80,8 % | đạt |
| G5 (chỉ gõ ≤ 40 %) | 0 % | 0 % | 0 % | 0 % | đạt |
| G6 (không gõ thua trước đợt 3) | 120/120 ở đợt 1 | như cũ | như cũ | như cũ | đạt |
| G8 (phe ta 20–35 %) / G8b | 30,3 / 69,7 % | 30,2 / 69,8 % | 30,0 / 70,0 % | 30,1 / 69,9 % | đạt |
| **G9** (tải đỉnh ≤ 1,40) | 1,40 (đợt 10) | 1,40 | 1,40 | **1,73** (đợt 5) | **V2 gãy** |
| G9b, G10, G11, G13, G13b, G15 | đạt | đạt | đạt | đạt | G11 1,2 → 1,3 → 1,1 → 1,0 %; G13 1325 ± 15 %: 1328 / 1321 / 1319 vàng |
| G16 (cổng từ ải 15) | 171,5 s | 167,0 s | 168,7 s | 167,2 s | trượt như cũ |
| B2 | đạt | đạt | đạt | đạt | |
| B3 | Mới 73 %, Trẻ em Thư giãn 91 % | 74 % / 91 % | 75 % / 91 % | 74 % / (chưa chạy Thư giãn) | đạt |
| B4 | S 64 so với 61; hạ quái 4,21 so với 5,25 s | 66 so với 61; 4,23 so với 5,28 s | 120 seed: 62,4 so với 61,5; **300 seed: 63,8 so với 60,9** | 120 seed: 61,7 so với 61,0; 300 seed: 61,7 so với 59,4 | đạt (V1, V2 sát nên chạy 300 seed) |
| B5, B8 | đạt | đạt | đạt | B8 đạt; B5: Không gõ thua 100 % ở Cân bằng (chưa chạy hai chế độ kia) | |
| B6 | Tốt / Kém 86 / 41 % (Cân bằng), 78 / 25 % (Thử thách) | 88 / 39 %, 77 / 22 % | 91 / 43 %, 77 / 26 % | 86 / 38 % (Cân bằng) | đạt |
| B7, phần bộ điều nhịp | đạt | đạt | đạt | đạt | |
| B1 theo dải D27 | 6 ô lệch | 6 ô | 5 ô | 6 ô | không xấu thêm |
| B7 theo dải D27 (bot tắt nhịp) | 2 ô (S cao, I cao) | 1 ô (I cao) | 2 ô | 1 ô | không xấu thêm |

B1 theo dải D27, bot lệch: mốc như các bước trước (Mới thắng thấp, Chậm chắc thắng cao, Chuẩn I cao, Khá I cao, Ẩu thắng thấp, Nhanh I cao). V0: Chậm chắc đổi từ thắng cao sang S cao (66,2 %), còn lại như mốc. V1: Mới và Chậm chắc vào dải; Khá thêm thắng thấp (71,7 %). V2: như mốc, trừ Chậm chắc vào dải và Khá thêm thắng thấp. Hai bộ seed cho cùng kết quả từng cổng. Đỉnh ngắn đo được ở đợt 5 (lớn nhất qua mọi lượt; bot Chuẩn; Chuẩn tắt nhịp): mốc 1,34; 1,33; 1,00 → V0 1,32; 1,27; 1,01 → V1 1,32; 1,28; 1,06 → V2 **1,72**; 1,71; 1,71.

### 4.5 Đợt 5 (mục tiêu của bước)

Cân bằng, 2 × 60 seed (`perwave.ts`, nay đếm thêm sự kiện cờ theo đợt; `w5-all.md`). Thua: số lượt thua ở đợt 5 trên số lượt vào đợt. Héo: máu mất do Héo lan mỗi lượt. Cắm: số lần cắm mỗi lượt và phần lượt có ít nhất một lần cắm. Cờ gõ: từ cờ gõ được mỗi lượt. Mốc → V0 → V1 → V2:

| Bot | Thua | S | P | I | Héo | Cắm / lượt (lượt có cắm) | Cờ gõ / lượt |
|---|---|---|---|---|---|---|---|
| Mới | 1 → 8 → 8 → 7 /105 | 49,3 → 48,8 → 48,0 → 46,9 | 14,6 → 17,0 → 17,4 → 16,8 | 17,1 → 15,5 → 14,6 → 18,6 | 153 → 184 → 185 → 203 | 0,02 → 0,22 → 0,23 → 0,89 (2 → 21 → 23 → 81 %) | 0,01 → 0,15 → 0,15 → 0,71 |
| Chậm chắc | 1 → 3 → 4 → 1 /117 | 55,7 → 54,3 → 53,5 → 53,6 | 11,0 → 11,9 → 12,1 → 12,3 | 19,9 → 18,9 → 18,3 → 21,9 | 117 → 139 → 137 → 156 | 0,01 → 0,07 → 0,08 → 0,66 (1 → 7 → 7 → 63 %) | 0,00 → 0,05 → 0,06 → 0,62 |
| Chuẩn | 1 → 1 → 1 → 1 /115 | 54,1 → 53,6 → 51,6 → 52,1 | 10,5 → 11,1 → 11,7 → 11,5 | 23,6 → 24,7 → 23,9 → 26,2 | 104 → 124 → 133 → 149 | 0,00 → 0,03 → 0,04 → 0,74 (0 → 3 → 4 → 74 %) | 0,00 → 0,03 → 0,04 → 0,71 |
| Khá | 0 /117 ở cả bốn | 58,8 → 57,7 → 57,9 → 60,1 | 18,5 → 17,8 → 18,5 → 15,2 | 29,6 → 30,0 → 29,0 → 37,0 | 175 → 181 → 191 → 151 | 0,00 → 0,50 → 0,47 → 0,25 (0 → 50 → 47 → 25 %) | 0,00 → 0,50 → 0,47 → 0,25 |
| Ẩu | 1 → 2 → 3 → 5 /104 | 54,8 → 51,1 → 50,0 → 48,7 | 13,0 → 15,4 → 17,0 → 16,8 | 15,7 → 16,5 → 15,4 → 16,1 | 118 → 166 → 183 → 200 | 0,00 → 0,16 → 0,19 → 0,85 (0 → 16 → 19 → 82 %) | 0,00 → 0,15 → 0,18 → 0,80 |
| Nhanh | 1 → 5 → 4 → 3 /120 | 56,6 → 59,8 → 58,5 → 58,6 | 23,1 → 21,3 → 21,5 → 21,0 | 32,6 → 35,8 → 35,5 → 40,1 | 172 → 146 → 144 → 164 | 0,22 → 0,15 → 0,12 → 0,33 (22 → 15 → 12 → 32 %) | 0,22 → 0,15 → 0,12 → 0,33 |
| b25 | 0 → 5 → 3 → 6 /107 | 55,8 → 55,3 → 53,6 → 52,7 | 10,7 → 12,2 → 12,4 → 12,8 | 19,3 → 18,3 → 17,5 → 22,5 | 111 → 139 → 141 → 160 | 0,01 → 0,11 → 0,08 → 0,80 (1 → 9 → 7 → 76 %) | 0,01 → 0,08 → 0,07 → 0,71 |
| b60 | 0 → 7 → 5 → 4 /119 | 56,2 → 59,8 → 57,4 → 58,9 | 23,3 → 22,3 → 22,6 → 20,8 | 32,6 → 33,5 → 33,1 → 40,2 | 171 → 166 → 171 → 156 | 0,07 → 0,32 → 0,33 → 0,11 (7 → 32 → 33 → 10 %) | 0,07 → 0,32 → 0,33 → 0,10 |
| Chuẩn tắt nhịp | 0 → 5 → 2 → 5 /104 | 56,4 → 50,8 → 51,6 → 50,3 | 10,0 → 11,8 → 11,5 → 12,3 | 24,0 → 25,0 → 24,1 → 25,7 | 95 → 137 → 129 → 156 | 0,00 → 0,01 → 0,02 → 0,73 (0 → 1 → 2 → 73 %) | 0,00 → 0,01 → 0,02 → 0,71 |

O vẫn 0 ở mọi bot; N 0,01–0,27 như mốc; Q giảm 0–6 điểm. Cờ bị ngắt khi đang cắm 0–0,02 lần mỗi lượt.

- **Cờ được cắm và gõ**: V0, V1 chỉ đạt với người tụt sau nhịp tham chiếu hoặc người nhắm tướng trước (Khá 47–50 % lượt, b60 32–33 %, Mới 21–23 %). Với Chuẩn chỉ 3–4 % lượt, Chậm chắc 7 %. V2 đạt ở mọi bot gõ chậm và vừa (63–82 % lượt), mỗi lần cắm gần như đều có từ cờ được gõ.
- **Đợt 5 bớt nhàn**: không đạt ở bản nào. V1 là bản tốt nhất: P lên 1–4 điểm ở 6 bot, I xuống 1,6–2,5 điểm ở Mới, Chậm chắc, b25. Nhưng I của Chuẩn 23,6 → 23,9, của Nhanh 32,6 → 35,5. V2 làm I lên ở 8/9 bot (Chuẩn +2,6, Khá +7,4, Nhanh +7,5, b60 +7,6): toán tới cùng lúc rồi để lại quãng lặng dài hơn, vì các đỉnh sau dời muộn thêm 5,3 s.
- Nhàn của Chuẩn ở đợt 5 không nằm ở chỗ toán đi (`idle5-all.md`, phần trăm thời gian đợt, mốc → V1): chờ vòng 26 m sau chữ đầu 3,8 → 4,9; mọi quái ngoài cả vòng lẫn T_a 6,6 → 6,8; trong vùng nhưng chưa có chữ 4,6 → 4,3; sân trống 3,4 → 2,5.
- **Bậc khó mới ở đợt 5**: thua ở đợt 5 tăng ở mọi bản (Mới 1 → 7–8, b60 0 → 4–7, Chuẩn tắt nhịp 0 → 2–5), Héo của người gõ chậm tăng 20–50 máu mỗi lượt (Ẩu 118 → 166–200). Cả ải thì không lệch ngoài độ nhiễu, vì một phần lượt thua dời từ đợt sau lên đợt 5.

### 4.6 Biến thể đã thử

| Bản | Khác gì | Kết quả (Cân bằng, 120 seed) |
|---|---|---|
| V0 (`aaed85a`) | Toán gom 2 Lính, một thời gian từ; `rate` 100; đợt 75 s | Mọi cổng đạt, B1 6 ô, B4 66 so với 61. Cắm cờ ở Chuẩn 3 % lượt; đợt 5 I của Chuẩn 23,6 → 24,7 |
| V1 (`35ae539`) | Như V0, `rate` 104: đợt 73 s, tải 0,96 | Mọi cổng đạt, B1 5 ô, B4 300 seed 63,8 so với 60,9. Cắm cờ ở Chuẩn 4 % lượt; đợt 5 I của Chuẩn 23,9 |
| V2 (cây tạm) | Toán 02 §5.2: Lính trước và sau 1 s | **G9 1,73**, đỉnh kế hoạch 1,71 vượt trần 1,15. Cắm cờ ở Chuẩn 74 % lượt; đợt 5 I của Chuẩn 26,2 |

Không thử thêm. Với luật cắm cờ như nay, cắm được cần ≥ 2 quân còn sống trong 5 m khi G01 đã được 4 s. Với người gõ tham chiếu, đó là việc gõ chưa xong chồng lên chuỗi 6 W của G01: đỉnh kế hoạch ≥ 1,44 nếu có một con đi sau, 1,71 nếu theo đúng 02 §5.2, cộng thêm khoảng 0,3 do bộ điều nhịp co trong trận. Vậy mọi toán cắm được cờ trước mặt bot Chuẩn đều vượt trần 1,15 của đợt giữa và gãy G9. Toán nào giữ được hai trần đó thì người gõ tham chiếu đã gõ hết lính trước khi G01 cắm. Có một cách làm đỉnh đọc thấp: cho lính rời cổng sớm nhưng đứng chờ ở cổng, ngoài Vùng Chữ. Tôi không dùng, vì như vậy chỉ đánh lừa thước đo: chữ của cả toán vẫn hiện gần như cùng lúc như toán 1 s.

### 4.7 Trình duyệt

Vite riêng ở 127.0.0.1:4151 `--strictPort`, mã của V1 (cây làm việc, đúng mã của `35ae539`), đã tắt sau khi chạy. Kịch bản tạm `wave5.mjs` (thư mục bằng chứng) chạy qua `heavy.sh --gpu node scripts/visual/cdp-run.mjs`, 1280×720 rồi 1920×1080 trong cùng một lượt, 35 WPM. Đợt 1–4 chạy nhanh trong trang. Ở đợt 5, kịch bản gõ mọi chữ trừ chữ của toán và từ cờ, để toán còn nguyên quanh G01. Chuỗi của G01 gõ bằng phím thật; lúc gõ phím cuối, kịch bản chụp 16 khung liền nhau. Kết quả (`browser-run.json`): `ok`, 0 exception, 0 tài nguyên lỗi, mã băm phát lại khớp ở cả hai cỡ.

- Lúc G01 rời cổng (22,6 s sau khi đợt 5 bắt đầu), hai Lính đứng chờ trên đường, cách cổng 5,0 m và 9,0 m. Khi G01 được 5,8 s, cờ đã cắm cách bệ 23,7 m. Lúc gõ phím cuối của G01, một Lính cách nó 2,0 m phía trước và một Lính 2,0 m phía sau; khi G01 chết, cả hai đi tiếp.
- `w5-squad-walk-1920x1080.png`: thẻ ra mắt "TƯỚNG ĐỊCH MỚI · Yêu Rêu Cầm Cờ" có vương miện, ở góc phải trên, đọc rõ. Trên sân, nhãn "Cắm Cờ", từ cờ "team" có biểu tượng cờ, chữ "write" trong chuỗi của G01, chữ của hai Lính "city" và "home"; bốn thẻ không che nhau, không che HUD.
- `death-frames-1280x720/f-00.jpg`: thẻ ra mắt của G01 đọc rõ, toán ở giữa đường phía tây, không bị thẻ che.
- `death-frames-*/crops.jpg` (cắt và phóng quanh toán): ở f00, G01 sáng cam (đang khóa) giữa hai Lính; f01 chớp trúng đòn (số 60); f02–f05 thân đổi màu rêu và chìm; f06–f07 tan thành rêu; từ f08 thân hết. Hai Lính đứng hai bên, không che thân đang chết. Thẻ "need", "listen" ("city", "home" ở 1920) của Lính và từ cờ "play" ("team") nằm trên, không đè chỗ G01 chết. Cái chết 1,5 s đọc được khi có toán quanh nó, ở cả hai cỡ.
- Thẻ ra mắt hiện muộn trong kịch bản: lúc G01 rời cổng, góc phải còn thẻ "QUÁI MỚI · Ong Gai" (1280) hay "Kiến Gai" (1920), dồn lại từ lúc chạy nhanh đợt 1–4. Thẻ G01 lên sau đó: ở 1920 đã lên khi G01 được 5,8 s; ở 1280 chưa lên lúc 5,8 s, đã lên lúc 8,6 s. Mã thẻ ra mắt không đổi trong bước này, và thẻ của Lính đã ra ở đợt 1. Đây là chỗ hở của kịch bản, không phải của toán.

### 4.8 Kết luận, chờ anh

- **Không giữ.** Hai bản giữ cổng (V0, V1) không đạt mục tiêu của bước. Cờ chỉ được cắm khi người chơi tụt sau nhịp tham chiếu hay nhắm tướng trước (Chuẩn 3–4 % lượt), và đợt 5 không bớt nhàn với Chuẩn và người gõ nhanh. Bản đạt phần cắm cờ (V2, toán đúng 02 §5.2, Chuẩn 74 % lượt) gãy G9 (1,40 → 1,73) và vượt trần đỉnh 1,15 của đợt giữa (kế hoạch 1,71). Nó cũng làm đợt 5 nhàn hơn. B4 đạt ở cả ba bản (300 seed: 63,8 so với 60,9 ở V1; 61,7 so với 59,4 ở V2).
- Gốc của việc này: thước đỉnh ngắn của 00 §4.4 đã coi G01 một mình là 1,00 trong 16 s. Luật cắm cờ cần quân sống cạnh nó sau 4 s. Hai điều đó chỉ gặp nhau khi người chơi gõ chậm hơn nhịp tham chiếu.
- Anh cần chọn một trong ba:
  - (a) Giữ V1 như một bước nhỏ: toán có mặt và cắm cờ khi người chơi tụt nhịp. Mọi cổng như mốc hay tốt hơn (B1 6 → 5 ô), nhưng mục tiêu "cờ hiện, đợt 5 bớt nhàn" chưa đạt với Chuẩn.
  - (b) Ghi ngoại lệ cho toán của tướng vào 00 §4.4 và G9 (ví dụ "toán hộ tống tướng tính đỉnh riêng"), rồi giữ V2. Khi đó cờ hiện ở 63–82 % lượt; đổi lại đỉnh đợt 5 là 1,72 trong trận, và đợt 5 cần được kéo ngắn lại để không nhàn hơn.
  - (c) Đổi luật cắm cờ (ví dụ cắm cả khi chỉ có 1 quân trong 5 m, hoặc sớm nhất 2 s thay cho 4 s), rồi đo lại cùng V1. Hướng này ngoài chữ "luật cờ giữ như nay" của bước này.
- Bậc khó mới ở đợt 5 (thua ở đợt 5: Mới 1 → 8, b60 0 → 5–7) đi kèm mọi bản có toán. Nếu giữ bản nào thì cần xem lại cùng hướng (4).

## 5. D33 (3): bầy Sói Mục đi sát dưới một chữ chung — đã đo, **không giữ** (B1 xấu thêm ở Khá ở cả ba bản; V1 gãy thêm D23a)

Hướng (3) của D33 là phát hiện 17 của `2026-10-27-test-pass.md`: bầy Sói Mục đi sát nhau trong 6 m của tiếng tru, mang **một chữ chung** dài hơn chữ thường, và tru bầy kích được (≥ 3 sói trong 6 m thì +15 % tốc, 02 §2.2 E18). Chữ chung tính **một lần** trong tải gõ, để trần đỉnh ngắn vẫn giữ (đợt giữa 1,15, đợt cuối 1,40; 00 §4.4). Bước này còn phải chọn chữ chung làm gì khi gõ xong (theo 02 §2.2), và làm thẻ chữ đọc thành một chữ cho cả bầy.

Nhánh `s5-wolf-pack` chưa gộp, có ba commit trên `bf11ee6`: `c586d5e` (V0), `54d92c5` (V1), `8348655` (V2). Bằng chứng ở `tmp/mac-2026-10-27/owner/s5-wolf-pack/`.

Lượt trước của bước này bị cắt vì hết hạn mức. Lúc đó nó đã commit V0, đã đo V0 và V1, đã chạy trình duyệt với mã V1. Nó để lại phần V1 trong `src/content/data/waves.ts` (đã `git add`, chưa commit) và cây tạm V2. Lượt này rà lại:

- Phần đã `add` đúng là V1: cây `v1-src` trùng cây làm việc từng file. Tôi giữ nguyên và commit.
- Cây `v2-src` chỉ khác V1 ở `src/sim/combat.ts`. Tôi chép sang và thêm test.
- V2 chưa được đo, nên lượt này đo đủ.
- Lượt `pnpm dh:balance` chính thức trên đầu nhánh khớp 15/15 bot với lượt đo của cây V2.

### 5.1 Đã làm gì

- **Bầy trong sim** (`src/sim/spawn.ts`, `movement.ts`, `waves.ts`; `rules.ts` `PACK`):
  - Một nhóm sói `shape: "cluster"` rời cổng cùng lúc, xếp hình vòng cung (02 §2.2 "chạy vòng cung"): con đầu đi trước 1,5 m, hai con kia lệch 0,9 m mỗi bên.
  - Cả bầy chung một mã nhóm (dùng lại mã cụm của bầy Kiến).
  - Con nào vượt tâm bầy quá 2 m thì chậm lại, con nào tụt sau quá 2 m thì nhanh lên. Giống cụm Kiến, nhưng không đi zíc zắc.
  - Đo trong lượt bot, bầy giãn trung bình 1,5–1,8 m, lớn nhất 3,5–4,0 m: luôn trong 6 m của tiếng tru.
- **Một chữ chung** (loại chữ mới `"pack"`; `src/sim/words.ts`, `src/typing/lengths.ts`):
  - Con đầu còn sống của bầy mang chữ. Con đó chết thì chữ chuyển sang con khác.
  - Chữ lấy ô độ dài `medium` (D3, ô của quái Vừa), dài hơn ô `fast` của một con sói.
  - Đo trong lượt bot (đợt 7, 9, 10; 20 seed; `wordlen-*.txt`): ở 35 WPM, chữ bầy dài trung bình 5,64 chữ cái (4–7; 20 % là 4 chữ cái). Ở mốc, chữ riêng của một con sói dài 4,19 (3–5), chữ của Lính và Ong 4,57. Ở bot Nhanh: 7,39, so với 4,85 và 5,51.
- **Chữ chung làm gì** (`src/sim/combat.ts` `packHit`): xem 5.2.
- **Tải gõ** (00 §4.4; `waves.ts` `groupW100`, `src/sim/waves.ts` `memberW100`, `scripts/balance/load.ts`): bầy tính như **một con sói** (1,2 W), một lần, ở cả kế hoạch, bộ sinh và thước của bot. Ba chữ sói tới cùng lúc đọc 1,59 trong cửa sổ 6 s; một chữ chung đọc 1,00 (test).
- **Thẻ chữ** (`src/ui/tags.ts`): một thẻ cho cả bầy, đứng trên hộp bao mọi con của bầy, có biểu tượng móng chân và số con (×3, ×2…). Các con đứng dưới chữ đó không có chấm "chưa có chữ".
- Luật riêng của bầy Kiến vẫn chỉ áp cho bầy Kiến: kinh nghiệm cụm (trả một lần khi con cuối chết) không áp cho sói; mỗi con sói trả vàng và kinh nghiệm như một con sói.
- Đợt 7, 9, 10 mở bằng một bầy 3 con. Trước đây là một hàng 3 con cách nhau 3 s (đợt 10: 2,2 s).
- **V0** (`c586d5e`): kế hoạch xếp đợt theo tải, nên quãng lặng của bầy ngắn lại theo 1,2 W thay cho 3,6 W. Thời lượng: đợt 7 58 → 52 s, đợt 9 60 → 54 s, đợt 10 67 → 62 s. Tải trung bình: 0,91 → 0,89; 0,88 → 0,86; 1,15 → 1,14.
- **V1** (`54d92c5`, biến thể 1): hướng (3) chỉ đổi bầy sói, còn đường cong đợt là việc của (4). Vì vậy quãng lặng của bầy giữ đúng độ dài cũ (`holdW100`: bầy giữ người gõ lâu như ba con sói trước đây). Thời lượng các đợt như mốc (đợt 10: 67 → 66 s). Tải trung bình đợt 7 0,91 → 0,80, đợt 9 0,88 → 0,78, đợt 10 1,15 → 1,07, vẫn trong dải của 00 §4.4.
- **V2** (`8348655`, biến thể 2, trên V1):
  - Một đòn vùng (Thiên Hỏa, Phun Lửa, đòn kết của Viêm Đế) lấy tối đa 60 % máu hiện có của một bầy sói, như với cụm Kiến (BALANCE.md §9.1: "kỹ năng vùng không quét sạch"; `AREA.clusterCapPct`).
  - Thẻ ra mắt Sói Mục bỏ câu "gõ từng con sớm" (sai khi cả bầy chung một chữ). Câu mới: "Chạy sát nhau theo bầy, cả bầy mang một chữ; vồ qua lính chặn. — Gõ chữ của bầy sớm: trúng mọi con trong bầy. Spikes làm chậm." Câu viết lại nên dùng tên tiếng Anh của bẫy, theo luật tên 27/10.
- **Test**:
  - `tests/sim/battle-pack.test.ts`:
    - bầy rời cổng cùng lúc theo hình vòng cung, giữ trong 6 m và tru (+15 %);
    - một chữ D3 trên một con, chuyển sang con khác khi con mang chữ chết;
    - chữ trúng mọi con trong 6 m: mỗi con chết với chữ không Ẩu, chữ Ẩu chỉ gây sát thương chữ; con ở ngoài 6 m không bị trúng;
    - tải tính một lần ở cả kế hoạch, bộ sinh và thước bot;
    - V2 thêm: Thiên Hỏa lấy ≤ 60 % máu bầy và chữ bầy còn. Test này trượt với mã V1.
  - `tests/ui/tags-pack.test.ts`: một thẻ, có biểu tượng, ×3 rồi ×2, không chấm.
  - `tests/sim/battle-waves.test.ts`: mọi nhóm sói của M0 là bầy 3–5 con.
- Golden không đổi: không lượt golden nào tới đợt 7. `pnpm check`: 411/411 ở V0 và V1, 412/412 ở V2. Lượt đầu ở V1 có một test đo thời gian trượt (`tags-bodies`, 1,06 ms so với trần 1 ms) khi load máy khoảng 20; chạy lại qua `heavy.sh --cores=10` thì đạt.

### 5.2 Chữ chung làm gì, và vì sao

Gõ xong chữ của bầy thì chữ đó **trúng như một chữ trên mỗi con sói còn trong 6 m quanh con mang chữ**, kể cả con mang chữ. Mỗi con chết nếu chữ không Ẩu. Chữ Ẩu chỉ gây sát thương chữ của nó cho từng con, nên bầy còn sống và nhận chữ mới. Lý do:

- Sói Mục là quái **Nhỏ** 1,2 W (02 §2.2 E18), không phải Bầy 0,3–0,5 W. Quái Nhỏ luôn chết sau một chữ không Ẩu (00 §4.6). Nếu dùng luật cụm Kiến (1 W sát thương chữ cho mỗi con trong 3 m, 02 §1.4), sói 1,2 W sống sót sau chữ chung, và cả bầy lại cần thêm chữ: không còn là "một chữ cho cả bầy".
- 02 §2.2 định nghĩa bầy bằng tiếng tru: ≥ 3 sói trong 6 m. Vậy "cả bầy" là những con trong 6 m quanh con mang chữ. Con đã vồ qua lính chặn và ra xa hơn 6 m thì không còn trong bầy, và nhận chữ riêng.
- Chữ Ẩu không hạ được cả bầy, nên lợi thế của gõ chính xác giữ nguyên (B4).
- Một chữ dài hơn hạ ba con, nên bầy tính một lần trong tải gõ, ở mức một con sói (1,2 W).

### 5.3 Cả ải, Cân bằng, 120 seed

Mỗi ô ghi Thắng / S / P / I / O / N / Q (%, N là số lần). Nguồn: `v0-all.json`, `v1-all.json`, `v2-all.json` (cả ba chế độ, 2 × 60 seed); `table-all.md`, `cmp-base-v0.txt`, `cmp-base-v1.txt`, `cmp-base-v2.txt`.

| Bot | Mốc `83da970` | V0 (`c586d5e`) | V1 (`54d92c5`) | V2 (`8348655`) | Hạ quái (s) |
|---|---|---|---|---|---|
| b25 | 85,8 / 70,6 / 20,3 / 18,5 / 0 / 0,42 / 40,9 | 87,5 / 59,8 / 20,8 / 19,0 / 0 / 0,44 / 40,6 | 89,2 / 66,8 / 20,2 / 20,9 / 0 / 0,45 / 40,4 | 90,0 / 64,0 / 20,3 / 20,2 / 0 / 0,45 / 41,1 | 5,3 → 5,4 → 5,4 → 5,4 |
| Chuẩn (b35) | 86,7 / 60,1 / 21,3 / 20,8 / 0 / 0,48 / 38,4 | 82,5 / 49,3 / 22,2 / 20,9 / 0 / 0,65 / 38,6 | 83,3 / 51,2 / 21,8 / 22,8 / 0 / 0,52 / 38,5 | 85,8 / 50,7 / 21,7 / 21,9 / 0 / 0,62 / 39,0 | 4,2 → 4,3 → 4,3 → 4,3 |
| b60 | 77,5 / 36,1 / 31,3 / 29,5 / 0 / 0,76 / 48,4 | 75,0 / 35,1 / 31,6 / 29,7 / 0 / 0,72 / 48,4 | 76,7 / 34,7 / 30,9 / 31,2 / 0 / 0,78 / 48,4 | 75,0 / 34,0 / 30,8 / 30,5 / 0 / 0,74 / 48,4 | 3,6 → 3,7 → 3,7 → 3,7 |
| Mới | 72,5 / 61,2 / 23,9 / 16,4 / 0 / 0,85 / 42,7 | 70,8 / 49,3 / 24,5 / 17,0 / 0 / 0,86 / 42,5 | 70,0 / 51,1 / 23,9 / 18,7 / 0 / 0,70 / 42,3 | 73,3 / 55,1 / 24,0 / 17,9 / 0 / 0,82 / 43,3 | 6,1 → 6,2 → 6,2 → 6,2 |
| Chậm chắc | 94,2 / 63,5 / 19,9 / 18,8 / 0 / 0,29 / 40,0 | 95,0 / 57,5 / 20,8 / 19,0 / 0 / 0,44 / 39,9 | 93,3 / 60,1 / 20,0 / 21,4 / 0 / 0,28 / 40,0 | 90,8 / 59,4 / 20,2 / 20,5 / 0 / 0,30 / 40,0 | 4,9 → 5,0 → 5,0 → 5,0 |
| **Khá** | 75,8 / 47,5 / 23,7 / 26,6 / 0 / 0,78 / 37,6 | **64,2 / 25,4** / 25,8 / 25,7 / 0 / 1,12 / 40,1 | **66,7 / 25,9** / 24,8 / 27,5 / 0 / 1,03 / 39,8 | **63,3 / 25,2** / 24,7 / 26,8 / 0 / 1,00 / 40,9 | 3,9 → 4,1 → 4,1 → 4,1 |
| Ẩu | 73,3 / 61,2 / 23,8 / 16,2 / 0,2 / 0,65 / 37,7 | 75,0 / 58,2 / 24,1 / 16,4 / 0,2 / 0,72 / 38,0 | 71,7 / 55,2 / 23,8 / 18,0 / 0,2 / 0,67 / 38,0 | 77,5 / 59,4 / 23,8 / 17,4 / 0,2 / 0,64 / 38,4 | 5,3 ở cả bốn |
| Nhanh | 90,0 / 44,5 / 30,3 / 30,7 / 0 / 0,72 / 48,4 | 82,5 / 41,8 / 30,9 / 31,2 / 0 / 0,65 / 48,4 | 88,3 / 42,6 / 30,1 / 32,2 / 0 / 0,78 / 48,8 | 89,2 / 40,9 / 30,1 / 31,8 / 0 / 0,63 / 48,7 | 3,5 ở cả bốn |
| Chuẩn tốt | 85,8 / 61,1 / 19,1 / 20,5 / 0 / 0,38 / 40,4 | 75,8 / 44,2 / 20,7 / 20,0 / 0 / 0,54 / 41,6 | 86,7 / 50,0 / 20,2 / 22,3 / 0 / 0,45 / 41,7 | 86,7 / 50,4 / 19,8 / 21,5 / 0 / 0,39 / 42,1 | 4,1 → 4,3 → 4,2 → 4,2 |
| Chuẩn kém | 40,8 / 0 / 22,1 / 18,8 / 0 / 2,39 / 48,4 | 42,5 / 0 / 22,6 / 18,8 / 0 / 2,48 / 48,7 | 41,7 / 0 / 21,8 / 20,3 / 0 / 2,23 / 48,6 | 39,2 / 0 / 21,8 / 20,1 / 0 / 2,19 / 48,8 | 4,6 → 4,7 → 4,7 → 4,7 |
| Chuẩn tắt nhịp (B7) | 84,2 / 67,4 / 20,5 / 22,2 / 0 / 0,26 / 38,1 | 80,8 / 54,3 / 21,1 / 22,5 / 0 / 0,27 / 37,9 | 80,0 / 54,2 / 20,6 / 24,4 / 0 / 0,30 / 37,9 | 81,7 / 54,1 / 20,8 / 23,7 / 0 / 0,33 / 38,6 | 4,2 → 4,3 → 4,3 → 4,3 |
| Chỉ gõ | 0 / 0 / 24,8 / 17,7 / 0 / 0,53 / 47,7 | 0 / 0 / 24,8 / 17,7 / 0 / 0,51 / 47,7 | 0 / 0 / 24,8 / 17,9 / 0 / 0,51 / 47,7 | 0 / 0 / 24,9 / 17,8 / 0 / 0,52 / 47,7 | 5,1 ở cả bốn |
| Không gõ | 0 / 0 / 70,2 / 4,5 / 0 / 0 / 76,2 | không đổi | không đổi | không đổi | 9,2 |
| Trẻ em | 9,2 / 0 / 38,8 / 7,8 / 0 / 1,62 / 88,1 | 8,3 / 0 / 38,9 / 7,8 / 0 / 1,66 / 88,1 | 9,2 / 0 / 38,8 / 8,0 / 0 / 1,62 / 88,1 | 8,3 / 0 / 38,8 / 8,0 / 0 / 1,59 / 88,1 | 9,5 → 9,6 → 9,6 → 9,6 |

- Thư giãn: mọi bot gõ vẫn thắng 100 % ở cả ba bản; Trẻ em 90,8 %.
- Thử thách, mốc → V0 → V1 → V2:
  - Khá 69,2 → 51,7 → 53,3 → 49,2 %.
  - Nhanh 94,2 → 82,5 → 90,0 → 91,7 %; b60 85,0 → 72,5 → 75,8 → 79,2 %.
  - Chuẩn 60,0 → 60,0 → 61,7 → 60,0 %; Chậm chắc 81,7 → 81,7 → 81,7 → 83,3 %; Ẩu 53,3 → 51,7 → 52,5 → 52,5 %.
  - Chuẩn tốt / kém 78,3 / 25,0 → 70,8 / 18,3 → 75,0 / 17,5 → 81,7 / 20,8 %.
- Khá theo bộ seed (thắng ở 20261023 / 21261026): mốc 68 / 83 %, V0 58 / 70 %, V1 65 / 68 %, V2 57 / 70 %. Hai bộ cùng chiều.
- 300 seed (2 × 150; mốc lấy từ `s2-d31/b4-v2-300.json` và `s2-d31/fast300-base.json`, nơi các bot này trùng mốc từng số):
  - Chậm chắc / Ẩu: mốc 93,3 / 64,3 / 20,0 / 18,8 / 0 / 0,39 / 40,3 và 73,0 / 61,1 / 24,3 / 16,2 / 0,2 / 0,67 / 37,7; V0 93,0 / 57,2 / 20,9 / 19,0 / 0 / 0,47 / 40,3 và 72,3 / 56,1 / 24,7 / 16,4 / 0,2 / 0,65 / 38,2; V2 90,7 / 58,4 / 20,3 / 20,5 / 0 / 0,41 / 40,6 và 73,7 / 57,0 / 24,5 / 17,2 / 0,2 / 0,72 / 38,7.
  - Chuẩn thắng 81,7 → 80,7 (V0) → 80,7 % (V2); Mới 80,0 → 78,7 → 78,0 %.
  - **Khá** (V2): 75,7 / 50,4 / 23,7 / 26,7 / 0 / 0,74 / 38,2 → **66,3 / 28,9** / 24,7 / 26,9 / 0 / 0,88 / 40,2. Ở 300 seed, độ nhiễu khoảng ±2,5 điểm.

### 5.4 Cổng (mốc → V0 → V1 → V2)

| Cổng | Mốc | V0 | V1 | V2 | |
|---|---|---|---|---|---|
| G1 (b35 thắng 75–90 %) | 86,7 % | 82,5 % | 83,3 % | 85,8 % | đạt |
| G3 (b25 ≥ 70 %) | 85,8 % | 87,5 % | 89,2 % | 90,0 % | đạt |
| G5 (chỉ gõ ≤ 40 %) | 0 % | 0 % | 0 % | 0 % | đạt |
| G6 (không gõ thua trước đợt 3) | 120/120 ở đợt 1 | như cũ | như cũ | như cũ | đạt |
| G8 (phe ta 20–35 %) / G8b | 30,3 / 69,7 % | 30,3 / 69,7 % | 30,4 / 69,6 % | 30,8 / 69,2 % | đạt |
| G9 (tải đỉnh ≤ 1,40) | 1,40 | 1,40 | 1,40 | 1,40 | đạt |
| **D23a** (Thiên Hỏa ≤ 15 % sát thương, b35; BALANCE §9.1) | 12,8 % | 14,9 % | **15,0 %** | 13,4 % | **V1 gãy** |
| D23b, G9b, G10, G11, G13, G13b, G15 | đạt | đạt | đạt | đạt | G9b 7 → 8 → 7 → 7 chữ sống; G11 1,2 → 1,2 → 1,2 → 1,1 %; G13 1333 → 1325 → 1325 → 1329 vàng |
| G16 (cổng từ ải 15) | 171,5 s | 159,7 s | 165,5 s | 158,3 s | trượt như cũ |
| B2 | đạt | đạt | đạt | đạt | |
| B3 | Mới 73 %, Trẻ em Thư giãn 91 % | 71 / 91 % | 70 / 91 % | 73 / 91 % | đạt |
| B4 (S Chậm chắc > S Ẩu) | 120 seed: 63,5 so với 61,2; 300 seed: 64,3 so với 61,1 | 120 seed: 57,5 so với 58,2; **300 seed: 57,2 so với 56,1** | 120 seed: 60,1 so với 55,2 | 120 seed: 59,4 so với 59,4; **300 seed: 58,4 so với 57,0** | đạt (V0, V2 sát: biên 1,1 và 1,4 điểm ở 300 seed, mốc 3,2) |
| B4 (hạ quái Chuẩn nhanh hơn Ẩu) | 4,21 so với 5,25 s | 4,33 so với 5,33 s | 4,33 so với 5,34 s | 4,35 so với 5,35 s | đạt |
| B5, B8 | đạt | đạt | đạt | đạt | |
| B6 (Tốt hơn Kém ≥ 10 điểm) | 86 / 41 % (Cân bằng), 78 / 25 % (Thử thách) | 76 / 43 %, 71 / 18 % | 87 / 42 %, 75 / 18 % | 87 / 39 %, 82 / 21 % | đạt |
| B7, phần bộ điều nhịp | đạt | đạt | đạt | đạt | |
| **B1 theo dải D27** | 6 ô lệch | **7 ô** | **9 ô** | **8 ô** | **xấu thêm ở cả ba bản** |
| B7 theo dải D27 (bot tắt nhịp) | 2 ô (S cao, I cao) | 1 ô (I cao) | 1 ô | 1 ô | không xấu thêm |

B1 theo dải D27, các ô lệch:

- Mốc: Mới thắng thấp, Chậm chắc thắng cao, Chuẩn I cao, Khá I cao, Ẩu thắng thấp, Nhanh I cao.
- Cả ba bản thêm **Khá thắng thấp và S thấp**: 64,2 / 25,4 % (V0), 66,7 / 25,9 % (V1), 63,3 / 25,2 % (V2); mốc 75,8 / 47,5 %.
- V1 và V2 thêm Chậm chắc I cao: 21,4 % và 20,5 %.
- V0 và V2 đưa Ẩu vào dải: thắng 75,0 và 77,5 %.

Hai bộ seed cho cùng kết quả ở mọi cổng, trừ B4 của V0 và V2 ở 120 seed:

- V0: bộ 20261023 đạt (57 so với 55), bộ 21261026 trượt (58 so với 60).
- V2: bộ 20261023 đạt, bộ 21261026 trượt; làm tròn thì cả hai bộ bằng nhau (58 so với 58, 61 so với 61).
- Vì biên dưới 3 điểm nên tôi chạy 300 seed: cả hai bản đạt.

### 5.5 Đợt có sói (7, 9, 10)

Cân bằng, 2 × 60 seed (`perwave.ts`; `wolf-waves-3.md`, `wolf-waves-base-v0.md`, `wolf-waves-base-v1.md`, `wolf-waves-base-v2.md`). Các cột:

- Thua: số lượt thua ở đợt, trên số lượt vào đợt.
- Héo: máu mất do Héo lan mỗi lượt.
- Tru: phần thời gian sống của sói có ≥ 3 sói trong 6 m.
- Chữ bầy: số chữ bầy gõ xong mỗi lượt.
- Hạ bằng chữ: phần sói chết vì chữ.

Mỗi ô: mốc → V1 → V2.

| Bot | Đợt | Thua | S | P | I | Héo | Tru (%) | Chữ bầy / lượt | Hạ bằng chữ (%) |
|---|---|---|---|---|---|---|---|---|---|
| Mới | 7 | 1/98 → 5/98 → 3/98 | 56,8 → 56,9 → 58,3 | 19,9 → 20,7 → 19,9 | 14,0 → 25,8 → 22,5 | 140 → 157 → 140 | 0 → 100 → 50 | 0,0 → 0,0 → 1,0 | 99 → 1 → 47 |
| Mới | 9 | 4/93 → 3/87 → 1/93 | 63,1 → 65,6 → 60,8 | 25,3 → 24,2 → 23,7 | 17,7 → 28,5 → 24,6 | 151 → 134 → 133 | 0 → 100 → 52 | 0,0 → 0,1 → 1,0 | 96 → 9 → 62 |
| Mới | 10 | 2/89 → 0/84 → 4/92 | 69,4 → 65,4 → 62,8 | 24,3 → 25,8 → 26,9 | 19,4 → 27,4 → 23,4 | 171 → 209 → 250 | 0 → 100 → 53 | 0,0 → 0,1 → 1,0 | 97 → 9 → 62 |
| Chậm chắc | 7 | 1/116 → 0/116 → 0/116 | 58,1 → 55,7 → 58,2 | 21,0 → 21,0 → 21,0 | 15,9 → 27,7 → 24,5 | 150 → 160 → 153 | 0 → 99 → 53 | 0,0 → 0,0 → 1,0 | 100 → 1 → 46 |
| Chậm chắc | 9 | 0/114 → 2/114 → 3/115 | 62,0 → 65,0 → 65,0 | 25,9 → 23,1 → 23,2 | 19,1 → 30,5 → 27,1 | 159 → 116 → 125 | 0 → 100 → 53 | 0,0 → 0,0 → 1,0 | 100 → 4 → 66 |
| Chậm chắc | 10 | 1/114 → 0/112 → 3/112 | 67,9 → 61,9 → 61,5 | 23,8 → 27,3 → 28,4 | 23,6 → 28,4 → 25,7 | 169 → 269 → 286 | 0 → 100 → 54 | 0,0 → 0,1 → 1,0 | 100 → 7 → 68 |
| Chuẩn | 7 | 4/114 → 6/114 → 3/114 | 54,3 → 55,1 → 54,2 | 25,1 → 24,8 → 24,2 | 18,3 → 29,3 → 26,9 | 191 → 204 → 182 | 0 → 99 → 58 | 0,0 → 0,0 → 1,0 | 100 → 1 → 52 |
| Chuẩn | 9 | 3/109 → 2/107 → 3/107 | 57,7 → 60,3 → 60,4 | 26,8 → 27,2 → 25,4 | 20,6 → 29,9 → 28,2 | 165 → 165 → 139 | 0 → 98 → 57 | 0,0 → 0,1 → 1,0 | 99 → 3 → 65 |
| Chuẩn | 10 | 2/106 → 5/105 → 1/104 | 63,5 → 54,9 → 53,8 | 23,8 → 28,9 → 29,0 | 26,5 → 29,4 → 25,8 | 158 → 300 → 299 | 0 → 100 → 58 | 0,0 → 0,0 → 1,0 | 99 → 3 → 67 |
| Khá | 7 | 3/117 → 1/117 → 3/117 | 44,4 → 48,0 → 48,2 | 36,5 → 34,2 → 34,6 | 20,7 → 29,1 → 26,6 | 341 → 307 → 312 | 0 → 96 → 64 | 0,0 → 0,2 → 1,0 | 100 → 5 → 56 |
| Khá | 9 | 2/93 → 4/106 → 10/105 | 52,0 → 50,5 → 52,0 | 25,3 → 30,1 → 31,1 | 36,0 → 39,1 → 35,6 | 135 → 151 → 168 | 0 → 98 → 60 | 0,0 → 0,1 → 1,0 | 99 → 3 → 66 |
| **Khá** | **10** | **0/91 → 22/102 → 19/95** | 53,1 → 36,8 → 39,2 | 31,1 → 38,9 → 38,7 | 27,1 → 25,5 → 23,2 | **246 → 461 → 460** | 1 → 98 → 62 | 0,0 → 0,1 → 1,0 | 100 → 2 → 66 |
| Ẩu | 7 | 4/103 → 3/103 → 2/103 | 59,5 → 59,9 → 59,5 | 23,7 → 22,6 → 23,8 | 15,5 → 24,6 → 20,5 | 159 → 153 → 158 | 0 → 97 → 55 | 0,0 → 0,1 → 1,2 | 96 → 6 → 52 |
| Ẩu | 9 | 3/91 → 2/94 → 6/100 | 66,3 → 63,2 → 63,9 | 27,6 → 27,1 → 27,8 | 17,3 → 25,6 → 22,3 | 145 → 145 → 160 | 0 → 98 → 57 | 0,0 → 0,1 → 1,1 | 99 → 7 → 64 |
| Ẩu | 10 | 0/88 → 6/92 → 1/94 | 71,0 → 65,3 → 65,6 | 23,5 → 26,0 → 25,4 | 20,9 → 24,8 → 23,2 | 140 → 219 → 193 | 1 → 97 → 60 | 0,0 → 0,2 → 1,1 | 94 → 9 → 63 |
| Nhanh | 7 | 1/119 → 1/119 → 1/119 | 56,5 → 53,5 → 54,9 | 37,7 → 37,6 → 38,6 | 24,2 → 29,8 → 27,0 | 234 → 245 → 247 | 0 → 94 → 71 | 0,0 → 0,3 → 1,0 | 75 → 6 → 62 |
| Nhanh | 9 | 1/118 → 2/118 → 1/117 | 55,0 → 56,3 → 59,0 | 34,9 → 31,8 → 30,5 | 36,7 → 44,0 → 43,2 | 184 → 143 → 128 | 0 → 96 → 65 | 0,0 → 0,2 → 1,0 | 99 → 5 → 67 |
| Nhanh | 10 | 9/117 → 10/116 → 9/116 | 46,4 → 45,1 → 44,3 | 39,4 → 41,8 → 41,0 | 22,8 → 25,7 → 24,1 | 393 → 414 → 421 | 4 → 95 → 65 | 0,0 → 0,3 → 1,0 | 58 → 9 → 67 |
| b25 | 7 | 3/109 → 0/109 → 1/109 | 61,1 → 62,5 → 62,2 | 20,9 → 18,6 → 19,5 | 16,4 → 28,1 → 24,8 | 133 → 115 → 118 | 0 → 99 → 53 | 0,0 → 0,0 → 1,0 | 100 → 2 → 44 |
| b25 | 9 | 2/105 → 0/107 → 0/108 | 70,0 → 70,8 → 69,7 | 24,7 → 22,8 → 23,1 | 18,7 → 28,5 → 26,2 | 141 → 118 → 128 | 0 → 100 → 57 | 0,0 → 0,2 → 1,0 | 100 → 15 → 67 |
| b25 | 10 | 0/103 → 0/107 → 0/108 | 73,8 → 69,8 → 69,5 | 23,5 → 25,4 → 25,5 | 22,0 → 27,0 → 25,4 | 165 → 222 → 216 | 0 → 100 → 60 | 0,0 → 0,2 → 1,0 | 99 → 19 → 69 |
| b60 | 7 | 0/119 → 1/119 → 1/119 | 49,8 → 49,9 → 52,1 | 39,9 → 38,4 → 39,1 | 23,2 → 29,9 → 27,8 | 288 → 281 → 276 | 0 → 96 → 68 | 0,0 → 0,2 → 1,0 | 77 → 5 → 59 |
| b60 | 9 | 3/117 → 6/117 → 2/115 | 50,7 → 54,2 → 56,3 | 35,9 → 34,0 → 32,0 | 37,2 → 43,0 → 41,5 | 207 → 173 → 150 | 0 → 98 → 65 | 0,0 → 0,1 → 1,0 | 100 → 3 → 66 |
| b60 | 10 | 21/114 → 19/111 → 23/113 | 42,3 → 40,0 → 42,4 | 40,9 → 41,6 → 41,8 | 21,7 → 25,2 → 22,6 | 406 → 456 → 457 | 3 → 96 → 65 | 0,0 → 0,2 → 1,0 | 58 → 5 → 67 |
| Chuẩn tắt nhịp | 7 | 0/103 → 1/103 → 0/103 | 60,3 → 62,7 → 62,0 | 20,6 → 19,1 → 19,5 | 22,9 → 33,5 → 30,8 | 132 → 127 → 117 | 0 → 99 → 59 | 0,0 → 0,0 → 1,0 | 100 → 1 → 49 |
| Chuẩn tắt nhịp | 9 | 1/102 → 0/102 → 1/103 | 67,8 → 66,1 → 66,5 | 23,5 → 22,7 → 23,2 | 24,7 → 35,5 → 32,1 | 132 → 137 → 140 | 0 → 100 → 59 | 0,0 → 0,1 → 1,0 | 98 → 8 → 67 |
| Chuẩn tắt nhịp | 10 | 0/101 → 6/102 → 4/102 | 70,8 → 59,9 → 60,2 | 23,9 → 27,7 → 28,2 | 25,5 → 29,9 → 26,9 | 161 → 290 → 281 | 0 → 100 → 64 | 0,0 → 0,1 → 1,0 | 99 → 12 → 69 |

O vẫn 0 ở mọi bot và mọi đợt có sói. N đổi trong khoảng 0,00–0,44. Sói không làm Hỏa Long mất máu lần nào (cột Cắn của `wolf-waves-base-*.md` là 0 ở mọi bot, cả ở mốc lẫn ba bản).

- **Bầy đi sát và tru kích được.** Ở mốc, tru gần như không bao giờ kích (0–4 %), như phát hiện 17. V1: 94–100 % thời gian sống của sói. V2: 50–71 %, vì Thiên Hỏa hạ một con lúc khoảng 1 s, và hai con còn lại không đủ 3 để tru.
- **Ở V1, chữ bầy gần như không được gõ** (0,0–0,3 mỗi lượt; sói chết vì chữ 1–19 %). Nguyên nhân là Thiên Hỏa (`deaths-*.txt`: 20 seed, Chuẩn, Khá, Ẩu):
  - Bot "fair" thả Thiên Hỏa khi có ≥ 3 quân trong 4 m, trong Vùng Chữ. Bầy 1,8 m đủ điều kiện ngay khi vào sân, nên Thiên Hỏa rơi lên bầy ở giây 0–1 của đợt 7, 9, 10 và hạ cả ba con (V1: sói chết vì Thiên Hỏa 2,6–3,0 con mỗi lượt).
  - Ở mốc, lần thả đầu là ở giây 10–15, lên đỉnh 1.
  - V2 sửa phần này: chữ bầy được gõ 1,0–1,2 lần mỗi lượt; sói chết vì chữ 44–69 %; Thiên Hỏa hạ 0,8–1,0 con mỗi lượt.
- **Vực đợt 10 của Khá** (V1, V2): đây là chỗ B1 lệch thêm.
  - Thiên Hỏa vẫn rơi lên bầy ở giây 0 (V2 cũng vậy) và hồi 24 s, nên đỉnh 1 (7–20 s) không có nó.
  - Héo trong giây 10–25 của đợt 10, mỗi lượt: Khá 107 → 241 (V1) → 242 (V2); Chuẩn 46 → 115 → 97.
  - Cả đợt 10: Khá thua 0/91 → 22/102 → 19/95, Héo 246 → 461 → 460; Chuẩn Héo 158 → 300 → 299; Chậm chắc 169 → 269 → 286; Chuẩn tắt nhịp thua 0 → 6 → 4.
  - V0 cũng vậy: Khá thua ở đợt 9 2 → 11, ở đợt 10 0 → 18 (`wolf-waves-base-v0.md`).
- **Đợt 7, 9 nhàn hơn.** Ở đợt 7, I tăng ở mọi bot: 5,6–11,8 điểm ở V1, 2,8–8,6 điểm ở V2 (Chuẩn: 18,3 → 29,3 → 26,9). Ở đợt 9, I tăng 3,1–11,4 điểm ở V1 và tới 8,0 điểm ở V2, trừ Khá ở V2 (36,0 → 35,6). Chuẩn tắt nhịp đợt 9: 24,7 → 35,5 → 32,1. Một chữ thay ba chữ, mà quãng lặng vẫn dài như cũ (V1, V2). Héo ở đợt 9 của V2 giảm ở 6/9 bot.

### 5.6 Tải đỉnh

- **Kế hoạch** (thước 6 / 8 / 10 s của 00 §4.4), mốc → V0 → V1, V2:
  - Đợt 7: 1,10 / 1,09 / 1,08 → 1,10 / 1,08 / 1,07 → 1,10 / 1,08 / 1,07.
  - Đợt 9: 1,10 / 1,09 / 1,08 → 1,10 / 1,10 / 1,08 → 1,10 / 1,10 / 1,08.
  - Đợt 10: 1,39 / 1,38 / 1,38 ở cả ba.
  - Trần 1,15 (đợt giữa) và 1,40 (đợt cuối) giữ. Một bầy riêng đọc 1,00, ba chữ sói cùng lúc đọc 1,59 (test).
- **Đo trong trận** (lớn nhất qua mọi bot; bot Chuẩn; Chuẩn tắt nhịp):
  - Đợt 7: mốc 1,35; 1,34; 1,11 → V2 1,35; 1,34; 1,10.
  - Đợt 9: 1,35; 1,34; 1,11 → 1,34; 1,34; 1,10.
  - Đợt 10: 1,40; 1,39; 1,39 → 1,39; 1,39; 1,39.
  - G9 giữ 1,40.
  - Đỉnh đo được ở đợt giữa trên 1,15 là do bộ điều nhịp co khoảng sinh, đã có ở mốc (phát hiện của (4), §3). Bước này không đổi phần đó; bot tắt nhịp giữ ≤ 1,11.

### 5.7 Biến thể đã thử

| Bản | Khác gì | Kết quả (Cân bằng, 120 seed) |
|---|---|---|
| V0 (`c586d5e`) | Bầy 3 con, chữ chung, tải một con sói; kế hoạch xếp theo tải (đợt 7, 9, 10 ngắn đi 5–6 s) | Khá 64,2 %, B1 7 ô; B4 120 seed 57,5 so với 58,2, 300 seed 57,2 so với 56,1; D23a 14,9 %; chữ bầy 0,0–0,3 mỗi lượt |
| V1 (`54d92c5`) | Như V0, quãng lặng của bầy giữ độ dài cũ | **D23a 15,0 %**; Khá 66,7 %, B1 9 ô; B4 60,1 so với 55,2; chữ bầy 0,0–0,3 mỗi lượt |
| V2 (`8348655`) | Như V1, đòn vùng lấy ≤ 60 % máu bầy; câu thẻ ra mắt | D23a 13,4 %; chữ bầy 1,0 mỗi lượt; B4 300 seed 58,4 so với 57,0; Khá 63,3 % (300 seed 66,3 %), B1 8 ô |

Không thử thêm: đã dùng hết hai biến thể. Cả ba bản vấp cùng một chỗ.

- Bầy mở đợt 7, 9, 10 và đi sát nhau, nên nó là mục tiêu tốt nhất cho Thiên Hỏa ngay giây đầu.
- Thiên Hỏa hồi 24 s, nên đỉnh 1 của đợt không có nó. Người gõ nhanh (Khá, k 1,21) chịu nặng nhất ở đợt 10.
- Trần 60 % của V2 giữ cho chữ bầy được gõ, nhưng không đổi lúc Thiên Hỏa rơi.
- Có hai cách tránh Thiên Hỏa rơi sớm: dời bầy khỏi đầu đợt (đường cong đợt, việc của (4)), hoặc dạy bot giữ Thiên Hỏa cho đỉnh (đổi thước đo). Cả hai nằm ngoài hướng (3).

### 5.8 Trình duyệt

Vite riêng ở 127.0.0.1:4151 `--strictPort`, mã của đầu nhánh (`8348655`, V2), đã tắt sau khi chạy. Kịch bản tạm `wave7-v2.mjs` là `wave7.mjs` của lượt trước, thêm bước thả Thiên Hỏa lên bầy. Chạy qua `heavy.sh --gpu node scripts/visual/cdp-run.mjs`, 1280×720 rồi 1920×1080 trong cùng một lượt, 35 WPM.

- Đợt 1–6 chạy nhanh trong trang. Ở đợt 7, kịch bản gõ mọi chữ trừ chữ của sói.
- Thước che thân lấy cách đo của `dh-crowd`: phần diện tích hộp thân nằm dưới các thẻ đang hiện, lấy mẫu lưới 40 × 40. Kịch bản đạt khi mọi con dưới 30 %. Tôi không chạy chính `dh-crowd`, vì kịch bản đó chỉ đo đợt 3–4.
- Kết quả (`browser-v2-run.json`): `ok`, 0 exception, 0 tài nguyên lỗi, mã băm phát lại khớp ở cả hai cỡ.

Những gì thấy được:

- **Chữ bầy hiện** 1,5 s sau khi đợt 7 bắt đầu, khi bầy cách bệ 22,7–24,6 m. Chỉ có **một thẻ**: "family ×3 · gia đình" (1280) và "room ×3 · phòng" (1920), có biểu tượng móng chân. Không có thẻ hay chấm nào khác trên sói. Ba con trong 1,8 m, cả ba đang tru. Thẻ che 0 % thân mỗi con; 2,2 s sau (bầy cách bệ 13–15 m) vẫn 0 %.
- **Thiên Hỏa** thả trước con đầu 2,5 m. Máu bầy 330 → 132, đúng 60 % (hai số 110 và 88). Một con chết, hai con choáng. Vẫn một thẻ, nay là ×2; chữ bầy giữ nguyên. Thẻ che thân hai con 0 % (1280), 13,1 % và 3,6 % (1920).
- **Gõ chữ bầy bằng phím thật**: cả hai con chết cùng lúc ("HOÀN HẢO 148" trên mỗi con). Sau đó không còn thẻ hay chấm trên sân.

Ảnh đã xem:

- `browser-v2/w7-pack-word-1920x1080.png`: thẻ "room ×3" trên bầy ở đầu cầu phía bắc. Thẻ ra mắt "QUÁI MỚI · Sói Mục" có câu mới, đọc rõ, không đè HUD.
- `browser-v2/w7-pack-word-1280x720.png`: thẻ "family ×3" trên bầy, ba thân sói thấy rõ dưới thẻ.
- `browser-v2/w7-pack-word-crop-1920x1080.png`: phóng quanh bầy. Thẻ đứng trên ba thân, ba thân không bị che.
- `browser-v2/w7-pack-later-crop-1280x720.png`: bầy qua cầu, thẻ đi theo, ba thân thấy rõ.
- `browser-v2/w7-pack-skyfire-1920x1080.png`: hai số 110 và 88 trên bầy, ô Thiên Hỏa đang hồi (23). Thẻ "room ×2" trên hai con còn lại sát bệ.
- `browser-v2/w7-pack-skyfire-crop-1280x720.png` và `-1920x1080.png`: hai con còn lại thấy rõ dưới thẻ ×2.
- `browser-v2/pack-frames-1280x720/f-02.jpg`: chữ "family ✓" ở thẻ học, "HOÀN HẢO 148" trên cả hai con ở sát bệ.

Lượt trước đã chạy cùng kịch bản (không có bước Thiên Hỏa) với mã V1 (`browser/`, `browser-run.json`): `ok`, một thẻ, cả ba con tru, che 0 % (17,3 % một con ở 1920, khi bầy cách bệ 11 m). Thẻ ra mắt ở lượt đó còn câu cũ "gõ từng con sớm".

### 5.9 Kết luận, chờ anh

- **Không giữ.** Phần riêng của bước đạt ở V2:
  - bầy đi sát trong 6 m, tru kích được;
  - một chữ dài hơn chữ thường (5,6 so với 4,2–4,6 chữ cái ở 35 WPM), được gõ và trúng mọi con;
  - tải tính một lần, trần đỉnh giữ;
  - thẻ đọc thành một chữ cho cả bầy ở cả hai cỡ.
- Nhưng **B1 xấu thêm ở cả ba bản**, quá độ nhiễu:
  - Khá thắng 75,8 → 64,2 / 66,7 / 63,3 % (300 seed của V2: 75,7 → 66,3 %), S 47,5 → khoảng 25 %.
  - V1 còn gãy D23a (Thiên Hỏa 15,0 % sát thương).
  - B4 của V0 và V2 chỉ đạt sát ở 300 seed (biên 1,1 và 1,4 điểm, mốc 3,2).
- Gốc của việc này: bầy mở đợt 7, 9, 10 và đi sát, nên Thiên Hỏa rơi lên nó ngay giây đầu, rồi hồi trong lúc đỉnh 1 tới. Ở đợt 10, người gõ nhanh mất đúng đòn vùng đã giữ họ qua cú dồn 15–20 s đầu đợt (§3).
- Anh cần chọn một trong ba:
  - (a) Giữ V2 và dời bầy khỏi đầu đợt, đặt vào quãng lặng sau đỉnh 1 của đợt 7, 9, 10, để Thiên Hỏa còn cho đỉnh 1. Việc dời là đường cong đợt, nên đo cùng (4).
  - (b) Giữ V2 như hiện nay và nhận Khá thấp hơn (B1 thêm 2 ô). Rồi bù vực đợt 10 của người gõ nhanh bằng phần đợt 10 của (4).
  - (c) Không dùng chữ chung. Sói đi hàng như nay, và chọn một trong hai cách còn lại của phát hiện 17: W thấp hơn, hoặc bỏ tru bầy ở M0.

## 6. D33 (1): bẫy và nhà gần như không chạy — đã đo, **không giữ** (V2, bom 30 sát thương: B4 trượt ở bộ seed 21261026 khi chạy 300 seed); xung Lều Thuốc Nam vẫn 0 lần mỗi lượt ở bot

> **Sửa 28/10 sau kiểm tra độc lập.** Lượt đầu ghi bước này là **giữ** và gộp vào `main`. Lượt đó chỉ đọc số gộp của B4 ở 300 seed, nên bỏ sót ô B4 của bộ 21261026 mà báo cáo bot in là TRƯỢT (S Chậm chắc 65 so với Ẩu 69; mốc 65 so với 61). Báo cáo chấm từng bộ seed riêng và chấm gộp (`scripts/balance/run.ts`). Lượt đầu cũng đã loại V1 vì B4 trượt ở một bộ seed. Áp cùng chuẩn đó thì V2 gãy B4, sau khi đã thử đủ hai biến thể. Vì vậy bước này **không giữ**: mã, test và golden trên `main` về như `83da970` (mục 7). Các mục 6.4, 6.5 và 6.9 dưới đây đã sửa theo; các mục khác giữ số của lượt đầu.

Hướng (1) của D33 là phát hiện 11 của `2026-10-27-test-pass.md`: món mua 80–120 vàng mà gần như không làm gì.

- **Bom Hạt Thông** nổ khi có từ 2 quái trong 3 m (thay 3), hoặc khi có quái đang bị lính chặn trong vùng nổ.
- **Xung Lều Thuốc Nam** phát sau 3 lần gõ hạ quái (thay 5), đo như luật cũ (03 §10.2: quái chết vì đòn từ khi đứng trong 7 m của lều).
- **Lưới Phóng** giữ luật. Ô và cửa hàng ghi rõ "chỉ bắn quái bay"; bot mua khi đợt kế có quái bay (đổi bot, không đổi sim).
- Mỗi ô bẫy và nhà hiện trạng thái **sẵn sàng** và **vừa nổ** mà người chơi thấy được, ở cả hai cỡ.

Nhánh `s6-traps`, hai commit trên `abc2a75` (`2fccf86` luật, bot, giao diện; `90e7f35` sửa độ tương phản chấm Năng sau lượt trình duyệt). Lượt đầu đã gộp `--ff-only` vào `main`; ngày 28/10 đã gỡ khỏi `main` bằng một commit revert (mục 7). Nhánh để nguyên. Bằng chứng ở `tmp/mac-2026-10-27/owner/s6-traps/`.

### 6.1 Đã làm gì

- **Sim** (`src/sim/traps.ts`, `houses.ts`; `src/content/types.ts`, `data/our-side.ts`, `rules.ts`):
  - `TrapDef.triggerHeld`: bẫy nổ cả khi chỉ có một quái trong vùng mà quái đó đang bị lính chặn (`blockedBy ≥ 0`, movement đặt trong tick này). Bom Hạt Thông: `triggerMin` 3 → 2, `triggerHeld: true`.
  - Bom Hạt Thông mỗi lần nổ **120 → 30 sát thương** (biến thể V2, mục 6.6). Đẩy lùi 2 m, nạp 22 s giữ nguyên.
  - `HouseDef.energyMax`: số lần gõ hạ quái để phát Xung, mặc định 5 (`OUR_SIDE.houseEnergyMax`). Lều Thuốc Nam: 3.
- **Bot** (`scripts/balance/policy.ts`): khi đợt kế có quái bay và chưa có Lưới Phóng nào với tới đường bay, lưới ở ô với tới được (`cau-t4`) đáng 6 điểm (7,5 điểm mỗi 100 vàng), cao hơn mọi dải gai. Người mua kém (`poor`) không đọc thẻ đợt nên không đổi.
- **Giao diện**:
  - `src/ui/slot-state.ts` (mới) vẽ một chip DOM cạnh mỗi bẫy (bên trái chiều đi, cách 2,4 m, để không che quái đứng trên bẫy) và trên mái mỗi nhà, chỉ trong đợt và lúc báo đợt. Chip nằm dưới lớp thẻ chữ.
  - Sẵn sàng: vòng sáng đủ vòng. Đang nạp: vòng chạy theo phần đã nạp, kèm số giây còn lại. Bị chặn hay đổ nát: xám.
  - Vừa nổ: chip phóng to, sáng lên, chữ "Nổ!" (bom), "Bắn!" (lưới), "Xung!" (nhà) bay lên rồi mờ trong 1,2 s. Gai Chông chỉ chớp 0,45 s, không có chữ, vì nó đâm mỗi 0,5 s.
  - Nhà có 3 chấm Năng dưới chip, sáng dần theo số lần gõ hạ quái.
  - Menu ô (lúc nghỉ) và thẻ sửa món ghi luật kích và trạng thái: "Tự nổ khi ≥ 2 quái trong 3 m, hoặc khi lính đang chặn quái trong vùng nổ · Sẵn sàng", "Chỉ bắn quái bay", "Đủ 3 lần gõ hạ quái trong 7 m: phát Xung hồi 10 % · Năng 0/3".
  - Lưới Phóng: dòng của cửa hàng mở đầu bằng "Chỉ bắn quái bay"; hàng của lưới trong menu ô trống ghi "Lưới Phóng · Chỉ bắn quái bay"; thẻ đặt món ghi "Chỉ bắn quái bay · đợt kế: N quái bay" thay cho số quái đi đường.
  - Câu mới không đặt thêm tên món nào; tên cũ giữ cho lượt đổi tên của game.
- **Test**: bom chờ 2 quái và nổ với một quái bị chặn (`ourside-traps`); Xung ở 3 (`ourside-houses`); bot mua lưới khi đợt kế có quái bay (`bot-policy`); trạng thái chip, dòng luật, chỗ đặt chip (`tests/ui/slot-state.test.ts`).
- **Golden** cập nhật bằng `pnpm dh:golden:update`, có ghi trong commit: `b35-seed1` `8b16e8be` → `cbdcb227` (152 lệnh, giữ nguyên); `noTyping-seed2` `59192d7b` → `b3a40135` (11 → 10 lệnh). `sloppy-hard-off-seed3` chạy 8 phút thay 7, vì 7 phút đầu nay chỉ còn 2 lần nhả khóa bằng Esc mà test đòi ≥ 3 (8 phút: 4 lần); `4d27a14a` → `b19a8316`, 623 → 681 lệnh.
- `pnpm check` 410/410. Lượt `pnpm dh:balance --modes=balanced --seeds=60 --jobs=3` trên đầu nhánh khớp 15/15 bot với lượt đo của cây V2.

### 6.2 Mỗi món chạy bao nhiêu lần (mục tiêu của bước)

Cân bằng, 2 × 60 seed. Mốc → V0 (luật mới, bom 120) → V2 (bản giữ, bom 30). Lưới: số lần bắn mỗi lượt, trong ngoặc là số lưới bot mua mỗi lượt. Bom: số lần nổ mỗi lượt, trong ngoặc là số quái trúng mỗi lần nổ.

| Bot | Bom nổ mỗi lượt (quái mỗi lần) | Lưới bắn mỗi lượt (lưới mua) | Xung Lều mỗi lượt | Bom, % sát thương lên quái | Phe ta, % |
|---|---|---|---|---|---|
| b25 | 2,5 (3,1) → 10,5 (1,2) → 9,9 (1,2) | 0 (0) → 2,4 (0,89) → 2,5 (0,89) | 0 → 0 → 0 | 1,1 → 3,1 → 1,4 | 34,6 → 37,0 → 35,4 |
| Chuẩn (b35) | 2,2 (3,1) → 7,2 (1,3) → 7,2 (1,3) | 0 (0) → 1,6 (0,93) → 1,7 (0,93) | 0 → 0 → 0 | 1,0 → 2,2 → 1,1 | 30,7 → 32,0 → 30,9 |
| b60 | 2,8 (3,6) → 12,9 (1,2) → 13,0 (1,5) | 0 (0) → 0,7 (0,89) → 0,8 (0,89) | 0 → 0 → 0 | 1,5 → 4,3 → 2,2 | 35,7 → 38,3 → 36,3 |
| Mới | 3,1 (3,2) → 12,0 (1,2) → 12,7 (1,2) | 0 (0) → 2,1 (0,66) → 2,0 (0,66) | 0 → 0 → 0 | 1,5 → 3,8 → 1,9 | 35,2 → 37,6 → 35,7 |
| Chậm chắc | 2,3 (3,1) → 9,4 (1,2) → 9,5 (1,3) | 0 (0) → 2,0 (0,91) → 2,1 (0,91) | 0 → 0 → 0 | 1,0 → 2,8 → 1,4 | 33,6 → 35,6 → 34,2 |
| Khá | 1,2 (3,3) → 9,9 (1,2) → 9,6 (1,1) | 0 (0) → 1,0 (0,89) → 1,1 (0,89) | 0 → 0 → 0 | 0,7 → 3,5 → 1,3 | 31,4 → 34,2 → 32,0 |
| Ẩu | 2,4 (3,1) → 10,9 (1,2) → 10,7 (1,3) | 0 (0) → 0,9 (0,34) → 1,0 (0,34) | 0 → 0 → 0 | 1,3 → 3,4 → 1,6 | 30,2 → 32,5 → 30,3 |
| Nhanh | 3,0 (3,6) → 12,4 (1,3) → 12,3 (1,4) | 0 (0) → 0,6 (0,88) → 0,7 (0,88) | 0 → 0 → 0 | 1,6 → 4,4 → 1,9 | 36,1 → 38,7 → 36,8 |
| Chuẩn tốt | 2,4 (3,1) → 6,8 (1,3) → 6,9 (1,3) | 0 (0) → 0,9 (0,91) → 1,0 (0,91) | 0 → 0 → 0 | 1,0 → 2,0 → 1,1 | 30,6 → 32,2 → 31,3 |
| Chuẩn kém | 2,6 (3,3) → 6,6 (1,7) → 5,7 (1,7) | 0 (1,17) → 0 (1,17) → 0 (1,17) | 0 → 0 → 0 | 2,0 → 3,8 → 1,5 | 19,3 → 21,0 → 18,8 |
| Chuẩn tắt nhịp | 2,1 (3,1) → 6,4 (1,3) → 6,4 (1,3) | 0 (0) → 1,1 (0,88) → 1,1 (0,88) | 0 → 0 → 0 | 1,0 → 2,0 → 1,0 | 30,1 → 31,9 → 30,5 |
| Trẻ em | 0,7 (3,3) → 2,3 (1,7) → 1,9 (1,7) | 0 (0,88) → 0 (0,90) → 0 (0,86) | 0 → 0 → 0 | 1,7 → 4,0 → 1,5 | 26,5 → 28,7 → 24,5 |

Phe ta ở bảng này là trung bình theo lượt của từng bot; G8 của báo cáo (Chuẩn) là 30,3 → 31,8 → 30,6 %.

- **Bom** nổ 3–8 lần nhiều hơn (Chuẩn 2,2 → 7,2 lần mỗi lượt), phần lớn là một quái bị Vệ Binh Rêu chặn ở `cau-b2`, cạnh bom ở `cau-t3` (1,1–1,5 quái mỗi lần nổ). Mốc chỉ nổ ở đợt 1–3, khi bầy Kiến Gai đi qua; nay nổ ở mọi đợt. Theo đợt, Chuẩn (bom / lưới mỗi lượt vào đợt, mốc → V2): đợt 1 1,04 / 0 → 1,15 / 0; đợt 2 0,57 / 0 → 1,57 / 0,18; đợt 3 0,30 / 0 → 1,26 / 0,32; đợt 4 0 / 0 → 1,16 / 0,33; đợt 5 0 / 0 → 0,63 / 0,14; đợt 6 0 / 0 → 0,37 / 0,08; đợt 7 0,11 / 0 → 0,70 / 0,23; đợt 8 0,10 / 0 → 0,28 / 0,17; đợt 9 0,02 / 0 → 0,10 / 0,20; đợt 10 0,03 / 0 → 0,13 / 0,09.
- **Lưới** trước đây không bot nào mua đúng chỗ (người mua kém mua nhưng đặt ở `cau-t3`, ngoài tầm, nên bắn 0 lần). Nay bot đọc thẻ đợt mua lưới ở nghỉ đợt 1 trong 88–93 % lượt (Mới 66 %, Ẩu 34 %, vì hai bot này mua Bình Máu Nhỏ trước rồi hết vàng) và bắn 0,6–2,5 lần mỗi lượt. Mỗi đợt từ 2 chỉ có một Ong Gai (đợt 10 hai con), và người gõ nhanh thường hạ nó trước khi nó vào tầm 11 m, nên Nhanh, b60 bắn ít nhất.
- **Xung Lều Thuốc Nam vẫn 0 lần mỗi lượt ở mọi bot**, như mốc. Mục 6.7.

### 6.3 Cả ải, Cân bằng, 120 seed

Mỗi ô: Thắng / S / P / I / O / N / Q (%, N là số lần). V0: luật mới, bom 120. V1: bom 40. V2: bom 30 (bản giữ).

| Bot | Mốc | V0 | V1 | V2 | Hạ quái (s) |
|---|---|---|---|---|---|
| b25 | 85,8 / 70,6 / 20,3 / 18,5 / 0 / 0,42 / 40,9 | 97,5 / 77,6 / 18,5 / 18,8 / 0 / 0,33 / 40,7 | 93,3 / 74,7 / 19,3 / 18,8 / 0 / 0,27 / 40,8 | 90,8 / 68,4 / 19,7 / 18,6 / 0 / 0,33 / 40,8 | 5,3 → 5,0 → 5,2 → 5,2 |
| Chuẩn (b35) | 86,7 / 60,1 / 21,3 / 20,8 / 0 / 0,48 / 38,4 | **91,7** / 59,7 / 20,4 / 20,7 / 0 / 0,47 / 38,5 | 88,3 / 61,4 / 21,3 / 20,5 / 0 / 0,62 / 38,6 | 88,3 / 60,8 / 21,2 / 20,5 / 0 / 0,57 / 38,8 | 4,2 → 4,1 → 4,2 → 4,2 |
| b60 | 77,5 / 36,1 / 31,3 / 29,5 / 0 / 0,76 / 48,4 | 89,2 / 41,8 / 27,1 / 32,0 / 0 / 0,67 / 47,1 | 85,0 / 38,4 / 29,9 / 30,0 / 0 / 0,81 / 48,4 | 80,0 / 37,7 / 30,1 / 29,8 / 0 / 0,74 / 48,4 | 3,6 → 3,3 → 3,6 → 3,6 |
| Mới | 72,5 / 61,2 / 23,9 / 16,4 / 0 / 0,85 / 42,7 | 87,5 / 71,9 / 20,4 / 17,6 / 0 / 0,41 / 41,8 | 85,0 / 67,3 / 22,0 / 17,2 / 0 / 0,63 / 42,2 | 82,5 / 67,3 / 22,3 / 17,1 / 0 / 0,63 / 41,9 | 6,1 → 5,5 → 5,8 → 5,8 |
| Chậm chắc | 94,2 / 63,5 / 19,9 / 18,8 / 0 / 0,29 / 40,0 | 97,5 / 68,4 / 19,0 / 19,1 / 0 / 0,17 / 40,1 | 95,0 / 68,2 / 19,7 / 18,8 / 0 / 0,26 / 40,3 | 96,7 / 67,6 / 19,7 / 18,8 / 0 / 0,32 / 40,3 | 4,9 → 4,8 → 4,9 → 4,9 |
| Khá | 75,8 / 47,5 / 23,7 / 26,6 / 0 / 0,78 / 37,6 | 85,8 / 55,1 / 21,5 / 27,9 / 0 / 0,56 / 36,9 | 74,2 / 47,4 / 23,2 / 26,3 / 0 / 0,81 / 37,7 | 69,2 / 47,2 / 23,3 / 26,3 / 0 / 0,82 / 38,2 | 3,9 → 3,7 → 3,9 → 4,0 |
| Ẩu | 73,3 / 61,2 / 23,8 / 16,2 / 0,2 / 0,65 / 37,7 | 91,7 / **71,5** / 21,2 / 16,5 / 0,2 / 0,53 / 37,3 | 74,2 / 62,5 / 23,4 / 16,3 / 0,2 / 0,65 / 37,5 | 77,5 / 62,7 / 23,2 / 16,3 / 0,2 / 0,74 / 37,8 | 5,3 → 4,9 → 5,2 → 5,2 |
| Nhanh | 90,0 / 44,5 / 30,3 / 30,7 / 0 / 0,72 / 48,4 | 91,7 / 46,1 / 26,6 / 33,0 / 0 / 0,47 / 48,4 | 88,3 / 46,7 / 29,0 / 30,7 / 0 / 0,51 / 49,0 | 87,5 / 43,6 / 29,3 / 30,8 / 0 / 0,56 / 48,9 | 3,5 → 3,2 → 3,4 → 3,4 |
| Chuẩn tốt | 85,8 / 61,1 / 19,1 / 20,5 / 0 / 0,38 / 40,4 | 96,7 / 67,3 / 18,2 / 20,9 / 0 / 0,32 / 40,1 | 94,2 / 66,8 / 18,4 / 20,8 / 0 / 0,31 / 40,0 | 92,5 / 67,4 / 18,6 / 20,6 / 0 / 0,33 / 40,2 | 4,1 → 3,9 → 4,0 → 4,0 |
| Chuẩn kém | 40,8 / 0 / 22,1 / 18,8 / 0 / 2,39 / 48,4 | 55,8 / 19,9 / 21,1 / 19,4 / 0 / 2,21 / 48,4 | 38,3 / 0 / 22,0 / 18,7 / 0 / 2,49 / 48,9 | 41,7 / 0 / 22,0 / 18,7 / 0 / 2,49 / 49,5 | 4,6 → 4,5 → 4,6 → 4,6 |
| Chuẩn tắt nhịp (B7) | 84,2 / 67,4 / 20,5 / 22,2 / 0 / 0,26 / 38,1 | 94,2 / 66,2 / 18,8 / 23,3 / 0 / 0,17 / 37,6 | 90,8 / 68,9 / 19,4 / 23,0 / 0 / 0,23 / 37,8 | 85,0 / 65,7 / 19,8 / 22,7 / 0 / 0,21 / 38,0 | 4,2 → 4,0 → 4,0 → 4,1 |
| Chỉ gõ | 0 / 0 / 24,8 / 17,7 / 0 / 0,53 / 47,7 | như mốc | như mốc | như mốc | 5,1 |
| Không gõ | 0 / 0 / 70,2 / 4,5 / 0 / 0,00 / 76,2 | 0 / 0 / 70,1 / 4,6 / 0 / 0,00 / 79,5 | 0 / 0 / 70,1 / 4,6 / 0 / 0,00 / 83,9 | 0 / 0 / 70,1 / 4,6 / 0 / 0,00 / 83,9 | 9,2 → 9,3 |
| Trẻ em | 9,2 / 0 / 38,8 / 7,8 / 0 / 1,62 / 88,1 | 7,5 / 0 / 38,4 / 7,9 / 0 / 1,61 / 88,4 | 6,7 / 0 / 38,7 / 7,9 / 0 / 1,64 / 88,2 | 5,8 / 0 / 38,7 / 7,8 / 0 / 1,54 / 89,0 | 9,5 → 9,6 |

Hai chế độ kia, mốc → V0 → V1 → V2:

- Thư giãn: mọi bot gõ thắng 100 % ở cả bốn bản; Trẻ em 90,8 → 91,7 → 92,5 → 92,5 %.
- Thử thách: Chuẩn 60,0 → 77,5 → 75,0 → 70,0 %; Mới 63,3 → 88,3 → 79,2 → 65,8 %; Chậm chắc 81,7 → 96,7 → 93,3 → 84,2 %; Khá 69,2 → 90,8 → 74,2 → 74,2 %; Ẩu 53,3 → 78,3 → 59,2 → 49,2 %; Nhanh 94,2 → 94,2 → 89,2 → 91,7 %; Chuẩn tắt nhịp 80,8 → 95,0 → 90,8 → 87,5 %.

### 6.4 Cổng (mốc → V0 → V1 → V2)

- **G1** (Chuẩn thắng 75–90 %): 86,7 → **91,7 (gãy)** → 88,3 → 88,3 %.
- G3: 85,8 → 97,5 → 93,3 → 90,8 %, đạt. G5: 0 %, đạt. G6: 120/120 thua ở đợt 1, đạt. G9: 1,40 ở cả bốn, đạt.
- **G8** (phe ta 20–35 %, trần 40 %): 30,3 → 31,8 → 30,9 → 30,6 %, đạt. G8b: 69,7 → 68,2 → 69,1 → 69,4 %, đạt. D23a (Thiên Hỏa ≤ 15 %): 12,8 → 12,7 → 12,7 → 12,8 %, đạt.
- G9b (7), G10 (0/phút), G11 (1,2–1,4 %), G13 (1333 → 1356 → 1335 → 1341 vàng), G13b, G15 (tệ nhất 22,2–22,7 %): đạt ở cả bốn. G16: 171,5 → 167,9 s (V2), trượt như cũ (cổng từ ải 15).
- B2, B5, B8: đạt ở cả bốn.
- B3: Mới 73 → 88 → 85 → 83 %; Trẻ em Thư giãn 91 → 92 → 93 → 93 %. Đạt.
- **B4** (S Chậm chắc > S Ẩu; báo cáo bot chấm từng bộ seed riêng và chấm gộp):
  - Gộp, 120 seed: 64 / 61 → **68 / 72 (gãy)** → 68 / 63 → 68 / 63. Hạ quái Chuẩn so với Ẩu: 4,21 / 5,25 → 4,12 / 4,88 → 4,23 / 5,22 → 4,23 / 5,22 s.
  - Theo bộ seed, 120 seed (bộ 20261023; bộ 21261026): mốc 62 / 56 và 66 / 62; V1 **67 / 69 (trượt)** và 69 / 60; V2 67 / 58 và 69 / 68.
  - Biên gộp của V2 là 4,9 điểm, nhưng biên ở bộ 21261026 chỉ 1 điểm, dưới ngưỡng 3 điểm, nên phải chạy 300 seed (mục 6.5). **Ở 300 seed, V2 trượt ở bộ 21261026: S Chậm chắc 65 so với Ẩu 69** (64,9 so với 68,5; mốc 65,2 so với 61,4, đạt). Bộ 20261023: 66 so với 59 (mốc 64 so với 58), đạt. Gộp: 65,3 so với 62,9, đạt, nhưng biên 3,2 → 2,4 điểm.
  - Sửa 28/10: lượt đầu ghi "V2 đạt ở cả hai bộ" theo số 120 seed và chỉ đọc số gộp của 300 seed. Đúng ra V2 **gãy B4** ở bộ 21261026, như V1 gãy ở bộ 20261023.
- **B6** (Tốt hơn Kém ≥ 10 điểm): Cân bằng 86 / 41 → 97 / 56 → 94 / 38 → 93 / 42 %; Thử thách 78 / 25 → 88 / 41 → 78 / 25 → 76 / 21 %. Đạt ở cả bốn.
- B7, phần bộ điều nhịp (≤ 3 bậc mỗi đợt, ±15 %): đạt ở cả bốn.
- **B1 theo dải D27**: 6 → 10 → 8 → 7 ô lệch.
  - V2 so với mốc: Mới đổi "thắng thấp" thành "S cao" (S 61,2 → 67,3); Chậm chắc thêm "S cao" (63,5 → 67,6); Khá thêm "thắng thấp" (75,8 → 69,2); Ẩu vào dải (73,3 → 77,5).
  - Ở 300 seed (mục 6.5) Khá 75,7 → 75,3 % và S Chậm chắc 64,3 → 65,3 %: hai ô mới của V2 nằm trong độ nhiễu seed.
- **B7 theo dải D27** (Chuẩn tắt nhịp): 2 → 3 → 3 → 2 ô (V0, V1 thêm thắng cao 94,2 và 90,8 %; V2 85,0 %).
- B9: thiếu số (buổi chơi thử của chủ dự án).
- Ở 120 seed, hai bộ seed cho cùng kết quả ở mọi cổng của V2. Ở 300 seed thì không: B4 đạt ở bộ 20261023 và trượt ở bộ 21261026 (sửa 28/10; lượt đầu ghi "cùng kết quả").

### 6.5 300 seed (2 × 150, Cân bằng), mốc → V2

Mốc 300 seed lấy từ `s2-d31/b4-v2-300.json` (Chậm chắc, Ẩu, Mới, Chuẩn: k ≤ 1, trùng mốc từng số) và `s2-d31/fast300-base.json` (Khá, Nhanh, b60).

| Bot | Mốc | V2 |
|---|---|---|
| Chậm chắc | 93,3 / 64,3 / 20,0 / 18,8 / 0 / 0,39 / 40,3 | 94,7 / 65,3 / 19,8 / 18,7 / 0 / 0,38 / 40,3 |
| Ẩu | 73,0 / 61,1 / 24,3 / 16,2 / 0,2 / 0,67 / 37,7 | 77,0 / 62,9 / 23,3 / 16,4 / 0,2 / 0,72 / 37,5 |
| Mới | 80,0 / 62,7 / 23,2 / 16,7 / 0 / 0,89 / 42,3 | 84,0 / 64,5 / 22,2 / 17,1 / 0 / 0,64 / 41,6 |
| Chuẩn (b35) | 81,7 / 59,5 / 21,6 / 20,4 / 0 / 0,55 / 38,7 | 85,0 / 60,5 / 21,3 / 20,5 / 0 / 0,55 / 38,7 |
| Khá | 75,7 / 50,4 / 23,7 / 26,7 / 0 / 0,74 / 38,2 | 75,3 / 50,4 / 23,3 / 26,5 / 0 / 0,75 / 37,9 |
| Nhanh | 90,3 / 43,2 / 30,2 / 30,7 / 0 / 0,71 / 48,6 | 87,7 / 43,0 / 29,2 / 30,9 / 0 / 0,60 / 48,8 |
| b60 | 79,3 / 37,9 / 31,1 / 29,6 / 0 / 0,80 / 48,4 | 84,7 / 38,7 / 30,0 / 29,9 / 0 / 0,73 / 48,4 |

B4 ở 300 seed (`b4-d30-300.md`; kiểm tra độc lập chạy lại khớp từng số, `verify/b4-head-300.json` và `verify/b4-base-300.json`):

| | Bộ 20261023 (150 seed) | Bộ 21261026 (150 seed) | Gộp (300 seed) |
|---|---|---|---|
| Mốc: S Chậm chắc / S Ẩu | 63,6 / 58,1, đạt (biên 5,5) | 65,2 / 61,4, đạt (biên 3,8) | 64,3 / 61,1, đạt (biên 3,2) |
| V2: S Chậm chắc / S Ẩu | 66,4 / 58,8, đạt (biên 7,6) | **64,9 / 68,5, TRƯỢT (−3,6)** | 65,3 / 62,9, đạt (biên 2,4) |
| V2: thắng Chậm chắc / Ẩu | 91,3 / 75,3 % (mốc 94,7 / 68,0) | 98,0 / 78,7 % (mốc 92,0 / 78,0) | 94,7 / 77,0 % (mốc 93,3 / 73,0) |
| V2: hạ quái Chuẩn / Ẩu (s) | 4,22 / 5,28 | 4,29 / 5,18 | 4,26 / 5,23 |

Báo cáo in số làm tròn (bộ 21261026: "S 65 % vs 69 %"). Số lẻ lấy từ lượt chạy riêng từng bộ (`--seed-sets=1 --base-seed=<bộ> --seeds=150`, cùng seed với bộ đó trong lượt 300 seed; `tmp/mac-2026-10-27/owner/fix/set-*.json`). S gộp không phải trung bình của hai bộ.

Lượt đầu chỉ ghi số gộp ("65,3 so với 62,9, đạt") và bỏ sót ô TRƯỢT của bộ 21261026 trong bảng "B1–B9 theo từng bộ seed độc lập" của báo cáo. Sửa 28/10: V2 gãy B4. Thắng tăng 1–5 điểm ở người gõ chậm và b60, S tăng 1–2 điểm; Khá, Nhanh không đổi quá độ nhiễu.

### 6.6 Biến thể đã thử, và phần nào gây gì

Đo riêng từng phần trên mốc (Cân bằng, 120 seed, thắng %; công cụ `items.ts`, cùng seed với `dh:balance`):

| Bot | Mốc | Chỉ "≥ 2 quái" | Chỉ "quái bị chặn" (≥ 3 giữ nguyên) | Cả hai, bom 120, chưa đổi bot | V0 (cả hai, bot mua lưới) |
|---|---|---|---|---|---|
| Chuẩn | 86,7 | 86,7 | 84,2 | 89,2 | 91,7 |
| Mới | 72,5 | 77,5 | 90,0 | 88,3 | 87,5 |
| Ẩu | 73,3 | 86,7 | 90,8 | 89,2 | 91,7 |
| Khá | 75,8 | 82,5 | 83,3 | 86,7 | 85,8 |
| b25 | 85,8 | 94,2 | 99,2 | 99,2 | 97,5 |
| Chuẩn tắt nhịp | 84,2 | 83,3 | 94,2 | 95,8 | 94,2 |
| Chuẩn tốt | 85,8 | 86,7 | 89,2 | 88,3 | 96,7 |

- Phần "quái bị chặn" làm bom nổ gấp 3–5 lần và gây phần lớn mức dễ thêm. Phần "≥ 2 quái" một mình đã đưa Ẩu lên 86,7 %.
- Phần mua lưới thêm 2–8 điểm ở Chuẩn, Chuẩn tốt, b60.
- Phần Lều 3 Năng không đổi số nào, vì Xung không phát.

Các bản đo thêm, giữ luật kích của chủ dự án và chỉ đổi số của bom:

| Bản | Khác gì | Kết quả |
|---|---|---|
| V0 | Luật mới, bom 120 VL, đẩy 2 m, nạp 22 s | **G1 91,7 %, B4 gãy (S 68 so với 72)**, B1 10 ô, B7 3 ô |
| (thử nhanh) | Như V0, nổ do quái bị chặn thì không đẩy | Thắng như V0 (Chuẩn 90,0, Mới 89,2, Ẩu 91,7 %): đẩy lùi không phải nguyên nhân |
| (thử nhanh) | Như V0, nạp 30 s | Bom nổ chỉ ít đi khoảng 10 %; Mới 95,0, Ẩu 87,5 %: nạp không phải núm |
| V1 | Bom 40 VL | Mọi cổng đạt; B1 8 ô (Chậm chắc S 68,2, Khá thắng 74,2), B7 3 ô (Chuẩn tắt nhịp 90,8 %); B4 trượt ở một bộ seed |
| V2 | Bom 30 VL (một phần tư 120, vì bom nổ 3–5 lần nhiều hơn) | Ở 120 seed mọi cổng đạt ở cả hai bộ seed; **ở 300 seed B4 trượt ở bộ 21261026 (S 65 so với 69)** (sửa 28/10; lượt đầu ghi "mọi cổng đạt ở cả hai bộ seed"); B1 7 ô, ở 300 seed trong độ nhiễu; B7 2 ô; phần sát thương của bom 1,1–2,2 % (mốc 0,7–1,6 %) |

Hai bản thử nhanh chỉ đo thắng (`items.ts`), không chạy `dh:balance`. V1 và V2 là hai biến thể, trong hướng chủ dự án (luật kích giữ nguyên; chỉ đổi sát thương mỗi lần nổ, số dữ liệu mà 03 §13.1 cho bot chỉnh).

### 6.7 Xung Lều Thuốc Nam: luật 3 lần đã vào, bot vẫn 0 lần

- Bot đặt lều ở `h-nw` (bệ trong, vì hào quang với tới bệ Rồng) và dựng muộn: Chuẩn 0,5 lều mỗi lượt, phần lớn ở đợt 7–9.
- Lần gõ hạ quái trong 7 m của mỗi bệ, mỗi lượt (20 seed, cây V0, `padprobe.ts`):

| Bot | `h-nw` | `h-ne` | `h-sw` | `h-e` | `h-w` (bệ ngoài, cạnh khúc suối) |
|---|---|---|---|---|---|
| Chuẩn | 0,8 | 4,1 | 1,2 | 0,4 | 26,6 |
| Mới | 1,65 | 5,5 | 2,8 | 0,2 | 34,4 |
| Chậm chắc | 1,15 | 5,4 | 1,9 | 0,65 | 33,2 |
| Chuẩn kém | 1,35 | 4,4 | 0,75 | 1,1 | 42,0 |
| Trẻ em | 13,3 | 12,25 | 1,9 | 0,35 | 3,55 |

- Ở `h-nw`, các lần đó rơi vào đợt 3–4, trước khi bot dựng lều. Sau khi dựng thì gần như 0, nên lều của bot không bao giờ đủ 3.
- Lều ở `h-w` (bệ ngoài cạnh khúc suối) có 27–42 lần gõ hạ quái trong vùng mỗi lượt, tức có thể phát Xung 9–14 lần mỗi lượt. Lều ở `h-ne` được 4–5,5 lần. Nhưng `h-w` cách bệ 15,4 m, quá tầm 11 m, nên Xung không hồi máu Rồng, chỉ hồi lính trong vùng.
- Kết luận: với luật 3 lần, Xung chạy được khi người chơi đặt lều chỗ quái chết. Lều dựng cho hào quang Rồng (bệ trong) thì vẫn gần như không phát Xung. Trình duyệt (mục 6.8) cho thấy Xung phát với lều ở `h-w`.

### 6.8 Trình duyệt (Apple M4, Vite riêng 127.0.0.1:4151 `--strictPort`, đã tắt)

Hai kịch bản tạm, chạy qua `heavy.sh --gpu node scripts/visual/cdp-run.mjs`, 1280×720 rồi 1920×1080 trong cùng một lượt, 35 WPM. Cả hai: 0 exception, 0 tài nguyên lỗi, mã băm phát lại khớp ở cả hai cỡ; mọi chip nằm trong màn và không đè bảng HUD (`data-keepout`).

- `traps.mjs` (`browser-run.json`; mã `2fccf86`):
  - Bày binh: bom ở `cau-t3`, Vệ Binh Rêu ở `cau-b2`; bấm chuột vào ô bom thì menu ghi "Tự nổ khi ≥ 2 quái trong 3 m, hoặc khi lính đang chặn quái trong vùng nổ · Sẵn sàng". Phím 3 (lưới) cho thẻ "Chỉ bắn quái bay · đợt kế: 0 quái bay · Thiếu 40 vàng".
  - Đợt 1, quái Đường Cầu để yên tới khi bom nổ: chip "Nổ!" kèm số 22, 3 s sau vòng nạp còn 19 s.
  - Nghỉ đợt 1: thẻ lưới "Chỉ bắn quái bay · đợt kế: 1 quái bay"; đặt ở `cau-t4`; menu ô "Lưới Phóng · cấp 1 · Chỉ bắn quái bay · Sẵn sàng".
  - Đợt 2, Ong Gai để yên tới khi lưới bắn: chip "Bắn!" kèm số 14, ong rơi xuống đất.
  - Lượt này gõ mọi chữ ngay khi hiện, nên quái chết ngoài 20 m và lều ở `h-w` không phát Xung; menu lều ghi "Đủ 3 lần gõ hạ quái trong 7 m: phát Xung hồi 10 % · Đang hồi máu · Năng 0/3".
- `hut.mjs` (`browser-hut-run.json`, rồi `browser-hut2-run.json` sau khi sửa chấm Năng): lều dựng lúc bày binh ở `h-w`, quái Đường Suối để yên tới khi vào 7 m của lều. Năng 0 → 1 → 2 → Xung ở đợt 1 (về 0), chip "Xung!".

Ảnh đã xem:

- `browser/prep-bomb-menu-1280x720.png`: menu bom ghi luật kích và "Sẵn sàng", nằm trên ô, không đè bảng đợt hay Bộ Mang Theo.
- `browser/w1-ready-1920x1080.png`: chip bom cạnh cây cầu, vòng sáng đủ, không che lính hay quái.
- `browser/w1-bomb-fired-1280x720.png` và `-crop-1920x1080.png`: "Nổ!" trên chip, số 22, quái bị Vệ Binh chặn ở đầu cầu; thẻ chữ ("place", "good" ở 1280; "small", "give" ở 1920) nằm phía trên, chip không che thân quái.
- `browser/w1-bomb-charging-crop-1280x720.png`: vòng nạp, số 19.
- `browser/b1-net-card-1920x1080.png`: thẻ đặt lưới "Chỉ bắn quái bay · đợt kế: 1 quái bay", thẻ đợt góc trái có "Quái bay ×1".
- `browser/b1-net-menu-1920x1080.png`: menu lưới "Chỉ bắn quái bay · Sẵn sàng".
- `browser/w2-net-fired-1280x720.png` và `-crop-1920x1080.png`: "Bắn!" trên chip lưới, số 14; ong đã xuống đất ở bên phải bệ.
- `browser/b-hut-menu-1280x720.png`: menu lều "Đủ 3 lần gõ hạ quái trong 7 m: phát Xung hồi 10 % · Đang hồi máu · Năng 0/3".
- `browser-hut/hut-pips-crop-1920x1080.png`: lượt đầu, hai chấm Năng sáng khó tách khỏi thân lều màu xanh nhạt. Đã sửa (`90e7f35`): chấm nằm trên nền tối.
- `browser-hut2/hut-pips-crop-1920x1080.png` và `-1280x720.png`: hai chấm sáng, một chấm tối, đọc rõ ở cả hai cỡ.
- `browser-hut2/hut-pulse-crop-1280x720.png`, `browser-hut/hut-pulse-1280x720.png`: "Xung!" trên chip, vòng hồi xanh của hiệu ứng, chấm về 0.

### 6.9 Kết luận, chờ anh

- **Không giữ** (sửa 28/10; lượt đầu ghi "Giữ (V2)"). Bom và lưới chạy, mỗi ô bẫy và nhà hiện sẵn sàng, đang nạp, vừa nổ ở cả hai cỡ, và ở 120 seed mọi cổng đạt ở cả hai bộ seed. Nhưng ở 300 seed B4 trượt ở bộ 21261026, sau khi đã thử đủ hai biến thể (40 VL, 30 VL). Theo luật giữ, bước không giữ: `main` gỡ mã của bước (mục 7), nhánh `s6-traps` để nguyên.
- **Gãy cổng, báo anh: B4** (S Chậm chắc > S Ẩu) ở bộ seed 21261026, 300 seed: 65 so với 69 (mốc 65 so với 61). Số gộp 300 seed vẫn đạt (65,3 so với 62,9), nhưng biên 3,2 → 2,4 điểm. Cả ba bản đo đều trượt B4 ở một chỗ: V0 (120 VL) ở số gộp, 68 so với 72; V1 (40 VL) ở bộ 20261023, 67 so với 69 (120 seed); V2 (30 VL) ở bộ 21261026, 65 so với 69 (300 seed).
- **Điều anh cần biết:** bản đo hạ bom xuống 30 sát thương mỗi lần nổ thay 120. Mức này nằm ngoài câu chữ của D33 (1), vốn chỉ đổi luật kích; 03 §7.2 giữ 120 vì bước không giữ. Với 120, luật mới gãy G1 (91,7 %) và B4 (68 so với 72). Ở 30 VL, phần sát thương của bom là 1,1–2,2 % (mốc 0,7–1,6 %). Kiểm tra độc lập đếm được 666 trên 870 lần nổ của Chuẩn (77 %) chỉ trúng một quái đang bị lính chặn, nên cái lợi thật đến từ cú đẩy 2 m.
- **Anh chọn cho phần bẫy:**
  - (a) Chấm B4 của bước này theo số gộp 300 seed (65,3 so với 62,9), xác nhận mức 30 VL, rồi gộp `s6-traps` như đã đo.
  - (b) Tách phần không đổi sim (chip trạng thái, dòng "Chỉ bắn quái bay" ở cửa hàng, menu ô và thẻ đặt món) để giữ riêng; luật bom đo lại cùng đường cong đợt (4) hoặc với một núm khác trong hướng (1).
  - (c) Giữ như mốc tới buổi chơi thử B9.
- **Còn chờ anh: Xung Lều Thuốc Nam.** Luật 3 lần (nhánh `s6-traps`) đo đúng thước 03 §10.2. Bot vẫn phát 0 lần mỗi lượt, vì bot đặt lều ở bệ trong cho hào quang Rồng, mà quái hiếm khi chết trong 7 m của bệ đó. Lều ở bệ ngoài `h-w` thì phát Xung (27–42 lần gõ hạ quái trong vùng mỗi lượt, trình duyệt thấy Xung ở đợt 1), nhưng không hồi Rồng. Anh chọn:
  - (a) Giữ như nay: Xung thưởng người đặt lều chỗ quái chết.
  - (b) Đổi thước cho Lều: đếm lần hạ quái trên đoạn đường gần nhà, hoặc mọi lần hạ quái của đợt. Hướng này nằm ngoài chữ "sau 3 lần hạ quái" của D33 (1), nên cần anh chốt rồi đo lại.

## 7. Sửa sau kiểm tra độc lập (28/10): bước 6 gãy B4, không giữ; `main` gỡ mã của bước

Kiểm tra độc lập trên `main` `0f419d8` chạy lại mọi lượt bot của các bước 1–6 và khớp từng số với làn. Nó tìm thấy một lỗi chính: B4 của bước 6 trượt ở bộ seed 21261026 khi chạy 300 seed. Changelog §6.4, §6.5 và hàng D33 (1) của 00-canon chỉ ghi số gộp, rồi viết "đạt ở cả hai bộ seed". Mục này sửa lỗi đó theo luật giữ. Bằng chứng ở `tmp/mac-2026-10-27/owner/fix/`.

### 7.1 Vì sao B4 tính theo từng bộ seed, và vì sao bước 6 không giữ

- `scripts/balance/run.ts` chạy hai bộ seed độc lập, "each judged on its own and together". Báo cáo in bảng "B1–B9 theo từng bộ seed độc lập"; ô B4 của bộ 21261026 trong `s6-traps/b4-d30-300.md` là TRƯỢT.
- Làn đã dùng chuẩn này ở chỗ khác: loại V1 của bước 6 vì B4 trượt ở bộ 20261023; loại D31 (§2) theo số 300 seed, không lấy số 120 seed để giữ.
- Ở mốc, B4 đạt ở cả hai bộ khi chạy 300 seed: 63,6 so với 58,1 và 65,2 so với 61,4. Sau V2, bộ 21261026 trượt: 64,9 so với 68,5. Như vậy một cổng đang đạt lúc bắt đầu bước đã gãy sau bước.
- Đã thử đủ hai biến thể trong hướng của chủ dự án (V1 40 VL, V2 30 VL). Luật giữ không cho biến thể thứ ba, nên bước 6 **không giữ** và báo anh là gãy cổng (mục 7.5). Chấm B4 theo số gộp thì là nới cổng cho đạt, nên không làm.

### 7.2 Đã làm gì

- Nhánh `fix-s6-b4` cắt từ `main` `0f419d8`. Commit `67cacc2` revert `2fccf86` và `90e7f35`: luật bom, Lều 3 Năng, bot mua lưới, chip trạng thái, các dòng mới ở menu ô, cửa hàng và thẻ đặt món, test và golden của bước. Không dùng lệnh git hủy nào.
- Mã, test và golden nay đúng như `83da970`: `git diff 83da970` ngoài thư mục changelog rỗng. Golden về theo commit revert, không chạy `pnpm dh:golden:update`. Ca `sloppy-hard-off-seed3` về 7 phút.
- Changelog: sửa §6 (đầu mục, 6.4, 6.5, 6.6, 6.9) và thêm mục này.
- Repo cha: hàng D33 (1) của 00-canon ghi "đã đo, gãy B4, không giữ, chờ chủ dự án". 03 §7.1, §7.2, §8.1, §10.2 về như trước bước 6: Bom Hạt Thông 120 VL, kích ≥ 3 quái; Lều 5 Năng; bỏ câu chip.
- Nhánh `s6-traps` để nguyên cho chủ dự án. Nếu sau này gộp, cần sửa hai chú thích mà kiểm tra độc lập chỉ ra: đầu `src/sim/traps.ts` vẫn ghi Bom Hạt Thông "120 VL"; đầu `src/ui/slot-state.ts` nói marker ô mang trạng thái, trong khi chỉ menu ô và thẻ sửa món mang trạng thái.
- `pnpm check`: 405/405, `tsc --noEmit` và `vite build` đạt, mã băm kit khớp. Hai lượt đầu, chạy khi các lượt bot khác đang chạy (load 13–18), trượt test đo thời gian `tags-bodies` (1,25 và 1,49 ms, trần 1 ms). Chạy riêng test đó thì đạt; lượt thứ ba qua `heavy.sh --cores=10` đạt đủ.

### 7.3 Đo lại trên `main` sau khi gỡ

`pnpm dh:balance` cả ba chế độ, 2 × 60 seed (`fix/fix-all.json`), và 300 seed cho bộ bot B4 cùng Khá, Nhanh, b60 (`fix/b4-fix-300.json`, `fix/fast-fix-300.json`). So với mốc `83da970` (`s1-word-ring/base-all.json`, `verify/b4-base-300.json`, `s2-d31/fast300-base.json`): mọi ô của JSON trùng nhau ở 15 bot × 3 chế độ, gồm Thắng / S / P / I / O / N / Q, hạ quái, số theo đợt, sát thương theo nguồn, mọi cổng G và B, và bảng theo từng bộ seed. Chỉ các số thời gian chạy sim là khác.

Cân bằng, 120 seed. Mỗi ô: Thắng / S / P / I / O / N / Q (%, N là số lần).

| Bot | Trước (`main` `0f419d8`, bước 6 V2) | Sau (gỡ, trùng mốc `83da970`) | Hạ quái (s) |
|---|---|---|---|
| b25 | 90,8 / 68,4 / 19,7 / 18,6 / 0 / 0,33 / 40,8 | 85,8 / 70,6 / 20,3 / 18,5 / 0 / 0,42 / 40,9 | 5,2 → 5,3 |
| Chuẩn (b35) | 88,3 / 60,8 / 21,2 / 20,5 / 0 / 0,57 / 38,8 | 86,7 / 60,1 / 21,3 / 20,8 / 0 / 0,48 / 38,4 | 4,2 → 4,2 |
| b60 | 80,0 / 37,7 / 30,1 / 29,8 / 0 / 0,74 / 48,4 | 77,5 / 36,1 / 31,3 / 29,5 / 0 / 0,76 / 48,4 | 3,6 → 3,6 |
| Mới | 82,5 / 67,3 / 22,3 / 17,1 / 0 / 0,63 / 41,9 | 72,5 / 61,2 / 23,9 / 16,4 / 0 / 0,85 / 42,7 | 5,8 → 6,1 |
| Chậm chắc | 96,7 / 67,6 / 19,7 / 18,8 / 0 / 0,32 / 40,3 | 94,2 / 63,5 / 19,9 / 18,8 / 0 / 0,29 / 40,0 | 4,9 → 4,9 |
| Khá | 69,2 / 47,2 / 23,3 / 26,3 / 0 / 0,82 / 38,2 | 75,8 / 47,5 / 23,7 / 26,6 / 0 / 0,78 / 37,6 | 4,0 → 3,9 |
| Ẩu | 77,5 / 62,7 / 23,2 / 16,3 / 0,2 / 0,74 / 37,8 | 73,3 / 61,2 / 23,8 / 16,2 / 0,2 / 0,65 / 37,7 | 5,2 → 5,3 |
| Nhanh | 87,5 / 43,6 / 29,3 / 30,8 / 0 / 0,56 / 48,9 | 90,0 / 44,5 / 30,3 / 30,7 / 0 / 0,72 / 48,4 | 3,4 → 3,5 |
| Chuẩn tốt | 92,5 / 67,4 / 18,6 / 20,6 / 0 / 0,33 / 40,2 | 85,8 / 61,1 / 19,1 / 20,5 / 0 / 0,38 / 40,4 | 4,0 → 4,1 |
| Chuẩn kém | 41,7 / 0 / 22,0 / 18,7 / 0 / 2,49 / 49,5 | 40,8 / 0 / 22,1 / 18,8 / 0 / 2,39 / 48,4 | 4,6 → 4,6 |
| Chuẩn tắt nhịp (B7) | 85,0 / 65,7 / 19,8 / 22,7 / 0 / 0,21 / 38,0 | 84,2 / 67,4 / 20,5 / 22,2 / 0 / 0,26 / 38,1 | 4,1 → 4,2 |
| Chỉ gõ | 0 / 0 / 24,8 / 17,7 / 0 / 0,53 / 47,7 | như trước | 5,1 |
| Không gõ | 0 / 0 / 70,1 / 4,6 / 0 / 0,00 / 83,9 | 0 / 0 / 70,2 / 4,5 / 0 / 0,00 / 76,2 | 9,3 → 9,2 |
| Trẻ em | 5,8 / 0 / 38,7 / 7,8 / 0 / 1,54 / 89,0 | 9,2 / 0 / 38,8 / 7,8 / 0 / 1,62 / 88,1 | 9,6 → 9,5 |

Hai chế độ kia, trước → sau:

- Thư giãn: mọi bot gõ thắng 100 % ở cả hai; Trẻ em 92,5 → 90,8 %; Chỉ gõ 79,2 → 79,2 %.
- Thử thách: Chuẩn 70,0 → 60,0; Mới 65,8 → 63,3; Chậm chắc 84,2 → 81,7; Khá 74,2 → 69,2; Ẩu 49,2 → 53,3; Nhanh 91,7 → 94,2; b25 88,3 → 84,2; b60 85,8 → 85,0; Chuẩn tốt 75,8 → 78,3; Chuẩn kém 20,8 → 25,0; Chuẩn tắt nhịp 87,5 → 80,8 %.

300 seed (2 × 150), Cân bằng, trước → sau:

- Chậm chắc 94,7 / 65,3 / 19,8 / 18,7 / 0 / 0,38 / 40,3 → 93,3 / 64,3 / 20,0 / 18,8 / 0 / 0,39 / 40,3.
- Ẩu 77,0 / 62,9 / 23,3 / 16,4 / 0,2 / 0,72 / 37,5 → 73,0 / 61,1 / 24,3 / 16,2 / 0,2 / 0,67 / 37,7.
- Mới 84,0 / 64,5 / 22,2 / 17,1 / 0 / 0,64 / 41,6 → 80,0 / 62,7 / 23,2 / 16,7 / 0 / 0,89 / 42,3.
- Chuẩn 85,0 / 60,5 / 21,3 / 20,5 / 0 / 0,55 / 38,7 → 81,7 / 59,5 / 21,6 / 20,4 / 0 / 0,55 / 38,7.
- Khá 75,3 / 50,4 / 23,3 / 26,5 / 0 / 0,75 / 37,9 → 75,7 / 50,4 / 23,7 / 26,7 / 0 / 0,74 / 38,2.
- Nhanh 87,7 / 43,0 / 29,2 / 30,9 / 0 / 0,60 / 48,8 → 90,3 / 43,2 / 30,2 / 30,7 / 0 / 0,71 / 48,6.
- b60 84,7 / 38,7 / 30,0 / 29,9 / 0 / 0,73 / 48,4 → 79,3 / 37,9 / 31,1 / 29,6 / 0 / 0,80 / 48,4.

Theo món: mã sim trùng `83da970` từng byte, nên số theo món là cột mốc của §6.2 (Chuẩn: bom 2,2 lần mỗi lượt, gần hết ở đợt 1–3; lưới 0; Xung 0); không chạy lại `items.ts`. Số theo đợt trong JSON của `dh:balance` trùng mốc từng ô.

### 7.4 Cổng, trước → sau

- G1 88,3 → 86,7 %; G3 90,8 → 85,8 %; G5 0 → 0 %; G6 120/120 thua ở đợt 1 → như cũ; G9 1,40 → 1,40: đạt.
- G8 30,6 → 30,3 %; G8b 69,4 → 69,7 %; D23a 12,8 → 12,8 %; D23b 0,1 %; G9b 7; G10 0/phút; G11 1,2 %; G13 1341 → 1333 vàng; G13b 30,1 %; G15 tệ nhất 22,5 → 22,7 %: đạt. G16 167,9 → 171,5 s, trượt như mốc (cổng từ ải 15).
- B2, B5, B8: đạt. B3: Mới 83 → 73 %, Trẻ em Thư giãn 93 → 91 %, đạt. B6: Cân bằng 93 / 42 → 86 / 41 %, Thử thách 76 / 21 → 78 / 25 %, đạt. B7 phần bộ điều nhịp: đạt.
- **B4**, 300 seed: bộ 20261023 66,4 / 58,8 → 63,6 / 58,1; **bộ 21261026 64,9 / 68,5 (trượt) → 65,2 / 61,4 (đạt)**; gộp 65,3 / 62,9 → 64,3 / 61,1 (biên 2,4 → 3,2). 120 seed: gộp 68 / 63 → 64 / 61; theo bộ 67 / 58 và 69 / 68 → 62 / 56 và 66 / 62. Hạ quái Chuẩn so với Ẩu: 4,26 / 5,23 → 4,29 / 5,31 s (300 seed). Cả hai bộ đạt ở cả 120 và 300 seed.
- B1 theo dải D27: 7 → 6 ô lệch. B7 theo dải D27: 2 → 2 ô. B1, B7 theo dải chung trượt như mốc. B9: thiếu số.
- Mọi cổng đạt lúc bắt đầu sửa (`0f419d8`) vẫn đạt sau khi gỡ; B4 theo bộ seed nay đạt lại; B1 không xấu thêm (bớt 1 ô).

### 7.5 Trình duyệt (Apple M4, Vite riêng 127.0.0.1:4151 `--strictPort`, đã tắt)

Chạy qua `heavy.sh --gpu node scripts/visual/cdp-run.mjs`, trên cây sau khi gỡ (`browser.sh`). Lượt này không giải nén cây nguồn nào vào gốc `dragon-hold` khi Vite chạy (lỗi nhỏ của kiểm tra độc lập: việc đó làm Vite tải lại trang); cây đối chiếu `0f419d8` để ngoài gốc.

- `dh-slot-menu` ở 1280×720 và 1920×1080: `ok`, 0 exception, 0 tài nguyên lỗi; 8 ô trong 14 m có marker, menu mở, không che Hỏa Long, nằm trong màn.
- `dh-placement` ở 1280×720 và 1920×1080 (cỡ 1920 qua `SIZE=1920`, vì kịch bản không đọc `--width`): 0 exception, 0 tài nguyên lỗi; mua và đặt đủ mọi món bằng chuột và bàn phím, nâng cấp, bán, menu sửa món mở; thẻ đợt và hộp vàng che 0 px đường, ô và số vàng; chạy tới nghỉ đợt 4.
- `dh-smoke` (cả hai cỡ trong một lượt): 0 exception; khung trung bình 18,9 ms (1280) và 18,0 ms (1920), p95 16,8 ms. Lượt đầu lỗi `Emulation.setDeviceMetricsOverride` vì tôi truyền cỡ sai cho kịch bản; chạy lại không truyền cỡ thì đạt.

Ảnh đã xem:

- `browser/slot-menu-1280x720/menu-h-nw-1280x720.png` và `browser/slot-menu-1920x1080/menu-h-ne-1920x1080.png`: menu bệ nhà "Bệ nhà · vòng trong · 5 Lều Thuốc Nam 120", như trước bước 6; không đè Hỏa Long hay HUD.
- `browser/placement-1280x720/place-ghost-pinebomb-1280x720.png`: thẻ đặt bom "Bom Hạt Thông · 90 vàng · Ô bẫy · Đường Cầu · Đợt kế: 25 quái qua đường này", câu của mốc.
- `browser/placement-1280x720/place-wave-1280x720.png`: đợt 1, không có chip trạng thái cạnh bẫy; thẻ ra mắt Yêu Rêu Lính đọc rõ.
- `browser/placement-1920-size/place-ghost-pinebomb-1920x1080.png`: cùng thẻ đặt bom của mốc ở 1920; bảng Bộ Mang Theo và thẻ đợt không che ô.
- `browser/placement-1920-size/place-wave-1920x1080.png`: đợt 1 ở 1920, không có chip cạnh bẫy; thẻ ra mắt Yêu Rêu Lính và thẻ "Đợt 1 · 2 đường" đọc rõ, không đè HUD.
- `browser/placement-1920x1080/place-menu-1280x720.png`: lượt đầu cho cỡ 1920 thật ra chạy ở 1280 (kịch bản bỏ qua `--width`), nên không tính là lượt 1920; ảnh cho menu sửa Lều "Nâng cấp 2 · thiếu 57 vàng / Bán +84".

### 7.6 Gãy cổng, báo anh

- **Bước 6, D33 (1): gãy B4.** Bộ seed 21261026, 300 seed: S Chậm chắc 64,9 so với Ẩu 68,5 (mốc 65,2 so với 61,4). Số gộp vẫn đạt, 65,3 so với 62,9, nhưng biên 3,2 → 2,4 điểm. Hai biến thể đã thử (40 VL trượt B4 ở bộ 20261023; 30 VL trượt ở bộ 21261026); bản 120 VL gãy G1 (91,7 %) và B4 gộp (68 so với 72).
- `main` nay như mốc. Mã của bước nằm ở nhánh `s6-traps` (`2fccf86`, `90e7f35`).
- Anh chọn (như §6.9): (a) chấm B4 của bước này theo số gộp, xác nhận mức 30 VL, rồi gộp `s6-traps`; (b) tách phần không đổi sim (chip, dòng "Chỉ bắn quái bay") để giữ riêng, đo lại luật bom cùng (4) hay với núm khác trong hướng (1); (c) giữ như mốc tới buổi chơi thử B9. Xung Lều vẫn chờ anh chọn thước (§6.9).
- Nếu chọn (a) hay (b): chip ở 1280×720 nhỏ (mặt chip 21–22 px, chấm Năng khoảng 5 px, chữ "Nổ!", "Bắn!" 13 px; kiểm tra độc lập), nên phóng chip ở cỡ này trước khi gộp.

## 8. Gộp và kiểm cuối (28/10)

Người tích hợp gộp phần đã duyệt của ngày 27/10 vào `main`, kiểm lại toàn bộ, rồi chơi thử hai ải đủ 10 đợt. Bằng chứng: `tmp/mac-2026-10-28/integrate/` (gitignored). Máy: Mac mini M4 dùng chung. Vite riêng 127.0.0.1:4153 `--strictPort`, đã tắt.

### 8.1 Gộp

- `d201906`: gộp nhánh `m0b-models` (6 commit, `3e5ae1b` → `607c3c1`). Đó là model M0b của chủ dự án trong game: rig và clip của ta, Bạch Long trắng ngọc, chế độ bench có xương, kịch bản `dh-models`. Nhánh cắt từ `3733bd8`, không có xung đột. Chỉ có mã và tài liệu: `src/view`, `scripts/models`, `scripts/visual`, `tests/view`, chỉ mục `art-src/3d/SOURCES.json`. Không có media trong Git; model nằm ở `public/assets/dragon-hold/models/m0b/` (bị bỏ qua).
- `6f3414f`: gộp nhánh `codex-023-easy-hint` (`7d9b753`, phiếu Codex 023, Claude đã duyệt). Thẻ tốc độ gợi ý mức Dễ khi chọn 15–20 WPM trước ải (D33 (6)). `src/app/app.ts` tự gộp, không xung đột với phần M0b.
- `src/sim`, `src/content`, `src/typing`, `scripts/balance`, `tests/golden`: `git diff 83da970` rỗng. Golden không cập nhật. Các nhánh `s1-word-ring` … `s6-traps` không gộp (không giữ, chờ anh).

### 8.2 Kiểm

- `pnpm check` qua `heavy.sh --cores=10`: mã băm kit khớp (73 file), 51 file test, **453/453** (405 + 20 của M0b + 28 của Codex 023), `tsc --noEmit` và `vite build` đạt. Golden 10/10 với mã băm cũ. Trước commit tài liệu này, hai lượt check trượt test đo thời gian `tags-bodies` (1,47 và 1,24 ms, trần 1 ms) khi máy chung tải 16–18; test đó chạy riêng đạt 21/21, lượt thứ ba đạt 453/453.
- `pnpm dh:balance` cả ba chế độ, 2 × 60 seed, trên đầu đã gộp (`integrate/head-all.json`). Mọi trường không phải thời gian chạy trùng `fix/fix-all.json` và mốc `s1-word-ring/base-all.json`: 15 bot × 3 chế độ, gồm Thắng / S / P / I / O / N / Q, hạ quái, số theo đợt, sát thương theo nguồn, mọi cổng và bảng theo từng bộ seed. Chỉ `meanMs`, `p95Ms`, `p99Ms`, `maxMs`, `realtime` khác. Model và gợi ý mức Dễ không chạm sim.

### 8.3 Số cuối trên `main` (Cân bằng, 120 seed)

Mỗi ô: Thắng / S / P / I / O / N / Q (%, N là số lần). Bảng trùng mốc `83da970`.

| Bot | Thắng / S / P / I / O / N / Q | Hạ quái (s) |
|---|---|---|
| b25 | 85,8 / 70,6 / 20,3 / 18,5 / 0 / 0,42 / 40,9 | 5,3 |
| Chuẩn (b35) | 86,7 / 60,1 / 21,3 / 20,8 / 0 / 0,48 / 38,4 | 4,2 |
| b60 | 77,5 / 36,1 / 31,3 / 29,5 / 0 / 0,76 / 48,4 | 3,6 |
| Mới | 72,5 / 61,2 / 23,9 / 16,4 / 0 / 0,85 / 42,7 | 6,1 |
| Chậm chắc | 94,2 / 63,5 / 19,9 / 18,8 / 0 / 0,29 / 40,0 | 4,9 |
| Khá | 75,8 / 47,5 / 23,7 / 26,6 / 0 / 0,78 / 37,6 | 3,9 |
| Ẩu | 73,3 / 61,2 / 23,8 / 16,2 / 0,2 / 0,65 / 37,7 | 5,3 |
| Nhanh | 90,0 / 44,5 / 30,3 / 30,7 / 0 / 0,72 / 48,4 | 3,5 |
| Chuẩn tốt | 85,8 / 61,1 / 19,1 / 20,5 / 0 / 0,38 / 40,4 | 4,1 |
| Chuẩn kém | 40,8 / 0 / 22,1 / 18,8 / 0 / 2,39 / 48,4 | 4,6 |
| Chuẩn tắt nhịp (B7) | 84,2 / 67,4 / 20,5 / 22,2 / 0 / 0,26 / 38,1 | 4,2 |
| Chỉ gõ | 0 / 0 / 24,8 / 17,7 / 0 / 0,53 / 47,7 | 5,1 |
| Không gõ | 0 / 0 / 70,2 / 4,5 / 0 / 0 / 76,2 | 9,2 |
| Trẻ em | 9,2 / 0 / 38,8 / 7,8 / 0 / 1,62 / 88,1 | 9,5 |

- Thư giãn: mọi bot gõ thắng 100 %; Chỉ gõ 79,2 %, Trẻ em 90,8 %, Không gõ 0 %.
- Thử thách: b25 84,2; Chuẩn 60,0; b60 85,0; Mới 63,3; Chậm chắc 81,7; Khá 69,2; Ẩu 53,3; Nhanh 94,2; Chuẩn tốt 78,3; Chuẩn kém 25,0; Chuẩn tắt nhịp 80,8 %.
- 300 seed (từ §7.3, sim không đổi): B4 bộ 20261023 63,6 so với 58,1, bộ 21261026 65,2 so với 61,4, gộp 64,3 so với 61,1; Nhanh 90,3 %, Khá 75,7 %, b60 79,3 %, Chuẩn 81,7 %.

Cổng:

- G1 86,7 %, G3 85,8 %, G5 0 %, G6 120/120 thua ở đợt 1, G9 1,40: đạt.
- G8 30,3 % (G8b 69,7 %), D23a 12,8 %, D23b 0,1 %, G9b 7, G10 0/phút, G11 1,2 %, G13 1332,9 vàng, G13b 30,1 %, G15 tệ nhất 22,7 %: đạt. G16 171,5 s: trượt như mốc (cổng từ ải 15).
- B2, B3 (Mới 73 %, Trẻ em Thư giãn 91 %), B4 (S 64 so với 61; hạ quái 4,21 so với 5,25 s), B5, B6 (Cân bằng 86 / 41 %, Thử thách 78 / 25 %), B8: đạt, ở cả hai bộ seed.
- B1, B7: trượt như mốc, theo cả dải chung và dải D27 (B1 6 ô lệch, B7 2 ô). B9: thiếu số (buổi chơi thử của anh).

### 8.4 Trình duyệt (1280×720 và 1920×1080, `heavy.sh --gpu`)

Mọi lượt: 0 exception, 0 lỗi console, 0 tài nguyên lỗi. Hai lượt chơi thử (8.5) tải đủ 25 file `m0b/` (manifest và 24 model).

| Kịch bản | 1280×720 | 1920×1080 |
|---|---|---|
| `dh-keyboard-only` | thắng 10/10 đợt, mã băm phát lại khớp (836 lệnh); trễ phím TB 12,3 ms, tối đa 62,9 ms | thắng 10/10, khớp (837 lệnh); trễ phím 14,1 / 51,5 ms |
| `dh-crowd` (seed 5) | `ok`; quái xa bị che ≥ 40 %: 1 khung trên 17.712 (đúng 40 %, một khung, luật cho chuỗi ≤ 6); gần 0/432; báo trước 0/7.323; 0 lần nảy | `ok`; quái xa 0/17.929 (lớn nhất 31 %); gần 0/430; báo trước 0/7.306; 0 lần nảy |
| `dh-words` (thẻ 100 % và 150 %) | `ok` cả hai; 0 chồng, 0 thiếu; chữ nhỏ nhất 16 / 24 px | `ok` cả hai; 0 chồng, 0 thiếu; 20 / 30 px |
| `dh-focus` (`SIZE=1920` cho cỡ lớn) | 4 cú bấm đều giữ phím; mất tiêu điểm: 0 tick; đếm 3-2-1 và phím đầu bị nuốt; ẩn 10 s: 0 tick; menu dừng | như 1280 |
| `dh-pace` | `ok`: thẻ, chọn 25 WPM, mở lại từ menu, số đo | `ok` |
| `dh-slot-menu` | `ok`, 8 ô, không che Hỏa Long | `ok` |
| `dh-banner` | `ok`: cắm, nhổ, mang lại; cờ hộp tạm đang mang 0 (model tự mang cờ); mã băm khớp | `ok` |
| `dh-telegraphs` | `ok`: đủ 6 loại quái, báo trước của địch ngắn nhất 500 ms | `ok` |
| `ui-preview` | 11 màn, 0 chồng | 11 màn, 0 chồng |

Ảnh đã xem: `browser/keyboard-only-1920x1080/kb-04-wave-10.png`, `browser/banner-1920x1080/01-planted-1920x1080.png`, `browser/telegraphs-1920x1080/telegraph-blight-wolf-1920x1080.png` (Sói vồ Vệ Binh ở đầu cầu, khiên đỏ và dấu "!" đọc rõ), `browser/slot-menu-1280x720/menu-h-ne-1280x720.png`.

### 8.5 Chơi thử cả ải (cảm giác chơi)

Kịch bản `integrate/feel/feel.mjs` (lấy từ kịch bản chơi thử 27/10): phím CDP thật, tốc 1, seed 1. Người chơi mô phỏng chọn tốc độ trên thẻ, học trước, mỗi lần nghỉ mua Gai Chông, Bom Hạt Thông, Lưới Phóng, Vệ Binh Rêu, Lều Thuốc Nam bằng phím khi đủ vàng, dùng kỹ năng 8–11 s một lần, gõ chữ gần nhất. Đây không phải bot của `dh:balance`: số dưới đây không phải I của BALANCE.md.

| | 35 WPM (1920×1080, thẻ 35, nhắm đúng 97 %) | 70 WPM (1280×720, thẻ 60, nhắm đúng 90 %) |
|---|---|---|
| Kết quả | Thắng 10/10, Hỏa Long cuối 650/653 | Thắng 10/10, cuối 653/653 |
| Máu thấp nhất thấy được | 429 (đợt 2) | 408 (đợt 5) |
| Phím | 878 chữ cái, 9 sai, trong 701 s cả ải | 994 chữ cái, 59 sai (94,1 %), trong 561 s |
| Thời gian đợt không có chữ nào trên màn | 40 % (36 % khi đang có quái trên sân); theo đợt 18–63 % | 66 % (63 % khi có quái); theo đợt 41–82 % |
| Thẻ chữ | 214 lần đo: 0 chồng, 0 thiếu, chữ nhỏ nhất 20 px | 223 lần đo: 0 chồng, 0 thiếu, 16 px |

Đợt 4 và đợt 10:

- Đợt 4 không phải bậc khó với người chơi này: máu 538 → 561 ở 35 WPM, 538 → 561 ở 70 WPM. Lúc đông nhất có 9 quái sống mà 0–1 chữ trên màn (`run-35-1920/w4-05-peak-9foes-253s`, `run-70-1280/w4-05-peak-9foes-199s`). Chữ duy nhất ở +20 s là "history" trên Heo ở đường phía bắc.
- Đợt 10 không còn là vực với người gõ 70 WPM: không mất máu, ở +20 s sân trống, ở +45 s có 3 quái mà 0 chữ. Ở 35 WPM, đợt 10 mất 71 máu trong 20 s đầu (614 → 543), cỡ đợt 2 (492 → 429) và đợt 9 (630 → 539): G01 vào vòng hào quang ở chỗ lội nước phía tây, mang chữ khiên "group".

Còn nhạt hay khó đọc (nói thẳng):

1. **Nhạt nhất: phần lớn thời gian đợt không có gì để gõ.** Quái chết ở bẫy và Vệ Binh, cách bệ 26–35 m, ngoài vùng hiện chữ. Người chơi đứng nhìn, chữ đến thưa. Mỗi đợt, 5–8 s sau khi bắt đầu, có 2 quái cách bệ 26–30 m mà không có chữ. Thử tua nhanh (Alt + →) thì bị từ chối: "Quái đã vào Vùng Chữ, chữ sắp hiện: chưa tua nhanh được". Đây đúng là nhàn I của D27; hai hướng sửa (D27 (i), D31) đều gãy cổng (§1, §2).
2. **Không thấy nguy.** Cả hai lượt thắng với hơn 99 % máu; máu thấp nhất 429 / 492 (35 WPM) và 408 / 561 (70 WPM). Người chơi mua bẫy và lính đều đặn thì ít khi bị đe dọa ở Cân bằng.
3. **G01 ở camera chơi**: nhìn từ trên xuống, model là một khối rêu, lá cờ thấy cạnh (`feel/crops/w5-g01-35-1920.png`). Khi đã cắm, cột sáng vàng làm nhạt cả thân, và có hai lá cờ: cờ của model và cờ cắm (`browser/banner-1920x1080/01-planted-1920x1080.png`). Người chơi nhận ra tướng nhờ thẻ ra mắt, vòng hào quang và thẻ chữ có khiên, không nhờ hình.
4. **Lều Thuốc Nam trông như bụi cây tròn** ở camera mặc định (đúng như giám khảo M0b ghi).
5. **Gai Chông cao hơn Sói**: một con sói đi qua bẫy bị khung gai che, chỉ còn vân bóng dưới thẻ chữ (`feel/crops/w10-wolves-35-1920.png`, đợt 10).
6. **Số sát thương của một cụm Kiến** xếp thành cột sáu số "122" đi lên khoảng 250 px vào rừng, xa đàn kiến (`feel/crops/w5-numbers-70-1280.png`, đợt 5 ở 1280).
7. **Bom trên `main`** (luật cũ ≥ 3 quái) ít nổ, và ô bẫy không báo vừa nổ. Model bom nhỏ, nằm dưới quái.
8. Ổn: Bạch Long trắng ngọc và Hỏa Long đỏ tách rõ ở cả hai cỡ; báo trước của sáu loại quái đọc được trên model; Sói rõ trên nước, khó thấy hơn trên đường đất.

### 8.6 Các luật chưa giữ, nhìn cùng model (xem trước, không đo, không commit)

Mỗi cây = `main` đã gộp + một nhánh, giải nén ngoài gốc `dragon-hold`, chạy lại kịch bản trình duyệt của làn ở cả hai cỡ. Phông chữ dự phòng vì Vite của cây xem trước từ chối file phông nằm ngoài gốc (28–30 yêu cầu phông lỗi 403; lỗi của cách dựng cây, không phải của game). Mọi lượt: 0 exception, mã băm phát lại khớp.

- **`s5-wolf-pack` (bầy Sói, V2)**: một thẻ "room ×3 · phòng" (1920) và "family ×3 · gia đình" (1280) đứng trên ba model sói đi sát; bầy giãn 1,8 m, che thân 0 % (11,8 % một con ở 1920). Đọc rõ là một bầy (`preview/s5/wave7/w7-pack-later-crop-1920x1080.png`).
- **`s6-traps` (bẫy và nhà)**: chip "Nổ!" kèm vòng nạp 22 s cạnh bom ở đầu cầu, "Bắn!" cạnh Lưới Phóng với Ong Gai rơi trong lưới, "Xung!" và vòng hồi máu quanh Lều. Ở 1920 chip 31–34 px, đọc rõ. Ở 1280 chip 21 px, đè gần hết model Lều; chấm Năng khó tách (`preview/s6/hut/hut-pips-crop-1280x720.png`).
- **`s4-g01-squad` (G01 đi giữa toán, V1)**: ở 1920, G01 to hơn hai Lính, bốn thẻ (cờ "team", "city", "write" có khiên, "home") sát nhau nhưng không chồng. Ở 1280, cột sáng của cờ cắm và hai Lính nhập thành một khối; không tách được tướng khỏi lính (`preview/s4/wave5/w5-squad-walk-crop-1280x720.png`).

### 8.7 Cổng đã gãy, chờ anh

| Bước | Cổng gãy | Trước → sau | Biến thể đã thử |
|---|---|---|---|
| 1 · D27 (i) | G1; B1, B7 xấu thêm | G1 86,7 → 92,5 % (cả hai bộ seed trên 90 %); B1 6 → 11 ô, B7 2 → 3 ô | i2 (bản trên nhánh): 92,5 %. i1 (độ chờ Héo lan tính từ lúc chữ hiện): G1 64,2 %, kèm G3 60,8 % và B3 (Mới 37,5 %) |
| 2 · D31 | G1 (cùng D27 (i)); trần 90 % | V0, V1: G1 92,5 %; Khá, Nhanh, b60 thắng 89–100 %. V2 (không kèm (i)): mọi cổng đạt ở 120 seed, nhưng Nhanh 90,3 → 92,3 % ở 300 seed | V0 (độ chờ từ lúc vào vùng), V1 (từ lúc chữ hiện), V2 (D31 trên `main`, giữ vòng 26 m) |
| 3 · D33 (4) | G1; B1 xấu thêm | G1 86,7 → 97,5 % (V0), 94,2 % (V1); 300 seed 81,7 → 93,3 %. B1 6 → 9 ô | V0 (Heo sau đỉnh 1, đợt 4 dài 65 s, trần đợt giữa 1,10), V1 (đợt 4 giữ 62 s, trần đúng 1,15). Riêng trần 1,15: 95,0 %; riêng dời Heo: 93,3 % |
| 4 · D33 (2) | Mục tiêu bước chưa đạt; V2 gãy G9 | V0, V1 qua mọi cổng nhưng G01 cắm cờ ở 3–4 % lượt của Chuẩn; I đợt 5 không giảm. V2: G9 1,40 → 1,73 | V0 (toán gom), V1 (rate 104), V2 (toán 1 s đúng 02 §5.2) |
| 5 · D33 (3) | B1 xấu thêm ở cả ba bản; V1 gãy D23a | Khá thắng 75,8 → 64,2 / 66,7 / 63,3 %, S 47,5 → khoảng 25 %; 300 seed V2 75,7 → 66,3 %. D23a 12,8 → 15,0 % (V1) | V0, V1 (giữ độ dài quãng lặng), V2 (trần 60 % đòn vùng cho bầy) |
| 6 · D33 (1) | B4 theo bộ seed (300 seed) | Bộ 21261026: S Chậm chắc 65,2 / Ẩu 61,4 → 64,9 / 68,5. Gộp 64,3 / 61,1 → 65,3 / 62,9 | V0 120 VL (G1 91,7 %, B4 gộp 68 / 72), V1 40 VL (B4 trượt ở bộ 20261023), V2 30 VL (bộ 21261026). Đã gỡ khỏi `main` (`67cacc2`) |

Lựa chọn cho từng bước ở §1.7, §2.7, §3.8, §4.8, §5.9, §6.9 và §7.6. Xung Lều Thuốc Nam vẫn 0 lần mỗi lượt ở mọi bot (§6.7).

### 8.8 Việc còn mở

- Nhàn là cảm giác lớn nhất còn lại (8.5 mục 1). Mọi núm đã đo đều gãy G1 hay trần 90 %. Cần anh chọn hướng cho D27 và D31 trước buổi chơi thử B9.
- M0b: trần tam giác 05 §8 chưa đạt (High 3,09 M so với 2 M); mức Low vẫn dùng khối tạm; G01 ở camera chơi (cờ ngả, hai lá cờ khi cắm); Lều giống bụi cây; Gai Chông che Sói; đường dẫn media `public/assets/dragon-hold/models/m0b/` cần anh xác nhận. Model chỉ có trên Mac này cho tới khi anh chạy `pnpm media:push`.
- Chip của `s6-traps` ở 1280 cần to hơn và đứng cạnh Lều, không đè lên Lều, nếu anh gộp nhánh.
- Cột số sát thương của cụm Kiến (8.5 mục 6) có từ trước M0b; giao làn hiệu ứng.
- Worktree `games/.wt-dh-m0b` và `games/.wt-dh-codex` đã gỡ bằng `git worktree remove` (nhánh đã gộp, giữ tên nhánh). Trước khi gỡ, bằng chứng của làn M0b (gitignored) đã chuyển sang cây chính ở cùng đường dẫn tương đối: `tmp/mac-2026-10-27/m0b/` (gồm tấm mẫu cho anh ở `round2/samples/`), `tmp/m0b/`, và file trung gian `art-src/models/`. Media đã ở sẵn `public/assets/` của cây chính. `main` đã push lên `origin`.
