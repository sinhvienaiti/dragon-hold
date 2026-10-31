# 29/10/2026 · VFX bước 1a, vòng 5: lõi nóng cộng sáng có lớp tối bên dưới, khối tụ lửa phát sáng báo trước đòn mạnh, lóe chạm, PERFECT

Làn V-dh, nhánh `dh-vfx` trong `games/.wt-dh-vfx`. Máy, trình duyệt và luật làn như vòng 4. Vite `127.0.0.1:4141 --strictPort`, mọi lệnh nặng qua `.local/bin/heavy.sh`; khung thô của mỗi lượt được dọn ngay khi tờ khung đã ghép.

Người chấm độc lập vòng 4 (`tmp/vfx/judge-r4/verdict.md`) cho **đòn mạnh 6,5, đòn thường 6,0** (cổng 8, không pha nào dưới 7). Điểm theo pha (mạnh / thường): A 5,0 / 5,0; R 6,5 / 6,0; T 7,25 / 6,75; I 7,25 / 6,75; F 5,9 / 5,4.

Nhận xét gốc của người chấm: mỗi lớp trông như một tấm cắt màu cam phẳng; không có lõi sáng rực, không có lớp tối làm nền. Trên nền sáng, vùng nổ còn tối đi (0,646 → 0,552), vùng miệng gần như không sáng thêm lúc tung đòn (0,631 → 0,633). Người chấm truy ra gốc ở mục 2.7 của vòng 4 ("lửa nguội hơn"): lõi nóng phải đi bằng cộng sáng HDR, chỉ ở ≤ 30 % bán kính, còn thân cam giữ trộn thường. Số của chính làn cũng khớp: lóe tung đòn chỉ 1,22 lần đầu đạn (chuẩn ≥ 1,5); `scorch.drop` trên nền tối 0,03–0,10, âm ở cận cảnh tối.

**Về tone map:** cả khung đi qua lượt grade (Neutral rồi tách tông, `view/stage.ts`), nên không có vật liệu nào "bỏ qua tone map" được nếu không sửa `stage.ts` (ngoài làn). Lõi nóng vì vậy là lớp **cộng sáng HDR 2–4** chồng lên thân trộn thường: Neutral nén nó về trắng vàng ở giữa, mép vẫn cam. Màu đào của vòng 2 sinh ra khi lớp cộng sáng lớn phủ lên bệ màu be; lớp cộng sáng vòng 5 chỉ ở lõi, nằm trên thân lửa và lớp muội.

**Sim không đổi.** Không sửa `src/sim`, `src/content`, `src/typing`, `tests/sim`, `src/kit`; không đụng `layout.ts`, `scatter.ts`, `paint.ts`, `models.ts`, `stage.ts` hay mã bẫy. Golden giữ nguyên.

**Sky Fire** dừng ở điểm commit sạch `7aa0180` (mã `cc0f5ad`, changelog `2026-10-28-vfx-skyfire.md` ghi trạng thái).

## 1. Tóm tắt

- **Gộp Dragonhold main `4f61c6e` vào `dh-vfx`** trước khi chụp (`8e30f9d`): bản đồ L2-cau mới (đá bệ và cỏ sáng hơn), giao diện tiếng Anh, tên hai con Rồng, nhãn PERFECT của main (`NUMBER_FEEL`). Xung đột ở `fx.ts` giải theo main cho nhãn, giữ VFX của làn. `pnpm check` đạt (55 tệp, 490 test; một test đo thời gian thật trượt một lần khi máy bận, chạy lại hai lần đều đạt). Vì bản đồ đổi, hàng TRƯỚC (vòng 4, bản đồ cũ) và hàng SAU (vòng 5, bản đồ mới) khác nền.
- **Có lõi nóng và lớp tối ở mọi pha:** lóe miệng, lõi dọc luồng lửa, lõi cú nổ đều là lớp cộng sáng HDR nằm trên thân trộn thường và lớp muội. Lõi trắng 12–20 % đường kính toàn hiệu ứng lúc tung đòn (≤ 30 %).
- **Lóe miệng so với đầu đạn ≥ 1,5:** "thân sáng" lúc tung đòn so với đầu đạn 2,3–4,5 lần (vòng 4: 0,8–1,7 trên nền sáng, chính là con số 1,22 người chấm nêu). Lóe miệng ở 1080p camera chơi rộng 67 px (thân sáng), lõi trắng 30 px.
- **Pha A:** khối tụ phát sáng có lõi lớn dần, chuyển xanh ngọc khi từ chưa có lỗi; đòn thường giữ lõi vàng.
- **Pha I:** lóe chạm ở f010–f011; cú nổ phát sáng: hộp 260 × 200 của người chấm quanh quái trên nền tối 0,434 → 0,47 (vòng 4: 0,380 → 0,40); trên nền nắng của bản đồ mới vẫn hơi tối đi (0,678 → 0,65), vì thân lửa cam tối hơn cỏ sáng.
- **Pha F:** khe than HDR còn sáng ở f066 trên cỏ tối, vết cháy có viền tro.
- Mọi số đo §5.6 trong cổng ở 8 tổ hợp đòn mạnh và 4 tổ hợp đòn thường; hiệu năng trong cổng (mục 4).

## 2. Đã sửa (`src/view/fx.ts`, `vfx-layers.ts`, `fx-palette.ts`)

### 2.1 R: ba lớp và lóe miệng lớn

- **Lõi nóng:** một dải lửa cộng sáng (shader lửa của kit, HDR) chạy dọc trục luồng lửa, rộng ≤ 30 % bề ngang nón, và một dải mảnh lệch góc. Đủ 2 khung, tắt ở khung 5.
- **Thân:** vỏ nón trộn thường, bị nhiễu ăn, nay dùng cả dải màu: vàng ở gốc, cam, đỏ về phía mũi; tắt trong 8 khung. Một khối lửa có viền ở chỗ luồng rời mõm, hai lưỡi lửa trộn thường.
- **Lớp tối:** 3 đám muội ở gốc và hai mép nón, hiện từ khung 2, tan ở khung 8.
- **Lóe miệng:** lõi trắng 1,0 m × k trong lóe cam 3,4 m × k, đủ sáng 2 khung, vẽ trước đầu Rồng; thêm một quầng vàng rộng 5,0 m × k, thấp, 2 khung, để cả vùng miệng sáng lên so với lúc gồng.
- **Đèn miệng** lúc tung đòn 70 → 110 cd (chiếu sáng bệ); lúc gồng giữ 8 % của mức đó.
- 9 tia kéo dài (đòn thường 5).
- **Đòn thường:** cùng ba lớp, cỡ 0,65, độ nóng 0,9 (vòng đầu thử 0,72 thì lúc tung đòn tối hơn lúc gồng ở ô lóe).

### 2.2 I: lõi cộng sáng, lóe chạm, khối đục nhỏ lại

- **Lóe chạm 1 khung** khi đầu đạn tới quái (f010–f011), vẽ về phía camera; đầu đạn ở 25 % cuối đường bay cũng vẽ về phía camera, nên không lặn vào thân quái.
- **Khối đục** bằng 0,75 cỡ cú nổ và mỏng đi từ khung 2, để thấy quái lóe và giật.
- **Lõi cộng sáng HDR:** lõi trắng 0,28 cỡ cú nổ (≤ 30 % bán kính) trong quầng cam 0,75 cỡ, đủ 2 khung, nằm trên khối lửa.
- **Muội sau lưng khối lửa** từ khung 2.
- **Đòn thường có vòng riêng:** một vòng cam mảnh trên đất, 10 khung, khoảng 0,6 tầm vòng xanh ngọc của đòn mạnh.

### 2.3 A: khối tụ lửa phát sáng, báo trước đòn mạnh

- Một **lõi cộng sáng** lớn dần theo chữ (0,4 → 1,2 m × √k) trong **quầng cam rộng 2,75 lần lõi**, đặt trước đầu; dưới đó là hạt lửa nhỏ có viền tối; lưỡi lửa liếm lên.
- **Từ nửa từ trở đi, nếu từ chưa có lỗi, lõi chuyển dần sang xanh ngọc:** đòn mạnh được báo trước. Từ có lỗi giữ lõi vàng. Đây là chỗ khác nhau của đòn mạnh và đòn thường ở pha A.
- **2–3 đốm than mỗi chữ** bay vào miệng từ khoảng 60 px ngoài ở camera chơi 1080p, thành tia kéo dài.
- **Đốm sao lạc bên trái miệng** mà người chấm thấy là đốm T0 của mỗi phím, trước đây bay *ra* từ miệng tới quái. Giờ nó bay từ thẻ chữ của quái *vào* miệng, như §3.3 dòng "Phím gõ" ("đốm bay từ thẻ về nguồn").

### 2.4 T: đầu đạn ở miệng từ khung 0, vệt mảnh hơn

- Đầu đạn và vệt có ngay từ khung 0, nằm trong lóe miệng.
- Vệt mảnh hơn (0,5 m × k; đòn thường 0,36), mép bị nhiễu ăn mạnh hơn, thon về 0 ở đuôi. Than vẫn rơi dọc vệt (khoảng 8 đốm mỗi 10 khung).

### 2.5 F: viền tro và khe than HDR

- Vết cháy đen giữ nguyên tâm, thêm **viền tro xám** quanh mép: sáng hơn cỏ tối, tối hơn cỏ nắng, nên đọc được trên cả hai nền.
- **Khe than HDR** nguội trong 1,5 s: lớp vàng giữ 0,2 s rồi tắt ở 0,7 s, lớp đỏ giữ 0,6 s rồi tắt ở 1,5 s.
- **3–5 đốm than bay lên** trong 1–1,5 s; muội và khói xám như vòng 4.

### 2.6 Số sát thương và nhãn

- Số xuất phát ở đỉnh đầu quái cộng 0,15 m (vòng 4: 0,7 m, cao hơn đầu một thân quái); bộ số của kit nảy rồi bay lên.
- Nhãn trên số của đòn mạnh là **"PERFECT"** (luật tiếng Anh của 28/10). Làn làm bằng một bản sao hồ sơ `DRAGON` ở phía view; khi gộp main, giữ `NUMBER_FEEL` của main (cùng cách, cùng nhãn). Không sửa kit.

## 3. Số đo (§5.6)

Cảnh như các vòng trước (seed 20261028, từ "place", cùng con Moss Grunt), nhưng trên bản đồ của main. "Vòng 4" là `93152df` trên bản đồ cũ; "vòng 5" là commit cuối của vòng này trên bản đồ đã gộp.

**Ngưỡng §5.6:**

| Số đo | Ngưỡng | Đòn mạnh (8 tổ hợp) | Đòn thường (4 tổ hợp) |
|---|---|---|---|
| Khung đầu của lóe so với đỉnh (ô 18 px) | ≥ 95 % | 100 % | 100 % |
| `tools/vfx-sheet`, vòng 30 px × tỉ lệ | ≥ 95 % | 100 % | 100 % |
| Khung đầu của đèn miệng | ≥ 95 % | 100 % | 100 % |
| Trắng xóa (độ sáng ≥ 0,95) | ≤ 6 % | tối đa 0,27 % | tối đa 0,06 % |
| Lõi trắng / toàn hiệu ứng lúc tung đòn | ≤ 30 % | 11,5–19,9 % | 8,1–15,8 % |
| Thân sáng lúc tung đòn / đầu đạn | ≥ 1,5 lần | 2,27–4,49 | 3,31–4,36 |
| Tương phản thẻ chữ p99 | ≥ 7 : 1 | tối thiểu 9,86 : 1 | tối thiểu 9,96 : 1 |
| Đầu đạn ở 720p (cả vệt liền đầu) | ≥ 20 × 6 px | ≥ 105 × 33 px | ≥ 100 × 29 px |
| Phím cuối → đạn rời miệng, đồng hồ thật, 1080p High | ≤ 50 ms | tối đa 16,8 ms, trung bình 11,0 ms; độ trễ phím tối đa 20,7 ms | |

**Hộp đo của người chấm vòng 4** (độ sáng trung bình; 300 × 180 quanh miệng và nón ở `pre` → f000; 260 × 200 quanh quái ở f010 → f013; cỡ 1080p, thu theo tỉ lệ):

| Tổ hợp | Miệng, vòng 4 | Miệng, vòng 5 | Quái, vòng 4 | Quái, vòng 5 |
|---|---|---|---|---|
| Đòn mạnh, chơi, nắng | 0,617 → 0,616 | 0,726 → 0,720 | 0,632 → 0,530 | 0,678 → 0,648 |
| Đòn mạnh, chơi, tối | 0,341 → 0,437 | 0,423 → 0,540 | 0,380 → 0,400 | 0,434 → 0,471 |
| Đòn mạnh, cận, nắng | 0,563 → 0,577 | 0,704 → 0,710 | 0,659 → 0,567 | 0,712 → 0,702 |
| Đòn mạnh, cận, tối | 0,330 → 0,421 | 0,431 → 0,551 | 0,369 → 0,411 | 0,431 → 0,491 |
| Đòn thường, chơi, nắng | 0,616 → 0,625 | 0,724 → 0,721 | 0,632 → 0,597 | 0,665 → 0,657 |
| Đòn thường, chơi, tối | 0,341 → 0,410 | 0,422 → 0,494 | 0,376 → 0,388 | 0,413 → 0,425 |

- Bản đồ mới sáng hơn hẳn (bệ 0,72 so với 0,62). Trên nền sáng đó, thân lửa cam trộn thường tối hơn đá, nên trung bình hộp miệng gần như đứng yên dù lõi sáng rực; thử tăng lớp cộng sáng rộng thì bệ lại thành màu đào (lỗi của vòng 2). Tôi giữ lửa có màu và lõi nhỏ sáng, không đổi lấy độ sáng trung bình.
- Cú trúng trên nền nắng tối đi ít hơn hẳn vòng 4 (−0,03 so với −0,10); trên nền tối sáng lên rõ.

**Theo từng tổ hợp, đòn mạnh** (cột như vòng 3–4):

| Tổ hợp | Khung đầu / đỉnh | f0 − pre (ô lóe) | Trắng xóa | Lõi trắng / toàn hiệu ứng | Lõi trắng / thân sáng | Màu hộp bệ f0 (RGB, bão hòa, phần lửa, phần đỏ thẫm) | Đầu đạn | Thẻ chữ p01 | Vết xém còn thấy |
|---|---|---|---|---|---|---|---|---|---|
| 1280x720 cận tối, vòng 4 | 1 | 0,232 | 0,22 % | 0,038 | 0,074 | (146, 103, 68), 0,575, 0,561, 0,226 | 32 × 34 | 11,450 | 2,100 s |
| 1280x720 cận tối, vòng 5 | 1 | 0,109 | 0,22 % | 0,115 | 0,207 | (206, 151, 102), 0,529, 0,642, 0,063 | 105 × 35 | 11,040 | 2,100 s |
| 1280x720 cận nắng, vòng 4 | 1 | 0,213 | 0,24 % | 0,059 | 0,132 | (190, 145, 97), 0,527, 0,396, 0,083 | 107 × 39 | 10,130 | 2,350 s |
| 1280x720 cận nắng, vòng 5 | 1 | 0,026 | 0,26 % | 0,194 | 0,339 | (234, 186, 130), 0,463, 0,407, 0,012 | 107 × 37 | 9,860 | 2,350 s |
| 1280x720 chơi tối, vòng 4 | 1 | 0,293 | 0,11 % | 0,057 | 0,123 | (168, 120, 78), 0,566, 0,637, 0,169 | 103 × 35 | 11,620 | 2,100 s |
| 1280x720 chơi tối, vòng 5 | 1 | 0,122 | 0,11 % | 0,117 | 0,215 | (210, 155, 105), 0,523, 0,663, 0,050 | 108 × 33 | 11,180 | 2,100 s |
| 1280x720 chơi nắng, vòng 4 | 1 | 0,146 | 0,12 % | 0,090 | 0,448 | (210, 165, 113), 0,492, 0,319, 0,045 | 108 × 37 | 10,150 | 2,350 s |
| 1280x720 chơi nắng, vòng 5 | 1 | -0,006 | 0,12 % | 0,199 | 0,448 | (239, 191, 137), 0,442, 0,343, 0,001 | 109 × 35 | 9,960 | 2,350 s |
| 1920x1080 cận tối, vòng 4 | 1 | 0,231 | 0,23 % | 0,056 | 0,129 | (146, 103, 68), 0,577, 0,550, 0,214 | 48 × 50 | 11,410 | 2,100 s |
| 1920x1080 cận tối, vòng 5 | 1 | 0,107 | 0,24 % | 0,116 | 0,207 | (206, 151, 103), 0,530, 0,642, 0,063 | 158 × 52 | 11,040 | 2,100 s |
| 1920x1080 cận nắng, vòng 4 | 1 | 0,212 | 0,25 % | 0,063 | 0,155 | (190, 144, 97), 0,530, 0,393, 0,089 | 161 × 59 | 9,950 | 2,350 s |
| 1920x1080 cận nắng, vòng 5 | 1 | 0,022 | 0,27 % | 0,195 | 0,343 | (234, 186, 130), 0,464, 0,404, 0,014 | 161 × 54 | 9,860 | 2,350 s |
| 1920x1080 chơi tối, vòng 4 | 1 | 0,288 | 0,12 % | 0,060 | 0,128 | (169, 121, 78), 0,565, 0,637, 0,166 | 155 × 53 | 11,620 | 2,100 s |
| 1920x1080 chơi tối, vòng 5 | 1 | 0,107 | 0,12 % | 0,117 | 0,189 | (211, 155, 105), 0,523, 0,666, 0,050 | 161 × 49 | 11,190 | 2,100 s |
| 1920x1080 chơi nắng, vòng 4 | 1 | 0,147 | 0,13 % | 0,087 | 0,457 | (211, 165, 113), 0,492, 0,320, 0,049 | 161 × 55 | 10,250 | 2,350 s |
| 1920x1080 chơi nắng, vòng 5 | 1 | -0,011 | 0,13 % | 0,186 | 0,450 | (239, 191, 138), 0,441, 0,340, 0,001 | 163 × 51 | 9,970 | 2,350 s |

**Đòn thường:**

| Tổ hợp | Khung đầu / đỉnh | f0 − pre (ô lóe) | Trắng xóa | Lõi trắng / toàn hiệu ứng | Lõi trắng / thân sáng | Màu hộp bệ f0 (RGB, bão hòa, phần lửa, phần đỏ thẫm) | Đầu đạn | Thẻ chữ p01 | Vết xém còn thấy |
|---|---|---|---|---|---|---|---|---|---|
| 1280x720 chơi tối, vòng 4 | 1 | 0,202 | 0,05 % | 0,024 | 0,070 | (160, 115, 75), 0,562, 0,572, 0,173 | 102 × 31 | 11,620 | 1,850 s |
| 1280x720 chơi tối, vòng 5 | 1 | 0,135 | 0,05 % | 0,081 | 0,198 | (187, 138, 91), 0,540, 0,628, 0,078 | 104 × 29 | 11,180 | 2,100 s |
| 1280x720 chơi nắng, vòng 4 | 1 | 0,115 | 0,06 % | 0,036 | 0,177 | (208, 165, 113), 0,488, 0,291, 0,043 | 104 × 33 | 10,150 | 2,350 s |
| 1280x720 chơi nắng, vòng 5 | 1 | 0,025 | 0,06 % | 0,158 | 0,307 | (230, 185, 130), 0,457, 0,311, 0,004 | 100 × 29 | 9,960 | 2,350 s |
| 1920x1080 chơi tối, vòng 4 | 1 | 0,205 | 0,05 % | 0,010 | 0,029 | (161, 115, 75), 0,561, 0,572, 0,169 | 152 × 46 | 11,620 | 1,850 s |
| 1920x1080 chơi tối, vòng 5 | 1 | 0,124 | 0,05 % | 0,081 | 0,198 | (188, 138, 92), 0,539, 0,631, 0,080 | 154 × 44 | 11,190 | 2,100 s |
| 1920x1080 chơi nắng, vòng 4 | 1 | 0,120 | 0,05 % | 0,015 | 0,070 | (208, 165, 113), 0,488, 0,290, 0,045 | 156 × 49 | 10,250 | 2,350 s |
| 1920x1080 chơi nắng, vòng 5 | 1 | 0,025 | 0,06 % | 0,155 | 0,314 | (230, 185, 131), 0,456, 0,309, 0,006 | 149 × 44 | 9,970 | 2,350 s |

- Diện tích màu lửa ở quái so với ở miệng, đòn mạnh: 1,19–1,21 trên nền nắng, 0,75–0,85 trên nền tối (trên nền tối, đèn miệng hắt cam lên bệ được tính vào phía miệng).

## 4. Hiệu năng

Một lượt `heavy.sh --perf`, 04:58–05:06, tải máy 4,8–6,3. Trong cùng lượt: **Dragonhold main `4f61c6e`** (bản đồ đã gộp, VFX cũ) rồi bản vòng 5 sau khi gộp main (`7b518d4`). Các commit sau đó (`13f4cdd`, commit cuối) chỉ đổi cường độ, cỡ và thêm một flare 1 khung lúc tung đòn; chi phí coi như như nhau.

**Lưu ý:** bản đồ mới của main nhẹ hơn hẳn bản đồ cũ (main đo 4,71 ms, bản `25160fe` trên bản đồ cũ đo 7,05 ms ở vòng 4). Vì vậy số tuyệt đối vòng 5 không so được với các vòng trước; so với main trong cùng lượt.

| Bản | Đợt 1 | Đợt 2 | Đợt 3 | Ba đợt (TB / p95, ms) | Khung dài nhất | Draw call |
|---|---|---|---|---|---|---|
| Main `4f61c6e`, không bloom, có đèn | 4,60 / 7,2 | 4,79 / 7,4 | 4,73 / 7,5 | 4,71 / 7,4 | 11,2 | 60–62 |
| **Vòng 5, không bloom, có đèn (mặc định High)** | 4,79 / 7,1 | 5,21 / 7,7 | 4,86 / 7,4 | **4,95 / 7,4** | 12,3 | 61–63 |
| Vòng 5, không bloom, không đèn | 4,67 / 7,5 | 4,73 / 7,3 | 4,66 / 7,1 | 4,69 / 7,3 | 10,7 | 61–63 |
| Vòng 5, bloom, không đèn | 5,89 / 8,6 | 5,92 / 8,8 | 6,19 / 9,0 | 6,00 / 8,8 | 19,9 | 74–76 |
| Vòng 5, bloom, có đèn | 6,35 / 9,1 | 6,32 / 9,2 | 6,27 / 9,0 | 6,31 / 9,1 | 18,1 | 74–76 |

- Cả bốn tổ hợp trong cổng 8 / 12 ms. Mặc định High chậm hơn main 0,24 ms trung bình; p95 bằng nhau.
- Với bản đồ mới, **bloom có đèn cũng vừa cổng với biên rộng** (6,31 ms). Đây là câu hỏi cho anh: có bật bloom ở High không (§6.2 a)? Tôi chưa đổi `stage.ts` (ngoài làn).

**Bench 220 quái có xương:**

| Bản | TB / p95 (ms) | Khung dài nhất | Draw call |
|---|---|---|---|
| Main `4f61c6e`, không bloom, có đèn | 6,31 / 9,4 | **14,0** | 80 |
| Vòng 5, không bloom, có đèn | 6,50 / 9,8 | **299,8** | 96 |
| Vòng 5, bloom, có đèn | 7,87 / 11,1 | 331,9 | 104 |

- **Khung dài đơn lẻ 300–330 ms chỉ có ở bản của làn VFX**, main không có (14 ms). Bench ném Sky Fire 4 s một lần, nên rất có thể đó là lần đầu một vật liệu của Sky Fire (vỏ nón, vòm, đá, mảnh, vết nứt, vòng rune) hoặc kho tia kéo dài được biên dịch hay tải lên GPU, dù `warm()` đã biên dịch trước. Không thấy trong trận thật (`dh-perf` dài nhất 12,3 ms). Cần một trace để chỉ đúng chỗ (mục 7).
- Draw call bench +16 so với main: lưỡi lửa (thường và nóng), sợi khói theo đạn, vỏ nón, kho tia kéo dài, cộng các lớp Sky Fire khi nó nổ. Dưới trần +32 của High.

## 5. Tờ khung và clip

Dưới `games/.wt-dh-vfx/tmp/vfx/final5/` (Git bỏ qua). Hàng TRƯỚC là vòng 4 (`93152df`, bản đồ cũ), hàng SAU là vòng 5 (bản đồ đã gộp). Ghép bằng `tools/vfx-sheet`.

- `strong/{1280x720,1920x1080}-{play,close}-{light,dark}-{before-after,mouth-before-after,foe-before-after,beside-reference}.jpg`
- `plain/{1280x720,1920x1080}-play-{light,dark}-…` cùng bộ
- `clip-r4-r5-tight-3s.mp4`, `clip-r4-r5-tight-halfspeed.mp4`, `clip-r5-1920x1080.mp4`
- Số đo: `report-r5-strong.json`, `report-r5-plain.json` (và `report-r4-*.json`), `vfx-sheet-r5*.json`, `judge-boxes-and-fire-area.txt`.
- Khung thô vòng 4 và vòng 5 đã dọn sau khi ghép tờ (theo yêu cầu của điều phối viên).

## 6. Bản giảm chuyển động (§3.8)

Như vòng 4; thêm: lõi nóng và quầng của khối tụ ×0,7; lõi cộng sáng của cú nổ và lóe miệng ×0,6; dải lửa cộng sáng ×0,6.

## 7. Còn mở

1. **Người chấm độc lập** cho vòng 5: điều phối viên chạy.
2. **Độ sáng trung bình quanh miệng trên bệ đá sáng** gần như không tăng lúc tung đòn (mục 3). Nếu người chấm vẫn coi đó là lỗi, cách tiếp theo là cho lớp muội ở gốc nón đậm hơn để lõi nổi lên bằng tương phản, không phải bằng một lớp cộng sáng rộng.
3. **Khung dài đơn lẻ 300–330 ms trên bench** chỉ có ở bản của làn (main 14 ms). Nghi là lần đầu một vật liệu của Sky Fire được dùng; cần trace.
4. **Bloom ở High:** trên bản đồ mới, bloom có đèn chỉ 6,31 ms. Câu hỏi cho anh.
5. **Tương phản thẻ chữ** vẫn chưa được thử thật trong đòn chữ (Sky Fire có 2–3 thẻ trên màn: ≥ 9,94 : 1).
6. Không push, không merge vào main.
