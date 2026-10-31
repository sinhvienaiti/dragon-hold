# 31/10/2026 · Thử nghiệm lửa C: giữ đỉnh nổ của vòng 10, cho lửa cháy tàn, lớp phụ CC0 miễn phí

Nhánh `dh-fire-c` trong `games/.wt-dh-fire-a`, đi từ `ec486d6` (vòng 10 + thử nghiệm A + thử nghiệm B). Chủ dự án không mua gì (31/10, "Cho tải và thử"); các gói miễn phí đã được xem (`docs/games/vfx/PACKS.md`, repo cha) và không gói nào có vụ nổ chính tốt hơn vòng 10. Vì vậy C giữ đỉnh nổ của vòng 10 và sửa những gì hai giám khảo mù chê sau đỉnh đó, bằng lớp phụ CC0 của Kenney.

- **Phạm vi:** chỉ đòn chữ MẠNH (Hoàn hảo): pha va chạm (I) và pha dư âm (F). Nhả, bay, nhịp thời gian, dừng hình và số sát thương giữ như vòng 10.
- **Công tắc:** `?fire=c` bật cách C. Mặc định trên nhánh vẫn là cách A; `?fire=r10` vẽ vòng 10, `?fire=b` vẽ cách B. Cả bốn chụp được trên cùng một bàn thử.
  - Khi bật C, đòn chữ thường (không Hoàn hảo) đi đường vòng 10.
  - `?fire=c&smoke=cel` dùng khói cel của B thay khói Kenney (chỉ để so).
- **Sim không đổi:** không sửa `src/sim`, `src/content`, `src/typing`, `src/kit`, `tests`.
- **Không có media trong Git.** Ảnh Kenney và atlas mới nằm ở `public/assets/dragon-hold/vfx/fire-c/` (bị bỏ qua), làm bằng `scripts/assets/prepare-fire-c.mjs`.

## 1. Từng bước

| # | Bước | Đã làm |
|---|---|---|
| 1 | Va chạm: giữ đỉnh nổ của vòng 10 (khoảng f0…f+10), cỡ bằng hoặc hơi lớn hơn vòng 10; rồi lửa **cháy tàn**: co lại, nguội về đỏ sẫm và đỏ thẫm, mép gọn; không qua màu đào, hồng, khaki, ô liu; không mờ dần thành sương | **Xong** (`impact-burst-c`, chế độ `fireC` trong `flipbook.ts`, nhánh `c` trong `fx.ts`, `fire-c.ts`). <ul><li>Pool `impact-burst-c` vẽ **chính atlas `impact-burst` của vòng 10** (bí danh `FLIPBOOK_ALIAS`, không có media mới), hai sprite y như vòng 10: khung 11–19 ở ×1,8, cùng cỡ, góc xoay, độ trôi, độ sáng. Lóe, sao chổi (comet), vòng teal T3 giữ nguyên.</li><li>**Đến 36 % đời sprite (khoảng f+9) shader vẽ đúng công thức vòng 10**, nên các khung đỉnh giống hệt vòng 10 (xem hàng f0…f+7 của sheet so sánh).</li><li>**Từ đó lửa cháy tàn:**<ul><li>co về tim khối nổ, nhanh lúc đầu (ease-out, còn 50 % cỡ ở cuối);</li><li>một ngưỡng tăng dần ăn từ mép vào, theo ánh sáng của chính clip nhân với độ giảm từ tim, cộng nhiễu, nên mép rách theo nếp lửa chứ không thành vòng tròn trơn;</li><li>mép gọn khoảng 1–2 px, cứng hẳn ở các khung cuối (mảnh cuối nửa trong suốt trên cát từng đọc thành màu đào);</li><li>**phần còn lại đặc (trộn thường, premultiplied)**, không bao giờ thành màn trong suốt.</li></ul></li><li>**Màu khi tàn** lấy theo độ nóng của chính clip (kênh xanh lục: nếp vàng là nóng, nếp đỏ là nguội): cam → đỏ cam → đỏ sẫm → đỏ thẫm.<ul><li>Mọi giá trị dưới vai của grade (cam sáng quá 0,8 bị tone map thành đào).</li><li>Đỏ thẫm không bao giờ tối hơn khoảng 0,35 giá trị sau grade (đỏ tối hơn đọc và bị đếm là bóng nâu).</li><li>Mép đang cháy nóng hơn phía sau một chút. Lõi trắng được làm ấm trước khi chuyển (trắng trộn đỏ từng thành hồng).</li></ul></li><li>Khi tàn, khối lửa lùi **sau quái 0,5 m** (chỉ đổi độ sâu, tăng dần trong 1/4 đầu của pha tàn), nên quái đứng trước lửa tàn. Đỉnh nổ vẫn ở chỗ vòng 10 vẽ.</li><li>Hết hẳn ở f+19…f+20, như vòng 10 (f+19).</li><li>**Cỡ:** giữ đúng cỡ vòng 10 (×1,0). Thử ×1,08 rồi bỏ, vì `fire-gates` đo vòng 10 đã ở khoảng 4,4–4,6 lần chiều cao quái (phần đặc), không phải 2,5–3 (xem §4).</li></ul> |
| 2 | Than văng: thay than "kẹo ngô" bằng tia lửa Kenney CC0, ít mà mạnh, vàng cam ấm, cộng sáng, đời ngắn, có trọng lực | **Xong** (`sparks-c`, chế độ `fire` với occlude 0 = cộng sáng thuần). <ul><li>Ảnh: Kenney `flare_01` (một chấm nóng với vệt sáng ngắn), đặt lên nền đen, **cắt quầng mờ** (điểm đen 14 %). Quầng cộng sáng mờ màu vàng trên cỏ đọc thành ô liu.</li><li>9 tia (5 khi giảm chuyển động), 1/3 vàng nóng #ffd27a, còn lại vàng cam #ffb347, cường độ 3,4–4,2.</li><li>Ném lên và ra từ phía camera của thân quái, 4,5–9 m/s, trọng lực −16 m/s², sống 0,32–0,6 s, tắt trong 3 khung. Vệt sáng của mỗi tia quay theo hướng ném trên màn hình. Hai tia ra muộn 2–4 khung.</li><li>Đã bỏ than đuôi tối của vòng 10 (`embers`) trên đường C.</li><li>`spark_01…07` của Kenney là tia điện (zig-zag), không hợp lửa; `light_01` (quầng tròn) đã thử rồi bỏ vì cùng lý do ô liu. Sao chổi (comet) của vòng 10 vẫn giữ.</li></ul> |
| 3 | Khói: nhỏ, sau quái, bốc lên từ chỗ cháy từ khoảng f+12, xám ấm vừa, đỉnh sáng, trộn thường; không che quái, số hay rồng quá 10 khung; không lớn hơn lửa lúc đỉnh; hết khoảng 2 s | **Xong** (`smoke-c`, chế độ `smokeB` của B). **Chọn ảnh khói Kenney Particle Pack `smoke_07`, `smoke_08`, `smoke_04`.** <ul><li>So trên bàn thử với khói cel của B (`?fire=c&smoke=cel`): khói cel thành một đám mây giông xám đen, đáy phẳng, "đội" trên đầu quái, lạc kiểu cạnh lửa bán thực của vòng 10. Khói Kenney là cột khói mềm, đỉnh sáng, bốc lên, hợp lửa vòng 10 hơn. `smoke=cel` vẫn còn để so.</li><li>Atlas: alpha mảnh của Kenney (trung bình 0,15) được đổi thành độ phủ đặc với mép mềm khoảng 3 px; tô xám ấm theo mật độ của chính ảnh, cộng ánh sáng từ trên xuống.</li><li>Trong game: 2 đám (1 khi giảm chuyển động), sinh ở f+12 và f+17, đứng sau quái 0,85–1,0 m, cao 0,8 m; bốc lên 1,15–1,35 m/s, nở 60 %, xoay chậm. **Trôi ra xa bệ rồng** (tâm bản đồ), nhưng bỏ phần hướng về phía camera (nếu không khói sẽ đi qua quái).</li><li>Tông #ddd6cf × ánh sáng cảnh (`sceneLight`, tối thiểu 0,55), nên lúc chạng vạng khói không thành đám trắng phát sáng. Phía mặt trời trên màn hình sáng thêm 55 %.</li><li>Co lại từ 30 % đời theo một ngưỡng tiến tới tim **theo hàm mũ**, nên mỗi khung mất khoảng 1/10 phần còn lại tới cuối. Quét tuyến tính từng làm mất 1/3 cuối trong vài khung (giảm 0,32–0,46 trong 1 khung).</li><li>Không vẽ khói mật độ của vòng 10 (gấp đôi lửa, che quái khoảng 50 khung).</li></ul> |
| 4 | Mặt đất: vòng sóng xung kích thủ tục (vòng shader trên mặt đất, 0,2 → 1,0 trong 150–250 ms, tắt dần) và vết cháy từ `scorch_01…03` của Kenney hoặc vết ấm của B, chọn cái đọc ra đất cháy; nâu ấm, mép than hồng nguội dần, hết khoảng 2,5 s, chỉ hiện sau khi lửa chạm đất | **Xong.** <ul><li>**Sóng xung kích:** dấu mặt đất loại 9 mới trong `MARK_FRAGMENT` (`fx.ts`, pool `marks`, trộn thường). Hai lớp: dải lửa #c9471b và mép trước nóng #ffbe48; trên nước là bọt nước #dfe9ee.<ul><li>Quad lớn từ 0,2 lên 1,0 của 8 m × √k trong 14 khung (233 ms), ease-out, nên phần lớn đường lớn nằm trong khoảng 7–8 khung đầu.</li><li>Dải mỏng dần (còn 15 %) và vỡ thành đoạn từ 30 % đời. Nó **không mờ trong suốt** (vòng trong suốt trên cỏ đọc thành ô liu); chỉ 18 % đời cuối mới mờ.</li><li>Mép trước có lượn chậm và răng cưa (khoảng 1/30 vòng), vì một vòng 8 m trơn tạo các đoạn "thẳng" 37 px ở 1080.</li><li>Thay ba vòng tiếp đất của vòng 10 (vòng than, dải đỏ sẫm, vòng pastel cộng sáng). Vòng teal T3 (dấu Hoàn hảo) giữ nguyên.</li></ul></li><li>**Vết cháy: chọn Kenney `scorch_01` và `scorch_02`** (một trong hai, ngẫu nhiên) trong chất liệu decal của B (`decalB`).<ul><li>So với vết của B: vết của B tròn mềm và đọc như bóng của quái. Vết Kenney có hình vụ nổ, các tia mảnh được làm mềm thành thùy ngắn (tia sắc đọc như vết mực hay ngôi sao), mép ngắn khoảng 1 px.</li><li>`scorch_03` bị bỏ: các mảng có lỗ đọc thành tổ ong, kiểu giám khảo đã chê ở vòng 7–10.</li><li>Màu nâu tro ấm #86766a. Các màu nâu tối hơn đi qua chân tối của grade thành nâu sẫm bão hòa (bóng nâu) và gần đen lúc chạng vạng.</li><li>Có nhân ánh sáng cảnh (vì decal không nhận đèn), nên lúc chạng vạng vết cháy vẫn tối hơn cỏ.</li><li>Mép than hồng có độ lợi 0,56 và nguội nhanh gấp khoảng 1,8 lần B (đỏ tối ở mép lúc chạng vạng đọc thành bóng nâu).</li><li>Hiện 6 khung sau cú trúng, lan từ tim, co dần từ 42 % đời, hết ở 2,5 s. Trên nước là hơi nước, như B.</li><li>Đã sửa một lỗi cũ: vòng 10 đặt vết cháy theo `this.v`, mà `wordHit` ghi đè biến này bằng chỗ của sprite lửa thứ hai, nên vết cháy trượt sang một bên quái. Đường C dùng `this.u`, nên vết nằm dưới quái.</li><li>Không còn oval tối, đĩa muội hay vết xém tia của vòng 10.</li></ul></li></ul> |
| 5 | Nhả, bay, nhịp, dừng hình, số sát thương: như vòng 10 | **Giữ nguyên.** Đường C không bật quầng lúc nhả của A/B. `dh-vfx-word` với `QUERY=fire=c`: lóe khi nhả 99,4–100 % đỉnh, tương phản thẻ chữ p01 9,96–11,19 : 1, trắng xóa tối đa 0,22 % (§5). |
| 6 | Giấy phép: chỉ chép các tệp Kenney dùng tới vào `public/assets` bị bỏ qua; ghi vào hồ sơ bên thứ ba của game nếu có, nếu không thì ghi trong nhật ký | **Xong.** Game không có hồ sơ bên thứ ba, nên ghi ở §6 dưới đây. |
| 7 | Chụp trên bàn thử: cùng quái ở bến lội, cát/bệ, nền tối; camera chơi; 1280×720 và 1920×1080; C, vòng 10, B tới khoảng f+160; `fire-gates.mjs`; perf | **Xong** (§3–§5). `S_END=175`. Vòng 10 và B chụp ở lượt đầu; các sửa sau đó (vòng sóng, mép tàn, khói) chỉ chạm đường C, nên C được chụp lại lần cuối, một mình. |
| 8 | Tư liệu mù: clip tốc độ thật (ba bản cạnh nhau và từng bản riêng), strip và sheet; chỉ mã P, Q, R; khóa riêng; xáo thứ tự mã theo từng nền | **Xong** (§7). `fire-sheets.mjs --per-ground`: mỗi nền một phép xáo (hai cỡ của một nền dùng chung), hạt 1101. |
| 9 | Nhật ký, commit trên `dh-fire-c`, dọn khung thô | Tệp này; khung thô đã xóa (§7). |

## 2. Thay đổi trong code

- `src/view/fire-c.ts` (mới): công tắc `FIRE_C` (`?fire=c`, `smoke=cel`), các hằng (pha tàn, cỡ, màu), `sceneLight`.
- `src/view/flipbook.ts`:
  - id mới `impact-burst-c` (bí danh của `impact-burst`), `sparks-c`, `scorch-c`, `smoke-c`; thư viện `fireCFlipbooks` (`vfx/fire-c/manifest.json`);
  - chế độ `fireC` (pha tàn), `uBurnLift` (lùi sau quái chỉ khi tàn), `uLastFrame`;
  - `decalB`: chọn ô theo khung, `uLight`, độ lợi và tốc độ nguội của mép than theo `occlude`;
  - `smokeB`: điểm bắt đầu co theo `occlude`, `uPuffCentre`, `uSunGain`, `uShrinkEase`.
  - **Mọi giá trị mặc định giữ đúng hành vi của B** (occlude mặc định 0,5 cho ra công thức cũ).
- `src/view/fx.ts`: nhánh `c` trong `wordHit`; `sparksC`, `shockC`, `smokeC`, `scorchC`; dấu loại 9; nạp `fire-b` khi `fire=c` (khói cel để so).
- `src/view/fire-a.ts`: A tắt khi `fire=c`. `src/view/fire-bench.ts`: mặt nạ lửa/khói và `ready()` cho C.
- `scripts/visual/scenarios/dh-fire-bench.mjs`: biến thể `c`, `ccel`.
- `scripts/visual/fire-gates.mjs`, cổng mới cho C:
  - cỡ phần đặc (độ phủ ≥ 0,5) trên chiều cao quái, mục tiêu 2,5–3,0;
  - khói che rồng / lửa che rồng tách riêng (≤ 10 khung cho khói);
  - khung cuối còn khói.
- `scripts/visual/fire-sheets.mjs`: `--per-ground`; nhãn tạm chỉ mang mã.
- `scripts/assets/prepare-fire-c.mjs` (mới): atlas Kenney và bản chép tệp gốc.

## 3. Bàn thử

Như A và B:
- `?bench=fire`, bản đồ L2-cau, camera chơi, một Moss Grunt ở ba nền: bến lội, cát cạnh bệ rồng, nền tối (chạng vạng);
- đồng hồ giữ ở 60 fps; ba biến thể `c`, `r10`, `b` cùng phiên; mỗi khung từ cú bắn tới f0+162.

Số đầy đủ từng khung ở `tmp/vfx/test-c/numbers/gates.json`; bảng từng lượt ở `gates.md`; bảng dưới đây ở `compact.md`.

## 4. Số đo (mỗi nền × mỗi cỡ)

✓ đạt, ✗ trượt. Cạnh thẳng chỉ chấm ở 1080. Đánh dấu ✓ ✗ của khói che quái/số chỉ theo khung che quái.

### Cách C (`?fire=c`)

| Số đo (ngưỡng) | 720 bến | 720 cát | 720 tối | 1080 bến | 1080 cát | 1080 tối |
|---|---|---|---|---|---|---|
| Ô liu, khung lửa tàn (≤ 0,02) | 0,009 ✓ | 0,018 ✓ | 0,019 ✓ | 0,008 ✓ | 0,017 ✓ | 0,015 ✓ |
| Ô liu, điểm ảnh đổi (≤ 0,02) | 0,058 ✗ | 0,045 ✗ | 0,152 ✗ | 0,043 ✗ | 0,039 ✗ | 0,13 ✗ |
| Bóng nâu từ f+15 (≤ 0,03) | 0 ✓ | 0,003 ✓ | 0 ✓ | 0 ✓ | 0,002 ✓ | 0,001 ✓ |
| Cạnh thẳng, px (≤ 20 ở 1080) | 22 | 19 | 26 | 24 ✗ | 25 ✗ | 21 ✗ |
| Viền (≤ 0,30) | 0,576 ✗ | 0,574 ✗ | 0,405 ✗ | 0,564 ✗ | 0,563 ✗ | 0,4 ✗ |
| Thân − nền (≥ 0,15) | -0,023 ✗ | -0,111 ✗ | 0,252 ✓ | -0,013 ✗ | -0,097 ✗ | 0,256 ✓ |
| Lõi p90 (≥ 0,90) | 0,932 ✓ | 0,972 ✓ | 0,941 ✓ | 0,928 ✓ | 0,973 ✓ | 0,942 ✓ |
| Lõi trắng r/R (≤ 0,30) | 0,322 ✗ | 0,333 ✗ | 0,169 ✓ | 0,345 ✗ | 0,362 ✗ | 0,193 ✓ |
| Trắng cả khung (≤ 6 %) | 0,0016 ✓ | 0,0012 ✓ | 0,0006 ✓ | 0,0018 ✓ | 0,0015 ✓ | 0,0008 ✓ |
| Màu lõi 35–55° (ở 1080) | 36,3 | 36,8 | 42,7 | 36,5 ✓ | 36,9 ✓ | 42,5 ✓ |
| Đào f0…f+30 (≤ 0,02) | 0,033 ✗ | 0,051 ✗ | 0,021 ✗ | 0,034 ✗ | 0,083 ✗ | 0,02 ✗ |
| Khói / lửa, diện tích (≤ 1) | 0,15 ✓ | 0,14 ✓ | 0,15 ✓ | 0,16 ✓ | 0,13 ✓ | 0,12 ✓ |
| Khói che quái / số, khung (≤ 10) | 0 / 0 ✓ | 0 / 0 ✓ | 4 / 0 ✓ | 0 / 0 ✓ | 0 / 0 ✓ | 0 / 0 ✓ |
| Khói che rồng > 5 %, khung (≤ 10) | – (không chồng) ✓ | 5 ✓ | 0 ✓ | – (không chồng) ✓ | 0 ✓ | 0 ✓ |
| Khói sáng − tối (≥ 0,12) | 0,215 ✓ | 0,26 ✓ | 0,146 ✓ | 0,273 ✓ | 0,248 ✓ | 0,145 ✓ |
| Khói giảm trong 1 khung (≤ 0,25) | 0,21 ✓ | 0,2 ✓ | 0,21 ✓ | 0,21 ✓ | 0,21 ✓ | 0,22 ✓ |
| Khói từ / tới | f+12 / f+91 | f+12 / f+100 | f+12 / f+100 | f+12 / f+100 | f+12 / f+100 | f+12 / f+101 |
| IoU(f, f+4) (≤ 0,85) | 0,813 ✓ | 0,813 ✓ | 0,814 ✓ | 0,806 ✓ | 0,81 ✓ | 0,81 ✓ |
| Khung đầu / đỉnh (≥ 0,95) | 1 ✓ | 1 ✓ | 0,798 ✗ | 1 ✓ | 1 ✓ | 0,839 ✗ |
| Cỡ: đường kính / cao quái (phủ ≥ 0,15) | 4,65 | 4,79 | 4,92 | 4,63 | 4,75 | 4,89 |
| Cỡ phần đặc / cao quái (mục tiêu C 2,5–3,0) | 4,45 ✗ | 4,59 ✗ | 4,72 ✗ | 4,44 ✗ | 4,56 ✗ | 4,68 ✗ |
| Lửa che ≥ 50 % quái, khung (≤ 10) | 13 ✗ | 13 ✗ | 16 ✗ | 13 ✗ | 13 ✗ | 17 ✗ |
| Lửa che rồng > 5 %, khung | – | 16 | 0 | – | 17 | 0 |
| Lửa hết (< 5 % đỉnh) ở | f+19 | f+19 | f+19 | f+20 | f+19 | f+20 |
| Đen gần (≤ 0,01) | 0 ✓ | 0 ✓ | 0 ✓ | 0 ✓ | 0 ✓ | 0 ✓ |
| Than trước lửa f0–f+6 (≤ 0,02) | 0 ✓ | 0 ✓ | 0 ✓ | 0 ✓ | 0 ✓ | 0 ✓ |
| Còn lại ở 2,5 s (≤ 0,05) | 0,003 ✓ | 0 ✓ | 0 ✓ | 0 ✓ | 0 ✓ | 0 ✓ |

### Vòng 10 (`?fire=r10`, cùng phiên)

| Số đo (ngưỡng) | 720 bến | 720 cát | 720 tối | 1080 bến | 1080 cát | 1080 tối |
|---|---|---|---|---|---|---|
| Ô liu, khung lửa tàn (≤ 0,02) | 0,18 ✗ | 0,133 ✗ | 0,087 ✗ | 0,192 ✗ | 0,165 ✗ | 0,096 ✗ |
| Ô liu, điểm ảnh đổi (≤ 0,02) | 0,272 ✗ | 0,157 ✗ | 0,172 ✗ | 0,267 ✗ | 0,173 ✗ | 0,163 ✗ |
| Bóng nâu từ f+15 (≤ 0,03) | 0,069 ✗ | 0,188 ✗ | 0,123 ✗ | 0,074 ✗ | 0,095 ✗ | 0,059 ✗ |
| Cạnh thẳng, px (≤ 20 ở 1080) | 22 | 22,1 | 23 | 24 ✗ | 24 ✗ | 25 ✗ |
| Viền (≤ 0,30) | 0,548 ✗ | 0,556 ✗ | 0,4 ✗ | 0,552 ✗ | 0,563 ✗ | 0,402 ✗ |
| Thân − nền (≥ 0,15) | -0,043 ✗ | -0,127 ✗ | 0,25 ✓ | -0,037 ✗ | -0,123 ✗ | 0,259 ✓ |
| Lõi p90 (≥ 0,90) | 0,945 ✓ | 0,974 ✓ | 0,934 ✓ | 0,947 ✓ | 0,973 ✓ | 0,94 ✓ |
| Lõi trắng r/R (≤ 0,30) | 0,322 ✗ | 0,332 ✗ | 0,194 ✓ | 0,344 ✗ | 0,367 ✗ | 0,22 ✓ |
| Trắng cả khung (≤ 6 %) | 0,0016 ✓ | 0,0013 ✓ | 0,0008 ✓ | 0,0018 ✓ | 0,0015 ✓ | 0,0009 ✓ |
| Màu lõi 35–55° (ở 1080) | 36,3 | 36,6 | 40,8 | 36,1 ✓ | 36,7 ✓ | 40,8 ✓ |
| Đào f0…f+30 (≤ 0,02) | 0,035 ✗ | 0,14 ✗ | 0,025 ✗ | 0,035 ✗ | 0,082 ✗ | 0,025 ✗ |
| Khói / lửa, diện tích (≤ 1) | 1,35 ✗ | 1,37 ✗ | 1,37 ✗ | 1,37 ✗ | 1,37 ✗ | 1,37 ✗ |
| Khói che quái / số, khung (≤ 10) | 45 / 0 ✗ | 32 / 0 ✗ | 32 / 5 ✗ | 39 / 10 ✗ | 46 / 11 ✗ | 47 / 14 ✗ |
| Khói che rồng > 5 %, khung (≤ 10) | – (không chồng) ✓ | 52 ✗ | 0 ✓ | – (không chồng) ✓ | 51 ✗ | 0 ✓ |
| Khói sáng − tối (≥ 0,12) | 0,03 ✗ | 0,04 ✗ | 0,022 ✗ | 0,038 ✗ | 0,048 ✗ | 0,016 ✗ |
| Khói giảm trong 1 khung (≤ 0,25) | 0,56 ✗ | 0,56 ✗ | 0,56 ✗ | 0,56 ✗ | 0,56 ✗ | 0,56 ✗ |
| Khói từ / tới | f+10 / f+68 | f+10 / f+68 | f+10 / f+68 | f+10 / f+68 | f+10 / f+68 | f+10 / f+68 |
| IoU(f, f+4) (≤ 0,85) | 0,803 ✓ | 0,806 ✓ | 0,81 ✓ | 0,798 ✓ | 0,8 ✓ | 0,804 ✓ |
| Khung đầu / đỉnh (≥ 0,95) | 1 ✓ | 1 ✓ | 0,786 ✗ | 1 ✓ | 1 ✓ | 0,787 ✗ |
| Cỡ: đường kính / cao quái (phủ ≥ 0,15) | 4,48 | 4,58 | 4,73 | 4,44 | 4,57 | 4,72 |
| Cỡ phần đặc / cao quái (mục tiêu C 2,5–3,0) | 4,35 ✗ | 4,44 ✗ | 4,59 ✗ | 4,31 ✗ | 4,44 ✗ | 4,58 ✗ |
| Lửa che ≥ 50 % quái, khung (≤ 10) | 16 ✗ | 16 ✗ | 16 ✗ | 16 ✗ | 16 ✗ | 16 ✗ |
| Lửa che rồng > 5 %, khung | – | 18 | 0 | – | 17 | 0 |
| Lửa hết (< 5 % đỉnh) ở | f+19 | f+19 | f+19 | f+19 | f+19 | f+19 |
| Đen gần (≤ 0,01) | 0 ✓ | 0 ✓ | 0,004 ✓ | 0 ✓ | 0 ✓ | 0,03 ✗ |
| Than trước lửa f0–f+6 (≤ 0,02) | 0 ✓ | 0 ✓ | 0 ✓ | 0,001 ✓ | 0 ✓ | 0 ✓ |
| Còn lại ở 2,5 s (≤ 0,05) | 0,488 ✗ | 0,076 ✗ | 0,116 ✗ | 0,501 ✗ | 0,096 ✗ | 0,085 ✗ |

### Cách B (`?fire=b`, cùng phiên)

| Số đo (ngưỡng) | 720 bến | 720 cát | 720 tối | 1080 bến | 1080 cát | 1080 tối |
|---|---|---|---|---|---|---|
| Ô liu, khung lửa tàn (≤ 0,02) | 0,004 ✓ | 0 ✓ | 0,181 ✗ | 0,001 ✓ | 0 ✓ | 0,173 ✗ |
| Ô liu, điểm ảnh đổi (≤ 0,02) | 0,089 ✗ | 0,08 ✗ | 0,186 ✗ | 0,046 ✗ | 0,018 ✓ | 0,179 ✗ |
| Bóng nâu từ f+15 (≤ 0,03) | 0,004 ✓ | 0,012 ✓ | 0,02 ✓ | 0,017 ✓ | 0,002 ✓ | 0,01 ✓ |
| Cạnh thẳng, px (≤ 20 ở 1080) | 21 | 20 | 19 | 22 ✗ | 24 ✗ | 24 ✗ |
| Viền (≤ 0,30) | 0,549 ✗ | 0,535 ✗ | 0,417 ✗ | 0,545 ✗ | 0,509 ✗ | 0,425 ✗ |
| Thân − nền (≥ 0,15) | 0,14 ✗ | 0,19 ✓ | 0,45 ✓ | 0,141 ✗ | 0,184 ✓ | 0,448 ✓ |
| Lõi p90 (≥ 0,90) | 0,926 ✓ | 0,936 ✓ | 0,936 ✓ | 0,926 ✓ | 0,936 ✓ | 0,936 ✓ |
| Lõi trắng r/R (≤ 0,30) | 0,285 ✓ | 0,276 ✓ | 0,252 ✓ | 0,301 ✗ | 0,23 ✓ | 0,254 ✓ |
| Trắng cả khung (≤ 6 %) | 0,0012 ✓ | 0,001 ✓ | 0,001 ✓ | 0,0014 ✓ | 0,0012 ✓ | 0,0013 ✓ |
| Màu lõi 35–55° (ở 1080) | 45,6 | 46,3 | 46,1 | 46,4 ✓ | 46,4 ✓ | 46 ✓ |
| Đào f0…f+30 (≤ 0,02) | 0,005 ✓ | 0,019 ✓ | 0,003 ✓ | 0,005 ✓ | 0,014 ✓ | 0,004 ✓ |
| Khói / lửa, diện tích (≤ 1) | 0,65 ✓ | 0,66 ✓ | 0,67 ✓ | 0,64 ✓ | 0,66 ✓ | 0,66 ✓ |
| Khói che quái / số, khung (≤ 10) | 0 / 0 ✓ | 0 / 0 ✓ | 0 / 0 ✓ | 0 / 0 ✓ | 0 / 0 ✓ | 0 / 0 ✓ |
| Khói che rồng > 5 %, khung (≤ 10) | – (không chồng) ✓ | 0 ✓ | 0 ✓ | – (không chồng) ✓ | 0 ✓ | 0 ✓ |
| Khói sáng − tối (≥ 0,12) | 0,194 ✓ | 0,184 ✓ | 0,164 ✓ | 0,209 ✓ | 0,177 ✓ | 0,177 ✓ |
| Khói giảm trong 1 khung (≤ 0,25) | 0,15 ✓ | 0,15 ✓ | 0,14 ✓ | 0,15 ✓ | 0,15 ✓ | 0,15 ✓ |
| Khói từ / tới | f+12 / f+98 | f+13 / f+99 | f+12 / f+99 | f+12 / f+99 | f+18 / f+100 | f+12 / f+100 |
| IoU(f, f+4) (≤ 0,85) | 0,825 ✓ | 0,806 ✓ | 0,824 ✓ | 0,814 ✓ | 0,8 ✓ | 0,811 ✓ |
| Khung đầu / đỉnh (≥ 0,95) | 1 ✓ | 0,938 ✗ | 0,988 ✓ | 1 ✓ | 1 ✓ | 0,896 ✗ |
| Cỡ: đường kính / cao quái (phủ ≥ 0,15) | 1,84 | 1,84 | 1,92 | 1,83 | 1,82 | 1,9 |
| Cỡ phần đặc / cao quái (mục tiêu C 2,5–3,0) | 1,78 ✗ | 1,78 ✗ | 1,85 ✗ | 1,78 ✗ | 1,77 ✗ | 1,86 ✗ |
| Lửa che ≥ 50 % quái, khung (≤ 10) | 5 ✓ | 5 ✓ | 5 ✓ | 5 ✓ | 5 ✓ | 5 ✓ |
| Lửa che rồng > 5 %, khung | – | 0 | 0 | – | 0 | 0 |
| Lửa hết (< 5 % đỉnh) ở | f+37 | f+37 | f+37 | f+37 | f+37 | f+37 |
| Đen gần (≤ 0,01) | 0 ✓ | 0 ✓ | 0 ✓ | 0 ✓ | 0 ✓ | 0 ✓ |
| Than trước lửa f0–f+6 (≤ 0,02) | 0 ✓ | 0 ✓ | 0 ✓ | 0 ✓ | 0 ✓ | 0 ✓ |
| Còn lại ở 2,5 s (≤ 0,05) | 0,006 ✓ | 0 ✓ | 0 ✓ | 0 ✓ | 0 ✓ | 0 ✓ |

Ghi chú đọc bảng:
- **Ô liu khung lửa tàn:** C đạt cả 6 lần đo (0,008–0,019). Vòng 10 trượt cả 6 (0,087–0,192), B trượt ở nền tối (0,17–0,18).
- **Ô liu trên điểm ảnh đổi:** C 0,04–0,06 ở bến và cát, 0,13–0,15 ở nền tối; vẫn trượt nhưng thấp hơn vòng 10 (0,16–0,27) và gần B (0,02–0,19).
  - Ở nền tối phần ô liu là cạnh mềm của tia và khói trên cỏ chạng vạng tối, khoảng f+18…f+26.
- **Bóng nâu từ f+15:** C ≤ 0,003 (vòng 10: 0,06–0,19).
- **Đào:** C trượt ở cả 6 lần đo, nhưng phần màu đào nằm ở **đỉnh nổ của vòng 10** (f0…f+9: 0,02–0,05, như vòng 10 ở cùng khung).
  - Trong pha tàn (f+10…f+20) C chỉ 0,004–0,015.
  - Một số trị lớn (0,08 ở 1080 cát) là khung cuối, khi mảnh lửa còn lại chỉ 24 px.
- **Màu lõi, lõi p90, lõi trắng, viền, thân − nền, khung đầu ở nền tối (0,80–0,84):** đều là đỉnh nổ của vòng 10, C không đổi. Số gần bằng vòng 10.
- **Khói:**
  - C đạt mọi cổng khói ở cả 6 lần đo: diện tích 0,12–0,16 lần lửa; che quái tối đa 4 khung; không che số; che rồng tối đa 5 khung (vòng 10: 51–52); sáng − tối 0,145–0,27; giảm tối đa 0,22 trong 1 khung.
  - Khói từ f+12 tới f+91…f+101 (1,5–1,7 s).
- **Cỡ:**
  - Cổng của B (1,6–2,2) đo trên độ phủ ≥ 0,15. Theo cổng này, vòng 10 đã là 4,4–4,7 lần chiều cao quái và C 4,6–4,9.
  - Đo trên phần đặc (độ phủ ≥ 0,5): vòng 10 4,3–4,6, C 4,4–4,7.
  - Vậy "2,5–3 lần quái" không khớp với "cỡ vòng 10" theo cách đo này. C giữ cỡ vòng 10 (đúng ý "đỉnh như vòng 10"), nên trượt mục tiêu 2,5–3,0 ở cả 6 lần đo.
  - Nếu chủ dự án muốn đúng 2,5–3 lần thì phải thu đỉnh nổ còn khoảng 0,6 cỡ vòng 10, tức là đổi đỉnh.
- **Lửa che quái:** C 13–17 khung (vòng 10: 16, B: 5). Gần như toàn bộ là đỉnh nổ f0…f+12. Từ khoảng f+12 khối tàn lùi sau quái.
- **Lửa che rồng ở bàn thử cát:** 16–17 khung, như vòng 10 (17–18). Đó là đỉnh nổ to của vòng 10 trùm lên rồng trên bệ.
- **Cạnh thẳng ở 1080:** C 21–25 px, vòng 10 24–25, B 22–24. Bản C trước khi sửa vòng sóng là 33–37 px.
- **Còn lại ở 2,5 s:** C ≤ 0,003 (vòng 10: 0,08–0,50).

## 5. Các kiểm tra khác

- **`dh-vfx-word`, `QUERY=fire=c`**, camera chơi, nền sáng và tối, 720 và 1080:
  - lóe khi nhả, khung đầu / đỉnh 99,4–100 %;
  - tương phản thẻ chữ p01 9,96–11,19 : 1;
  - trắng xóa tối đa 0,22 %.
- **`dh-perf`, High 1920×1080, bot chơi tới đợt 5, Chrome không khóa nhịp:**

| Lượt | Trung bình mỗi đợt (ms) | p95 mỗi đợt (ms) | Draw call |
|---|---|---|---|
| C, lượt 1 (máy bận) | 5,23–7,15 | 8,9–11,2 | 64–66 |
| Vòng 10, cùng lúc | 6,58–6,82 ở đợt 1–2, 3,49–3,55 ở đợt 3–5 | 10,5–10,6, rồi 4,5–4,6 | 64–66 |
| C, lượt 2 | 3,47–3,78 | 4,4–5,5 | 64–66 |
| B, ngay sau đó | 3,42–3,54 | 4,2–4,8 | 64–66 |

  - Ngưỡng ≤ 8 ms trung bình và ≤ 12 ms p95: đạt ở cả hai lượt của C.
  - Lượt 1 chạy khi máy dùng chung đang tải 5–6; vòng 10 chạy ngay sau cũng chậm ở hai đợt đầu.
  - Lượt 2 của C đắt hơn B khoảng 0,1–0,2 ms trung bình.
- **`pnpm check`:** 58 tệp, 509 phép thử đạt, golden 10/10; build đạt.

## 6. Giấy phép (CC0) và tệp đã dùng

Game không có hồ sơ bên thứ ba riêng, nên ghi ở đây. Nguồn: Kenney Particle Pack 1.1 (https://kenney.nl/assets/particle-pack), tải 31/10/2026 qua trang của Kenney (`docs/games/vfx/PACKS.md`, repo cha).

`License.txt` của gói: "License (Creative Commons Zero, CC0) … You may use these assets in personal and commercial projects. Credit … would be nice but is not mandatory."

Các tệp đã dùng, chép nguyên vào `public/assets/dragon-hold/vfx/fire-c/kenney/` (bị bỏ qua, không vào Git) cùng `License.txt`:

| Tệp (`PNG (Transparent)/`) | Dùng cho |
|---|---|
| `flare_01.png` | tia lửa (`sparks-c.webp`) |
| `scorch_01.png`, `scorch_02.png` | vết cháy (`scorch-c.webp`) |
| `smoke_04.png`, `smoke_07.png`, `smoke_08.png` | khói (`smoke-c.webp`) |

Atlas do `scripts/assets/prepare-fire-c.mjs` dựng lại từ các tệp này.

Không dùng gói Kenney Smoke Particles, Pyroclast, SCORCH, AD_FX hay Taproot. Các tệp `light_01`, `scorch_03`, `spark_01…07` đã xem hoặc thử, rồi bỏ.

## 7. Bằng chứng (mù cho giám khảo)

Mọi thứ nằm trong `games/.wt-dh-fire-a/tmp/vfx/test-c/` (bị bỏ qua, không vào Git):
- **`blind/`: thư mục đưa giám khảo.** Chỉ có mã trung tính P, Q, R.
  - **Mã được xáo lại cho từng nền**, nên cùng một mã ở hai nền có thể là hai bản khác nhau.
  - `clip-<cỡ>-<nền>.mp4`: ba bản cạnh nhau, 60 fps, tốc độ thật, f−5 → f+150;
  - `clip-<cỡ>-<nền>-<mã>.mp4`: từng bản riêng, cao 720 px;
  - `strip-<cỡ>-<nền>-<mã>.jpg`: mọi khung f−5…f+90, rồi mỗi 6 khung tới f+150;
  - `compare-<cỡ>-<nền>.jpg`: ba hàng theo mã, cùng các khung f−1…f+150.
- **`key/blind-key.json`: khóa, theo từng nền.** Để riêng, **không gửi kèm** `blind/`.
- **`numbers/`:** `gates.json` (mọi số đo, từng khung), `gates.md` (bảng từng lượt), `compact.md` (bảng ở §4). Các tệp này ghi tên biến thể, không gửi trước khi chấm.
- **Khác:**
  - `bench/<cỡ>-<nền>-<biến thể>/run.json` và `gates-run.json`;
  - `word-c-sheets/`: sheet và báo cáo `dh-vfx-word`;
  - `assets/`: sheet của atlas Kenney;
  - `look/`: sheet so sánh có tên biến thể (cho tôi xem, không đưa giám khảo);
  - `perf-c.log`, `perf-c2.log`, `perf-r10.log`, `perf-b.log`, `check.log`.
- Khung thô (bench, probe, `dh-vfx-word`) đã xóa bằng `tools/capture-prune/prune.mjs` (chạy thử, rồi `--apply --min-age-min 0`).

## 8. Tôi tự nhìn C

**Đã tốt hơn vòng 10 và B:**
- Giữ được đỉnh nổ giám khảo khen nhất: khối lửa nhiều lớp, lõi trắng, lưỡi lửa đỏ, khoảng 10 khung, giống hệt vòng 10.
- Sau đó lửa co và đỏ dần thành đỏ sẫm rồi tắt ở f+20. Không qua màu đào, khaki hay ô liu; không thành sương. Từ khoảng f+12 quái đứng trước lửa tàn.
- Không còn đám khói xám nâu gấp đôi lửa che quái, bệ và rồng.
  - Khói chỉ là một cột nhỏ, xám ấm, đỉnh sáng, sau và cạnh quái, trôi ra xa bệ; hết ở khoảng 1,6 s.
- Tia lửa vàng bay thành đường cong rồi rơi, đọc rõ là lửa, không còn hình kẹo ngô.
- Vòng sóng lửa trên đất cho cú trúng cảm giác "đập xuống đất". Vết cháy nâu tro có hình vụ nổ, nằm dưới quái, mép than hồng nguội, hết trước 2,5 s.
- Ở tốc độ thật, nhịp đỉnh → tàn → khói → vết cháy liền mạch hơn hai bản trước.

**Còn sai, theo thứ tự tôi nghĩ giám khảo sẽ trừ:**
1. **Chỗ chuyển ở f+9…f+11.**
   - Lửa đổi từ lửa video mềm, sáng, hơi trong sang khối đặc mép gọn.
   - Xem từng khung thì thấy rõ đổi chất liệu. Ở f+10…f+13, khối cam đỏ khá phẳng và mép răng cưa, dễ bị gọi là "cut-out" hay "giấy cắt", lỗi vòng 9 bị chê.
   - Ở tốc độ thật pha này chỉ khoảng 10 khung và đang co nhanh, nên nhẹ hơn.
2. **Đỉnh nổ vẫn là vòng 10, với các lỗi cũ của nó:** quá to so với mục tiêu 2,5–3 lần quái (đo được 4,4–4,7), trùm lên rồng ở bàn thử cát khoảng 16 khung, khung đầu ở nền tối chỉ 0,80–0,84 đỉnh, có chút màu đào ở cát.
3. **Vòng sóng** khá đậm và đều. Trên nền tối nó đọc như một vòng lửa vẽ trên đất, có thể bị gọi là "cái vòng". Vòng teal T3 của vòng 10 vẫn nằm chồng lên nó.
4. **Khói** bốc lên ít trên màn hình (camera nhìn xuống, khói lại đứng sau quái). Nó trông như một cụm mây nhỏ đậu cạnh đầu quái hơn là cột khói.
5. **Vết cháy** trên cát đọc như vết bùn nâu hơn là đất cháy đen. Lúc chạng vạng nó ngả nâu đỏ. Các thùy của vết Kenney đôi khi giống vết mực.
6. **Các cổng vẫn trượt:** đào (đỉnh vòng 10), ô liu trên điểm ảnh đổi ở nền tối, viền ≤ 0,30, thân − nền ở bến và cát, cạnh thẳng ở 1080 (21–25 px), cỡ 2,5–3,0, lửa che quái ≤ 10 khung.

**Cần giám khảo chấm:** hai giám khảo mới, mù, ở tốc độ thật trước, cạnh một clip thương mại làm mốc (§3 của chẩn đoán). Gửi `blind/`, giữ `key/` và `numbers/` lại.

**Còn treo:** một tiến trình Chrome headless (cổng 9509) bị bỏ lại khi tôi dừng lượt chụp đầu. Lệnh tắt nó bị chặn, nên tiến trình vẫn chạy (nhàn rỗi, 0 % CPU).
