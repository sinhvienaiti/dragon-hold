# Bản thử bản đồ L2-cau, chặng A (CL-04, CL-05, phần nướng của CL-06)

Ngày 28/10/2026 · Worktree `games/.wt-dh-mappilot`, nhánh `map-pilot` từ `main` 02fe9c7. Kế hoạch: `docs/tools/map-factory/MAP_PLAN.md` §2.4, §2.5, §2.9, §3 (repo cha); phiếu CL-04 đến CL-06 trong `docs/tools/map-factory/TICKETS.md`. Chưa gộp, chưa đẩy.

**Phạm vi:** chỉ phần nhìn (`src/view/**`) và hai kịch bản `scripts/visual/scenarios/dh-map-*.mjs`. Sim, nội dung, `tests/golden/m0.json`, `tests/content/map.test.ts` không đổi (`git diff 02fe9c7 -- src/sim src/content src/typing tests` rỗng), nên `simHash` giữ nguyên.

## Tóm tắt

- **A1 (CL-04):** bốn commit spike (7f54c21, 51934ba, 8328850, 8557e1b) chép vào `map-pilot`. Hằng số tay của spike (đường vách, 5 lối mòn, ao, 10 lùm, mặt trời) dời vào `src/view/maps/L2-cau.map.json` (cảnh ghim) và `src/view/maps/scene.ts` (bộ đọc). Ở commit b478d2c, khung mặc định 1080p ngang bằng spike `final2` trên mọi dòng số đo ảnh (sai ≤ 0,01). Kịch bản đổi tên: `dh-map-shots`, `dh-map-bench`.
- **A2 (CL-05):** bố cục §3.2 ghim tay và các sửa rẻ: mặt trời Đông, vách Tây, đồng cỏ Đông và Đông Nam, ao ở mép xa, lối mòn có đích, vịnh rừng, cây tán ấm nhuộm, đồng cỏ yên, đĩa đất có thùy, sỏi xám, viền bệ.
- **A3, phần nướng (CL-06):** sơn đất (mặt nạ, ô đất, decal) nướng vào một render target 2048² lúc nạp; shader đất chỉ còn đọc một texture trong hình vuông sơn.
- **Số đo ảnh tạm** (thay cho MF-C03/C04, chưa có): khung mặc định 1080p đạt 10/11 dòng Q5, 720p đạt 9/11; còn trượt độ rối (0,053 so với ≤ 0,050) và cỏ sáng ở 720p (34,6 so với ≥ 35 %).
- **Hiệu năng** (High 1080p, 220 quái có xương): chênh so với đất trống −0,13 ms trung bình, 0,0 ms p95 (cổng ≤ 2,0 / ≤ 3,0 ms); +28 draw call (≤ +30); nạp phần rải + nướng 192–219 ms (≤ 300 ms).
- `pnpm check` đạt (453/453 test, build đạt). `dh-crowd` đạt ở 1080p và 720p.
- **Chưa tự chấm làm cổng.** Giám khảo độc lập chấm sau.

## A1: đưa spike vào game

- Chép 4 commit của nhánh `map-spike` (f491432..f7f1576 trên spike, thành 7f54c21..8557e1b ở đây). Không xung đột với code view mới của `main` (model M0b, tên tiếng Anh).
- `L2-cau.map.json` (MapSpec v1 nháp): `gameplay` (adapter `dragon-hold@1`, commit gốc; `simHash`, `viewHash` chờ bộ đọc `dragon-hold@2`), `brief`, `lighting`, `scene` với `cliffs`, `ponds`, `open`, `footpaths`, `groves`, `bays`, mỗi vật `site: "pinned"`. Sim không import file này.
- Ngang bằng spike `final2` (khung mặc định 1080p, số đo tạm): luma 0,422 / 0,422; cỏ sáng 20,6 / 20,6 %; rất tối 10,2 / 10,3 %; xanh két tối 13,3 / 13,4 %; độ rối 0,0585 / 0,0585.
- Ô đất và decal vẫn nạp từ `/art-src` **chỉ ở dev** (`import.meta.env.DEV`). Bản build không gọi `/art-src` và chỉ hiện bảng màu, chưa có nét ô đất. Việc này chờ MF-C24 (`prepare-ground`, `prepare-decals`, phiếu 080); không viết file của phiếu đó.

## A2: sửa rẻ và bố cục §3.2

| Mục | Làm gì |
|---|---|
| Ánh sáng (2.5) | Mặt trời phương vị 95°, cao 50° (bóng đổ sang trái màn hình). Đèn bán cầu: trời #d6e4ff, đất #6d7a5a (thay tím), cường độ 2,7. Đèn phụ lạnh từ phía đối diện. Bóng lam nhẹ thay tím trong hậu kỳ. Sương bắt đầu ở 52 m |
| Vách (LG4, V10) | Hai vách 3 tầng ghim tay: Tây ở r 37,5–39,5 m, phương vị 267–325° (pháp tuyến · nắng 0,41–0,64), đóng khung mép trái khung mặc định; Tây Nam ở 212–233°. Khe vực 240–260° để trống cho Đường Suối và suối. Mặt tầng và đỉnh vách sơn đá xám nhạt có kẽ nứt, vài túi cỏ. Đá lớn cắm vào mặt tầng ở tầng ngẫu nhiên, nghiêng, lún sâu, sơn đá (bỏ hàng phiến xếp như bia mộ của vòng trước); bãi đá vụn ở chân |
| Bãi trống (V1) | Cung 95–200°, r 9–28 m: không lùm, tối đa 3 cây lẻ |
| Ao (V11) | Ghim ở (19; 7), r 20,2 m, phương vị 110°, mép xa của đồng cỏ. Nước hue khoảng 210, giữa sâu hơn |
| Sông | Chảy ngược thứ tự điểm trong phần nhìn (từ khe vực Tây Nam ra Đông Bắc); `widthsM` không đổi. Màu lam sáng hơn một bậc |
| Lối mòn (LG5, V8) | Lối chính 1,5 m phủ khoảng 95 %: sân bệ → bến ao; sân bệ → bãi đá chân vách Tây Nam. Lối nhánh 0,9 m có dải cỏ giữa: ao → vịnh rừng Đông Nam (chỗ Campfire Ring sau này). **Bỏ lối ra chỗ câu cá ở đầu cầu bờ Bắc:** ô bẫy của Đường Cầu nằm trong 4 m quanh đầu cầu, lối mòn không được dừng ở ô (spike §6.3) |
| Lùm (V4) | 4 lùm ghim, mỗi lùm một loài chủ ≥ 70 %; lùm neo ở nêm Tây Bắc bên kia sông (tán tròn); lùm chân vách; lùm Tây Nam; túi Đông Bắc. Tối đa 2 cây tím mỗi lùm |
| Rừng mép (V6) | 9 vịnh và mũi theo phương vị (vịnh sâu 6–9 m, mỗi vịnh một cây), nhiễu mép ±3,5 m, khe ở mọi cổng. Mép rừng nhiều tán tròn hơn (50 % trong 7 m đầu), thông sáng hơn (V13) |
| Nhịp mật độ (V5) | 9 cây lẻ trên đĩa đất; 17 bụi nhỏ xanh đậm rải trên đồng cỏ, mỗi bụi trên một quầng cỏ nhạt (như ảnh mẫu), cách làn ≥ 2,6 m, ô ≥ 3,8 m, làn trời ≥ 2,2 m |
| Cây tán ấm (V7) | Nhuộm cây tán tròn có sẵn: đỏ phong đến cam theo chỗ (albedo S, V ≤ 0,7), cách làn, ô, làn trời ≥ 9 m, cách nhau ≥ 12 m, cách cây tím ≥ 7 m, ở mặt ngoài lùm, cây lẻ gần ngã ba, vịnh rừng, mép rừng. Bật/tắt A/B: `?warm=0` |
| Đồng cỏ (V2) | Bỏ dải stroke phân bậc: một mảng nhiễu mềm khoảng 26 m, trọng số stroke 0,08; ô cỏ chỉ còn nửa tương phản. Màu nền tối và xanh hơn một bậc (trung vị luma cỏ sáng 0,65, ảnh mẫu 0,64). Lốm đốm cụm cỏ nhỏ nướng vào sơn đất |
| Mép đất (V3) | Đĩa đất có 3–5 thùy, nhiễu bán kính ≤ 25 %, kéo giãn, lệch về phía khuất nắng; viền tối mảnh, quầng cỏ nhạt khoảng 1 m. Bỏ quả thông đỏ của decal (đọc như máu) |
| Đá (V13) | Đá thành cụm 2–4 viên xám; mọi model đá dùng chung một sơn đá xám nhạt (bỏ rêu, bỏ "trứng" rêu, không chuỗi trắng) |
| Bệ (V12) | Viền đá sẫm ở chân bệ |
| Tán cây | Màu lá lấy mẫu mềm hơn một bậc mip (bias 1,8): mảng lá như ảnh mẫu, bớt nhiễu điểm ảnh |

## A3: nướng sơn đất

- Khi ô đất và decal đã nạp, `bake` vẽ toàn bộ sơn của hình vuông ±52 m vào render target 2048² (khoảng 5 cm một texel, có mipmap). Mặt đá dốc của vách vẫn sơn trực tiếp (ảnh nướng từ trên xuống sẽ kéo giãn trên mặt dốc). Ngoài hình vuông vẫn là sơn trực tiếp. `?bake=0` tắt nướng để so.
- Shader nướng biên dịch bất đồng bộ (`compileAsync`) trước khi chặn luồng chính.
- `dh-map-bench` chờ nướng xong mới đo, và ghi thời gian nạp vào báo cáo.

## Số đo ảnh (tạm)

MF-C03/C04 (đo ảnh, phiếu 073/074) chưa xong. Dùng một script tạm cùng định nghĩa của MAP_PLAN §2.4 (thu về 384×216), không commit: `tmp/map-pilot/tools/look.mjs`. Hiệu chuẩn: nửa trên ảnh mẫu cho 0,521 / 41,4 % / 0,639 / 4,7 % / 3,3 % / 0,0447 / 0,127, khớp bảng §2.4.

Ngưỡng Q5 (pine-river). Ảnh ở mã 0cd0648 (3dbe7d9 chỉ đổi bậc Low).

| Dòng | Ngưỡng | Ảnh mẫu | M0b | Spike `final2` | Bản thử 1080p | Bản thử 720p |
|---|---|---|---|---|---|---|
| Luma trung bình | ≥ 0,48 | 0,521 | 0,395 | 0,422 | **0,506** | **0,504** |
| Cỏ sáng | ≥ 35 % | 41,4 | 26,1 | 20,6 | **35,2** | 34,6 (trượt 0,4) |
| Trung vị luma cỏ sáng | ≥ 0,60 | 0,639 | 0,545 | 0,544 | **0,654** | **0,654** |
| Hue cỏ sáng | 86–96° | 91 | 84,5 | 84 | **89** | **88,9** |
| Đồng sáng (luma > 0,5) | ≥ 30 % | 39,8 | 21,8 | 16,1 | **31,9** | **31,2** |
| Rất tối (V < 0,22) | ≤ 6 % | 4,7 | 9,9 | 10,3 | **5,8** | **5,7** |
| Xanh két tối | ≤ 6 % | 3,3 | 18,8 | 13,4 | **3,5** | **3,6** |
| Tím | ≤ 1 % | 0,03 | 2,48 | 1,69 | **0,53** | **0,53** |
| Điểm ấm (có cây nhuộm) | 0,5–2 % | 1,0 | 0 | 0,05 | **0,69** | **0,73** |
| Độ rối | ≤ 0,050 | 0,0447 | 0,0406 | 0,0585 | 0,0529 (trượt) | 0,0507 (trượt) |
| Tương phản mảng lớn | ≥ 0,12 | 0,127 | 0,124 | 0,111 | **0,134** | **0,136** |

- 1080p đạt 10/11 dòng, 720p đạt 9/11. M0b và spike trượt 7–8 dòng mỗi bản, đúng yêu cầu hiệu chuẩn (≥ 3 dòng).
- **Độ rối còn trượt:** bản đồ nhiệt cho thấy gần hết đến từ tán cây (model, mặt phẳng tán và bóng), không từ sơn đất. Đã hạ từ 0,0585 xuống 0,053 (lấy mẫu màu lá mềm hơn một bậc mip, sơn đá chung). Muốn ≤ 0,050 cần kit (tán to, mảng lá lớn) hoặc bớt rừng trong khung.
- Cây nhuộm A/B (`?warm=0`): bỏ cây ấm thì điểm ấm 0 %, các dòng khác gần như không đổi (cỏ sáng 36,1 %, độ rối 0,0537).

## Hiệu năng

**Cách đo:** `dh-map-bench` (đổi tên từ `dh-mapspike-bench`), 220 quái có xương, đủ hiệu ứng, High, 1920 × 1080, Chrome không khóa nhịp, qua `heavy.sh --perf`. "Đất trống" như spike: cùng sân khấu với `decor=0&paint=m0b`. Mã ở 0cd0648. Máy M4 dùng chung với các làn khác (bộ nhớ trống thấp lúc đo), số dao động khoảng ±0,3 ms.

| Lượt | Trung bình | p95 | Draw call | Tam giác mọi lượt | Tam giác prop |
|---|---|---|---|---|---|
| Bản đồ, cặp c | 5,41 (4,31 nếu bỏ một khung khựng 1,54 s) | 5,6 | 68 | 2,41 M | 379 k |
| Đất trống, cặp c | 4,55 | 5,6 | 39 | 1,81 M | 0 |
| Bản đồ, cặp d | 4,41 | 5,7 | 67 | 2,41 M | 379 k |
| Đất trống, cặp d | 4,54 | 5,7 | 39 | 1,81 M | 0 |
| Đất nướng, không prop (`decor=0`) | 4,64 | 8,3 (lượt nhiễu) | 40 | 1,81 M | 0 |
| Bản đồ, sơn trực tiếp (`bake=0`) | 18,37 | 24,1 | 69 | 2,41 M | 379 k |

- **Chênh so với đất trống:** trung bình −0,13 ms (cặp d), −0,24 ms (cặp c bỏ khung khựng; tính cả khung khựng +0,86 ms); p95 0,0 ms ở cả hai cặp. Cổng ≤ 2,0 ms trung bình, ≤ 3,0 ms p95: **đạt**. Khung khựng 1,54 s chỉ có ở một lượt trong bốn lượt bản đồ của phiên này (các lượt khác tối đa 9,6–10,8 ms), nên coi là nhiễu của máy chung; cần đo lại trên máy rảnh trước cổng C.
- Sơn đất nướng rẻ hơn sơn thủ tục của M0b, nên bản đồ đầy đủ ngang hoặc nhanh hơn "đất trống" (spike: +2,62 ms).
- Draw call +28 / +29 (cổng ≤ +30: đạt; trước khi gộp sơn đá và gộp dải gần/giữa của đồ vụn là +36). Tam giác +0,60 M (≤ +0,8 M: đạt). Tam giác prop 379 k (≤ 550 k: đạt). Tổng 4,4 ms ≤ 8 ms, p95 5,7 ≤ 12 ms.
- **Thời gian nạp** (trang bench, đo trong trang): luật bố cục 6,9–7,8 ms; mặt nạ sơn 74,6–82 ms; kế hoạch rải 15–16 ms; nướng 177–212 ms (chuẩn bị 2,5 ms, vẽ và đọc lại một texel 175–209 ms; biên dịch shader 17–56 ms không chặn). Cổng "rải + nướng ≤ 300 ms": 192–219 ms, **đạt**. Cả bốn phần cộng lại 275–303 ms: lượt xấu nhất vượt 300 ms 3 ms. Lưu ý: lệnh đọc lại một texel chờ mọi việc GPU xếp trước nó (trang bench đang tải model M0b lên GPU); trên trang địa hình cùng việc nướng chỉ mất 34–46 ms.
- **Sơn trực tiếp đắt:** cùng bản đồ không nướng tốn 18,4 ms (sơn A2 thêm nhiều lớp nhiễu và lốm đốm cỏ, đều tính lại mỗi khung). Vì vậy bậc Low giờ cũng nướng (1024², 3dbe7d9; đã kiểm trên trang địa hình Low 720p: nướng 48 ms, hiện đúng). Ngoài hình vuông sơn ±52 m vẫn sơn trực tiếp; ở khung mặc định phần này nhỏ, nhưng nên làm một nhánh rẻ cho ngoài hình vuông trước cổng C.
- Chưa đo Medium, Low, Firefox (cổng C).

## Kiểm

- `pnpm check` (qua `heavy.sh --cores=4`, mã cuối 3dbe7d9): kit hash đạt, 51/51 file, 453/453 test, build đạt. Golden không cập nhật.
- `git diff 02fe9c7 -- src/sim src/content src/typing tests`: rỗng.
- `dh-crowd` (seed 5, mã ở 0cd0648): 1080p `ok` cả năm phần, 17.921 khung đo; quái xa 0 khung che ≥ 40 %, che lớn nhất 30 % (spike 31 %); quái trong 10 m lớn nhất 25 %; cảnh báo đỏ lớn nhất 28 %; không bật lại. 720p `ok`, lớn nhất 31 / 21 / 30 %. Đã xem ảnh đợt 3: chữ trên thẻ đọc rõ trên đồng cỏ, đất, nước; vòng cảnh báo đỏ nổi trên cỏ.
- Bố cục (Q4, số tạm từ luật): 70 % vành r 9–30 m (trừ làn) không cây, không lùm; 4 lùm trong sân, cách nhau ít nhất 8,4 m; cung trống 95–200° có 3 cây lẻ, không lùm.

## Ảnh

Thư mục (bị `.gitignore`): `tmp/map-pilot/`. Tờ ghép giữ lại, ảnh thô đã xóa bằng `tools/capture-prune/prune.mjs`.

| Gì | Đường dẫn trong `tmp/map-pilot/` |
|---|---|
| 12 góc (nghiêng 40/55/75 × hướng 0/90/180/270, 1920 × 1080) | `sheets/final-12views.jpg`; từng ảnh JPG cỡ đầy đủ ở `sheets/final-views/` |
| Khung mặc định 1080p và 720p | `sheets/final-1080p.jpg`, `sheets/final-720p.jpg` |
| Nheo mắt (thu 1/8, mờ 1,2 px; ảnh mẫu, bản thử, spike, M0b) | `sheets/final-squint.jpg` |
| Trước/sau (ảnh mẫu, bản thử, spike `final2`, M0b) | `sheets/final-before-after.jpg` |
| Cây nhuộm A/B | `sheets/final-warm-ab.jpg` |
| Chữ trên quái, đợt 3 | `sheets/crowd-1080p-wave3.jpg`, `sheets/crowd-720p-wave3.jpg` |
| Các vòng trước | `sheets/c7-*`, `sheets/c13-*` |
| Bench (JSON) | `bench/` |

Script tạm (không commit): `tools/look.mjs` (số đo ảnh), `tools/lookmap.mjs`, `tools/clutter.mjs` (bản đồ nhiệt), `tools/q4.ts` (bố cục), `tools/sheets.sh`, `tools/cap.sh`, `tools/bench.sh`.

## Còn mở

- **Giám khảo độc lập chưa chấm.** Người dựng không tự chấm làm cổng. Tự nhận xét để giám khảo đối chiếu (không phải điểm): bản thử gần ảnh mẫu hơn hẳn spike và M0b ở bố cục, độ sáng, đồng cỏ, nước, cây ấm; thiếu rõ nhất là đồ dọc lối (đèn, rào), bến ao, đá vách thật (vách hiện là đống đá tròn sơn xám), và ở góc 75° tán cây thành đốm. Đó là việc của kit (chặng C).
- **Cây nhuộm (V7):** nhuộm đỏ phong đến cam đọc được là cây lá đỏ; giám khảo chấm thử theo CL-05. Nếu dưới 8 thì gọi MF-I2 cho OW-02 (Maple Tree).
- **MF-C03/C04** (đo ảnh) và **MF-C24** (`prepare-ground`, `prepare-decals`) chưa xong: số đo ở đây là số tạm; bản build chưa có nét ô đất và decal (chỉ dev nạp từ `/art-src`).
- Lối câu cá ở đầu cầu bờ Bắc bị bỏ (ô bẫy ở đầu cầu). Khi khung chơi đổi ô (thang v2a), có thể thêm lại.
- Q3 (luật hợp lý) chỉ báo ở chặng A, chưa có phép kiểm `checks/logic.ts`.
- Khung khựng 1,54 s một lần trong bench và lượt đất nướng không prop có p95 8,3 ms: máy chung đang thiếu bộ nhớ; đo lại khi máy rảnh.
- Một lượt chụp bị treo giữa chừng (Chrome không động, không có timeout trong `cdp-run.mjs`); đã dừng lượt đó và chụp lại theo từng góc nghiêng.
