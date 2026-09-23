# UPDATE V28.44 — Home UI Relayout

## Mục tiêu
Sắp xếp lại Trang chủ KUDOS theo layout gần với mockup đã duyệt, nhưng vẫn giữ các khối chức năng gốc của hệ thống.

## Đã thay đổi
- Giữ nguyên hero + khối dữ liệu cá nhân + card hành động / sinh nhật ở phần đầu.
- Thêm cụm điều hướng nhanh dạng chip:
  - AhaKudos là gì?
  - Mục tiêu
  - Đối tượng
  - Nguồn KUDOS
  - Cách gửi KUDOS
- Re-layout toàn bộ phần content handbook thành các section mới:
  1. AhaKudos là gì?
  2. Mục tiêu
  3. Đối tượng
  4. Bạn có thể nhận KUDOS từ đâu?
  5. Gửi một KUDOS như thế nào?
  6. CTA cuối trang
- Tăng tính visual của từng section bằng card lớn, icon block, grid rõ ràng và CTA cuối trang.
- Responsive cho tablet/mobile.

## Ghi chú
- Không thay đổi logic dữ liệu.
- Không đụng Apps Script / bridge.
- Chỉ thay đổi UI trên `private/workspace.html`.
