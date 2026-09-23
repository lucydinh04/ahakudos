# UPDATE_V28_56

## Cập nhật
- Birthday homepage đọc trực tiếp từ Master Data (`dateOfBirth`) và hiển thị tối đa 3 sinh nhật gần nhất trong 30 ngày.
- Journey strip:
  - 0 KUDOS đã gửi: có CTA **Gửi KUDOS ngay →**.
  - đúng 1 KUDOS đã gửi: hiển thị icon quà 🎁 thay cho số 1 + thông điệp chúc mừng/quà cột mốc.
  - >1 KUDOS đã gửi: trở về hiển thị số lượng **KUDOS bạn đã gửi**.
- Thêm floating mascot CTA ở góc phải → dẫn thẳng đến trang Gửi KUDOS.
- Nội dung Mục tiêu / Nguồn KUDOS được căn giữa và phân bổ đều trong block, không thay đổi kích thước khung ngoài.
- Progress chỉ hiển thị `1/4`, `2/4`, `3/4`, `4/4` (bỏ chữ “chặng”).
- Lời chào dùng `tenureDays` từ Master Data; có fallback tính từ các field ngày bắt đầu nếu backend cung cấp.
