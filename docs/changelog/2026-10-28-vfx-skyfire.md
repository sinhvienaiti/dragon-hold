# 28–29/10/2026 · VFX bước 2: Sky Fire đủ năm pha trong 48 khung của sim

Làn V-dh, nhánh `dh-vfx` trong `games/.wt-dh-vfx`. Chuẩn: `docs/games/VFX_STANDARD.md` §5.3 phần 2, §3.3 dòng "Chiêu" (T3), §5.6. Máy và luật làn như bước 1a vòng 3 (`2026-10-28-vfx-word-attack-round3.md`): Vite `127.0.0.1:4141 --strictPort`, mọi lệnh nặng qua `.local/bin/heavy.sh`.

**Sim không đổi.** Sky Fire vẫn trúng ở khung 48 sau lúc dùng chiêu (`HERO_SKILLS.skyfire.delayMs` 800), bán kính 4 m, choáng như cũ. VFX chia 48 khung đó cho các pha. Không sửa `src/sim`, `src/content`, `src/typing`, `tests/sim`, `src/kit`; golden giữ nguyên.

**Nguồn:** phiên trước đã viết phần lớn mã (chưa commit, chưa chụp lần nào): `view/skyfire.ts`, các lớp dùng lại `view/vfx-layers.ts`, bảng màu `view/fx-palette.ts`, phần nối trong `fx.ts` và `heroes.ts`, kịch bản `dh-vfx-skyfire.mjs`. Lượt này commit nguyên trạng thành `b141b24` (WIP), rồi chụp lần đầu, sửa những gì khung ảnh cho thấy, và đo.

## 1. Tóm tắt

**Bước 2 xong phần làn tự làm** ở `389fd6d` (29/10): chụp đủ 8 tổ hợp, đo §5.6, đo hiệu năng. Còn người chấm độc lập.

Diễn biến: dừng ở `7ae38e9` / `cc0f5ad` (28/10) để làm đòn chữ vòng 4–5; `0122057` áp bài học vòng 5 (lõi cộng sáng HDR, muội dưới lớp sáng, vòng rune đậm hơn); `ce80453` sửa khung dài 240–250 ms lần đầu dùng Sky Fire (mọi hiệu ứng được vẽ một lần lúc tải); `be8d379` và `389fd6d` áp bài học vòng 6 (vật liệu lửa chung, mục 9).

- Đủ năm pha trong 48 khung: gồng f0–f11, tung đòn ở f12, bay một cung từ miệng tới đích, trúng ở f48, dư âm tới giây 7 (mục 2).
- Số đo §5.6 ở `389fd6d`: khung đầu của lóe tung đòn 100 %, của lóe trúng 99,3–100 %, của đèn 100 %; đường bay 100 % trong khung; vòm đúng 4 m; trắng xóa ≤ 0,28 %; thẻ chữ ≥ 9,79 : 1 với 3 thẻ trên màn; từ phím chiêu tới khung gồng đầu tối đa 8,7 ms (5 lần). Đầu khối lửa khi bay: xem mục 4 (thước đo hụt ở vài khung, khung ảnh cho thấy quả cầu 70–90 px).
- Hiệu năng: bench 220 quái (ném Sky Fire 4 s một lần) 5,96 / 9,0 ms, khung dài nhất 13,2 ms, không khung nào quá 50 ms.

## 2. Năm pha (f0 = lúc dùng chiêu, 60 Hz)

| Pha | Khung | Lớp (file `src/view/`) |
|---|---|---|
| A gồng | f0–f11 | Vòng rune quay dưới chân Rồng trên bệ (L13, texture `runes` của kit, `RuneCircle`); 12 đốm than bay vào miệng thành tia kéo dài (L8, `StreakSparks`), một phần bay lên từ vòng rune; ở miệng một khối lửa có viền đỏ thẫm (`PUFF_FIRE`) lớn dần, quầng ember thấp và lõi nóng HDR 1 → 3 (L9); đèn miệng tăng dần tới 35 % đỉnh lúc tung (L14); clip Cast và thân phát sáng là của `heroes.ts`; báo trước phe ta ở đích có sẵn (`telegraphs.ts`) |
| R tung | f12 (2 khung đủ sáng, rồi tắt dần) | Khối lửa `PUFF_FIRE` 3,6 m × k ở miệng, lõi trắng nhỏ 1,1 m × k, lóe vàng thấp (L10); nón lửa ngắn hướng theo đường bay, mép bị nhiễu xé (L13, `ShellPool` "cone", 10 khung); 14 tia kéo dài theo hướng phóng; khói xám từ khung 3; vòng bụi và vòng lửa chạy ra từ dưới bệ (L12); đèn 6 khung (L14); camera giật 3 px theo hướng phóng và FOV +1° trong 8 khung (L15, `fx.ts` `fovPush`, chỉ khi không giảm chuyển động); đầu Rồng giật lên (L18, `heroes.ts` `SKYFIRE_KICK`) |
| T bay | f12–f47 | Một cung bezier bậc hai từ miệng tới đích, điểm điều khiển trên trung điểm, lệch về phía camera; khối lửa `PUFF_FIRE` 2,5 m × k với lõi HDR (L9); ribbon lửa thon 1,6 m × k dọc cung (L1); ribbon khói tối mảnh đi sau (L4); than rơi, tia kéo dài rụng về sau (L8); bóng lớn dần ở đích |
| I trúng | f48–f62 | Khối nổ `PUFF_FIRE` 5,8 m × √k, lõi trắng 2,0 m × √k (L10), lõi nở 6 khung; vòm sóng bán cầu 0 → 4 m trong 12 khung, viền nóng bị ăn mòn (L2, `ShellPool` "dome"); vòng bụi phẳng 16 khung (L12); 12 viên đá, 3 viên lơ lửng 0,3 s rồi rơi (L3); 7 mảnh than phát sáng nguội dần (L5); 56 tia lửa kéo dài (L8); đèn 12 khung (L14); dừng hình T3 35 ms và trauma (L16, L15); quái lóe và giật (L17, phản ứng của `crowd`) |
| F dư âm | f63 → 7 s | Vết nứt bám địa hình, khe đỏ nguội trong 1,5 s rồi thành vết cháy tối, tắt ở giây 7 (L6, mặt nạ Voronoi sinh bằng mã, không trên mặt nước); 4 đám muội và 3 đám khói xám 1,4–1,9 s (L4); than bay lên 1,6 s (L8); sao choáng; đá nằm lại 6 s |

**Không làm:** vòng méo không khí (L7). Chuẩn chỉ bật nó ở Ultra lúc đầu, ở High chỉ khi số đo cho phép; lượt này không dựng, để giữ ngân sách High (mục 4).

## 3. Lỗi tìm thấy khi chụp lần đầu, đã sửa

- **`StreakSparks` không vẽ được tia nào** (mặt sau bị loại do chiều tam giác bị lật): sửa ở `2e6fd2c`. Sky Fire mất cả 12 đốm than lúc gồng và 56 tia lúc trúng vì lỗi này.
- **Lóe tung đòn và lóe trúng đọc màu kem** trên cỏ nắng (lõi trắng trong lóe vàng cộng sáng 3,2–6,4 m): màu giờ do khối `PUFF_FIRE` trộn thường mang, lõi trắng nhỏ (`7ddfadd`).
- **Nón lửa là một hình nêm nhạt, phẳng:** bị nhiễu xé mạnh hơn, nguội hơn, ngắn lại (`7ddfadd`).
- **Ribbon lửa khi bay chỉ là một vệt chấm mờ** sau khối lửa 2,5 m: rộng và đậm hơn (`7ddfadd`), rồi đổi sang ribbon lửa trộn thường (`7ae38e9`).
- **Vết nứt nằm trên sông** ở khúc cạn: phần decal trên mặt đất ướt mờ đi (thuộc tính `aDry` theo đỉnh, từ `FxCore.wetAt`).
- **Đèn trúng 300 cd** hắt vàng cả bãi cỏ: 220 cd (`7ddfadd`), rồi 150 cd (`cc0f5ad`, chưa chụp lại).
- **Tung đòn trễ 1 khung:** 12 bước 1/60 cộng lại hơi thiếu 12/60; thêm sai số nhỏ khi so tuổi. Test mới: năm pha trong 48 khung, đèn đủ sáng ở khung đầu, vòm trong ±10 % của 4 m.
- **Khối lửa lúc tung đòn và hạt gồng che đầu Rồng:** khối lửa dời ra 1,5 m × k theo hướng phóng, lõi trắng chỉ 1 khung (`7ae38e9`); hạt gồng bằng cỡ đầu ở hàm (`cc0f5ad`).
- **Kịch bản chụp:** một tổ hợp mà trang chưa sẵn sàng thì chụp lại; điểm chiếu không được ở cận cảnh bị bỏ khỏi khung cắt.

## 4. Số đo (§5.6)

Cảnh: seed 20261028, đợt 1, Sky Fire dùng vào điểm của con quái có nhiều quái quanh nhất (luật của sim): (−18,0; 0,58), sát khúc cạn của sông, trên bản đồ đã gộp. "Trước" là Sky Fire của Dragonhold main `4f61c6e` (khối lửa rơi từ trên đích), đo lại tại đúng điểm lóe và điểm trúng của bản sau. "Sau" là `389fd6d`.

| Tổ hợp | Tung đòn: khung đầu / đỉnh | Trúng: khung đầu / đỉnh (trước → sau) | Đèn R / I | Đường bay trong khung | Vòm / luật 4 m | Trắng xóa (trước → sau) | Thẻ chữ p01 (số thẻ) | Draw call rảnh → tối đa |
|---|---|---|---|---|---|---|---|---|
| 1280x720 chơi nắng | 1 | 1 → 0,995 | 1 / 1 | 100 % | 1 | 0,06 % → 0,08 % | 9,79 (3) | 63 → 77 |
| 1280x720 chơi tối | 1 | 1 → 1 | 1 / 1 | 100 % | 1 | 0,06 % → 0,06 % | 10,09 (3) | 63 → 77 |
| 1280x720 cận nắng | 1 | không có → 1 | 1 / 1 | 100 % | 1 | 0,23 % → 0,27 % | 9,79 (3) | 63 → 77 |
| 1280x720 cận tối | 1 | không có → 1 | 1 / 1 | 100 % | 1 | 0,23 % → 0,23 % | 10,21 (3) | 63 → 77 |
| 1920x1080 chơi nắng | 1 | 1 → 1 | 1 / 1 | 100 % | 1 | 0,07 % → 0,08 % | 9,82 (3) | 63 → 77 |
| 1920x1080 chơi tối | 1 | 1 → 0,993 | 1 / 1 | 100 % | 1 | 0,07 % → 0,07 % | 9,96 (3) | 63 → 77 |
| 1920x1080 cận nắng | 1 | không có → 1 | 1 / 1 | 100 % | 1 | 0,25 % → 0,28 % | 9,79 (3) | 63 → 77 |
| 1920x1080 cận tối | 1 | không có → 1 | 1 / 1 | 100 % | 1 | 0,25 % → 0,25 % | 10,41 (3) | 63 → 77 |

- Lóe tung đòn của bản trước: không có (không có gì ở miệng Rồng).
- Lõi trắng lúc trúng 14–31 px đường kính, bằng 0,11–0,13 đường kính vòm 4 m trên màn (≤ 30 %).
- **Đầu khối lửa khi bay ở 720p:** ≥ 54 × 55 px ở mọi khung của 6 tổ hợp. Ở camera chơi nền nắng, khung f016–f018 thước đo chỉ đọc 6–17 px; ở 1080p cận nắng, khung f036 đọc 9 × 4 px. Khung ảnh của chính các khung đó cho thấy quả cầu lửa rõ 70–90 px (`final-sky2/head-measure-artefact-*.png`): tâm trắng nóng của quả cầu trùng màu với chỗ đó ở khung trước khi dùng chiêu (đá bệ sáng), nên phép loang từ tâm dừng ngay. Tôi đã sửa thước đo để bắt đầu từ điểm đổi màu nhiều nhất (như chú thích của nó ghi), nhưng chưa đủ; đây là giới hạn của thước đo, không phải của hình.
- Draw call: rảnh 63, lúc tung đòn 72, lúc trúng 75, tối đa 77 (+14; trần High +32).
- Từ phím chiêu tới khung gồng đầu (đồng hồ thật, 5 lần): tối đa 8,7 ms, trung bình 8,7 ms.

## 5. Hiệu năng

Cùng lượt với đòn chữ vòng 6 (`2026-10-29-vfx-word-attack-round6.md` mục 4), 29/10 10:20–10:25. Bench 220 quái có xương ném Sky Fire 4 s một lần:

| Bản | TB / p95 (ms) | Khung dài nhất | Khung > 50 ms | Draw call |
|---|---|---|---|---|
| Vòng 5 + sửa khung dài `ce80453` | 6,01 / 8,9 | 13,9 | 0 | 91 |
| `389fd6d` | 5,96 / 9,0 | 13,2 | 0 | 97 |

- Khung dài 240–250 ms lần đầu dùng Sky Fire (gồng f0, trúng f49) là lúc ANGLE/Metal dựng pipeline cho vật liệu lần đầu được vẽ thật. `warm()` biên dịch trước chưa đủ; giờ lúc tải mỗi kho của đòn chữ và Sky Fire được giữ một phần tử và vẽ một khung thật, rồi xóa (`ce80453`).
- `dh-perf` (trận thật, ba đợt) ở High mặc định 4,60 / 7,2 ms, không chậm hơn vòng 5 (4,57 / 7,2).

## 6. Tờ khung và clip

Dưới `games/.wt-dh-vfx/tmp/vfx/final-sky2/` (Git bỏ qua):
- `{1280x720,1920x1080}-{play,close}-{light,dark}-before-after.jpg`: hàng TRƯỚC (main `4f61c6e`) trên hàng SAU (`389fd6d`), 24 khung từ gồng tới giây 7; crop gốc trong `_crops/`;
- `…-beside-reference.jpg`: cạnh ảnh tham chiếu;
- `clip-before-4f61c6e-1920x1080.mp4`, `clip-after-389fd6d-1920x1080.mp4`;
- số đo: `report-after-389fd6d.json`, `report-before-4f61c6e.json`, `report-before-at-after-points.json`, `remeasure-after.json`;
- `head-measure-artefact-*.png`: các khung thước đo đầu khối lửa đọc hụt (mục 4).
Tờ cũ của `7ae38e9` vẫn ở `final-sky1/`. Khung thô đã dọn sau khi ghép tờ.

## 7. Bản giảm chuyển động (§3.8)

- Tắt: camera giật, đẩy FOV, đá lơ lửng (đá vẫn rơi).
- Làm dịu: lóe ×0,6 về độ sáng và ×0,8 về cỡ; số hạt và tia ×0,6; vòm, nón và khói ×0,6 độ đục; đèn ×0,8.
- Giữ: báo trước, vòm và vòng cho biết vùng trúng 4 m, vết nứt, sao choáng.

## 8. Còn mở

1. Người chấm độc lập cho Sky Fire.
2. Thước đo đầu khối lửa (`headSize`) hụt khi tâm trắng của quả cầu trùng màu nền (mục 4). Nếu cần số sạch, nên đo theo vùng màu lửa (sắc độ đỏ cam, bão hòa) thay vì khác màu so với khung trước.
3. Vòng méo không khí (L7) chưa dựng (Ultra).

## 9. Bài học vòng 5 và vòng 6 của đòn chữ, áp vào Sky Fire

- **Vòng 5 (`0122057`):** lõi cộng sáng HDR nhỏ trên thân lửa trộn thường, muội dưới mỗi lớp sáng; vòng rune nét đậm hơn.
- **Vòng 6 (`be8d379`, `389fd6d`):** cùng vật liệu lửa với đòn chữ (nhiễu cuộn, dải trắng → cam → đỏ thẫm, mép muội, cháy rụi theo nhiễu) cho nón, ribbon bay và mọi quả cầu lửa.
  - A: quả cầu đỏ cam bão hòa ở hàm, lớn tới khoảng 1,5 lần đầu, lõi nóng nhỏ; bỏ quầng cộng sáng 2,75 lần; 12 đốm than đuôi tối, rộng 0,16 m × k.
  - R: bỏ quầng cam cộng sáng 4,2 m × k; khối lửa đỏ cam 2,4 m × k quanh lõi trắng 1,3 m × k; chớp khung 0 còn 1,9 m × k; vết cháy tối 2,2 m × k trên đá dưới miệng 0,55 s; muội từ khung 1.
  - T: đầu là quả cầu màu than hồng bão hòa (màu cam nhạt cũ cháy thành trắng đào, đúng màu bệ đá); quầng quanh đầu 1,8 m × k thay vì 2,8.
  - I: muội đi cùng lớp sáng ngay khung trúng; quầng cam rộng nhất 4,6 m × √k, đặt sát đất, không nâng về phía camera; 14 đốm than đuôi tối rơi theo trọng lực, thêm 8 hạt tròn.
  - F: muội dày từ khung 2–5 (trước: 4–7).
