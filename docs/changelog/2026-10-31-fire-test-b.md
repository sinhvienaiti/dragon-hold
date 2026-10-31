# 31/10/2026 · Thử nghiệm lửa B (nửa ngày): cú trúng của đòn mạnh từ clip hoạt hình (cel) trong suốt

Nhánh `dh-fire-b` trong `games/.wt-dh-fire-a`, đi từ `38834b2` (thử nghiệm A). Làm theo §2 cách B và §3 (bàn thử, số đo, cách chấm) của `docs/games/vfx/DRAGON_FIRE_DIAGNOSIS_2026-10-31.md` (repo cha). Chủ dự án duyệt ngày 31/10: "Làm thử B".

- **Phạm vi:** chỉ đòn chữ MẠNH (Hoàn hảo): pha va chạm (I) và pha dư âm (F). Nhả, bay, nhịp thời gian, dừng hình và số sát thương giữ như vòng 10 và cách A.
- **Công tắc:** `?fire=b` bật cách B. Mặc định trên nhánh vẫn là cách A; `?fire=r10` vẫn vẽ vòng 10. Ba bản chụp được cạnh nhau trên cùng một bàn thử.
  - Khi bật B, đòn chữ thường (không Hoàn hảo) đi đường vòng 10, vì B chỉ thay đòn mạnh.
- **Nguồn:** ba clip Firefly Video nền trong suốt chủ dự án đã duyệt (`FIREFLY_VFX_LIST.md` §5, công cụ của repo cha đã cắt ở commit `4e851ee4`), đọc từ `~/VFXLab/out/dragon-hold/` (chỉ đọc):
  - `impact-cel__v2`: vụ nổ kiểu anime, 29 khung, 24 fps, alpha thẳng thật, ô 512;
  - `smoke-cel__v2`: khói cel, 24 khung, 12 fps, ô 256;
  - `scorch.png` của phiếu 038 (`games/dragon-hold/art-src/vfx`, chỉ đọc).
- **Sim không đổi:** không sửa `src/sim`, `src/content`, `src/typing`, `src/kit`, `tests`.
  - `pnpm check` đạt: 58 tệp, 509 phép thử, golden 10/10; build đạt.
- **Không có media trong Git.** Atlas mới nằm ở `public/assets/dragon-hold/vfx/fire-b/` (bị bỏ qua), làm bằng `scripts/assets/prepare-fire-b.mjs`.

## 1. Chọn clip: v2, không dùng v3

- **v2 (vụ nổ toả tròn):** lóe trắng, sao nổ, vòng rỗng, vỡ ra. Hình toả đều quanh tâm, hợp với cú trúng vào giữa thân một con quái. Có đủ bậc nhiệt trong nét vẽ (trắng, vàng, cam, đỏ) để tô lại theo dải.
- **v3 (nấm lửa):** cột lửa đứng trên mặt đất (tâm xoay ở đáy, 0,80), cao hơn rộng. Ở cỡ 1,6–2,2 lần chiều cao quái, cột này sẽ trùm lên quái lâu, đúng lỗi của cách A. Ngoài khung 0–2 thì v3 không có lõi trắng-vàng, thân là một mảng vàng-cam phẳng có viền mực đen (nhìn rõ trên nền sáng). 12 fps nên giật khi chạy nhanh.
- **Kết luận:** dùng v2 cho đòn chữ. v3 hợp hơn cho Hỏa Thiên (Sky Fire), vì chẩn đoán đã đòi một cột hoặc nấm lửa không đối xứng cho nó. **v3 chưa được thử trong game**; lựa chọn này dựa trên sheet của công cụ.

## 2. Bảy bước

| # | Bước | Đã làm |
|---|---|---|
| 1 | Va chạm từ `impact-cel` v2, alpha thật, trộn thường, quầng cộng bên dưới, dải nhiệt, lõi trắng ≤ 30 % bán kính, không ăn mòn | **Xong** (`fireB` trong `flipbook.ts`, `wordHitB` trong `fx.ts`, `prepare-fire-b.mjs`). <ul><li>**Tô lại ngoại tuyến** theo một dải nhiệt: trắng ấm → vàng → cam → đỏ → đỏ thẫm, không có màu than.<ul><li>Độ nóng lấy từ chính nét vẽ (sắc độ và độ sáng của từng điểm).</li><li>Độ nóng bị chặn theo độ sâu của điểm trong khối nổ, đo bằng khoảng cách tới mép. Tia và viền chỉ tới vàng-cam, thân vàng, trắng chỉ ở lõi sâu.</li><li>Lõi trắng (luma ≥ 0,9) chiếm 0,25–0,27 bán kính ở các ô 6–22 (nguồn: 0,55–0,65).</li><li>Vệt tối trong thân được nâng thành vàng. Viền ngoài là một nét đỏ thẫm mảnh (dải giá trị tối, nhưng vẫn nóng, không phải than).</li><li>Đĩa khói khaki trong lòng vòng (ô 23–26) bị cắt thành trong suốt, mép mềm, nên không còn ô liu.</li></ul></li><li>**Trong game:**<ul><li>khung đứng theo nhịp (cel), không trộn hai khung (trộn thì nét vẽ bị bóng ma);</li><li>mép alpha cắt gọn khoảng 1 px;</li><li>nét hơi rung theo từng khung (boil), nên tia không chạy thẳng đơ.</li></ul></li><li>**Thứ tự chạy:**<ul><li>ô 6–22 chạy nhanh ×1,75 (khoảng 0,40 s);</li><li>vòng rỗng và lúc vỡ (ô 23–28) chạy ×1,2 (khoảng 0,21 s). Vòng mảnh cuối cùng để lâu thì trông như cái vòng đai.</li></ul></li><li>**Kết thúc:** chính nét vẽ vỡ ra là hết, **không ăn mòn kiểu đốt giấy** như cách A, không mờ dần. Shader vẫn có mờ theo bậc 1/3 (toon) cho sprite nào được đặt mờ; cú trúng B không dùng.</li><li>**Quầng nhiệt:** `halo-b`, ảnh ô 16 đã tô lại, làm mờ, chuyển sang cam, vẽ cộng sáng bên dưới thân trong 24 khung. Bậc High không có bloom nên quầng này thay cho glow.</li><li>**Tia văng:** giữ các tia (comet) của cách A, phóng từ khối nổ phía sau quái, màu vàng nóng.<ul><li>Bỏ các đốm than đuôi tối: đuôi muội của chúng trên cỏ thành que khaki (ô liu), và đầu cam sáng bị tone map thành màu đào.</li></ul></li></ul> |
| 2 | Cỡ và thứ tự: đỉnh khoảng 1,6–2,2 lần chiều cao quái, tâm ở điểm trúng; rồng và quân đứng trên hiệu ứng | **Xong.** <ul><li>Billboard 2,75 m × k. Đường kính tương đương ở đỉnh đo được **1,81–1,90 lần chiều cao quái** trên cả 6 lần chụp.</li><li>Tâm ở điểm trúng, nâng 0,35 m theo hướng "lên" của camera, không đổi độ sâu.</li><li>**Khoảng 4 khung đầu** (ô 6–8, quả cầu trắng) vẽ **trước** quái: đó là lóe của cú trúng, và lõi trắng nhìn thấy được. Nếu đặt sau quái thì thân quái che mất lõi.</li><li>Từ khoảng f+5, khối nổ nằm **ngay sau giữa thân quái**, nên quái đứng trước sao nổ.<ul><li>Độ sâu dịch bằng "lift chính xác": sprite chiếu đúng chỗ, chỉ độ sâu thay đổi.</li></ul></li><li>Lửa che ≥ 50 % quái: **5 khung** ở mọi lần chụp (cách A che f0–f+18).</li><li>Rồng trên bệ (bàn thử cát): phần rồng nằm dưới lửa hoặc khói tối đa 2,9–3,3 %, không khung nào quá 5 %.<ul><li>Đo bằng mặt nạ mới `mask("heroes")`: các mesh đặc của rồng vẽ lại đúng như chúng hiện ra.</li></ul></li></ul> |
| 3 | Khói `smoke-cel` v2 bốc lên từ chỗ cháy từ khoảng f+12, sau lửa, không lớn hơn lửa, sáng tối nhất quán, không che số hay quái quá 10 khung, ẩn các ô đỉnh phẳng | **Xong** (chế độ `smokeB`). <ul><li>**Tô lại ngoại tuyến:**<ul><li>chỉ giữ ô 0–17 (6 ô cuối có đỉnh phẳng);</li><li>vòng viền tối của nét vẽ được thay bằng màu ngay bên trong nó;</li><li>tô sang một dải xám ấm theo độ sáng của chính nó. Đầu than được nâng lên xám vừa, vì một đám than sau quái trông như hòn đá.</li></ul></li><li>Một đám khói, sinh ở f+12, đứng sau quái 0,35 m, bay lên 0,75 m/s và trôi ra xa, sống 96 khung.</li><li>Sáng theo nét vẽ (đỉnh sáng), cộng thêm 22 % ở phía mặt trời trên màn hình.</li><li>Từ nửa đời, khói **co lại** theo một ngưỡng chạy trên độ phủ đã làm mờ, phần mỏng và mép đi trước. Khói không mờ thành xám trong suốt, vì như thế trên cỏ sẽ thành ô liu.</li><li>Hết trước khi tới các ô đỉnh phẳng.</li></ul> |
| 4 | Vết cháy: đất cháy nâu ấm, mép than hồng nguội dần, không đen tuyền, mép mềm, tắt hẳn khoảng 2,5 s; không cháy trước khi lửa chạm đất | **Xong** (chế độ `decalB`). <ul><li>`scorch-b.webp` là tranh 038 dưới dạng dữ liệu:<ul><li>A: một vùng phủ tròn, mềm;</li><li>R: chi tiết của nét vẽ;</li><li>G: một trường giảm rộng, quyết định thứ tự co lại.</li></ul></li><li>Màu do game tô: nâu đất ấm #604e42, sáng tối theo nét vẽ, **không có điểm đen**.</li><li>Mép than hồng #ff6a1a ở viền và ở mặt trước đang lan: cam trong khoảng 0,1 s đầu, nguội về đỏ sẫm trong khoảng 0,9 s, rồi về nâu.</li><li>**Thời gian:**<ul><li>hiện 6 khung sau cú trúng, lan ra từ tâm;</li><li>giữ nguyên;</li><li>từ 42 % đời co dần về tâm;</li><li>hết ở 2,5 s.</li></ul></li><li>Nằm dưới khối nổ, chỉ ở chỗ lửa phủ. Không có vòng than nào trước khi lửa tới đất (đã bỏ vòng than của cách A).</li><li>Trên nước thì là hơi nước, như vòng 10.</li></ul> |
| 5 | Nhả, bay, nhịp, dừng hình, số sát thương như vòng 10 / A | **Giữ nguyên.** Chỉ thêm: quầng lúc nhả của cách A cũng bật khi `?fire=b`. |
| 6 | Chụp trên bàn thử của A cho B, A, vòng 10; chạy cổng; clip và sheet mù | **Xong** (§3, §4). <ul><li>Kịch bản `dh-fire-bench.mjs` có thêm biến thể `b` và mặt nạ rồng `hero-s###.png`.</li><li>Chụp tới f0+160 (`S_END=175`), để thấy vết cháy tắt.</li><li>`fire-gates.mjs` có thêm các cổng mới (xem §3).</li><li>`fire-sheets.mjs` có chế độ mù (`--blind <key.json>`).</li></ul> |
| 7 | Nhật ký, commit, dọn khung thô | Tệp này. Khung thô đã xóa bằng `tools/capture-prune/prune.mjs`. |

## 3. Bàn thử và các cổng mới

- **Bàn thử:** như cách A.
  - `?bench=fire`, bản đồ L2-cau, camera chơi, cùng một Moss Grunt ở ba nền: bến lội, cát cạnh bệ rồng, nền tối (bóng hoàng hôn).
  - Đồng hồ giữ ở 60 fps; 1280×720 và 1920×1080.
  - Ba biến thể chụp cùng một lượt: `b`, `a`, `r10`.
- **Cổng mới trong `fire-gates.mjs`** (đo đúng các lỗi giám khảo bắt ở cách A):
  - **Cỡ:** đường kính tương đương của lửa lúc lớn nhất (f0…f+40), chia cho chiều cao quái trên màn hình. Ngưỡng 1,6–2,2.
  - **Lửa che quái:** số khung lửa che ≥ 50 % điểm ảnh của quái. Ngưỡng ≤ 10.
  - **Rồng dưới hiệu ứng:** phần điểm ảnh của rồng nằm dưới lửa hoặc khói. Ngưỡng ≤ 5 %, không khung nào vượt.
  - **Đen gần:** v < 0,12 trong lòng hiệu ứng (vết mực). Ngưỡng ≤ 0,01.
  - **Than trước lửa:** điểm tối ngoài mặt nạ lửa ở f0–f+6. Ngưỡng ≤ 0,02.
  - **Còn lại ở 2,5 s:** điểm ảnh đổi quanh chân quái ở f+150, so với lúc nhiều nhất (f+30…f+90). Ngưỡng ≤ 0,05.
  - **Khói từ:** khung đầu tiên có khói.
  - **Ô liu trên điểm ảnh đổi:** không lấp lỗ. Cổng ô liu của A lấp lỗ trong mặt nạ, nên nền nhìn qua lòng vòng của B cũng bị tính.
- Các cổng của cách A giữ nguyên định nghĩa, nên số của ba biến thể so được với nhau.

## 4. Số đo (mỗi nền × mỗi cỡ)

✓ đạt, ✗ trượt. Ô liu "khung lửa tàn" là cổng của cách A (từ f0 tới khi mặt nạ lửa còn dưới 5 % đỉnh). Bảng đủ từng lượt chụp nằm ở `tmp/vfx/test-b/numbers/gates.md`. Cách A và vòng 10 được chụp lại cùng lượt với B (tới f+160), nên số của chúng lệch nhẹ so với nhật ký của cách A.

### Cách B (`?fire=b`)

| Số đo (ngưỡng) | 720 bến | 720 cát | 720 tối | 1080 bến | 1080 cát | 1080 tối |
|---|---|---|---|---|---|---|
| Ô liu, khung lửa tàn (≤ 0,02) | 0,003 ✓ | 0 ✓ | 0,147 ✗ | 0,001 ✓ | 0 ✓ | 0,104 ✗ |
| Ô liu, điểm ảnh đổi (≤ 0,02) | 0,086 ✗ | 0,076 ✗ | 0,194 ✗ | 0,036 ✗ | 0,017 ✓ | 0,162 ✗ |
| Bóng nâu từ f+15 (≤ 0,03) | 0,015 ✓ | 0,012 ✓ | 0,009 ✓ | 0,004 ✓ | 0,002 ✓ | 0,006 ✓ |
| Cạnh thẳng px (≤ 20 @1080) | 20,6 | 20 | 21 | 22 ✗ | 25 ✗ | 24 ✗ |
| Viền (≤ 0,30) | 0,554 ✗ | 0,528 ✗ | 0,427 ✗ | 0,545 ✗ | 0,507 ✗ | 0,436 ✗ |
| Thân − nền (≥ 0,15) | 0,139 ✗ | 0,187 ✓ | 0,449 ✓ | 0,142 ✗ | 0,185 ✓ | 0,448 ✓ |
| Lõi p90 (≥ 0,90) | 0,926 | 0,936 | 0,936 | 0,928 | 0,936 | 0,936 |
| Lõi trắng r/R (≤ 0,30) | 0,246 | 0,253 | 0,277 | 0,314 | 0,276 | 0,277 |
| Trắng cả khung (≤ 6 %) | 0,0012 ✓ | 0,001 ✓ | 0,001 ✓ | 0,0014 ✓ | 0,0012 ✓ | 0,0013 ✓ |
| Màu lõi 35–55° (@1080) | 45,7 | 46,3 | 46,3 | 46,2 ✓ | 46,6 ✓ | 46,9 ✓ |
| Đào (≤ 0,02) | 0,003 ✓ | 0,03 ✗ | 0,006 ✓ | 0,01 ✓ | 0,019 ✓ | 0,003 ✓ |
| Khói / lửa (≤ 1) | 0,64 ✓ | 0,66 ✓ | 0,68 ✓ | 0,66 ✓ | 0,67 ✓ | 0,66 ✓ |
| Khói che quái / số (≤ 10) | 0 / 0 ✓ | 0 / 0 ✓ | 0 / 0 ✓ | 0 / 0 ✓ | 0 / 0 ✓ | 0 / 0 ✓ |
| Khói sáng − tối (≥ 0,12) | 0,194 ✓ | 0,184 ✓ | 0,165 ✓ | 0,21 ✓ | 0,178 ✓ | 0,177 ✓ |
| Khói giảm 1 khung (≤ 0,25) | 0,15 ✓ | 0,15 ✓ | 0,14 ✓ | 0,15 ✓ | 0,15 ✓ | 0,15 ✓ |
| IoU(f, f+4) (≤ 0,85) | 0,826 ✓ | 0,801 ✓ | 0,816 ✓ | 0,82 ✓ | 0,797 ✓ | 0,818 ✓ |
| Khung đầu / đỉnh (≥ 0,95) | 1 ✓ | 1 ✓ | 0,99 ✓ | 1 ✓ | 1 ✓ | 0,887 ✗ |
| Cỡ: đường kính / cao quái (1,6–2,2) | 1,85 ✓ | 1,84 ✓ | 1,9 ✓ | 1,81 ✓ | 1,81 ✓ | 1,9 ✓ |
| Lửa che ≥ 50 % quái, khung (≤ 10) | 5 ✓ | 5 ✓ | 5 ✓ | 5 ✓ | 5 ✓ | 5 ✓ |
| Rồng dưới hiệu ứng, max / khung | – (không chồng lên rồng) ✓ | 0,029 / 0 ✓ | 0 / 0 ✓ | – (không chồng lên rồng) ✓ | 0,033 / 0 ✓ | 0 / 0 ✓ |
| Đen gần (v < 0,12) (≤ 0,01) | 0 ✓ | 0 ✓ | 0 ✓ | 0 ✓ | 0 ✓ | 0 ✓ |
| Than trước lửa f0–f+6 (≤ 0,02) | 0 ✓ | 0 ✓ | 0 ✓ | 0 ✓ | 0 ✓ | 0 ✓ |
| Khói từ | f+12 | f+13 | f+12 | f+12 | f+18 | f+12 |
| Còn lại ở 2,5 s (≤ 0,05) | 0,005 ✓ | 0 ✓ | 0 ✓ | 0 ✓ | 0 ✓ | 0 ✓ |

### Cách A (cùng lượt chụp)

| Số đo (ngưỡng) | 720 bến | 720 cát | 720 tối | 1080 bến | 1080 cát | 1080 tối |
|---|---|---|---|---|---|---|
| Ô liu, khung lửa tàn (≤ 0,02) | 0,058 ✗ | 0,02 ✓ | 0,011 ✓ | 0,122 ✗ | 0,025 ✗ | 0,025 ✗ |
| Ô liu, điểm ảnh đổi (≤ 0,02) | 0,132 ✗ | 0,065 ✗ | 0,038 ✗ | 0,18 ✗ | 0,069 ✗ | 0,046 ✗ |
| Bóng nâu từ f+15 (≤ 0,03) | 0,017 ✓ | 0,022 ✓ | 0,014 ✓ | 0,014 ✓ | 0,028 ✓ | 0,033 ✗ |
| Cạnh thẳng px (≤ 20 @1080) | 21,1 | 19 | 23 | 25 ✗ | 24 ✗ | 25 ✗ |
| Viền (≤ 0,30) | 0,561 ✗ | 0,571 ✗ | 0,413 ✗ | 0,578 ✗ | 0,594 ✗ | 0,414 ✗ |
| Thân − nền (≥ 0,15) | 0,008 ✗ | -0,082 ✗ | 0,275 ✓ | 0,007 ✗ | -0,077 ✗ | 0,278 ✓ |
| Lõi p90 (≥ 0,90) | 0,919 | 0,938 | 0,858 | 0,913 | 0,938 | 0,866 |
| Lõi trắng r/R (≤ 0,30) | 0,291 | 0,331 | 0,1 | 0,331 | 0,361 | 0,125 |
| Trắng cả khung (≤ 6 %) | 0,0015 ✓ | 0,0011 ✓ | 0,0006 ✓ | 0,0018 ✓ | 0,0013 ✓ | 0,0007 ✓ |
| Màu lõi 35–55° (@1080) | 35,3 | 36,5 | 34,9 | 35 ✗ | 36,5 ✓ | 34,7 ✗ |
| Đào (≤ 0,02) | 0,027 ✗ | 0,03 ✗ | 0,019 ✓ | 0,028 ✗ | 0,029 ✗ | 0,029 ✗ |
| Khói / lửa (≤ 1) | 0,22 ✓ | 0,21 ✓ | 0,21 ✓ | 0,22 ✓ | 0,21 ✓ | 0,21 ✓ |
| Khói che quái / số (≤ 10) | 0 / 0 ✓ | 0 / 0 ✓ | 0 / 0 ✓ | 0 / 26 ✓ | 0 / 0 ✓ | 8 / 0 ✓ |
| Khói sáng − tối (≥ 0,12) | 0,16 ✓ | 0,13 ✓ | 0,193 ✓ | 0,117 ✗ | 0,121 ✓ | 0,193 ✓ |
| Khói giảm 1 khung (≤ 0,25) | 0,19 ✓ | 0,19 ✓ | 0,19 ✓ | 0,16 ✓ | 0,19 ✓ | 0,19 ✓ |
| IoU(f, f+4) (≤ 0,85) | 0,822 ✓ | 0,825 ✓ | 0,817 ✓ | 0,836 ✓ | 0,817 ✓ | 0,83 ✓ |
| Khung đầu / đỉnh (≥ 0,95) | 1 ✓ | 1 ✓ | 0,801 ✗ | 1 ✓ | 1 ✓ | 0,817 ✗ |
| Cỡ: đường kính / cao quái (1,6–2,2) | 5,35 ✗ | 5,49 ✗ | 5,64 ✗ | 5,25 ✗ | 5,45 ✗ | 5,62 ✗ |
| Lửa che ≥ 50 % quái, khung (≤ 10) | 20 ✗ | 20 ✗ | 21 ✗ | 21 ✗ | 21 ✗ | 20 ✗ |
| Rồng dưới hiệu ứng, max / khung | – (không chồng lên rồng) ✓ | 0,782 / 52 ✗ | 0 / 0 ✓ | – (không chồng lên rồng) ✓ | 0,732 / 52 ✗ | 0 / 0 ✓ |
| Đen gần (v < 0,12) (≤ 0,01) | 0,052 ✗ | 0,064 ✗ | 0,034 ✗ | 0,049 ✗ | 0,028 ✗ | 0,046 ✗ |
| Than trước lửa f0–f+6 (≤ 0,02) | 0,044 ✗ | 0,015 ✓ | 0,001 ✓ | 0,026 ✗ | 0,013 ✓ | 0,029 ✗ |
| Khói từ | f+2 | f+2 | f+2 | f+2 | f+2 | f+2 |
| Còn lại ở 2,5 s (≤ 0,05) | 0,736 ✗ | 0,818 ✗ | 0,618 ✗ | 0,776 ✗ | 0,755 ✗ | 0,752 ✗ |

### Vòng 10 (`?fire=r10`, cùng lượt chụp)

| Số đo (ngưỡng) | 720 bến | 720 cát | 720 tối | 1080 bến | 1080 cát | 1080 tối |
|---|---|---|---|---|---|---|
| Ô liu, khung lửa tàn (≤ 0,02) | 0,222 ✗ | 0,115 ✗ | 0,09 ✗ | 0,211 ✗ | 0,136 ✗ | 0,123 ✗ |
| Ô liu, điểm ảnh đổi (≤ 0,02) | 0,297 ✗ | 0,16 ✗ | 0,175 ✗ | 0,271 ✗ | 0,164 ✗ | 0,18 ✗ |
| Bóng nâu từ f+15 (≤ 0,03) | 0,074 ✗ | 0,171 ✗ | 0,13 ✗ | 0,086 ✗ | 0,089 ✗ | 0,134 ✗ |
| Cạnh thẳng px (≤ 20 @1080) | 20 | 25 | 27,1 | 25,1 ✗ | 25 ✗ | 28 ✗ |
| Viền (≤ 0,30) | 0,547 ✗ | 0,564 ✗ | 0,403 ✗ | 0,561 ✗ | 0,553 ✗ | 0,401 ✗ |
| Thân − nền (≥ 0,15) | -0,042 ✗ | -0,128 ✗ | 0,246 ✓ | -0,03 ✗ | -0,114 ✗ | 0,259 ✓ |
| Lõi p90 (≥ 0,90) | 0,952 | 0,973 | 0,939 | 0,953 | 0,973 | 0,941 |
| Lõi trắng r/R (≤ 0,30) | 0,325 | 0,339 | 0,182 | 0,347 | 0,361 | 0,221 |
| Trắng cả khung (≤ 6 %) | 0,0016 ✓ | 0,0012 ✓ | 0,0008 ✓ | 0,0019 ✓ | 0,0015 ✓ | 0,0009 ✓ |
| Màu lõi 35–55° (@1080) | 36,3 | 37 | 39,6 | 36,7 ✓ | 36,7 ✓ | 40,3 ✓ |
| Đào (≤ 0,02) | 0,034 ✗ | 0,098 ✗ | 0,021 ✗ | 0,034 ✗ | 0,078 ✗ | 0,026 ✗ |
| Khói / lửa (≤ 1) | 1,35 ✗ | 1,36 ✗ | 1,37 ✗ | 1,35 ✗ | 1,36 ✗ | 1,37 ✗ |
| Khói che quái / số (≤ 10) | 39 / 10 ✗ | 45 / 0 ✗ | 32 / 0 ✗ | 45 / 12 ✗ | 46 / 8 ✗ | 51 / 6 ✗ |
| Khói sáng − tối (≥ 0,12) | 0,036 ✗ | 0,036 ✗ | 0,028 ✗ | 0,044 ✗ | 0,044 ✗ | 0,03 ✗ |
| Khói giảm 1 khung (≤ 0,25) | 0,56 ✗ | 0,56 ✗ | 0,56 ✗ | 0,56 ✗ | 0,56 ✗ | 0,56 ✗ |
| IoU(f, f+4) (≤ 0,85) | 0,809 ✓ | 0,803 ✓ | 0,801 ✓ | 0,796 ✓ | 0,802 ✓ | 0,801 ✓ |
| Khung đầu / đỉnh (≥ 0,95) | 1 ✓ | 1 ✓ | 0,799 ✗ | 1 ✓ | 1 ✓ | 0,795 ✗ |
| Cỡ: đường kính / cao quái (1,6–2,2) | 4,48 ✗ | 4,59 ✗ | 4,73 ✗ | 4,46 ✗ | 4,58 ✗ | 4,72 ✗ |
| Lửa che ≥ 50 % quái, khung (≤ 10) | 16 ✗ | 16 ✗ | 16 ✗ | 16 ✗ | 16 ✗ | 16 ✗ |
| Rồng dưới hiệu ứng, max / khung | – (không chồng lên rồng) ✓ | 0,761 / 63 ✗ | 0 / 0 ✓ | – (không chồng lên rồng) ✓ | 0,735 / 63 ✗ | 0 / 0 ✓ |
| Đen gần (v < 0,12) (≤ 0,01) | 0 ✓ | 0 ✓ | 0,011 ✗ | 0 ✓ | 0 ✓ | 0,019 ✗ |
| Than trước lửa f0–f+6 (≤ 0,02) | 0,001 ✓ | 0 ✓ | 0 ✓ | 0 ✓ | 0 ✓ | 0 ✓ |
| Khói từ | f+10 | f+10 | f+10 | f+10 | f+10 | f+10 |
| Còn lại ở 2,5 s (≤ 0,05) | 0,511 ✗ | 0,085 ✗ | 0,101 ✗ | 0,4 ✗ | 0,061 ✗ | 0,079 ✗ |

Ghi chú đọc bảng:
- **Lõi:** cổng "lõi" của cách A đòi cả p90 ≥ 0,90 lẫn r/R ≤ 0,30. Cách B đạt cả hai ở 5/6 lần đo; trượt ở 1080 bến (r/R 0,314). Cách A đạt 0/6, vòng 10 đạt 2/6 (chỉ ở nền tối).
- **Khói che quái / số:** dấu ✓ ✗ là của cổng cũ, chỉ xét khung khói che quái. Số khung che số sát thương ghi bên cạnh để tham khảo.
- **Rồng dưới hiệu ứng:** chỉ có ý nghĩa ở bàn thử cát, nơi rồng trên bệ nằm gần quái trên màn hình.


## 5. Các kiểm tra khác

- **Lóe khi nhả, khung đầu so với đỉnh (≥ 95 %):** game thật, kịch bản `dh-vfx-word` với `QUERY=fire=b`, camera chơi, nền sáng và nền tối, 720 và 1080.
  - Cách B: 97,5–98,3 %. Cách A: 97,3–98,4 %. Pha nhả không đổi.
- **Tương phản thẻ chữ p01 (≥ 7 : 1):** 9,96–11,19 : 1, bằng cách A.
- **Trắng xóa cả khung:** tối đa 0,20 %.
- **`dh-perf`, High 1920×1080, bot chơi tới đợt 5, Chrome không khóa nhịp:**

| Lượt | Trung bình mỗi đợt (ms) | p95 mỗi đợt (ms) |
|---|---|---|
| B, lượt 1 | 3,49–3,65 | 4,4–4,9 |
| A, cùng phiên | 3,50–3,93 | 4,6–5,2 |
| B, lượt 2 | 3,48–3,49 (một đợt 4,73) | 4,5–4,6 (đợt đó 6,5) |

  - Ngưỡng ≤ 8 ms trung bình và ≤ 12 ms p95: đạt.
  - Lượt 1 của B chạy cùng lúc với việc dựng sheet (ffmpeg). Đợt 4,73 / 6,5 ms của lượt 2 là một lần giật lẻ của máy dùng chung; ba đợt còn lại của lượt đó là 3,48–3,49 ms.
  - Số draw call: 64–66, như cách A.
- **`pnpm check`:** 58 tệp, 509 phép thử đạt; build đạt.

## 6. Bằng chứng (mù cho giám khảo)

Mọi thứ nằm trong `games/.wt-dh-fire-a/tmp/vfx/test-b/` (bị bỏ qua, không vào Git):
- **`blind/`: thư mục đưa giám khảo.** Chỉ có mã trung tính X, Y, Z.
  - `clip-<cỡ>-<nền>.mp4`: ba bản cạnh nhau, 60 fps, thời gian thật, f−5 → f+150 (2,6 s);
  - `clip-<cỡ>-<nền>-<mã>.mp4`: từng bản riêng, cao 720 px, thời gian thật;
  - `strip-<cỡ>-<nền>-<mã>.jpg`: mọi khung từ f−5 tới f+90, rồi mỗi 6 khung tới f+150;
  - `compare-<cỡ>-<nền>.jpg`: ba hàng X, Y, Z, cùng các khung từ f−1 tới f+150.
- **`key/blind-key.json`: khóa mã.** Để riêng, **không gửi kèm** thư mục `blind/`. Mã do một phép xáo có hạt (seed 3110) chọn.
- **`numbers/`: số đo.**
  - `gates.json`: mọi số đo, từng khung;
  - `gates.md`: bảng đủ từng lượt chụp;
  - `compact.md`: bảng như §4.
  - Các tệp này ghi tên biến thể, nên cũng không gửi cho giám khảo trước khi chấm.
- **Khác:**
  - `bench/<cỡ>-<nền>-<biến thể>/run.json` và `gates-run.json`: vị trí và số đo từng khung;
  - `word-b/`: sheet của `dh-vfx-word` cho cách B;
  - `assets/`: sheet của các atlas B trên nền tối, cỏ, cát;
  - `perf-b.log`, `perf-a.log`, `perf-b2.log`.
- Khung thô đã xóa bằng `tools/capture-prune/prune.mjs` (chạy thử trước, rồi `--apply --min-age-min 0`).

## 7. Tôi tự nhìn B: còn gì sai

**Đã tốt hơn A:**
- B nhìn ra kiểu cel, có bậc nhiệt rõ:
  - f0–f+4: một quả cầu trắng-vàng có lõi trắng nhỏ trùm lên quái (lóe của cú trúng);
  - sau đó thân vàng, cam, rồi viền đỏ thẫm;
  - lõi hướng 46–47° ở 1080.
- Cỡ khoảng 1,8 lần quái. Từ f+5 quái đứng trước sao nổ, nên không bị che.
- Kết thúc bằng vòng vỡ của chính nét vẽ, không cháy kiểu giấy.
- Không có vết mực đen, không cháy trước khi lửa chạm đất.
- Khói xám sáng đứng sau quái, không che số. Hết hẳn trước 2,5 s.

**Còn sai, theo thứ tự tôi nghĩ giám khảo sẽ trừ điểm:**
1. **Nhỏ và phẳng ở camera chơi.**
   - Ở 1080, khối nổ chỉ khoảng 75–80 px. Đặt cạnh A và vòng 10 (to gấp 2,5–3 lần), B có thể bị chê là yếu, dù đó đúng cỡ đã đặt.
   - Hình toả đều, nhìn thẳng mặt, tia khá đều nhau: dễ bị gọi là "mặt trời dán" hoặc "clip-art".
2. **Vòng rỗng f+28…f+36** thành một vòng đỏ thẫm mảnh quanh quái trong khoảng 8 khung. Nhìn như cái vòng đai, không giống lửa tàn.
3. **Lúc chuyển từ trước quái ra sau quái ở f+5:** quái hiện ra phía trước chỉ trong một khung. Ở tốc độ thật khó thấy, nhưng xem từng khung thì thấy rõ.
4. **Khói:**
   - chỉ một đám xám, viền kiểu súp lơ, nằm sau quái;
   - bay lên ít;
   - ở f+64…f+80 đám xám phẳng, đỉnh mềm, vẫn có thể bị gọi là "hòn đá".
   Khói đi sau lửa đúng ý, nhưng ít sống động.
5. **Vết cháy:** ở camera chơi, vết nâu dưới chân quái trông như bóng của quái hơn là đất cháy. Mép than hồng gần như không thấy. Ở bến lội không có vết (là hơi nước).
6. **Quầng cộng sáng** làm cát quanh khối nổ ngả màu đào ở 720 (đào 0,03). Ở 1080 thì đạt (≤ 0,019).
7. **Màu teal của vòng T3 và một phần tư số tia** (dấu hiệu Hoàn hảo của vòng 10) lệch với bảng màu cel. Trên cỏ chúng thành vệt xanh nhạt.
8. **Các cổng vẫn trượt:**
   - viền ≤ 0,30 trượt ở mọi nền: nét đỏ thẫm chỉ khoảng 1 px ở camera chơi, dải đo 2 px lẫn với nền;
   - cạnh thẳng ở 1080 là 22–25 px, do tia thẳng của nét vẽ (A 24–25, vòng 10 25–28);
   - thân − nền ở bến lội là 0,14 (cần 0,15);
   - ô liu ở nền tối là 0,10–0,15. Phần này **không** nằm trong lửa của B: đó là đuôi vệt bay (pha bay, giữ nguyên từ vòng 10) tan trên cỏ tối ở f+1…f+4, lộ ra vì khối nổ B nhỏ hơn. Trong khối nổ, ô liu gần 0;
   - ô liu trên điểm ảnh đổi ở 720 là 0,08–0,09: chủ yếu là điểm khử răng cưa của viền đỏ thẫm trên cỏ xanh;
   - khung đầu / đỉnh ở 1080 tối là 0,887, vì quả cầu còn lớn thêm ở f+1 (A 0,82, vòng 10 0,80).
9. **v3 chưa được thử trong game**, và chưa đo cách trộn v2 với v3.

**Cần giám khảo chấm:** hai giám khảo mới, mù, ở tốc độ thật, cạnh một clip thương mại làm mốc (§3 của chẩn đoán). Gửi thư mục `blind/`, giữ `key/` lại.
