# Rồng Giữ Ải — Danh sách âm M0 (23/10/2026)

> **Dành cho:** chủ dự án, AI làm âm, làn ráp game.
> **Dựa trên:** `05-presentation-audio-tech-split.md` §5 và §7, `DESIGN.md` §7.2 và §9 (M0), `01-core-combat-learning.md` §6.4, `06-other-systems.md` §2–§3.
> **Mã:** `src/audio/catalog.ts` là nguồn chuẩn của mọi id, bus, độ ưu tiên, độ dài. Test `tests/audio/catalog.test.ts` báo đỏ nếu tài liệu này thiếu một id.

## 1. Tình trạng M0a

- M0a **chưa có file âm nào**. Mọi tiếng là một đoạn tổng hợp WebAudio ngắn trong `src/audio/synth.ts`. Tiếng nền lặp (gió rừng, suối, bước chân bầy) tạo bằng mã trong `src/audio/beds.ts`.
- Nhạc là bản tổng hợp 2 lớp (Rừng, Đợt) trong `src/audio/music.ts`. Kiến trúc đã sẵn cho 4 lớp file.
- Khi có file, chỉ cần thả vào `public/assets/dragon-hold/audio/` (đã gitignore, **không bao giờ vào Git**) và ghi `manifest.json`. Âm nào có file thì phát file. Âm nào chưa có thì vẫn phát bản tổng hợp. Lên Drive bằng `pnpm media:push` ở repo cha.
- Làn ráp bật file bằng `createAudio({ files: true })`. Khi `files` tắt, game không tải gì, nên không có lỗi 404.

Mẫu `manifest.json`:

```json
{
  "sounds": {
    "fire.impact.a": ["sfx/dragon/fire-impact-a-1.ogg", "sfx/dragon/fire-impact-a-2.ogg"],
    "wave.horn": ["sfx/stinger/wave-horn.ogg"]
  },
  "music": {
    "forest": "music/forest/forest.ogg",
    "wave": "music/forest/wave.ogg",
    "surge": "music/forest/surge.ogg",
    "general": "music/forest/general.ogg"
  }
}
```

Quy ước file (theo TD 24.9):

- OGG Vorbis, 48 kHz. Tiếng lẻ mono. Nhạc và nền stereo.
- Độ to: giọng −16 LUFS, nhạc −18 LUFS, nền −26 LUFS. Tiếng lẻ chuẩn hóa đỉnh −1 dBTP. Mức trộn cuối đã nằm trong `catalog.ts` (cột dB).
- Đòn trúng nên có 3–6 biến thể. Mã tự đổi cao độ 0,96–1,04, ±1,5 dB, lệch 0–12 ms.
- Đầu file không có khoảng lặng. Tiếng gõ phải bắt đầu ngay (< 20 ms).
- Ghi lại công cụ, ngày, prompt, giấy phép của từng file.

## 2. Bus và nhường tiếng

12 bus: `master` nhận 11 bus con, rồi qua bộ giới hạn (ngưỡng −3 dB, tỉ lệ 20, attack 2 ms) và một lớp chặn mềm (không bao giờ quá 0,96).

| Bus | Chứa gì | Mức | Khi phát âm từ | Khi thoại | Khi báo đòn tướng, boss |
|---|---|---|---|---|---|
| `music` | Nhạc 4 lớp | 0,50 | −4 dB | −6 dB | −3 dB |
| `ui` | Nút, cửa hàng | 0,70 | −3 dB | — | — |
| `typing` | Phím, xong từ | 0,80 | −2 dB | — | — |
| `dragon` | Hỏa Long: lửa, kỹ năng, bị đánh | 0,75 | −3 dB | — | −4 dB |
| `enemies` | Quái, tướng địch | 0,60 | −6 dB | −6 dB | −4 dB |
| `traps` | Bẫy | 0,65 | −6 dB | −3 dB | −4 dB |
| `units` | Lính, nhà phép | 0,60 | −6 dB | — | −4 dB |
| `ambience` | Gió, suối, chim | 0,45 | −4 dB | −6 dB | −14 dB (gần tắt P5) |
| `voice` | Thoại Bạch Long, người kể (M1) | 0,85 | −12 dB (hoãn thoại) | — | — |
| `stingers` | Tù và, báo nguy, thắng, thua | 0,75 | −2 dB | — | — |
| `learning` | Âm của khung học | 0,80 | **không hạ** | — | — |

- Phát âm từ (sự kiện `game-kit:pronunciation` của kit speech) luôn thắng: mọi bus trừ `learning` hạ xuống trong 80 ms, lên lại trong 400 ms. Sau thoại lên lại trong 500 ms.
- Nhiều luật cùng lúc thì lấy mức hạ sâu nhất của mỗi bus. Không bus nào bị tắt hẳn.
- Cài đặt "tăng giọng" (1–3) của kit làm các bus hạ sâu hơn. Bus `learning` vẫn không hạ.
- Tạm dừng: nhạc và tiếng thế giới qua lọc thấp 800 Hz, hiệu ứng hạ 9 dB.
- Portal đang phát nhạc chung (`typing-game:shared-music`): nhạc game về 0.
- Vang: một ConvolverNode chung, tạo bằng mã (rừng thông 0,9 s).

## 3. Ưu tiên và giới hạn

| Mức | Gồm | Luật |
|---|---|---|
| P0 | Âm khung học (phát âm từ đi riêng qua kit speech) | Luôn phát, không bị cướp |
| P1 | Báo nguy: quái sắp đánh Rồng, báo đòn tướng, Hỏa Long dưới 35 %, tù và đợt, thắng, thua | Luôn phát, được vượt trần 4 tiếng; cắt tiếng P5 đang kêu và chặn P5 mới 0,35 s |
| P2 | Gõ phím, xong từ, UI | Không bị P3–P5 che |
| P3 | Kỹ năng Rồng, tướng địch xuất hiện, chết | Cướp được P4–P5 |
| P4 | Lửa, va chạm, nổ, bẫy, đòn quái, lính | Cướp được P5 |
| P5 | Gầm vặt lúc xuất hiện, lên đòn, chim | Bị cướp trước tiên |

- Trần tiếng cùng lúc: Low 16, Medium 24, High 32, Ultra 32. Hết chỗ thì cướp tiếng kém quan trọng hơn, chọn tiếng sắp hết nhất. Tiếng bị cướp mờ đi trong 25 ms.
- Cùng một tiếng: tối đa 4 lần trong 100 ms, và phải cách lần trước ít nhất "Cách" ở bảng dưới.
- Nhóm `blast` (nổ) và `death` (chết): mỗi nhóm tối đa 4 lần trong 120 ms.
- Nhóm `growl` (gầm): tối đa 2 tiếng cùng lúc, cách nhau 0,4 s.
- Đòn chữ trúng nhiều quái: tiếng đầu phát ngay, các đòn trong 45 ms sau chỉ cộng vào. Từ 3 đòn trở lên thêm một lớp `impact.multi`.
- Quái chết trong cùng một khung: mỗi lớp một tiếng, to theo √N, kèm một nốt `kill.chime`. Các lần hạ cách nhau dưới 1 s thì nốt đi lên theo thang ngũ cung.
- Bước chân không phát từng con. Mỗi lớp có một vòng lặp bầy, to theo số quái sống của lớp đó, đặt trái phải theo vị trí trung bình.
- Đặt trái phải theo camera: làn ráp gọi `setListener(x, z, yaw)`. Xa thì nhỏ đi tối đa 35 %.

## 4. Nhạc

- Một bản "rừng dân gian": Rê Dorian, 84 BPM, 8 ô nhịp lặp (Rêm, Đô, Sol, Rêm, Fa, Đô, Lam, Rêm).
- **Rừng** (lớp tĩnh, Chuẩn Bị và nghỉ đợt): pad mềm, đàn hạc gảy rải hợp âm, sáo gỗ hát câu hỏi và câu đáp.
- **Đợt** (lớp chiến): trống khung (bùm, vỗ, gõ nhẹ), cello ostinato theo nốt gốc. Độ dồn cao thì trống dày hơn.
- **Dồn** và **mô-típ tướng**: M0a chưa tổng hợp, chỉ phát khi có file.
- Đổi lớp luôn chờ đầu ô nhịp kế, rồi mờ trong 2 s. Mọi lớp cùng tempo, cùng giọng, cùng điểm đầu.
- Tiếng xong từ và nốt hạ quái dùng ngũ cung Fa trưởng (cùng nốt với ngũ cung Rê thứ), nên luôn hợp giọng nhạc.

| Lớp | Khi nào | Mức | Prompt cho file sau |
|---|---|---|---|
| `forest` | Mọi lúc trừ thắng, thua; 70 % khi đang đánh | 0,9 | `Seamless 8-bar loop, 84 BPM, D Dorian, misty hand-painted pine forest, soft string pad, gentle harp arpeggios, breathy wooden flute melody, calm and hopeful, no percussion, loopable` |
| `wave` | Trong đợt | 0,85 | `Seamless 8-bar loop, 84 BPM, D Dorian, same chords Dm C G Dm F C Am Dm, frame drum groove, low cello ostinato on roots and fifths, determined folk battle mood, no melody, loopable, layers over a calm forest track` |
| `surge` | Đợt cuối hoặc Hỏa Long dưới 35 % | 0,8 | `Seamless 8-bar loop, 84 BPM, D Dorian, big taiko-like drums, fast spiccato strings, urgent but not chaotic, layers over forest and battle stems` |
| `general` | Khi tướng địch còn sống | 0,7 | `Seamless 8-bar loop, 84 BPM, D minor, low brass horn motif over 8 bars, ominous moss-covered warlord marching, sparse, layers over battle stems` |

## 5. Danh sách âm

Cột: **Dài** (ms, bản tổng hợp), **Cách** (ms tối thiểu giữa hai lần), **Bus/P** (bus, mức ưu tiên). Prompt viết tiếng Anh vì công cụ tạo âm nhận tiếng Anh.

### 5.1 Gõ phím (bus `typing`, P2)

| Id | Khi phát | Dài | Cách | Cảm giác | Prompt |
|---|---|---|---|---|---|
| `type.key` | Mỗi phím đúng (khóa từ, gõ tiếp, cặp chữ đầu). Chuông nhỏ lên 1 bán cung mỗi chữ, tối đa 12 | 60 | 0 | Gõ gỗ khô, chuông nhỏ trong | `Single short wooden knock with a tiny bright bell, dry, very fast attack, under 60 ms, no reverb` |
| `type.miss` | Phím sai, phím lạc | 60 | 20 | "Tóc" đục, nhỏ, không còi | `Soft dull wooden thud, muted, short, gentle error tick, not a buzzer, under 60 ms` |
| `type.back` | Backspace | 45 | 20 | Tách nhẹ | `Tiny soft tick, light plastic-wood click, 40 ms` |
| `type.switch` | Đổi sang từ khác | 80 | 40 | Hai tiếng gõ nhanh | `Two quick light wooden taps, second slightly higher, 80 ms` |
| `type.word` | Xong một từ. Hoàn hảo thêm nốt năm; Chớp thêm nốt thứ ba lấp lánh | 320 | 40 | Cạch gọn rồi một nốt chuông hợp giọng nhạc | `Crisp wooden clack followed by a clear bell note, pentatonic, satisfying word-complete chime, 300 ms` |

### 5.2 Hỏa Long (bus `dragon`, trừ báo nguy ở `stingers`)

| Id | Khi phát | Dài | Cách | Bus/P | Cảm giác | Prompt |
|---|---|---|---|---|---|---|
| `fire.cast` | Xong từ có mục tiêu: Hỏa Long khạc cầu lửa | 340 | 45 | dragon/P4 | "Khà!" ngắn và tiếng phụt lửa trầm | `Dragon short throaty spit with a deep fireball whoomph launch, no laser hiss, 350 ms` |
| `fire.impact.a` | Cầu lửa trúng (biến thể 1) | 340 | 30 | dragon/P4 | Phụt lửa trầm, thân tròn | `Fireball impact, soft deep burst, low-passed flame whoomph, small crackle, 350 ms` |
| `fire.impact.b` | Cầu lửa trúng (biến thể 2) | 380 | 30 | dragon/P4 | Như trên, tối hơn, có lách tách | `Fireball impact variant, darker, flame puff with a few dry crackles, 380 ms` |
| `fire.impact.c` | Đòn to: bậc T3 trở lên, Hoàn hảo, Chớp | 520 | 30 | dragon/P4 | Bùng lửa lớn, trầm, cháy tiếp | `Big fire burst impact, heavy low thump, roaring flames and crackling embers, 500 ms` |
| `impact.multi` | Một đòn chữ trúng 3 quái trở lên trong 45 ms | 480 | 90 | dragon/P4 | Một tiếng nặng thêm lách tách nhiều chỗ | `Heavy layered fire impact hitting several targets, sub thump and scattered crackles, 500 ms` |
| `dragon.hurt` | Hỏa Long trúng đòn | 420 | 220 | dragon/P3 | Gầm đau ngắn, thịch trầm | `Large dragon short pained grunt with a heavy body thud, 400 ms` |
| `dragon.low` | Máu Hỏa Long vừa xuống dưới 35 % | 900 | 3000 | stingers/P1 | Hai nốt trầm báo nguy, không chói | `Low two-note warning horn, urgent but not shrill, with soft drum thumps, 900 ms` |
| `dragon.heartbeat` | Mỗi 1,4 s khi máu còn dưới 35 % | 420 | 900 | stingers/P1 | Nhịp tim trầm, nhẹ | `Soft low heartbeat, two beats, deep and muffled, 400 ms` |
| `dragon.down` | Thua: Hỏa Long kiệt sức | 1600 | 2000 | dragon/P1 | Gầm dài rơi xuống, lửa tắt | `Exhausted dragon long falling groan, fire dying out, heavy body settling, 1.6 s` |
| `dragon.breath` | Phun Lửa (Alt + 1) | 1650 | 500 | dragon/P3 | Hít vào rồi luồng lửa cuộn dài | `Dragon inhale then long rolling fire breath, deep whoosh, crackling, no hiss, 1.6 s` |
| `dragon.skyfire.cast` | Thiên Hỏa (Alt + 2): khối lửa rơi | 900 | 500 | dragon/P3 | Rít rơi từ cao xuống | `Falling fireball whistle from the sky, descending pitch, 900 ms` |
| `dragon.skyfire.impact` | Thiên Hỏa chạm đất; Viêm Đế nổ | 1400 | 200 | dragon/P3 | Nổ trầm lớn, lửa bùng | `Massive meteor-like fire explosion, deep sub boom, roaring flames, 1.4 s` |
| `dragon.roar` | Long Hống (Từ Khẩn) | 1300 | 600 | dragon/P3 | Gầm lớn, sóng gió đẩy ra | `Huge dragon roar with a pushing shockwave rumble, 1.3 s` |
| `dragon.rage` | Long Nộ đầy | 1000 | 1500 | dragon/P3 | Dâng lên rồi một tiếng gầm gọn | `Rising fiery power swell ending in a short dragon growl, 1 s` |
| `dragon.inferno` | Viêm Đế (tối thượng) | 1700 | 800 | dragon/P3 | Khạc lửa lớn, bùng cháy, hợp xướng trầm | `Dragon ultimate, giant fire spit and blaze, low choir pad swell, epic, 1.7 s` |
| `dragon.skill-ready` | Một kỹ năng hồi xong | 380 | 600 | dragon/P3 | Hai nốt đàn hạc | `Two-note harp pluck, ready cue, warm, 350 ms` |
| `dragon.level` | Hỏa Long lên cấp trong ải | 900 | 800 | dragon/P3 | Đàn hạc rải lên | `Ascending four-note harp arpeggio, D minor pentatonic, level-up, 900 ms` |
| `dragon.potion` | Dùng Bình Máu Nhỏ | 750 | 300 | dragon/P3 | Ực ực rồi lấp lánh hồi máu | `Three gulps of potion followed by a soft healing shimmer, 750 ms` |

### 5.3 Quái theo lớp (bus `enemies`)

Bốn lớp tổng hợp theo dáng: hai chân (E09 Yêu Rêu Lính, E11 Yêu Rêu Cung), bốn chân (E18 Sói Mục, E19 Heo Nanh Đá), bay (E01 Ong Gai), bầy (E25 Kiến Gai). Cao độ theo cỡ, lớp chất liệu theo họ (lá "xào", lông "thịch", vỏ "rắc"…). Khi có file, có thể tách thành 9 lớp `audioSet` của 05 §7.1.

| Id | Khi phát | Dài | Cách | P | Cảm giác | Prompt |
|---|---|---|---|---|---|---|
| `enemy.biped.spawn` | Quái hai chân xuất hiện | 380 | 120 | P5 | "Hự" gầm gừ | `Small moss goblin grunt, gruff short vocal, forest creature, 350 ms` |
| `enemy.biped.windup` | Lên đòn | 260 | 90 | P5 | Giáp lách cách | `Light bark-armor rattle, wooden plates clicking, 250 ms` |
| `enemy.biped.attack` | Chém cận chiến | 240 | 60 | P4 | Chém "xoẹt" | `Quick wooden blade slash whoosh, 250 ms` |
| `enemy.biped.shoot` | Bắn tên, gai (E11) | 300 | 70 | P4 | Dây bật, gai rít | `Small bow string twang and thorn arrow whistle, 300 ms` |
| `enemy.biped.hit` | Bị lính đánh trúng | 200 | 50 | P4 | Lá xào, thịch | `Leafy creature hit, dry leaves rustle with a soft thud, 200 ms` |
| `enemy.biped.death` | Chết (gộp theo khung) | 560 | 40 | P4 | Vỏ vỡ, đốm sáng "linh" | `Moss creature shell cracking into leaves, then a tiny rising spirit chime, 550 ms` |
| `enemy.biped.march` | Vòng lặp bước chân khi có quái hai chân | lặp 4 s | — | P5 | Bước nhẹ của cả đội | `Seamless loop of a small group of light footsteps on forest dirt, occasional bark-armor clink, 4 s` |
| `enemy.quadruped.spawn` | Thú bốn chân xuất hiện | 420 | 120 | P5 | Khịt rồi gầm | `Wolf-boar snort followed by a low growl, 400 ms` |
| `enemy.quadruped.windup` | Lên đòn, cào đất | 300 | 90 | P5 | Cào đất, gầm trầm | `Paw scraping dirt with a low growl, 300 ms` |
| `enemy.quadruped.attack` | Cắn (E18) | 220 | 60 | P4 | Cắn "phập" | `Fast animal bite snap, 200 ms` |
| `enemy.quadruped.charge` | Húc (E19) | 420 | 120 | P4 | Húc "huỵch" | `Heavy boar charge impact, body slam thud, dust, 400 ms` |
| `enemy.quadruped.howl` | Tru gọi bầy (dành sẵn cho kỹ năng E18) | 1100 | 1500 | P4 | Sói tru ngắn | `Short eerie wolf howl, rotten forest, 1 s` |
| `enemy.quadruped.hit` | Bị lính đánh trúng | 200 | 50 | P4 | Lông "thịch" | `Furry body hit, soft heavy thump, 200 ms` |
| `enemy.quadruped.death` | Chết | 600 | 40 | P4 | Ngã lăn, lông bay, đốm linh | `Beast collapse with fur puff, then a tiny spirit chime, 600 ms` |
| `enemy.quadruped.march` | Vòng lặp vó chạy | lặp 4 s | — | P5 | Vó lộp độp theo nhịp phi | `Seamless loop of several four-legged animals trotting on dirt, gallop triplets, 4 s` |
| `enemy.flyer.spawn` | Ong Gai xuất hiện | 360 | 120 | P5 | Kêu cao, vo ve | `Giant wasp high chitter and wing buzz swell, 350 ms` |
| `enemy.flyer.windup` | Chuẩn bị bổ nhào | 320 | 90 | P5 | Vo ve dâng lên | `Insect wing buzz rising in pitch, 300 ms` |
| `enemy.flyer.attack` | Bổ nhào, chích | 300 | 60 | P4 | Rít bổ nhào, chích "tách" | `Diving wasp whistle ending in a sharp sting click, 300 ms` |
| `enemy.flyer.hit` | Bị trúng | 180 | 50 | P4 | Vỏ "rắc" nhỏ | `Small chitin crack, insect shell hit, 180 ms` |
| `enemy.flyer.death` | Chết, rơi xoáy | 700 | 40 | P4 | Vỏ vỡ, rơi xoáy, đốm linh | `Wasp shell crack, falling spiral buzz dying out, tiny spirit chime, 700 ms` |
| `enemy.flyer.march` | Vòng lặp vo ve khi có quái bay | lặp 4 s | — | P5 | Tiếng cánh xa | `Seamless loop of distant insect wing buzz, several wasps, 4 s` |
| `enemy.swarm.spawn` | Cụm Kiến Gai xuất hiện | 300 | 150 | P5 | Lạo xạo nhanh | `Quick skittering of many tiny insect legs, 300 ms` |
| `enemy.swarm.attack` | Cắn nhỏ | 140 | 70 | P4 | "Tách" nhỏ | `Tiny insect bite click, 140 ms` |
| `enemy.swarm.hit` | Bị trúng | 140 | 50 | P4 | Vỏ "rắc" li ti | `Tiny chitin tick, 140 ms` |
| `enemy.swarm.death` | Chết (cả cụm gộp lại) | 380 | 40 | P4 | Bụp nhỏ, vỏ vỡ | `Small insect pop and shell crunch, tiny spirit glint, 380 ms` |
| `enemy.swarm.march` | Vòng lặp lạo xạo khi có bầy | lặp 4 s | — | P5 | Chân kiến lạo xạo dày | `Seamless loop of dense ant swarm skittering on leaves, 4 s` |
| `kill.chime` | Mỗi khung có quái chết; hạ liên tiếp trong 1 s thì lên nốt | 220 | 45 | P4 | Nốt ngũ cung ngắn | `Short soft pentatonic marimba-bell note, 200 ms, render 13 pitches F4 major pentatonic upward` |

### 5.4 Báo nguy (bus `stingers`, P1)

| Id | Khi phát | Dài | Cách | Cảm giác | Prompt |
|---|---|---|---|---|---|
| `warn.strike` | Quái lên đòn nhắm Hỏa Long hoặc Bạch Long | 260 | 800 | Hai tiếng mõ cao rõ, không chói | `Two clear high woodblock knocks, alert cue, not harsh, 250 ms` |
| `warn.telegraph` | Tướng địch (sau này boss) báo đòn; bật luật hạ "báo đòn" trong suốt thời gian báo | 700 | 600 | Rít dâng lên | `Rising tense filtered whoosh, magic warning swell, 700 ms` |

### 5.5 Tướng G01 Yêu Rêu Cầm Cờ (bus `enemies`)

| Id | Khi phát | Dài | Cách | P | Cảm giác | Prompt |
|---|---|---|---|---|---|---|
| `general.g01.horn` | G01 xuất hiện | 2200 | 3000 | P3 | Tù và trận trầm, mở dần | `Low war horn blast, wooden and mossy, swelling then fading, ominous, 2.2 s` |
| `general.g01.attack` | G01 chém | 380 | 200 | P4 | Chém nặng | `Heavy wooden polearm slash with a body thump, 400 ms` |
| `general.g01.skill` | Cắm Cờ: hô lệnh, cờ cắm xuống đất, trống | 1100 | 1000 | P3 | Hô có vang, thịch, trống trận | `Goblin captain shout, banner pole slammed into earth, one war drum hit, 1.1 s` |
| `general.g01.aura` | Hào quang Xung Phong áp lên quân | 420 | 1500 | P4 | Hai tiếng trống trận | `Two war drum hits, deep frame drum, 400 ms` |
| `general.g01.death` | G01 chết | 1800 | 1000 | P3 | Ngã nặng, tù và tắt, đốm sáng lớn | `Large creature collapse, dying war horn, big rising spirit chime, 1.8 s` |
| `general.aura.break` | Hào quang tắt (Ấn Phá) | 700 | 400 | P3 | "Vỡ kính" | `Magical glass shatter, bright tinkling shards, 700 ms` |

### 5.6 Bẫy (bus `traps`, P4)

| Id | Khi phát | Dài | Cách | Cảm giác | Prompt |
|---|---|---|---|---|---|
| `trap.spikes.arm` | Đặt Gai Chông | 380 | 120 | Cạch gỗ, lò xo | `Wooden trap clack with a small spring boing, 400 ms` |
| `trap.spikes.trigger` | Gai Chông đâm | 260 | 70 | Gai trồi "xoẹt" | `Sharp wooden spikes thrusting up from the ground, quick stab, 250 ms` |
| `trap.pine-bomb.arm` | Đặt Bom Hạt Thông | 520 | 120 | Nhựa kẽo kẹt, quả thông thở | `Pine cone resin creak and soft breathing hiss, 500 ms` |
| `trap.pine-bomb.trigger` | Bom Hạt Thông nổ (số quái trúng làm tiếng to hơn) | 1100 | 60 | Nổ trầm, hạt văng | `Pine cone bomb explosion, deep boom, seeds and splinters scattering, 1.1 s` |
| `trap.net.arm` | Đặt Lưới Phóng | 560 | 120 | Cuộn dây lạch cạch | `Rope winch ratchet clicks and a wooden creak, 550 ms` |
| `trap.net.trigger` | Lưới Phóng bắn, kéo quái bay xuống | 620 | 80 | Phụt, vút, quấn | `Net launcher thump, net whoosh through the air, rope wrapping, 600 ms` |

### 5.7 Hỗ trợ (bus `units`, P4)

| Id | Khi phát | Dài | Cách | Cảm giác | Prompt |
|---|---|---|---|---|---|
| `unit.warden.place` | Đặt Vệ Binh Rêu; lính hồi sinh (nhỏ hơn) | 620 | 150 | Đá gỗ đặt xuống, lá rung | `Moss stone guardian landing, heavy wood-stone thud, leaves rustling, low hum, 600 ms` |
| `unit.warden.down` | Vệ Binh Rêu ngã thành nụ cây | 900 | 200 | Vỡ vụn, một nốt nhỏ | `Moss guardian crumbling into soil, soft collapse, ending with a tiny sprout pluck, 900 ms` |
| `house.herb.place` | Dựng Nhà Thuốc Lá | 700 | 150 | Gỗ, bọt sủi, chuông nhỏ | `Small herbal hut placed, wood knock, bubbling potion, tiny chime, 700 ms` |
| `house.herb.pulse` | Nhà Thuốc Lá hồi máu (Xung) | 900 | 300 | Lấp lánh hồi máu | `Gentle healing shimmer, soft major chord of bells, airy, 900 ms` |
| `unit.hit` | Lính hoặc nhà bị đánh | 180 | 120 | Khiên gỗ "cộp" | `Wooden shield block knock, 180 ms` |

### 5.8 UI (bus `ui`, P2)

| Id | Khi phát | Dài | Cách | Cảm giác | Prompt |
|---|---|---|---|---|---|
| `ui.select` | Chọn ô, rê qua món (làn UI gọi `audio.ui("select")`) | 70 | 40 | Tích nhẹ | `Tiny soft UI tick, wooden, 60 ms` |
| `ui.confirm` | Mua, nâng cấp | 260 | 80 | Hai nốt đàn hạc lên | `Two rising harp plucks, confirm, warm, 250 ms` |
| `ui.deny` | Lệnh bị từ chối (thiếu vàng, sai ô) | 220 | 250 | Hai tiếng trầm êm | `Two soft low wooden bonks, gentle decline, 220 ms` |
| `ui.gold` | Bán, thưởng cuối đợt | 380 | 120 | Đồng xu lanh canh | `Small coins clinking, bright, 350 ms` |

### 5.9 Mốc trận (bus `stingers`)

| Id | Khi phát | Dài | Cách | P | Cảm giác | Prompt |
|---|---|---|---|---|---|---|
| `wave.horn` | Báo đợt (pha `warning`), hoặc đầu đợt nếu chưa có báo | 2200 | 6000 | P1 | Tù và rừng trầm, một tiếng trống | `Deep forest war horn call, two horns a fifth apart, one frame drum hit, 2.2 s` |
| `wave.clear` | Hết đợt | 1300 | 3000 | P3 | Đàn hạc lướt lên | `Harp glissando upward, D minor pentatonic, relief, 1.3 s` |
| `stinger.victory` | Thắng ải | 3600 | 10000 | P1 | Sáo gỗ reo, trống, hợp âm đàn hạc | `Short folk victory fanfare, wooden flute rising D-F-A-D, frame drums, harp chord, 3.5 s` |
| `stinger.defeat` | Thua ải | 3600 | 10000 | P1 | Sáo đi xuống, pad trầm | `Short sad folk ending, descending wooden flute, low drum, dark pad, 3.5 s` |

### 5.10 Học (bus `learning`, P0, không bao giờ bị hạ)

| Id | Khi phát | Dài | Cách | Cảm giác | Prompt |
|---|---|---|---|---|---|
| `learn.new` | Hạ một từ mới lần đầu (sự kiện có điểm, 00 D14) | 700 | 250 | Chuông đôi dịu | `Soft two-note glass bell, C and G, gentle discovery, 700 ms` |
| `learn.right` | Thẻ Ôn đúng, Học trước đúng | 420 | 150 | Hai nốt gảy sáng | `Two bright plucked notes, correct answer, soft, 400 ms` |
| `learn.wrong` | Thẻ Ôn sai (làn học gọi `audio.learning("wrong")`) | 380 | 150 | "Hừm" trầm nhẹ, không còi | `Gentle low falling note, soft "not quite" cue, not a buzzer, 350 ms` |

### 5.11 Nền (bus `ambience`, P5)

| Id | Khi phát | Dài | Cách | Cảm giác | Prompt |
|---|---|---|---|---|---|
| `amb.forest` | Luôn chạy; nhỏ lại trong đợt | lặp 6 s | — | Gió qua rừng thông, có cơn | `Seamless loop, wind through a misty pine forest, soft gusts, no birds, 6 s` |
| `amb.river` | Luôn chạy (bản đồ có suối) | lặp 5 s | — | Suối chảy nhẹ, bọt nước | `Seamless loop, gentle forest stream babbling, small bubbles, 5 s` |
| `amb.bird` | Mỗi 4–11 s khi chuẩn bị và nghỉ đợt | 700 | 2500 | Chim hót ngắn | `Short songbird chirp, three quick notes, distant forest, 700 ms` |

## 6. Việc còn lại

- M0c: thay bản tổng hợp bằng file cho các tiếng nghe nhiều nhất trước: `fire.cast`, ba `fire.impact.*`, `type.key`, `wave.horn`, `general.g01.horn`, bốn vòng lặp bầy, hai nền.
- Tách 4 lớp quái thành 9 lớp `audioSet` (05 §7.1) khi có file.
- Nhạc: render 4 stem bằng `scripts/music/render-songs.mjs`; thêm bản boss khi có boss.
- Thoại Bạch Long (M1) đi bus `voice`; làn thoại gọi `audio.setDialogue(true/false)`.
