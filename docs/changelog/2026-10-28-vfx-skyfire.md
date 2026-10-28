# 28/10/2026 · VFX bước 2: Sky Fire đủ năm pha trong 48 khung của sim

Làn V-dh, nhánh `dh-vfx` trong `games/.wt-dh-vfx`. Chuẩn: `docs/games/VFX_STANDARD.md` §5.3 phần 2, §3.3 dòng "Chiêu" (T3), §5.6. Máy và luật làn như bước 1a vòng 3 (`2026-10-28-vfx-word-attack-round3.md`): Vite `127.0.0.1:4141 --strictPort`, mọi lệnh nặng qua `.local/bin/heavy.sh`.

**Sim không đổi.** Sky Fire vẫn trúng ở khung 48 sau lúc dùng chiêu (`HERO_SKILLS.skyfire.delayMs` 800), bán kính 4 m, choáng như cũ. VFX chia 48 khung đó cho các pha. Không sửa `src/sim`, `src/content`, `src/typing`, `tests/sim`, `src/kit`; golden giữ nguyên.

**Nguồn:** phiên trước đã viết phần lớn mã (chưa commit, chưa chụp lần nào): `view/skyfire.ts`, các lớp dùng lại `view/vfx-layers.ts`, bảng màu `view/fx-palette.ts`, phần nối trong `fx.ts` và `heroes.ts`, kịch bản `dh-vfx-skyfire.mjs`. Lượt này commit nguyên trạng thành `b141b24` (WIP), rồi chụp lần đầu, sửa những gì khung ảnh cho thấy, và đo.

## 1. Tóm tắt

**Bước 2 đang dừng giữa chừng** (điều phối viên, 29/10: làm đòn chữ vòng 5 trước). Trạng thái ở `7ae38e9` đã chụp đủ 8 tổ hợp và đo; `cc0f5ad` (hạt gồng bằng cỡ đầu, đèn trúng 150 cd) chưa chụp lại. Chưa có người chấm độc lập, chưa đo hiệu năng.

- Đủ năm pha trong 48 khung: gồng f0–f11, tung đòn ở f12, bay một cung từ miệng tới đích, trúng ở f48, dư âm tới giây 7 (mục 2).
- Số đo §5.6 ở `7ae38e9`: khung đầu của lóe tung đòn 100 %, của lóe trúng 98,5–100 %, của đèn 100 %; đường bay 100 % trong khung ở cả hai cỡ; vòm đúng 4 m (tỉ lệ 1,00); trắng xóa ≤ 0,24 %; thẻ chữ ≥ 9,94 : 1 với 2–3 thẻ trên màn; từ Alt + 2 tới khung gồng đầu tiên tối đa 8,7 ms, trung bình 6,9 ms (5 lần).
- Bài học của đòn chữ vòng 3–4 đã áp một phần (khối lửa trộn thường có viền, ribbon lửa trộn thường, lõi trắng nhỏ). Bài học vòng 5 (lõi nóng HDR ngoài tone map, lớp tối bên dưới) chưa áp.

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

Cảnh: seed 20261028, đợt 1, Sky Fire dùng vào điểm của con quái có nhiều quái quanh nhất (luật của sim), cùng chỗ ở mọi bản dựng: (−18,0; 0,58), sát khúc cạn của sông. "Trước" là Sky Fire của `25160fe` (khối lửa rơi từ trên đích), đo lại tại đúng điểm lóe và điểm trúng của bản sau.

| Tổ hợp | Tung đòn: khung đầu / đỉnh | Trúng: khung đầu / đỉnh (trước → sau) | Đèn R / I | Đường bay trong khung | Vòm / luật 4 m | Trắng xóa (trước → sau) | Thẻ chữ p01 (số thẻ) | Draw call rảnh → tối đa |
|---|---|---|---|---|---|---|---|---|
| 1280x720 chơi nắng | 1 | 1 → 1 | 1 / 1 | 100 % | 1 | 0,060 % → 0,060 % | 9,940 (3) | 55 → 68 |
| 1280x720 chơi tối | 1 | 1 → 0,985 | 1 / 1 | 100 % | 1 | 0,050 % → 0,050 % | 10,160 (3) | 55 → 68 |
| 1280x720 cận nắng | 1 | None → 1 | 1 / 1 | 100 % | 1 | 0,210 % → 0,220 % | 9,970 (3) | 55 → 68 |
| 1280x720 cận tối | 1 | None → 1 | 1 / 1 | 100 % | 1 | 0,180 % → 0,200 % | 10,270 (3) | 55 → 68 |
| 1920x1080 chơi nắng | 1 | 1 → 1 | 1 / 1 | 100 % | 1 | 0,070 % → 0,070 % | 9,940 (3) | 55 → 68 |
| 1920x1080 chơi tối | 1 | 1 → 1 | 1 / 1 | 100 % | 1 | 0,060 % → 0,060 % | 9,980 (3) | 55 → 68 |
| 1920x1080 cận nắng | 1 | None → 1 | 1 / 1 | 100 % | 1 | 0,230 % → 0,240 % | 9,970 (3) | 55 → 68 |
| 1920x1080 cận tối | 1 | None → 1 | 1 / 1 | 100 % | 1 | 0,210 % → 0,220 % | 10,580 (3) | 55 → 68 |

- Lóe tung đòn của bản trước: không có (không có gì ở miệng Rồng).
- Đầu khối lửa khi bay ở 720p: ≥ 63 × 73 px (cả vệt liền đầu). Ở 1080p camera chơi nền tối, phép đo có một khung chỉ đọc được 4 × 5 px (khối lửa đi qua bóng cây); các khung khác ≥ 98 × 117 px.
- Draw call: rảnh 55, lúc tung đòn 63, lúc trúng 66, tối đa 68 (+13; trần High +32).

## 5. Hiệu năng

Chưa đo cho bước 2. Bench 220 quái của bước 1 (ném Sky Fire 4 s một lần) ở `7b6eb72`–`451bc2c` đã chứa bản Sky Fire WIP: 8,08 / 10,7 ms (không bloom, có đèn), không chậm hơn bản `25160fe` trong cùng lượt. Cần một lượt `dh-perf` và bench riêng khi bước 2 xong.

## 6. Tờ khung và clip

Dưới `games/.wt-dh-vfx/tmp/vfx/final-sky1/` (Git bỏ qua), bản `7ae38e9`:
- `{1280x720,1920x1080}-{play,close}-{light,dark}-before-after.jpg`: hàng TRƯỚC (Sky Fire `25160fe`) trên hàng SAU, 24 khung từ gồng tới giây 7;
- `…-beside-reference.jpg`: cạnh ảnh tham chiếu;
- `clip-before-1920x1080.mp4`, `clip-after-7ae38e9-1920x1080.mp4`: clip 3 s;
- số đo: `report-after-7ae38e9.json`, `report-before.json`, `report-before-at-after-points.json`.
Khung thô đã dọn sau khi ghép tờ.

## 7. Bản giảm chuyển động (§3.8)

- Tắt: camera giật, đẩy FOV, đá lơ lửng (đá vẫn rơi).
- Làm dịu: lóe ×0,6 về độ sáng và ×0,8 về cỡ; số hạt và tia ×0,6; vòm, nón và khói ×0,6 độ đục; đèn ×0,8.
- Giữ: báo trước, vòm và vòng cho biết vùng trúng 4 m, vết nứt, sao choáng.

## 8. Còn mở

1. Áp bài học vòng 5 của đòn chữ: lõi nóng HDR ngoài tone map (`toneMapped: false`) ở miệng, ở khối lửa bay và ở cú trúng; một lớp tối (muội) dưới mỗi lớp sáng.
2. Chụp lại sau `cc0f5ad` và các sửa trên; vòng rune dưới chân Rồng còn mờ, cần đậm hơn.
3. Đo `dh-perf` và bench cho bước 2.
4. Người chấm độc lập.
