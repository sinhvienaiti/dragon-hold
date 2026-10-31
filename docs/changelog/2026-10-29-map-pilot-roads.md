# Đường của map L2-cau theo PATH_QUALITY (29/10/2026)

Worktree `games/.wt-dh-mappilot`, nhánh `map-pilot`, làn R2. Chưa gộp, chưa đẩy.

**Vì sao:** chủ dự án sáng 29/10 chê đường như "lấy ngón tay quệt dài". Luật nằm ở `docs/games/PATH_QUALITY.md` (repo cha).

**Phạm vi:** chỉ phần nhìn. Sim, làn, chỗ đặt, golden không đổi (`git diff 72b2a32 -- src/sim src/content src/typing tests/golden` rỗng).

## 1. Hệ đường

- `src/view/road-profile.ts` (thuần, dùng chung cho ribbon và đồ ven đường). Lõi đường rộng bằng nửa làn × 1,12; không bao giờ hẹp hơn 0,95 nửa làn, nên luôn phủ dải quái đi. Bề rộng đổi theo:
  - nhiễu có hạt, ±15 % dọc đường, sóng 10 m;
  - khúc cua: + độ cong × 2,4, tối đa +20 %;
  - ngã ba ở bệ (trong 12 m): +18 %;
  - đầu cầu (trong 6 m): +20 %.
  Vai đường rộng 1,2 m ± 30 %, mỗi bên một nhiễu riêng.
- `src/view/roads.ts`: mỗi làn và đường mòn sau cổng thành một ribbon mesh dọc tâm đường, ngắt ở nhịp cầu, dừng ở mép bệ. Tất cả làn chung **một draw call**, khoảng 2.300 tam giác.
  - **UV dọc đường:** v là chiều dài cung của từng cột (mép trong và mép ngoài mỗi bên tự đo), nên mật độ texel giữ nguyên ở khúc cua.
  - **Mặt cắt ba lớp:** lõi đất nện, vai mòn, rồi cỏ. Dải chuyển lõi sang vai rộng 0,3–0,8 m, mép lệch ±0,25 m theo nhiễu. Dải vai sang cỏ cũng 0,3–0,8 m, hòa vào màu đất đã nướng ngay dưới (không có mép cắt).
  - **Lún:** lõi ở +3 cm trên mặt đất, đỉnh vai +8 cm, tức lõi thấp hơn vai 5 cm. Mép vai đổ bóng mờ lên mép lõi.
  - Hai vệt bánh xe lấy từ ảnh vai, mờ. Cỏ thưa lấn ra nửa ngoài của vai.
- **Ảnh lấy theo tên:** ba ô `core`, `verge`, `edges` hỏi manifest các khóa của phiếu Codex 155: `ground:road/road-flagstone`, `ground:road/road-verge`, `decals:road/road-edges`.
  - Khi các khóa đó chưa có trong `ground-pick.json` (chưa được nhận), lõi dùng ô `pine-river/path`, vai dùng `pine-river/earth`, và không có decal mép.
  - Muốn đổi sang ảnh 155 chỉ cần thêm ba dòng vào danh sách chọn rồi chạy `prepare-ground`, `prepare-decals`. Không đụng mã.
  - Chưa dùng ảnh Codex nào.
- **Sơn đất:** dải đất của làn trong `paint.ts` thu hẹp lại, chỉ nằm dưới lõi. Lớp sơn không vẽ vệt quệt ra ngoài ribbon nữa.
- **Đồ ven đường** (`layout.ts`, `roadDress`, có hạt): mỗi bên, cứ 2–6 m một món đặt trên đỉnh vai.
  - Khoảng 62 % là viên đá bờ (Cliff Rock (wide), k 1,0–1,6, lún 40 %), còn lại là búi cỏ (Grass Tuft).
  - Ở khúc cua (độ cong > 0,09), ngã ba (trong 11 m) và đầu cầu (trong 3 m): đá bờ lớn (Cliff Rock, k 0,9–1,35).
  - Đèn và rào của A3 vẫn đứng dọc làn và ở đầu cầu như trước.
  - Đồ ven đường dùng instancing chung với bộ kit3.

## 2. Model ven đường dưới 2.000 tam giác (MODEL_QUALITY)

Chỉ có bản kit3 đã cắt mặt. Theo luật "model cũ giữ nguyên", tôi dùng ở đúng thiết lập hiện có, không xử lý lại:

| Món | Tam giác (High) | Bản gốc Tripo | Dùng ở |
|---|---:|---:|---|
| Cliff Rock (wide) `pine-river-cliff-rock-b` | 800 | 4.878 | đá bờ |
| Cliff Rock `pine-river-cliff-rock-a` | 800 | 4.866 | đá bờ lớn ở khúc cua, ngã ba, đầu cầu |
| Grass Tuft `pine-river-grass-tuft` | 300 | 2.854 | búi cỏ mép đường |
| Lantern Post `pine-river-lantern-post` | 599 | 2.862 | đèn dọc làn (có từ A3) |
| Rail Fence `pine-river-rail-fence` | 600 | 2.874 | rào ở khúc cua, đầu cầu (có từ A3) |

Ở camera chơi (95 m) không món nào ở "gần". Camera màn tựa thì đi qua chúng ở khoảng 40–100 m. Muốn đúng luật 2.000 thì phải xử lý lại từ bản gốc Tripo (đều trên 2.800 tam giác). Đây là quyết định của chủ dự án; làn này không làm.

## 3. Kiểm

- **`pnpm check`:** đạt, 56/56 file, 485/485 test, build đạt. Sim và golden không đổi.
- **Số đo PATH_QUALITY §5:**
  - Luma lõi trừ cỏ, đo trên khung mặc định 1920: đường Cầu 0,75 − 0,35 = **0,41**; đường Suối 0,63 − 0,38 = **0,25**. Ngưỡng ≥ 0,15: đạt.
  - Dải chuyển 0,3–0,8 m và bề rộng ±15 % (cộng phần nở ở khúc cua, ngã ba, đầu cầu): đúng theo cách dựng.
  - Texel: mỗi cột tự đo chiều dài cung, nên lệch gần 0 % (ngưỡng ≤ 20 %).
- **Độ tương phản quái** (`dh-foe-contrast`, cùng cách đo vòng trước, so với bản trước khi có đường):

| Cỡ | ΔL trung vị (tất cả) | Quái yếu (tất cả) | Moss Grunt ΔL / yếu | Thorn Ant ΔL / yếu |
|---|---|---|---|---|
| 1280 trước | 0,166 | 8,8 % | 0,141 / 4,8 % | 0,200 / 11,1 % |
| **1280 có đường** | **0,167** | **1,8 %** | 0,117 / 4,8 % | 0,213 / 0 % |
| 1920 trước | 0,095 | 25,9 % | 0,093 / 16,7 % | 0,103 / 30,6 % |
| **1920 có đường** | **0,097** | **14,6 %** | 0,124 / 11,1 % | 0,086 / 16,7 % |

  Tổng thể không tệ hơn: ΔL ngang, số quái yếu giảm ở cả hai cỡ. Riêng ΔL của Moss Grunt ở 1280 tụt 0,141 → 0,117, nhưng số con yếu giữ nguyên 4,8 %.
- **`dh-crowd`** (seed 5): **1280 `ok`**, **1920 `ok`**, 0 exception, 0 bật lại.

| Cỡ | Quái xa: khung che ≥ 40 % / che lớn nhất | Quái trong 10 m: che lớn nhất | Cảnh báo đỏ: che lớn nhất |
|---|---|---:|---:|
| 1280 | 0 / 36 % | 21 % | 28 % |
| 1920 | 0 / 33 % | 25 % | 29 % |

- **Hiệu năng:** đường thêm 1 draw call (trang xem đất 50 → 51) và khoảng 2.300 tam giác; đồ ven đường đi chung instancing có sẵn. **Chưa đo lại `dh-bench`** (hàng `--perf` đang bận); lần đo trước đường là +0,24 ms so với main.

## 4. Ảnh (dev qua Vite cổng 4145, cùng media với bản build)

Trong `tmp/map-pilot-r2/`:
- Tờ ghép (khung mặc định, 4 hướng ở 55°, ảnh mẫu): `sheets/road-1920x1080-contact-sheet.jpg`, `sheets/road-1280x720-contact-sheet.jpg`.
- Từng khung đặt cạnh ảnh mẫu: `compare-road/<cỡ>-<khung>-vs-ref.jpg`.
- Khung cắt sát (từ khung mặc định 1920, phóng 2 lần), cạnh ảnh mẫu: `compare-road/crop-bend-vs-ref.jpg`, `crop-junction-vs-ref.jpg`, `crop-bridge-end-vs-ref.jpg`.

## 5. Tự chấm (không phải cổng)

- **M riêng cho đường: 5,5.** Đã có lõi, vai, mép, bề rộng đổi và lún.
- Nhưng ở camera chơi và ở khung cắt khúc cua, lõi vẫn là một dải đất nện tan mềm. Ô `pine-river/path` nhìn gần như trơn ở cỡ này. Vai đọc ra hai vệt nâu tối, và đồ ven đường còn thưa, nhỏ.
- **"Đường có trông như vệt quệt không?" Trả lời thật: còn một phần, có.** Đường không còn là một dải màu đều có mép mờ đều: có mép, vai, lún và đá bờ. Nhưng lõi chưa có chất liệu xếp theo hướng đi (đá lát) nên vẫn đọc ra đất trơn được quệt.
- Phần lối mòn chính (ra cầu tàu, ra chân vách) **vẫn là sơn**, chưa có ribbon. Đó là vệt quệt rõ nhất còn lại trong khung mặc định.
- Muốn tới M ≥ 8 cần:
  1. ảnh đá lát của phiếu 155;
  2. đưa lối mòn chính vào cùng hệ ribbon;
  3. đồ ven đường dày hơn và to hơn, với model đủ mặt.

## 6. Còn mở

- **Lối mòn chính vào hệ đường.** Dùng `roads.ts` với lõi hẹp hơn, không vệt bánh xe. Dữ liệu đã có: `layout.footpaths`, đường gấp và nửa bề rộng theo từng mẫu.
- **Phiếu 155:** khi điều phối nhận ảnh, thêm `road/road-flagstone`, `road/road-verge` vào `ground` và `road/road-edges` vào `decals` trong `src/view/ground-pick.json`, rồi chạy `pnpm prepare-ground && pnpm prepare-decals` và `media:push`. Không cần sửa mã.
- **Đo lại `dh-bench`** khi hàng `--perf` rảnh.
- **Model ven đường dưới 2.000 tam giác** (bảng ở mục 2): chờ chủ dự án quyết có xử lý lại từ bản gốc Tripo không.
- Ảnh tham chiếu là sa mạc, nhìn ngang; đường của ta nhìn từ trên xuống 55°. Tờ so chỉ để chấm mức hoàn thiện, không so bố cục.

---

# Vòng 2 của đường (điều phối 29/10)

## 7. Đã làm

- **Mọi lối mòn vào hệ đường.** Lối chính ra cầu tàu (`fp-jetty`), lối chính ra chân vách (`fp-scree`) và lối nhánh ra chỗ nghỉ (`fp-camp`) giờ đều là ribbon, cùng bộ dựng với làn.
  - `roads.ts` có hàm `addRoad` dùng chung cho làn và lối mòn.
  - Bề rộng lấy từ nửa bề rộng của từng mẫu lối mòn (`Footpath.halves`).
  - Vai: lối chính 0,65 lần vai làn, lối nhánh 0,45.
  - Đầu lối thu nhỏ dần trong 2,5 m ở chỗ đến.
  - Lớp sơn của lối mòn (`mainA`, `pathA` trong `paint.ts`) thu lại nằm dưới lõi.
  - Không còn lối nào chỉ là sơn.
- **Đầu đường ở bệ** mờ dần trong 1,8 m vào vòng đất của sân bệ, không còn vết cắt thẳng.
- **Đồ ven đường dày, to, gom cụm** (`layout.ts` `dressRoad`, dùng cho cả làn và lối mòn):
  - mỗi bên cứ 2–4,5 m một cụm 1–3 món, lệch dọc trong 1,4 m và lệch ra ngoài trong 0,7 m;
  - mỗi món xoay ngẫu nhiên, đá nghiêng nhẹ;
  - đá bờ k 0,8–1,8 (lệch về cỡ nhỏ), búi cỏ k 0,8–1,4;
  - ở khúc cua, ngã ba và đầu cầu: một cụm 3 món với một Cliff Rock lớn (k 1,3–2,0);
  - đá giữ 0,6 m với dải quái đi, như luật rải cây.
  - Búi cỏ (xanh rêu như Moss Grunt) giữ 1,7 m với dải quái đi, để không nằm trong vòng nền quanh quái.
  - Tổng: 56 món (31 Cliff Rock (wide), 10 Cliff Rock, 15 Grass Tuft). Nhiều chỗ bị loại vì đứng trong ô đặt, gần nước, hay dưới làn trời.
- **Model ven đường để làn M-dh làm bậc mới** (gọi theo id manifest, không xử lý lại):
  - `props/pine-river-cliff-rock-a`, `props/pine-river-cliff-rock-b`, `props/pine-river-grass-tuft`;
  - cùng `props/pine-river-lantern-post`, `props/pine-river-rail-fence` đã đứng dọc làn và ở đầu cầu.
- **Khung khựng khoảng 300 ms:** thêm `MapStage.warm()`. Nó vẽ một khung thật với frustum culling tắt, nên mọi program và pipeline GPU (cả pha bóng) được tạo trước khi chơi; Metal chỉ tạo pipeline ở lần vẽ đầu.
  - Gọi sau khi nướng đất xong, sau khi thay prop thật, và trong `bench.ts` trước khi bắt đầu đo.
  - Bộ impostor góc thấp không có trong lần đo bench (bench không bật màn tựa), nên khung khựng của bench không phải từ đó.

## 8. Kiểm vòng 2

- **`pnpm check`:** đạt, 56/56 file, 485/485 test, build đạt. Sim và golden không đổi.
- **`dh-bench`** (High, 1080p, không khóa nhịp, `--perf`, chạy xen kẽ hai cặp; main `4f61c6e` ở cổng 4146, chỉ đọc, đã tắt):

| Lượt | Trung bình | p95 | Khung chậm nhất | Draw call | Tam giác |
|---|---:|---:|---:|---:|---:|
| Map-pilot 1 | 5,70 ms | 8,4 ms | 12,8 ms | 79 | 2,44 M |
| Main 1 | 5,44 ms | 8,3 ms | 12,9 ms | 80 | 2,45 M |
| Map-pilot 2 | 5,80 ms | 8,5 ms | 13,2 ms | 79 | 2,44 M |
| Main 2 | 5,46 ms | 8,6 ms | 16,2 ms | 80 | 2,45 M |

  - Chênh so với main: trung bình **+0,30 ms**, p95 **±0**. Cổng +2 ms: **đạt**.
  - **Khung khựng khoảng 300 ms không còn**: chậm nhất 12,8 và 13,2 ms ở cả hai lượt map-pilot. Sửa bằng khung làm nóng `warm()`. Chưa tách được thủ phạm cụ thể; nhiều khả năng là pipeline Metal tạo ở lần vẽ đầu của một vật lúc trước bị frustum cull, giống điều làn VFX tìm thấy.
- **Độ tương phản quái** (`dh-foe-contrast`):

| Cỡ | Trước đường | Đường vòng 1 | **Đường vòng 2** |
|---|---|---|---|
| 1280, ΔL trung vị / quái yếu | 0,166 / 8,8 % | 0,167 / 1,8 % | **0,178 / 5,2 %** |
| 1280, Moss Grunt ΔL / yếu | 0,141 / 4,8 % | 0,117 / 4,8 % | 0,108 / 4,5 % |
| 1920, ΔL trung vị / quái yếu | 0,095 / 25,9 % | 0,097 / 14,6 % | **0,109 / 14,5 %** (đo trước khi dời búi cỏ) |

  - Lượt đo vòng 2 đầu tiên ở 1280 ra quái yếu 10,5 %: búi cỏ xanh nằm trong vòng nền quanh quái. Đã dời búi cỏ ra 1,7 m; đo lại còn 5,2 %, tốt hơn lúc trước khi có đường.
  - ΔL trung vị của riêng Moss Grunt thấp hơn trước, nhưng số Moss Grunt yếu không tăng.
- **`dh-crowd`** (seed 5, đo trước khi dời búi cỏ): **1280 `ok`** (quái xa che lớn nhất 35 %, gần 21 %, cảnh báo 29 %); **1920 `ok`** (34 / 25 / 29 %); 0 bật lại, 0 exception.

## 9. Ảnh vòng 2 (dev cổng 4145, cùng media với bản build)

Trong `tmp/map-pilot-r2/`:
- Tờ ghép: `sheets/road2-1920x1080-contact-sheet.jpg`, `sheets/road2-1280x720-contact-sheet.jpg`.
- Từng khung cạnh ảnh mẫu: `compare-road2/<cỡ>-<khung>-vs-ref.jpg`.
- Khung cắt sát, cạnh ảnh mẫu: `compare-road2/crop-{bend,junction,bridge-end,footpath}-vs-ref.jpg`.

## 10. Tự chấm vòng 2 (không phải cổng)

- **M riêng cho đường: 6,0** (vòng 1: 5,5).
  - Mọi lối giờ là đường có mép, vai, lún, có đá bờ và búi cỏ gom cụm.
  - Đầu đường hòa vào sân bệ.
  - Bề rộng đổi đọc được ở khúc cua và đầu cầu.
- **"Đường có trông như vệt quệt không?" Trả lời thật: ít hơn, nhưng vẫn còn một chút.** Không còn lối nào là dải sơn trơn. Nhưng lõi vẫn là ô đất `pine-river/path` mềm, không có chất liệu xếp theo hướng đi; ở camera chơi nó vẫn đọc ra đất nện mịn. Đá bờ còn nhỏ ở 95 m.
- Muốn tới M ≥ 8 vẫn cần:
  1. ảnh đá lát của phiếu 155 (đổi bằng danh sách chọn, không sửa mã);
  2. model ven đường bậc mới của làn M-dh.

## 11. Còn mở

- Đổi sang ảnh phiếu 155 khi điều phối nhận ảnh.
- Khi `dh-models` gộp, xem lại cỡ đá bờ (k) với model mới.
- Đo lại `dh-foe-contrast` 1920 và `dh-crowd` sau khi dời búi cỏ. Đổi này chỉ bớt vật gần làn, nên dự kiến không xấu đi.
