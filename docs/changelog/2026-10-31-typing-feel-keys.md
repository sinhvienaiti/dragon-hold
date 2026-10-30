# 31/10/2026 · Dragonhold · Âm phím đọc từ Typing Feel, bỏ bản chép

Worktree `games/.wt-dh-keys`, nhánh `dh-keys`. Bước B4 (giai đoạn G3) của [`docs/games/TYPING_FEEL_SERVICE.md`](../../../../docs/games/TYPING_FEEL_SERVICE.md) ở repo cha, mục 4.6 ("API đã làm ở G2"), 5.1–5.3, 7 B4, 8.1. Làm theo cách của Last Line (B3, `07895db` ở nhánh `ts-typefx`). Kit giữ nguyên bản vừa đồng bộ ở bước Kit ([`2026-10-31-kit-keyboard-panel-fetch.md`](2026-10-31-kit-keyboard-panel-fetch.md)), không sửa `src/kit`.

## Đọc từ host Typing Feel

- `KEYS_BASE` (`src/app/keyboard.ts`) nay là `typingFeelKeysBase(import.meta.env.VITE_TYPING_FEEL_ORIGIN)`. Kiểu của biến khai ở `src/env.d.ts`. Mã không có giá trị mặc định, không có `.env.production`.
  - Không đặt biến (clone riêng, CI, `pnpm check`): `KEYS_BASE` là `null`, không gọi mạng, chỉ Off và Dragonhold, không báo lỗi.
- Danh mục tải bằng `timedJson(3000)` (`no-cache`). Manifest bộ tải bằng `timedJson(3000, { cache: "default" })`, file mẫu và preview bằng `timedBytes()` (8 s mỗi file). Lúc khởi động, khi gõ phím và trong bảng Sound đều dùng đúng ba hàm này:
  - `GameKeyboard` nhận `fetchJson` và `fetchBytes` (mặc định `manifestJson`, `sampleBytes`). Trước đây `preload` dùng fetch của kit, không hạn giờ, nên host treo thì giữ lượt nạp mãi (`keyboard.ts:51/60` cũ).
  - Bảng Sound nhận `keyboardFetch: { fetchJson: manifestJson, fetchBytes: sampleBytes }` qua tuỳ chọn mới của `QuickSettings` (`quickOptions` trong `src/app/quick.ts`). Không cần lớp con `TypingSounds`.
- Bộ mặc định lấy từ `default` của danh mục (`bright-clack` ở bản `r1`). `DEFAULT_KEYBOARD_SOUND` chỉ dùng khi danh mục không ghi `default`.
- `index.html` có `<link rel="preconnect" href="<origin>" crossorigin>`, chỉ khi build có biến. Plugin `typing-feel-preconnect` trong `vite.config.ts` chèn thẻ này; không có biến thì không có thẻ nào.

## Hai lỗi của Dragonhold ở mục 5.2, và cổng vào trận

1. **Bảng Settings và Sound chỉ dựng sau khi danh mục về** (`app.ts:950` cũ). Nay `requestKeyboardCatalogue()` chạy ngay sau khi đọc save, song song với từ vựng và cảnh 3D. `GameKeyboard` và `QuickSettings` dựng ngay với `pendingKeyboardChoices`: Off, Dragonhold, và bộ đã lưu hiện "Loading…". Khi danh mục về, `quick.setChoiceOptions("keyboard", …)` thay danh sách, kể cả lúc bảng đang mở. Từ vựng không còn chờ danh mục.
2. **Danh mục hỏng thì ghi đè và lưu bộ của người chơi** (`app.ts:952–953` cũ, `keyboardChoice` ở `settings.ts:54`). Bỏ `keyboardChoice` và `loadGameKeyboards`.
   - `savedKeyboardId` đọc trường thô `keyboard` của save trước khi `loadSettings` điền mặc định cứng.
   - `startKeyboard` gọi `settleKeyboardChoice` của kit qua `settleKeyboard` (Dragonhold là âm gốc, `bright-clack` là mặc định dự phòng). Game chỉ lưu khi `repaired`.
   - Người chơi chọn Off hoặc Dragonhold trong lúc chờ thì lựa chọn đó giữ nguyên, không bị danh mục ghi đè.
   - Save chưa có trường `keyboard` thì game không ghi trường đó khi người chơi đổi mục khác (âm lượng, Mute, Quality); chỉ ghi khi danh mục sửa (`repaired`) hoặc khi người chơi tự chọn âm phím (`storedSettings` trong `src/app/settings.ts`). Nhờ vậy Dragonhold lúc host hỏng, hay mặc định cứng lúc danh mục chưa về, không bị lưu thành lựa chọn. Lần đầu mở game không còn ghi `bright-clack` vào save.
3. **Cổng vào trận.** Trận đầu tiên chờ `playable` của `startKeyboard`, lúc sớm nhất trong ba lúc:
   - đợt giải mã đầu của bộ đang chọn đã về;
   - không có gì để chờ (Off, Dragonhold, bộ không phát được);
   - `KEYBOARD_GATE_MS` (1,5 s) sau khi bắt đầu.

   Sau đó trận chạy dù chưa có âm. Thẻ tốc độ gõ và Học trước không chờ gì.

## Bộ nạp khi nào

- Bộ đang chọn nạp ngay khi danh mục chốt, chưa cần thao tác nào của người chơi (mục 5.4: `decodeAudioData` không cần thao tác). Nó giải mã trên AudioContext của game do `audio.prepare()` (`src/audio/index.ts`) tạo trước thao tác đầu: context đó đứng ở trạng thái suspended, chưa có mixer, giọng hay nhạc nào, nên không có âm nào xếp hàng chờ rồi bật ra một lượt. Thao tác đầu (`unlock()`) dựng mixer trên đúng context đó rồi resume. Vì vậy phím đầu tiên có tiếng kể cả khi nó là thao tác đầu của trang, và cổng vào trận chờ đợt giải mã đầu thật sự ở cả luồng thẻ tốc độ gõ (trước đây cổng mở ngay khi danh mục về, vì chưa có thao tác nên chưa nạp gì).
- `GameKeyboard` không nạp gì trước khi có danh sách đã chốt (`setChoices`).
- Bảng Sound đang tải bộ người chơi vừa chọn thì phím và chuột không mở lượt nạp thứ hai của chính bộ đó (`picked`, xong khi kit báo `onKeyboardLoad` hoặc `onKeyboardFail`). Trước đây một phím bấm trong lúc manifest đang về có thể mở lượt nạp thứ hai; lượt sau giải phóng lượt trước, rồi kit báo bộ hỏng nhầm.

## Âm Dragonhold phát thay

- Bộ đang chọn không phát được trong phiên thì âm Dragonhold (`type.key` của engine) phát thay, không lưu (mục 5.1 bước 5 và 5.3). Mọi trường hợp đi qua một chỗ, `onFail` của `GameKeyboard`:
  - Typing Feel tắt hoặc hỏng, nên bộ đã lưu thành "Saved sound · unavailable";
  - manifest hỏng hay quá 3 s, hoặc đợt giải mã đầu không có file nào (kit thôi xin phần còn lại);
  - bộ chọn trong bảng Sound không phát được (`onKeyboardFail` của kit, qua `pickFailed`).
- `audioVolumes(s, standIn)` và `builtInKeys(s, standIn)` bật bus phím của engine cho âm gốc khi nó là lựa chọn hoặc đang phát thay. Save vẫn giữ id của bộ. Âm gốc thôi phát thay khi người chơi chọn một âm phím bất kỳ.
- Bộ không phát được thì không bị xin lại mỗi lần gõ phím, tới khi người chơi chọn lại hoặc tải lại trang (luật của Dragonhold từ 30/10).

## Báo lỗi

- Có biến mà danh mục không về (404, HTML mã 200, quá 3 s, CORS, không bộ nào dùng được): bảng hiện "Saved sound · unavailable", id trong save giữ nguyên, và dòng báo trên khung học hiện "Keyboard sounds unavailable" 6 s, tính từ khung hình đầu tiên của trận (HUD chỉ có khi có trận). Dòng IME và dòng máu thấp có bình thuốc vẫn đứng trước. Không có biến thì không báo.
- Dev handle có thêm `__dh.keyboard()`: base, trạng thái danh mục, revision, số bộ, id đang chọn và id đã lưu, save có giữ âm phím không, bộ đang phát thay, bộ đang phát, số lần phát, các mốc thời gian (`settledAt`, `playableAt`, `beginAt`) và dòng báo.

## Bỏ bản chép

- Xoá `public/assets/dragon-hold/audio/keys/**`: 2.744 OGG (Git bỏ qua) và 35 `keys-manifest.json` đang theo dõi (34 bộ và danh mục gốc). Xoá sáu dòng `!public/assets/...` và hai dòng chú thích trong `.gitignore`, vì chúng chỉ có để giữ các manifest này. Dưới `public/assets/` không còn file nào được theo dõi.
  - Trước khi xoá đã so md5 theo từng bộ và tên file: cả 2.744 OGG đều có trong `typing-feel/public/v1/keys/sets/<id>/<fp12>/` với cùng md5 (0 thiếu, 0 khác; 34 bộ, mỗi bộ một fingerprint). 2.744 dòng `audio/keys` của `media.md5` khớp từng file trên đĩa.
- `media.md5`: bỏ 2.744 dòng `audio/keys`, từ 4.813 còn 2.069 dòng, giữ nguyên thứ tự, không thêm dòng nào.
- `AGENTS.md` có thêm một dòng trạng thái về cách mới. Ngoài changelog cũ, game không còn chỗ nào trỏ tới `/assets/dragon-hold/audio/keys`.

## Script build (repo cha, điều phối sửa)

- `build:dragon` (được `build:local` gọi) và `dev:dragon:app` cần đặt `VITE_TYPING_FEEL_ORIGIN=https://feel.typing-game.local`, như `build:survival` và `dev:survival:app` của Last Line. Bước này không sửa `package.json` của cha.
- Script `dev` của game không đổi, nên repo game không mang nguồn nhà. `pnpm dev` chạy riêng thì Typing Feel tắt.
- Hai dòng này phải vào **cùng lần merge** với B4. Nếu B4 merge trước, `build:dragon` không đặt biến thì Dragonhold trên host play chạy với Typing Feel tắt (chỉ Off và Dragonhold, bộ đã lưu thành "Saved sound · unavailable", không báo vì không có origin). Báo cáo đầu của bước này viết sai rằng `scripts/play.sh` sẽ build lại hay dừng: khi `build:dragon` không có biến, `feel_origin` rỗng nên vòng kiểm bỏ qua game này. Lượt sửa sau review thêm vào `scripts/play.sh` (repo cha) một chốt: game có `vite.config.ts` đọc biến mà `build:<game>` không đặt biến thì dừng và in hai script cần sửa. `docs/games/TYPING_FEEL_SERVICE.md` §5.1 ghi thêm chốt này.

## Test

- `tests/app/feel-fixture.ts` là host mẫu chép nguyên từ Last Line: danh mục `catalogue-3` (7 bộ, 4 họ, `default` không phải bộ đầu, hai bộ không điểm), manifest `set-1` và byte giả. Test không đọc danh mục thật, không gọi mạng, nên chạy được trên clone riêng.
- `tests/app/settings-and-keyboard.test.ts` viết lại trên host mẫu (19 test thành 44):
  - không có origin: không gọi `fetch`; chỉ Off và Dragonhold; id đã lưu giữ trong save, Dragonhold phát thay; không báo; vào trận ngay;
  - host hỏng (404, HTML 200, thân không phải JSON, CORS, treo): id giữ nguyên, vào trận trong 1,5 s (treo: đúng 1.500 ms), báo một lần, gõ phím không xin thêm gì, Dragonhold phát thay, không còn timer nào;
  - danh mục thiếu id đã lưu: chuyển sang `default` và lưu đúng một lần, bảng không tự sửa thêm;
  - danh mục về muộn khi bảng đang mở: "Loading…", rồi đủ danh sách; Dragonhold hoặc Off người chơi vừa chọn vẫn giữ;
  - bộ đã lưu nạp từ host: manifest dùng cache HTTP, cổng mở khi 16 file đầu đã giải mã; chưa có thao tác vẫn nạp (context suspended), phím đầu tiên phát mẫu đã giải mã và không xin thêm gì;
  - OGG treo: vào trận ở 1,5 s, bỏ sau 8 s với đúng một đợt; manifest treo: bỏ sau 3 s; OGG 404: dừng sau đợt đầu, một file tốt trong đợt thì nạp tiếp;
  - bảng Sound: hàm tải có hạn giờ; bộ chọn hỏng (manifest 404, OGG treo) thì Dragonhold phát thay, lần chọn sau thì thôi; lựa chọn đã bỏ trước khi hỏng thì không phát thay; phím và chuột lúc bảng đang tải không mở lượt thứ hai.
- `tests/app/quick-settings.test.ts` (9 thành 15 test) dùng host mẫu, và thêm sáu test ở mức ứng dụng: hai bảng dựng ngay và trận bắt đầu ở 1,5 s khi danh mục chưa về; host 404; không có origin; bộ chọn trong bảng không phát được; save chưa có âm phím không bị ghi trường `keyboard` khi đổi Mute hay âm lượng (host chạy, host hỏng, không có origin), chỉ lần chọn của người chơi mới ghi; bộ đã lưu giải mã trước thao tác nào trên context suspended, trận chờ đợt đầu, phím đầu phát được. Audio giả của test chỉ có `prepare()`; `context()` (đường cần thao tác) ném lỗi.
- `tests/audio/prepare.test.ts` (3 test, mới): `prepare()` tạo đúng một context, suspended, chưa dựng node nào; `unlock()` dựng mixer trên chính context đó rồi resume; không có Web Audio thì `prepare()` ném lỗi, `unlock()` không làm gì.
- Bỏ các test kiểm media thật (34 bộ, 2.438 phím, 2.744 dòng `media.md5`, thứ tự Hail Stone và Raindrop Tile, độ dài trong manifest). Những thứ đó nay thuộc `typing-feel/`. Test "đuôi dài phát trọn ở 10 phím và 2 space mỗi giây" giữ lại, với độ dài giả 450 ms và 535 ms.
- Kiểm đột biến: bỏ chặn lượt nạp thứ hai làm 1 test hỏng; bỏ nhớ bộ hỏng, 2 test; báo lỗi cả khi không có origin, 3 test; bỏ cổng vào trận và phát thay, 3 test.
- Kiểm đột biến ở lượt sửa: luôn ghi trường `keyboard` (`storedSettings(settings, true)`) làm 1 test hỏng (trước lượt sửa: 0, cả bộ test vẫn xanh); giải mã qua `audio.context()` thay `prepare()`, 6 test; chưa có context thì không nạp (như `canLoad` cũ), 14 test; `prepare()` dựng luôn mixer, 1 test.

## Kiểm

- `pnpm check` mã 0: kit 95 file khớp; 59 file test, **554/554 test** (trước B4 520, sau lượt đầu 549); tsc và build xanh.
- Build không có biến: `dist/index.html` không có thẻ preconnect. Build có `VITE_TYPING_FEEL_ORIGIN=https://feel.typing-game.local` (vào thư mục tạm): có đúng một thẻ preconnect, origin nằm trong gói JS.
- `pnpm deploy:pack`: mã 1, với `local-host` ở `index-*.js` vì `PARENT_ORIGIN` của kit learning và `portal.ts`. Lỗi này đã có trước B4: bản `games/dragon-hold/dist` build 29/10 cũng mã 1 vì đúng lỗi đó. `pnpm deploy:pack:local` mã 0. `dist/` không có OGG hay `audio/keys`.

## Trình duyệt

### Lượt đầu (trước lượt sửa: bộ nạp ở thao tác đầu)

Khung trình duyệt của Claude (Chromium), 1280×900, bản dev (`__dh`). Host Typing Feel nhà (`feel.typing-game.local`) chưa chạy, nên dùng server Node tạm: cổng 18520 phục vụ `typing-feel/public` (CORS `*`, CORP `cross-origin`, `application/json`, `audio/ogg`, 404 khi thiếu file); 18521 không có gì (host tắt); 18522 trả HTML mã 200 cho mọi đường dẫn; 18523 nhận rồi không trả lời. Vite chạy lần lượt ở 18525–18529, mỗi cổng một origin. Mọi server đã dừng. Số liệu: `tmp/b4-typing-feel/browser-check.json`; ảnh gộp: `tmp/b4-typing-feel/contact-sheet.jpg` (ảnh lẻ đã xoá bằng `prune.mjs`).

- **Host chạy, save trống:** có thẻ preconnect; danh mục `r1` `ready`, 34 bộ, về sau 8 ms; trận đầu mở cổng sau 9 ms. Bảng Sound có 36 lựa chọn (Off, Dragonhold, 34 bộ) với 7 tiêu đề họ, đang chọn `bright-clack`.
  - Cú nhấp đầu nạp `bright-clack`: 88 file, đợt đầu 12 phím và 4 space, giải mã đợt đầu trong 10 ms, cả bộ trong 54 ms.
  - Rê chuột: preview Hail Stone và Raindrop Tile phát từ host feel. Chọn Raindrop Tile: 25 file, save ghi `raindrop-tile`.
  - Gõ "fire" rồi Space: bốn `key-NN` và `space-06` của Bright Clack; sau khi chọn Raindrop Tile, "water" rồi Space: năm `key-NN` và `space-05` của Raindrop Tile.
  - Mạng: 115 yêu cầu OGG, tất cả từ `127.0.0.1:18520`; 0 yêu cầu tới `/assets/dragon-hold/audio/keys`.
- **Host tắt** (save `hail-stone`): danh mục `missing` sau 3 ms, cổng mở sau 3 ms; Dragonhold phát thay; "Keyboard sounds unavailable" hiện từ khung hình đầu của trận 6 s rồi tắt; bảng có Off, Dragonhold, "Saved sound unavailable" (tắt, đang chọn); gõ phím không gọi mạng; save vẫn `{"keyboard":"hail-stone","music":0.5}`.
- **HTML mã 200** (save trống): danh mục `missing`, Dragonhold là lựa chọn, có báo; bấm Mute thì save ghi `muted: true` mà không có trường `keyboard`.
- **Treo** (save `deep`): cổng mở và trận bắt đầu ở 1.504 ms; danh mục bỏ ở giây thứ 3 (2.709 ms tính từ lúc dựng bảng, vì yêu cầu đi từ đầu `startApp`); Dragonhold phát thay; có báo; host chỉ nhận một yêu cầu danh mục mỗi lần tải trang; save vẫn `deep`.
- **Không có origin** (save `hail-stone`): không có thẻ preconnect, 0 yêu cầu ra ngoài trang; Off, Dragonhold, "Saved sound unavailable"; Dragonhold phát thay; không báo; console không có lỗi.

### Lượt sửa sau review

Cùng cách dựng, server tạm ở 18548 (phục vụ `typing-feel/public`, rồi tắt, rồi treo), Vite ở 18549 (có biến, rồi không biến). Mọi server đã dừng. Số liệu: `tmp/b4-fix/browser-check.json`; ảnh gộp: `tmp/b4-fix/contact-sheet.jpg` (4 ảnh lẻ đã xoá bằng `prune.mjs`). Chromium của khung này cho AudioContext chạy không cần thao tác, nên context trước thao tác đọc là `running`; trường hợp suspended do test phủ.

- **Host chạy, `?wpm=35`, save `raindrop-tile`:** chưa có thao tác nào (`userActivation` false, `unlocked` false) mà bộ đã giải mã đủ; danh mục về sau 4–20 ms, cổng mở sau 22–50 ms (10 lần tải), đúng lúc đợt đầu về, và trận chờ tới lúc đó. Gõ ngay "fire", "stone", "water" rồi Space làm thao tác đầu của trang: 22/22 cú gõ có tiếng, 0 thiếu, trong 4 lần tải lại (trước lượt sửa, cùng chuỗi đó im hết, `missing` 3).
- **Host chạy, thẻ tốc độ gõ, save trống:** trước cú nhấp, `bright-clack` đã giải mã (cổng mở sau 25 ms); nhấp 35 WPM thì trận vào ngay; gõ "fire" và Space: 5/5 có tiếng; save vẫn trống. Bảng Sound: 36 lựa chọn, 7 tiêu đề họ; chọn Hail Stone thì nạp và lưu `hail-stone`.
- Mạng: 461 yêu cầu OGG, đều từ `127.0.0.1:18548`, 0 lỗi 404; 0 yêu cầu tới `/assets/dragon-hold/audio/keys`. Console: 0 lỗi, không có cảnh báo AudioContext.
- **Host tắt** (save `hail-stone`): danh mục `missing` sau 2 ms, cổng mở sau 2 ms; không tạo AudioContext nào trước thao tác (không có gì để giải mã); Dragonhold phát thay; có báo; save giữ nguyên.
- **Treo** (save `deep`): một yêu cầu danh mục; cổng mở ở 2.196 ms và danh mục bỏ ở 3.195 ms, vì trang đang ẩn (`visibilityState` hidden, khung dùng chung) nên timer bị dồn theo bước khoảng 1 s. Cổng 1,5 s không đổi ở lượt này; test đo đúng 1.500 ms. Dragonhold phát thay, save giữ `deep`.
- **Không có origin** (save `hail-stone`): base `null`, không thẻ preconnect, 0 yêu cầu ra ngoài, không tạo AudioContext, không báo; Dragonhold phát thay; save giữ nguyên.

## Lượt sửa sau review (31/10)

- **Phím đầu tiên có tiếng, cổng chờ đợt đầu thật** (review P3; open item cũ của bước này). `audio.prepare()` mới trong `src/audio/index.ts` tạo AudioContext không cần thao tác, chưa dựng mixer, giọng hay nhạc; `unlock()` dựng chúng trên đúng context đó. `GameKeyboard` giải mã trên `() => audio.prepare()` ngay khi danh mục chốt; bỏ tuỳ chọn `canLoad`. `__dh.keyboard()` có thêm `context` (trạng thái context của âm phím, `null` khi chưa tạo).
- **Không có test nào bắt lỗi ghi trường `keyboard` vào save** (review P3). Thêm test ở mức ứng dụng trong `tests/app/quick-settings.test.ts` (xem mục Test).
- **Hai dòng script của cha phải vào cùng lần merge** (review P2). Sửa câu sai về `scripts/play.sh` trong báo cáo, và thêm chốt vào `scripts/play.sh` (mục Script build).
- Không làm: ảnh thô `tmp/b4-review/raw/probe.jpg` do một lượt review trước để lại. Luật ảnh chụp chỉ cho người chụp xoá ảnh của mình, nên ảnh đó chờ chủ của lượt review kia dọn bằng `prune.mjs`.

## Còn mở

- Trình duyệt có chính sách autoplay mặc định (context suspended trước thao tác) chưa đo trong khung trình duyệt này; test phủ trường hợp đó. Có thể có một cảnh báo "AudioContext was not allowed to start" trong console khi tạo context trước thao tác, như ở Last Line.
- `pnpm deploy:pack` vẫn mã 1 vì `local-host`, như trước B4.
