# Tài liệu Rồng Giữ Ải

Tài liệu thiết kế đầy đủ nằm ở repo cha, thư mục `docs/games/dragon-lane/`
(từ gốc repo này: `../../docs/games/dragon-lane`). Thư mục giữ tên cũ
`dragon-lane` tới mốc M1, khi tài liệu chuyển vào `docs/design/` của repo này.

| File | Nội dung |
|---|---|
| `DESIGN.md` | Bản tổng, kế hoạch xây theo mốc (§9: M0, M0a, M0b, M0c) |
| `00-canon.md` | Nguồn duy nhất cho số, công thức, bảng phím, cổng bot. Khi lệch, file này thắng |
| `01-core-combat-learning.md` | Vòng ải, hai Rồng, gõ trên quái, chấm từ, học |
| `02-enemies-generals-bosses.md` | Quái, tướng địch, boss, bộ sinh đợt |
| `03-our-side-shop-traps-support.md` | Bẫy, nhà phép, lính chặn, cửa hàng, Vàng |
| `04-stages-maps-progression.md` | Ải, bản đồ, lịch dạy, tiến trình |
| `05-presentation-audio-tech-split.md` | Hình, camera, HUD, VFX, âm, kỹ thuật, kịch bản kiểm |
| `06-other-systems.md` | Lưu, focus, cài đặt, màn ngoài trận |
| `../SPLIT_PLAN.md` | Tách ba game, kit chung, portal |

Trong repo này:

- `AGENTS.md`: luật cho agent, lệnh chạy.
- `LANES.md`: làn, file mỗi làn giữ, hợp đồng giữa các hệ, danh sách sự kiện.
- `src/content/rules.ts`: số của luật, mỗi số trỏ về mục trong `00-canon.md`.
- `docs/changelog/`: mỗi lần cập nhật một file `<ngày>-<chủ đề>.md`.
