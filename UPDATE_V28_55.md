# UPDATE V28.55 — Connection / Deploy Fix

## Root cause
Bản V28.54 có khai báo `const sentCount` **hai lần** trong cùng hàm `employeeHome()`.
Điều này tạo JavaScript `SyntaxError` ngay khi browser parse trang, nên app dừng trước khi gọi `/api/bridge` và chỉ hiển thị mãi:

> Đang kết nối Google Sheets…

## Đã sửa
- Xóa khai báo `sentCount` bị trùng.
- Giữ nguyên toàn bộ UI và logic từ bản mới nhất, bao gồm logic block hành trình KUDOS V28.54.
- Thêm kiểm tra cú pháp JavaScript client trực tiếp vào `npm run build`.
- Build bây giờ parse toàn bộ 4 inline `<script>` trong `workspace.html`; nếu có SyntaxError, Vercel build sẽ fail thay vì deploy một bản trắng/loading.
- Kiểm tra syntax riêng cho `api/page.js`, `api/auth.js`, `api/bridge.js`, `lib/security.js`.

## Test đã chạy
- `npm run build` → PASS
- 4 inline scripts → PASS
- API/server JS syntax → PASS
