# 29/10/2026 · VFX bước 1a, vòng 4: cụm lửa ở quái, vệt lửa dài, luồng lửa ở miệng, hạt gồng bằng cỡ đầu, vết cháy đen

Làn V-dh, nhánh `dh-vfx` trong `games/.wt-dh-vfx`. Máy, trình duyệt và luật làn như vòng 3 (`2026-10-28-vfx-word-attack-round3.md`): Vite `127.0.0.1:4141 --strictPort`, mọi lệnh nặng qua `.local/bin/heavy.sh`.

Người chấm độc lập của vòng 3 cho **đòn mạnh 6, đòn thường 5,5** (cổng 8). Theo người chấm, phần thật sự tiến bộ chỉ nằm ở miệng (A, R); T và I gần như không đổi; F đi sai hướng. Các lỗi, theo thứ tự ưu tiên của người chấm:
1. **I ở quái (f012–f024):** đòn trúng chỉ là một quầng vàng hồng, một vệt hồng và thân quái lóe trắng. Cú bùng ở miệng còn to và giống lửa hơn cú trúng: thứ bậc bị ngược.
2. **T (f004–f011):** vệt bay là một dải kem hoặc đào nhạt trên cỏ nắng, chỉ thấy ở một phần tư đầu đường bay.
3. **A và R ở miệng:** hạt gồng là một đĩa đỏ phẳng che đầu Hỏa Long; cú tung đòn là một quả cầu tròn che cả hai con Rồng.
4. **F (f036–f126):** vết xém là một mảng mờ màu ô liu, đọc như rêu, mất hẳn trên cỏ tối.
5. **Đòn thường và đòn mạnh** dùng chung một hạt gồng và một cú tung đòn.
6. Nhỏ: số "92" của đòn thường (1920, nền nắng, f012–f014) nằm đè lên đầu quái.

**Sim không đổi.** Không sửa `src/sim`, `src/content`, `src/typing`, `tests/sim`, `src/kit`; không đụng `layout.ts`, `scatter.ts`, `paint.ts`, `models.ts`, `stage.ts` hay mã bẫy. Golden giữ nguyên.

**Sky Fire** (bước 2) tạm dừng ở commit `7ddfadd` và `7b2f23d` (WIP), theo yêu cầu của điều phối viên.

## 1. Tóm tắt

- **I ở quái là một cụm lửa thật, to hơn cú tung đòn.** Hộp 100 × 75 px (720p) quanh quái ở khung trúng, đòn mạnh, nền nắng: RGB (223, 189, 118), bão hòa 0,47, phần màu lửa 53 % (vòng 3) → **(206, 120, 54), bão hòa 0,74, phần màu lửa 90 %**. Diện tích màu lửa ở quái so với ở miệng (đòn mạnh, nền nắng): 0,58 → **1,63** lần; cận cảnh 0,54 → 1,81. Lõi trắng của cụm lửa là 11–14 % đường kính.
- **T:** vệt lửa đỏ cam trộn thường, kéo dài tới 65 % đường bay, có sợi khói tối và than rơi; đầu đạn là một khối lửa có viền quanh lõi nóng (xanh ngọc với đòn mạnh).
- **A:** hạt gồng bằng cỡ đầu Rồng, ở hàm, có viền tối, lõi lớn dần theo chữ và lưỡi lửa liếm lên.
- **R:** một luồng lửa (vỏ nón, hai khối lửa, lưỡi lửa) dọc hướng bắn; không còn quả cầu che hai con Rồng; lõi trắng chỉ 1 khung. Đòn thường bằng 0,65 đòn mạnh.
- **F:** vết cháy đen nâu, mép rách, đục gần hẳn, khe than nguội trong khoảng 1 s; còn thấy 2,1–2,35 s, kể cả trên cỏ tối; khói xám nhạt đọc được trên cỏ tối.
- Số sát thương xuất phát trên đầu quái.
- Mọi số đo §5.6 trong cổng ở 8 tổ hợp đòn mạnh và 4 tổ hợp đòn thường (mục 3). Hiệu năng: mục 4.

## 2. Đã sửa (`src/view/fx.ts`, `vfx-layers.ts`, `fx-palette.ts`)

### 2.1 I: cụm lửa thật ở quái, to hơn cú tung đòn

Hàm mới `wordHit` thay phần đòn chữ của `impact`:
- **Vẽ ở phía camera của thân quái** (lùi 0,9 m × √k về phía mắt). Billboard đặt ở giữa thân bị chính thân quái che.
- **Thân lửa** (`PUFF_FIRE`, trộn thường): một khối giữa vàng, cỡ (1,8 + 0,6 × bậc) m × k, thêm 0,4 m với đòn mạnh. Đòn mạnh bậc 3 là 4,0 m × k, đòn thường bậc 1 là 2,4 m × k; cú tung đòn mạnh chỉ có khối 1,5 m × k và luồng 3,4 × 0,9 m × k. Một khối ember văng theo hướng đòn, một khối đỏ thẫm bốc lên. Cả ba đủ đậm hai khung, tắt ở khung 9–13.
- **Lõi trắng nhỏ:** 0,24 cỡ khối, giữ 2 khung, tắt ở khung 3; lóe vàng (xanh ngọc với đòn mạnh) 0,5 cỡ khối ở cường độ thấp.
- **Lưỡi lửa:** 4 lưỡi (đòn mạnh 6) văng theo hình quạt ra xa bệ và lên trên, là ribbon lửa trộn thường, đủ 2 khung, tắt ở khung 9.
- **Than bay:** 12 + 3 × bậc tia kéo dài (đầu xanh ngọc với đòn mạnh) và vài đốm than rơi.
- **Khói:** muội tối hiện ở khung 2–4 (đọc trên cỏ nắng) và khói xám nhạt `ash` (#8a847c) từ khung 6 (đọc trên cỏ tối).
- Vòng T3 trên đất giữ lại, mờ hơn (0,6).
- **Bỏ** khỏi đòn chữ: quầng ember cộng sáng 2–3 m (quầng vàng hồng), glow của kit, các tia "rays" phẳng.

### 2.2 T: vệt lửa đỏ cam dài hơn nửa đường bay

- Kiểu ribbon mới `"fire"` (`vfx-layers.ts` `Streak`): **trộn thường**, mép rách vì nhiễu, giữa cam vàng gần đầu đạn, ra ngoài đỏ cam, viền đỏ thẫm, khe hở mở dần về đuôi. Lửa cộng sáng của kit trên cỏ nắng chỉ ra màu kem.
- Vệt trải về sau **tới 65 % đường bay** (24 điểm), không còn giới hạn 5 m.
- Một **sợi khói tối mảnh** bám sau vệt lửa (ribbon `"smoke"` riêng cho mỗi đạn), hơi nhô lên về đuôi.
- **Than rơi dọc vệt**, ở bất kỳ chỗ nào trên phần đang cháy.
- **Đầu đạn:** một khối `PUFF_FIRE` có viền tối quanh lõi nóng; đòn mạnh có lõi xanh ngọc nằm trong lửa cam.

### 2.3 A: hạt gồng bằng cỡ đầu, ở hàm

- Cỡ theo √k thay vì k: camera chơi không còn phóng hạt lên thành đĩa đỏ. Cả từ gõ xong là (0,35 + 0,75) m × √k, khoảng 1,5 m ở camera chơi, không quá cỡ đầu Rồng.
- Đặt ở hàm (0,28 m × √k trước miệng, thấp hơn 5 cm).
- `PUFF_FIRE` có viền tối, lõi nóng lớn dần theo từng chữ, kích thước nhấp nháy nhẹ; những **lưỡi lửa liếm lên** (tia kéo dài ngắn bay lên), nhiều hơn khi từ gần xong.
- Chớp ember mỗi chữ nhỏ lại theo √k.

### 2.4 R: luồng lửa theo hướng bắn, không che đầu

- **Luồng lửa** là một vỏ nón (`ShellPool` "cone", lớp L13 dùng chung với Sky Fire) từ mõm dọc hướng bắn, bị nhiễu xé, đủ 2 khung, ăn mòn tới khung 8.
- **Hai khối lửa** nằm trên luồng (1,05 và 2,3 m × k ra phía trước mõm), không nằm trên đầu.
- **Lõi trắng** ở hàm chỉ đủ sáng 1 khung, nên không đè lên đầu quá 1 khung.
- **Lưỡi lửa** (2, đòn mạnh 3) dọc luồng; tia kéo dài; khói xám từ khung 3; đèn miệng như cũ.
- **Đòn thường bằng 0,65 đòn mạnh** về chiều dài, bề rộng và cỡ khối; đòn mạnh có thêm lưỡi thứ ba và nhiều tia hơn.

### 2.5 F: vết cháy đen nâu, khe than nguội trong khoảng 1 s

- Loại mark 5: gần như đục hẳn (0,96), giữa đen, ra mép nâu sẫm, **mép rách** (nhiễu tần số cao), vài mảnh văng ngoài mép. Cỏ không còn ánh qua, nên không còn màu ô liu.
- Khe than (loại mark 6, cộng sáng): lớp vàng cam giữ 0,15 s rồi tắt ở 0,5 s, lớp đỏ giữ 0,35 s rồi tắt ở 1,2 s.
- Vết vẫn giữ đủ đậm 1,5 s, tắt ở 2,6 s; vẫn không nằm trên sông.

### 2.6 Số sát thương ở trên đầu quái

Số xuất phát ở đỉnh thân quái (`top` của locator) cộng 0,7 m, thay vì giữa thân cộng 0,4 m.

### 2.7 Lửa nguội hơn

Ribbon lửa và vỏ nón dùng phần dưới của dải màu (đỏ thẫm → đỏ cam → cam), vàng chỉ ở một đường nóng mảnh gần đầu. Phần cam của dải màu sau tone map ra màu đào nhạt.

## 3. Số đo (§5.6)

Cảnh như các vòng trước (seed 20261028, từ "place", cùng con Moss Grunt). "Vòng 3" là `tmp/vfx/shots-r3c*` (bản người chấm vòng 3 đã chấm); "vòng 4" là `93152df` (`tmp/vfx/shots-r4b*`).

**Ngưỡng §5.6, gom lại:**

| Số đo | Ngưỡng | Đòn mạnh (8 tổ hợp) | Đòn thường (4 tổ hợp) |
|---|---|---|---|
| Khung đầu của lóe so với đỉnh (ô 18 px tại điểm lóe) | ≥ 95 % | 100 % | 100 % |
| Cùng phép đo bằng `tools/vfx-sheet` (vòng 30 px × tỉ lệ) | ≥ 95 % | 100 % ở camera chơi và cận cảnh tối; **92,4–93,4 % ở cận cảnh nắng** (ghi chú 1) | 100 % |
| Khung đầu của đèn miệng | ≥ 95 % | 100 % | 100 % |
| Trắng xóa (độ sáng ≥ 0,95), cả khung | ≤ 6 % | tối đa 0,25 % | tối đa 0,06 % |
| Lõi trắng / toàn hiệu ứng lúc tung đòn | ≤ 30 % | 3,8–9,0 % | 1,0–3,6 % |
| Lõi trắng / toàn cụm lửa ở quái | ≤ 30 % | 10,6–14,1 % (cận cảnh: lõi bị thân quái lóe trắng che, đo được 0) | 11,1–11,2 % |
| Tương phản thẻ chữ p99 | ≥ 7 : 1 | tối thiểu 9,95 : 1 | tối thiểu 10,15 : 1 |
| Đầu đạn ở 720p (cả vệt lửa liền đầu) | ≥ 20 × 6 px | ≥ 32 × 34 px | ≥ 102 × 31 px |
| Từ phím cuối tới khi đạn rời miệng, đồng hồ thật, 1080p High | ≤ 50 ms | tối đa 15,1 ms, trung bình 9,0 ms (6 từ); độ trễ phím tối đa 20,9 ms | |

**Thứ bậc miệng và quái** (diện tích điểm ảnh màu lửa mới so với `a-00`, hộp 210 × 150 px ở 720p; miệng lấy khung lớn nhất trong f0–f2, quái lấy khung lớn nhất trong f12–f16):

| Tổ hợp | Vòng 3, quái / miệng | Vòng 4, quái / miệng |
|---|---|---|
| Đòn mạnh, camera chơi, nền nắng | 0,58 | **1,63** |
| Đòn mạnh, cận cảnh, nền nắng | 0,54 | **1,81** |
| Đòn mạnh, camera chơi, nền tối | 0,45 | **1,02** |
| Đòn mạnh, cận cảnh, nền tối | 0,52 | **1,28** |
| Đòn thường, camera chơi, nền nắng | 0,31 | 0,94 |
| Đòn thường, camera chơi, nền tối | 0,28 | 0,58 |

Trên nền tối, đèn miệng hắt cam lên bệ và được tính vào phía miệng, nên tỉ lệ thấp hơn thật.

**Theo từng tổ hợp, đòn mạnh** (cột như vòng 3: "f0 − pre" ở ô lóe; "thân sáng": phần sáng lên ≥ 0,15; màu hộp bệ ở miệng lúc f0):

| Tổ hợp | Khung đầu / đỉnh | f0 − pre (ô lóe) | Trắng xóa | Lõi trắng / toàn hiệu ứng | Lõi trắng / thân sáng | Màu hộp bệ f0 (RGB, bão hòa, phần lửa, phần đỏ thẫm) | Đầu đạn | Thẻ chữ p01 | Vết xém còn thấy |
|---|---|---|---|---|---|---|---|---|---|
| 1280x720 cận tối, vòng 3 | 0,978 | 0,210 | 0,3 % | 0,073 | 0,171 | (169, 108, 70), 0,613, 0,671, 0,240 | 79 × 38 | 11,450 | 1,850 s |
| 1280x720 cận tối, vòng 4 | 1 | 0,232 | 0,22 % | 0,038 | 0,074 | (146, 103, 68), 0,575, 0,561, 0,226 | 32 × 34 | 11,450 | 2,100 s |
| 1280x720 cận nắng, vòng 3 | 0,975 | 0,210 | 0,33 % | 0,090 | 0,301 | (198, 138, 91), 0,574, 0,556, 0,117 | 46 × 32 | 10,130 | 2,350 s |
| 1280x720 cận nắng, vòng 4 | 1 | 0,213 | 0,24 % | 0,059 | 0,132 | (190, 145, 97), 0,527, 0,396, 0,083 | 107 × 39 | 10,130 | 2,350 s |
| 1280x720 chơi tối, vòng 3 | 1 | 0,248 | 0,13 % | 0,070 | 0,207 | (177, 118, 74), 0,605, 0,689, 0,170 | 56 × 35 | 11,610 | 1,850 s |
| 1280x720 chơi tối, vòng 4 | 1 | 0,293 | 0,11 % | 0,057 | 0,123 | (168, 120, 78), 0,566, 0,637, 0,169 | 103 × 35 | 11,620 | 2,100 s |
| 1280x720 chơi nắng, vòng 3 | 1 | 0,246 | 0,13 % | 0,090 | 0,413 | (208, 152, 101), 0,546, 0,492, 0,082 | 40 × 32 | 10,150 | 2,100 s |
| 1280x720 chơi nắng, vòng 4 | 1 | 0,146 | 0,12 % | 0,090 | 0,448 | (210, 165, 113), 0,492, 0,319, 0,045 | 108 × 37 | 10,150 | 2,350 s |
| 1920x1080 cận tối, vòng 3 | 0,970 | 0,206 | 0,32 % | 0,072 | 0,169 | (168, 109, 70), 0,614, 0,666, 0,237 | 120 × 57 | 11,410 | 1,850 s |
| 1920x1080 cận tối, vòng 4 | 1 | 0,231 | 0,23 % | 0,056 | 0,129 | (146, 103, 68), 0,577, 0,550, 0,214 | 48 × 50 | 11,410 | 2,100 s |
| 1920x1080 cận nắng, vòng 3 | 0,964 | 0,205 | 0,34 % | 0,089 | 0,296 | (198, 138, 91), 0,575, 0,554, 0,122 | 69 × 48 | 9,950 | 2,350 s |
| 1920x1080 cận nắng, vòng 4 | 1 | 0,212 | 0,25 % | 0,063 | 0,155 | (190, 144, 97), 0,530, 0,393, 0,089 | 161 × 59 | 9,950 | 2,350 s |
| 1920x1080 chơi tối, vòng 3 | 0,999 | 0,252 | 0,14 % | 0,070 | 0,208 | (178, 119, 75), 0,604, 0,689, 0,167 | 87 × 52 | 11,560 | 1,850 s |
| 1920x1080 chơi tối, vòng 4 | 1 | 0,288 | 0,12 % | 0,060 | 0,128 | (169, 121, 78), 0,565, 0,637, 0,166 | 155 × 53 | 11,620 | 2,100 s |
| 1920x1080 chơi nắng, vòng 3 | 1 | 0,249 | 0,15 % | 0,099 | 0,419 | (209, 152, 101), 0,545, 0,490, 0,084 | 60 × 47 | 10,250 | 2,100 s |
| 1920x1080 chơi nắng, vòng 4 | 1 | 0,147 | 0,13 % | 0,087 | 0,457 | (211, 165, 113), 0,492, 0,320, 0,049 | 161 × 55 | 10,250 | 2,350 s |

**Đòn thường:**

| Tổ hợp | Khung đầu / đỉnh | f0 − pre (ô lóe) | Trắng xóa | Lõi trắng / toàn hiệu ứng | Lõi trắng / thân sáng | Màu hộp bệ f0 (RGB, bão hòa, phần lửa, phần đỏ thẫm) | Đầu đạn | Thẻ chữ p01 | Vết xém còn thấy |
|---|---|---|---|---|---|---|---|---|---|
| 1280x720 chơi tối, vòng 3 | 1 | 0,216 | 0,06 % | 0,054 | 0,159 | (178, 116, 72), 0,616, 0,640, 0,156 | 53 × 33 | 11,610 | 1,850 s |
| 1280x720 chơi tối, vòng 4 | 1 | 0,202 | 0,05 % | 0,024 | 0,070 | (160, 115, 75), 0,562, 0,572, 0,173 | 102 × 31 | 11,620 | 1,850 s |
| 1280x720 chơi nắng, vòng 3 | 1 | 0,214 | 0,07 % | 0,071 | 0,306 | (209, 149, 97), 0,566, 0,510, 0,084 | 28 × 26 | 10,150 | 2,100 s |
| 1280x720 chơi nắng, vòng 4 | 1 | 0,115 | 0,06 % | 0,036 | 0,177 | (208, 165, 113), 0,488, 0,291, 0,043 | 104 × 33 | 10,150 | 2,350 s |
| 1920x1080 chơi tối, vòng 3 | 1 | 0,219 | 0,06 % | 0,053 | 0,157 | (179, 116, 73), 0,614, 0,641, 0,157 | 81 × 49 | 11,570 | 1,850 s |
| 1920x1080 chơi tối, vòng 4 | 1 | 0,205 | 0,05 % | 0,010 | 0,029 | (161, 115, 75), 0,561, 0,572, 0,169 | 152 × 46 | 11,620 | 1,850 s |
| 1920x1080 chơi nắng, vòng 3 | 1 | 0,216 | 0,07 % | 0,074 | 0,300 | (210, 150, 98), 0,565, 0,508, 0,087 | 42 × 39 | 10,250 | 2,100 s |
| 1920x1080 chơi nắng, vòng 4 | 1 | 0,120 | 0,05 % | 0,015 | 0,070 | (208, 165, 113), 0,488, 0,290, 0,045 | 156 × 49 | 10,250 | 2,350 s |

**Ghi chú:**
1. **`tools/vfx-sheet` ở cận cảnh nền nắng đọc khung 1 sáng hơn khung 0** (0,93 ở 720p, 0,92 ở 1080p) trong vòng 30 px × tỉ lệ quanh điểm lóe. Ảnh hiệu f1 − f0 (`tmp/vfx/final4/compare-close-light-f0-f1-f1minusf0.png`) cho thấy phần sáng thêm là **cánh trắng của Bạch Long và tư thế Strike của Hỏa Long** đổi giữa hai khung, không phải hiệu ứng. Vòng 3, quả cầu lửa che cả hai con Rồng nên không thấy chuyện này; luồng lửa vòng 4 không che Rồng như người chấm yêu cầu. Vòng 20 px và ô 18 px tại điểm lóe đều cho 100 %.
2. **f0 − pre** ở ô lóe trên nền nắng còn +0,12–0,15 (vòng 3: +0,25): lõi trắng nhỏ hơn và luồng lửa trộn thường không làm sáng bệ màu be. Khung f0 vẫn là đỉnh.
3. **Thân sáng / đầu đạn** cao hơn vòng 3 (1,2–3,0) vì đầu đạn giờ là khối lửa có viền, không còn sáng lên nhiều.
4. **Đầu đạn ở 720p** đo cả vệt lửa liền với đầu (dọc 102–108 px), vì vệt giờ đậm liền một khối với đầu.

## 4. Hiệu năng

Một lượt `heavy.sh --perf`, 03:41–03:49, tải máy 3,4–4,6 (yên hơn lượt vòng 3). Trong cùng lượt: bản vòng 3 (`451bc2c`) rồi bản vòng 4 (`93152df`). `dh-perf`: trận thật, bot `?speed=2`, đợt 1–3, High 1920 × 1080, Chrome không khóa khung.

| Bản | Đợt 1 | Đợt 2 | Đợt 3 | Ba đợt (TB / p95, ms) | Khung dài nhất | Draw call |
|---|---|---|---|---|---|---|
| Vòng 3, không bloom, có đèn | 7,02 / 9,9 | 7,24 / 10,2 | 6,89 / 9,5 | 7,05 / 9,9 | 23,2 | 53 |
| **Vòng 4, không bloom, có đèn (mặc định High)** | 7,01 / 9,8 | 6,32 / 8,7 | 6,59 / 9,3 | **6,64 / 9,3** | 15,6 | 53 |
| Vòng 4, không bloom, không đèn | 6,55 / 9,1 | 6,34 / 9,0 | 6,17 / 8,9 | 6,35 / 9,0 | 15,4 | 53–55 |
| Vòng 4, bloom, không đèn | 7,59 / 10,1 | 7,70 / 10,0 | 7,55 / 9,9 | 7,61 / 10,0 | 23,6 | 66–68 |
| Vòng 4, bloom, có đèn | 7,72 / 9,8 | 8,12 / 10,8 | 7,89 / 10,8 | 7,91 / 10,5 | 26,6 | 66–68 |

- Mặc định High nằm trong cổng 8 / 12 ms và không chậm hơn vòng 3 trong cùng lượt (−0,41 ms).
- Lượt này cả bốn tổ hợp đều trong cổng, kể cả bloom có đèn (7,91 ms, sát cổng; đợt 2 là 8,12). Vòng 3 đo trên máy bận hơn thì bloom có đèn vượt. Vẫn đề nghị giữ High không bloom (§6.2 a) vì biên quá mỏng.

**Bench 220 quái có xương:**

| Bản | TB / p95 (ms) | Khung dài nhất | Draw call |
|---|---|---|---|
| Vòng 3, không bloom, có đèn | 8,44 / 11,1 | 362,8 | 75 |
| Vòng 4, không bloom, có đèn | 7,81 / 10,6 | 338,0 | 82 |
| Vòng 4, bloom, có đèn | 9,32 / 12,5 | 399,1 | 95 |

- Vòng 4 không chậm hơn vòng 3. Draw call +7 trong bench: sợi khói theo từng đạn, vỏ nón, lưỡi lửa ở miệng và ở quái (mỗi dải một call khi đang hiện). Vẫn dưới trần +32 của High.
- Khung dài đơn lẻ 340–400 ms vẫn có ở cả hai bản (như vòng 3).

## 5. Tờ khung và clip

Dưới `games/.wt-dh-vfx/tmp/vfx/final4/` (Git bỏ qua). **Hàng TRƯỚC là vòng 3** (bản người chấm vòng 3 đã chấm), hàng SAU là vòng 4. Ghép bằng `tools/vfx-sheet`.

- Cả cú đánh: `strong/{1280x720,1920x1080}-{play,close}-{light,dark}-before-after.jpg`; sát miệng (gồng, tung đòn, f0–f8): `…-mouth-before-after.jpg`; sát quái (trúng, dư âm, f11–f126): `…-foe-before-after.jpg`; cạnh ảnh tham chiếu: `…-beside-reference.jpg`.
- Đòn thường ở camera chơi: `plain/{1280x720,1920x1080}-play-{light,dark}-…` cùng bộ.
- Clip: `clip-r3-r4-tight-3s.mp4` (vòng 3 | vòng 4, khung cắt sát 800 × 450 của 1080p), `clip-r3-r4-tight-halfspeed.mp4` (chậm một nửa, f30–f129), `clip-r4-1920x1080.mp4` (cả khung).
- Ảnh hiệu f1 − f0 ở cận cảnh nắng: `compare-close-light-f0-f1-f1minusf0.png`.
- Số đo: `tmp/vfx/shots-r4b/report-after.json`, `shots-r4b-plain/report-after.json`; `tools/vfx-sheet`: `final4/vfx-sheet-r4.json`, `final4/vfx-sheet-r4-plain.json`. Khung thô `shots-r4b*` và `shots-r3c*` giữ lại cho người chấm; tôi không xóa gì của người chấm.

Mọi khung nêu ở đây tôi đã xem.

## 6. Bản giảm chuyển động (§3.8)

- Lưỡi lửa ở miệng và ở quái: 3 thay vì 4–6 ở quái; dài và rộng ×0,8, độ đậm ×0,6.
- Khối lửa ×0,8 về cỡ; lóe ×0,6; tia kéo dài ở quái 6 + 3 × bậc; khói ×0,7.

## 7. Còn mở

1. **Người chấm độc lập** cho vòng 4: điều phối viên chạy.
2. **Đòn thường ở quái** to bằng 0,94 cú tung đòn của chính nó trên nền nắng (0,58 trên nền tối, có đèn miệng tính vào). Người chấm chỉ đòi đòn mạnh lớn hơn miệng; nếu cần đòn thường cũng vậy, tăng cỡ cụm lửa của bậc 1–2.
3. **Thân quái lóe trắng** khi trúng là phản ứng của `crowd` (không thuộc lượt này); cụm lửa vẽ phía trước thân nên che phần lớn.
4. **Tương phản thẻ chữ** vẫn chưa được thử thật (không thẻ nào dưới hiệu ứng).
5. **Khung dài đơn lẻ trên bench** (mục 4) vẫn cần trace trên máy rảnh.
6. Không push, không merge. Vite 4141 và mọi Chrome của làn đã tắt khi xong.
