# Đổi tên danh từ sang tiếng Anh · Phiếu 051

Ngày 28/10/2026 · Worktree `games/.wt-dh-names`, nhánh `dh-names`, từ `e91c155`.

Đổi literal hiển thị theo `docs/games/NAMES_EN.md` của repo cha: 6 loài quái, Moss Bannerman, 8 món phe ta, Gold, Dragon Rage, Dragon Platform, Banner, Sky Fire, Dragon Roar; thêm Fire Breath và Inferno theo quyết định của Claude. Giữ tên riêng Hỏa Long, Bạch Long, Draconis, các nhãn cơ chế, chỉ số, mức Dễ và thẻ tốc độ bằng tiếng Việt.

Thêm nghĩa Việt trong ngoặc vào 7 mô tả thẻ ra mắt và 8 mô tả món đồ đang có. Câu gợi ý thua đổi tối thiểu thành “để Hỏa Long dùng Fire Breath hạ chúng”. Đồng bộ nhãn trong script báo cáo cân bằng và các assert được phép ở `tests/ui/{placement,shop-strip}.test.ts`; không sửa logic test.

**Hai mục còn lại (Claude chốt, 28/10):** thẻ đợt hiện tên tiếng Anh đầy đủ của loài quái (`shortFoeName` trả `nameVi`, tướng vẫn là nhãn lớp “Tướng”); thêm assert ở `tests/ui/wave-card.test.ts`. Assert `tests/ui/hud.test.ts:73` thành “Chưa đủ Gold”.

Kiểm của Codex lúc bàn giao: `pnpm check` exit 1 (452/453), chỉ vì assert HUD nêu trên. Sau hai mục: `pnpm check` đạt, 453/453 test, 51/51 file, build đạt. Cả 10 test golden đạt; SHA-256 `tests/golden/m0.json` và `golden.test.ts` giữ nguyên; 1.438 id/khóa object trong `src/content/**` không đổi. Không cập nhật golden.

Không đụng cây chính, làn VFX, assets hay từ phải gõ. Báo cáo đầy đủ: `docs/codex-queue/051-report.md` trong repo cha. Claude kiểm trình duyệt trước commit (mục dưới).

## Kiểm trình duyệt (Claude, 28/10)

Vite riêng 127.0.0.1:4160. `ui-preview.mjs` (22 màn, 1280 × 720 và 1920 × 1080) và một lượt chơi thật tới đợt 7 ở cả hai cỡ: 7 thẻ ra mắt (Moss Grunt, Thorn Ant, Thorn Wasp, Moss Archer, Tusk Boar, Moss Bannerman, Blight Wolf), thẻ đợt mỗi lần nghỉ, HUD, khay mua, menu ô, sửa món, màn thắng/thua. Một phép đo trong trang tìm chữ ra ngoài khung.

- Lỗi duy nhất do tên dài: ở 720p chữ “Launcher” (52 px ở mức sàn 11 px) tràn ô 46 px của khay mua, hiện “Net Launche”; “Warden” chạm mép. Sửa: `.dh-cell` và `.dh-cell__text` lấy `min-width: min-content`, ô nào chữ dài thì tự rộng ra (Net Launcher 59 px, Grove Warden 50 px, Dragon Heart 48 px); khay rộng thêm 18 px (trái 858 → 840), vẫn cách thanh “Sửa món” và khung học. 1080p và khay gọn trong đợt không đổi (so điểm ảnh khay gọn: 0 khác).
- Thẻ ra mắt, thẻ đợt (tên đầy đủ, “Tướng ×1”, “Gọi sớm +38 Gold · +5 Dragon Rage”), “Dragon Platform thất thủ”, “DRAGON RAGE”: vừa khung ở cả hai cỡ. `ui-preview.mjs` không báo chồng lấn.
- Còn lại, không thuộc đổi tên: “×1,16” của Chuỗi lố khung trên 2–3 px ở 720p (có từ trước).
