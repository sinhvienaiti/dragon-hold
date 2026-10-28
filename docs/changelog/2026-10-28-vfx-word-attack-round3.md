# 28/10/2026 · VFX bước 1a, vòng 3: lửa mang màu lúc tung đòn, lõi trắng nhỏ, lưỡi lửa, gồng đọc được, tia trúng, vết xém mềm và không nằm trên sông

Làn V-dh (nối từ workflow `vfx-dh-v2` sau khi phiên trước hết hạn mức). Máy, trình duyệt và luật làn như vòng 1 và vòng 2: Mac mini M4, Chrome 156 headless có GPU, mọi lệnh nặng qua `.local/bin/heavy.sh`. Vite lượt này chạy ở `127.0.0.1:4141 --strictPort`, tắt khi xong. Nhánh `dh-vfx` trong `games/.wt-dh-vfx`.

Người chấm độc lập của vòng 2 cho **7 điểm ở 720p, 7,5 ở 1080p** (cổng là 8), kết luận "sửa":
- **Lỗi lớn:** trên bệ nắng, lúc tung đòn đọc thành một làn sương kem, hồng đào, không phải lửa. Lõi trắng chiếm một nửa tới hai phần ba đường kính, trong khi chuẩn §3.5 luật 3 chỉ cho ≤ 30 % bán kính. Viền đỏ thẫm mà báo cáo nói tới thì không thấy.
- **Lỗi nhỏ:** quầng gồng gần như không thấy ở 720p (chấm 8–15 px); ba lóe dọc hướng bắn đọc thành một chuỗi hạt tròn đều nhau; tia lửa lúc trúng khó thấy; vết xém là một ngôi sao đen phẳng, mép cứng.
- Người chấm còn nêu hai lỗi lớn khác: vết xém nằm trên sông (lượt này sửa, mục 2.6) và vệt cánh gấp khúc (lượt này làm mượt, mục 2.7).

**Sim không đổi.** Không sửa `src/sim`, `src/content`, `src/typing`, `tests/sim`, `src/kit`; không đụng `layout.ts`, `scatter.ts`, `paint.ts`, `models.ts`, `stage.ts` hay mã bẫy. Golden giữ nguyên; `pnpm check` đạt.

**Phần Sky Fire dở dang của phiên trước** (sửa chưa commit ở `fx.ts`, `heroes.ts`, ba file mới `fx-palette.ts`, `vfx-layers.ts`, `skyfire.ts` và kịch bản `dh-vfx-skyfire.mjs`) được giữ nguyên, commit thành một commit WIP (`b141b24`) trước khi sửa bước 1a, để các commit của vòng này tách riêng.

## 1. Tóm tắt

- **Lúc tung đòn giờ đọc ra lửa, không còn là sương kem.**
  - Hộp bệ ở f0, 720p camera chơi, nền nắng, đòn mạnh: RGB (222, 192, 143), bão hòa 0,39, phần màu lửa 16 % (vòng 2) → **(208, 152, 101), bão hòa 0,55, phần màu lửa 49 %**; phần đỏ thẫm 0,6 % → 8 %.
  - Lõi trắng (độ sáng ≥ 0,9) chỉ còn **7–10 % đường kính toàn hiệu ứng** (vòng 2: 26–42 %); chuẩn §3.5 luật 3 cho ≤ 30 %.
  - Đo theo cách người chấm vòng 2 (lõi trắng trên "thân sáng", tức phần sáng lên ≥ 0,15): đòn mạnh trên nền nắng 0,67 → **0,41–0,42**; trên nền tối và ở cận cảnh 0,17–0,30; đòn thường 0,16–0,31. Người chấm đề nghị ≤ 0,4: đòn mạnh trên nền nắng vẫn sát mức đó (mục 7).
  - Khối lửa có viền đỏ thẫm thấy được trên cả nền nắng lẫn nền tối; ba lưỡi lửa thon, dài ngắn không đều thay cho chuỗi hạt tròn.
- **Gồng** là một hạt lửa có viền, lớn dần theo từng chữ, với đốm than bay vào miệng thành tia; đọc được ở 720p.
- **Trúng:** tia lửa kéo dài văng ra từ thân quái (trước đây không vẽ được tia nào: lỗi loại mặt sau, mục 2.4).
- **Vết xém** mềm, mép không đều, có than nguội dần, và không còn nằm trên sông.
- **Vệt cánh** đi theo socket qua một bộ lọc thông thấp, nên không còn móc vuông khi cánh vẫy nhanh (mục 2.7; chưa ai chấm lại).
- Mọi số đo §5.6 vẫn trong cổng ở 8 tổ hợp đòn mạnh và 4 tổ hợp đòn thường (mục 3). Hiệu năng: mục 4.

## 2. Đã sửa

### 2.1 Lúc tung đòn (R): lửa mang màu, lõi trắng nhỏ

**Nguyên nhân** (`src/view/fx.ts`, `release()` của vòng 2): khối đỏ thẫm trộn thường 2,1 m × k nằm trọn bên trong các lớp cộng sáng vẽ đè lên nó: thân ember 3,2 m × k, lóe vàng 2,2 m × k ở cường độ 3,4, lõi trắng 1,1 m × k ở 3, cùng ba lóe dọc hướng bắn. Cam cộng sáng trên nền bệ màu be bị bão hòa thành màu kem, nên lớp tối không tạo được viền và thân không bao giờ đọc ra cam đậm.

**Cách sửa:** màu do lửa trộn thường mang; phần cộng sáng chỉ còn một lõi nhỏ.
- **Hình puff mới `PUFF_FIRE`** (shader puff, khóa `shape` của `QuadPool.spawn`): một khối lửa có mép cuộn bị nhiễu ăn, giữa là màu của nó, quá một phần ba bán kính chuyển sang cam đỏ, ngoài cùng là viền đỏ thẫm (#6e1606). Viền này thấy được trên cả bệ nắng lẫn nền chiều tối.
- **Một khối lửa ở miệng**, vàng cam #ffb347, 2,9 m × k, giữ đủ 2 khung cùng lóe, tắt ở khung 7; một khối lửa ember 1,45 m × k bung ra dọc hướng bắn, vẽ dưới khối chính.
- **Lóe cộng sáng:** lõi trắng 0,85 m × k ở cường độ 2,3; một lóe vàng 1,5 m × k ở 0,9. Với đòn mạnh, lóe xanh ngọc rộng mà thấp (2,2 m × k ở 0,35): xanh ngọc chồng lên giữa vàng ở cường độ cao làm lõi trắng to gấp 2,4 lần đòn thường (đo giữa lượt: 20 px so với 8 px ở 720p).
- **Đầu đạn lên sau khung tung đòn:** khung 0 không có, khung 1 một nửa, từ khung 2 đủ. Đầu xanh ngọc của đòn mạnh ở ⅓ độ sáng ngay khung 0 nằm trong lóe và làm lõi trắng to gấp đôi.
- **Bỏ** thân ember cộng sáng 3,2 m và ba lóe tròn dọc hướng bắn.
- Puff được giữ (`hold`) chỉ bắt đầu nở sau khi hết thời gian giữ, như flare: khung 0 là đỉnh cả về độ sáng lẫn kích thước.

### 2.2 Lưỡi lửa thay chuỗi hạt tròn

Ba lưỡi lửa là ba dải ribbon lửa thon (`Streak` dáng `flame`, shader lửa của kit), mỗi lưỡi 8 điểm, dài, rộng và lệch góc không đều nhau (3,4 / 2,3 / 2,8 m × k; rộng 0,7 / 0,5 / 0,44 m × k; lệch 0°, +15–23°, −10–19°), cong nhẹ sang một bên. Chúng bắt đầu ở mép khối lửa (nửa sáng của dải nằm ngoài khối), đủ dài và đủ sáng ngay khung 0, giữ 2 khung, tắt ở khung 5. Vẽ trên khối lửa (thứ tự vẽ 6). Kèm 8 tia lửa kéo dài dọc hướng bắn.

### 2.3 Gồng (A) đọc được ở 720p

- Hạt lửa ở miệng giờ là một `PUFF_FIRE` có viền đỏ thẫm, lớn tới 1,9 m × k khi gõ gần hết từ. Vòng 2, puff này chỉ được vẽ ở 43 % độ đục: nó sống 2 khung, bị trừ tuổi trước khi vẽ, và mờ dần ngay từ khung đầu. Giờ nó được giữ đủ độ đục.
- Mỗi chữ đúng kéo 3–4 đốm than vào miệng, vẽ thành tia kéo dài thay vì chấm tròn, và một lóe ember chớp ở miệng (đủ sáng khung đầu, tắt ở khung 4).
- Quầng vẫn cam bão hòa, không trắng: khung tung đòn vẫn nhảy rõ so với khung trước nó (mục 3).

### 2.4 Tia lửa lúc trúng thấy được

**Lỗi tìm thấy khi chụp:** `StreakSparks` (tia kéo dài, `vfx-layers.ts`) không vẽ được tia nào. Quad của nó đặt theo (side, dir) với side là dir xoay +90°, làm lật chiều tam giác, nên bị loại mặt sau. Một lượt thử bắn 30 tia không thấy gì; thêm `side: DoubleSide` thì thấy. Lỗi này cũng làm mất tia của Sky Fire, chỉ là chưa ai chụp.

Đòn chữ trúng giờ ném 10 + 3 × bậc tia lửa kéo dài từ phía trước thân quái (phía đạn tới), ra xa bệ và lên trên, vàng nóng và cam (xanh ngọc với đòn mạnh), rộng 0,16 m × k, sống 10–18 khung.

### 2.5 Vết xém mềm, mép không đều, có than

- Loại mark 5 vẽ lại: giữa cháy đen, mép mềm bị nhiễu ăn không đều, loang lổ, ấm dần ra mép; vài đốm văng ngoài mép. Hạt giống lấy từ ô độ dày của mark.
- Loại mark mới 6 (kho vòng cộng sáng): than đỏ và khe nứt phát sáng trong vết xém mới. Một lớp cam tắt sau 0,3 s, một lớp đỏ tắt sau 0,7 s, nên than nguội dần.
- Vẫn giữ đủ đậm 1,5 s, tắt hết ở 2,6 s (§3.4).

### 2.6 Vết xém không nằm trên sông

`createFx` đọc mực nước của địa hình đã vẽ (`field.waterLevel`, chỉ đọc) và báo "ướt" khi mặt đất thấp hơn mặt nước. Vết xém thử lần lượt các chỗ trên đường bắn: trước quái 0,75 m, hai bên chỗ đó, sát hơn, dưới quái, rồi qua khỏi quái. Nó nằm ở chỗ khô đầu tiên (giữa và bốn điểm cách giữa 35 % cỡ vết đều khô). Nếu chỗ nào cũng ướt thì không có vết xém, mà có ba đám hơi nước. Test mới: nước tới quá con quái thì vết xém nằm qua quái; nước khắp nơi thì không có vết, có hơi nước.

### 2.7 Vệt cánh không còn móc vuông

Vệt cánh lấy một điểm mỗi khung ở socket `FX_WING_*`. Khi cánh vẫy đổi chiều giữa hai khung, dải vẽ ra một móc vuông và một vòng nhỏ hình vuông cạnh cánh (người chấm vòng 2). Giờ mỗi vệt đi theo socket qua một bộ lọc thông thấp `1 − e^(−20·dt)` (khoảng 3 khung), đặt lại khi nạp mô hình (`heroes.ts`). Trên khung f001–f010 ở 1080p camera chơi nền tối, dải là một cung trơn.

### 2.8 Số đo mới (`dh-vfx-word`)

- **Toàn bộ hiệu ứng** (`changedBlob`): các điểm ảnh đổi màu ≥ 0,12 so với `a-00`, sáng lên hay tối đi. Thân lửa đỏ trộn thường làm tối bệ nắng vẫn được tính, điều mà phép đo "thân sáng" (độ sáng tăng ≥ 0,15) bỏ sót.
- **Lõi trắng trên toàn hiệu ứng** (§3.5 luật 3) và trên thân sáng (cách người chấm vòng 2 đo).
- **Màu hộp bệ** (`boxColor`) ở `pre`, f0, f1: RGB trung bình, độ bão hòa, phần điểm ảnh màu lửa và phần đỏ thẫm.
- `stats()` báo thêm số tia kéo dài đang sống.

## 3. Số đo (§5.6)

**Cảnh chụp như vòng 1 và 2:** seed 20261028, kho trống, từ "place" trên cùng con Moss Grunt, tick 617–618. Đòn mạnh: gõ đúng hết (Hoàn hảo). Đòn thường: `TYPO=2` (Vừa). "Trước" là bản vòng 2 (`25160fe`, `tmp/vfx/shots-after8*`), đo lại bằng các số đo mới trên đúng các khung đó. "Sau" là `99dc9e8` cộng phần làm mượt vệt cánh `451bc2c` (`tmp/vfx/shots-r3c*`).

**Ngưỡng §5.6, gom lại:**

| Số đo | Ngưỡng | Đòn mạnh (8 tổ hợp) | Đòn thường (4 tổ hợp) | Vòng 2 |
|---|---|---|---|---|
| Khung đầu của lóe so với đỉnh (ô 18 px) | ≥ 95 % | 96,4–100 % | 100 % | 99,6–100 % |
| Cùng phép đo bằng `tools/vfx-sheet` (vòng 30 px quanh điểm lóe) | ≥ 95 % | 95,8–100 % | 100 % | 95,2–100 % |
| Khung đầu của đèn miệng so với đỉnh | ≥ 95 % | 100 % (1,25, 1,25, 0,81, 0,44, 0,16, 0) | 100 % | 100 % |
| Trắng xóa (độ sáng ≥ 0,95), cả khung | ≤ 6 % | tối đa 0,34 % | tối đa 0,07 % | tối đa 0,32 % |
| Lõi trắng / toàn hiệu ứng (đường kính) | ≤ 30 % | 7,0–9,9 % | 5,3–7,4 % | 25,5–41,9 % |
| Tương phản thẻ chữ p99 | ≥ 7 : 1 | tối thiểu 9,95 : 1 | tối thiểu 10,15 : 1 | 9,95 : 1 |
| Đầu đạn ở 720p, dọc × ngang | ≥ 20 × 6 px | ≥ 40 × 32 px | ≥ 28 × 26 px | ≥ 39 × 32 px |
| Toàn hiệu ứng lúc tung đòn so với đầu đạn | ≥ 1,5 lần | 2,32–3,20 lần | 2,19–2,93 lần | — |
| Từ phím cuối tới khi đạn rời miệng, đồng hồ thật, 1080p High | ≤ 50 ms | tối đa 13,4 ms, trung bình 11,7 ms (6 từ); độ trễ phím tối đa 17,7 ms | | 16,2 ms |

**Theo từng tổ hợp, đòn mạnh** ("f0 − pre": độ sáng tăng ở ô lóe so với khung ngay trước phím cuối; "thân sáng": phần sáng lên ≥ 0,15 so với `a-00`; màu hộp bệ 120 × 90 px ở 720p):

| Tổ hợp | Khung đầu / đỉnh | f0 − pre (ô lóe) | Trắng xóa | Lõi trắng / toàn hiệu ứng | Lõi trắng / thân sáng | Màu hộp bệ f0 (RGB, bão hòa, phần lửa, phần đỏ thẫm) | Đầu đạn | Thẻ chữ p01 | Vết xém còn thấy |
|---|---|---|---|---|---|---|---|---|---|
| 1280x720 cận tối, trước | 0,999 | 0,416 | 0,28 % | 0,255 | 0,422 | (182, 149, 114), 0,421, 0,384, 0,140 | 79 × 38 | 11,450 | 2,100 s |
| 1280x720 cận tối, sau | 0,978 | 0,210 | 0,3 % | 0,073 | 0,171 | (169, 108, 70), 0,613, 0,671, 0,240 | 79 × 38 | 11,450 | 1,850 s |
| 1280x720 cận nắng, trước | 0,999 | 0,284 | 0,31 % | 0,324 | 0,520 | (214, 182, 138), 0,388, 0,213, 0,013 | 44 × 32 | 10,130 | 2,350 s |
| 1280x720 cận nắng, sau | 0,975 | 0,210 | 0,33 % | 0,090 | 0,301 | (198, 138, 91), 0,574, 0,556, 0,117 | 46 × 32 | 10,130 | 2,350 s |
| 1280x720 chơi tối, trước | 0,999 | 0,413 | 0,12 % | 0,258 | 0,452 | (187, 154, 115), 0,436, 0,429, 0,135 | 56 × 36 | 11,610 | 2,100 s |
| 1280x720 chơi tối, sau | 1 | 0,248 | 0,13 % | 0,070 | 0,207 | (177, 118, 74), 0,605, 0,689, 0,170 | 56 × 35 | 11,610 | 1,850 s |
| 1280x720 chơi nắng, trước | 0,999 | 0,242 | 0,13 % | 0,419 | 0,671 | (222, 192, 143), 0,386, 0,163, 0,006 | 39 × 32 | 10,150 | 2,350 s |
| 1280x720 chơi nắng, sau | 1 | 0,246 | 0,13 % | 0,090 | 0,413 | (208, 152, 101), 0,546, 0,492, 0,082 | 40 × 32 | 10,150 | 2,100 s |
| 1920x1080 cận tối, trước | 0,998 | 0,415 | 0,3 % | 0,257 | 0,423 | (182, 149, 115), 0,422, 0,384, 0,141 | 120 × 57 | 11,410 | 2,100 s |
| 1920x1080 cận tối, sau | 0,970 | 0,206 | 0,32 % | 0,072 | 0,169 | (168, 109, 70), 0,614, 0,666, 0,237 | 120 × 57 | 11,410 | 1,850 s |
| 1920x1080 cận nắng, trước | 0,998 | 0,284 | 0,32 % | 0,298 | 0,523 | (214, 182, 138), 0,388, 0,213, 0,015 | 67 × 48 | 9,950 | 2,350 s |
| 1920x1080 cận nắng, sau | 0,964 | 0,205 | 0,34 % | 0,089 | 0,296 | (198, 138, 91), 0,575, 0,554, 0,122 | 69 × 48 | 9,950 | 2,350 s |
| 1920x1080 chơi tối, trước | 0,997 | 0,418 | 0,13 % | 0,258 | 0,453 | (188, 154, 115), 0,435, 0,434, 0,134 | 87 × 52 | 11,560 | 2,100 s |
| 1920x1080 chơi tối, sau | 0,999 | 0,252 | 0,14 % | 0,070 | 0,208 | (178, 119, 75), 0,604, 0,689, 0,167 | 87 × 52 | 11,560 | 1,850 s |
| 1920x1080 chơi nắng, trước | 0,996 | 0,246 | 0,13 % | 0,398 | 0,671 | (223, 192, 143), 0,385, 0,164, 0,009 | 59 × 47 | 10,250 | 2,350 s |
| 1920x1080 chơi nắng, sau | 1 | 0,249 | 0,15 % | 0,099 | 0,419 | (209, 152, 101), 0,545, 0,490, 0,084 | 60 × 47 | 10,250 | 2,100 s |

**Đòn thường:**

| Tổ hợp | Khung đầu / đỉnh | f0 − pre (ô lóe) | Trắng xóa | Lõi trắng / toàn hiệu ứng | Lõi trắng / thân sáng | Màu hộp bệ f0 (RGB, bão hòa, phần lửa, phần đỏ thẫm) | Đầu đạn | Thẻ chữ p01 | Vết xém còn thấy |
|---|---|---|---|---|---|---|---|---|---|
| 1280x720 chơi tối, trước | 1 | 0,320 | 0,06 % | 0,079 | 0,136 | (189, 141, 99), 0,505, 0,594, 0,125 | 53 × 33 | 11,610 | 2,100 s |
| 1280x720 chơi tối, sau | 1 | 0,216 | 0,06 % | 0,054 | 0,159 | (178, 116, 72), 0,616, 0,640, 0,156 | 53 × 33 | 11,610 | 1,850 s |
| 1280x720 chơi nắng, trước | 1 | 0,152 | 0,07 % | 0,107 | 0,274 | (224, 181, 130), 0,440, 0,317, 0,008 | 28 × 26 | 10,150 | 2,350 s |
| 1280x720 chơi nắng, sau | 1 | 0,214 | 0,07 % | 0,071 | 0,306 | (209, 149, 97), 0,566, 0,510, 0,084 | 28 × 26 | 10,150 | 2,100 s |
| 1920x1080 chơi tối, trước | 1 | 0,325 | 0,06 % | 0,078 | 0,135 | (189, 141, 100), 0,504, 0,598, 0,126 | 81 × 50 | 11,570 | 2,100 s |
| 1920x1080 chơi tối, sau | 1 | 0,219 | 0,06 % | 0,053 | 0,157 | (179, 116, 73), 0,614, 0,641, 0,157 | 81 × 49 | 11,570 | 1,850 s |
| 1920x1080 chơi nắng, trước | 1 | 0,156 | 0,06 % | 0,113 | 0,279 | (224, 182, 131), 0,439, 0,315, 0,010 | 42 × 39 | 10,250 | 2,350 s |
| 1920x1080 chơi nắng, sau | 1 | 0,216 | 0,07 % | 0,074 | 0,300 | (210, 150, 98), 0,565, 0,508, 0,087 | 42 × 39 | 10,250 | 2,100 s |

**Ghi chú:**
- **f0 − pre** giảm từ +0,41 xuống +0,25 trên nền tối, còn trên nền nắng giữ +0,25. Lý do: phần cộng sáng lớn đã bỏ, và hạt gồng to hơn nên khung `pre` sáng sẵn ở ô đo. Bước nhảy vẫn rõ (ngưỡng người chấm vòng 1 nêu là +0,15).
- **Thân sáng so với đầu đạn** ở nền nắng còn 0,74–0,90 lần (vòng 2: 1,87–1,97). Đây là hệ quả có chủ ý: thân lửa giờ trộn thường, đậm hơn bệ màu be, nên không "sáng lên". Phép đo toàn hiệu ứng (đổi màu ≥ 0,12) mới là cỡ thật của cú tung đòn: 2,3–3,2 lần đầu đạn.
- **Vết xém** còn thấy 1,85–2,35 s (vòng 2: 2,1–2,35 s), giờ nằm trên đất khô cạnh con quái chứ không trên sông (mục 2.6). Ô đo nằm trên cỏ hoặc đường đất nên số giây khác vòng 2 một chút.
- **Draw call ở 1080p camera chơi:** rảnh 54, lúc tung đòn 61–62, lúc trúng 63 (vòng 2: 53, 58, 62). Ba lưỡi lửa thêm 3 call trong 5 khung; tia kéo dài 1 call (kho dùng chung với Sky Fire).
- **Tương phản thẻ chữ** vẫn chưa có ý nghĩa: không thẻ nào nằm dưới hiệu ứng trong cảnh này (như vòng 2).
- **Hai tổ hợp 720p camera chơi của đòn mạnh được chụp lại** (`shots-r3c-fix`, đã gộp vào `shots-r3c`). Lượt đầu bị một lần tải lại trang giữa chừng: tôi tạo cây BEFORE dưới `tmp/` của worktree trong lúc Vite đang phục vụ, nên Vite thấy file mới.

## 4. Hiệu năng

**Cách đo** như vòng 2: `dh-perf` (trận thật, bot `?speed=2`, đợt 1–3, High 1920 × 1080, Chrome không khóa khung) và bench 220 quái có xương trên bản đồ vẽ. Một lượt `heavy.sh --perf` (giữ cả 3 suất GPU), 23:56–00:04, tải máy 7–8 (các làn khác chạy CPU). Trong cùng lượt: bản vòng 2 (`25160fe`, "trước") rồi bản bước 1 (`451bc2c`), mỗi bản phục vụ từ một cây riêng trên 4141. Số đo nên so trong cùng lượt; con số tuyệt đối lệch theo tải máy (vòng 2 đo 7,36 ms cho cùng bản "trước" lúc tải 4–5).

**`dh-perf`** (trung bình / p95 của 600 khung cuối mỗi đợt, ms):

| Bản | Đợt 1 | Đợt 2 | Đợt 3 | Ba đợt | Khung dài nhất | Draw call |
|---|---|---|---|---|---|---|
| Trước (vòng 2), không bloom, có đèn | 6,85 / 9,3 | 7,17 / 10,3 | 7,36 / 10,8 | 7,13 / 10,1 | 27,3 | 53–55 |
| **Bước 1, không bloom, có đèn (mặc định High)** | 6,97 / 9,9 | 6,78 / 10,0 | 6,56 / 8,9 | **6,77 / 9,6** | 17,0 | 53–55 |
| Bước 1, không bloom, không đèn | 7,28 / 11,1 | 7,51 / 11,9 | 6,98 / 11,3 | 7,26 / 11,4 | 26,1 | 53–55 |
| Bước 1, bloom, không đèn | 7,58 / 10,9 | 7,62 / 11,3 | 7,49 / 10,5 | 7,56 / 10,9 | 25,1 | 66–68 |
| Bước 1, bloom, có đèn | 9,73 / 13,4 | 8,68 / 12,2 | 7,72 / 11,0 | 8,71 / 12,2 | 46,4 | 66–68 |

- Mặc định High (không bloom, có đèn) nằm trong cổng 8 / 12 ms và không chậm hơn bản trước trong cùng lượt (−0,36 ms trung bình; chênh này nằm trong độ dao động của máy bận).
- Bloom có đèn vượt cổng (8,71 / 12,2). Giữ High không bloom như §6.2 (a); `stage.ts` không sửa.
- Đợt 1 của tổ hợp bloom có đèn chậm hơn hẳn hai đợt sau (9,73 so với 7,72): tôi đọc đó là tải máy lúc ấy, không phải hiệu ứng (cùng mã, đợt 3 trong cổng).

**Bench 220 quái có xương** (trung bình / p95, ms):

| Bản | Trung bình / p95 | Khung dài nhất | Draw call |
|---|---|---|---|
| Trước (vòng 2), không bloom, có đèn | 8,63 / 12,1 | 363,0 | 72 |
| Bước 1, không bloom, có đèn | 8,08 / 10,7 | 331,8 | 75 |
| Bước 1, bloom, có đèn | 9,69 / 13,4 | 416,4 | 88 |

- Bench trên máy bận này quá 8 ms ở cả bản trước; bước 1 không chậm hơn bản trước.
- **Khung dài đơn lẻ 330–420 ms** có ở cả bản vòng 2 lẫn bước 1 trong cùng lượt. Người chấm vòng 2 thấy nó chỉ sau thay đổi khi so với bản gốc `607c3c1`; lượt này không đo bản gốc. Nó vẫn không xuất hiện trong trận thật (`dh-perf` dài nhất 17–46 ms). Cần một trace khung trên máy rảnh (mục 7).
- Draw call: bench +3 (ba lưỡi lửa và kho tia kéo dài khi có đòn chữ).

## 5. Tờ khung và clip

Mọi đường dẫn dưới `games/.wt-dh-vfx/tmp/vfx/` (Git bỏ qua). Tờ ghép bằng `tools/vfx-sheet` (`typing-game-wt/vfx/tools/vfx-sheet/cli.mjs`, phiếu 037; repo cha chưa có bản ở `tools/`).

- **Trước và sau, hàng TRƯỚC trên hàng SAU:**
  - cả cú đánh (14 khung từ gồng tới f126): `final3/strong/{1280x720,1920x1080}-{play,close}-{light,dark}-before-after.jpg`;
  - phóng sát miệng Rồng (gồng, tung đòn, f0–f8): `final3/strong/…-mouth-before-after.jpg`;
  - phóng sát con quái (trúng, dư âm, f11–f126): `final3/strong/…-foe-before-after.jpg`;
  - đòn thường ở camera chơi: `final3/plain/{1280x720,1920x1080}-play-{light,dark}-{before-after,mouth-before-after,foe-before-after}.jpg`.
- **Cạnh ảnh tham chiếu:** `final3/{strong,plain}/…-beside-reference.jpg` (ảnh tham chiếu bên trái, trước và sau bên phải).
- **Clip 3 s, 60 fps:** `final3/clip-before-after-tight-3s.mp4` (trước | sau, khung cắt sát 800 × 450 của 1080p quanh Rồng và con quái), `final3/clip-before-after-tight-halfspeed.mp4` (chậm một nửa, f30–f129), `final3/clip-after-1920x1080.mp4` (cả khung).
- **Số đo:** `shots-r3c/report-after.json`, `shots-r3c-plain/report-after.json`; bản trước đo lại: `r3-before-measures.json`, `r3-before-plain-measures.json`; số đo bằng `tools/vfx-sheet`: `final3/vfx-sheet-{before,after}{,-plain}.json`.

Mọi khung nêu ở đây tôi đã xem.

## 6. Bản giảm chuyển động (§3.8)

- Lưỡi lửa: dài và rộng ×0,8, độ sáng ×0,6.
- Tia kéo dài lúc tung đòn 4 thay vì 8; lúc trúng 6 + 3 × bậc thay vì 10 + 3 × bậc; đốm than lúc gồng 2 thay vì 3–4.
- Lóe, khối lửa như vòng 2 (đỉnh ×0,6, cỡ ×0,8).

## 7. Còn mở

1. **Người chấm độc lập** cho vòng 3: điều phối viên chạy. Lượt này tôi không tự chấm để qua cổng.
2. **Đòn mạnh trên nền nắng:** lõi trắng trên thân sáng là 0,41–0,42, sát mức ≤ 0,4 mà người chấm vòng 2 đề nghị (mọi tổ hợp khác 0,16–0,31). Đo trên toàn hiệu ứng thì chỉ 9–10 %. Nếu người chấm vẫn thấy lõi to, cách sửa tiếp: thu lõi trắng của riêng đòn mạnh xuống 0,7 m × k.
3. **Vệt cánh:** đã làm mượt (mục 2.7), móc vuông ở camera chơi nền tối không còn thấy trên khung f001–f010. Ở camera chơi vệt cánh vẫn mảnh; chưa có người chấm xem lại.
4. **Tương phản thẻ chữ** vẫn chưa được thử thật (không thẻ nào dưới hiệu ứng). Cần một lượt chụp đợt đông quái.
5. **Khung dài đơn lẻ trên bench** không khóa khung (330–420 ms, có cả ở bản vòng 2): cần trace trên máy rảnh, so với bản gốc `607c3c1`.
6. Không push, không merge. Vite 4141 và mọi Chrome của làn đã tắt khi xong.
