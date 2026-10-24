# 24/10/2026 · M0a: sửa sáu điểm nhỏ người rà soát nêu cho bước "rà soát 2", chạy lại kịch bản trên GPU của máy Dell

Bước này sửa các điểm nhỏ người rà soát nêu cho `2026-10-24-m0a-review2.md` (HEAD `09d7c7d`). Máy Dell: Windows 11, WSL Ubuntu 24.04, Node 24.11. Lần này trình duyệt **có GPU thật**: Windows Chrome 155, RTX 3050 Ti (ANGLE D3D11), điều khiển qua CDP bằng Node 24.11 bản Windows (`D:\_tools\node-v24.11.0-win-x64`). Vite chạy trong WSL ở cổng 3005, đã tắt sau khi chạy xong. Mọi số khung hình và trễ phím ở đây ghi nhãn **"Dell, Windows Chrome 155, RTX 3050 Ti (ANGLE D3D11)"**: không phải số của Mac M4. Các kịch bản đo thời gian chạy dưới khóa GPU chung `D:\_tools\gpu.lock`.

## Sáu điểm và cách sửa

| # | Người rà soát nêu | Sửa | Kiểm |
|---|---|---|---|
| 1 | `review2.md` lấy `dh-hitstop-keys` làm bằng chứng cho số sát thương, trong khi trên máy vẽ phần mềm không từ nào xong và không số nào hiện | `review2.md` không còn dẫn lượt đó (dòng "Số sát thương…" và dòng `dh-hitstop-keys` ghi rõ lượt phần mềm không phải bằng chứng). Bằng chứng nay là `dh-numbers` và `dh-numbers-drawn` (mới). `dh-hitstop-keys` ghi thêm số sát thương đang sống ở mỗi mẫu và đo chúng trên phần vẽ, lấy mẫu trong khung (sau khung của game) | GPU, 720p và 1080p: số hiện ở 90/90 và 78/82 mẫu, tới 6 số "HOÀN HẢO" cùng lúc; chạm nhau 0 (theo hộp và theo phần vẽ), khe mực nhỏ nhất 6,7 / 9,9 px |
| 2 | Kiểm "0 chạm" trong trang dùng chính `DrawnNumberField.box()`, hộp đã đẩy các số ra xa: tự kiểm chính mình | Kịch bản mới `dh-numbers-drawn.mjs` đo trên phần đã vẽ (mục dưới). Nó tìm ra một lỗi thật: chữ số vẽ thấp hơn đáy hộp tới 13,5 px ở 720p. `src/view/number-field.ts`: hộp nay lấy cả hàng mực của chữ số và nhãn (đo một lần bằng phông của atlas, có viền) | 720p, 1080p: 0 cặp chạm ở 30/30 khung; với hộp của kit đặt lại: 111 / 124 cặp chạm ở 28/30 khung, trong khi kiểm theo hộp vẫn báo 0. Test mới: 2 ca chồng dọc |
| 3 | `dh-pace`: bộ chọn `.dh-toast.is-on` bắt được null ở cả hai cỡ; thông báo nằm đè đầu dải món và dòng phím | Kịch bản: một MutationObserver ghi thông báo lúc vừa bật; đo hộp sau khi trượt vào xong (0,18 s), chụp ảnh. `src/ui/hud.ts`: thông báo đứng trên mép trên của dải món 8 px, đo theo dải thật mỗi khung khi đang hiện (dải gập trong đợt, cao lên ở 720p vì cỡ chữ tối thiểu 11 px và dòng gợi ý hai dòng); không có dải thì dùng vị trí CSS cũ | Hai thông báo ở mỗi cỡ (bày binh, dải đầy; Alt + 7 trong đợt, dải gập): bắt được, cách dải 8 px, che 0 bảng, 0 px đường, 0 px² ô đặt (bảng dưới) |
| 4 | Bước B9 ghi "phím 1–7: 15 … 60 WPM", nhưng sau ải đầu hàng "Số đo" đứng đầu và các mức lùi một phím (35 thành phím 6) | Chọn phím cố định (cách người rà soát ưu tiên, rẻ): `PaceOption.key`; các mức luôn là phím 1–7, hàng "Số đo" là phím 0 (vẫn đứng đầu và chọn sẵn, đúng 00 D26). `KEYS` không bind số 0 trần, nên app chuyển Digit 0 thành `carry-0` khi thẻ đang mở. Dòng phím của thẻ: "Phím 0–7 chọn" khi có số đo | Test mới (phím 1–7 trước và sau ải đo; số đo là 0; phím 5 luôn là 35). `dh-pace`: thẻ đầu "1234567"; có số đo "0:27m 1:15 2:20 3:25 4:30 5:35 6:45 7:60"; từ menu dừng phím 5 → 35, phím 0 → số đo; phát lại khớp. Đã sửa bước B9 ở `review2.md` và bước 1 ở `2026-10-23-m0a.md` |
| 5 | Ví dụ ở 00 §4.4 "85 %, CV 0,35 → × 1,88" chỉ đúng khi E ≥ 45; chú thích `PACE` trong `rules.ts` (85 % → × 1,45, 95 % → × 1,04) lệch `marginPm` 1219 | 00 §4.4 (repo cha, chưa commit): ví dụ cho cả hai độ dài từ, số lấy từ `paceFor`: 85 %, CV 0,35 → × 1,705 (E < 45) / × 1,882 (E ≥ 45); 95 %, CV 0,25 → × 1,219 / × 1,249; 99 %, CV 0,2 → × 1,123. `rules.ts`: chú thích ghi biên là tổng (1 + phần trượt + phần không đều), phần trượt + 0,50 / + 0,67 ở 85 %, + 0,07 / + 0,10 ở 95 %, + 0,00 ở 99 %; biên cả hai phần như trên; phần không đều CV 0,35 → + 0,21 | Số chạy thật bằng `paceFor` (E 15/25/35/44 cho ℓ̄ 5 chữ, E 45/60/65 cho 6 chữ). `dh-pace` đọc `marginPm` 1219 ở 25 và 35 WPM với a, CV mặc định |
| 6 | Chạy lại trên GPU các kịch bản máy vẽ phần mềm không chạy được | Đã chạy: `dh-hitstop-keys`, `dh-focus`, `dh-words`, `dh-learning-frame`, `dh-placement`, `dh-keyboard-only`, `dh-telegraphs`, `dh-scale`, `dh-camera`, `dh-crowd`, `dh-perf`, `dh-bench`, cùng `dh-pace`, `dh-numbers`, `dh-numbers-drawn` | Kết quả ở `2026-10-24-m0a-review2.md`, mục "Chạy lại trên GPU". `dh-focus`: `ticksDuringCountdown` 0 |

## Điểm 2: đo số sát thương trên phần vẽ, và điều nó chứng minh

**Đo gì.** `scripts/visual/scenarios/lib/dh.mjs` `INSTALL_INK_CHECK` đọc những gì `NumberSprites` đã gửi cho GPU ở khung vừa vẽ: mảng `iRect` (x, y, rộng, cao trên màn) và `iUv` (ô trong atlas) của từng quad, một quad mỗi chữ số và một cho nhãn "HOÀN HẢO". Với mỗi quad, nó lấy vùng có mực trong atlas (canvas của texture, alpha ≥ 0,1, kể cả viền tối) rồi đổi ra px trên màn. Hai số chạm nhau khi một hộp mực của số này chồng một hộp mực của số kia. Field chỉ được dùng để chia quad theo số (số chữ số, có nhãn hay không), không dùng `box()`. `__dh.numberLayer()` và `FxPresenter.sprites` (mới) cho kịch bản đọc field và sprite.

**Kịch bản.** `dh-numbers-drawn.mjs`: cho thế giới đi tới khi có 12 quái trên màn, làm chậm thế giới, rồi 10 cơn × 12 đòn T4–T5 (chỉ phần trình bày), cách nhau 200 ms (quá cửa sổ gộp 0,15 s, nên số cũng xếp chồng), đo 3 khung sau mỗi cơn. Rồi đặt lại `box()` của kit lên chính field đó (đối chứng) và làm lại.

| | 720p | 1080p |
|---|---|---|
| Quái trên màn | 17 | 17 |
| Số cùng lúc (tối đa, đều có nhãn) | 12 | 11 |
| Khung có mực chồng nhau / khung đo | 0 / 30 | 0 / 30 |
| Khe mực nhỏ nhất giữa hai số | 7,8 px | 8,5 px |
| Mực ra ngoài `box()` | 0 | chữ số 3: 6,4 px (xem dưới) |
| Đối chứng, hộp của kit: khung chạm / cặp chạm | 28 / 30, 111 cặp | 28 / 30, 124 cặp |
| Đối chứng: `numbersTouching()` (đo bằng chính hộp đó) | 0 | 0 |
| Đối chứng: nhãn ra ngoài hộp | 23,8 px | 35,7 px |

Trước khi sửa phần dọc (lượt đầu trên GPU, 720p): 3/30 khung có mực chồng nhau (chồng 0,2 px), chữ số ra ngoài đáy hộp 13,5 px. Nguyên nhân: quad chữ số cao 1,25 cỡ chữ tính từ đỉnh số, còn hộp của kit chỉ cao 1 cỡ chữ; số cũ bay lên rồi số mới hiện ngay dưới nó, chữ số của số trên chạm nhãn của số dưới mà hai hộp không chạm.

**Chứng minh được:** (a) trong các khung đã đo, mực của hai số không chồng nhau, ở cả hai cỡ, với tới 11–12 số có nhãn trên màn; (b) bộ đo nhìn thấy lỗi cũ: cùng cơn đòn với hộp của kit cho 111–124 cặp chạm, trong khi kiểm bằng hộp vẫn báo 0, đúng điều người rà soát lo; (c) với hộp mới, mực nằm trong hộp (trừ chữ số 3 ở 1080p, xem dưới), nên `spawn()` và `settle()` giữ hộp rời nhau là giữ được phần vẽ rời nhau.

**Không chứng minh:** mực tính bằng hộp bao từng chữ (hơi thừa, nên "chạm" ở đây nghiêng về báo động); chỉ các khung được đo (3 khung sau mỗi cơn), một seed, một bản đồ; số đang mờ hẳn vẫn được tính như số đậm.

**Lỗi của kit (chưa sửa, báo cho `shared/game-kit`):** trong atlas của `NumberSprites`, dấu của "HOÀN HẢO" (À, Ả) ở hàng nhãn trồi lên ba hàng điểm ảnh cuối của hàng chữ số. Ô của chữ số 3 có mực tới hàng 64 (các chữ số khác dừng ở 54), nên mỗi chữ số 3 được vẽ kèm vài điểm ảnh của dấu ở chân. Đó là 6,4 px "ra ngoài hộp" ở 1080p. Cùng với `box()` thiếu phần tràn ngang, nhãn và chiều cao 1,25, đây là ba điểm `feedback/numbers.ts` cần sửa ở kit rồi chép lại; `src/kit` không sửa tay.

## Điểm 3: chỗ của thông báo

| Thông báo | Cỡ | Hộp (x, y, rộng × cao) | Cách dải | Che |
|---|---|---|---|---|
| "Chơi lại ải với tốc độ 35 WPM (đã chọn)" (bày binh, dải đầy) | 720p | 1028, 570, 239 × 24 | 8 px | 0 bảng, 0 px đường, 0 px² ô |
| "Ô đồ tiêu hao trống: mua Bình Máu lúc nghỉ" (Alt + 7 trong đợt, dải gập) | 720p | 1013, 632, 255 × 24 | 8 px | 0 |
| "Chơi lại ải…" | 1080p | 1560, 882, 340 × 35 | 8 px | 0 |
| "Ô đồ tiêu hao trống…" | 1080p | 1538, 951, 363 × 35 | 8 px | 0 |

"Bảng" gồm các bảng HUD, dải món, đầu dải ("Bộ Mang Theo"), dòng phím của dải, khung học, thẻ đợt, dòng hướng dẫn đặt món và thẻ chữ; đường và ô đặt theo `ui/screen-zones.ts` (vùng game công bố ở khung đó). Ảnh `03-after-change-*` và `05-toast-wave-*`: thông báo nằm trên dải, đầu dải và dòng "Phím 1–8 chọn món" đọc rõ.

## Kiểm

| Kiểm | Kết quả |
|---|---|
| `pnpm check`: kit | 73 file khớp `kit-manifest.json` (không sửa `src/kit`) |
| `pnpm check`: vitest | 365/365, 43 file (mới: `typing-pace` +1, `number-field` +2) |
| `pnpm check`: `tsc` + `vite build` | xanh; `index` 527,52 kB (gzip 189,33 kB), `three` 561,77 kB |
| Golden (`tsx scripts/balance/golden.ts`) | 4 ca "giữ nguyên": `61222e57`, `8b16e8be`, `f1f9e5ab`, `4d27a14a` (sim không đổi) |
| `git diff --check` | sạch |
| Trình duyệt | 29 lượt giữ lại trên GPU (thêm 4 lượt bị ghi đè trong lúc sửa: `dh-pace` 720p lần đầu, `dh-numbers-drawn` 720p ba lần): 0 exception, 0 tải hỏng. Dòng console duy nhất: một cảnh báo biên dịch shader của ANGLE D3D11 (`X3595: gradient instruction used in a loop with varying iteration`) ở 28/29 lượt (không có ở bench nền phẳng); là cảnh báo, không phải lỗi |

Cân bằng không chạy lại: sim không đổi.

## File

- Mã: `src/app/{typing-pace,pace-card,app}.ts` (integrator), `src/ui/hud.ts` (ui: chỗ của thông báo), `src/view/{number-field,fx}.ts` (view-crowd-fx: hộp theo hàng mực; `sprites` để đọc), `src/content/rules.ts` (sim-battle: chỉ chú thích `PACE`).
- Test: `tests/app/typing-pace.test.ts`, `tests/view/number-field.test.ts`.
- Kịch bản: `scripts/visual/scenarios/{dh-pace,dh-hitstop-keys}.mjs`, `dh-numbers-drawn.mjs` (mới), `lib/dh.mjs` (`INSTALL_INK_CHECK`).
- Tài liệu: `2026-10-24-m0a-review2.md` (bằng chứng, bước B9, mục "Chạy lại trên GPU"), `2026-10-23-m0a.md` (bước 1), `LANES.md`.
- Repo cha, chưa commit: `docs/games/dragon-lane/00-canon.md` §4.4 (ví dụ biên thời gian).

## Bằng chứng

`tmp/dell-2026-10-24/gpu/` (không vào Git): JSON và log của từng lượt (`<kịch bản>-<cỡ>.json`, `.err`, `run.log`), ảnh ở `shots/<lượt>/`, `minor-check.txt`, `minor-golden.txt`, `minor-diff-check.txt`. Đầu dò atlas: `tmp/dell-2026-10-24/scripts/probe-ink.mjs`.

## Còn mở

- B9: buổi chơi thử 10 đợt của anh (bước ở `2026-10-24-m0a-review2.md`).
- Ba lỗi của kit ở `feedback/numbers.ts` (mục điểm 2): sửa ở `shared/game-kit` rồi chép lại.
- 9 mục "Cần anh quyết" của cổng vòng 2: chưa làm ở bước này.
