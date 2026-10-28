# 28/10/2026 · VFX bước 2: Sky Fire đủ năm pha trong 48 khung của sim

Làn V-dh, nhánh `dh-vfx` trong `games/.wt-dh-vfx`. Chuẩn: `docs/games/VFX_STANDARD.md` §5.3 phần 2, §3.3 dòng "Chiêu" (T3), §5.6. Máy và luật làn như bước 1a vòng 3 (`2026-10-28-vfx-word-attack-round3.md`): Vite `127.0.0.1:4141 --strictPort`, mọi lệnh nặng qua `.local/bin/heavy.sh`.

**Sim không đổi.** Sky Fire vẫn trúng ở khung 48 sau lúc dùng chiêu (`HERO_SKILLS.skyfire.delayMs` 800), bán kính 4 m, choáng như cũ. VFX chia 48 khung đó cho các pha. Không sửa `src/sim`, `src/content`, `src/typing`, `tests/sim`, `src/kit`; golden giữ nguyên.

**Nguồn:** phiên trước đã viết phần lớn mã (chưa commit, chưa chụp lần nào): `view/skyfire.ts`, các lớp dùng lại `view/vfx-layers.ts`, bảng màu `view/fx-palette.ts`, phần nối trong `fx.ts` và `heroes.ts`, kịch bản `dh-vfx-skyfire.mjs`. Lượt này commit nguyên trạng thành `b141b24` (WIP), rồi chụp lần đầu, sửa những gì khung ảnh cho thấy, và đo.

## 1. Tóm tắt

KẾT_QUẢ

## 2. Năm pha (f0 = lúc dùng chiêu, 60 Hz)

| Pha | Khung | Lớp (file `src/view/`) |
|---|---|---|
| A gồng | f0–f11 | Vòng rune quay dưới chân Rồng trên bệ (L13, texture `runes` của kit, `RuneCircle`); 12 đốm than bay vào miệng thành tia kéo dài (L8, `StreakSparks`), một phần bay lên từ vòng rune; ở miệng một khối lửa có viền đỏ thẫm (`PUFF_FIRE`) lớn dần, quầng ember thấp và lõi nóng HDR 1 → 3 (L9); đèn miệng tăng dần tới 35 % đỉnh lúc tung (L14); clip Cast và thân phát sáng là của `heroes.ts`; báo trước phe ta ở đích có sẵn (`telegraphs.ts`) |
| R tung | f12 (2 khung đủ sáng, rồi tắt dần) | Khối lửa `PUFF_FIRE` 3,6 m × k ở miệng, lõi trắng nhỏ 1,1 m × k, lóe vàng thấp (L10); nón lửa ngắn hướng theo đường bay, mép bị nhiễu xé (L13, `ShellPool` "cone", 10 khung); 14 tia kéo dài theo hướng phóng; khói xám từ khung 3; vòng bụi và vòng lửa chạy ra từ dưới bệ (L12); đèn 6 khung (L14); camera giật 3 px theo hướng phóng và FOV +1° trong 8 khung (L15, `fx.ts` `fovPush`, chỉ khi không giảm chuyển động); đầu Rồng giật lên (L18, `heroes.ts` `SKYFIRE_KICK`) |
| T bay | f12–f47 | Một cung bezier bậc hai từ miệng tới đích, điểm điều khiển trên trung điểm, lệch về phía camera; khối lửa `PUFF_FIRE` 2,5 m × k với lõi HDR (L9); ribbon lửa thon 1,6 m × k dọc cung (L1); ribbon khói tối mảnh đi sau (L4); than rơi, tia kéo dài rụng về sau (L8); bóng lớn dần ở đích |
| I trúng | f48–f62 | Khối nổ `PUFF_FIRE` 5,8 m × √k, lõi trắng 2,0 m × √k (L10), lõi nở 6 khung; vòm sóng bán cầu 0 → 4 m trong 12 khung, viền nóng bị ăn mòn (L2, `ShellPool` "dome"); vòng bụi phẳng 16 khung (L12); 12 viên đá, 3 viên lơ lửng 0,3 s rồi rơi (L3); 7 mảnh than phát sáng nguội dần (L5); 56 tia lửa kéo dài (L8); đèn 12 khung (L14); dừng hình T3 35 ms và trauma (L16, L15); quái lóe và giật (L17, phản ứng của `crowd`) |
| F dư âm | f63 → 7 s | Vết nứt bám địa hình, khe đỏ nguội trong 1,5 s rồi thành vết cháy tối, tắt ở giây 7 (L6, mặt nạ Voronoi sinh bằng mã, không trên mặt nước); 4 đám muội và 3 đám khói xám 1,4–1,9 s (L4); than bay lên 1,6 s (L8); sao choáng; đá nằm lại 6 s |

**Không làm:** vòng méo không khí (L7). Chuẩn chỉ bật nó ở Ultra lúc đầu, ở High chỉ khi số đo cho phép; lượt này không dựng, để giữ ngân sách High (mục 4).

## 3. Lỗi tìm thấy khi chụp lần đầu, đã sửa

SỬA

## 4. Số đo (§5.6)

SỐ_ĐO

## 5. Hiệu năng

HIỆU_NĂNG

## 6. Tờ khung và clip

TỜ_KHUNG

## 7. Bản giảm chuyển động (§3.8)

- Tắt: camera giật, đẩy FOV, đá lơ lửng (đá vẫn rơi).
- Làm dịu: lóe ×0,6 về độ sáng và ×0,8 về cỡ; số hạt và tia ×0,6; vòm, nón và khói ×0,6 độ đục; đèn ×0,8.
- Giữ: báo trước, vòm và vòng cho biết vùng trúng 4 m, vết nứt, sao choáng.

## 8. Còn mở

CÒN_MỞ
