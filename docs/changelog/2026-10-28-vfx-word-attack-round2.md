# 28/10/2026 · VFX bước 1a, vòng 2: tung đòn thành một cú bùng, đòn trúng và vết xém theo kịp

Máy, trình duyệt và luật làn như vòng 1 (`docs/changelog/2026-10-28-vfx-word-attack.md`): Mac mini M4, Chrome 155 headless có GPU, Vite `127.0.0.1:4157 --strictPort` tắt sau mỗi lượt, mọi lệnh nặng qua `.local/bin/heavy.sh`. Nhánh `dh-vfx` trong `games/.wt-dh-vfx`, tách từ `m0b-models` @ `607c3c1`.

Người chấm độc lập của vòng 1 cho **7 điểm ở 720p, 7,5 ở 1080p**, kết luận "sửa", với hai lỗi lớn:
1. Ở camera chơi trên nền nắng, lúc tung đòn chỉ là một quầng cam mềm, không phải một cú bùng. Lõi sáng của lóe miệng chỉ cỡ lõi đầu đạn (chuẩn §3.5 luật 6 đòi ≥ 1,5 lần). Quầng nạp đã nằm sẵn ở điểm lóe, nên khung f0 chỉ sáng hơn khung trước đó +0,12.
2. Đòn trúng và dư âm thua phần tung đòn. Đòn thường (loại gặp nhiều nhất) trúng chỉ có thân quái lóe trắng và một quầng màu đào nhạt. Vết xém 2 s chỉ thấy được khoảng 0,35–0,85 s.

Lượt này sửa cả hai lỗi lớn, thêm ba số đo mà người chấm yêu cầu, rồi chụp lại toàn bộ tờ khung và số đo.

**Sim không đổi.** Không sửa `src/sim`, `src/content`, `src/typing`, `tests/sim`, `src/kit`, file của làn map-spike, `view/stage.ts` hay mã bẫy. `pnpm check` đạt (50 tệp, 430 test, thêm 1 test mới); golden giữ nguyên.

## 1. Tóm tắt

- **Tung đòn giờ là một cú bùng ở camera chơi.**
  - Có lõi trắng nóng, một vệt lóe dọc hướng bắn, thân lửa đỏ thẫm bên dưới và khối lửa cam bung ra.
  - Quầng nạp gọn lại, giữ màu cam bão hòa, nên f0 nhảy hẳn lên.
  - Ở 720p trên nền nắng, tại điểm lóe, f0 sáng hơn khung trước đó **+0,24** (vòng 1: +0,12; bản cũ: +0,08).
  - Lóe lớn hơn đầu đạn **2,0–2,6 lần** ở lõi trắng và **1,9–2,3 lần** ở thân sáng (chuẩn: ≥ 1,5).
- **Đòn trúng khớp với tung đòn.**
  - Lóe trúng lấy màu lửa (thân cam, lõi nhỏ).
  - Thêm một cụm lửa cam đọc được trên cỏ nắng, và ba đám khói muội hiện từ f2–f4.
  - Vết xém là dấu cháy có lõi đậm, giữ đủ đậm 1,5 s. Ở 720p camera chơi, nó **còn thấy tới 2,35 s trên nền nắng và 2,1 s trên nền tối** (vòng 1: khoảng 0,85 s).
- Số đo §5.6 đạt ở cả 8 tổ hợp đòn mạnh và 4 tổ hợp đòn thường:
  - khung đầu của lóe 99,6–100 %; của đèn 100 %;
  - trắng xóa tối đa 0,32 %;
  - tương phản thẻ chữ tối thiểu 9,95 : 1;
  - đầu đạn tối thiểu 28 × 26 px ở 720p;
  - từ phím tới đòn tối đa 16,2 ms.
- Hiệu năng: mục 6.

## 2. Lỗi lớn 1: tung đòn thành một cú bùng

**Nguyên nhân thấy trên khung:**
- Quầng nạp vòng 1 là một quầng cam ember cộng sáng rộng tới 2,3 m × k. Trên bệ nắng nó đọc thành một vùng hồng nhạt, và giữ ô đo lóe gần trắng ngay ở khung `pre`.
- Lóe miệng (lõi 1,25 m × k) nhỏ hơn quầng đầu đạn (1,7 m × k).
- Màu `fireHot` (#ffd9a0) không bao giờ lên trắng: lượt grade dùng tone map Neutral, giữ sắc độ. Lóe của đòn thường vì vậy chỉ là một quầng màu đào.

**Đã sửa** (`src/view/fx.ts`):

| Lớp | Vòng 1 | Vòng 2 | Dòng |
|---|---|---|---|
| A: quầng nạp | Quầng ember 0,7–2,3 m × k, cường độ tới 2,0; lõi nóng 0,3–0,9 m, cường độ tới 3,4 | Một hạt lửa gọn: thân than trộn thường 0,4–1,25 m × k, quầng ember 0,5–1,45 m × k cường độ tới 0,9, lõi nóng 0,22–0,58 m cường độ tới 1,9. Luôn cam bão hòa, không bao giờ trắng | `:1646` |
| A: đèn miệng lúc gõ | 10 % đỉnh | 6 % đỉnh, để khung f0 nhảy lên rõ hơn so với `pre` | `:731` |
| R: thân tối dưới lóe | — | Khối đỏ thẫm `fireDark` (#a8321a) 2,1 m × k, trộn thường, giữ đủ 2 khung cùng lóe, tắt ở f7 | `:47`, `:928` |
| R: lõi trắng nóng | — | Flare `flashCore` (#fff4e2) 1,1 m × k, cường độ 3. Màu này lên được trắng qua tone map Neutral | `:45`, `:930` |
| R: lóe | 1,25 m × k | 2,2 m × k, cường độ 3,4 (xanh ngọc khi đòn mạnh) | `:930` |
| R: thân lóe | 2,9 m × k, màu `fire`, cường độ 1,5 | 3,2 m × k, màu `ember`, cường độ 1,1: cam rõ hơn, không phủ trắng cả bệ | `:930` |
| R: vệt lóe dọc hướng bắn | — | 3 flare bước ra dọc đường bắn (0,95 / 1,65 / 2,35 m × k), nhỏ và đỏ dần, giữ 2 khung, tắt ở f3–f5 | `:937` |
| R: khối lửa bung | 3 khối 1,0–0,64 m × k | 3 khối 1,45–1,01 m × k, cam ember rồi cam đậm, giữ đủ 2 khung cùng lóe | `:943` |
| R: lóe vẽ trước đầu Rồng | Flare nằm đúng ở điểm lóe; đầu và cổ ngay sau mõm che một phần lóe ở f0 | Các flare của lần tung đòn vẽ gần mắt hơn 1 m × k (chỉ đổi độ sâu; thuộc tính `iLift` của từng flare, mọi flare khác bằng 0) | `:392`, `:400`, `:722`, `:933` |
| T: đầu đạn lúc rời miệng | Đủ sáng từ f0 | Đầu, thân và dải lửa lên dần trong 3 khung đầu (⅓, ⅔, đủ): đạn sinh ra từ trong lóe | `:124`, `:1558` |

**Khung đầu ở cận cảnh.** Lóe lớn hơn làm lộ một lỗi: ở cận cảnh, f1 sáng hơn f0, nên f0 chỉ đạt 93–95 % đỉnh (ngưỡng 95 %). Đã thử từng nguyên nhân trên khung chụp:
1. Các khối trộn thường dưới lóe mờ dần từ f0 sang f1, trong khi lóe giữ nguyên. Sửa: chúng giữ 2 khung cùng lóe.
2. Đầu đạn bay qua đúng điểm lóe ở f1. Sửa: đầu đạn lên dần trong lóe.
3. Hai sửa trên chỉ nhích 0,3 điểm (720p cận cảnh nền nắng: 94,2 → 94,5 %). Nguyên nhân chính nằm ở mô hình: ảnh hiệu của f0 và f1 cho thấy đầu và cổ Rồng che một phần lóe ở f0, rồi clip Strike hất đầu ra khỏi chỗ đó ở f1. Sửa: vẽ các flare của lần tung đòn gần mắt hơn 1 m × k.

Sau ba sửa, f0 đạt 99,6–99,9 % ở cả 8 tổ hợp.

## 3. Lỗi lớn 2: đòn trúng và vết xém theo kịp phần tung đòn

Phần 1 của bước 1a giữ I như cũ và thêm vết xém. Người chấm cho phép sửa trong phạm vi đó: lóe trúng lấy màu lửa, thêm một cụm lửa nhỏ và khói muội, và làm vết xém đọc được. Các thay đổi chỉ áp cho đòn chữ (`impact(..., word = true)` từ `boltLanded`). Đòn của bẫy, lính và nhà vẫn như cũ.

| Lớp | Vòng 1 | Vòng 2 | Dòng |
|---|---|---|---|
| I: lóe trúng | Flare `fireHot` (đào nhạt) | Thân ember cam 2–3 m × k, cường độ 1,9, tắt ở f7; lõi nóng nhỏ 0,9 m × k bên trong (xanh ngọc khi đòn mạnh) | `:1047`, `:1055` |
| I: cụm lửa | — | 3 khối lửa trộn thường, cam ember và cam đậm, 1,2–0,9 m × k, ở phía đạn tới (để thân quái không che), bung ra theo hướng đòn, đủ ở f0 | `:1083`, `:1091` |
| I/F: khói muội | — | 3 đám muội `soot` (#2e2723), độ đục 0,55, hiện dần trong f2–f4, bay lên, sống 0,7–0,95 s | `:52`, `:1102` |
| F: vết xém | Đĩa mềm, chỉ đậm ở một phần ba giữa, độ đục 0,85, mờ dần ngay từ đầu, sống 2 s | Dấu cháy nổ (loại mark 5): lõi đậm tới khoảng 45 % bán kính, mép rách có gai, giữa tối hơn; độ đục 0,92; **giữ đủ đậm 1,5 s** rồi mờ hết ở 2,6 s (§3.4: decal đòn thường 2–3 s); cỡ (1,55 + 0,3 × bậc) m × √k | `:200`, `:1112` |
| Kho quad | Mờ dần suốt đời | Thêm tùy chọn `hold`: giữ đủ độ đục bấy nhiêu giây rồi mới mờ | `:232`, `:336` |

Test mới (`tests/view/view-crowd-fx-effects.test.ts`): đòn chữ trúng thêm ít nhất 5 khối lửa và muội; vết xém ở 0,92 tại 0,2 s và 1,4 s, còn 0,2–0,8 ở 2,0 s, hết ở 2,7 s.

## 4. Số đo mới trong `dh-vfx-word`

Theo yêu cầu của người chấm (`scripts/visual/scenarios/dh-vfx-word.mjs`, `lib/vfx-measure.mjs`):

1. **Tung đòn so với khung trước đó** (`flash.overPre`): độ sáng tăng ở f0–f3 so với khung `pre` (quầng nạp đang giữ), ở ô 18 px tại điểm lóe và ở hộp 120 × 90 px (tính ở 720p) trên bệ. Số đo cũ so với `a-00` (trước chữ đầu), nên giấu mất độ sáng sẵn có của quầng nạp.
2. **Lóe so với đầu đạn** (`flash.vsHead`, chuẩn §3.5 luật 6: ≥ 1,5 lần). Hàm `brightBlob` đo cỡ vệt sáng liền quanh một điểm, so với `a-00`, ở hai mức:
   - **lõi:** điểm ảnh có độ sáng ≥ 0,9;
   - **thân:** điểm ảnh sáng thêm ≥ 0,15.
   Lóe đo ở f0 quanh điểm lóe; đầu đạn đo ở f3–f8 quanh đầu đạn (lấy trung vị). Kết quả là đường kính tương đương và tỉ lệ.
3. **Vết xém còn thấy bao lâu** (`scorch`): `FxCore.scorchPoint` (chỉ để chụp) chiếu ra màn. Đo độ tối thêm của ô 14 px (ở 720p) so với `a-00`, từ f20 tới f171. "Thấy" khi tối thêm ≥ 0,12. Với bản BEFORE (không có vết xém) dùng đúng điểm ảnh của AFTER, vì cảnh giống hệt.

## 5. Số đo (§5.6)

**Cảnh chụp như vòng 1:** seed 20261028, kho trống, cùng từ "place" trên cùng con Moss Grunt, ở cùng tick 617–618.
- Đòn mạnh: gõ đúng hết, được Hoàn hảo.
- Đòn thường: `TYPO=2`, một phím sai, được Vừa.

**Thư mục:**
- BEFORE: `tmp/vfx/shots-before2`, `shots-before2-plain` (không đổi so với vòng 1).
- Vòng 1: `shots-after5`, `shots-after5-plain`.
- Vòng 2: `shots-after8`, `shots-after8-plain`.

Đo lại vòng 1 và BEFORE bằng các số đo mới, ở cùng điểm lóe và cùng điểm xém của vòng 2 (cảnh giống hệt).

| Số đo | Ngưỡng | Vòng 2, đòn mạnh (8 tổ hợp) | Vòng 2, đòn thường (4 tổ hợp) | Vòng 1 | BEFORE |
|---|---|---|---|---|---|
| Khung đầu của lóe so với đỉnh | ≥ 95 % | **99,6–99,9 %** | **100 %** | 95,0–100 % (đòn mạnh) | 100 % |
| Khung đầu của đèn so với đỉnh | ≥ 95 % | 100 % (1,25, 1,25, 0,81, 0,44, 0,16, 0) | 100 % | 100 % | không có đèn |
| Trắng xóa (độ sáng ≥ 0,95) | ≤ 6 % | tối đa 0,32 % (cận cảnh nền nắng) | tối đa 0,07 % | tối đa 0,35 % | tối đa 0,32 % |
| Tương phản thẻ chữ ở p99 | ≥ 7 : 1 | tối thiểu 9,95 : 1 | tối thiểu 10,15 : 1 | 9,95 : 1 | 9,95 : 1 |
| Đầu đạn ở 720p, dọc × ngang | ≥ 20 × 6 px | ≥ 39 × 32 px | ≥ 28 × 26 px | như vòng 2 | — |
| Từ phím cuối tới khi đạn rời miệng, đồng hồ thật, 1080p High | ≤ 50 ms | tối đa 16,2 ms, trung bình 9,7 ms (6 từ); độ trễ phím tối đa 20,6 ms | | 12,6 ms | |
| **Mới:** f0 so với `pre` tại điểm lóe, 720p camera chơi, nền nắng / nền tối | | **+0,24 / +0,41** | **+0,15 / +0,32** | đòn mạnh +0,12 / +0,18; đòn thường +0,06 / +0,12 | đòn mạnh +0,08 / +0,26; đòn thường 0,00 / +0,20 |
| **Mới:** cùng phép đo trên hộp 120 × 90 px của bệ | | +0,11 / +0,24 | +0,08 / +0,20 | đòn mạnh +0,06 / +0,15 | +0,03 / +0,06 |
| **Mới:** lõi trắng của lóe so với lõi đầu đạn | ≥ 1,5 lần | **2,0–2,6 lần** (44 với 22 px ở 720p camera chơi, nền nắng) | 5,4–5,8 lần (lõi đầu đạn thường chỉ 2–3 px) | 0,74–1,19 lần | — |
| **Mới:** thân sáng của lóe so với thân đầu đạn | ≥ 1,5 lần | **1,87–2,32 lần** | 1,57–2,38 lần | 1,48–2,08 lần | — |
| **Mới:** vết xém còn thấy (tối thêm ≥ 0,12), 720p camera chơi, nền nắng / nền tối | | **2,35 s / 2,1 s** (đậm nhất 0,53 / 0,25, giữ tới 1,6 s) | 2,35 s / 2,1 s | vết mờ, chỉ đọc được 0,35–0,85 s (người chấm) | không có |

**Ghi chú:**
- **Ô đo của BEFORE** đặt ở điểm lóe của vòng 2. Bản cũ không báo điểm lóe, nên ô đo vòng 1 của nó nằm ở chỗ khác. Vì vậy các số BEFORE trong bảng này khác với changelog vòng 1.
- **Tương phản thẻ chữ** vẫn chưa có ý nghĩa: thẻ của đích tan khi từ hoàn tất, và không thẻ nào khác nằm dưới hiệu ứng (mục 9).
- **Draw call ở 1080p camera chơi:**
  - rảnh 52, lúc tung đòn 58, lúc trúng 62 (BEFORE: 51 → 55);
  - lúc đông nhất: 8 flare, 22 puff, 52 tia lửa, 1 dấu (BEFORE: 14 puff, 59 tia lửa).

## 6. Hiệu năng

**Cách đo** như vòng 1: `dh-perf` (trận thật, bot `?speed=2`, đợt 1–3, High 1920×1080, Chrome không khóa khung) và bench 220 quái có xương. Lượt `--perf` giữ cả 3 suất GPU và 10 nhân CPU. Mỗi lượt đo bản BEFORE (`tmp/vfx/before`) rồi mới đo bản này, trong cùng phiên.

**Máy chiều 28/10 chậm hơn buổi sáng ở cả hai bản.**
- Lượt 1 (`tmp/vfx/perf4`, 18:53–19:02): lúc bắt đầu, tải máy là 13. Còn một Chrome headless mồ côi của một lượt khác (cha là `launchd`, cwd `games/dragon-hold`, chạy 41 phút); không phải của làn này nên không tắt. BEFORE đo được 14,8 / 31,9 ms. Lượt này bỏ, chỉ giữ làm bằng chứng.
- Lượt 2 (`tmp/vfx/perf5`, 19:02–19:11): tải 4–5, Chrome mồ côi đã tắt. BEFORE vẫn 7,36 / 11,3 ms, so với 5,14 / 6,1 ms lúc 08:02. Chrome đều là 156.0.8078.48 (cài từ 27/10), nên chênh này do máy, không do bản dựng.
- Vì vậy **so sánh có nghĩa là AFTER với BEFORE trong cùng lượt**.

**`dh-perf`, lượt 2** (trung bình / p95 của 600 khung cuối mỗi đợt, ms):

| Bản | Đợt 1 | Đợt 2 | Đợt 3 | Trung bình ba đợt | Draw call |
|---|---|---|---|---|---|
| BEFORE (hiệu ứng cũ), không bloom | 7,12 / 10,7 | 7,34 / 11,7 | 7,61 / 11,6 | 7,36 / 11,3 | 52–54 |
| AFTER, không bloom, không đèn | 7,60 / 11,2 | 7,24 / 10,4 | 7,20 / 10,1 | **7,35 / 10,6** | 53 |
| **AFTER, không bloom, có đèn (mặc định High)** | 7,28 / 9,9 | 7,75 / 11,5 | 7,52 / 11,0 | **7,52 / 10,8** | 53–55 |
| AFTER, bloom, không đèn | 8,57 / 11,5 | 8,71 / 11,7 | 8,68 / 11,5 | **8,65 / 11,6** | 66–68 |
| AFTER, bloom, có đèn | 8,64 / 11,3 | 8,74 / 11,8 | 8,65 / 11,3 | **8,68 / 11,5** | 66–68 |

- Hai tổ hợp không bloom (gồm mặc định của High) nằm trong cổng 8 / 12 ms, ngay cả trên máy chậm này. Chúng ngang BEFORE: chênh −0,01 đến +0,16 ms ở trung bình; p95 còn thấp hơn.
- Hai tổ hợp có bloom vượt trung bình 8 ms trong phiên này (buổi sáng: 6,10–6,16 ms). Bloom tốn khoảng 1,2–1,3 ms trong phiên này (vòng 1: 0,9 ms). Điều này củng cố quyết định giữ High không bloom (§6.2 a); `stage.ts` không sửa.
- Khung dài nhất trong trận thật: BEFORE 15,8–23,2 ms, AFTER 17,3–27,9 ms. Không khung nào quá 50 ms.

**Bench 220 quái có xương, lượt 2** (trung bình / p95, ms):

| Bản | Trung bình / p95 | Draw call | Khung dài nhất |
|---|---|---|---|
| BEFORE, không bloom | 8,68 / 12,0 | 71 | 17,7 |
| AFTER, không bloom, không đèn | 8,45 / 12,2 | 73 | 363,4 |
| AFTER, không bloom, có đèn | 8,72 / 12,3 | 72 | 371,1 |
| AFTER, bloom, không đèn | 10,09 / 14,5 | 87 | 437,6 |
| AFTER, bloom, có đèn | 10,33 / 13,8 | 86 | 443,4 |

- Không bloom, AFTER ngang BEFORE (−0,23 đến +0,04 ms trung bình). Trong phiên này cả hai đều quá 8 ms; buổi sáng chúng là 6,0–6,4 ms.
- Một khung dài 360–440 ms vẫn rơi vào cửa sổ đo của mọi cấu hình AFTER, như vòng 1 (260–370 ms). Người chấm vòng 1 đã kiểm trong trận thật ở vsync và không thấy khung nào quá 50 ms. Lượt `dh-perf` này cũng không thấy (mục 9).
- Draw call: lớp mới chỉ thêm flare vào kho có sẵn (1 call) và quad vào kho puff và mark có sẵn. Không có lưới hay đèn mới; số call như vòng 1.

## 7. Tờ khung và clip

Mọi đường dẫn nằm dưới `tmp/vfx/` của worktree (Git bỏ qua).

- **Tờ trước và sau** (hàng BEFORE trên hàng AFTER, 14 khung phóng to: gồng, tung đòn, bay, trúng, dư âm tới f126):
  - đòn mạnh, 8 tổ hợp: `final2/strong/{1280x720,1920x1080}-{play,close}-{light,dark}-before-after.jpg`;
  - đòn thường ở camera chơi: `final2/plain/{1280x720,1920x1080}-play-{light,dark}-before-after.jpg`;
  - chỉ khung AFTER: `final2/*/…-after-keys.jpg`.
- **Cạnh ảnh tham chiếu:** `final2/strong/1920x1080-close-light-beside-reference.jpg`, `final2/strong/1920x1080-play-light-beside-reference.jpg`, `final2/plain/1920x1080-play-light-beside-reference.jpg`.
- **Clip 3 s, thời gian thật, 60 fps:**
  - `final2/clip-before-after-3s.mp4`: cạnh nhau, khung cắt như vòng 1;
  - `final2/clip-before-after-tight-3s.mp4`: **mới**, cắt sát quanh bệ và con quái (800 × 450 của khung 1080p, thấy cả Rồng lẫn quái, phóng lên 960 × 540 mỗi bên); khung chính ở `final2/clip-tight-keyframes.jpg`, theo ý nhỏ của người chấm;
  - `final2/clip-before-after-tight-halfspeed.mp4`: **mới**, cùng khung cắt sát, chậm một nửa, từ f30 tới f129 (gồng, tung đòn, bay, trúng);
  - `final2/clip-after-1920x1080.mp4`: cả khung.
- **Khung gốc:** `shots-after8/`, `shots-after8-plain/` (mọi khung f0–f35, rồi mỗi 250 ms tới 3 s, kèm `meta.json`).

Mọi khung nêu ở đây tôi đã xem.

## 8. Các ý nhỏ của người chấm

| Ý | Xử lý |
|---|---|
| Vệt cánh là những thanh be nhạt có gấp khúc, không thấy ở camera chơi | Đổi sang đầu bão hòa của dải lửa (#ff8a3d, #ff5a1f), rộng 0,2 m (`heroes.ts:88`, `:91`). Vẫn khó thấy ở camera chơi; gấp khúc là do mỗi khung một điểm khi cánh vẫy nhanh. Còn mở |
| Gồng đầu và vệt khói tối sau đầu đạn không thấy ở camera chơi | Không đổi. Lóe, thân tối dưới lóe và khói muội lúc trúng giờ mang luật "tối sau sáng" ở camera chơi |
| Tương phản thẻ chữ đạt nhưng không có ý nghĩa (không thẻ nào nằm dưới hiệu ứng) | Không đổi, vẫn ghi rõ trong mục 5. Cần một lượt chụp đợt đông quái. Còn mở |
| Lõi đầu đạn đòn mạnh khoảng 36 % bán kính | Không thu nhỏ đầu đạn; phóng to lóe. Lõi trắng của lóe là một flare riêng 1,1 m × k bên trong lóe 2,2 m (50 % bán kính nhìn thấy, nhưng chỉ ≤ 30 % là trắng thật) |
| Clip 3 s cho thấy đòn quá nhỏ giữa khung | Thêm clip cắt sát (mục 7) |
| Chunk 612 kB, FlarePool tốn 1 draw call khi rảnh, test đồng hồ tường lỗi khi máy bận | Không đổi (làn tích hợp; không chặn) |

## 9. Còn mở

1. **Người chấm độc lập thứ hai** cho vòng 2. Tự chấm 8/10 ở 1080p và 7,5–8 ở 720p (xem dưới), nằm trong dải 7,5–8,5 nên §5.6 đòi thêm một người chấm.
2. **Đo hiệu năng lại khi máy rảnh.** Lượt 2 chậm hơn buổi sáng khoảng 2 ms ở cả BEFORE. Chênh AFTER so với BEFORE không đổi, nhưng con số tuyệt đối để đối chiếu cổng nên đo lại lúc máy yên.
3. **Khung dài đơn lẻ trên bench không khóa khung** (vòng 1, mục 9): vẫn còn, 360–440 ms. Không thấy trong trận thật. Cần một trace khung trên máy rảnh.
4. **Tương phản thẻ chữ** chưa được thử thật: cần một lượt chụp đợt đông quái, có đòn chữ bay qua dưới các thẻ đang sống.
5. **Vệt cánh** vẫn khó thấy ở camera chơi, và gấp khúc ở cận cảnh khi cánh vẫy nhanh. Cách sửa thật là lấy thêm điểm giữa các khung, hoặc bỏ vệt cánh. Đây là việc của một lượt sau.
6. **Giới hạn ngoài VFX:**
   - ở camera chơi, Hỏa Long chỉ cao khoảng 80–100 px ở 1080p (camera và cỡ mô hình);
   - thân quái lóe trắng khi trúng là phản ứng thân của `crowd`, ngoài phạm vi bước 1a.
   Cả hai giữ điểm ở 720p dưới 8, dù lớp VFX đã đủ.
7. **Chưa làm trong bước này:** Sky Fire đủ 5 pha (bước 2), đèn và lóe lúc trúng theo bậc, lớp phủ lửa của Inferno.
8. Không push, không merge. Vite 4157 và mọi Chrome của làn đã tắt.

**Tự chấm** (§5.6 điểm 5, hàng VFX của `visual-scorecard.md`): **8/10 ở 1080p, 7,5–8 ở 720p.**
- Mạnh:
  - phía Rồng giờ là đòn chính: một cú bùng trắng nóng có viền đỏ thẫm và vệt lóe dọc hướng bắn, rõ ở camera chơi trên cả hai nền;
  - đòn trúng có thân lửa và khói muội;
  - vết xém đọc được hơn 2 s;
  - đòn mạnh (xanh ngọc, kick) và đòn thường (vàng cam) khác nhau rõ.
- Yếu:
  - trên nền nắng, thân lóe lúc tung đòn ngả màu đào sáng hơn là cam đậm;
  - ở 720p, cả đòn vẫn nhỏ so với khung (giới hạn camera, mục 9.6);
  - vệt cánh chưa đóng góp gì.
