# UPDATE V28.61 — List Content + Live DATA Master

## UI
- Mục tiêu: chuyển các nội dung con về dạng **list-down**, bỏ frame/card nền riêng từng ý.
- Nguồn KUDOS: chuyển về dạng **list-down** với icon nhỏ bên trái, bỏ frame/card con.
- Giảm khoảng cách giữa icon section và phần nội dung để loại bỏ khoảng trắng dư.
- Giữ nguyên outer cards / kích thước block lớn.
- Thêm fallback user an toàn khi DATA chỉ có 1 nhân sự, tránh lỗi do email mẫu cũ không còn trong master.

## Master Data
- Google Sheet source of truth: **AhaKudos V28 — Vercel Test**.
- Tab **DATA** trở thành Master Data chính.
- Mapping: Work Email, Full Name, Department, Section, Onboard Day, Tenure (Days), Employee ID, Location, Job Title, Level.
- Hỗ trợ birthday nếu DATA được bổ sung cột `Date of Birth` / `DOB` / `Birthday` / `DATE_OF_BIRTH`.
- Hiện DATA chưa có cột ngày sinh, nên birthday suggestion chưa thể lấy dữ liệu thật từ sheet.
