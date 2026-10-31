# 28/10/2026 · VFX bước 1a: đòn chữ của Hỏa Long đủ năm pha, trước và sau

Máy: Mac mini M4 (Apple M4, 10 nhân, 16 GB), macOS, Node 24.22. Trình duyệt: **Apple M4, Chrome 155 headless** (GPU thật) qua `scripts/visual/cdp-run.mjs`. Vite `127.0.0.1:4157 --strictPort`, tắt sau mỗi lượt. Mọi lệnh nặng chạy dưới `.local/bin/heavy.sh`: trình duyệt `--gpu`, đo hiệu năng `--perf` kèm giữ 10 nhân CPU, `pnpm check`.

Làn V2 của `docs/games/VFX_STANDARD.md` (§5.4):
- Worktree `games/.wt-dh-vfx`, nhánh `dh-vfx` tách từ `m0b-models` @ `607c3c1`. Đó là HEAD của `m0b-models` lúc tách; chưa làn nào commit thêm vào nhánh đó.
- Media dùng chung qua liên kết (`public/assets` → `../../dragon-hold/public/assets`). `git status` không có media.

Theo lời anh (28/10): VFX không chỉ có lúc đạn trúng quái, mà phải đủ cả khi nhân vật bắn. Chuẩn áp dụng là `VFX_STANDARD.md`: §3 (năm pha, làm phía người ra đòn trước), §5.3 phần 1 (đòn chữ), §5.6 (nghiệm thu). Skill: `game-vfx-layered`.

**Sim không đổi.**
- Không sửa `src/sim`, `src/content`, `src/typing`, `tests/sim`, `src/kit`.
- Không đụng file của làn map-spike, `view/stage.ts` hay mã bẫy.
- `pnpm check` đạt, kể cả test golden; golden giữ nguyên.
- Mọi thay đổi là phần trình bày.

**Lượt này là lượt nối.** Lượt trước bị cắt vì hết hạn mức sau khoảng 44 phút. Nó để lại commit `9fa4e71` (kịch bản chụp ở đồng hồ giữ) và phần sửa chưa commit ở `fx.ts`, `heroes.ts`, `camera.ts`, `app.ts`, `bench.ts`, test và ba kịch bản. Lượt này đã:
- đọc lại diff và giữ phần đúng;
- chụp lại BEFORE (lượt trước bị lỗi font 403, thẻ chữ hiện font dự phòng);
- sửa bốn lỗi thấy được khi xem khung (mục 4);
- đo và commit.

## 1. Tóm tắt

- Đòn chữ giờ có **đủ năm pha, nặng nhất ở phía Rồng**:
  - **Gồng:** lửa tụ ở miệng lớn dần theo từng chữ gõ đúng; đầu và cổ Rồng gồng lại.
  - **Tung đòn:** gõ xong từ, miệng lóe đủ sáng ngay khung đầu; đèn miệng hắt cam lên bệ; đầu giật về sau; cánh để lại vệt.
  - **Bay:** cầu lửa có dải lửa thon đuôi và đầu HDR.
  - **Trúng:** như cũ, thêm vết xém 2 s.
  - **Dư âm:** khói xám nhỏ và vết xém.
- Đã có bảng `release` cho ba clip Attack của Hỏa Long. Đạn rời miệng ngay khung từ hoàn tất. **Từ phím cuối tới khi đạn rời miệng: tối đa 12,6 ms** (trần 50 ms; tối đa 16,8 ms qua mọi lượt đo).
- Số đo §5.6 đạt ở cả 8 tổ hợp (2 cỡ × 2 camera × 2 nền) và cả 4 tổ hợp của đòn thường (mục 5).
- Hiệu năng ở High 1080p (mục 6):
  - Trận thật: 5,19 ms trung bình, p95 6,3 ms. Bản cũ 5,14 / 6,1 ms, cùng phiên đo.
  - Thêm bloom: 6,16 / 7,0 ms.
  - Bench 220 quái có xương, bloom và đèn: 7,30 / 8,9 ms. Chỉ còn 0,7 ms tới trần 8 ms, và lượt đo khi máy bận vượt trần.
  - Vì vậy **High giữ không bloom** theo §6.2 (a). **Đèn miệng bật ở High**, tốn 0,1–0,25 ms trên bench.

## 2. Năm pha (bảng lớp, file:dòng)

Đòn chữ là loại "bắn thường" (§3.3), bậc T1–T3 (T3 khi Chớp hay Hoàn hảo). f0 là khung từ hoàn tất. Sim cho đòn trúng ở f12 (`DAMAGE.strikeDelayTicks`).

| Pha | Khung | Lớp (§3.2) | Mã |
|---|---|---|---|
| **A gồng** | Lúc gõ, mỗi chữ một nhịp | • L11 quầng giữ ở `FX_MOUTH`, đặt trước mõm 0,45 m, gồm ba lớp:<br>  – thân than cam đậm trộn thường (lớp tối dưới lớp sáng);<br>  – quầng cam ember cộng sáng;<br>  – lõi nóng nhỏ.<br>  Quầng lớn thêm một nấc mỗi chữ đúng và nhói lên lúc gõ.<br>• L8: 2–3 đốm than bị hút vào miệng từ quanh đầu.<br>• L14: đèn miệng sáng 10 % theo phần từ đã gõ.<br>• L18: đầu và cổ ngửa ra sau, ngực rướn, theo phần từ đã gõ (thay cho phần gồng của clip Attack: mục 3).<br>• Từ bỏ dở giữ 1,4 s rồi tắt dần. | `src/view/fx.ts:837` (`charge`), `:1536` (`updateCharge`), `:1553` (thân than); `src/view/heroes.ts:82` (`COIL`), `:417` (`pose`), `:521` |
| **R tung đòn** | f0–f7 | • L10 lóe ở mõm: đủ sáng ở f0 và f1, f2 còn nửa, tắt ở f3. `FlarePool` đọc tuổi trước khi tăng, và chỉ lớn ra sau khung giữ.<br>• Thân lóe màu lửa f0–f6.<br>• Ba khối lửa cam bung dọc hướng bắn ngay f0, gần đủ cỡ; 10 tia lửa.<br>• L4: hai đám khói xám từ miệng, hiện từ f3.<br>• L14: một PointLight dựng sẵn lúc nạp, đỉnh ở f0–f1, tắt ở f5 (4–6 khung).<br>• L18: đầu giật về sau theo lò xo (đỉnh khoảng f4, yên ở f10).<br>• L15: camera kick 1,6 px theo hướng bắn, **chỉ đòn mạnh (Chớp, Hoàn hảo)**; tắt khi giảm chuyển động.<br>• Cánh bật vệt. | `fx.ts:395` (`FlarePool`), `:475`, `:868` (`release`), `:883`, `:896`, `:676` và `:760` (đèn), `:1626`, `:1745` (kick); `heroes.ts:83`, `:545`; `src/view/camera.ts:284` |
| **T bay** | f0–f12 | • L1 dải lửa thon đuôi dài 5 m, bám đúng đường cong của cầu, thay `LightTrail` trơn.<br>  – Vẽ bằng shader lửa của kit (`FLAME_FRAGMENT`): mép rách theo nhiễu, lưỡi lửa cuộn về sau.<br>  – Đuôi chạy vào chỗ trúng trong 8 khung.<br>• L9 đầu HDR: quầng 1,7 m và lõi 0,62 m cường độ 3 (xanh ngọc khi đòn mạnh), trên thân cam đậm trộn thường.<br>• L4: vệt khói tối mảnh.<br>• L1 vệt cánh: 4 ribbon ở `FX_WING_L/R/L2/R2`, 16 điểm, rộng 0,16 m; sáng khi đánh và khi bay nhanh, tắt trong 0,5 s. | `fx.ts:508` (`FlameStreak`), `:350`, `:1459`, `:1469`, `:1472`, `:1444`; `heroes.ts:87`, `:433` |
| **I trúng** | f12–f30 | • Như hôm nay: 2 quầng, tia theo bậc, sao tia, vòng từ T3, dừng hình, rung.<br>• Lóe trúng đổi thành flare, đủ sáng ngay khung đầu.<br>• Thêm L6 vết xém 2 s. | `fx.ts:991`, `:1009` (`boltLanded`) |
| **F dư âm** | f16 → 2 s | • Khói xám nhỏ (có sẵn), hiện từ f4 sau khi trúng.<br>• Vết xém nằm trên đường bắn, ngay trước quái: quái chết ngã lùi ra khỏi nó, nên vẫn thấy. Tắt dần trong 2 s. | `fx.ts:1004`, `:1009`, `:1026` (`markY`) |

**Giảm chuyển động** (§3.8, mặc định theo `prefers-reduced-motion`):
- Lóe ×0,6 độ sáng, ×0,8 cỡ.
- Đốm than 1 thay vì 2–3; tia 5 thay vì 10.
- Không camera kick.
- Giữ nguyên các lớp mang thông tin: đèn, quầng nạp, vết xém.

## 3. Bảng release của clip Attack

Đo trên `draconis-v2.high.glb`: lấy mẫu từng clip ở 60 Hz, theo dõi `FX_MOUTH` và xương đầu, cổ, ngực.

| Clip | Tốc độ chơi | Khung tung đòn (clip 24 fps) | Từ `play()` tới tung đòn nếu chơi từ đầu | Cách làm |
|---|---|---|---|---|
| `Hero_Attack_L` | 1,6 | Khung 6 (0,25 s). Đầu hất ngang nhanh nhất từ khung 10 tới đỉnh ở khung 15 (60 Hz) | 156 ms | Clip "Strike" chơi từ khung tung đòn |
| `Hero_Attack_R` | 1,6 | Khung 6 (0,25 s) | 156 ms | Như trên |
| `Hero_Attack_Both` | 1,4 | Khung 7 (0,292 s). Ngực rướn tới khung 12 rồi lao tới | 208 ms | Như trên |

- `FIRE_RELEASE_S` ở `heroes.ts:73`.
- `strikeClip` (`heroes.ts:96`) lấy mẫu lại mỗi clip từ khung tung đòn ở 60 Hz, giữ mọi track.
- `Hero` nhận `release: { attackL: 0, attackR: 0, attackBoth: 0 }` (`heroes.ts:302`). Vì vậy `releaseDelay` bằng 0 theo cách dựng, và đạn rời ngay khung từ hoàn tất.
- 156–208 ms vượt xa trần 50 ms, nên không giữ đạn chờ clip (§3.1 luật 3).

**Phần gồng:** trước khung tung đòn, các clip gần như đứng yên (đầu ngẩng ≤ 1°, ngực của Both rướn 4,5°), nên tua clip theo tiến độ gõ sẽ không thấy gì. Thay vào đó:
- đầu, cổ và ngực gồng bằng mã theo phần từ đã gõ (`COIL`), rồi thả vào clip Strike;
- mọi clip của Hỏa Long đều có track cho ba xương này, nên phần cộng thêm không dồn lại qua các khung.

## 4. Lỗi thấy được khi xem khung, đã sửa

1. **Dải lửa tắt giữa đường khi bay qua sông.**
   - Mặt sông (`view/water.ts`) trong suốt, không ghi độ sâu, và cùng `renderOrder` 2 với dải lửa.
   - Bộ sắp xếp có lúc vẽ nước đè lên lửa ở mọi điểm ảnh mà cầu lửa đi qua trên màn. Ở cận cảnh 1080p, khung f6–f8 chỉ còn đầu xanh ngọc.
   - Sửa: dải lửa và vệt cánh vẽ sau mặt sông (`FX_RIBBON_ORDER` 4, `fx.ts:350`). Không sửa `water.ts`.
2. **Vết xém không bao giờ thấy được.**
   - Dấu tròn chỉ đậm ở một phần ba giữa, và quái bị hạ ngã đúng lên chỗ đó.
   - Đã dò trong trình duyệt: dấu vẫn sống và được vẽ. Cùng dấu đó, nhuộm đỏ, thì thấy; đặt trên cỏ trống cũng thấy. Ở cỡ 1,1–2 m, độ đục 0,5, thì bị thân quái che hết.
   - Sửa: vết xém đặt trên đường bắn, cách quái 0,75 m về phía Rồng; cỡ (1,5 + 0,35 × bậc) m nhân √k; độ đục 0,85; vẫn 2 s.
   - `markY` đặt dấu ở chỗ đất cao nhất dưới phần giữa của nó, để dấu phẳng không bị sườn bờ sông cắt.
3. **Khung đầu của lóe.**
   - Flare lớn dần ngay từ f0, nên f1 sáng hơn f0 2–6 % quanh tâm. Khối lửa bung cũng lớn thêm 13 % ở f1.
   - Sửa: flare chỉ lớn ra sau khung giữ; khối lửa bung sinh gần đủ cỡ.
4. **Quầng nạp đọc thành hồng nhạt** trên bệ nắng: màu lửa đào cộng sáng lên nền be.
   - Sửa: đổi sang cam ember bão hòa, thêm thân than trộn thường bên dưới, đặt trước mõm để đầu Rồng không che.
5. **Thước đo trong kịch bản chụp** (không phải lỗi của game).
   - Ô đo lóe từng chọn trúng thân Rồng đang xoay trong clip Strike.
   - Nay đo ở đúng điểm lóe sinh ra (`releasePoint`), so với khung trước chữ đầu (`a-00`). Lý do không so với `pre`: quầng nạp ở `pre` nằm đúng chỗ lóe, và lần tung đòn tiêu nó đi.

## 5. Số đo (§5.6)

**Kịch bản:** `scripts/visual/scenarios/dh-vfx-word.mjs`.
- Đồng hồ giữ: `requestAnimationFrame` và `performance.now` bước từng khung 60 Hz.
- Seed 20261028, kho trống mỗi lượt.
- Mọi lượt trước và sau đều gõ cùng từ "place", trên cùng con Moss Grunt, ở cùng tick 617–618.
- Mặc định gõ đúng hết: từ được Hoàn hảo (đòn mạnh, đầu xanh ngọc, có kick).
- `TYPO=2` gõ thêm một phím sai: từ được Vừa (đòn thường, đầu cam, không kick).
- Thư mục: BEFORE `tmp/vfx/shots-before2`, `shots-before2-plain`; AFTER `tmp/vfx/shots-after5`, `shots-after5-plain`.

| Số đo | Ngưỡng | AFTER, đòn mạnh (8 tổ hợp) | AFTER, đòn thường (4 tổ hợp ở camera chơi) | BEFORE |
|---|---|---|---|---|
| Khung đầu của lóe so với đỉnh (độ sáng tăng so với `a-00`, ô 18 px ở 720p tại điểm lóe) | ≥ 95 % | 95,0–100 % (thấp nhất 1920 cận cảnh nền tối; ở camera chơi 99–100 %) | 100 % | 100 % ở ô cũ. Cùng điểm lóe: f0 sáng +0,35–0,55, tắt dần từ f1. AFTER: +0,36–0,68, giữ ở f1 |
| Khung đầu của đèn so với đỉnh | ≥ 95 % | 100 % (dãy 1, 1, 0,65, 0,35, 0,13, 0) | 100 % | không có đèn |
| Trắng xóa (điểm ảnh có độ sáng ≥ 0,95) | ≤ 6 % | tối đa 0,35 % | tối đa 0,07 % | tối đa 0,32 % |
| Tương phản thẻ chữ ở p99 | ≥ 7 : 1 | thấp nhất 9,95 : 1 | thấp nhất 10,15 : 1 | thấp nhất 9,95 : 1 |
| Đầu đạn ở 720p, dọc × ngang đường bắn (gồm quầng và dải lửa) | ≥ 20 × 6 px | ≥ 39 × 32 px | ≥ 28 × 26 px | (bản cũ không báo vị trí đầu đạn) |
| Từ phím cuối tới khi đạn rời miệng, đồng hồ thật, 1080p High | ≤ 50 ms | tối đa 12,6 ms, trung bình 9,2 ms (6 từ) | | |
| Draw call ở camera chơi 1080p, rảnh → đỉnh lúc trúng | High ≤ 32 thêm | 52 → 62 | | 51 → 55 |

**Ghi chú về các số đo:**
- **Tương phản thẻ chữ:** trong cảnh này hiệu ứng không đi qua dưới thẻ nào (thẻ của đích tan khi từ hoàn tất), nên số này chỉ cho thấy không lớp nào làm sáng cả vùng. Phép thử thật cho tương phản là một trận đông quái.
- **Bán kính vùng trúng:** không áp dụng (đòn chữ đánh một đích).
- **Đếm lúc đông nhất:** 4 flare, 17 puff, 56 tia lửa (BEFORE: 14 puff, 59 tia).
- **Phím tới đòn qua mọi lượt đo:** tối đa 16,8 ms. Độ trễ phím (phím tới lúc lõi gõ xử lý) tối đa 17–23 ms.

## 6. Hiệu năng

**`dh-perf`** (trận thật, bot `?speed=2`, đợt 1–3, High 1920×1080, Chrome không khóa khung):
- Lượt `--perf` giữ 10 nhân CPU, 08:02–08:10.
- Mỗi ô là trung bình / p95 của 600 khung cuối mỗi đợt.

| Bản | Đợt 1 | Đợt 2 | Đợt 3 | Draw call |
|---|---|---|---|---|
| BEFORE (hiệu ứng cũ), không bloom | 4,91 / 5,6 | 5,29 / 6,4 | 5,21 / 6,3 | 52–54 |
| AFTER, không bloom, không đèn | 5,32 / 6,4 | 5,26 / 6,3 | 5,04 / 6,1 | 53–55 |
| **AFTER, không bloom, có đèn (mặc định High)** | **5,16 / 6,3** | **5,16 / 6,3** | **5,25 / 6,3** | 53 |
| AFTER, bloom, không đèn | 6,03 / 6,8 | 6,20 / 7,2 | 6,06 / 6,9 | 68 |
| AFTER, bloom, có đèn | 6,19 / 7,2 | 6,11 / 6,9 | 6,18 / 6,8 | 66 |

Bốn số cần báo (trung bình ba đợt, trung bình / p95):

| Không bloom, không đèn | Không bloom, có đèn | Bloom, không đèn | Bloom, có đèn |
|---|---|---|---|
| 5,21 / 6,3 ms | 5,19 / 6,3 ms | 6,10 / 7,0 ms | 6,16 / 7,0 ms |

Cả bốn tổ hợp đều trong cổng 8 / 12 ms.

**Bench 220 quái có xương** (`dh-bench.mjs MODE=bones GROUND=painted`, High 1080p, hiệu ứng bật, bench có bắn cầu lửa nên có đèn):
- Đây là cảnh M0b mà §3.5 yêu cầu dùng để quyết bloom.
- Ba lượt đo, cùng ngày:

| Bản | Lượt 1 (giữ CPU, 08:02) | Lượt 2 (máy bận hơn) | Lượt 3 (khởi động 4 s, khung đo muộn hơn) |
|---|---|---|---|
| BEFORE, không bloom | 6,44 / 8,4 ms, 70 call, max 13,8 | — | 13,41 / 18,2, max 31,7 |
| AFTER, không bloom, không đèn | 6,02 / 7,6, 73 call, max 263,7 | 6,95 / 8,7, max 301,2 | 13,69 / 18,5, max 29,1 |
| AFTER, không bloom, có đèn | 6,10 / 7,6, 73 call, max 269,4 | 7,19 / 9,3, max 307,2 | 16,16 / 22,1, max 33,1 |
| AFTER, bloom, không đèn | 7,10 / 8,7, 85 call, max 316,6 | 8,40 / 10,8, max 353,1 | 18,24 / 23,9, max 783,1 |
| AFTER, bloom, có đèn | 7,30 / 8,9, 87 call, max 318,7 | 8,70 / 11,2, max 372,7 | 16,25 / 21,7, max 35,7 |

**Kết luận về hiệu năng:**
- **Đèn miệng** tốn 0,1–0,25 ms trên bench và không đo ra trong trận thật: giữ bật ở High (`FX_MOUTH_LIGHT`, `fx.ts:676`). Bảng §3.7 cho High 1 đèn "đo rồi mới tăng"; nay đã đo.
- **Bloom** tốn khoảng 0,9 ms trong trận thật và 1,1–1,5 ms trên bench.
  - Bench có bloom và đèn: 7,30 ms khi giữ CPU (chỉ còn 0,7 ms tới trần) và **8,7 ms khi máy bận (vượt trần 8 ms)**.
  - Theo §6.2 (a), High **giữ không bloom**; bloom ở lại Ultra. Không sửa `stage.ts`.
  - Bậc High không bloom vẫn đạt §3.5: lõi HDR, quầng, đèn và lớp tối. Xem tờ khung nền tối.
  - Anh chỉ cần chọn (b) nới cổng hoặc (c) hạ DPR nếu thấy bản không bloom vẫn nhạt.
- **Lượt 3** cho thấy khung đo muộn hơn (4–10 s, đám đông dồn về bệ) nặng gấp đôi ở cả hai bản. Độ chênh AFTER so với BEFORE (cùng tổ hợp) vẫn là +0,3 ms. Cổng M0b đo ở khung 1,5–7,5 s.
- **Khung dài đơn lẻ (max):** xem mục 9.

## 7. Tờ khung và clip

Thư mục `games/.wt-dh-vfx/tmp/vfx/` (gitignored):

| Tờ | File |
|---|---|
| BEFORE trên, AFTER dưới; 12 khung phóng to quanh miệng, đường bay, chỗ trúng (gồng, tung đòn, bay, trúng, dư âm); đòn mạnh, 2 cỡ × 2 camera × 2 nền | `final/strong/<cỡ>-<camera>-<nền>-before-after.jpg` |
| Như trên, đòn thường (Vừa), camera chơi, 2 cỡ × 2 nền | `final/plain/<cỡ>-play-<nền>-before-after.jpg` |
| Ảnh tham chiếu bên trái, 12 khung AFTER bên phải | `final/strong/1920x1080-close-light-beside-reference.jpg`, `final/strong/1920x1080-play-light-beside-reference.jpg`, `final/plain/1920x1080-play-light-beside-reference.jpg` |
| Clip 3 s, thời gian thật 60 fps, BEFORE và AFTER cạnh nhau (cắt quanh bệ và quái) | `final/clip-before-after-3s.mp4` |
| Clip 3 s nguyên khung 1080p | `final/clip-before-1920x1080.mp4`, `final/clip-after-1920x1080.mp4` |
| Tờ đủ mọi khung (f0–f35 từng khung, rồi 250 ms một khung tới 3 s) và `meta.json` | `shots-after5/<tổ hợp>/sheet-crop.jpg`, `sheet-full.jpg` |

## 8. Chấm

**Tự chấm: 7,5/10.** Cách chấm theo §5.6 mục 5 và hàng VFX của `visual-scorecard.md`.

**Mạnh:**
- Phía người ra đòn đã có thật. Tụ lửa theo chữ, lóe và đèn miệng hắt cam lên bệ ở f0, dải lửa thon đuôi: ba thứ này đọc rõ ở cả 720p lẫn nền tối.
- Không trắng xóa; thẻ chữ vẫn đọc được.
- Đòn thường và đòn mạnh khác nhau rõ (cam so với xanh ngọc, kick).

**Yếu:**
- Ở camera chơi, cả đòn vẫn nhỏ so với khung hình (Rồng cao khoảng 80–100 px).
- Pha trúng giữ như cũ theo phiếu, nên giờ yếu hơn pha tung đòn.
- Vệt cánh và cú gồng của đầu khó thấy ở camera chơi.
- Vết xém mờ.

Điểm nằm trong dải 7,5–8,5, nên §5.6 cần **một người chấm độc lập**. Lượt này không có agent chấm thứ hai: việc đó còn mở. Hướng tăng điểm (bước 2 trở đi): đèn và lóe ở chỗ trúng theo bậc, tia lửa kéo dài, vết cháy có khe sáng nguội.

## 9. Còn mở

1. **Khung dài đơn lẻ trên bench không khóa khung.** Ở lượt 1 và 2, mọi tổ hợp AFTER có đúng một khung 260–370 ms trong cửa sổ đo; BEFORE thì max 13,8 ms.
   - Lượt 3 (khởi động 4 s): 3/4 tổ hợp AFTER max 29–36 ms, ngang BEFORE (31,7 ms).
   - Ở 60 Hz có vsync, không có khung dài nào trong cửa sổ đo; mọi khung dài rơi vào lúc nạp, cả khi tắt hiệu ứng.
   - Giả thuyết: một khung dài lúc nạp (model, shader mới) nay rơi sau mốc 1,5 s.
   - Thử vẽ trước một lần lúc nạp: không đổi (đã bỏ). Cần một trace khung trên máy rảnh để chốt, và một lượt đo khung đầu của cầu lửa đầu tiên trong trận thật. Lượt thử của em không gõ được từ nào vì máy quá tải.
2. **Người chấm độc lập** cho điểm 7,5 (mục 8).
3. **`pnpm build` cảnh báo chunk `index` 610 kB > 600 kB** (trước là 595,6 kB). Không phải lỗi; tách mã hay nâng `chunkSizeWarningLimit` là việc của làn integrator.
4. **Hai test đo thời gian thật** (`tests/ui/tags-bodies.test.ts` "within the frame budget" < 1 ms, `tests/sim/bot-policy.test.ts` 5 s) trượt khi tải máy lên 13–31. Chạy lại khi giữ cả 10 nhân thì đạt; commit cuối đã chạy `pnpm check` đạt. Riêng commit `b7bf02d` (chỉ kịch bản, không có test nào) được commit sau một lượt check trượt vì test thời gian; lượt chạy lại ngay sau đó đạt.
5. **`FlarePool` luôn tốn 1 draw call**, kể cả khi rảnh (48 ô rỗng). Có thể ẩn khi không có flare.
6. **Ngoài worktree:** lượt này lỡ chạy `pnpm build` một lần trong `games/.wt-dh-m0b` để so cỡ chunk. Lệnh chỉ ghi `dist/` (bị Git bỏ qua); `git status` ở đó vẫn sạch.
7. **Chưa làm** (bước sau theo §5.3): Sky Fire đủ 5 pha (bước 2); đèn và lóe theo bậc ở chỗ trúng; lửa che khi biến hình Inferno.
