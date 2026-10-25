# 25–26/10/2026 · M0a trên Mac: sửa lệch kit của số sát thương (`box()`, `settle()`), `dh-crowd` đủ ba lần đo và đo từng khung, thẻ chữ che thân quái ít hơn

Làm trên **Mac mini M4** (Apple M4, 10 nhân, 16 GB, macOS 15.5), Node 24.22, pnpm 11.21. Trình duyệt: **Apple M4, Chrome 155 headless** (GPU thật, khung khóa 60 Hz, khung TB 16,67 ms), điều khiển qua `scripts/visual/cdp-run.mjs`, Vite ở cổng 3005. Máy có ba làn khác chạy cùng lúc. Mọi lệnh nặng chạy dưới `.local/bin/heavy.sh` (bản 2: đếm 10 nhân, 3 chỗ trình duyệt, lượt đo trễ phím giữ cả 3; 1 chỗ commit repo cha). Phần sau nửa đêm (26/10: mục 4b, 5) làm trên cùng máy. Số khung hình và trễ phím ở đây là **số của Apple M4**, không so thẳng được với số của Dell (Windows Chrome, RTX 3050 Ti, khung không khóa khoảng 238 khung/giây).

## Mục rà soát đã sửa

| Nguồn | Mục | Đã làm | Kết quả |
|---|---|---|---|
| Process §6.A (dragon-hold, phụ); vòng 3 "Còn mở"; §6.B | Kit `feedback/numbers.ts`: chữ số nghiêng tràn ô atlas 48 px, dấu của nhãn lấn ô "3"; `box()` chỉ tính bước chữ số và 1 cỡ chữ; `settle()` một lượt | Phần atlas đã sửa ở vòng 3 (repo cha `512033e9`). Bước này đưa phần còn lại vào kit: hộp theo phần vẽ, `settle()` chạy tới khi hết chạm. Commit ở repo cha trước (`52bdc8df`), rồi chép vào game (`5187d76`, `parentDirty: false`). Game bỏ `DrawnNumberField` | Mục 1 |
| Process §6.A (dragon-hold, phụ) | `dh-crowd` ở 1920 chỉ lấy được 1/3 lần đo vì Rồng gục | Kịch bản giữ Rồng đứng (`HOLD`), mặc định seed 5, có `ok` (`62255d9`) | 6/6 lượt đủ 3/3 lần đo (mục 3); mã cuối, thêm seed 1 và 7: 10/10 (mục 5) |
| Vòng 3 "Còn mở" | `dh-crowd` seed 4, lần đo 2: một Yêu Rêu Cung bị che 44 % | Đo lại độ che trên seed 4, 5, 6 ở hai cỡ. Thấy một quái bị che 83 % và sửa cách xếp thẻ (`249102d`) | 0 / 139 mẫu quái bị che ≥ 30 % (mục 4); mã cuối: 0 / 224 mẫu ảnh, 0 / 33.592 khung có quái ≥ 40 % (mục 4b) |
| Mới, bước này (26/10) | `dh-crowd` trên mã đã commit (`4e388dd`), seed 1, 720p, lần đo 2: một Yêu Rêu không chữ bị thẻ che 50 % (một lượt thử sau: 83 %). Đo từng khung: 48–57 khung mỗi lượt có quái bị che ≥ 40 % | Thẻ đang giữ chỗ 0,5 s nhường chỗ khi che quá 30 % một thân (`9395667`, `710f34a`); vòng tìm chỗ cuối tránh thân quái của chính thẻ (`710f34a`); `dh-crowd` đo từng khung (`73b265c`) | Mục 4b |
| Mới, bước này | `dh-hitstop-keys`: mỗi lượt có 1 mẫu số sát thương nằm trên vùng cấm sau khung; ở 720p số mất nhãn ở mép trên | Đọc vùng cấm trước khi vẽ (`e117ce0`); `settle()` không nâng số lên ô cấm hay quá mép trên; số bay lên dừng ở mép trên (kit `fc69a921`, `df2f4882`, `21e8eaf9`; game `6f739ec`, `cc52ed9`, `4e388dd`) | Mục 2 |

## 1. Kit: hộp số sát thương theo phần vẽ, `settle()` tới khi hết chạm

**Lỗi (lệch kit từ vòng 3).** `NumberField.box()` của kit chỉ tính bước chữ số (0,58 cỡ chữ mỗi chữ) và 1 cỡ chữ chiều cao (số Hoàn hảo 1,42). Thứ `NumberSprites` vẽ lớn hơn:

- mực của chữ số nghiêng có viền 9 px ra quá bước chữ;
- quad chữ số cao 1,25 cỡ chữ, tính từ đỉnh số;
- nhãn "HOÀN HẢO" rộng hơn hai, ba chữ số.

Hai nhãn cạnh nhau chạm nhau (cổng vòng 2), chữ số chạm nhãn của số bên dưới (rà soát 2, lỗi nhỏ 2). `settle()` chỉ chạy một lượt, nên số vừa nâng có thể nằm lên số đã xét: vòng 3 đo 8–11 trên khoảng 2.770 khung mỗi lượt cơn đòn. Game tự sửa cả hai trong `DrawnNumberField` (`src/view/number-field.ts`), nên kit và game lệch nhau.

**Sửa ở kit** (`shared/game-kit/feedback/numbers.ts`, repo cha `52bdc8df`):

- `numberInk(label, measure)`: chỗ có mực trong atlas, đo bằng phông của atlas (chữ đặt giữa, đường chuẩn "middle", như lúc vẽ). Gồm: nửa bề ngang của chữ số rộng nhất, hàng mực của chữ số, bề ngang và hàng mực của nhãn; cộng nửa viền và 1 px làm mịn. Phần nào canvas không đo được thì lấy cả quad (`quadInk`).
- `NumberField.box()`: rộng = các bước chữ + phần mực tràn hai đầu; số Hoàn hảo lấy max với bề ngang nhãn. Cao từ đỉnh mực của nhãn tới đáy mực của chữ số. Cộng 3 px. Mực đo một lần trên canvas; không có `document` (test, worker) thì lấy cả quad. `NumberField.ink` gán được.
- `settle()`: chạy lại tới khi một lượt không gặp cặp nào chạm, tối đa 4 lượt mỗi khung.
- `DRIFT.md` thêm một dòng (việc của Space và typing-survival).

**Test của kit** (5 test mới, số đo phông của Chrome 155 trên Mac):

| Test | Chứng minh |
|---|---|
| `numberInk` | đúng số từ số đo (chữ "7" xa nhất: 24,1 px; nhãn 225,7 px); phần thiếu số đo lấy cả quad |
| hộp chứa mực | mọi chữ số và nhãn mà `NumberSprites` ghi cho GPU nằm trong `box()`; hộp chỉ dư 3 px và phần tràn của chữ rộng nhất. Hộp cũ (theo bước chữ) để ≥ 5 mảnh mực ra ngoài |
| hai Hoàn hảo cùng chỗ | mực không chạm, cả khi bay 20 khung; hộp cũ: chạm |
| số ngay dưới một Hoàn hảo | chữ số không chạm nhãn; hộp cũ: chạm |
| `settle()` nhiều lượt | số bị nâng lên một số đã xét được nâng tiếp trong cùng khung; với 1 lượt, test trượt (đã thử) |

`pnpm kit:test`: 284 / 284, 36 file (trước 279); sau mục 2: 287 / 287. `tsc` của kit: 0 lỗi.

**Phía game** (`5187d76`): `src/view/fx.ts` dùng thẳng `NumberField` của kit; xóa `src/view/number-field.ts`. `tests/view/number-field.test.ts` kiểm field của kit (4 ca: hộp chứa quad, hai nhãn cùng chỗ, số chồng dọc, `settle()` nhiều lượt). Đối chứng của `dh-numbers-drawn` nay đặt hộp cũ (theo bước chữ, `OLD_BOX`) lên field.

**Chỉ chép vào dragon-hold.** `kit:check` sau khi chép: dragon-hold, typing-defense đạt; typing-survival và immortality-cultivation báo cũ (`feedback/index.ts`, `feedback/numbers.ts`). Người điều phối chép cho typing-survival sau. Tu Tiên đang tạm dừng, không đụng.

## 2. Số sát thương nằm trên vùng cấm sau khung: hai nguyên nhân

**Lỗi.** Trên Mac, `__dh.numbersOverlaps()` (lấy mẫu trong khung, sau khung của game) thấy 1 mẫu số nằm trên một ô cấm (khung học, thẻ chữ, bảng HUD) ở mỗi lượt `dh-hitstop-keys` thử trước khi sửa, cả 720p và 1080p. Kit hứa "không số nào che ô cấm".

**Nguyên nhân 1.** `src/app/app.ts` đọc các ô cấm mỗi 250 ms, ở **cuối** khung, sau khi số đã cập nhật và đã vẽ. Field biết ô mới chậm một khung. Sửa (`e117ce0`): `refreshKeepOut(now)` chạy trước vòng `presenter.frame`, nên field bỏ số bị ô mới che trước khi vẽ. Giữa hai lần đọc (250 ms), một thẻ vẫn có thể đi lên một số; đó là cái giá đã chọn để không đọc DOM mỗi khung.

**Nguyên nhân 2.** Lượt chạy lại trên `249102d` vẫn có 1 mẫu ở 720p (1080p: 0). `update()` bỏ số trôi vào ô cấm, rồi mới gọi `settle()`; `settle()` nâng số trẻ hơn lên trên số kia mà không xét ô cấm, nên có thể đặt nó lên thẻ chữ ngay phía trên. `settle()` nhiều lượt nâng nhiều hơn. Sửa ở kit (repo cha `fc69a921`, chép vào game `6f739ec`): số bị nâng lên ô cấm thì bỏ, như số trôi vào ô cấm. Test mới của kit trượt trước khi sửa (`overlaps()` 1), đạt sau khi sửa.

**Mép trên.** Ảnh `hitstop-storm-2` 720p của lượt chạy trên `96f05dd`: số "956" ở mép trên chỉ thấy nửa dưới, mất nhãn; số "575" mất nhãn. `spawn()` không bao giờ đặt hộp số quá mép trên, nhưng có hai đường đưa số lên đó:

- `settle()` nâng số lên quá mép. Sửa ở kit (`df2f4882`, game `cc52ed9`): số bị nâng quá mép trên cũng bị bỏ. Ảnh của lượt chạy trên `cc52ed9`: "956" không còn, "575" vẫn mất nhãn.
- Số bay lên (vận tốc ban đầu 90 px/s, cản e^−4t, tổng khoảng 22 px) trôi quá mép. Sửa ở kit (`21e8eaf9`, game `4e388dd`): số bay tới mép trên thì dừng ở đó.

Mỗi sửa có một test mới, trượt trước khi sửa.

## 3. `dh-crowd`: đủ ba lần đo ở mọi seed

**Lỗi.** Từ đợt 3, bot cố ý chỉ gõ quái trong 7 m để đám đông dồn ở đầu cầu. Chữ chờ làm Héo lan rút máu Rồng, nên ải kết thúc trước lần đo thứ ba. Trên Dell (vòng 3, 1080p): seed 1–4 và 7 chỉ lấy được 1–2 / 3 lần đo. Trên Mac, kịch bản cũ ở seed 1, 1080p: **0 / 3** (Rồng gục trước lần đo đầu).

**Sửa** (`62255d9`, `scripts/visual/scenarios/dh-crowd.mjs`):

- `HOLD` (mặc định 40; 0 là tắt): khi máu Rồng dưới 40 %, trang đặt máu về đầy. Kịch bản này đo thẻ chữ che thân quái, không đo sống sót, nên đổi thế giới ở đây không làm sai thứ được đo. `replayCheck` không còn khớp (kịch bản không dùng nó); `heals` đếm số lần hồi.
- Seed mặc định 5 (seed đủ 3 lần đo trên Dell).
- `ok`: đủ 3 lần đo; mỗi lần che TB ≤ 20 % và không quái nào ≥ 40 %; Thiên Hỏa đã phát; 0 exception.
- Mỗi lần đo in `worst`: ba quái bị che nhiều nhất, kèm hộp trên màn, để tra theo ảnh.

**Kết quả** (Apple M4, seed 4, 5, 6 × 720p, 1080p, mã `62255d9`): **6 / 6 lượt đủ 3 / 3 lần đo**, 9 lần hồi máu tổng. Mọi lần đo ở đợt 3, máu Rồng lúc đo 229–392. Trên mã cuối `710f34a`, thêm seed 1 và 7: 10 / 10 lượt đủ 3 / 3 lần đo, 15 lần hồi máu (mục 5).

## 4. Thẻ chữ che thân quái: r0–r2 (25/10)

Đích của vòng 2 (dễ đọc): che TB ≤ 20 % mỗi lần đo, không quái nào ≥ 40 %. Mỗi vòng: seed 4, 5, 6 × 720p, 1080p = 18 lần đo, khoảng 139 mẫu quái.

| Vòng | Mã | Lượt `ok` | Mẫu ≥ 40 % | Mẫu ≥ 30 % | Che TB (TB / lớn nhất) | Quái bị che nhiều nhất mỗi lần đo (TB / lớn nhất) |
|---|---|---|---|---|---|---|
| r0 | `62255d9` (cách xếp cũ) | 5 / 6 | 1 | 4 | 5,1 / 13 % | 23,5 / **83 %** |
| r1 | chỗ che ít nhất (thử, không commit riêng) | 3 / 6 | 3 | 4 | 5,3 / 11 % | 23,6 / 50 % |
| r2 | r1 + cộng phần thẻ trước đã che (`249102d`) | **6 / 6** | **0** | **0** | 3,2 / 11 % | **14,8 / 28 %** |

**r0, nguyên nhân 83 %** (seed 5, 720p, lần đo 2, ảnh `crowd-1`): một Yêu Rêu không có chữ đứng sau đám đông ở đầu cầu phía bắc, ngay chỗ thẻ "food" của quái phía trước nằm. `layoutTags` (`src/ui/tags.ts`) tìm chỗ che ≤ 20 % mỗi thân trong tầm đẩy ngang và 3 hàng. Không có chỗ nào như vậy thì nó lấy **chỗ trống đầu tiên**, hoặc giữ chỗ cũ, ở đây là chỗ lý tưởng ngay trên thân quái kia.

**r1: chỗ che ít nhất.** Khi không có chỗ sạch, thẻ lấy chỗ trống che ít nhất một thân (tỉ lệ lớn nhất trên một thân). Thẻ giữ chỗ cũ trừ khi chỗ mới che ít hơn ít nhất 10 điểm, để thẻ không giật. Ca 83 % biến mất, nhưng ở 1080p xuất hiện 3 mẫu 42–50 %. Ảnh seed 5, 1080p, lần đo 3: một Cung thủ bị thẻ "get" che phía trên và thẻ "music" che phía dưới, mỗi thẻ khoảng 20 %. Luật cũ xét từng thẻ một, còn người chơi thấy cả hai thẻ cùng lúc.

**r2: cộng phần thẻ trước đã che.** Thẻ không bao giờ chồng nhau, nên phần một thân bị che bằng tổng phần từng thẻ che. Khi xếp một thẻ, phần nó che một thân được cộng với phần các thẻ xếp trước đã che thân đó (`hidden[]`). "Sạch" nghĩa là tổng ≤ 20 %, đúng thứ `dh-crowd` đo. Kết quả: 0 mẫu ≥ 30 %, quái bị che nhiều nhất trung bình 14,8 % (r0: 23,5 %).

Đã xem ảnh `crowd-1` của seed 5, 720p ở r2: năm thẻ ở đầu cầu (story, take, music, food, name) xếp quanh đám đông, có vạch nối; các quái trên cầu thấy rõ.

**Lý do thiết kế.** Ở đầu cầu, quái đứng sát nhau, và thẻ của quái phía trước nằm đúng chỗ quái phía sau đứng (trên màn, "phía sau" là phía trên). Người chơi cần thấy cả đám đông để biết áp lực sắp tới, kể cả quái chưa có chữ (vượt ngân sách chữ). Xét từng thẻ một thì hai thẻ "đạt" vẫn che gần nửa một thân. Ở r2, luật giữ chỗ 0,5 s (05 §4.3) giữ nguyên: thẻ đang trong thời gian giữ thì không dời. r4–r5 thêm một ngoại lệ (mục 4b).

**Test mới** (`tests/ui/tags-bodies.test.ts`, 3 ca; cả 3 trượt trên mã trước khi sửa):

- không có chỗ sạch: lấy chỗ che ít nhất, không lấy chỗ đầu tiên (ca 83 % dựng lại ở 720p);
- giữ chỗ cũ khi chỗ khác chỉ đỡ hơn dưới 10 điểm;
- hai thẻ, mỗi thẻ một mình "sạch" (13,3 % và 18 %): tổng không vượt 20 %.

Ca "bức tường quái" cũ đổi điều kiện: thẻ đầu tiên che không nhiều hơn chỗ lý tưởng (trước: đúng chỗ lý tưởng).

## 4b. Thẻ đang giữ chỗ che quái mới tới: r3–r5 (26/10)

**Lỗi.** r3 là lượt kiểm lại r2 trên mã đã commit (`4e388dd`), thêm seed 1 và 7 (hai seed hỏng trên Dell): 9 / 10 lượt `ok`. Seed 1, 720p, lần đo 2: một Yêu Rêu không chữ ở cuối làn bắc bị thẻ "listen" che 50 % (ảnh `crowd-1`). Ba ảnh mỗi lượt chỉ bắt được cái che ngắn khi gặp may. Nên đo thêm **từng khung**: bản thử `probe-frames.mjs` (ngoài Git) tính độ che của mọi quái như `dh-crowd`, ở mỗi khung sau khung của game, từ đợt 3.

| Lượt thử (seed 1, 720p, `4e388dd`) | Khung | Khung có quái ≥ 40 % | Các chuỗi (khung) | Che lớn nhất |
|---|---|---|---|---|
| f0 | 3.279 | 48 | 1, 20, 8, 19 | 83 % |
| f1 (ghi nhánh xếp) | 3.287 | 57 | 28, 3, 8, 18 | 83 % |

Chuỗi dài nhất 28 khung là 0,47 s. Ảnh của lần đo 2 ở f0: một Yêu Rêu không chữ bị che 83 %.

**Nguyên nhân 1.** Ghi nhánh của `layoutTags` (sửa tạm `src/ui/tags.ts`, không commit): cả bốn chuỗi của f1 là thẻ **đang giữ chỗ** (0,5 s, 05 §4.3). Thẻ giữ chỗ cũ mà không xét thân quái, che 42–89 % diện tích một thân. Có hai kiểu:

- quái mới tới ở cuối làn bắc (y ≈ 70–80 px ở 720p) đi vào ngay dưới thẻ của quái phía trước;
- thẻ mới sinh, hoặc thẻ vừa thêm dòng nghĩa (to ra: "work" 79 × 25 → 140 × 41 px), giữ chỗ cũ dù chỗ đó giờ che một thân.

**r4 (`9395667`, `73b265c`).**

- Thẻ đang giữ chỗ chỉ giữ khi che ≤ 35 % một thân; quá thì dời một lần.
- Khi không có chỗ sạch, chỗ cũ cũng chỉ giữ khi che ≤ 35 %, trừ khi không chỗ nào che ít hơn.
- `dh-crowd` đo từng khung từ đợt 3 (`frames`). `ok` thêm điều kiện: không chuỗi nào có quái ≥ 40 % dài quá 6 khung (0,1 s).

Kết quả r4: 8 / 10 lượt `ok`. Hai lượt trượt ở 1080p: seed 6 (chuỗi 15 khung, 56 %), seed 1 (8 khung, 42 %).

**Nguyên nhân 2 và 3.** Ghi nhánh lại trên 5 lượt thử:

- thẻ giữ chỗ che 33–34 % diện tích một thân, lưới 6 × 6 của `dh-crowd` đọc 42 % (2–4 khung). Lưới lấy cả cột, cả hàng mẫu khi mép thẻ vừa qua tâm của nó;
- thẻ vào **vòng tìm chỗ cuối** (không còn chỗ trống trong tầm đẩy và 3 hàng) lấy chỗ trống gần nhất, nằm ngay trên thân quái **của chính nó**: 56–67 %, đến 11 khung (seed 6, 1080p, thẻ "make" và "love"). `layoutTags` không tính thân quái mang thẻ, vì thẻ đứng trên đầu nó. Vòng tìm cuối thì có thể đặt thẻ xuống dưới.

**r5 (`710f34a`).**

- Ngưỡng giữ chỗ 30 % (`bodyFirm`), chừa chỗ cho lưới 6 × 6.
- Vòng tìm cuối lấy chỗ trống gần nhất không chạm thân quái của chính thẻ và che ≤ 30 % các thân gần, trong hai lần tầm (240 px). Không có thì như cũ: chỗ trống gần nhất.

| Vòng | Mã | Lượt `ok` | Mẫu ảnh ≥ 40 % | Khung ≥ 40 % | Chuỗi dài nhất | Che lớn nhất trong khung |
|---|---|---|---|---|---|---|
| r3 | `4e388dd` (r2 đã commit) | 9 / 10 | 1 / 221 | chưa đo; thử ở seed 1, 720p: 48 và 57 / ~3.280 | 28 (f1) | 83 % |
| r4 | `9395667`, `73b265c` | 8 / 10 | 1 / 225 | 37 / 33.617 (0,11 %) | 15 | 56 % |
| r5 | `710f34a` | **10 / 10** | **0 / 224** | **0 / 33.592** | **0** | 39 % |

Mỗi vòng: seed 1, 4, 5, 6, 7 × 720p, 1080p = 10 lượt, 30 lần đo ảnh.

Kết quả r5:

- 10 / 10 lượt `ok`, cả 10 lượt đủ 3 / 3 lần đo (15 lần hồi máu).
- Trong khung: quái ≥ 30 % ở 364 / 33.592 khung (1,08 %; r4: 569, 1,69 %), không khung nào ≥ 40 %, lớn nhất 39 %.
- Ảnh: che TB trung bình 3,1 % (lớn nhất 8 %); quái bị che nhiều nhất mỗi lần đo TB 14,0 % (lớn nhất 25 %); 0 / 224 mẫu ≥ 30 %.
- Khung TB 16,67 ms, p95 16,7–16,8 ms (Apple M4, khóa 60 Hz): bộ đo từng khung không làm rớt khung.

Đã xem ảnh r5. Seed 1, 720p, `crowd-1`: năm thẻ quanh đám đông ở cuối làn bắc, ba quái trên cầu thấy rõ (thẻ "food" nhỏ hơn vì ảnh chụp lúc thẻ đang bật ra, `dh-tag-pop`). Seed 6, 1080p, `crowd-0`: Thiên Hỏa đang báo trước, sáu thẻ xếp hai bên cầu, hai dấu "!" của báo trước đỏ không bị che.

**Lý do thiết kế.** 05 §4.3 ghi "Thẻ giữ chỗ ≥ 0,5 s để không nhảy": luật có để người chơi đọc thẻ không bị giật. Nhưng một quái vừa tới bị che 40–89 % suốt 0,5 s thì người chơi không thấy nó. Thấy cả đám đông là mục đích của vòng 2. Báo trước đỏ cũng nằm trong danh sách thân, nên thẻ đang giữ chỗ cũng không che quá 30 % một đòn sắp tới. Dời thẻ một lần rẻ hơn. Thẻ chỉ dời khi che quá 30 % một thân, nên ở ca che vừa phải nó vẫn đứng yên. **Đã chọn theo đề xuất:** đây là ngoại lệ của luật giữ chỗ 05 §4.3. Anh đổi được ngưỡng bằng `bodyFirm` của `layoutTags` (0,8 thì gần như luật cũ).

**Test mới** (`tests/ui/tags-bodies.test.ts`, nay 13 ca):

| Ca | Trượt trên |
|---|---|
| thẻ giữ chỗ dời khi một quái tới dưới nó (76 %); `bodyFirm` 0,8 thì giữ; một phần ba thân (33,3 %) cũng dời | `4e388dd` (ý đầu), `9395667` (một phần ba) |
| thẻ giữ chỗ vừa to ra (dòng nghĩa) dời khỏi chỗ giờ che 80 % | `4e388dd` |
| không có chỗ sạch: không giữ chỗ cũ che 40 % khi có chỗ che 32,4 % (luật cũ giữ vì kém dưới 10 điểm) | `4e388dd` |
| vòng tìm cuối tránh thân quái của chính thẻ; không có chỗ sạch trong 240 px thì vẫn lấy chỗ trống gần nhất | `9395667` |

Ca "giữ chỗ trong thời gian giữ" cũ đổi số: thân bị che 25 % (dưới ngưỡng 30 %) thì thẻ giữ; trước là 76 %.

## 5. Đo trên trình duyệt, mã đã commit

Apple M4, Chrome 155 headless, Vite 3005. Mã cuối `710f34a`; cây sạch (`src`, `scripts`, `tests` không đổi so với commit). Mỗi kịch bản chạy qua `heavy.sh --gpu`; `dh-hitstop-keys` giữ cả 3 chỗ trình duyệt (chạy một mình).

**`dh-hitstop-keys`** (120 WPM trong 12 s, cơn đòn T4–T5; 2 lượt mỗi cỡ):

| Cỡ | Lượt | Phím gửi / mất | Khung dừng hình | Trễ phím TB / lớn nhất | Số trên vùng cấm | Số chạm nhau (mẫu sau mỗi từ) | Khung có số / có mực chạm | Khe nhỏ nhất trong khung | Khung TB / p95 |
|---|---|---|---|---|---|---|---|---|---|
| 1280×720 | a | 100 / 0 | 109 | 14,5 / 18,1 ms | 0 | 0 / 86 | 612 / 725, 0 | 10,6 px | 16,67 / 16,80 ms |
| 1280×720 | b | 100 / 0 | 110 | 14,8 / 18,7 ms | 0 | 0 / 86 | 620 / 726, 0 | 7,8 px | 16,67 / 16,70 ms |
| 1920×1080 | a | 96 / 0 | 110 | 14,8 / 17,9 ms | 0 | 0 / 82 | 717 / 725, 0 | 8,2 px | 16,67 / 16,70 ms |
| 1920×1080 | b | 96 / 0 | 110 | 14,7 / 18,3 ms | 0 | 0 / 82 | 712 / 725, 0 | 8,2 px | 16,67 / 16,70 ms |

Phát lại khớp ở cả 4 lượt. Trễ phím dưới ngưỡng 70 ms của kịch bản. Mẫu "giữa hai khung" (giữ lại để thấy lượt GPU đầu tiên đọc gì): 1280 b và 1920 b mỗi lượt có 1 mẫu mực chạm (−2,9 và −5,3 px). Ở đó quad là của khung trước, còn field đã chạy tiếp (đầu `dh-hitstop-keys.mjs`), nên đó không phải thứ được vẽ. Mọi khung vẽ đều 0.

**`dh-numbers-drawn`** (10 cơn × 12 đòn vào 17 quái; 30 khung mỗi bên):

| Cỡ | `ok` | Field của kit: khung chạm / cặp mực chồng / khe nhỏ nhất / mực ra ngoài hộp / số bỏ | Đối chứng hộp cũ: khung chạm / cặp chạm / cặp mực chồng / khe nhỏ nhất / mực ra ngoài hộp |
|---|---|---|---|
| 1280×720 | đạt | 0 / 30, 0, 6,2 px, 0 px, 92 | 28 / 30, 135, 177, −23,1 px, 23,1 px (nhãn) |
| 1920×1080 | đạt | 0 / 30, 0, 7,5 px, 0 px, 96 | 26 / 30, 83, 113, −34,6 px, 34,6 px (nhãn) |

**`dh-numbers`:** 1280 và 1920 đạt; số chạm nhau 0, số trên vùng cấm 0 (12 mẫu, 8 quái).

**`dh-crowd`** (r5, mục 4b): 10 / 10 lượt `ok`.

| Seed | Cỡ | Lần đo | Hồi máu | Che TB 3 lần đo | Quái bị che nhiều nhất, 3 lần đo | Khung ≥ 30 % / ≥ 40 % | Che lớn nhất trong khung |
|---|---|---|---|---|---|---|---|
| 5 | 720p | 3 | 1 | 0 / 2 / 4 % | 0 / 17 / 14 % | 21 / 0 | 33 % |
| 5 | 1080p | 3 | 2 | 1 / 3 / 4 % | 8 / 11 / 25 % | 58 / 0 | 39 % |
| 4 | 720p | 3 | 1 | 3 / 4 / 2 % | 25 / 17 / 11 % | 27 / 0 | 36 % |
| 4 | 1080p | 3 | 2 | 3 / 2 / 3 % | 17 / 11 / 22 % | 26 / 0 | 33 % |
| 6 | 720p | 3 | 1 | 1 / 1 / 6 % | 11 / 11 / 17 % | 62 / 0 | 33 % |
| 6 | 1080p | 3 | 2 | 8 / 0 / 6 % | 17 / 0 / 17 % | 39 / 0 | 33 % |
| 1 | 720p | 3 | 2 | 1 / 1 / 4 % | 6 / 8 / 22 % | 21 / 0 | 33 % |
| 1 | 1080p | 3 | 2 | 6 / 2 / 2 % | 17 / 8 / 8 % | 59 / 0 | 33 % |
| 7 | 720p | 3 | 1 | 6 / 2 / 6 % | 17 / 17 / 17 % | 36 / 0 | 33 % |
| 7 | 1080p | 3 | 1 | 7 / 2 / 2 % | 22 / 11 / 17 % | 15 / 0 | 33 % |

Khung TB 16,67 ms, p95 16,7–16,8 ms, 44–52 lệnh vẽ. Mỗi lượt khoảng 3.250 (720p) và 3.450 (1080p) khung trong đợt 3.

**Trước khi đổi thẻ.** Ba kịch bản số chạy trên `4e388dd` (lượt 4) và `73b265c` (lượt 5) cho cùng kết quả: 0 số trên vùng cấm, 0 khung mực chạm, `dh-numbers-drawn` và `dh-numbers` đạt. Trễ phím lớn nhất 23,3 ms (`73b265c`, 720p, lượt a).

**Ảnh đã xem.** `hitstop-storm-2` 720p (`4e388dd`, `73b265c`): số "67" ở mép trên còn nguyên nhãn "HOÀN HẢO". `hitstop-storm-3` 1080p: "575" và "1016" nguyên nhãn. `drawn-fixed-9` (720p) và ảnh cắt 1080p: chữ số nghiêng và nhãn không chạm nhau, không đè thẻ chữ.

## 6. Kiểm

| Kiểm | Kết quả |
|---|---|
| `pnpm kit:test` (repo cha) | `52bdc8df`: 284 / 284; `fc69a921`: 285; `df2f4882`: 286; `21e8eaf9`: 287 / 287, 36 file; `tsc` của kit 0 lỗi |
| `node scripts/sync-game-kit.mjs --target games/dragon-hold` sau mỗi commit kit | `parentCommit` `52bdc8df`, `fc69a921`, `df2f4882`, `21e8eaf9`; `parentDirty: false` cả bốn lần |
| `kit:check` | dragon-hold, typing-defense đạt; typing-survival, immortality-cultivation cũ (chờ người điều phối) |
| `pnpm check` trên `249102d` | kit 73 file khớp; vitest 375 / 375, 44 file; `tsc` + `vite build` xanh |
| `pnpm check` trên cây của `96f05dd`, `cc52ed9`, `4e388dd` | kit 73 file khớp; vitest 375 / 375, 44 file; `tsc` + `vite build` xanh (`4e388dd`: `index` 529,86 kB, gzip 189,00 kB; `three` 561,77 kB) |
| Golden (`tsx scripts/balance/golden.ts`), trên `5187d76`, `96f05dd`, `cc52ed9`, `4e388dd` | 4 ca giữ nguyên (`61222e57`, `8b16e8be`, `59192d7b`, `4d27a14a`); sim không đổi |
| `pnpm check` trên `4e388dd`, chạy lại sau khi việc bị ngắt (25/10, 23:48) | kit 73 file khớp; vitest 375 / 375, 44 file; build xanh |
| `pnpm check` trên cây của `9395667` + `73b265c` | kit 73 file khớp; vitest 378 / 378, 44 file; build xanh |
| `pnpm check` trên cây của `710f34a` | kit 73 file khớp; vitest 379 / 379, 44 file; `tsc` + `vite build` xanh |
| `pnpm kit:test` (repo cha `a55540b3`, chạy lại) | 287 / 287, 36 file |
| `kit:check` (chạy lại, 26/10) | dragon-hold, typing-defense đạt; typing-survival, immortality-cultivation cũ |
| Golden trên `710f34a` | 4 ca giữ nguyên (cùng 4 mã băm); sim không đổi |
| `git diff --check` | sạch ở mỗi commit (bỏ dòng trống thừa cuối `LANES.md`) |
| `pnpm dh:balance` | không chạy: bước này không đổi sim, golden giữ nguyên |

## 7. Còn mở

- **B1, B7 trượt** (cả hai dải), như `2026-10-25-m0a-round3-fix.md` §4. Bước này không đổi sim.
- **B9:** chờ anh chơi thử 10 đợt, thêm một lượt `?wpm=70`.
- **D27, phần luật cổng của D29:** chờ anh xác nhận.
- **Kit cho typing-survival:** người điều phối chạy `kit:sync`. Hộp số to hơn với cùng quad của `SHIP`: số đứng xa nhau hơn và gần vùng cấm bị bỏ nhiều hơn. Cần chạy lại kịch bản số của game đó.
- **Thẻ dời trong thời gian giữ:** chưa đếm số lần dời. Ngưỡng 30 % chỉ chạm khi một thân bị che quá 30 %, nhưng chưa có số đo độ giật. Đợt test chia theo màn (70 WPM, 1080p) nên đếm.
- **Ngoại lệ của luật giữ chỗ 05 §4.3:** đã chọn theo đề xuất (mục 4b). Nếu anh đồng ý, người điều phối ghi vào canon (05 §4.3, hoặc một mục D mới ở 00 §4.4).
- **`dh-crowd` chỉ đo đợt 3 ở `L2-cau`:** đám đông lớn hơn (đợt 7–10, tướng, boss) chưa đo từng khung.
- **Số bị bỏ trong cơn đòn:** `dh-numbers-drawn` bỏ khoảng 90 trên 120 đòn T4–T5 mỗi cơn (12 đòn dồn vào 12 quái, số T3 trở lên không gộp). Hộp này giống hệt hộp `DrawnNumberField` từ vòng 3, nên không phải lỗi mới. Đây là luật "không chỗ thì bỏ, không chồng".

## 8. File

- Repo cha `52bdc8df`, `fc69a921`, `df2f4882`, `21e8eaf9`: `shared/game-kit/feedback/{numbers.ts,numbers.test.ts,index.ts}`, `shared/game-kit/DRIFT.md`.
- `5187d76`: `src/kit/feedback/{index,numbers}.ts`, `src/kit/kit-manifest.json` (chép), `src/view/fx.ts`, `src/view/number-field.ts` (xóa), `tests/view/number-field.test.ts`, `scripts/visual/scenarios/{dh-numbers-drawn,dh-hitstop-keys,dh-numbers}.mjs`.
- `e117ce0`: `src/app/app.ts`.
- `62255d9`: `scripts/visual/scenarios/dh-crowd.mjs`.
- `249102d`: `src/ui/tags.ts`, `tests/ui/tags-bodies.test.ts`.
- `6f739ec`: `src/kit/feedback/numbers.ts`, `src/kit/kit-manifest.json` (chép kit `fc69a921`).
- `96f05dd`: `src/ui/tags.ts` (đổi tên một biến che tên hàm `share`, không đổi hành vi).
- `cc52ed9`, `4e388dd`: `src/kit/feedback/numbers.ts`, `src/kit/kit-manifest.json` (chép kit `df2f4882`, `21e8eaf9`).
- `9395667`: `src/ui/tags.ts`, `tests/ui/tags-bodies.test.ts` (thẻ giữ chỗ nhường ở 35 %).
- `73b265c`: `scripts/visual/scenarios/dh-crowd.mjs` (đo từng khung, `STREAK_MAX` 6).
- `710f34a`: `src/ui/tags.ts`, `tests/ui/tags-bodies.test.ts` (ngưỡng 30 %, vòng tìm cuối tránh thân của chính thẻ).
- Tài liệu: bài này, `LANES.md`, `AGENTS.md`.

## Bằng chứng

`tmp/mac-2026-10-25/` (không vào Git):

- `kit-drift/`: `probe-ink.mjs` và `.json` (số đo phông trên Chrome của Mac), `kit-test.txt`, `check-*.txt`, `golden-check.txt`, lượt thử trên trình duyệt trước commit (`*-trial-*.json`, ảnh ở `shots/`);
- `dh-crowd/`: `dh-crowd-base-s1-1920.json` (kịch bản cũ), `batch-{hold,lc,cu}.log` và JSON từng lượt (r0, r1, r2), `batch-{final,final17}.log` (r3), `batch-{r4,r5}.log` và `batch-frames.sh` (r4, r5), `summary.mjs`, `summary2.mjs`, ảnh ở `shots/`;
- `dh-crowd-probe/`: `probe-crowd.mjs`, `probe-frames.mjs` (đo từng khung, bản thử), JSON của f0, f1, r4, t4–t6 (t4–t6 có nhánh xếp, từ bản `tags.ts` sửa tạm, không commit);
- `final/`: `batch{4,5,6}.log` và JSON của mục 5 (`4e388dd`, `73b265c`, `710f34a`), `check-final5.txt`, `check-r4.txt`, `check-r5.txt`, `kit-test-final.txt`, `golden-r5.txt`.
