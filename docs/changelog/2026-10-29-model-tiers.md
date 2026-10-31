# Bậc model theo mức chất lượng (29/10/2026)

Worktree `games/.wt-dh-models`, nhánh `dh-models` (tách từ `main` `4f61c6e`, đã gộp `map-pilot` hai lần: `ee6b6e4` lúc bắt đầu, `51fb5b2` lúc kết thúc). Làn model. Chưa gộp vào `main`, chưa đẩy.

**Vì sao:** chủ dự án 29/10 chê quái và cây như nhựa. Luật: `docs/games/MODEL_QUALITY.md` §2, §2b, §3 (repo cha). Lỗi nằm ở bước M0b của ta (`scripts/models/m0b-strip.mjs`): cắt mọi model cho mọi mức, xóa normal map và map nhám, đặt nhám phẳng 0,9, texture 1024.

**Phạm vi:** chỉ phần nhìn và media. Sim, golden không đổi (`git diff 4f61c6e -- src/sim src/content src/typing tests/golden` rỗng). Low giữ nguyên như hôm nay (không nạp 3D, khối tạm).

## 1. Tóm tắt

- Mỗi model có ba file theo mức: **Ultra** là nguyên file gốc Tripo với màu, normal, nhám; **High** theo sàn §2 (quái, lính, bẫy, nhà, cầu giữ nguyên gốc; cây 8.000; bụi, đá 2.500; cỏ, hoa, lau 2.000); **Medium** khoảng nửa High, không dưới 2.000. Low không đổi.
- Vật liệu dùng map từ Medium trở lên: normal map ở Medium, High, Ultra; map nhám ở High và Ultra (nhám thay đổi trên bề mặt). Lớp tô của game (ramp, rim, sương, wash họ, viền) giữ nguyên, chồng lên trên.
- **Hiệu năng:** để lưới bậc ở mọi khoảng cách thì High vượt cổng (trung bình 7,8–8,9 ms, cổng 8 ms). Đã cân theo §3 bước 2 (LOD theo khoảng cách): cây xa camera hơn 70 m (High) vẽ lưới Medium, bụi, đá, cỏ vẽ bản cắt M0b, đều mang map của bậc; viền và bóng mờ của quái vẽ bằng lưới Medium. High nay 6,3–7,3 ms trung bình, p95 8,4–9,9 ms (main 5,3–5,6 / 7,5–7,9), trong cổng. Ultra tốn hơn (mục 6).
- **Sửa lỗi Ultra có từ trước:** khi có quái trên màn, Ultra hiện một hộp đen lớn giữa sân (NaN của rim trong shader đám đông, bloom làm loang ra). Đã sửa (mục 5).
- **Sửa kit:** manifest có thêm bậc `ultra`; kit chọn `ultra` khi chất lượng là Ultra. Commit repo cha `da4bd842`, đồng bộ chỉ vào worktree này.

## 2. Đường ống

| Bước | Công cụ | Ghi chú |
|---|---|---|
| Blender | `static_model_tools.py` của repo cha, gọi từ `scripts/models/m0b-tiers.mjs` | Cùng hướng, cỡ, gốc, socket của preset M0b. Mỗi mức tam giác một lượt; khóa đường may UV; normal chuyển từ lưới đầy đủ. Kết quả ở `art-src/models-tiers/` của worktree, có cache theo hash |
| Mức và map | `scripts/models/m0b-tiers.mjs`, preset mới `scripts/models/presets/dragon-hold-tiers.json` | Cắt `cut` của preset M0b (khiên và chùy Vệ Binh). Meshopt tiếp nếu Blender dừng trên đích. Nhám là kênh xanh của map metal-roughness gốc, ghi thành ảnh xám. Kim loại 0 ở mọi mức (Tripo đánh dấu vàng sơn là kim loại, ánh sáng PBR làm nó nâu). WebP từng ô map theo cỡ của mức. Meshopt, lượng tử hóa |
| File phụ | cùng script | `far`: LOD xa của cây đá bụi, chỉ hình, không ảnh (cây: lưới Medium; bụi, đá, cỏ: bản cắt M0b). `hull`: lưới Medium của 12 model đám đông, chỉ hình, không ảnh |
| Manifest | cùng script | `m0b/manifest.json` và `kit3/manifest.json` liệt kê `ultra`, `high`, `medium` (kèm số tam giác), thêm trường `far` và `hull`. Model giữ manifest cũ của nó |

- Đọc file gốc từ `games/dragon-hold/art-src/3d/` (chỉ đọc), ghi ra worktree. `m0b-strip.mjs` giữ làm hồ sơ của bản cắt M0b.
- Lệnh: `node scripts/models/m0b-tiers.mjs [--only <khóa>,…] [--jobs 3]`. Cả 32 model khoảng 70 s lần đầu, khoảng 40 s khi Blender đã có cache.

## 3. Bảng bậc đã ship

**Theo lớp** (texture là cạnh dài nhất, WebP; "nhám" là map nhám xám):

| Lớp | Model | Ultra | High | Medium | File phụ |
|---|---|---|---|---|---|
| character | 7 quái và G01, Vệ Binh Rêu, 3 bẫy | gốc 3.594–8.382 tam giác; màu 2048, normal 2048, nhám 1024 | gốc; màu 2048, normal 1024, nhám 512 | ½ gốc, tối thiểu 2.000; màu 1024, normal 512 | `hull` (lưới Medium) |
| building | Lều Thuốc Nam, cầu gỗ, cầu tàu | gốc 4.180–9.858; như trên | gốc; như trên | ½ gốc; như trên | `hull` chỉ cho Lều |
| tree | thông cao, thông tròn, thông non, cây tán tím | gốc 5.900–9.922; màu 2048, normal 2048, nhám 1024 | 8.000 (thông non 5.900); màu 1024, normal 1024, nhám 512 | 4.000 (thông non 2.950); màu 1024, normal 512 | `far` (lưới Medium) |
| small | bụi, đá, gốc cây, khúc gỗ, đèn, rào, khối vách | gốc 2.862–4.878; như cây | 2.500; như cây | 2.000; như cây | `far` |
| cover | cỏ, hoa dại, lau | gốc 2.786–2.910; như cây | 2.000; như cây | 2.000; như cây | `far` |

- High của cây, bụi, đá dùng màu 1024: §2.3 chỉ cho 2048 ở nhân vật, rồng, boss, quái, nhà, mốc.
- Normal map 1024 ở High (§2b chỉ ghi "normal map"), nhám 512 ở High: §2.3 cấm một độ nhám phẳng cho cả model. Medium không có map nhám; nhám của model là trung bình của map gốc (0,33–0,98 tùy model), không còn 0,9 chung cho mọi model.

**Từng model** (tam giác; "Trước" là bản High cũ):

| Model | Lớp | Gốc | Ultra | High | Medium | Xa / vỏ | Trước |
|---|---|---:|---:|---:|---:|---:|---:|
| Moss Grunt | character | 5.708 | 5.708 | 5.708 | 2.962 | vỏ 2.962 | 2.848 |
| Blight Wolf | character | 5.637 | 5.637 | 5.637 | 2.913 | vỏ 2.913 | 2.560 |
| Moss Banner (G01) | character | 8.382 | 8.382 | 8.382 | 4.191 | vỏ 4.191 | 4.325 |
| Moss Archer | character | 5.903 | 5.903 | 5.903 | 2.949 | vỏ 2.949 | 3.471 |
| Tusk Boar | character | 5.812 | 5.812 | 5.812 | 2.906 | vỏ 2.906 | 2.400 |
| Thorn Wasp | character | 4.670 | 4.670 | 4.670 | 2.334 | vỏ 2.334 | 2.000 |
| Thorn Ant | character | 3.744 | 3.744 | 3.744 | 2.000 | vỏ 2.000 | 1.707 |
| Moss Warden | character | 5.555 | 5.115 | 5.115 | 2.668 | vỏ 2.668 | 2.399 |
| Spikes | character | 3.594 | 3.594 | 3.594 | 2.000 | vỏ 2.000 | 2.352 |
| Pine Bomb | character | 3.748 | 3.748 | 3.748 | 1.998 | vỏ 1.998 | 2.481 |
| Net Launcher | character | 4.860 | 4.860 | 4.860 | 2.426 | vỏ 2.426 | 2.424 |
| Herb Hut | building | 9.858 | 9.858 | 9.858 | 4.928 | vỏ 4.928 | 4.400 |
| Bridge (cầu gỗ cũ) | building | 9.285 | 9.285 | 9.285 | 4.641 | — | 4.121 |
| Wooden Jetty | building | 4.180 | 4.180 | 4.180 | 2.090 | — | 1.500 |
| Pine Tall | tree | 9.496 | 9.496 | 8.000 | 4.000 | xa 4.000 | 899 |
| Pine Round | tree | 9.499 | 9.499 | 7.999 | 3.995 | xa 3.995 | 1.499 |
| Pine Young | tree | 5.900 | 5.900 | 5.900 | 2.950 | xa 2.950 | 700 |
| Violet Tree | tree | 9.922 | 9.922 | 8.000 | 4.059 | xa 4.059 | 1.599 |
| Moss Bush | small | 4.870 | 4.870 | 2.498 | 1.990 | xa 699 | 696 |
| Blossom Bush | small | 4.742 | 4.742 | 2.499 | 2.231 | xa 1.379 | 1.469 |
| Boulder | small | 3.698 | 3.698 | 2.500 | 2.000 | xa 498 | 499 |
| Rock Slab | small | 3.729 | 3.729 | 2.499 | 1.999 | xa 450 | 450 |
| River Stones | small | 3.884 | 3.884 | 2.500 | 2.000 | xa 450 | 450 |
| Stump | small | 3.709 | 3.709 | 2.499 | 2.031 | xa 600 | 599 |
| Log | small | 3.816 | 3.816 | 2.500 | 2.000 | xa 500 | 500 |
| Lantern Post | small | 2.862 | 2.862 | 2.500 | 2.000 | xa 599 | 599 |
| Rail Fence | small | 2.874 | 2.874 | 2.500 | 2.000 | xa 600 | 600 |
| Cliff Rock | small | 4.866 | 4.866 | 2.500 | 2.000 | xa 800 | 800 |
| Cliff Rock (wide) | small | 4.878 | 4.878 | 2.500 | 2.000 | xa 800 | 800 |
| Reed Clump | cover | 2.910 | 2.910 | 2.000 | 2.000 | xa 399 | 398 |
| Wildflower Clump | cover | 2.786 | 2.786 | 1.998 | 1.998 | xa 296 | 299 |
| Grass Tuft | cover | 2.854 | 2.854 | 2.000 | 2.000 | xa 300 | 300 |

- Vệ Binh 5.115 ở Ultra là gốc trừ phần `cut` (nửa sau của chùy và khiên do Multiview ghép chữ V), như M0b.
- Một vài Medium lệch đích: Moss Bush 1.990, Pine Bomb 1.998, Rock Slab 1.999, Wildflower 1.998 (meshopt dừng ngay dưới 2.000); Blossom Bush 2.231 (khóa đường may UV dừng sớm).

## 4. Vật liệu

- **Đám đông** (`view/crowd.ts`, `view/models.ts`): lớp model nhận `normalMap` (tỉ lệ y do GLTFLoader lật cho tangent đạo hàm), `roughnessMap` và nhám của file, kim loại 0. Wash họ, rim, vết tan, chớp trúng giữ nguyên.
- **Cây đá bụi, cầu, ảnh impostor** (`view/scatter.ts`, `view/paths.ts`, `view/impostor.ts`): vật liệu tô tranh (Lambert + ramp) nhận normal map; ramp đọc pháp tuyến đã có normal map, nên ánh sáng theo bậc có chi tiết bề mặt. High và Ultra thêm **ánh lóe theo map nhám** (`paintMaterial` tùy chọn `gloss`): Blinn-Phong chuẩn hóa từ ánh nắng, đã qua bóng đổ, nhân `(1 − nhám)²`. Tán lá có sàn nhám 0,62 để lá không bóng (Tripo cho thông non nhám 0,33); đá, gỗ, cầu sàn 0,35. Bake impostor của vòng rừng xa dùng normal map.
- **Sàn trong file:** mọi model giữ trung bình và độ lệch nhám đo được trong `art-src/models-tiers/report.json`. Ví dụ Moss Grunt trung bình 0,89, lệch 0,20; Thorn Wasp 0,59, lệch 0,23; đá 0,96–0,98, lệch 0,01–0,02 (đá gần như mờ đều, ánh lóe hầu như chỉ ở vết nứt).

## 5. Lỗi Ultra: hộp đen giữa sân (có từ trước, đã sửa)

- Ở Ultra (MSAA 4×, bloom bật), ngay khi có quái trên màn, một hộp đen lớn che giữa sân. Có trên bản gốc `b841d29` (main + map-pilot) với model cũ, không do bậc model.
- Nguyên nhân: với MSAA, điểm ảnh ở mép tam giác được tô ở tâm điểm ảnh, ngoài tam giác. `vViewN.z` nội suy ra ngoài ±1, `pow(1.0 − abs(vViewN.z), …)` lấy cơ số âm thành NaN. Bloom làm mờ NaN qua các mức mip thành một hộp đen.
- Sửa: `pow(max(1.0 − abs(vViewN.z), 0.0), …)` ở rim đám đông (`view/crowd.ts`) và rim cột sáng cờ (`view/banners.ts`). Kiểm: trang mẫu một quái Ultra có bloom, trận thật Ultra đợt 1 (17 quái): không còn hộp đen.
- Ảnh "trước · ultra" trong tờ so sánh chụp trên bản gốc đã vá dòng này tạm thời (để thấy model cũ ở Ultra); bản gốc thật cho hộp đen.

## 6. Hiệu năng

Đo bằng `dh-bench` (`MODE=bones GROUND=painted`, qua `dh-map-bench.mjs`), 220 quái có xương, 1920×1080, Chrome không khóa nhịp, `heavy.sh --perf`, Mac mini M4. Máy dùng chung: số dao động ±1–2 ms khi làn khác chạy. Vì chỉ chạy một dev server một lúc, các bản được **đo xen kẽ** (bậc model rồi main, hai vòng liền nhau). Lượt cuối 18:15–18:20, máy tương đối rảnh (tải 3–5 trên 10 nhân). Số liệu: `tmp/model-tiers/quiet/` (JSON, gitignored).

**So với main `4f61c6e`** (bậc model đã gộp `map-pilot` đến `51fb5b2`; trung bình / p95, ms, hai vòng):

| Mức | Main | Bậc model | Chênh trung bình | Draw call | Tam giác (cả bóng, viền, bóng mờ) | Cổng |
|---|---|---|---:|---:|---|---|
| **High** (mặc định) | 5,32 / 7,9 · 5,58 / 7,5 | **7,26 / 9,9 · 6,25 / 8,4** | +0,7 đến +1,9 | 79 / 79 | 2,45 M → 3,70 M | ≤ 8 / ≤ 12: **đạt** |
| Ultra | 12,75 / 15,6 · 13,77 / 17,0 | 15,56 / 19,0 · 13,88 / 17,7 | +0,1 đến +2,8 | 92 / 120 | 2,52 M → 4,84 M | không có cổng riêng |
| Medium | 5,20 / 7,9 · 5,36 / 7,5 | 6,04 / 8,4 · 5,62 / 7,9 | +0,3 đến +0,8 | 81 / 78 | 2,25 M → 2,91 M | — |
| Low | 2,41 / 4,4 · 2,13 / 3,5 | 2,43 / 4,2 · 2,26 / 3,8 | 0 | 30 / 31 | 0,27 M → 0,27 M | ≤ 16 ms: đạt |
| High, lưới bậc ở mọi khoảng cách (`?lod=0`) | — | 8,18 / 11,4 · 7,79 / 11,0 | +2,2 đến +2,9 | 79 | 5,33 M | trung bình vượt 8 ms ở vòng 1 |

- Tam giác cây đá bụi một lượt vẽ: main 0,41 M; bậc model High 0,78 M (LOD xa: cây lưới Medium, phần còn lại bản cắt M0b); lưới High ở mọi khoảng cách 1,87 M; Ultra (85 m) 1,52 M.
- **Cân theo §3, dừng ở bước 2.** Bước 1 (instancing) có sẵn: mỗi model một InstancedMesh. Bước 2 (LOD theo khoảng cách): làm ở đây. Bước 3–5 không cần cho High.
  - Lưới High ở mọi nơi: 8,2–8,9 ms trung bình, p95 11,0–12,3 (đo bốn lần trong ngày), vượt cổng. Chi phí chủ yếu là tô điểm ảnh (giảm còn 5,9 ms khi màn 960×540): lá kim, lá tán dày tam giác nhỏ hơn điểm ảnh.
  - Thử LOD xa là bản cắt M0b cho mọi thứ: High 6,6 ms / 9,6 (lượt êm 11:35), nhưng ở camera chơi tán cây lại thành khối góc cạnh (tờ `game-camera-trees-lod.jpg`). Đã đổi cây sang lưới Medium (4.000) ở xa: tán tròn, gần như không khác lưới 8.000 ở camera chơi; bụi, đá, cỏ giữ bản cắt.
  - Viền và bóng mờ của quái dùng lưới Medium trên High và Ultra (thân giữ nguyên gốc): bớt khoảng 1,2 M tam giác một khung, khoảng 0,3 ms.
- Ngưỡng LOD (`PROP_LOD_M` trong `view/scatter.ts`): Medium 55 m, High 70 m, Ultra 85 m, đo từ mắt camera. Camera chơi cách mọi cây từ 78 m, nên lúc chơi High vẽ toàn bản xa; khi phóng gần (zoom 0,6 còn khoảng 57 m), màn tựa và lúc quay khi thắng, cây gần đổi sang lưới High. Ultra thì nửa gần của bản đồ vẫn là bản gốc. Có trễ 4 m để không nhấp nháy; `?lod=<m>` để thử.
- `dh-crowd` (seed 5, 1920×1080, đợt 3–4, mỗi mức một lượt, cả main): **`ok` ở cả 8 lượt**, mọi phần (`okShots`, `okFar`, `okNear`, `okWarn`, `okJumps`) đạt, 0 ngoại lệ trang; khung trong lượt đo đều 16,7 ms (khóa nhịp 60 Hz), chậm nhất 16,8 ms. Lượt High sau khi gộp đường của `map-pilot`: cũng `ok`. Số liệu: `tmp/model-tiers/crowd-*.log`.
- Lượt đo khi máy bận (13:13–15:31, tải 6–19): bậc model và main đều chậm gấp 1,5–4 lần, chênh giữa hai bên không ổn định; không dùng làm số chính, giữ trong `tmp/model-tiers/merged/`, `treelod/`.

## 7. Giật khung lần đầu

- **Lớp đám đông mới** vẽ một instance ẩn (tỉ lệ 0) ở khung đầu tiên sau khi có lớp. ANGLE trên Metal dựng pipeline ở lần vẽ thật đầu tiên (làn VFX đo 240–250 ms ngày 29/10), nên chi phí này rơi vào lúc nạp, không rơi vào con quái đầu tiên của một loài giữa đợt.
- **Đo trong trận** (`scripts/visual/scenarios/dh-load-hitch.mjs`, 1920×1080, khung chậm nhất trong 20 s đầu của đợt 1):

  | Lượt | Main High | Bậc model High | Main Ultra | Bậc model Ultra | Bậc model Medium |
  |---|---:|---:|---:|---:|---:|
  | 11:08–11:35 | 100 ms | 117 ms | 83 ms | 100 ms | 100 ms |
  | 18:16–18:18 (máy rảnh hơn) | 67 ms | 100 ms | 67 ms | 117 ms | — |

  Khung chậm duy nhất trong đợt là khung bấm Enter, có từ trước (main cũng có), dài hơn 17–50 ms. Không có khung chậm nào khác trong 20 s đầu đợt 1. Gốc `b841d29` (main + map-pilot cũ): High 100 ms, Ultra 83 ms.
- **Lúc nạp (màn tựa, trước khi bấm bắt đầu):** khung chậm nhất High 430–450 ms (main 280–300), Ultra 1,1–1,3 s (main 0–217 ms). Đó là lúc tải texture lên GPU khi cây đá bụi đổi sang model (một khung cho mọi texture của chúng). Không rơi vào lúc gõ. Hướng giảm (chưa làm): tải texture lên dần theo từng model khi nó về, hoặc nén texture (§3 bước 3).
- Trước khi gộp `map-pilot` lần hai, `dh-bench` có một khung 320–420 ms ở khoảng 1,6 s (lần dùng đầu của hiệu ứng bench; `FX=0` thì mất). Làn VFX sửa việc này trên `dh-vfx` (`ce80453`); `map-pilot` thêm `MapStage.warm` (`51fb5b2`, đã gộp). Lượt cuối không còn khung nào trên 50 ms trong lúc đo ở bậc model.

## 8. Dung lượng

| Bậc | File bậc | Thêm `far` | Thêm `hull` | Tải khi chọn mức này | Main |
|---|---:|---:|---:|---:|---:|
| Ultra | 14,78 MB | 0,46 MB | 0,58 MB | **15,82 MB** | 4,38 MB (Ultra dùng file High) |
| High | 9,59 MB | 0,46 MB | 0,58 MB | **10,64 MB** | 4,38 MB |
| Medium | 4,31 MB | 0,46 MB | — | **4,77 MB** | 2,04 MB |
| Low | — | — | — | 0 | 0 |

- Thư mục media: `models/m0b` 25 MB (trước 5,4 MB), `models/kit3` 5,5 MB (trước 1,2 MB); tổng 29,7 MB so với 6,4 MB.
- Bộ nhớ texture GPU ước tính (RGBA8 có mip, chưa nén): Ultra 1,54 GB, High 0,61 GB, Medium 0,21 GB; main High 0,17 GB, Medium 0,04 GB. Nén KTX2 (§3 bước 3) sẽ giảm khoảng 4–6 lần; chưa làm vì cổng khung High đã đạt.

## 9. Ảnh trước/sau

Chụp qua trang mẫu `?bench=models` (`scripts/visual/scenarios/dh-model-tiers.mjs`), 1920×1080. "Trước" là bản gốc `b841d29` (main + map-pilot A3, media model cũ của checkout chính); "sau" là nhánh này. Ảnh thô đã xóa bằng `capture-prune`; còn lại các tờ dưới `games/.wt-dh-models/tmp/model-tiers/sheets/` (gitignored):

| Tờ | Nội dung |
|---|---|
| `overview-high-ultra-before-after.jpg` | Sáu chủ thể (Moss Grunt, Blight Wolf, Thorn Ant, thông cao, thông tròn, bụi), mỗi hàng: trước High, sau High, trước Ultra, sau Ultra |
| `grunt-before-after.jpg`, `wolf-…`, `ant-…`, `pine-tall-…`, `pine-round-…`, `bush-…` | Từng chủ thể, bốn hàng High, Ultra, Medium, Low; cột trước và sau |
| `default-before-after.jpg` | Camera mặc định của game ở cả bốn mức |
| `game-camera-high-before-after.jpg` | Cận cảnh camera chơi High: tán cây trước và sau (bản sau có cả đường của `map-pilot`) |
| `game-camera-trees-lod.jpg` | Camera chơi High: LOD xa bằng bản cắt M0b (góc cạnh), bản đã ship (cây lưới Medium), lưới 8.000 ở mọi nơi |

- Quái gần: lá rêu tách lớp, móng, lông sói, đốt bụng kiến có khối; không còn mặt phẳng lớn bóng đều. Ultra thêm chi tiết texture và ánh lóe theo map nhám (dao của Grunt, vỏ kiến).
- Cây gần: tầng lá thông, cụm lá tròn có bóng trong; trước là khối góc cạnh.
- Low: giống hệt (khối tạm).
- Ultra "trước" chụp trên bản gốc đã vá tạm lỗi NaN (mục 5); bản gốc thật cho hộp đen.

## 10. Kiểm tra

| Kiểm | Kết quả |
|---|---|
| `pnpm check` (kit hash, test, build) | đạt: 57 file, 490 test, build. Golden không đổi (`git diff 4f61c6e -- src/sim src/content src/typing tests/golden` rỗng) |
| Test mới | `tests/view/model-tiers.test.ts` (LOD có trễ, map của cây đá bụi, vỏ đám đông dùng chung thuộc tính instance), `tests/view/view-crowd-fx-crowd.test.ts` (map của lớp model, khung ấm một instance ẩn) |
| Kit (repo cha `da4bd842`) | `shared/game-kit` 46 file, 713 test đạt, typecheck sạch; `pnpm models:test` 12/12 |
| `dh-crowd` 1920×1080, bốn mức, cả main | `ok` cả 8 lượt, thêm một lượt High sau khi gộp đường |
| `dh-bench` bốn mức, xen kẽ với main | mục 6 |
| `dh-load-hitch` High, Ultra, Medium, cả main | mục 7 |
| Ultra có quái, bloom | không còn hộp đen (mục 5) |
| Lỗi console, ngoại lệ trang | 0 ở mọi lượt; 0 tài nguyên lỗi trong bench |

- Một lượt `pnpm test` riêng lúc máy bận trượt test đo thời gian `tests/ui/tags-bodies.test.ts` (đã biết, xem changelog M0b); `pnpm check` trước mỗi commit đều đạt.
- Hai worktree tạm để đo (`.wt-dh-models-base` ở `b841d29`, `.wt-dh-models-main` ở `4f61c6e`) đã gỡ; media của checkout chính không bị ghi.

## 11. Media phải chép vào checkout chính và `pnpm media:push` (người điều phối)

Chép nguyên hai thư mục từ `games/.wt-dh-models/public/assets/dragon-hold/models/` sang `games/dragon-hold/public/assets/dragon-hold/models/`:

- `m0b/`: `manifest.json` (đổi); 24 model × `.ultra.glb` (mới), `.high.glb`, `.medium.glb` (đổi); 12 `.hull.glb` (mới: 7 quái và G01, Vệ Binh, 3 bẫy, Lều); 11 `.far.glb` (mới: cây đá bụi của bộ M0b).
- `kit3/`: `manifest.json` (đổi); 8 model × `.ultra.glb` (mới), `.high.glb`, `.medium.glb` (đổi); 7 `.far.glb` (mới; cầu tàu không có).
- Tổng 128 file (62 mới, 66 đổi); `heroes/`, `guides/` không đổi. Không file nào bị xóa.
- Bản xử lý trung gian `art-src/models-tiers/` (Blender, cache, `report.json`) chỉ cần nếu muốn chạy lại mà không đợi Blender; không cần đẩy.

## 12. Còn mở, cần quyết định

- **LOD xa ở camera chơi (cần chủ dự án xác nhận).** Camera chơi đứng cách mọi cây đá bụi từ 78 m trở lên (pitch 55°, 95 m). Với ngưỡng 70 m của High, lúc chơi cây vẽ lưới Medium (4.000), còn bụi, đá, cỏ vẽ bản cắt M0b (bụi 700–1.400, đá 450–800, cỏ 300), tất cả mang map của High (màu 1024, normal 1024, nhám 512). Lưới 8.000 / 2.500 / 2.000 chỉ hiện khi phóng gần, ở màn tựa và lúc quay camera khi thắng. Lý do: lưới bậc ở mọi khoảng cách cho High 7,8–8,9 ms trung bình, vượt cổng 8 ms. §2.1 đặt sàn cho model "người chơi thấy gần", §3 bước 2 cho phép "vật xa dùng bản ít mặt"; nhưng §2 cũng nói chỉ bậc Low giảm thêm cho vật xa. Bụi, đá, cỏ ở xa đang dưới sàn 2.000. Nếu chủ dự án muốn lưới bậc ngay ở camera chơi: nới cổng High, hoặc thử nén texture (§3 bước 3) rồi đo lại; ngưỡng là `PROP_LOD_M.high` (thử nhanh bằng `?lod=<m>`).
- **Quái ở High dùng nguyên gốc cho thân**, viền và bóng mờ dùng lưới Medium. Ở camera chơi quái cao khoảng 45–70 px.
- **Ultra:** trung bình 13,9–15,6 ms, p95 17,7–19,0 (main 12,8–13,8 / 15,6–17,0). Lượt trước khi gộp có khung giật 0,6–1,8 s trong lúc đo (tải texture 2048 lên GPU), lượt cuối không còn. Ultra là tùy chọn của người chơi; nếu cần nhẹ hơn: hạ `PROP_LOD_M.ultra` (85 m), hoặc nén texture KTX2 (bộ nhớ texture Ultra ước 1,5 GB).
- **Khung giật lúc nạp lớn hơn** (High 430–450 ms, Ultra 1,1–1,3 s, so với main 280–300 / 0–217 ms), chỉ ở màn tựa. Khung bấm Enter dài hơn main 17–50 ms. Đề xuất việc tiếp: tải texture lên GPU dần theo từng model (cần một dòng ở `view/stage.ts` của làn bản đồ để đưa renderer cho `view/models.ts`).
- **Low không đổi** (khối tạm, không 3D) như yêu cầu. Bảng §2b ghi Low "như bản cắt hiện nay"; thực tế Low hôm nay không nạp model nào. Nếu muốn Low hiện bản cắt M0b, đó là việc riêng (thêm một bậc `low` hoặc dùng `far`).
- **Rồng (Draconis, `heroes/`, `guides/`)** không thuộc làn này, chưa theo §2b.
- **Wordwoven, Last Line:** kit đã có bậc `ultra`; khi làn của game chạm tới model thì `kit:sync` và theo cùng đường ống.
