# 29/10/2026 · VFX bước 1a, vòng 6: một vật liệu lửa thật cho nón, vệt, lưỡi lửa và khối lửa; khối tụ đỏ cam; số sát thương sinh ở đầu quái

Làn V-dh, nhánh `dh-vfx` trong `games/.wt-dh-vfx`. Máy, trình duyệt và luật làn như vòng 5. Mọi lệnh nặng qua `.local/bin/heavy.sh`; khung thô của mỗi lượt được dọn ngay khi tờ khung đã ghép. Bloom ở High vẫn tắt (quyết định của điều phối viên sau vòng 5).

Người chấm độc lập vòng 5 (`tmp/vfx/judge-r5/verdict.md`) cho **đòn mạnh 6,75, đòn thường 6,4**. Điểm theo pha (mạnh / thường): A 5,5 / 5,5; R 6,7 / 6,25; T 7,0 / 6,9; I 7,25 / 6,75; F 7,0 / 6,75. Lỗi chính người chấm nêu:

- R: thân nón là hình thang cam phẳng, mép thẳng, đầu xa cắt dọc; gần như không có lớp tối.
- A: trên đài đá sáng, khối tụ thành quầng trắng hồng mờ, đốm than mảnh.
- I: khối lửa một tông, che kín quái 6 khung, lớp tối tới muộn (f018–f024); que hồng ngắn thay cho than rơi.
- Số sát thương hiện ngay cỡ cuối, cách đầu quái khoảng 50–60 px ở 720p, không có nhịp đập.

Điều phối viên yêu cầu đổi cách làm: **một vật liệu lửa thật** dùng chung cho nón, vệt, cú nổ và Sky Fire, có lớp muội tối đi cùng lớp sáng; khối tụ đỏ cam; cú nổ để lộ quái lóe trắng, có 10–16 đốm than rơi; số sinh ở đầu quái cỡ 2,5–3 lần rồi co về 1 lần trong 150 ms.

**Sim không đổi.** Không sửa `src/sim`, `src/content`, `src/typing`, `tests/sim`, `src/kit`; không đụng `layout.ts`, `scatter.ts`, `paint.ts`, `models.ts`, `stage.ts` hay mã bẫy. Golden giữ nguyên.

## 1. Tóm tắt

- **Một vật liệu lửa** (`VFX_FLAME_GLSL` trong `src/view/vfx-layers.ts`) dùng chung cho nón lửa lúc tung đòn, vệt và lưỡi lửa (ribbon), mọi quả cầu lửa (khối tụ, lóe miệng, đầu đạn, cú nổ) của đòn chữ và Sky Fire. Nhiễu hai quãng tám cuộn theo dòng chảy; dải màu trắng vàng ở lõi (≤ 30 % bán kính) → cam bão hòa → đỏ thẫm; **mép ngoài mờ dần là màu muội tối** chứ không phải đỏ trong suốt (đỏ trong suốt trên đá be chính là màu hồng đào người chấm chê); đầu xa và lửa già **cháy rụi theo nhiễu**, lỗ cháy có viền than.
- **A:** khối tụ là quả cầu đỏ cam bão hòa, viền đỏ thẫm, lớn một nấc mỗi chữ; lõi nóng nhỏ (vàng, hoặc xanh ngọc khi từ chưa có lỗi); bỏ quầng cộng sáng rộng. Đốm than hút vào miệng dày ≥ 3 px ở 720p, đuôi tối (kho tia mới trộn thường).
- **R:** bỏ hai lớp cộng sáng rộng 3,6 m (nguồn của màu hồng đào); lõi trắng nằm trong một khối lửa đỏ cam trộn thường; một vết cháy tối ngắn (0,55 s) trên đá dưới miệng; muội ở gốc nón từ khung 1. Ô lóe sáng lên rõ lúc tung đòn: f0 − pre **0,29–0,42** ở đòn mạnh, 0,25–0,36 ở đòn thường (vòng 5: −0,01–0,12 và 0,03–0,14).
- **I:** lửa vây quanh và sau lưng quái, nên quái hiện thành bóng tối có lóe trắng ở giữa; muội đi cùng lớp sáng từ f012; lưỡi lửa vọt lên từ sau lưng; 10–16 đốm than đuôi tối rơi theo trọng lực; que hồng ngắn giảm còn 6–12 que cam.
- **Số sát thương** sinh ngay trên đầu quái ở f012, cỡ **2,5 lần**, co về 1 lần trong khoảng 150 ms (nhịp đập của kit giảm 7/s), rồi trôi lên. Trước đây số bị đẩy lên trên chỗ thẻ chữ cũ: thẻ của từ vừa xong đã tắt (độ mờ 0) nhưng hộp của nó vẫn nằm trong danh sách vùng tránh 250 ms. Sửa ở `src/app/app.ts` (xem 2.6).
- Mọi số đo §5.6 trong cổng ở 8 tổ hợp đòn mạnh và 4 tổ hợp đòn thường (mục 3). Bloom vẫn tắt ở High.

## 2. Đã sửa

### 2.1 Vật liệu lửa (`vfx-layers.ts`, `fx.ts`)

- `vxFlame(across, along, q, age, hot)`: thân thu hẹp về đầu xa, mép bị nhiễu xé; nhiệt = (gần trục) × (gần gốc) × nhiễu × độ nóng − tuổi. Dải màu: muội (0,07; 0,03; 0,018) → đỏ thẫm → cam bão hòa → vàng → trắng HDR. Độ đục giảm ở mép từ 0,78 đến 1,05 bán kính, đúng chỗ màu đã về muội; phần đầu xa và lửa già tan theo nhiễu, viền lỗ tan tối đi 70 %.
- **Nón** (vỏ nón tung đòn của đòn chữ và Sky Fire): ngang = 1 − pow(mặt hướng camera, 0,75), nhiễu cuộn dọc nón.
- **Ribbon lửa** (vệt đạn, lưỡi lửa): ngang = |vSide|, nhiễu cuộn dọc theo dải.
- **Quả cầu lửa** (`PUFF_FIRE`): bán kính, nhiễu trôi lên trên màn hình; độ nóng lấy theo độ sáng của màu (màu sáng thì lõi trắng rộng hơn). Lần đầu thử cuộn nhiễu theo hướng xuyên tâm nhân với đồng hồ chạy thì quả cầu thành gai nhọn như con nhím; đã bỏ.
- **Kho tia đuôi tối** (`StreakSparks` chế độ `dark`, trộn thường): đầu sáng, đuôi nâu đen.

### 2.2 A

- Quả cầu `(0,55 + 1,05 × L + 0,2 × nhịp) × √k` m, màu `chargeBall`, độ đục 0,97, mỗi khung một quả mới (lửa sôi); lõi cộng sáng `(0,25 + 0,4 × L) × √k` m.
- 2–3 đốm than mỗi chữ, rộng 0,16 m × √k (≥ 3 px ở 720p), kéo dài, đuôi tối.

### 2.3 R

- Bỏ quầng cam cộng sáng 3,6 m × k và quầng vàng 3,6 m × k. Lóe giữ lõi trắng 1,1 m × k (2 khung) và một chớp vàng trắng 1,6 m × k chỉ ở khung 0 (để khung đầu là đỉnh trên đài sáng: ở lần chụp thử, cận cảnh nắng đo 0,92 rồi 0,95; sau khi tăng chớp này, 0,998–1).
- Khối lửa đỏ cam 1,7 m × k quanh lõi, giữ 2 khung.
- Vết cháy tối 1,6 m × k trên đá dưới miệng, 0,55 s (không vẽ nếu là nước).
- Muội ở gốc và hai mép nón từ khung 1, giữ 3 khung.

### 2.4 T

- Vệt và đầu đạn dùng vật liệu mới: mép vệt tối, thân có nhiễu chảy, đuôi tan. Sợi khói tối và than rơi dọc vệt như vòng 5.

### 2.5 I

- Khối lửa 0,78 cỡ cú nổ: một quả phía trên đầu quái (phía camera), hai quả hai bên và một quả phía trên **sau lưng** quái. Quái được vẽ trước các quả sau lưng, nên thấy bóng quái và lóe trắng của nó giữa lửa.
- Lõi cộng sáng nhỏ 0,2 cỡ, ngắn (3 khung); quầng cam 0,95 cỡ đặt sau lưng quái, không nâng về phía camera.
- Muội sau lưng khối lửa hiện ngay f012 (vòng 5: từ khung 2, người chấm thấy tối ở f018–f024).
- 4–5 lưỡi lửa vọt lên từ sau lưng; 10 + 2 × bậc đốm than đuôi tối rơi theo trọng lực (đòn mạnh 16); que sáng 6 + 2 × bậc, màu cam, cường độ 1,7 (vòng 5: 12 + 3 × bậc, cường độ 3, thành que hồng trắng).

### 2.6 Số sát thương (`fx.ts`, `src/app/app.ts`)

- Hồ sơ số của view (`NUMBER_FEEL`, bản sao `DRAGON` của kit) đặt nhịp đập 2,5 cho các bậc có số. Kit không đổi.
- Số sinh ở đỉnh đầu quái + 0,15 m, nâng thêm 0,8 cỡ chữ để chữ số khi phóng to phủ đầu quái chứ không phủ tâm cú nổ.
- **Lỗi vùng tránh:** `refreshKeepOut` đọc mọi `.dh-tag`, kể cả thẻ đã giải phóng (tags.ts để phần tử lại với độ mờ 0). Giờ bỏ qua thẻ có độ mờ 0, và đọc lại vùng tránh 175 ms sau `word-complete` (thẻ mờ trong 160 ms), trước khi đạn tới (200 ms). Lần đọc này tách khỏi nhịp 250 ms, vì nhịp thường có thể chạy ngay trước khi thẻ tắt rồi đặt lần đọc kế sau f012 (đó là lý do lần sửa đầu chưa ăn).

### 2.7 Thước đo

- `headSize` (`scripts/visual/scenarios/lib/vfx-measure.mjs`) bắt đầu từ điểm đổi màu nhiều nhất quanh đầu đạn, như chú thích của nó vẫn ghi (trước đây lấy điểm đổi màu đầu tiên theo thứ tự quét). Đòn chữ không đổi số; xem mục Sky Fire về chỗ thước đo này vẫn sai.

## 3. Số đo (§5.6)

Cảnh như vòng 5 (seed 20261028, từ "place", Moss Grunt, bản đồ đã gộp). **Hàng "vòng 5" được chụp lại từ `5a7046f`** (bản người chấm vòng 5 đã chấm) trong cùng phiên với vòng 6, vì khung thô vòng 5 đã dọn.

**Ngưỡng §5.6:**

| Số đo | Ngưỡng | Đòn mạnh (8 tổ hợp) | Đòn thường (4 tổ hợp) |
|---|---|---|---|
| Khung đầu của lóe so với đỉnh (ô 18 px) | ≥ 95 % | 100 % | 100 % |
| `tools/vfx-sheet`, vòng 30 px × tỉ lệ | ≥ 95 % | 99,8–100 % | 100 % |
| Khung đầu của đèn miệng | ≥ 95 % | 100 % | 100 % |
| Trắng xóa (độ sáng ≥ 0,95) | ≤ 6 % | tối đa 0,42 % | tối đa 0,06 % |
| Lõi trắng / toàn hiệu ứng lúc tung đòn | ≤ 30 % | 14,0–22,7 % | 9,1–18,9 % |
| Thân sáng lúc tung đòn / đầu đạn | ≥ 1,5 lần | 2,37–3,50 | 2,88–3,09 |
| Tương phản thẻ chữ p01 | ≥ 7 : 1 | tối thiểu 9,86 : 1 | tối thiểu 9,96 : 1 |
| Đầu đạn ở 720p | ≥ 20 × 6 px | ≥ 31 × 29 px | ≥ 26 × 24 px |
| Phím cuối → đạn rời miệng, đồng hồ thật, 1080p High | ≤ 50 ms | tối đa 15,1 ms, trung bình 6,1 ms; độ trễ phím tối đa 19,8 ms | |

- Đầu đạn trên nền tối đo nhỏ hơn vòng 5 (31 × 29 so với 105 × 35 ở 720p cận tối): mép vệt giờ là muội, trên cỏ tối không khác nền, nên thước đo chỉ còn bắt quả cầu đầu đạn, không bắt cả vệt liền sau. Trên nền sáng vẫn 107–109 × 34–35.

**Hộp đo của người chấm** (độ sáng trung bình; 300 × 180 quanh miệng và nón ở `pre` → f000; 260 × 200 quanh quái ở f010 → f013; cỡ 1080p, thu theo tỉ lệ):

| Tổ hợp | Miệng, vòng 5 | Miệng, vòng 6 | Quái, vòng 5 | Quái, vòng 6 |
|---|---|---|---|---|
| Đòn mạnh, chơi, nắng | 0,729 → 0,722 | 0,716 → 0,697 | 0,682 → 0,651 | 0,677 → 0,584 |
| Đòn mạnh, chơi, tối | 0,425 → 0,542 | 0,412 → 0,506 | 0,436 → 0,473 | 0,435 → 0,450 |
| Đòn mạnh, cận, nắng | 0,707 → 0,712 | 0,687 → 0,686 | 0,716 → 0,706 | 0,711 → 0,637 |
| Đòn mạnh, cận, tối | 0,432 → 0,552 | 0,411 → 0,512 | 0,435 → 0,493 | 0,432 → 0,458 |
| Đòn thường, chơi, nắng | 0,727 → 0,723 | 0,714 → 0,715 | 0,669 → 0,661 | 0,665 → 0,624 |
| Đòn thường, chơi, tối | 0,424 → 0,496 | 0,411 → 0,482 | 0,416 → 0,428 | 0,415 → 0,414 |

- Độ sáng trung bình các hộp **giảm** so với vòng 5, nhất là hộp quanh quái trên nền nắng (0,651 → 0,584). Đây là chủ ý: người chấm vòng 5 nói cách sửa là tương phản (lớp tối, viền đỏ cam bão hòa), không phải thêm sáng. Lớp tối giờ có thật ở R: phần đỏ thẫm trong hộp bệ lúc f0 trên nền nắng 0,028–0,048 (vòng 5: 0,001–0,014), trên nền tối 0,13–0,18 (vòng 5: 0,05–0,06).
- Ô lóe (18 px) lúc tung đòn so với lúc gồng, đòn mạnh: +0,29 đến +0,42 (vòng 5: −0,01 đến +0,12). Khối tụ giờ đỏ cam và tối hơn lõi, nên khung tung đòn bật hẳn lên.
- Diện tích màu lửa ở quái so với ở miệng, đòn mạnh: 1,21–1,55 trên nền nắng (vòng 5: 1,22–1,29), 0,67–0,98 trên nền tối.

**Theo từng tổ hợp, đòn mạnh:**

| Tổ hợp | Khung đầu / đỉnh | f0 − pre (ô lóe) | Trắng xóa | Lõi trắng / toàn hiệu ứng | Lõi trắng / thân sáng | Màu hộp bệ f0 (RGB, bão hòa, phần lửa, phần đỏ thẫm) | Đầu đạn | Thẻ chữ p01 | Vết xém còn thấy |
|---|---|---|---|---|---|---|---|---|---|
| 1280x720 cận tối, vòng 5 | 1 | 0,110 | 0,22 % | 0,115 | 0,207 | (206, 151, 103), 0,528, 0,639, 0,056 | 105 × 35 | 11,220 | 2,100 s |
| 1280x720 cận tối, vòng 6 | 1 | 0,319 | 0,38 % | 0,163 | 0,319 | (172, 133, 90), 0,522, 0,527, 0,176 | 31 × 29 | 11,040 | 2,100 s |
| 1280x720 cận nắng, vòng 5 | 1 | 0,026 | 0,26 % | 0,202 | 0,345 | (235, 186, 131), 0,462, 0,403, 0,013 | 107 × 37 | 9,960 | 2,350 s |
| 1280x720 cận nắng, vòng 6 | 1 | 0,293 | 0,42 % | 0,227 | 0,399 | (214, 173, 120), 0,473, 0,388, 0,046 | 107 × 34 | 9,860 | 2,350 s |
| 1280x720 chơi tối, vòng 5 | 1 | 0,122 | 0,1 % | 0,117 | 0,215 | (211, 155, 105), 0,523, 0,664, 0,047 | 109 × 33 | 11,220 | 2,100 s |
| 1280x720 chơi tối, vòng 6 | 1 | 0,419 | 0,27 % | 0,142 | 0,360 | (181, 139, 94), 0,517, 0,572, 0,126 | 63 × 30 | 11,180 | 2,100 s |
| 1280x720 chơi nắng, vòng 5 | 1 | -0,007 | 0,12 % | 0,189 | 0,447 | (239, 192, 137), 0,441, 0,336, 0,001 | 109 × 35 | 9,960 | 2,350 s |
| 1280x720 chơi nắng, vòng 6 | 1 | 0,289 | 0,28 % | 0,227 | 0,492 | (220, 181, 129), 0,443, 0,309, 0,028 | 109 × 35 | 9,960 | 2,350 s |
| 1920x1080 cận tối, vòng 5 | 1 | 0,108 | 0,23 % | 0,116 | 0,208 | (206, 151, 103), 0,529, 0,638, 0,056 | 158 × 52 | 11,180 | 2,100 s |
| 1920x1080 cận tối, vòng 6 | 1 | 0,318 | 0,39 % | 0,164 | 0,320 | (172, 133, 90), 0,523, 0,523, 0,178 | 48 × 44 | 11,040 | 2,100 s |
| 1920x1080 cận nắng, vòng 5 | 1 | 0,023 | 0,27 % | 0,192 | 0,345 | (234, 186, 130), 0,463, 0,399, 0,014 | 161 × 55 | 9,960 | 2,350 s |
| 1920x1080 cận nắng, vòng 6 | 1 | 0,293 | 0,42 % | 0,220 | 0,400 | (213, 172, 120), 0,474, 0,385, 0,048 | 161 × 51 | 9,860 | 2,350 s |
| 1920x1080 chơi tối, vòng 5 | 1 | 0,107 | 0,11 % | 0,117 | 0,189 | (212, 155, 106), 0,523, 0,667, 0,047 | 162 × 50 | 11,330 | 2,100 s |
| 1920x1080 chơi tối, vòng 6 | 1 | 0,419 | 0,27 % | 0,140 | 0,370 | (184, 140, 96), 0,514, 0,584, 0,129 | 85 × 44 | 11,190 | 2,100 s |
| 1920x1080 chơi nắng, vòng 5 | 1 | -0,011 | 0,12 % | 0,188 | 0,447 | (239, 191, 138), 0,440, 0,332, 0,002 | 163 × 51 | 9,970 | 2,350 s |
| 1920x1080 chơi nắng, vòng 6 | 1 | 0,303 | 0,28 % | 0,222 | 0,492 | (220, 180, 129), 0,442, 0,308, 0,032 | 162 × 52 | 9,970 | 2,350 s |

**Đòn thường:**

| Tổ hợp | Khung đầu / đỉnh | f0 − pre (ô lóe) | Trắng xóa | Lõi trắng / toàn hiệu ứng | Lõi trắng / thân sáng | Màu hộp bệ f0 (RGB, bão hòa, phần lửa, phần đỏ thẫm) | Đầu đạn | Thẻ chữ p01 | Vết xém còn thấy |
|---|---|---|---|---|---|---|---|---|---|
| 1280x720 chơi tối, vòng 5 | 1 | 0,135 | 0,05 % | 0,081 | 0,198 | (187, 138, 92), 0,539, 0,632, 0,074 | 104 × 29 | 11,220 | 2,100 s |
| 1280x720 chơi tối, vòng 6 | 1 | 0,362 | 0,05 % | 0,091 | 0,234 | (174, 132, 88), 0,530, 0,590, 0,152 | 26 × 24 | 11,180 | 2,100 s |
| 1280x720 chơi nắng, vòng 5 | 1 | 0,025 | 0,06 % | 0,158 | 0,307 | (230, 185, 131), 0,456, 0,302, 0,004 | 100 × 29 | 9,960 | 2,100 s |
| 1280x720 chơi nắng, vòng 6 | 1 | 0,254 | 0,06 % | 0,181 | 0,341 | (221, 181, 128), 0,450, 0,299, 0,028 | 106 × 31 | 9,960 | 2,350 s |
| 1920x1080 chơi tối, vòng 5 | 1 | 0,123 | 0,05 % | 0,081 | 0,198 | (188, 138, 92), 0,538, 0,636, 0,077 | 154 × 44 | 11,330 | 2,100 s |
| 1920x1080 chơi tối, vòng 6 | 1 | 0,352 | 0,05 % | 0,093 | 0,238 | (175, 132, 89), 0,530, 0,592, 0,154 | 39 × 36 | 11,190 | 2,100 s |
| 1920x1080 chơi nắng, vòng 5 | 1 | 0,025 | 0,06 % | 0,155 | 0,315 | (231, 185, 131), 0,456, 0,300, 0,006 | 149 × 44 | 9,970 | 2,100 s |
| 1920x1080 chơi nắng, vòng 6 | 1 | 0,260 | 0,06 % | 0,189 | 0,357 | (221, 180, 128), 0,450, 0,296, 0,033 | 158 × 47 | 9,970 | 2,350 s |

## 4. Hiệu năng

Một lượt `heavy.sh --perf`, 10:20–10:25, tải máy 3,4–7,6 (làn khác chạy song song). Trong cùng lượt: vòng 5 sau khi sửa khung dài (`ce80453`) và bản cuối của vòng này (`389fd6d`, gồm cả Sky Fire vòng 6). High mặc định: không bloom, có đèn miệng. `dh-perf` 1920 × 1080, bot tốc độ 2, ba đợt; bench 220 quái có xương (ném Sky Fire 4 s một lần).

| Bản | Đợt 1 | Đợt 2 | Đợt 3 | Ba đợt (TB / p95, ms) | Khung dài nhất | Draw call |
|---|---|---|---|---|---|---|
| Vòng 5 `ce80453`, High mặc định | 4,59 / 7,3 | 4,56 / 7,2 | 4,56 / 7,2 | 4,57 / 7,2 | 10,7 | 63 |
| **Vòng 6 `389fd6d`, High mặc định** | 4,49 / 7,0 | 4,68 / 7,3 | 4,62 / 7,2 | **4,60 / 7,2** | 9,4 | 61–63 |
| Vòng 6, không đèn miệng | 4,59 / 7,4 | 4,43 / 7,2 | 4,46 / 7,1 | 4,49 / 7,2 | 11,8 | 61–63 |

| Bench 220 quái | TB / p95 (ms) | Khung dài nhất | Khung > 50 ms | Draw call |
|---|---|---|---|---|
| Vòng 5 `ce80453` | 6,01 / 8,9 | 13,9 | 0 | 91 |
| **Vòng 6 `389fd6d`** | **5,96 / 9,0** | **13,2** | **0** | 97 |

- Trong cổng 8 / 12 ms với biên rộng; vật liệu lửa mới (hai lần nhiễu mỗi điểm ảnh) không làm chậm thấy được.
- Draw call bench +6 so với vòng 5 (kho tia đuôi tối mới là một lớp; các quả cầu lửa và vết cháy thêm dùng kho sẵn có). Dưới trần +32 của High.
- Lượt đầu (10:01) hỏng ở bản vòng 6: Vite của lượt đo chết vì vòng liên kết tượng trưng `tmp/shared → shared` và `shared/shared → shared` (ELOOP khi theo dõi tệp). Tôi xóa liên kết `tmp/shared` của chính làn (tạo ngày 28/10 cho cây TRƯỚC cũ, nay không dùng) rồi đo lại cả lượt. Liên kết `shared/shared` ở repo cha không phải của làn, tôi để nguyên (xem mục 7).

## 5. Tờ khung và clip

Dưới `games/.wt-dh-vfx/tmp/vfx/final6/` (Git bỏ qua). Hàng TRƯỚC là vòng 5 (`5a7046f`, chụp lại), hàng SAU là vòng 6 (`be8d379`; mã đòn chữ không đổi sau đó). Ghép bằng `tools/vfx-sheet`.

- `strong/{1280x720,1920x1080}-{play,close}-{light,dark}-{before-after,mouth-before-after,foe-before-after,beside-reference}.jpg`, crop gốc trong `strong/_crops/`.
- `plain/{1280x720,1920x1080}-play-{light,dark}-…` cùng bộ.
- `clip-r6-1920x1080.mp4` (camera chơi, đá sáng, từ "place"). Clip vòng 5 vẫn ở `final5/clip-r5-1920x1080.mp4`.
- Số đo: `report-r6-strong.json`, `report-r6-plain.json`, `report-r5-*-recaptured.json`, `remeasure-r6-*.json`, `vfx-sheet-shots-r6*.json`, `judge-boxes-and-fire-area*.txt`.
- Khung thô đã dọn bằng `prune.mjs --apply` sau khi ghép tờ.

## 6. Bản giảm chuyển động (§3.8)

Như vòng 5; khối tụ, lõi và các quả cầu lửa mới nhận cùng hệ số (×0,6–0,8); đốm than rơi 8 thay vì 10–16.

## 7. Còn mở

1. **Người chấm độc lập** cho vòng 6: điều phối viên chạy.
2. Độ sáng trung bình quanh quái trên nền nắng giảm (mục 3). Nếu người chấm thấy cú nổ kém lực, bước tiếp là lõi vàng lớn hơn trong khối lửa, không phải quầng cộng sáng rộng.
3. Số sát thương 2,5 lần che đầu quái 3–4 khung ở cận cảnh 1080p (đúng như T10 yêu cầu); nếu người chấm thấy che cú nổ, có thể hạ nhịp đập xuống 2,2.
4. Liên kết `shared/shared → shared` ở repo cha (chưa theo dõi, tạo 28/10 12:17, không phải của làn) làm Vite chết khi một cây nào đó có liên kết tới `shared` bên trong thư mục được theo dõi. Đề nghị: người tạo xóa nó.
5. Thử nghiệm đơn vị đo thời gian thật `tags-bodies` (bố trí 20 thẻ trong ngân sách khung) trượt hai lần khi máy tải 13 (làn khác chạy nặng), chạy riêng thì đạt.
6. Không push, không merge vào main.
