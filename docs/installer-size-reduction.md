# کاهش حجم فایل نصب (HyperFamily Branch Monitor)

بررسی کامل کد + بیلد آزمایشی واقعی روی سورس v3.0.0 انجام شد.

## نتیجه نهایی (اندازه‌گیری‌شده، نه حدس)

| مرحله | نصب‌کننده | تغییر |
|---|---|---|
| **قبل (v3.0.0)** | ~۳۰۰ مگابایت | — |
| **بعد از همه تغییرات** | **~۹۷–۱۱۰ مگابایت** | **−۶۳ تا −۶۸٪** |

روش اندازه‌گیری: بیلد واقعی با `electron-builder --win --dir` روی پیکربندی جدید → ‏`dist/win-unpacked` برابر **۳۲۹ مگ** (قبلاً ~۸۲۰ مگ) — نسخهٔ 3.0.1-beta.10 با فیلترهای .map/.md/.d.ts → فشرده‌سازیِ معادل NSIS (LZMA/xz) برابر **۹۷ مگ**. حد بالای بازه (۱۱۰) برای تفاوت‌های جزئی ماشین ویندوز (native buildها، uninstaller و سربار NSIS) منظور شده است.

## چه چیزهایی حجم را بالا می‌برد؟

| عامل | سهم قبلی |
|---|---|
| ۲۳ پکیج renderer-only داخل `dependencies` (next خام ۱۵۲مگ، آیکن‌ها ~۹۳مگ، sharp و swc برای همه پلتفرم‌ها، recharts و …) — در حالی که UI با `output: 'export'` کاملاً استاتیک در `out/` (فقط ۳.۲ مگ) بیلد می‌شود | ~۱۵۰ مگ در نصب‌کننده |
| ابزار بازیابی = یک اپ Electron مستقلِ دوم (~224مگ uncompressed) داخل نصب‌کننده | ~۸۰ مگ |
| ~۱۰۰ فایل locale کرومیوم + prebuildهای همه سیستم‌عامل‌ها در better-sqlite3 + باندل مرورگری exceljs | ~۱۵–۲۰ مگ |

## تغییرات اعمال‌شده

### ۱) `package.json`
- فقط وابستگی‌های واقعی پردازش اصلی در `dependencies` ماند: `better-sqlite3-multiple-ciphers`، `exceljs`، `ssh2`، `electron-updater`، `bcryptjs` (و `keytar` اختیاری).
- ۲۳ پکیج UI به `devDependencies` رفت (هنگام build نصب می‌شوند، ولی دیگر پک نمی‌شوند).
- اسکریپت جدید `npm run recovery` — اجرای حالت بازیابی در محیط توسعه.
- `node_modules` در نصب production: ‏**۷۰۸مگ → ۷۸مگ**؛ داخل بسته نهایی با فیلترها: **~۳۳مگ**.

### ۲) `electron-builder.json`
- حذف `extraFiles` (EXE بازیابی دیگر داخل نصب‌کننده جاسازی نمی‌شود).
- نگه داشتن فقط `prebuilds/win32-x64.node` از better-sqlite3 (−۲۳مگ)، حذف `exceljs/dist` (−۲۱مگ)، فیلتر prebuildهای غیرویندوزی keytar/cpu-features.
- `"compression": "maximum"` و هوک `"afterPack": "electron/scripts/after-pack.cjs"`.
- exclusion قبلی `!electron/recovery/**` با exclusion دقیق‌تر جایگزین شد تا صفحه و core بازیابی داخل بسته بیایند (Standalone package.json/node_modules آن همچنان محروم است).

### ۳) ادغام ابزار بازیابی در اپ اصلی (−۸۰مگ)
- **`electron/recovery/core.js`** (جدید): تمام منطق بازیابی (خواندن `credentials.dat`، رمزگشایی DPAPI/AES، گیت scrypt-PIN، قفل ۵دقیقه‌ای) — منبع واحد برای هر دو میزبان.
- **`electron/main/recovery-mode.js`** (جدید): همان پنجره و IPC (`recovery:state` / `recovery:verify`) داخل اپ اصلی؛ عمداً **بدون** single-instance lock تا کنار داشبورد باز هم کار کند.
- **`electron/main/index.js`** به dispatcher کوچک تبدیل شد: با فلگ `--recovery` به recovery-mode، در غیر این صورت به `main-window.js` (فایل قبلی، با git mv حفظ تاریخچه).
- **`electron/recovery/index.js`**: shell نازک standalone روی همان core — `npm run build:recovery` هنوز کار می‌کند ولی دیگر در نصب‌کننده جا نمی‌شود.
- فرمت فایل، PIN، قفل، کانال‌های IPC و صفحه HTML بدون تغییر — سازگاری کامل با دیتای موجود کاربران.
- شیوه استفاده برای کاربر نهایی: `HyperFamily-Branch-Monitor.exe --recovery`

### ۴) فایل جدید `electron/scripts/after-pack.cjs`
حذف خودکار ۵۴ فایل locale کرومیوم غیر از `en-US.pak` (در بیلد آزمایشی دقیقاً همین‌طور اجرا شد). افزودن زبان بعدی = یک خط در `KEEP`.

### ۵) Workflowها (release / beta-release / ci)
مراحل «Build the credential recovery tool» و «Attach the standalone recovery tool» حذف شدند (دیگر لازم نیست) — بیلد CI هم سریع‌تر می‌شود. `README.md` به‌روز شد.

## نتیجهٔ محتوای بستهٔ جدید (win-unpacked)

| بخش | حجم |
|---|---|
| کل پوشهٔ نصب | ۳۳۱ مگ (قبل: ~۸۲۰مگ) |
| `resources/app.asar` (کد و UI) | **۱۵ مگ** (قبل: ~۱۵۰مگ+) |
| `app.asar.unpacked` (native ماژول‌ها) | ۱۸ مگ |
| باقی = خود runtime الکترون (EXE ‏۲۲۴مگ + DLLها) — کفِ غیرقابل‌حذف با Electron | ~۲۹۸ مگ |

## تأیید صحت
- ✅ هر ۸۵ تست واحد پاس (۲ تای Windows روی لینوکس skip — طبیعی)
- ✅ `next build` موفق (`out/` = ۳.۲مگ)
- ✅ بیلد `electron-builder --win --dir` کامل و موفق؛ هوک afterPack اجرا شد
- ✅ داخل asar: هیچ پکیج renderer (next/react/recharts/lucide/phosphor) وجود ندارد؛ فایل‌های recovery حاضرند

## نکات باقی‌مانده (اختیاری، خارج از حجم)
- کفِ حجم با Electron ≈ ۹۰–۱۱۰ مگ است. رفتار زیر این = مهاجرت به Tauri/WebView2 (بازنویسی بزرگ، ارزش‌مندی آن را جدا ارزیابی کنید).
- اعداد بالا با Electron 41 بسیار جدید است؛ در آینده نسخه‌های کوچک‌تر runtime هم کمک می‌کند.
- امضای کد (`CSC_LINK`) و حذف `verifyUpdateCodeSignature: false` برای امنیت آپدیت توصیه می‌شود.
