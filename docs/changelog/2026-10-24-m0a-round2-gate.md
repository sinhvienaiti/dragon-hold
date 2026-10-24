# 24/10/2026 · M0a vòng 2: kiểm cổng

Bước cổng sau vòng 2. Bốn người kiểm chạy độc lập trên `fde122e`: kiểm tĩnh, trình duyệt phần A, trình duyệt phần B, cân bằng. Bước gộp sửa các lỗi nhỏ họ tìm ra, chạy lại đúng các kiểm bị ảnh hưởng, rồi commit `6f53601`. Máy đo: Mac Apple M4, Chrome 155, Node 24. Lúc chạy lại, máy có tải trung bình khoảng 22 vì bộ bot của các workflow khác chạy cùng.

**Kết luận ngắn.** Kiểm tĩnh, tất định và trình duyệt đều đạt. Không còn lỗi nào làm hỏng cổng. Cân bằng: G1, G3, G5, G6, G9 đạt. B2–B6 và B8 đạt. **B1 và B7 vẫn trượt, cả hai vì Nhàn I** (bot Chuẩn 20,5 %, dải ≤ 10 %). B9 cần buổi chơi thử của anh.

## Sửa trong bước cổng (commit `6f53601`)

| Mục | Ai tìm | Sửa | Kiểm lại |
|---|---|---|---|
| Trạng thái băm chứa số thực: `director.band.n` là 0,3, 1, 0,2 ở Dễ và Thường | Kiểm tĩnh | `HASH_SKIP` (nay được export) bỏ `band` và `table` của bộ điều nhịp, vì đó là cấu hình tĩnh. Độ khó vẫn vào mã băm qua `world.difficulty`. Golden ghi lại; log lệnh không đổi | Test mới quét cả world (cả Set, mảng số thực) ở Dễ, Thường, Khó và sau trọn một ải: 0 số thực. Đổi độ khó hoặc tắt bộ điều nhịp vẫn đổi mã băm. Bot 18/18 cùng tick, số lệnh, kết quả. Báo cáo bot 40 seed khớp từng số |
| Thẻ Ôn lộ đáp án qua thẻ chữ đang vỡ của từ vừa giết | Trình duyệt A | Khi Thẻ Ôn hoặc Học trước mở, lớp thẻ chữ ẩn đi; thẻ đang rời và tia chữ dừng ngay (`src/ui/tags.ts`, `src/app/app.ts`) | Đầu dò của người kiểm A ở 1080p: 4 lần nghỉ, 48 mẫu, 0 thẻ chữ thấy dưới thẻ Ôn (lượt trước lộ "kind"). Trong đợt vẫn có thẻ chữ. `dh-learning-frame`: 0 chỗ lộ |
| Câu "Bấm … lần nữa để mua" còn sau khi mua, ghi giá cũ | Trình duyệt A | Mua xong thì xóa câu nhắc (`src/ui/shop-strip.ts`) | `dh-placement` 720p và 1080p: `staleNotice: false`, dòng thông tin về "Phím 1–8 chọn món" |
| Chữ dải món tràn ô ở 720p ("Thiếu 28", "Bom Hạt"); thẻ đợt lúc bày binh xuống hai dòng | Trình duyệt A | Lý do "Thiếu …" được xuống dòng trong ô; câu nhắc bày binh ngắn lại thành "Đặt bẫy, lính, nhà trước" | `dh-placement` đo tràn chữ: 0 ô tràn lúc nghỉ đợt 3 và sau khi mua, ở cả hai cỡ. Ảnh: chữ nằm trọn trong ô, câu nhắc một dòng |
| Cảnh báo build: `view/stage.ts` vừa import động vừa import tĩnh | Kiểm tĩnh | `main.ts` import tĩnh (app.ts vốn đã import tĩnh) | `vite build`: hết cảnh báo; `index` 505,32 kB, `three` 561,77 kB |
| Báo cáo bot không tô đậm N và Q khi ra ngoài dải | Cân bằng | `scripts/balance/report.ts` tô cả N và Q; ghi chú B1 chỉ xét Thắng, S, P, I, O | `tmp/gate-r2/balance.md` |
| `dh-scale` chưa lần nào gặp sói | Trình duyệt B | Bot gõ hết khi máu Rồng dưới 60 %, nên lượt chạy sống tới đợt 7. Báo cáo ghi đợt và pha cuối, `ok` sai nếu thiếu loài | 1080p: thấy đủ 7 loài, thắng đợt 10, máu còn 56 % |
| `dh-telegraphs` 720p chụp sói lúc báo trước đã tắt | Trình duyệt B | Một bộ canh trong trang (mỗi khung) giảm tốc thế giới đúng lúc đòn bắt đầu báo. Ảnh chỉ tính khi `live ≥ 1` | 720p: `ok`, 6/6 ảnh có báo trước đang hiện, 0 lần hụt |
| `LANES.md` ghi danh sách khóa băm cũ | Bước gộp | Ghi theo `HASH_SKIP` | |

Golden mới: idle `192d89a9` → `61222e57`, b35-seed1 `4181e99c` → `8b16e8be`, noTyping-seed2 `4dd33565` → `f1f9e5ab`. Chỉ mã băm đổi, vì `band` không còn trong mã băm. Hành vi sim không đổi.

## Bảng cổng

| Cổng | Ngưỡng | Đo được | Kết quả |
|---|---|---|---|
| Kit | `verify-kit` khớp sha256 | 73 file khớp, kit tại `339e6dac`. `sync-game-kit --check`: cả ba game OK | đạt |
| Kit vitest | xanh | 275/275, 36 file (kit không đổi trong bước này) | đạt |
| Kiểu | `npx tsc --noEmit` | 0 lỗi | đạt |
| Test | `npx vitest run` | 351/351, 41 file (thêm 2 test băm) | đạt |
| Build | xanh, không cảnh báo | xanh, 0 cảnh báo | đạt |
| Golden | cùng seed ra cùng mã | 3 ca, kiểm lại "giữ nguyên"; `--fresh-deck` không đổi bộ từ | đạt |
| Ranh giới | sim, typing, content thuần | 8/8 test. Quét thêm 32 file thuần và 57 file trong chuỗi import: 0 vi phạm | đạt |
| Tất định | cùng seed, lệnh, header ra cùng mã | 6 bot × Dễ/Thường/Khó (seed 11): 18/18 khớp mỗi 600 tick và mã cuối, trước và sau bản sửa. Đổi seed, độ khó, WPM, độ chuẩn, CV hoặc bộ điều nhịp thì mã tick 0 đổi | đạt |
| Trình duyệt | kịch bản `dh-*`, 0 lỗi console | 8 lượt phần A, 14 lượt phần B, 8 lượt chạy lại: 0 lỗi console, 0 exception, 0 tải hỏng | đạt |
| Phát lại trong trình duyệt | cùng mã băm | 6/6 lượt chạy lại khớp (`dh-words` 4, `dh-keyboard-only`, đầu dò Thẻ Ôn); phần A cũng khớp mọi lượt | đạt |
| Hiệu năng | 720p không khóa khung | TB 2,84–4,04 ms, p95 4,1–7,1 ms, tối đa 21,2 ms, 30–33 draw call (phần B) | đạt |
| Bench khối tạm | 220 quái | nền vẽ: TB 4,53 ms, p95 7,5 ms, 40 draw call | đạt (bench có xương vẫn chờ GLB) |
| Sức chạy sim | ≤ 0,3 ms một bước, ≥ 200× | p99 ≤ 0,06 ms, ≥ 2.816× thời gian thực | đạt |
| G1 | 35 WPM thắng 75–90 % | 85 % (bộ A 90 %, bộ B 80 %) | đạt |
| G3 | 25 WPM thắng ≥ 70 % | 90 % | đạt |
| G5 | chỉ gõ thắng ≤ 40 % | 0 % | đạt |
| G6 | không gõ thua trước hết đợt 3 | 40/40 thua ở đợt 1 | đạt |
| G7 | Chuẩn hạ quái nhanh hơn Ẩu | 4,19 s so với 5,23 s | đạt (đo gần đúng qua B4) |
| G9 | tải đỉnh ≤ 1,40; chữ sống ≤ 16 | 1,39; 7 | đạt |
| B1 | Cân bằng: Mới tới Nhanh trong dải | I 16,4–35,3 % (≤ 10) ở cả 6 bot | **trượt** |
| B7 | tắt bộ điều nhịp, Chuẩn vẫn trong dải | Chuẩn thắng 80 %, S 65,3 %, **I 21,6 %** | **trượt** |
| B9 | khớp người thật | chưa có buổi chơi thử | thiếu số |
| Chủ dự án | chơi 10 đợt, nói "đạt" | chưa | chờ anh |

G2 (3 sao ≤ 60 %, áp dụng từ C3): 20 %, chỉ tham khảo. G4 không áp dụng (M0 không có ải boss). G8 30,1 % đạt theo định nghĩa hẹp (xem mục cần quyết). G16 166,9 s trượt, chưa là cổng M0.

## Cân bằng: B1–B9

`pnpm dh:balance`, 15 bot × 3 chế độ × 40 seed (bộ A 20261023…042, bộ B 21261026…045), 1.800 lượt. Bước gộp chạy lại sau bản sửa băm: mọi số khớp, chỉ khác thời gian chạy.

| # | Kết quả | Số đo chính |
|---|---|---|
| B1 | **trượt** (cả bộ A và B) | 6/6 bot có I cao. Ngoài I: Nhanh thắng 100 % (> 90), Khá 72,5 % (< 75), Mới S 67,6 % (> 65) |
| B2 | đạt | Không bot nào vừa S ≥ 90 % vừa I ≥ 20 % |
| B3 | đạt | Mới thắng 78 % ở Cân bằng; Trẻ em thắng 98 % ở Thư giãn |
| B4 | đạt | S Chậm chắc 63,6 % > Ẩu 57,7 %; hạ quái 4,19 s < 5,23 s |
| B5 | đạt | Không gõ thắng 0 % ở cả 3 chế độ |
| B6 | đạt | Tốt so với Kém: Cân bằng 85 % và 48 %, Thử thách 73 % và 18 % |
| B7 | **trượt** | Bậc nhịp ≤ 1,21 mỗi đợt, khoảng sinh 86–114 %: đạt. Tắt bộ điều nhịp: I 21,6 %, S 65,3 % |
| B8 | đạt | Cổng học đạt ở mọi bot và mọi chế độ |
| B9 | thiếu số | cần buổi chơi thử |

## Cân bằng: bảng BALANCE §3

Gộp 40 seed. Ô **đậm** là ngoài dải, chấm cả N và Q.

**Cân bằng** (mức Thường). Dải: Thắng 75–90 · S 35–65 · P 15–35 · I ≤ 10 · O ≤ 8 · N 0,3–1 · Q 50–70

| Bot | Thắng | S | P | I | O | N | Q |
|---|---|---|---|---|---|---|---|
| b0 | **0** | **0** | **62** | 4,0 | 0 | **0,00** | 63 |
| b25 | 90 | **77,1** | 20 | **18,8** | 0 | 0,33 | **40** |
| b35 (Chuẩn) | 85 | 57,2 | 21 | **20,5** | 0 | 0,50 | **39** |
| b60 | **98** | 57,8 | 25 | **33,0** | 0 | **0,20** | **40** |
| typingOnly | **0** | **0** | 25 | **17,5** | 0 | 0,45 | **48** |
| noTyping | **0** | **0** | **70** | 4,5 | 0 | **0,00** | 80 |
| child | **3** | **0** | **40** | 7,2 | 0 | **1,35** | **91** |
| novice (Mới) | 78 | **67,6** | 24 | **16,6** | 0 | 0,82 | **42** |
| steady (Chậm chắc) | 90 | 63,6 | 20 | **18,8** | 0 | **0,15** | **40** |
| skilled (Khá) | **73** | 40,0 | 24 | **26,6** | 0 | **1,18** | **38** |
| sloppy (Ẩu) | 75 | 57,7 | 24 | **16,4** | 0,2 | 0,63 | **38** |
| fast (Nhanh) | **100** | 61,4 | 22 | **35,3** | 0 | **0,07** | **39** |
| b35good | 85 | 61,4 | 19 | **20,3** | 0 | 0,42 | **41** |
| b35poor | **48** | **0** | 22 | **19,1** | 0 | **2,42** | **48** |
| b35off (tắt nhịp) | 80 | **65,3** | 21 | **21,6** | 0 | **0,20** | **38** |

**Thư giãn** (mức Dễ). Dải: Thắng ≥ 92 · S ≥ 70 · P 5–15 · I ≤ 20 · O ≤ 3 · N ≤ 0,2 · Q ≤ 45

| Bot | Thắng | S | P | I | O | N | Q |
|---|---|---|---|---|---|---|---|
| b0 | **0** | **0** | **69** | 3,2 | 0 | 0 | **62** |
| b25 | 100 | 96,8 | **16** | **26,8** | 0 | 0 | 38 |
| b35 | 100 | 98,6 | **20** | **33,0** | 0 | 0 | 37 |
| b60 | 100 | 98,0 | **24** | **44,5** | 0 | 0 | 43 |
| typingOnly | **85** | **34,4** | 15 | **27,9** | 0 | **1,07** | **46** |
| noTyping | **0** | **0** | **69** | 4,2 | 0 | 0,15 | **72** |
| child | 98 | 96,8 | **30** | 13,4 | 0 | **1,82** | **55** |
| novice | 100 | 96,7 | **17** | **25,2** | 0 | 0 | 38 |
| steady | 100 | 96,6 | **16** | **27,0** | 0 | 0 | 37 |
| skilled | 100 | 99,5 | **22** | **38,6** | 0 | 0 | 36 |
| sloppy | 100 | 98,4 | **19** | **23,4** | 0,1 | 0 | 35 |
| fast | 100 | 98,3 | **22** | **46,7** | 0 | 0 | 43 |
| b35good | 100 | 98,7 | **18** | **32,9** | 0 | 0 | 39 |
| b35poor | 100 | 93,2 | **22** | **27,7** | 0 | 0 | **47** |
| b35off | 100 | 98,6 | **18** | **34,5** | 0 | 0 | 41 |

**Thử thách** (mức Khó). Dải: Thắng 50–75 · S 15–45 · P 30–50 · I ≤ 5 · O ≤ 15 · N 1–2 · Q 60–80

| Bot | Thắng | S | P | I | O | N | Q |
|---|---|---|---|---|---|---|---|
| b0 | **0** | **0** | **60** | 3,8 | 0 | **0,00** | 63 |
| b25 | **88** | **64,0** | **22** | **16,1** | 0 | **0,65** | **42** |
| b35 | 65 | **47,1** | **25** | **15,9** | 0 | **0,95** | **40** |
| b60 | **100** | **56,8** | **25** | **28,8** | 0 | **0,33** | **38** |
| typingOnly | **0** | **0** | **28** | **15,8** | 0 | **0,33** | **48** |
| noTyping | **0** | **0** | **71** | 4,6 | 0 | **0,00** | 68 |
| child | **0** | **0** | 42 | **7,1** | 0 | 1,07 | **98** |
| novice | 55 | 44,8 | **28** | **14,4** | 0 | 1,00 | **48** |
| steady | 75 | **54,8** | **24** | **15,7** | 0 | **0,78** | **43** |
| skilled | 65 | 38,1 | **25** | **22,3** | 0 | **0,78** | **41** |
| sloppy | 60 | 41,9 | **28** | **13,9** | 0,2 | **0,97** | **41** |
| fast | **100** | **60,2** | **22** | **31,7** | 0 | **0,07** | **37** |
| b35good | 73 | **55,6** | **21** | **16,5** | 0 | **0,65** | **41** |
| b35poor | **18** | **0** | **24** | **15,7** | 0 | 1,95 | **50** |
| b35off | **80** | **65,3** | **21** | **19,4** | 0 | **0,33** | **38** |

**Nhàn I của bot Chuẩn ở Thường, tách theo nguyên nhân** (bộ A / bộ B, tổng 21,0 % / 20,3 %):

- 11,7 % / 11,1 %: quái đang đi ngoài Vùng Chữ, chưa có chữ để gõ. Đợt 1 lên tới 23 %.
- 4,1 % / 4,2 %: đầu đợt, chữ đầu chưa tới (1,3–3,2 s).
- 3,6 % / 3,5 %: đòn đang bay, hoặc chờ nhịp chia từ 0,25 s.
- 1,6 % / 1,5 %: quãng trống giữa hai toán quái.

Bot Nhanh nhàn 35,7 %, trong đó 22,1 % là quái đi ngoài vùng, vì k bị chặn ở 1,30.

## Kịch bản trình duyệt

Phần A ở cổng 3005, phần B ở cổng 3015, bước gộp chạy lại ở cổng 3005. Mỗi lúc chỉ một Chrome của mỗi người.

| Kịch bản | Cỡ | Số đo chính | Ai chạy |
|---|---|---|---|
| `dh-words` | 720p, 1080p × thẻ 100 %, 150 % | 4 lượt, mỗi lượt 29 từ và 52 quái. 0 thẻ chồng, 0 thiếu, 0 thừa. Chữ nhỏ nhất 16 / 24 / 20 / 30 px, dòng nghĩa 13 / 18,2 / 15,2 / 22,8 px. p95 khung 16,8 ms. Trễ phím TB 11,7–13,7 ms, tối đa 63,8 ms (một mẫu lúc máy tải nặng; lượt phần A tối đa 45,5 ms). Phát lại 4/4 | A, chạy lại |
| `dh-learning-frame` | 720p, 1080p | Từ mới ghim 2.637 / 2.662 ms (≥ 2,5 s). 0 thẻ và 0 số đè khung học. IPA dùng Noto Sans. Thẻ Ôn: 0 chỗ lộ, đồng hồ đứng, +30 Vàng; thẻ Ôn và thẻ đợt che 0 px đường, 0 px² ô đặt | A, chạy lại |
| Đầu dò Thẻ Ôn (`tmp/test-browser-a/swarm-capture.mjs`) | 1080p | 4 lần nghỉ, 48 mẫu: 0 thẻ chữ dưới thẻ Ôn. Kiến 8–9 px mỗi con, vòng bầy khoảng 100 px; lính 43 × 36 px. Phát lại khớp (347 lệnh) | A, chạy lại |
| `dh-hitstop-keys` | 720p | 115/115 phím tới sim, mất 0, 114 khung dừng hình, trễ tối đa 18,7 ms (≤ 70) | A |
| `dh-placement` | 720p, 1080p | Ô đặt 17 / 0 / 17 (bày binh, trong đợt, nghỉ). 3 món bằng chuột, 2 bằng phím, nâng và bán bằng phím. Phím 6, 7, 8 mua đủ (205 → 25 Vàng); bấm một lần không trừ vàng. Câu nhắc cũ: 0. Chữ tràn ô: 0. Thẻ đợt che 0 / 0, "+Vàng" chồng số Vàng 0 px² | A, chạy lại |
| `dh-focus` | 720p | Bấm HUD, dải món, thẻ đợt, canvas: 4/4 phím vẫn tới. Mất focus trong đợt, ẩn tab 10 s, menu dừng: sim chạy 0 tick. Có đếm 3-2-1 | A |
| `dh-keyboard-only` | 720p, ×4, phím Mac | Thắng 10/10 đợt trong 196 s: 168 từ, 266 quái, 167 hoàn hảo. Học trước 8 từ, 9 lần nghỉ, 9 thẻ Ôn, 6 lần Tab, ba sao. Phát lại khớp (837 lệnh). Trễ phím TB 13,2 ms; tối đa 140,6 ms trùng một khung 100 ms lúc máy tải 22 (lượt phần A tối đa 20,3 ms) | A, chạy lại |
| `dh-telegraphs` | 720p, 1080p | 720p chạy lại: 5 báo trước của địch, 1 vòng của ta, G01 cắm cờ 2 lần, ngắn nhất 500 ms, 6/6 ảnh có báo trước đang hiện, 0 lần hụt. 1080p (phần B): 6/6, đỏ, có huy hiệu "!" | B, chạy lại |
| `dh-scale` | 1080p | Chạy lại: đủ 7 loài, thắng đợt 10. Trung vị (dải): lính 42 (40–60), kiến 30 (18–40), ong 46 (36–60), cung 45 (40–62), heo 54 (46–76), G01 63 (60–100), sói 65 (40–62, trong sai số 20 %). Vòng bầy trung vị 120 px | B, chạy lại |
| `dh-camera` | 720p | 3 góc nghiêng × 4 hướng, không thấy mép thế giới | B |
| `dh-restart` | 720p | 9 lần chơi lại: texture 20 → 20, chương trình shader 56 → 58 một lần rồi đứng yên; mỗi lớp giao diện chỉ một bản | B |
| `dh-perf` | 720p | xem bảng cổng | B |
| `dh-bench` | 720p, 220 quái | nền phẳng TB 1,44 ms, p95 3,0 ms; nền vẽ TB 4,53 ms, p95 7,5 ms, tối đa 11,6 ms | B |

## Ảnh và điều ảnh cho thấy

Mọi ảnh nằm trong `tmp/` (không vào Git). Bước gộp đã mở xem các ảnh đánh dấu ✓.

| Ảnh | Cho thấy |
|---|---|
| ✓ `tmp/gate-r2/shots/kb/kb-05-review.png` | Thẻ Ôn sau đợt 2, không còn thẻ chữ cũ. Ảnh cùng bước trước sửa, `tmp/test-browser-a/shots/kb-05-review.png`, còn đọc rõ "want / muốn" |
| `tmp/test-browser-a/shots/review-leak-1920x1080-4-0.png` | Trước khi sửa: chữ k, i, n, d của "kind" (đáp án) còn dưới thẻ Ôn |
| ✓ `tmp/gate-r2/shots/frame/frame-review-1920x1080.png` | Thẻ Ôn ở 1080p, góc phải trên, không che đường và ô đặt, không có thẻ chữ |
| ✓ `tmp/gate-r2/shots/kb/kb-06-break-shop.png` | Sau khi mua Bình Máu Nhỏ, dòng thông tin trở về "Phím 1–8 chọn món"; "Thiếu 13" xuống dòng trong ô |
| ✓ `tmp/gate-r2/shots/place-break3-1280x720.png` | Dải món ở 720p: tên dài xuống 2–3 dòng, nằm trọn trong ô |
| ✓ `tmp/gate-r2/shots/place-mouse-spikes-1280x720.png` | Thẻ đợt lúc bày binh, câu nhắc một dòng; Gai Chông đặt ở đầu cầu |
| ✓ `tmp/gate-r2/shots/telegraphs/telegraph-blight-wolf-1280x720.png` | Sói vồ qua Vệ Binh Rêu trên cầu, báo trước đỏ và huy hiệu "!" đang hiện |
| ✓ `tmp/gate-r2/shots/scale/scale-blight-wolf-1920x1080.png` | Hai sói (khối dài, thấp, nâu đỏ) trên Đường Cầu ở đợt 7 |
| ✓ `tmp/test-browser-a/shots/swarm-w1-midtype-1920x1080.png` | Bầy kiến tím có vòng cụm và thẻ "∵ good". Màn còn thưa: cùng lúc chỉ vài quái |
| ✓ `tmp/test-browser-a/crops/dais-1080.png` | Bạch Long thân trắng, cánh lông đỏ cam, chân tay đỏ sẫm; Hỏa Long nâu đỏ. Hết lỗi Bạch Long nâu đỏ |
| ✓ `tmp/test-browser-b/crops/tele1080-sheet.jpg` | Báo trước đỏ ở 1080p, có huy hiệu "!": cung của lính sát bệ, vạch từ cầu tới bệ, vạch húc của heo ở chỗ lội; khung đợt 5 có G01 với vòng hào quang vàng |
| `tmp/test-browser-b/crops/camera-sheet.jpg` | 12 góc camera, không thấy mép thế giới |
| `tmp/test-browser-b/shots/look/07-results-victory-*.png`, `08-results-defeat-*.png` | Màn kết: thắng ba sao với Sổ Từ Ải; thua có gợi ý và nút "Thử lại" |
| ✓ `tmp/test-browser-a/shots/hitstop-storm-1280x720.png` | Còn mở: hai số "HOÀN HẢO" chạm nhau sát mép trên |
| ✓ `tmp/test-browser-b/crops/general-default-zoom.png` | Còn mở: G01 là khối nhộng ô liu to, không cờ; vòng hào quang vàng úa gần chìm trên cỏ nắng |
| `tmp/test-browser-b/shots/telegraphs/telegraph-thorn-wasp-1920x1080.png` | Còn mở: thẻ "help" che khoảng 40 % vòng chích của ong sát bệ |

## Còn mở

Không mục nào dưới đây làm hỏng cổng đo được, trừ B1 và B7.

**Cần anh quyết**

1. **Nhàn I (B1, B7).** Phần lớn là quái đi ngoài Vùng Chữ (11 điểm). Chỉ bỏ 0,2 s đòn bay khỏi I thì còn khoảng 17 %. Chọn một trong bốn: (a) đổi FlowMeter của kit (chỉ tính quãng nhàn ≥ 1 s, hoặc tính đòn bay là bận); (b) dải I riêng ≤ 20 % ở Cân bằng cho Rồng Giữ Ải; (c) tải đợt giữa 1,05–1,10, đỉnh ≤ 1,25, đợt 1 ≤ 0,75; (d) giảm phần sát thương không do gõ xuống 20–25 %.
2. **G8 theo định nghĩa nào.** Báo cáo chỉ tính bẫy và lính (30,1 %). Gõ gây 54,1 % sát thương, trong khi DESIGN trụ 1 cần 65–80 %. Nếu tính cả kỹ năng là "không do gõ" thì 45,9 %, vượt trần 40 %.
3. **Nhanh thắng 100 %, b60 thắng 98 %** vì trần k 1,30. Khá chỉ thắng 72,5 %, 8 trong 11 lần thua ở đợt 8.
4. **Người gõ chậm có S cao hơn Chuẩn:** b25 77 %, Mới 67,6 %, Chậm chắc 63,6 %, Chuẩn 57 %. Ở Thử thách, b25 thắng 88 % còn Chuẩn 65 %. Có thể k giãn quá tay cho người chậm.
5. **Chế độ gần như không đổi áp lực P:** b35 có P 20 / 21 / 25 % ở Thư giãn / Cân bằng / Thử thách. Q 37–48 % ở mọi bot gõ, dưới dải 50–70 của Cân bằng.
6. **B6 đạt, nhưng chiến thuật Tốt không hơn Vừa ở Cân bằng** (cùng 85 %). Chỉ chiến thuật Kém bị phạt.
7. **Máu Rồng mất gần như toàn do Héo lan** (b35: 1.474,5 trên khoảng 1.506 mỗi ải). Khi tắt bộ điều nhịp, Chuẩn thua dồn ở đợt 4 (7/8 lần thua).
8. **Trận vẫn thưa:** bot Chuẩn tối đa 12 quái sống, mọi bot tối đa 17 (trần 20). Trình duyệt thấy tối đa 9 quái và 1–3 thẻ chữ cùng lúc. Mục tiêu "16 chữ sống" của 05 §10 chưa thử được ở M0a.
9. **B9:** cần anh chơi thử 10 đợt (các bước ở `2026-10-23-m0a.md`, mục "Anh nên thử").

**Việc nhỏ cho làn sau**

- **Hình (view):** G01 chưa mang cờ, chưa có cột sáng khi cắm cờ (05 ghi "mang cờ; cột sáng màu hào quang, tên chiêu 1 s"). `src/view` chưa vẽ sự kiện `banner`. Màu hào quang `#C8D24A` gần màu cỏ.
- **UI:** số sát thương cạnh nhau có thể chạm nhau, vì vùng cấm chỉ đọc lại mỗi 250 ms (`PROTECT_EVERY_MS`). Menu ô ở 1080p mở đè lên bệ, che Hỏa Long. Thẻ vòng quanh bệ (chỗ cố định, 05 §4.3) che một phần vòng báo trước của ong sát bệ.
- **Golden phủ hẹp:** chỉ mức Thường với bộ điều nhịp bật, b35-seed1 chỉ tới đợt 3, không log nào có lệnh `release` (Esc). Luật Esc mới chỉ do unit test giữ. Nên thêm một ca Khó, tắt bộ điều nhịp, có Esc (làn bot-balance).
- **`src/sim/world.ts` import cả barrel `../kit/platform`** chỉ để lấy `createRng`. Barrel kéo theo `frame-loop.ts` và `safe-storage.ts`, nhưng sim không gọi tới. `boundary.test.ts` bỏ qua `src/kit`.
- **Tham khảo, seed 11:** b35 ở Khó thua ở đợt 7 khi bật bộ điều nhịp, còn b35off thì thắng. Bộ bot 40 seed cho cùng chiều: Thử thách b35 65 %, b35off 80 %.

## Bằng chứng

- Kiểm tĩnh: `tmp/test-static/`
- Trình duyệt A: `tmp/test-browser-a/`
- Trình duyệt B: `tmp/test-browser-b/`
- Cân bằng: `tmp/test-balance/` (`full.md`, `setA.md`, `setB.md`, `anatomy-*.txt`)
- Bước gộp: `tmp/gate-r2/` (`balance.md` 40 seed sau bản sửa, `determinism.json`, JSON và ảnh của 8 lượt chạy lại, `rerun.log`)

Dọn dẹp: Vite 3005 của bước gộp đã tắt, không còn Chrome nào của bước gộp. Các Chrome và `cdp-run` khác đang chạy là của workflow khác.
