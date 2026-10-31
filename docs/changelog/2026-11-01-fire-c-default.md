# 01/11/2026 · Lửa thử C thành lửa mặc định của Rồng (bản demo)

Nhánh `dh-fire-c-merge` trong `games/.wt-dh-fire-c-merge`, tách từ `main` `8bfd2f0`. Chưa push, chưa gộp vào `main`.

## 1. Quyết định

- Tối 31/10, chủ dự án: "tạm thời cứ lấy bản tốt nhất cho phần lửa rồng đang có đi".
- Hai giám khảo mới, chấm mù, xếp:
  - **thử C**: 7 và 7,5;
  - vòng 10 (lửa đang ở `main`): 6,5 và 6;
  - thử B: 5 và 5,5.
- Vì vậy **lửa của Rồng cho bản demo là thử C**.
- Mức dừng (8) chưa đạt, nhưng **không mở vòng VFX mới**. Lần này chỉ gộp C và đặt nó làm mặc định; hình của C giữ nguyên. Các lỗi giám khảo nêu vẫn mở (mục 7).

## 2. Những gì đã gộp

Commit trên nhánh:
- `0d9b9da`: `git merge --no-ff 62f2f8c` (nhánh `dh-fire-c`) vào `main` `8bfd2f0`;
- `81ca3db`: C thành lửa mặc định; Settings › Reduced motion tới được C (mục 4 và 5);
- commit của changelog này.

`dh-fire-c` mang ba commit, đi từ vòng 10 (`ca64509`):
- `38834b2`: thử A (một vật liệu lửa), `?fire=a`;
- `ec486d6`: thử B (clip cel trong suốt), `?fire=b`;
- `62f2f8c`: thử C (đỉnh nổ của vòng 10, rồi lửa cháy tàn; tia lửa, khói, vết cháy CC0 của Kenney; sóng xung kích thủ tục), `?fire=c`.

Nội dung chính:
- `src/view/fire-a.ts`, `fire-b.ts`, `fire-c.ts`: công tắc và hằng số của từng bản thử.
- `src/view/fx.ts`: đòn chữ STRONG của A, B, C (`wordHit`, `wordHitB`, `sparksC`, `shockC`, `smokeC`, `scorchC`); dấu mặt đất loại 9 (sóng xung kích).
- `src/view/flipbook.ts`: các pool mới, chế độ `fireC` (cháy tàn), `smokeB`, `decalB`; `impact-burst-c` dùng lại atlas `impact-burst` của vòng 10.
- `src/view/stage.ts`: vai vàng của grade, chỉ cho bàn thử của A, mặc định tắt (khi tắt, shader cho kết quả như cũ).
- Bàn thử `?bench=fire` (`src/view/fire-bench.ts`, `scripts/visual/scenarios/dh-fire-bench.mjs`), công cụ đo `scripts/visual/fire-gates.mjs`, `fire-sheets.mjs`, `vfx-gates.mjs`.
- `scripts/assets/prepare-fire-a.mjs`, `prepare-fire-b.mjs`, `prepare-fire-c.mjs`.
- Changelog của ba bản thử (`2026-10-31-fire-test-a.md`, `-b.md`, `-c.md`).

Từ `main` (38 commit kể từ vòng 10), giữ nguyên:
- đòn của quái đang dở vẫn tắt trong trận (`FOE_BLOWS_DEFAULT = false`, `b736756`);
- lửa vòng 10 đi theo Settings › Reduced motion (`bbb7843`);
- bảng nhanh Settings và Sound, ảnh 245 (hàng danh sách bàn phím, nút Close), màn hình tựa, âm phím Typing Feel, tăng tốc khi rảnh.

So với `main`, nhánh chỉ đổi `src/view`, `src/main.ts` (một dòng chú thích và `bench=fire`), `scripts`, `tests/view` và `docs/changelog`. `src/app`, `src/ui`, `src/kit`, `src/audio`, `src/sim`, `src/content`, `src/typing` không khác dòng nào.

## 3. Xung đột và cách gỡ

**Không có xung đột văn bản.**
- Hai bên chỉ cùng sửa một tệp: `src/view/fx.ts`. Git tự gộp được.
- `git merge-tree --write-tree 8bfd2f0 62f2f8c` cho cây `a43bdbc`, trùng cây của `0d9b9da`. Vậy commit gộp không có sửa tay nào.

Có ba chỗ hai bên chạm nhau về nghĩa. Mỗi chỗ đã được xem lại:

| Chỗ | Hai bên | Cách gỡ |
|---|---|---|
| `fx.ts`, đòn của quái | `main`: cờ `foeBlows`, `FOE_BLOWS_DEFAULT`, nhánh `!core.foes.enabled` ở cú trúng của quái. C: các đường của A, B, C trong `wordHit`, `boltLanded` | Khác đoạn, git giữ cả hai. Đòn của quái vẫn tắt (`tests/view/foe-fx-flag.test.ts` đạt). |
| Reduced motion | `main` (`bbb7843`): `app.ts:659` truyền `reduced: settings.reducedMotion` vào `createFx`. C viết trước khi có Settings mới | Giá trị tới được `FxCore.reduced`, và phần lớn lớp của C đã đọc nó. Sóng xung kích thì chưa, nên đã sửa ở `81ca3db` (mục 5). |
| Lửa mặc định | Trên `dh-fire-c`, mặc định là **thử A** (`fire-a.ts`: bật trừ khi `fire=r10\|b\|c`). `main` không có media của A | Nếu để nguyên, trận sẽ tải `fire-a/manifest.json` mà không có atlas, nên đòn rơi về vòng 10. `81ca3db` đổi mặc định sang C (mục 4). |

## 4. Lửa mặc định

**Cách chọn trong code:**
- `src/view/fire-c.ts:73`: `FIRE_OTHERS = ["r10", "a", "b"]`.
- `src/view/fire-c.ts:76–83`, `fireCFromSearch()`: C bật trừ khi `?fire=` là một trong ba giá trị đó. Không có `fire`, có `fire=c` hay giá trị lạ thì đều là C.
- `src/view/fire-c.ts:89`: `FIRE_C = { on: fromUrl(), … }`.
- `src/view/fire-a.ts:21`: thử A chỉ bật với `?fire=a` (trước đây là mặc định của nhánh thử).
- `src/view/fire-b.ts:56`: thử B chỉ bật với `?fire=b` (như cũ).
- `?fire=r10`: cả ba cờ tắt, nên `wordHit` vẽ vòng 10.

**Thứ tự trong `fx.ts`:**
- `fx.ts:1552`: B (nếu bật);
- `fx.ts:1569`: A;
- `fx.ts:1571`: C, khi không có A và atlas `impact-burst-c` đã sẵn.

**Chỉ tải media của lửa đang chơi** (`fx.ts:2789–2793`):
- C tải `fire-c/` và atlas `firefly/` của vòng 10;
- A tải atlas của A với `fire=a` và `fire=b` (B dùng `halo-a`);
- atlas của B chỉ tải với `fire=b` và với `fire=c&smoke=cel` (khói cel, chỉ để so).

Bàn thử:
- `fire-bench.ts` chỉ chờ atlas của lửa đang thử.
- `dh-fire-bench.mjs` thêm `fire=a` cho biến thể `a` và `shoulder`.

**Kiểm trong trình duyệt** (`tmp/fire-c-default/which-fire.json`). Mỗi URL tải những tệp `vfx/` sau:

| URL | Tệp `vfx/` được tải |
|---|---|
| không có `fire` | `fire-c/manifest.json`, `sparks-c.webp`, `smoke-c.webp`, `scorch-c.webp` (đều 200) và 11 tệp `firefly/` |
| `fire=c` | như trên |
| `fire=r10` | chỉ 11 tệp `firefly/` |
| `fire=a` | thêm `fire-a/manifest.json` |
| `fire=b` | thêm `fire-b/manifest.json`, `fire-a/manifest.json` |

- Không có ngoại lệ nào.
- Worktree không có media của A và B. Vite trả trang `index.html` cho đường dẫn thiếu, nên các manifest đó báo 200 mà không có atlas. Hai đòn đó rơi về vòng 10, như ở `main` hiện nay.

Phép thử mới: `tests/view/fire-c-default.test.ts` (8 phép thử).
- Phần công tắc: `fireCFromSearch` với chuỗi rỗng, `fire=c`, `r10`, `a`, `b`. Trên trang không có `fire`, `FIRE_C.on` bật, `FIRE_A.on` và `FIRE_B.on` tắt.
- Phần Reduced motion: xem mục 5.

## 5. Reduced motion (Settings › Graphics)

**Đường đi của giá trị:**
- `app.ts:239–240`: theo hệ thống cho tới khi người chơi tự đặt.
- `app.ts:285–286`: `rig.configure({ reducedMotion })` tắt rung camera; `dh-still` làm đứng UI nhấp nháy.
- `app.ts:659`: `createFx({ reduced })`.
- `fx.ts:2768`, `:2779`: giá trị vào `FxCore`.
- Giá trị đọc khi dựng trận: đổi giữa trận thì có hiệu lực từ trận sau (như vòng 10).

**Các lớp của C khi bật** (`VFX_STANDARD.md` §3.8, repo cha):

| Lớp | Bình thường | Reduced motion | Dòng §3.8 | Chỗ trong code |
|---|---|---|---|---|
| Hai sprite lửa, đỉnh rồi cháy tàn | cỡ vòng 10 | ×0,8 | làm dịu | `fx.ts:1566` (`big`) |
| Lóe lõi trắng, quầng cam, lóe teal | | sáng ×0,6, bán kính ×0,8 | làm dịu | `fx.ts:1646–1648` |
| Sao chổi (comet) | 10 + 3×bậc | 5 + 3×bậc, sáng ×0,6 | làm dịu | `fx.ts:1660` |
| Tia lửa Kenney | 9 | 5, sáng ×0,6 | làm dịu | `fx.ts:1952` |
| **Sóng xung kích** (sửa ở `81ca3db`) | lớn 0,2 → 1,0 của 8 m × √k | ×0,8 bề ngang, độ đục ×0,6, quét ngắn hơn (0,5 → 1,0), nên ít phần vòng lao ra ngoài | làm dịu | `fx.ts:1973–1984` |
| Khói Kenney | 2 đám | 1 đám, độ đục ×0,6, cỡ ×0,8 | làm dịu | `fx.ts:2005`, `:2013` |
| Vết cháy | 9,5 m × √k, 3 than | ×0,8, 2 than | giữ (đánh dấu chỗ trúng) | `fx.ts:2024`, `:2036` |
| Vòng teal T3 (dấu Hoàn hảo) | | không đổi | giữ (vòng cho biết vùng trúng) | `fx.ts:1693` |
| Camera kick của đòn mạnh | 1–2 px | tắt | tắt | `fx.ts:3033` |
| Rung màn hình | trauma của rig | tắt (`rig.configure`) | tắt | `app.ts:285` |
| Rung dự phòng của `fx` (khi không có `shake`, ví dụ bàn thử) | | **tắt** (thêm ở `81ca3db`) | tắt | `fx.ts:2835` |
| Dừng hình | T3: 25 ms | 25 ms (≤ 45 ms) | giữ | kit `feedback/profiles.ts:76` |

**Kiểm:**
- **Phép thử** (`tests/view/fire-c-default.test.ts`). Bắn một đòn STRONG T3 lên đất khô, với atlas giả của C, so hai lần (bình thường và giảm), đọc dữ liệu pool:
  - lửa ×0,8;
  - tia lửa 5 so với 9, sáng ×0,6;
  - khói 1 đám so với 2, độ đục ×0,6, cỡ ×0,8;
  - sóng xung kích: cỡ cuối ×0,8, độ đục ×0,6, bắt đầu từ 0,5 thay vì 0,2 của cỡ cuối;
  - vết cháy ×0,8.
- **Trình duyệt:** `dh-vfx-word`, 1280×720, nền sáng, giả lập `prefers-reduced-motion: reduce`.
  - Trang có `dh-still`.
  - Lửa ở quái nhỏ hơn: f016 5588 px so với 7458 px (×0,75); ở miệng 1606 so với 2449.
  - Trắng xóa 0,17 % (bình thường 0,2 %).
  - 0 yêu cầu hỏng, 0 ngoại lệ.
  - Tờ so: `tmp/fire-c-default/sheets/compare-reduced-720-light-full-vs-reduced.jpg`. Hàng trên là bình thường, hàng dưới là giảm; các khung f000, f012, f014, f016, f020, f024, f028, f032, f036, f066, f096.

## 6. Kiểm

### `pnpm check` (trên `81ca3db`)

- Mã 0.
- kit: `src/kit OK: 96 files match kit-manifest.json`. `git diff 8bfd2f0 -- src/kit` rỗng.
- test: 81 tệp, **742 đạt**, 3 bỏ qua. Trong đó 8 là phép thử mới của `fire-c-default.test.ts`.
- tsc và build xanh. Có cảnh báo cỡ chunk của Vite, đã có từ trước.
- Log: `tmp/fire-c-default/check.log`.

### `dh-vfx-word`, không có `?fire=`

**Cách chạy:**
- Vite `127.0.0.1:3281 --strictPort`, seed 20261028, từ "place", camera chơi, nền sáng và tối.
- Cả bốn lượt: chữ đầu là Perfect (đòn STRONG), 52 khung.

**Kết quả chung:**
- 0 yêu cầu hỏng, 0 ngoại lệ, 0 dòng log.
- Tờ ảnh cho thấy C: đỉnh nổ của vòng 10, sóng xung kích trên đất, tia lửa Kenney, lửa cháy tàn đỏ sẫm từ f+9, một làn khói xám nhỏ sau quái, vết cháy. Không còn khói mật độ to của vòng 10.

| Cỡ, nền | Khung đầu của lóe / đỉnh | Đèn | Trắng xóa tối đa | Tương phản thẻ chữ p01 | Lửa ở miệng (px) | Lửa ở quái f012 / f016 (px) |
|---|---|---|---|---|---|---|
| 1280×720 sáng | 0,947 | 1,0 | 0,20 % (f015) | 9,96 | 2449 | 5938 / 7458 |
| 1280×720 tối | 0,971 | 1,0 | 0,18 % | 11,18 | 2926 | 6466 / 7975 |
| 1920×1080 sáng | 0,957 | 1,0 | 0,22 % | 9,97 | 5499 | 13239 / 15796 |
| 1920×1080 tối | 0,979 | 1,0 | 0,21 % | 11,19 | 6496 | 14401 / 16969 |

Lửa ở quái f016, 720 sáng: 7458 px, sát số của vòng 10 khi gộp (7480 px). Đúng như mong đợi, vì C giữ nguyên đỉnh của vòng 10.

### Hiệu năng

`dh-perf`, High 1920×1080, không giới hạn khung, đợt 1–5, máy tải 3,3–4,6. Bot gõ 80 từ, cả 80 đều Perfect, nên mỗi từ là một đòn C.

| Đợt | TB (ms) | p95 (ms) | Dài nhất (ms) | Draw call |
|---|---|---|---|---|
| 1 | 3,60 | 4,5 | 7,0 | 61 |
| 2 | 3,54 | 4,7 | 6,5 | 61 |
| 3 | 3,52 | 4,5 | 5,8 | 61 |
| 4 | 3,50 | 4,2 | 7,5 | 63 |
| 5 | 3,50 | 4,3 | 6,6 | 63 |

- Trong cổng 8 / 12 ms.
- Không có yêu cầu hỏng, không có ngoại lệ.

### Hành vi của `main`

- Code của app và UI không đổi so với `main`.
- Các phép thử của `main` đều đạt: bảng nhanh (`quick-settings.test.ts`), Settings và bàn phím, ảnh UI 245 (`ui-art.test.ts`), màn hình tựa, đòn của quái tắt (`foe-fx-flag.test.ts`).
- Lần này không chạy lại lượt kiểm bảng nhanh trong trình duyệt.

## 7. Còn mở: lỗi giám khảo nêu ở C (chưa sửa, theo quyết định không mở vòng mới)

1. f+10…f+18: phần cháy tàn đọc như **giấy cắt màu đỏ gạch phẳng**.
2. Đỉnh nổ vẫn cao khoảng **4,4× chiều cao của quái** và che quái trong 13–17 khung.
3. Trên bàn thử nền cát, lửa che một phần **Bạch Long** khoảng 16 khung.
4. Trên nền tối, **khung đầu chỉ bằng 0,80–0,84 của đỉnh**.
5. **Vết cháy trên cát đọc như bùn.**
6. **Khói đọc như một miếng dán xám.**

Việc khác còn mở:
- Mức 8 (và đích 8,5 của `VFX_STANDARD.md` §5.6) chưa đạt. Chủ dự án sẽ tìm hướng khác.
- `?fire=a` và `?fire=b` chỉ còn để so. Media của chúng chỉ có trong `games/.wt-dh-fire-a`; thiếu media thì đòn rơi về vòng 10.
- Dừng hình T5 là 50 ms, kể cả khi bật Reduced motion; §3.8 cho tối đa 45 ms. Chỗ này thuộc kit (`feedback/profiles.ts`), không thuộc C. Đòn chữ STRONG là T3 (25 ms) nên không bị ảnh hưởng.
- Khi gộp vào `main`: nếu `main` đã đi tiếp sau `8bfd2f0`, cần gộp và kiểm lại.

## 8. Media (không vào Git)

C cần 10 tệp mới dưới `public/assets/dragon-hold/vfx/fire-c/` (bị bỏ qua). Ngoài ra C dùng atlas vòng 10 trong `public/assets/dragon-hold/vfx/firefly/`, đã có ở `main` và trong `media.md5`.

**Cách làm ra:**
- Chạy `node scripts/assets/prepare-fire-c.mjs` từ thư mục gốc của game.
- Gói Kenney đọc mặc định từ `~/VFXLab/packs/kenney-particles/x`, đổi được bằng `--pack <dir>`. Cần ImageMagick (`magick`).
- Đã chạy trong worktree này: cả 11 tệp ra trùng md5 với bản trong `games/.wt-dh-fire-a`, nên script cho kết quả lặp lại được.
- `media.md5` hiện chưa có dòng nào cho `fire-c/`. Các dòng cần thêm sau `media:push`:

```
91104ee56d746790dcf782c67f13a8d2  public/assets/dragon-hold/vfx/fire-c/manifest.json
89d58617ecf31b8f79c0cad6386f97ca  public/assets/dragon-hold/vfx/fire-c/sparks-c.webp
da93fb0f83fa3764cc46ddae26087bbf  public/assets/dragon-hold/vfx/fire-c/scorch-c.webp
998690ecdfcde327f5cc14dbbc7768b7  public/assets/dragon-hold/vfx/fire-c/smoke-c.webp
457e431e618f5aa8cd004c9a573010f4  public/assets/dragon-hold/vfx/fire-c/kenney/flare_01.png
122c3584f6c09634f5a73bb89c06155d  public/assets/dragon-hold/vfx/fire-c/kenney/scorch_01.png
af398c7e09d9f586f88a5c08ac704846  public/assets/dragon-hold/vfx/fire-c/kenney/scorch_02.png
4af623130313a84d41b17b274dcc9949  public/assets/dragon-hold/vfx/fire-c/kenney/smoke_04.png
31d0c4c2e6c230114341cbeecd8b2bd9  public/assets/dragon-hold/vfx/fire-c/kenney/smoke_07.png
8e3dba6fa59bc869b76e9fb5cabbd47c  public/assets/dragon-hold/vfx/fire-c/kenney/smoke_08.png
20292aaf8695ec5a267a772beeb29288  public/assets/dragon-hold/vfx/fire-c/kenney/License.txt
```

**Để chạy thử trong worktree:**
- `public/assets/` là bản sao từ `games/dragon-hold/public/assets` (297 tệp), cộng `fire-c/` do script làm ra.
- `art-src/decals`, `art-src/ground`, `art-src/vfx` là symlink tới `games/dragon-hold/art-src`, như `games/.wt-dh-fire-a`.
- Git bỏ qua tất cả các thư mục này.

## 9. Giấy phép

- **C chỉ dùng tệp của Kenney Particle Pack 1.1** (https://kenney.nl/assets/particle-pack). Gói là **CC0 1.0**: dùng được cho dự án cá nhân và thương mại. Ghi công thì tốt nhưng không bắt buộc.
- Các tệp đã dùng: `flare_01`, `scorch_01`, `scorch_02`, `smoke_04`, `smoke_07`, `smoke_08`. Chúng được chép nguyên vào `fire-c/kenney/` cùng `License.txt` của gói.
- Gói **Kenney Smoke Particles** cũng là CC0, ghi công không bắt buộc. Gói này nằm trong danh sách gói đã tải (`docs/games/vfx/PACKS.md`, repo cha), nhưng C không dùng tệp nào của nó.
- Chi tiết: `2026-10-31-fire-test-c.md` §6.
- Hồ sơ bên thứ ba của repo cha (`docs/games/THIRD_PARTY.md`) chưa có dòng cho Particle Pack. Việc thêm thuộc về người điều phối, không làm trong nhánh này.

## 10. Tờ ảnh và số liệu

Dưới `games/.wt-dh-fire-c-merge/tmp/fire-c-default/` (Git bỏ qua):
- `word/<cỡ>-play-<nền>/sheet-crop.jpg`, `sheet-full.jpg`, `meta.json`, `word/report-c-default.json`, `word-run.json`;
- `word-reduced/1280x720-play-light/sheet-*.jpg`, `word-reduced/report-c-reduced.json`, `word-reduced-run.json`;
- `sheets/compare-reduced-720-light-full-vs-reduced.jpg`;
- `which-fire.json`, `perf-high-1080.json`, `check.log`;
- kịch bản bọc ngoài: `word-c.mjs` (danh sách media `vfx/`, giả lập Reduced motion), `which-fire.mjs`.

Khung thô (526 tệp, 635 MB) đã xoá bằng `tools/capture-prune/prune.mjs --apply`. Nhật ký xoá: `.pruned-20261101-0147.txt`.
