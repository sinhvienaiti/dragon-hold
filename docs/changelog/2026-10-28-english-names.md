# Đổi tên danh từ sang tiếng Anh · Phiếu 051

Ngày 28/10/2026 · Worktree `games/.wt-dh-names`, nhánh `dh-names`, từ `e91c155`.

Đổi literal hiển thị theo `docs/games/NAMES_EN.md` của repo cha: 6 loài quái, Moss Bannerman, 8 món phe ta, Gold, Dragon Rage, Dragon Platform, Banner, Sky Fire, Dragon Roar; thêm Fire Breath và Inferno theo quyết định của Claude. Giữ tên riêng Hỏa Long, Bạch Long, Draconis, các nhãn cơ chế, chỉ số, mức Dễ và thẻ tốc độ bằng tiếng Việt.

Thêm nghĩa Việt trong ngoặc vào 7 mô tả thẻ ra mắt và 8 mô tả món đồ đang có. Câu gợi ý thua đổi tối thiểu thành “để Hỏa Long dùng Fire Breath hạ chúng”. Đồng bộ nhãn trong script báo cáo cân bằng và các assert được phép ở `tests/ui/{placement,shop-strip}.test.ts`; không sửa logic test.

**Hai mục còn lại (Claude chốt, 28/10):** thẻ đợt hiện tên tiếng Anh đầy đủ của loài quái (`shortFoeName` trả `nameVi`, tướng vẫn là nhãn lớp “Tướng”); thêm assert ở `tests/ui/wave-card.test.ts`. Assert `tests/ui/hud.test.ts:73` thành “Chưa đủ Gold”.

Kiểm của Codex lúc bàn giao: `pnpm check` exit 1 (452/453), chỉ vì assert HUD nêu trên. Sau hai mục: `pnpm check` đạt, 453/453 test, 51/51 file, build đạt. Cả 10 test golden đạt; SHA-256 `tests/golden/m0.json` và `golden.test.ts` giữ nguyên; 1.438 id/khóa object trong `src/content/**` không đổi. Không cập nhật golden.

Không đụng cây chính, làn VFX, assets hay từ phải gõ. Báo cáo đầy đủ: `docs/codex-queue/051-report.md` trong repo cha. Claude kiểm trình duyệt trước commit (mục dưới).
