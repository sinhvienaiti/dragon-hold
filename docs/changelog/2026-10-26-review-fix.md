# 26/10/2026 · Sửa sau phản biện: thẻ chữ ở khe và lúc giữ chỗ, đường sáng khi báo đợt, kịch bản trình duyệt, sửa phân tích B1/B7 và Nhàn I

Máy: Mac mini M4 (Apple M4, 10 nhân, 16 GB), macOS, Node 24.22, pnpm 11.21. Trình duyệt: **Apple M4, Chrome 155 headless** (GPU thật, khung khóa 60 Hz), điều khiển qua `scripts/visual/cdp-run.mjs`, Vite cổng 3005. Mọi lệnh nặng chạy dưới `.local/bin/heavy.sh` (lượt trình duyệt `--gpu`). Số khung và trễ phím ở đây là **số Apple M4**, không so thẳng với số Dell.

Đầu vào: phản biện độc lập của làn (26/10) cho hai bước trước, `2026-10-25-mac-kit-drift-crowd.md` và `2026-10-26-b1b7-names.md`: 16 phát hiện (5 lớn, 11 nhỏ). Lượt này tìm thêm một lỗi (dòng 17). Một lượt sửa trước bị ngắt giữa chừng lúc khoảng 12:00 vì hết hạn mức; lượt này kiểm lại phần nó để lại, giữ phần đúng, làm nốt.

Bước này không đổi sim (`src/sim`, `src/content`, `src/typing`): `pnpm check` đạt cả test golden, nên bot, golden và mã băm giữ như `0cc3370`. Không có vòng đo cân bằng mới: họ cổng B1/B7 đã dùng hết 6 vòng ở bước trước (luật của người điều phối).

## Sửa sau phản biện

| # | Mức | Phát hiện | Đã làm | Commit | Kết quả |
|---|---|---|---|---|---|
| 1 | lớn | Vòng tìm chỗ cuối của `layoutTags` chỉ xét các thân trong tầm đẩy phía trên neo, nên đặt thẻ lên thân quái khác ở dưới neo (probe: che 56 %) | Vào vòng tìm cuối, thẻ dựng danh sách `around`: mọi thân trừ thân của chính nó, trong 2 lần tầm đẩy quanh neo, mọi hướng; `hides()` nhận danh sách làm tham số. Test mới đúng ca của probe (thân ngay dưới-trái neo, mọi chỗ đẩy và nâng bị ô cấm chặn) | `be55bf7`, `f88b444` | Test: thẻ che thân đó ≤ 30 %, không chạm thân của chính nó, trong 240 px |
| 2 | lớn | Thẻ ở vòng khe (quái trong 10 m) không xét thân quái lẫn báo trước đỏ, che tới 92 %; `dh-crowd` bỏ qua vùng này nên câu "báo trước đỏ … không che quá 30 %" ở changelog 25/10 chỉ đúng với thẻ thường | Thẻ ở khe xét thân và báo trước như thẻ thường (đẩy ngang, nâng bậc từ khe), kể cả thân của chính quái mang thẻ (`ownClear`), vì thẻ không đứng trên đầu quái đó; chip ở mép màn vẫn bỏ qua. `dh-crowd` đo thêm hai mục `near` (quái < 10 m) và `warn` (báo trước đỏ), mỗi mục có `ok` riêng. Sửa câu ở changelog 25/10 (dòng 11, mục 4b); 05 §4.3 ghi luật mới của khe | `be55bf7`, `df787dc`; repo cha (canon) | Mục 1 |
| 3 | lớn | Thẻ vẫn nhảy trong 0,5 s giữ chỗ, có lượt đi 216–240 px rồi về trong 100–150 ms; làn ghi "chưa đếm" | Thẻ nhường chỗ cho một thân **một lần** mỗi lượt giữ (`yielded`): chỗ mới chỉ rời khi lại che từ 40 % một thân (`bodyAgain`); thẻ không về chỗ vừa rời trong 0,5 s (`back`) trừ khi trong tầm không còn chỗ trống nào; thẻ xếp lại sau lượt giữ của nó tránh chỗ của thẻ đang giữ (`reserved`) khi còn chỗ khác; qua 30 %, thẻ chỉ rời chỗ cũ cho chỗ che ít hơn ít nhất 5 điểm (`bodyStep`). `dh-crowd` đếm nhảy, nhảy trong lúc giữ (kèm lý do `data-left`), nhảy đi rồi về; `ok` cần 0 lần về dưới 480 ms | `be55bf7`, `df787dc` | Mục 1 |
| 4 | lớn | Toán tiên phong tự nó làm gãy B4 ở 80 seed (r1 gãy cả G1); changelog gán B4 của r5 cho √k, ghi r3 "đợi bộ seed thứ hai", hướng kế giữ nền đang gãy | Sửa câu kết luận, dòng r1, r3, r5 và bảng cổng của `2026-10-26-b1b7-names.md`; bỏ hướng kế cũ; hướng kế mới ở mục 3.4. Toán tiên phong và việc tách vùng thành đề xuất chờ anh (00 D30, D31) | tài liệu | Mục 3.1 |
| 5 | lớn | Phân tích Nhàn I bỏ sót vòng 26 m: ở 4/6 bot, 60–72 % I là lúc chưa quái nào vào vòng 26 m, không do T_a / k; câu "≤ 10 % cần tải cao hơn nhiều" nói quá | Viết lại mục 2 của `2026-10-26-b1b7-names.md`: tách I theo biên đang chặn (vòng 26 m, T_a / k, trong vùng chưa có chữ), thêm đòn bẩy "bỏ vòng 26 m của vùng hiện chữ" và đánh đổi với Q; bỏ câu nói quá. Sửa lý do của 00 D27, thêm một dòng ở BALANCE.md §9.1. D27 **không** áp "đã chọn theo đề xuất" | tài liệu; repo cha | Mục 3.2 |
| 6 | nhỏ | Kịch bản trình duyệt cho bằng chứng yếu mà không báo: `dh-hitstop-keys`, `dh-words` không có `ok`; CDP nghẽn khi có giọng đọc; một lượt Enter không vào đợt 1 mà vẫn ghi 0 mất phím | `lib/dh.mjs`: chặn `speechSynthesis` bằng `Page.addScriptToEvaluateOnNewDocument` (đếm số câu game định đọc ở `__dhSpoke`; `SPEECH=1` giữ giọng thật); `startWave()` bấm Enter tới khi pha là `wave` (tối đa 3 lần, không bấm trong 6 s báo đợt). `dh-hitstop-keys` có `ok` (vào đợt, gửi ≥ 90 phím, mất 0, ≥ 3 từ, trễ ≤ 70 ms, 0 số chồng ô cấm, 0 số chạm); `dh-words` có `ok` (vào đợt, ≥ 20 từ mỗi lượt, 0 chồng, 0 thiếu, 0 thừa, chữ ≥ 16 px, nghĩa ≥ 13 px) | `84d9432` | Mục 4 |
| 7 | nhỏ | Ngoại lệ giữ chỗ của 05 §4.3 ghi "đã chọn theo đề xuất" dù không tài liệu nào đề xuất; canon chưa đổi nên mã và canon lệch | Ghi thành đề xuất của làn, chờ anh: 00 D32; 05 §4.3 trỏ tới D32. Sửa changelog 25/10, `AGENTS.md`, `LANES.md` | repo cha; tài liệu | Mục 5 |
| 8 | nhỏ | Hướng kế B1/B7 và bản vá r6 đổi canon mà chưa có mục D; bản vá trỏ D30/D31 không tồn tại; toán tiên phong lên lịch trước `directorWaveStart` | Thêm 00 D30 (toán tiên phong), D31 (tách vùng hiện chữ khỏi vùng Héo lan), đều "đề xuất của làn, chờ chủ dự án, chưa vào mã"; D30 ghi rõ phải mở đợt của bộ điều nhịp trước khi toán đầu lên lịch. Bản vá vẫn chỉ ở `tmp/`, nay D30, D31 nó trỏ tới đã có | repo cha | Mục 5 |
| 9 | nhỏ | Đích Q của BALANCE §9.1 (Chuẩn hạ quái Nhỏ ở Q 55–70 %) trượt mà không phân tích; dòng B7 thiếu N, Q | Thêm đoạn "Q lệch đích và đánh đổi I ↔ Q" vào mục 2 của `2026-10-26-b1b7-names.md`, câu hỏi cho anh đi kèm D27 (00 D27). Dòng B7 nêu N 0,20 và Q 38 % | tài liệu | Mục 3.3 |
| 10 | nhỏ | Bảng "Cổng theo hai dải" ghi B7 D27 "đạt" ở r1–r4 dù mỗi vòng trượt ở một bộ seed | Ghi B7 D27 theo từng bộ seed ở mọi vòng; sửa dòng r3 | tài liệu | `2026-10-26-b1b7-names.md` §1.2 |
| 11 | nhỏ | Đòn bẩy "thành phần đợt" được giao nhưng không vòng nào đo, không ghi lý do | Ghi lý do (mục 3.4) và đưa vào danh sách của lượt B1/B7 kế | tài liệu | Mục 3.4 |
| 12 | nhỏ | Lưới 6 × 6 của `dh-crowd` đọc thiếu chứ không chỉ đọc thừa; ngưỡng `bodyFirm` 0,3 chỉnh theo sai số của lưới | `dh-crowd` đo diện tích hợp thật của các thẻ trên hộp (như `share()` của `layoutTags`); chú thích `bodyFirm` nay nói lý do theo cùng phép đo: thấp hơn mức cổng 40 % là 10 điểm, nên quái đi vào dưới thẻ được nhường chỗ trước khi tính là bị che | `df787dc`, `be55bf7` | Mục 1 |
| 13 | nhỏ | Thẻ đợt ghi "Quái sắp vào từ các đường sáng" nhưng không đường nào sáng; mũi tên Đường Trời vẫn chạy dưới "Yên" | Trong 6 s báo đợt, mỗi đường đất mà đợt kế dùng sáng vàng theo xung, vạch mũi tên chạy về bệ (01 §1.2: "Thẻ báo: đường nào sáng"); mũi tên Đường Trời chỉ chạy khi có đợt dùng nó. Kịch bản mới `dh-lanes` | `4851bc7` | Mục 2 |
| 14 | nhỏ | §2 changelog 26/10 ghi nhầm nhãn (5,4 s là nhịp chia chữ) và nguồn số I | Đổi nhãn (lượt chia chữ 0,25 s: 5,4 s; chữ kế của chuỗi: 0,7 s); ghi I đọc `FlowMeter` của bot (`scripts/balance/meter.ts`), cách (a) đo theo phép thử khóa của sim, kèm I gốc của nó | tài liệu | `2026-10-26-b1b7-names.md` §2 |
| 15 | nhỏ | Vài số chỉ có script, không có output; log `dh-crowd` r0–r2 không ghi HEAD | Lưu output: `tmp/mac-2026-10-25/b1b7/walk-out.txt`, `steps-b35-out.txt`, `vg-check-out.txt` (mỗi file có dòng đầu ghi cây và commit), `review-fix/idle-why-20.txt`. Script chạy lô `review-fix/run.sh` ghi HEAD và số file mã khác commit vào `rc.txt` của mỗi lượt | tmp | Mục 6 |
| 16 | nhỏ | Kit `numbers.ts`: chú thích hứa chặt hơn mã; `absorb` trong `settle()` không kẹp mép trên; `quadInk` dùng `minCellW`; changelog 25/10 ghi sai đơn vị số bị bỏ | Repo cha `4a616210`: kẹp mép trên sau khi gộp, `quadInk(label, cellW)` lấy ô thật, chú thích "tối đa 4 lượt"; `cfad21e1`: số đo `MAC` trong test là của Be Vietnam Pro 800 mà game nạp (đã đo trong trang: "Exo 2" không có, chữ số rơi về Be Vietnam Pro; system-ui cho 30,1 và 213,5), không phải phông hệ thống như 4a616210 ghi. Chép kit vào game (`5680c25`, `parentDirty: false`). Sửa câu "mỗi cơn" ở changelog 25/10 | `5680c25`; repo cha `4a616210`, `cfad21e1` | `pnpm kit:test` 289/289 |
| 17 | mới, lượt này | Lô trình duyệt 1 (`df787dc`): `dh-crowd` 720p, 70 WPM, seed 1 trượt `okFar`: một quái Cung bị thẻ "love" che 80 % suốt 24 khung. Thẻ vừa dời 117 ms trước vì chỗ cũ bị lấy. Theo mã, một thẻ đang giữ chỉ ở lại trên thân 80 % khi mọi chỗ khác trong tầm đều bị lấy hoặc che nhiều hơn, và vòng tìm cuối (có chỗ sạch xa hơn) không được thử vì trong tầm vẫn còn chỗ trống. Đây là suy ra từ mã: hai lượt thử lại cùng ô không gặp lại (che lớn nhất 33 %, 38 %) | Khi chỗ tốt nhất trong tầm vẫn che ≥ 40 % một thân, thẻ tìm một chỗ sạch trên vòng quanh neo (≤ 2 lần tầm đẩy, bước 3 lần thô hơn, tối đa 4 lần tìm mỗi khung); chỗ vòng giữ đúng chỗ đã vẽ (`dy`); thân dưới chỗ cũ luôn được xét. Mọi chỗ đặt có cùng một hình đối tượng (bản giữa làm test thời gian chậm 2–3 lần) | `f88b444` | Mục 1.2 (lô 2) |

## 1. Thẻ chữ: thẻ ở khe, vòng tìm cuối, giữ chỗ (phát hiện 1, 2, 3, 12)

### 1.1 Lý do thiết kế

- **Thẻ ở khe phải tránh thân.** 05 §4.3 đặt thẻ của quái trong 10 m ở 8–12 khe góc quanh bệ để Hỏa Long không che chữ. Nhưng khe là điểm cố định trên màn, còn quái vẫn đi vào bệ, nên quái (kể cả quái mang thẻ) đi qua dưới khe. Đây là vùng nguy hiểm nhất (Vòng Nguy 10 m) và là chỗ báo trước đỏ hiện nhiều nhất. Che quái ở đây đắt hơn che quái ở xa. Thẻ ở khe nay đẩy ngang, nâng bậc từ khe như thẻ thường. Thân của chính quái mang thẻ cũng tính, vì thẻ ở khe không đứng trên đầu quái đó.
- **Giữ chỗ là để không giật; nhường chỗ là để thấy quái.** 05 §4.3 muốn thẻ không nhảy khi người chơi đang đọc. Bản 25/10 cho thẻ đang giữ nhường chỗ khi che quá 30 % một thân, nhưng không giới hạn số lần. Mỗi lần dời đặt lại 0,5 s, và vòng tìm theo thứ tự gần nhất có thể chọn lại đúng chỗ cũ, nên thẻ nhảy đi rồi về. Bản này cho nhường **một lần** mỗi lượt giữ, chỗ mới chỉ rời khi lại che từ 40 % (mức cổng, tức quái thật sự bị che), và cấm về chỗ cũ trong 0,5 s. Lượt thử t1 của lượt sửa bị ngắt chặn hẳn lần dời thứ hai: một quái đi vào dưới thẻ vừa dời bị che 90 % suốt 19 khung (720p, seed 1), nên giữ mức 40 %.
- **Thẻ xếp lại tránh chỗ của thẻ đang giữ.** Đo lý do của các lần nhảy trong lúc giữ: phần lớn là "busy", tức chỗ bị một thẻ ưu tiên cao hơn lấy (thẻ hết lượt giữ được xếp lại, hoặc thẻ khóa phóng to 110 %). Thẻ được xếp sau lượt giữ của nó nay tránh chỗ của thẻ đang giữ khi còn chỗ khác trong tầm.
- **Cùng một phép đo cho luật và cho cổng.** Lưới 6 × 6 đọc 33–34 % thành 42 % và 75 % thành 33 %. `dh-crowd` nay tính diện tích hợp thật của các thẻ trên hộp, đúng như `share()` mà `layoutTags` dùng. Ngưỡng 30 % của luật thấp hơn mức cổng 40 % là 10 điểm, nên quái đi vào dưới thẻ được nhường chỗ trước khi tính là bị che.

### 1.2 Đo trên trình duyệt (Apple M4)

`dh-crowd`, Apple M4, Chrome 155 headless, giọng đọc chặn, Rồng giữ đứng (`HOLD` 40). Mỗi ô: số khung có một hộp bị thẻ che ≥ 40 % (diện tích hợp thật) trên số khung có hộp loại đó, che lớn nhất, chuỗi dài nhất. "Xa": quái từ 10 m; "gần": quái trong 10 m (thẻ ở khe); "báo trước": vòng đỏ của đòn sắp tới. Nhảy: số lần thẻ đổi chỗ so với quái > 12 px; "trong lúc giữ": < 480 ms sau lần nhảy trước của nó (lý do theo `data-left`); "về": về trong 6 px chỗ cũ dưới 480 ms. `ok` cần mọi chuỗi ≤ 6 khung và 0 lần về.

| Lượt | Commit | `ok` | Xa ≥ 40 % | Gần ≥ 40 % | Báo trước ≥ 40 % | Nhảy / trong lúc giữ (lý do) / về | Dừng ở |
|---|---|---|---|---|---|---|---|
| 1280×720, 35 WPM, seed 1 | `48c69f4` | **trượt** | 1 / 17.353 (tối đa 41 %, chuỗi 1) | 136 / 1.234 (tối đa 87 %, chuỗi 78) | 57 / 9.718 (tối đa 94 %, chuỗi 15) | 345 / 55 (-) / 7 | đợt 4 |
| 1920×1080, 35 WPM, seed 5 | `48c69f4` | **trượt** | 0 / 17.922 (tối đa 30 %, chuỗi 0) | 33 / 470 (tối đa 68 %, chuỗi 17) | 0 / 7.313 (tối đa 28 %, chuỗi 0) | 248 / 54 (-) / 7 | đợt 3 |
| 1920×1080, 70 WPM, seed 5 | `48c69f4` | **trượt** | 0 / 17.327 (tối đa 31 %, chuỗi 0) | 30 / 517 (tối đa 68 %, chuỗi 15) | 0 / 6.801 (tối đa 39 %, chuỗi 0) | 194 / 37 (-) / 3 | đợt 3 |
| 1280×720, 35 WPM, seed 1 | `df787dc` | đạt | 2 / 17.511 (tối đa 40 %, chuỗi 2) | 0 / 1.351 (tối đa 20 %, chuỗi 0) | 0 / 9.311 (tối đa 32 %, chuỗi 0) | 344 / 19 (body 8, busy 11) / 0 | đợt 4 |
| 1280×720, 70 WPM, seed 1 | `df787dc` | **trượt** | 24 / 16.773 (tối đa 80 %, chuỗi 24) | 0 / 1.083 (tối đa 20 %, chuỗi 0) | 0 / 8.543 (tối đa 32 %, chuỗi 0) | 306 / 34 (body 8, busy 26) / 0 | đợt 4 |
| 1280×720, 35 WPM, seed 5 | `df787dc` | đạt | 0 / 17.849 (tối đa 36 %, chuỗi 0) | 0 / 436 (tối đa 21 %, chuỗi 0) | 0 / 6.848 (tối đa 29 %, chuỗi 0) | 254 / 11 (busy 7, body 4) / 0 | đợt 3 |
| 1920×1080, 35 WPM, seed 1 | `df787dc` | đạt | 0 / 17.843 (tối đa 30 %, chuỗi 0) | 0 / 1.630 (tối đa 20 %, chuỗi 0) | 0 / 9.842 (tối đa 32 %, chuỗi 0) | 339 / 28 (busy 21, body 7) / 0 | đợt 4 |
| 1920×1080, 35 WPM, seed 5 | `df787dc` | đạt | 0 / 18.269 (tối đa 33 %, chuỗi 0) | 0 / 433 (tối đa 25 %, chuỗi 0) | 0 / 7.630 (tối đa 30 %, chuỗi 0) | 209 / 10 (body 6, busy 4) / 0 | đợt 3 |
| 1920×1080, 70 WPM, seed 5 | `df787dc` | đạt | 0 / 17.580 (tối đa 38 %, chuỗi 0) | 0 / 416 (tối đa 29 %, chuỗi 0) | 0 / 6.665 (tối đa 30 %, chuỗi 0) | 179 / 13 (busy 7, after-hold 1, body 5) / 0 | đợt 3 |
| 1280×720, 35 WPM, seed 1 | `68911ed` | đạt | 0 / 17.322 (tối đa 31 %, chuỗi 0) | 0 / 1.173 (tối đa 20 %, chuỗi 0) | 0 / 9.642 (tối đa 32 %, chuỗi 0) | 336 / 20 (body 7, busy 12, after-hold 1) / 0 | đợt 4 |
| 1280×720, 70 WPM, seed 1 | `68911ed` | đạt | 0 / 16.612 (tối đa 33 %, chuỗi 0) | 0 / 906 (tối đa 20 %, chuỗi 0) | 0 / 8.567 (tối đa 29 %, chuỗi 0) | 308 / 23 (body 11, busy 12) / 0 | đợt 4 |
| 1280×720, 35 WPM, seed 5 | `68911ed` | đạt | 0 / 17.670 (tối đa 35 %, chuỗi 0) | 0 / 429 (tối đa 21 %, chuỗi 0) | 0 / 7.287 (tối đa 32 %, chuỗi 0) | 272 / 15 (busy 4, body 11) / 0 | đợt 3 |
| 1920×1080, 35 WPM, seed 1 | `68911ed` | đạt | 0 / 17.511 (tối đa 30 %, chuỗi 0) | 0 / 1.336 (tối đa 20 %, chuỗi 0) | 0 / 9.304 (tối đa 32 %, chuỗi 0) | 308 / 34 (body 6, busy 27, after-hold 1) / 0 | đợt 4 |
| 1920×1080, 35 WPM, seed 5 | `68911ed` | đạt | 0 / 17.857 (tối đa 33 %, chuỗi 0) | 0 / 435 (tối đa 25 %, chuỗi 0) | 0 / 6.856 (tối đa 24 %, chuỗi 0) | 204 / 8 (body 4, busy 4) / 0 | đợt 3 |
| 1920×1080, 70 WPM, seed 5 | `68911ed` | đạt | 0 / 17.211 (tối đa 39 %, chuỗi 0) | 0 / 475 (tối đa 26 %, chuỗi 0) | 0 / 6.624 (tối đa 34 %, chuỗi 0) | 150 / 12 (busy 8, body 4) / 0 | đợt 3 |
| 1280×720, 70 WPM, seed 1 (lần 2) | `68911ed` | đạt | 0 / 16.622 (tối đa 39 %, chuỗi 0) | 0 / 933 (tối đa 18 %, chuỗi 0) | 0 / 8.603 (tối đa 33 %, chuỗi 0) | 335 / 26 (body 10, busy 16) / 0 | đợt 4 |
| 1920×1080, 70 WPM, seed 7 | `68911ed` | đạt | 1 / 17.230 (tối đa 40 %, chuỗi 1) | 0 / 396 (tối đa 20 %, chuỗi 0) | 0 / 6.679 (tối đa 31 %, chuỗi 0) | 214 / 10 (body 4, busy 6) / 0 | đợt 3 |

Ba hàng đầu là **trước bản sửa**: `tags.ts` của `48c69f4`, đo bằng bản `dh-crowd` buổi trưa (đã đo diện tích, gần, báo trước, nhảy; chưa ghi lý do nhảy). Sáu hàng giữa là lô 1 trên `df787dc` (bản sửa đầu); tám hàng sau là lô 2 trên `68911ed` (thêm bản sửa của dòng 17; ô 720p 70 WPM seed 1 chạy hai lần, thêm seed 7 ở 1080p 70 WPM).

Cùng ba ô (720p 35 WPM seed 1; 1080p 35 WPM seed 5; 1080p 70 WPM seed 5), trước → sau (`68911ed`):

- quái gần bị che ≥ 40 %: **199 / 2.221 khung → 0 / 2.083** (lớn nhất 87 % → 26 %);
- báo trước đỏ bị che ≥ 40 %: **57 / 23.832 → 0 / 23.122** (lớn nhất 94 % → 34 %);
- quái xa bị che ≥ 40 %: 1 / 52.602 → 0 / 52.390;
- nhảy trong lúc giữ: **146 → 40**; nhảy đi rồi về: **17 → 0**.

Cả tám lượt của lô 2: **8 / 8 `ok`**. Quái xa bị che ≥ 40 % ở 1 / 138.035 khung (một khung 40 %, seed 7), quái gần 0 / 6.083, báo trước 0 / 63.562; 148 lần nhảy trong lúc giữ trên 2.127 lần nhảy, 0 lần về. Lô 1 có một ô trượt (720p 70 WPM seed 1, 24 khung quái xa 80 %): dòng 17, sửa ở `f88b444`.

Số nhảy trong lúc giữ còn lại phần lớn là "busy" (chỗ bị một thẻ ưu tiên cao hơn lấy, thường là thẻ khóa phóng to 110 % hay thẻ mới bật 106 %), phần còn lại là "body" (một lần nhường cho thân, D32). Không còn lần nào nhảy đi rồi về.

Đã xem ảnh: `g-crowd-720-w70-s1/shots/crowd-1-1280x720.png` (sáu thẻ quanh đầu cầu, quái và hai dấu "!" đỏ không bị che, thẻ "young" đứng cạnh có vạch nối), `f-crowd-720-w35-s1/shots/cover-far-1-1280x720.png` (khung 40 % duy nhất của lô 1 ô đó: thẻ "work" che một nửa thân Cung trong 2 khung), `f-crowd-720-w35-s1/shots/tf-06-1280x720.png` (Thiên Hỏa: vòng báo trước đỏ và dấu "!" không bị thẻ "name" che).

### 1.3 Test mới (`tests/ui/tags-bodies.test.ts`, 13 → 21 ca)

| Test | Chứng minh |
|---|---|
| the last resort weighs every body round the anchor, below it too | Ca của probe: thân của chính thẻ dưới neo, một thân không chữ dưới-trái neo, ô cấm chặn mọi chỗ đẩy và nâng. Thẻ che thân kia ≤ 30 % (trước: 56 %), không chạm thân của chính nó, trong 240 px |
| ring-slot tags keep off bodies, their own foe's too; edge chips ignore them | Thẻ ở khe che quái đi qua và quái của chính nó ≤ 20 %; thẻ thường vẫn đứng trên đầu quái của nó; chip ở mép không đổi |
| after a move for a body inside its hold, moves again only for a foe 40 % hidden | Dời lần đầu ở 33 %; sau đó 33 % không dời nữa, 76 % thì dời |
| inside its hold it never goes back to the spot it just left while another is free; with none, it does | Không về chỗ cũ khi có chỗ khác; ô cấm chỉ chừa chỗ cũ thì về (nảy về gần hơn nhảy qua màn) |
| a tag laid out afresh keeps off a held tag's spot while another is free | Thẻ ưu tiên cao xếp lại không đẩy thẻ đang giữ; hết chỗ thì vẫn lấy (thẻ kia dời, `left: "busy"`) |
| over bodies, a last spot past the hold's limit stays unless another hides at least 5 points less | Chênh 1,6 điểm thì không dời |
| whose best spot in reach still hides 40 % of a body takes a clean ring spot within twice the reach | Ô cấm chỉ chừa một chỗ trong tầm (che quái 75 %) và một lỗ cách 210 px: thẻ ra lỗ, che 0 %, rồi giữ đúng chỗ đó; bịt lỗ thì vẫn ở trong tầm |
| holds a ring spot where it was drawn, below the anchor too | Chỗ vòng dưới neo 42 px giữ đúng 42 px (trước: khung sau nhảy lên hàng 0) |
| weighs the bodies under its last spot even out of the pushes' reach | Chỗ vòng cũ cách 210 px nằm trên quái 82 %: thẻ rời chỗ (`left: "body"`) |
| (thay ca cũ "ring tags and edge chips ignore bodies") | Ca cũ khẳng định thẻ ở khe bỏ qua thân, đúng lỗi phát hiện 2 |

## 2. Đường sáng khi báo đợt (phát hiện 13)

01 §1.2 ghi pha báo đợt 6 s có "Thẻ báo: đường nào sáng"; thẻ đợt ghi "Quái sắp vào từ các đường sáng". Tới nay không đường nào sáng. Mũi tên Đường Trời chạy suốt, kể cả khi thẻ ghi "Đường Trời: Yên".

- `src/view/lane-cue.ts`: mỗi khung đọc pha và đợt; trong Bày binh, báo đợt, nghỉ thì lấy các đường của đợt kế, trong đợt thì của đợt đang chạy; chỉ gọi `paths.cueLanes` khi đổi.
- `src/view/paths.ts`: mỗi đường đất có một dải phủ (ẩn tới khi báo đợt): vàng `#ffbd45` theo xung khoảng 1 Hz, viền sáng, vạch mũi tên trắng ngà chạy về bệ; hiện, tắt trong 0,25 s. Đường Trời mờ xuống 0,2 và mũi tên đứng yên khi không đợt nào dùng nó; trang không gọi `cueLanes` (xem địa hình, bench) thì như cũ.
- Bản đầu (lượt bị ngắt) dùng màu kem, độ phủ 0,3: trên đất màu sáng gần như không thấy (đã so ảnh báo đợt và ảnh trong đợt). Bản này đổi sang vàng, thêm viền.

`dh-lanes` (mới) chụp cùng một góc nhìn lúc Bày binh, 1 s và 4 s vào báo đợt 1, trong đợt 1, và 1 s vào báo đợt 2; đọc chữ trên thẻ đợt mỗi lần. Đã xem ảnh 1280×720 và 1920×1080: lúc báo đợt 1, Đường Cầu (qua cầu) và Đường Suối (bên trái) sáng vàng, vạch trắng chạy về bệ; Đường Trời mờ, đứng yên (thẻ ghi "Yên"). Trong đợt 1 hai đường hết sáng. Lúc báo đợt 2, Đường Trời có Ong×1 nên mũi tên chạy. Bằng chứng: `tmp/mac-2026-10-25/review-fix/f-lanes-720/`, `f-lanes-1080/`.

## 3. Cân bằng: sửa phân tích của bước B1/B7 (phát hiện 4, 5, 8, 9, 10, 11, 14)

Không vòng đo mới. Số dưới đây là số đã có: của làn (`tmp/mac-2026-10-25/b1b7/`) và của người phản biện (`tmp/mac-2026-10-25/review-balance/`, dựng lại r1, r3 từ bản vá, khớp JSON của làn 0 / 45 hàng ở 2 × 20 seed).

### 3.1 B4 gãy vì toán tiên phong (phát hiện 4)

| Vòng, 80 seed | G1 (Chuẩn thắng, 75–90 %) | B4: S Chậm chắc so với S Ẩu | Nguồn |
|---|---|---|---|
| gốc `0cc3370` | 85,0 %, đạt | 65,5 > 61,4, đạt | `b1b7/r0-base-80.md` |
| r1 (toán tiên phong) | **92,5 %, trượt** | **67,2 so với 67,2, trượt** | `review-balance/rv-r1-80.md` |
| r3 (r1 + tách vùng, `DIRECTOR_IDLE_SLACK` 100) | 87,5 %, đạt | **65,9 so với 67,8, trượt** | `review-balance/rv-r3-80.md` |
| r5 (r3, Héo lan T_a / √k khi k > 1) | 87,5 %, đạt | **65,9 so với 67,8, trượt** (Mới, Chậm chắc, Chuẩn, Ẩu, Chuẩn tắt nhịp trùng r3 từng số) | `b1b7/r5-root-80.md` |

Toán tiên phong làm Ẩu lên nhiều hơn Chậm chắc (S Ẩu 61,4 → 67,2, Chậm chắc 65,5 → 67,2; số đọc lại từ JSON của từng lượt). Đòn bẩy √k chỉ chạm bot có k > 1 (Khá, Nhanh), nên B4 của r5 là B4 của r3. Đã sửa ở `2026-10-26-b1b7-names.md` (câu kết luận, dòng r1, r3, r5, bảng cổng). Bảng cổng ghi B7 (dải D27) theo từng bộ seed ở mọi vòng (phát hiện 10): r1, r2, r3 trượt ở bộ 21261026; r4 trượt ở bộ 20261023.

### 3.2 Nhàn I: vòng 26 m, không chỉ T_a / k (phát hiện 5, 14)

Mã (`src/sim/words.ts:848-856`, `inWordZone`): quái phải vào vòng 26 m (`RINGS.wordZoneMm`, `src/content/rules.ts:400`) **và** còn trong T_a giây cuối đường thì mới có chữ. BALANCE.md §9.1 ghi Vùng Chữ tính bằng thời gian "thay cho 26 m cố định"; mã giữ cả hai. Tách I theo biên đang chặn (Cân bằng, 20 seed, mã đã commit; `tmp/mac-2026-10-25/review-fix/idle-why-20.txt`, khớp số người phản biện từng ô):

| Bot | I | Do vòng 26 m | Do T_a / k | Trong vùng, chưa có chữ | Còn lại |
|---|---|---|---|---|---|
| Mới | 16,5 | 11,4 (69 %) | 0,0 | 2,8 | 2,3 |
| Chậm chắc | 18,8 | 13,0 (69 %) | 0,0 | 3,1 | 2,7 |
| Chuẩn | 21,1 | 12,7 (60 %) | 3,0 | 3,6 | 1,8 |
| Khá | 27,1 | 8,8 (32 %) | 13,1 (48 %) | 4,0 | 1,2 |
| Ẩu | 16,5 | 11,9 (72 %) | 0,0 | 3,5 | 1,1 |
| Nhanh | 30,9 | 8,0 (26 %) | 18,1 (59 %) | 4,3 | 0,5 |

Chi tiết và nhãn đúng của từng quãng chờ: `2026-10-26-b1b7-names.md` mục 2 (viết lại). Kết luận đổi:

- Đề xuất D27 vẫn đứng, nhưng nay đi kèm một đòn bẩy chưa nêu và chưa đo: **bỏ vòng 26 m của vùng hiện chữ** (đúng chữ của BALANCE §9.1), giữ vùng Héo lan. Cận trên khoảng 12 điểm I ở Chuẩn. Đánh đổi: chữ hiện sớm hơn thì Q còn thấp hơn.
- Câu "≤ 10 % chỉ đạt khi tải gõ cao hơn nhiều" đã bỏ: chưa đo đòn bẩy trên.
- Người điều phối **không** nên áp "đã chọn theo đề xuất" cho D27 trước khi anh xem đánh đổi này. Lý do của 00 D27 đã viết lại; BALANCE.md §9.1 thêm một dòng.

### 3.3 Q lệch đích của §9.1 (phát hiện 9)

BALANCE.md §9.1: T_a đặt sao cho bot Chuẩn hạ quái Nhỏ ở Q ≈ 55–70 % đường. Đo: Q của mọi bot 37–48 %, Chuẩn 39 % (40 seed). T_a của Chuẩn 9,75 s, quãng đi của quái Lính 12,3 s (`b1b7/walk-out.txt`), nên chữ hiện ngay khi quái vào vòng 26 m. Q lên 55–70 % cần chữ hiện muộn hơn (T_a ngắn đi), và I còn tăng. Bỏ vòng 26 m thì I giảm nhưng Q còn thấp hơn. Trên đường 25 m của M0, đích I và đích Q ngược chiều nhau. Đây là câu hỏi cho anh, đi kèm D27. B7 đọc đủ dải §3: bot Chuẩn tắt nhịp còn lệch N 0,20 (dải 0,3–1) và Q 38 % (dải 50–70), ngoài S 65,3 và I 21,6.

### 3.4 Hướng kế cho lượt B1/B7 sau (thay hướng ở `2026-10-26-b1b7-names.md` §1.3)

Lượt kế cần anh trả lời D27 trước (dải I, và chọn đòn bẩy vòng 26 m hay rút T_a theo đánh đổi I ↔ Q). Sau đó, ngân sách 6 vòng mới, mỗi vòng đo hai bộ × 40 seed ngay từ đầu:

1. **Một mình đòn bẩy vòng 26 m** (nếu anh chọn): bỏ vòng 26 m khỏi vùng hiện chữ, giữ vùng Héo lan và mọi thứ khác. Không đổi tải, không đi qua biên thời gian. Đo I, Q, và B4 trước khi thêm gì.
2. **Toán tiên phong chỉ khi B4 còn biên:** nó gãy B4 ở 80 seed. Nếu giữ, rút quãng đi trước (chỉ đủ cho quái chậm nhất, không cho cả kế hoạch), và mở đợt của bộ điều nhịp trước khi toán đầu lên lịch (00 D30).
3. **Đòn bẩy tách S của Chậm chắc khỏi S của Ẩu** mà không qua biên thời gian (r4, r6 cho thấy biên dồn lên Ẩu hoặc Mới). Ứng viên chưa đo: chất lượng từ (`WORD_DONE{quality}`) nặng hơn trong sát thương, hoặc phím sai đẩy chữ kế chậm lại.
4. **Thành phần đợt cho người gõ nhanh** (phát hiện 11; `2026-10-25-m0a-round3-fix.md`:185): thêm quái nhỏ đi nhanh ở đợt giữa thay cho đổi tốc độ mọi quái. Bước trước không đo vì sáu vòng dành cho các đòn bẩy vùng và biên mà round3-fix §4 xếp trước, và vì đổi thành phần đợt đổi tải của mọi bot (cần chỉnh lại G1, G9). Nay vào danh sách: ở Khá, Nhanh, 48–59 % I là T_a / k, và quái đi nhanh (Sói: 6,8 s đường, chữ sau 1,2 s) không để người gõ nhanh chờ.

## 4. Kịch bản trình duyệt (phát hiện 6)

Chẩn đoán (người phản biện và lượt bị ngắt, trên `48c69f4`; lượt chặn giọng đọc ở `tmp/mac-2026-10-25/review-browser/*-mute-*`): trên Mac, Chrome 155 headless dừng trả lời CDP 13–15 s sau mỗi lần game gọi `speechSynthesis.cancel()` rồi `speak()` bằng giọng mạng. Một vòng lặp CDP đứng 13.021 ms. Vì vậy `dh-hitstop-keys` chỉ gửi 23–24 trên khoảng 100 phím, `dh-words` gõ 1–4 từ mỗi lượt 60 s, `dh-crowd` seed 2, 3 chỉ được 1–2 / 3 lần đo. Chặn giọng đọc thì mọi lượt chạy đủ. Kịch bản đếm số câu game định đọc (`spoke`), nên vẫn biết game có gọi giọng đọc.

Kết quả trên mã đã commit (Apple M4, Chrome 155 headless):

| Kịch bản | Commit | Cỡ, nhịp | `ok` | Số chính |
|---|---|---|---|---|
| `dh-hitstop-keys` | `df787dc` | 1280×720 | đạt | vào đợt 1; gửi 99 phím, mất 0; 4 từ; trễ phím → khung tối đa 19,7 ms, TB 14,8 ms; 0 số trên ô cấm; 721 khung, 605 có số, 0 khung có số chạm nhau, khe nhỏ nhất 7,8 px; giọng đọc gọi 4 lần |
| `dh-hitstop-keys` | `df787dc` | 1920×1080 | đạt | vào đợt 1; gửi 95, mất 0; 4 từ; trễ tối đa 23,8 ms, TB 14,7 ms; 0 số trên ô cấm; 721 khung, 708 có số, 0 chạm, khe nhỏ nhất 8,2 px |
| `dh-hitstop-keys` | `68911ed` | 1920×1080, 70 WPM | đạt | vào đợt 1; gửi 95, mất 0; 4 từ; trễ tối đa 19,3 ms, TB 14,3 ms; 0 số trên ô cấm; 722 khung, 707 có số (tối đa 7 cùng lúc), 0 chạm, khe nhỏ nhất 10,6 px |
| `dh-words` | `df787dc` | 35 WPM, 720p và 1080p, cỡ thẻ 100 và 150 % | đạt (4/4 lượt) | gõ 28–29 từ mỗi lượt (trước: 1–4); 1.145 lần kiểm, 0 chồng, 0 thiếu, 0 thừa; chữ nhỏ nhất 16 px (720p, 100 %), nghĩa 13 px |
| `dh-words` | `df787dc` | 70 WPM (k 1,449) | đạt (4/4) | gõ 34–35 từ mỗi lượt; 1.121 lần kiểm, 0 chồng, 0 thiếu, 0 thừa; tối đa 4 thẻ cùng lúc |
| `dh-words` | `68911ed` | 35 WPM / 70 WPM, cả bốn cỡ | đạt (4/4) / đạt (4/4) | 29 từ mỗi lượt / 34–35; 1.226 / 1.131 lần kiểm; 0 chồng, 0 thiếu, 0 thừa; chữ nhỏ nhất 16 px, nghĩa 13 px (720p, 100 %) |
| `dh-numbers-drawn` | `df787dc` (kit `cfad21e1`) | 720p / 1080p | đạt / đạt | 30 khung cơn đòn mỗi cỡ: 0 khung có số chạm, 0 cặp mực chồng, khe nhỏ nhất 7,6 / 10,1 px, 0 px mực ra ngoài hộp; bỏ 93 / 97 số (luật "không chỗ thì bỏ"). Đối chứng hộp cũ (chỉ chữ số): 26 khung chạm, 129 / 108 cặp |
| `dh-lanes` | `df787dc` | 720p / 1080p | đạt / đạt | thẻ đợt ghi "Quái sắp vào từ các đường sáng" ở cả hai lần báo; Đường Trời "Yên" ở đợt 1, "Ong×1" ở đợt 2; ảnh: mục 2 |
| `dh-smoke` | `68911ed` | 720p và 1080p | mở được | 0 lỗi trang, 0 tài nguyên hỏng |
| `dh-telegraphs` | `68911ed` | 1920×1080 | đạt | 5 loại báo trước của quái (cung, vòng, đường) và 1 của phe ta đều thấy; báo trước ngắn nhất 500 ms; 0 bỏ sót |

Đã xem ảnh: `hitstop-storm-1280x720.png` (hai số "HOÀN HẢO" ở mép trên đủ nhãn, không chạm), `drawn-fixed-4-crop-1280x720.png` (số trong cơn đòn tách nhau, nhãn đọc được).

## 5. Canon (repo cha, phát hiện 2, 5, 7, 8, 9)

| Chỗ | Đổi |
|---|---|
| 00 D27 | Lý do viết lại: Vùng Chữ là giao của vòng 26 m và T_a; 60–72 % I ở bốn bot là vòng 26 m; hai đòn bẩy không đổi tải (bỏ vòng 26 m, rút T_a) và đánh đổi I ↔ Q để anh chọn cùng D27 |
| 00 D30 (mới) | Toán tiên phong: đề xuất của làn, chờ anh, chưa vào mã. Số đo và việc phải mở đợt của bộ điều nhịp trước |
| 00 D31 (mới) | Tách vùng hiện chữ khỏi vùng Héo lan: đề xuất của làn, chờ anh, chưa vào mã. `DIRECTOR_IDLE_SLACK` 100 đi theo D27 |
| 00 D32 (mới) | Ngoại lệ giữ chỗ của 05 §4.3: đề xuất của làn, chờ anh; mã đang chạy theo đề xuất (25/10 ghi nhầm "đã chọn theo đề xuất"). `bodyFirm` 0,8 thì gần như luật cũ |
| 05 §4.3 | Câu giữ chỗ trỏ D32; vòng khe: thẻ ở khe tránh thân quái và báo trước đỏ như thẻ thường, kể cả thân của chính quái mang thẻ |
| BALANCE.md §9.1 | Một dòng dưới D27: Vùng Chữ trong mã là giao của vòng 26 m và T_a; Q lệch đích; đích I và Q ngược chiều |

## 6. Lần kiểm

| Kiểm | Trên | Kết quả |
|---|---|---|
| `pnpm kit:test` (repo cha, `heavy.sh`) | repo cha `9c429863` (gồm `4a616210`, `cfad21e1`) | 36 file, **289 / 289** |
| `pnpm kit:check` | repo cha sau khi chép | dragon-hold OK (typing-defense OK; typing-survival và immortality-cultivation lệch `feedback/index.ts`, `numbers.ts`: việc của người điều phối) |
| `pnpm check` (`heavy.sh`) | `df787dc` | kit 73 file khớp; **389 / 389** test (45 file); build đạt |
| `pnpm check` (`heavy.sh`) | `68911ed` | kit khớp; **392 / 392** test, gồm golden (sim không đổi); build đạt |
| Thời gian `layoutTags`, 20 thẻ, 40 thân (test, tốt nhất của 5 lô, máy đang chạy ba làn khác) | `68911ed` | 0,32–0,38 ms; `df787dc` (trước bản sửa dòng 17) 0,37–0,40 ms trong cùng file test. Một bản giữa (thẻ có `dy` với hình đối tượng khác nhau) đo 0,8–1,3 ms: mọi chỗ đặt nay có cùng các trường, cùng thứ tự |
| Kịch bản trình duyệt | `df787dc`, `68911ed` | mục 1.2 và mục 4 |
| `dh:balance` | không chạy lại | sim, bot, golden không đổi (test golden đạt); không vòng đo mới (hết 6 vòng của họ B1/B7) |

Mỗi lượt trình duyệt ghi HEAD và số file mã khác commit (`dirty-code`) vào `rc.txt`: mọi lượt nêu ở đây có `dirty-code=0`. Bằng chứng: `tmp/mac-2026-10-25/review-fix/` (`f-*`: lô 1 trên `df787dc`; `g-*`: lô 2 trên `68911ed`; `b1-*`: lượt trước bản sửa; `probe/`; `final/check*.txt`, `kit-test.txt`).

## 7. Còn mở

- **Chờ anh:** D27 (dải I, kèm chọn đòn bẩy vòng 26 m hay rút T_a theo đánh đổi I ↔ Q); phần luật cổng của D29; D30, D31 (đề xuất của làn, chưa vào mã); D32 (ngoại lệ giữ chỗ, mã đang chạy theo đề xuất).
- **B1, B7** vẫn trượt cả hai dải; lượt kế theo mục 3.4, sau khi anh trả lời D27. **B9:** anh chơi thử 10 đợt, thêm một lượt `?wpm=70`.
- **`dh-crowd` mới đo đợt 3–4 ở `L2-cau`** (hoặc 240 s sau lần đo thứ ba). Đám đông lớn hơn (đợt 7–10, tướng, boss) chưa đo từng khung: để đợt test chia theo màn.
- **Thẻ vẫn có thể dời xa một lần trong lúc giữ** (nhường cho một thân, tới 216 px ở 720p seed 1). Đây là cái giá của D32; mỗi lượt giữ chỉ một lần, không nhảy về.
- **Thẻ ở khe nay rời khe khi có thân dưới nó.** 05 §4.3 cũ ghi "khe không đổi chỗ khi quái nhích"; câu đó vẫn đúng cho khe, nhưng thẻ có thể đẩy ngang, nâng bậc từ khe. Cần xem ở buổi chơi thử.
- **Đường sáng chưa theo cài đặt giảm chuyển động** (05 §4.6, 06 §3): xung 1 Hz và vạch chạy luôn bật.
- **Giọng đọc trong kịch bản bị chặn** (`SPEECH=1` để bật): kịch bản không còn đo được lúc giọng mạng làm nghẽn trang; nghe thật để buổi chơi thử.
- **Kit cho typing-survival** (và immortality-cultivation, đang tạm dừng): người điều phối chạy `kit:sync`, rồi chạy lại kịch bản số của game đó.
- **Repo cha:** gitlink `games/dragon-hold` chưa nâng (người điều phối). Thư mục `art-src/` chưa theo dõi không phải của làn này.

## 8. File

| File | Đổi |
|---|---|
| `src/ui/tags.ts` | `layoutTags`: `around` cho vòng tìm cuối, `ownClear`, `yielded`/`bodyAgain`, `back`, `reserved`, `bodyStep`, thoát ra vòng sạch khi chỗ tốt nhất còn che ≥ 40 %, chỗ vòng giữ đúng `dy`, `near` gồm thân dưới chỗ cũ, `TagPlace.left`, một hình đối tượng; `createTags`: thẻ ở khe xét thân, `data-left`, `is-ring` |
| `src/view/lane-cue.ts` (mới), `src/view/paths.ts`, `src/app/app.ts` | Đường sáng khi báo đợt, mũi tên Đường Trời theo đợt |
| `tests/ui/tags-bodies.test.ts` | 21 ca (thêm 8) |
| `tests/view/lane-cue.test.ts` (mới) | 4 ca |
| `scripts/visual/scenarios/lib/dh.mjs` | chặn `speechSynthesis`, `startWave()` |
| `scripts/visual/scenarios/dh-crowd.mjs`, `dh-hitstop-keys.mjs`, `dh-words.mjs`, `dh-lanes.mjs` (mới) | đo diện tích, `near`, `warn`, đếm nhảy; `ok` |
| `src/kit/feedback/numbers.ts`, `src/kit/kit-manifest.json` | chép kit ở repo cha `cfad21e1` |
| `docs/changelog/2026-10-25-mac-kit-drift-crowd.md`, `2026-10-26-b1b7-names.md` | sửa theo phản biện (đánh dấu "Sửa sau phản biện") |
| `AGENTS.md`, `LANES.md` | dòng trạng thái, mục "Mac: review fixes" |
| Repo cha: `docs/games/dragon-lane/00-canon.md` (D27, D30–D32), `05-presentation-audio-tech-split.md` (§4.3), `docs/games/BALANCE.md` (§9.1) | mục 5 |
