# پیشنهاد برای آپدیت بعدی — Suggestions for the next update

پیشنهادها بر اساس بررسی کد فعلی نوشته شده‌اند، نه حدس. هر مورد با دلیل و
تخمین کار آمده است.

*These suggestions come from reading the current code, not from guessing. Each
one carries a reason and a rough cost.*

---

## اول: کارهای ناتمام این دور — Finish what is already open

این موارد از لیست ۱۵تایی هنوز باقی مانده‌اند و باید قبل از هر چیز جدیدی
تمام شوند:

Items still open from the current round, which should close before anything new:

| # | مورد | وضعیت |
|---|------|--------|
| 1 | App Scale (۷۵/۹۰/۱۰۰/۱۱۰/۱۲۵) | انجام نشده |
| 11 | انیمیشن رنگی شدن بلوک‌های تکنولوژی در About | انجام نشده |
| 12 | لوگوی جدید از تصویر Family | انجام نشده |
| 13 | آیکون برنامه (متفاوت از لوگو) | انجام نشده |
| 14 | ایمیل توسعه‌دهنده + باز شدن Outlook | انجام نشده |
| — | `TypographySettings.jsx` هنوز دو `<select>` خام دارد (تکمیل مورد ۶) | انجام نشده |
| — | آیتم‌های ۴ و ۵ در مرورگر تست نشده‌اند | نیاز به تأیید |

---

## ۱. صفحه‌ی گزارش‌ها و Audit — the data you already collect but never show

**این مهم‌ترین پیشنهاد من است.**

برنامه هم‌اکنون این‌ها را در دیتابیس می‌نویسد:

- `audit_logs` — هر LOGIN، LOGOUT، تغییر حساب و … با کاربر، عمل، هدف و زمان.
  حتی هندلر IPC آن (`audit:list`) هم ساخته شده است.
- `uptime_logs` — درصد آپتایم روزانه‌ی هر دستگاه، تعداد کل بررسی‌ها و
  تعداد موفق‌ها.
- `ping_history` — تا ۱۰۰۰ رکورد آخر پینگ برای هر دستگاه.

اما **هیچ صفحه‌ای در برنامه هیچ‌کدام از این‌ها را نشان نمی‌دهد.**
`uptime_logs` حتی یک‌بار هم `SELECT` نمی‌شود — فقط نوشته می‌شود.

The app already writes audit logs, daily uptime and ping history to the
database, and `audit:list` is even wired over IPC — but **no page displays any
of it**, and `uptime_logs` is never read back at all. The data is being
collected and thrown away.

یعنی ارزشمندترین چیزی که برنامه دارد — تاریخچه — پشت شیشه مانده. یک صفحه‌ی
Reports می‌تواند بدون جمع‌آوری هیچ داده‌ی جدیدی این‌ها را بدهد:

- آپتایم هر شعبه و هر دستگاه در ۷ / ۳۰ / ۹۰ روز گذشته
- بدترین دستگاه‌ها بر اساس آپتایم (کدام سوییچ مدام قطع می‌شود)
- نمودار زمانی پینگ برای عیب‌یابی («از سه‌شنبه کند شده»)
- گزارش Audit برای اینکه چه کسی چه چیزی را تغییر داده
- خروجی Excel از همین گزارش‌ها (کتابخانه‌ی `exceljs` از قبل نصب است)

**چرا اول این:** داده‌اش موجود است، `recharts` و `exceljs` از قبل در پروژه
هستند، و برای یک مدیر IT این تبدیل «ابزار نمایش لحظه‌ای» به «ابزار تصمیم‌گیری»
است. تخمین: متوسط.

---

## ۲. هشدار واقعی هنگام قطعی — alerting

الان اگر سوییچ یک شعبه ساعت ۲ بامداد قطع شود، تا وقتی کسی برنامه را باز
نکند هیچ‌کس نمی‌فهمد. پیشنهاد:

- اعلان ویندوز (native notification) هنگام تغییر وضعیت دستگاه
- ایمیل یا وبهوک برای دستگاه‌های حیاتی
- تعریف «دستگاه حیاتی» تا فقط برای چیزهای مهم هشدار بیاید
- خاموش کردن هشدار در بازه‌ی زمانی مشخص (تعطیلات، پنجره‌ی تعمیرات)

Right now nobody learns about a 2 a.m. outage until someone opens the app.
Windows notifications plus optional email/webhook for devices marked critical
would make this a monitoring tool rather than a dashboard.

تخمین: متوسط. `PingMonitor` از قبل تغییر وضعیت را می‌فهمد؛ فقط مقصد اعلان
لازم است.

---

## ۳. پشتیبان‌گیری از دیتابیس — backup and restore

کل اطلاعات شعبه‌ها، دستگاه‌ها، پسوردها و نُت‌ها در یک فایل SQLite روی یک
کامپیوتر است. اگر آن دیسک بسوزد، همه‌چیز رفته.

- پشتیبان‌گیری خودکار زمان‌بندی‌شده در مسیر دلخواه
- بازیابی از فایل پشتیبان
- تعداد نسخه‌های نگه‌داشته‌شده قابل تنظیم

Everything — branches, devices, credentials, notes — lives in one SQLite file
on one machine. There is currently no backup path. This is low effort and
high consequence.

تخمین: کم. `better-sqlite3` تابع `backup()` دارد.

---

## ۴. جست‌وجوی سراسری قوی‌تر + میان‌برها

`GlobalSearch` الان فقط دستگاه‌ها را می‌گیرد. می‌تواند نُت‌ها، شعبه‌ها،
اسنیپت‌ها و صفحات را هم بگیرد — و یک Command Palette کامل شود.

تخمین: کم.

---

## ۵. سلامت پسوردها — credential hygiene

چون برنامه پسوردها را نگه می‌دارد، می‌تواند بگوید کدام‌ها سال‌هاست عوض
نشده‌اند، کدام‌ها بین چند دستگاه مشترک‌اند، و کدام دستگاه اصلاً پسورد
تعریف‌شده ندارد. یک هشدار ساده‌ی «۹۰ روز گذشته» برای یک تیم IT ارزش دارد.

تخمین: کم تا متوسط.

---

## ۶. بدهی فنی که ارزش پرداخت دارد — technical debt worth clearing

- **`VPNButton.jsx` با `FORTICLIENT_PENDING` هماهنگ نیست.** سرویس این کد خطا
  را پرتاب می‌کند ولی دکمه حالت مخصوصی برایش ندارد؛ کاربر پیام مبهم می‌بیند.
- **نصب‌کننده امضا ندارد** و SmartScreen اخطار می‌دهد. یک گواهی
  code-signing این را حل می‌کند و برای برنامه‌ای که در چند شعبه نصب می‌شود
  ارزشش را دارد.
- **تست‌های Playwright در CI اجرا نمی‌شوند** — فقط دستی. اگر به CI اضافه
  شوند، باگ «بعد از حذف نمی‌شود تایپ کرد» هرگز بی‌سروصدا برنمی‌گردد.

---

## ترتیب پیشنهادی — suggested order

۱. تمام کردن موارد باقی‌مانده‌ی این دور (۱، ۱۱، ۱۲، ۱۳، ۱۴)
۲. پشتیبان‌گیری — کم‌هزینه، جلوی فاجعه را می‌گیرد
۳. صفحه‌ی گزارش‌ها و Audit — بیشترین ارزش افزوده
۴. هشدارها
۵. بقیه

Finish the open items first, then backup (cheap insurance), then Reports (the
biggest gain), then alerting.
