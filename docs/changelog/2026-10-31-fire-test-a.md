# 31/10/2026 · Thử nghiệm lửa A (một ngày): chất liệu lửa mới cho cú trúng của đòn mạnh

Nhánh `dh-fire-a` trong `games/.wt-dh-fire-a`, đi từ `ca64509` (vòng 10). Làm đúng §3 của `docs/games/vfx/DRAGON_FIRE_DIAGNOSIS_2026-10-31.md` (repo cha), cách A, đã được chủ dự án duyệt.

- **Phạm vi:** chỉ đòn chữ MẠNH (Hoàn hảo). Đổi pha va chạm (I), pha dư âm (F) và thêm một quầng ở pha nhả. Nhả, bay, nhịp thời gian, dừng hình và số sát thương giữ nguyên như vòng 10.
- **Không tốn credit Firefly:** hai atlas mới được cắt lại từ clip đã có trong `~/VFXLab` (chỉ đọc).
- **Mặc định** trên nhánh này là cách A. `?fire=r10` vẽ lại đòn mạnh của vòng 10, dùng để chụp cạnh nhau.
- **Sim không đổi:** không sửa `src/sim`, `src/content`, `src/typing`, `src/kit`, `tests`.
  - `pnpm check` đạt: 58 tệp, 509 phép thử, golden 10/10; build đạt.
- **Không có media trong Git.** Atlas mới nằm ở `public/assets/dragon-hold/vfx/fire-a/` (thư mục bị bỏ qua) của worktree này.

## 1. Sáu bước của §3

| # | Bước | Đã làm |
|---|---|---|
| 1 | Xuất lại `impact-burst` và `smoke-mask` thành RGBA: độ phủ từ `luma_matte`, nở 2–3 px, lấy max qua các khung kề | **Xong.** <ul><li>`tools/vfx-flipbook` (repo cha) có thêm tùy chọn theo hàng:<ul><li>`"from"`: xuất lại clip của một id khác dưới tên mới;</li><li>`"matte": "coverage"`: kênh alpha là luma matte trên nền đen, đặc từ `matteOpaque` luma, nở `matteWidenPx` px (giãn xám trên đĩa rồi làm mờ 0,6 px), lấy max qua ±`matteTemporal` khung.</li></ul></li><li>Hai hàm mới `grade.coverage_matte` và `grade.widen_coverage`, có phép thử. 19/19 phép thử của công cụ đạt.</li><li>**Thay đổi công cụ nằm trong repo cha và chưa commit**, vì làn này chỉ được commit trên `dh-fire-a`.</li><li>Hai hàng xuất:<ul><li>`impact-burst-a`: từ `impact-burst` v2, đặc từ luma 0,25, nở 2,5 px, ±1 khung;</li><li>`smoke-mask-a`: từ `smoke-mask` v1, đặc từ 0,3, nở 2,0 px, ±1 khung.</li></ul></li><li>Alpha trung bình 0,221 và 0,318; vùng phủ rộng thêm 24 % và 19 %.</li><li>`scripts/assets/prepare-fire-a.mjs` ghi vào `public/assets/dragon-hold/vfx/fire-a/` dưới tên mới, không đè atlas vòng 10:<ul><li>`impact-burst-a.webp`: 2048×1024, 30 khung, 373 KB;</li><li>`smoke-mask-a.webp`: 32 khung, 353 KB;</li><li>`halo-a.webp`, `scorch-a.webp`, `manifest.json`.</li></ul></li><li>Thư viện flipbook riêng `fireAFlipbooks` đọc manifest này, nên manifest vòng 10 giữ nguyên.</li></ul> |
| 2 | Chất liệu lửa trong `flipbook.ts`: dải màu, ăn mòn, mép cháy, glow riêng, thân trộn thường cộng glow | **Xong** (chế độ `fireA`). <ul><li>Clip chỉ cho hai thứ: **độ phủ** (alpha) và **độ nóng** (độ sáng hiển thị). Màu lấy từ dải: than → đỏ thẫm → cam → vàng → gần trắng.</li><li>**Ăn mòn:**<ul><li>ngưỡng alpha tăng dần theo đời lửa, chạy trên một trường "lõi nóng" làm mờ 2 mức mip, cộng nhiễu, nên lửa bị ăn từ mép vào và không thủng thành ren;</li><li>mép đang cháy là một đường đỏ thẫm mảnh, có phát sáng; giá trị luôn trên 0,35 nên không thành nâu.</li></ul></li><li>**Glow** bị ăn trước thân. Giữa hai mép là thân màu than trung tính (không thành gỉ). Phần còn lại nguội dần từ vàng sang cam, cuối đời không còn mảng kem.</li><li>**Ghép một lượt** (premultiplied): thân tối trộn thường, glow cộng. Mép mờ ngắn. Mép mềm trên đất có nhiễu, vì fade đều trên đất phẳng vẽ ra một cạnh ngang thẳng.</li><li>**Đòn mạnh:**<ul><li>vẫn khung 11–19 của `impact-burst` v2, ×1,8, như vòng 10;</li><li>cỡ bằng 0,9 khung cắt; nở 0,6 và xoay ±0,9 rad/s, vì hình đứng yên ~20 khung là lỗi "sticker";</li><li>nguội từ 18 % đời.</li></ul></li><li>**Bỏ trong đường A:**<ul><li>hai đĩa muội vẽ bằng mã;</li><li>oval tối trên đất;</li><li>vòng pastel `fireHot` cộng sáng (nó đọc thành màu đào trên quả cầu và mù tạt trên cỏ).</li></ul></li><li>Than văng dùng `FIRE_A_HOT` (#ffb838) thay `fireHot`.</li></ul> |
| 3 | Khói dưới lửa: từ f+2, 3–4 sprite, tô theo clip × mặt trời, không lớn hơn vụ nổ, 45–80 khung, ease-out | **Xong** (chế độ `smokeA`). <ul><li>Ba đám: sinh ở f+2, f+5, f+8; sống 50, 60, 70 khung; nở 35 % (ease-out); chạy 75 % clip.</li><li>**Màu:** tông `smokeWarm` × ánh sáng nửa-Lambert từ phía mặt trời trên màn hình (pháp tuyến tròn của đám cộng độ dốc của clip) × bóng của chính clip. Đáy cam khi khói còn trẻ.</li><li>**Đặc bên trong**, tắt bằng ăn mòn: trường mật độ mờ, giảm theo bán kính, cộng nhiễu. Khói không mờ dần, vì khói trong suốt trên cỏ đọc thành ô liu.</li><li>Đặt sau quái theo hướng nhìn (xa mắt 1,0 khối, cao 0,8 khối) và trôi tiếp ra xa, nên không che quái. Thứ tự vẽ 5,25, dưới lửa (5,3).</li><li>Lúc lớn nhất, khói bằng 0,21 diện tích lửa.</li></ul> |
| 4 | `scorch.png` thay vết vẽ bằng mã; quầng sau thân làm từ khung đỉnh của clip, làm mờ | **Xong.** <ul><li>**Vết xém:** `scorch.png` của phiếu 038 (`art-src/vfx`) thay vết vẽ bằng mã (không còn Voronoi, không còn tia).<ul><li>Là decal nằm phẳng trên đất (chế độ `decal`), màu than trung tính #3b3633, sáng theo nét vẽ.</li><li>Hiện và tắt bằng cách ăn mòn nét vẽ, không bao giờ trong suốt.</li><li>Than hồng trên vết sống 0,4–0,7 s.</li></ul></li><li>**Quầng:** khung 17 của `impact-burst` v2, làm mờ 0,09 ô, cắt tròn, thành `halo-a.webp` 256 px, vẽ cộng sau thân.<ul><li>Lúc nhả: 3,2 m × k, 8 khung.</li><li>Lúc trúng: 1,35 lần cỡ, 18 khung, làm tối đất dưới nó.</li></ul></li></ul> |
| 5 | Nút đổi grade chỉ ở bàn thử: grade hiện tại và vai vàng (yellow shoulder); chụp cả hai | **Xong.** <ul><li>`PaintedStage.setGradeShoulder`: vùng sáng ấm, bão hòa đi về vàng nóng rồi mới về trắng, thay vì bạc thành màu đào.</li><li>Chỉ `view/fire-bench.ts` bật nút này (biến thể `shoulder`). Game không đổi.</li></ul> |
| 6 | Chụp, chạy cổng, gửi giám khảo | **Chụp và đo xong** (§2, §3). Việc gửi giám khảo thuộc về điều phối viên. |

## 2. Bàn thử

- **Trang:** `?bench=fire` (`src/view/fire-bench.ts`), chạy bằng `scripts/visual/scenarios/dh-fire-bench.mjs`.
  - Bản đồ L2-cau, camera chơi.
  - Cùng một Moss Grunt đứng ở ba nền: bến lội (−24,65; 3,6); cát và bệ rồng (−3,4; 5,6); nền tối (bóng hoàng hôn của VFX_STANDARD §4.5, (−9,5; 7,5)).
  - Presenter fx thật nhận sự kiện giả như sim gửi: word-complete Hoàn hảo, rồi `hit` sau 12 tick.
- **Chụp:**
  - đồng hồ giữ ở 60 fps, chụp mọi khung từ f−5 đến f+90; f0 là khung đầu tiên clip va chạm hiện ra;
  - 1280×720 và 1920×1080;
  - ba biến thể: `r10` (`?fire=r10`, tức `ca64509`), `a`, `shoulder`.
- **Mỗi khung có thêm:**
  - mặt nạ lửa và mặt nạ khói (flipbook vẽ riêng, kênh đỏ là độ phủ, có kiểm tra chiều sâu với cảnh);
  - vị trí điểm trúng, chân và đầu quái, hộp số sát thương, hướng mặt trời trên màn hình.
- **Đo:** `scripts/visual/fire-gates.mjs`, dùng các hàm của `vfx-gates.mjs` vòng 11 (chép vào nhánh này); cả bảng: `fire-gates.mjs --all`.
  - Quái bị loại khỏi các tỉ lệ màu: Moss Grunt vốn màu ô liu, nên điểm ảnh của nó được dò theo từng khung.
- **Sheet:** `scripts/visual/fire-sheets.mjs`.

## 3. Số đo (mỗi nền × mỗi cỡ)

✓ đạt, ✗ trượt. Ô liu tính trong các khung lửa tàn, từ f0 đến khi mặt nạ lửa còn dưới 5 % đỉnh (đều kết thúc ở f+18–f+20). Cột "mọi khung" tính cả khói và vết xém tới f+90.

### Cách A (grade hiện tại)

| Số đo (ngưỡng) | 720 bến | 720 cát | 720 tối | 1080 bến | 1080 cát | 1080 tối |
|---|---|---|---|---|---|---|
| Ô liu, khung lửa tàn (≤ 0,02) | 0,081 ✗ | 0,015 ✓ | 0,017 ✓ | 0,123 ✗ | 0,027 ✗ | 0,022 ✗ |
| Ô liu, mọi khung | 0,081 | 0,015 | 0,017 | 0,123 | 0,027 | 0,022 |
| Bóng nâu từ f+15 (≤ 0,03) | 0,029 ✓ | 0,030 ✓ | 0,013 ✓ | 0,027 ✓ | 0,017 ✓ | 0,022 ✓ |
| Cạnh thẳng dài nhất, px (≤ 20 ở 1080) | 21 | 21 | 19,8 | 22,6 ✗ | 25 ✗ | 23,3 ✗ |
| Viền (≤ 0,30) | 0,566 ✗ | 0,570 ✗ | 0,403 ✗ | 0,595 ✗ | 0,593 ✗ | 0,406 ✗ |
| Thân − nền (≥ 0,15) | 0,005 ✗ | −0,082 ✗ | 0,278 ✓ | 0,010 ✗ | −0,077 ✗ | 0,276 ✓ |
| Lõi p90 (≥ 0,90) | 0,918 ✓ | 0,941 ✓ | 0,854 ✗ | 0,915 ✓ | 0,941 ✓ | 0,863 ✗ |
| Lõi trắng trong ≤ 30 % bán kính | 0,292 ✓ | 0,326 ✗ | 0,102 ✓ | 0,332 ✗ | 0,349 ✗ | 0,116 ✓ |
| Trắng xóa cả khung (≤ 6 %) | 0,15 % ✓ | 0,11 % ✓ | 0,06 % ✓ | 0,18 % ✓ | 0,13 % ✓ | 0,07 % ✓ |
| Màu lõi 35–55° (ở 1080) | 35,1 | 36,5 | 35,0 | 35,2 ✓ | 36,7 ✓ | 35,4 ✓ |
| Đào/cá hồi (≤ 0,02) | 0,025 ✗ | 0,032 ✗ | 0,017 ✓ | 0,021 ✗ | 0,027 ✗ | 0,018 ✓ |
| Khói / lửa lúc lớn nhất (≤ 1) | 0,21 ✓ | 0,22 ✓ | 0,21 ✓ | 0,21 ✓ | 0,21 ✓ | 0,21 ✓ |
| Khung khói che quái / che số (≤ 10) | 0 / 0 ✓ | 0 / 0 ✓ | 0 / 0 ✓ | 0 / 42 ✗ | 0 / 0 ✓ | 0 / 37 ✗ |
| Phía sáng − phía tối của khói (≥ 0,12) | 0,148 ✓ | 0,123 ✓ | 0,193 ✓ | 0,118 ✗ | 0,096 ✗ | 0,209 ✓ |
| Độ phủ khói giảm trong một khung (≤ 25 %) | 19 % ✓ | 19 % ✓ | 18 % ✓ | 16 % ✓ | 19 % ✓ | 19 % ✓ |
| IoU(f, f+4), f0…f+20 (≤ 0,85) | 0,826 ✓ | 0,834 ✓ | 0,829 ✓ | 0,821 ✓ | 0,832 ✓ | 0,825 ✓ |
| Khung đầu cú trúng / đỉnh (mới, tham khảo) | 1,00 | 1,00 | 0,81 | 1,00 | 1,00 | 0,79 |

### Cách A với vai vàng (chỉ bàn thử)

| Số đo (ngưỡng) | 720 bến | 720 cát | 720 tối | 1080 bến | 1080 cát | 1080 tối |
|---|---|---|---|---|---|---|
| Ô liu, khung lửa tàn (≤ 0,02) | 0,035 ✗ | 0,031 ✗ | 0,019 ✓ | 0,047 ✗ | 0,024 ✗ | 0,018 ✓ |
| Bóng nâu từ f+15 (≤ 0,03) | 0,007 ✓ | 0,022 ✓ | 0,044 ✗ | 0,009 ✓ | 0,015 ✓ | 0,026 ✓ |
| Cạnh thẳng, px (≤ 20 ở 1080) | 20 | 21 | 20 | 27 ✗ | 28 ✗ | 25 ✗ |
| Màu lõi 35–55° (ở 1080) | 38,0 | 38,7 | 36,8 | 37,8 ✓ | 38,8 ✓ | 36,7 ✓ |
| Đào/cá hồi (≤ 0,02) | 0,009 ✓ | 0,016 ✓ | 0,008 ✓ | 0,008 ✓ | 0,018 ✓ | 0,007 ✓ |
| Phía sáng − phía tối của khói (≥ 0,12) | 0,139 ✓ | 0,143 ✓ | 0,163 ✓ | 0,128 ✓ | 0,140 ✓ | 0,191 ✓ |
| Khói che quái / che số (≤ 10) | 0 / 0 | 8 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |

Bậc thang giá trị, khói (diện tích, độ giảm) và IoU của vai vàng gần như bằng cách A; xem `gates.md`.

### Vòng 10 (`ca64509`, cùng bàn thử)

| Số đo (ngưỡng) | 720 bến | 720 cát | 720 tối | 1080 bến | 1080 cát | 1080 tối |
|---|---|---|---|---|---|---|
| Ô liu, khung lửa tàn / mọi khung | 0,190 / 0,465 | 0,138 / 0,251 | 0,080 / 0,284 | 0,156 / 0,439 | 0,153 / 0,246 | 0,134 / 0,330 |
| Bóng nâu từ f+15 | 0,057 | 0,206 | 0,045 | 0,085 | 0,074 | 0,119 |
| Cạnh thẳng, px | 20 | 18 | 23 | 20 | 27 | 22 |
| Đào/cá hồi | 0,037 | 0,131 | 0,025 | 0,038 | 0,144 | 0,028 |
| Khói / lửa | 1,35 | 1,37 | 1,37 | 1,35 | 1,37 | 1,37 |
| Khung khói che quái / che số | 54 / 1 | 33 / 0 | 45 / 8 | 54 / 8 | 36 / 4 | 39 / 11 |
| Phía sáng − phía tối của khói | 0,015 | 0,041 | 0,016 | 0,022 | 0,038 | 0,023 |
| Độ phủ khói giảm trong một khung | 56 % | 56 % | 56 % | 56 % | 56 % | 56 % |
| IoU(f, f+4) | 0,807 | 0,808 | 0,812 | 0,801 | 0,799 | 0,798 |

### Các kiểm tra cũ

- **Lóe khi nhả, khung đầu so với đỉnh (≥ 95 %):** game thật, kịch bản `dh-vfx-word`, camera chơi, nền sáng và nền tối.
  - Cách A: 97,3–98,4 %. Vòng 10: 99,4–100 %.
  - Quầng lúc nhả làm khung thứ hai sáng hơn một chút.
- **Tương phản thẻ chữ p01 (≥ 7 : 1):** cách A tối thiểu 9,96 : 1 (vòng 10: 9,96 : 1).
- **Trắng xóa:** cách A tối đa 0,20 %.
- **`dh-perf`, High 1920×1080, bot chơi tới đợt 5:**
  - cách A: trung bình 3,41–3,45 ms, p95 4,7–4,8 ms (ngưỡng ≤ 8 và ≤ 12 ms);
  - vòng 10, cùng lượt: 3,36–3,37 ms, p95 4,3–4,4 ms;
  - chênh +0,07 ms trung bình, +0,4 ms p95.

## 4. Đọc kết quả

- **Hai lỗi cũ của chất liệu:**
  - bóng nâu đạt ở cả 6 lần đo của cách A (0,013–0,030; vòng 10: 0,045–0,206);
  - ô liu trong khung lửa tàn chỉ đạt ở 720 cát và 720 tối;
  - ở bến lội (0,08–0,12), phần ô liu nằm ở f+16–f+20, lúc phần lửa cuối và mép khói nằm trên cỏ sáng và nước nông.
  - Vòng 10 trượt cả hai ở mọi lần đo.
- **Khói:** đạt mọi số đo trừ hai chỗ:
  - phía sáng − phía tối ở 1080 bến và 1080 cát (0,118 và 0,096);
  - hộp số sát thương nằm trên khói ở 1080 bến và 1080 tối (42 và 37 khung). Số vẽ trên khói nên không bị che, nhưng nằm trên nền xám.
  - So với vòng 10: khói vòng 10 lớn gấp 1,35 lần lửa, che quái 33–54 khung, gần như không có sáng tối (0,02–0,04), tụt 56 % trong một khung.
- **Hình không đứng yên:** IoU 0,82–0,83, đạt.
- **Bậc thang giá trị trượt ở mọi nền, cả vòng 10:**
  - viền đo được 0,40–0,60 (mép than mềm, mỏng hơn dải 10 % bán kính);
  - trên cỏ sáng và cát, thân cam không sáng hơn nền 0,15 được;
  - ở nền tối thì thân đạt, nhưng lõi p90 lại thiếu (0,85–0,86, đỉnh rơi vào f+10).
- **Cạnh thẳng ở 1080:** 22–25 px (cách A), 20–27 px (vòng 10).
- **Hai số màu ở 1080:**
  - với grade hiện tại, màu lõi đạt cả ba nền (35,2–36,7°, sát mép dưới), nhưng đào chỉ đạt ở nền tối, nên **cả hai cùng đạt ở 1/3 nền**;
  - với vai vàng, cả hai đạt ở **3/3 nền** (37–39°; 0,007–0,018).
- **Luật dừng của §3:** "hai số màu không cùng đạt ở ít nhất hai nền".
  - Với grade hiện tại: chạm luật dừng.
  - Với vai vàng: không chạm.
  - Vậy kết quả đo phụ thuộc quyết định 3 của chủ dự án (vai vàng đổi màu cả bản đồ).
  - Phần còn lại của luật dừng (điểm dư âm < 7,5) cần hai giám khảo.

## 5. Bằng chứng

Trong `games/.wt-dh-fire-a/tmp/vfx/test-a/` (bị bỏ qua, không vào Git):
- `sheets/compare-<cỡ>-<nền>.jpg`: vòng 10, cách A và vai vàng theo hàng, cùng các khung từ f−1 đến f+90, có số khung và ms;
- `sheets/strip-<cỡ>-<nền>-<biến thể>.jpg`: mọi khung từ f−5 đến f+90;
- `sheets/clip-<cỡ>-<nền>.mp4`: ba biến thể cạnh nhau, 60 fps, thời gian thật;
- `sheets/gates.json` (mọi số đo, từng khung) và `sheets/gates.md` (bảng);
- `bench/<cỡ>-<nền>-<biến thể>/run.json`: vị trí và số đếm từng khung;
- `word-a/`, `word-r10/`: sheet và báo cáo của `dh-vfx-word`;
- `perf-a.log`, `perf-r10.log`.

Khung thô đã được xóa bằng `tools/capture-prune/prune.mjs`.

## 6. Còn lại và cần chủ dự án quyết

- Hai giám khảo mới chấm ở tốc độ thật và từng khung, mù thứ tự, cạnh clip vòng 10 và một clip thương mại (§3).
- **Quyết định 3:** có giữ vai vàng không. Nó là điều kiện để hai số màu đạt.
- Thay đổi `tools/vfx-flipbook` trong repo cha cần được commit (bước 1).
- Chưa làm: ô liu ở bến lội, cạnh thẳng ở 1080, bậc thang giá trị. Theo §3, nếu giám khảo cũng cho dư âm < 7,5 thì đổi nguồn (C hoặc B), không chỉnh tham số tiếp.
