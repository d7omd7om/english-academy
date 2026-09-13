# English Academy — دليل النشر التفصيلي (مجاني بالكامل، بدون بطاقة)

هذا الدليل يفترض أنك ما سبق تستخدم GitHub أو Vercel — كل خطوة موضحة بالتفصيل.

**التكلفة: صفر تماماً.** الاستضافة مجانية للأبد (Vercel)، والذكاء الاصطناعي مجاني للأبد (Google Gemini)، بدون أي بطاقة ائتمان مطلوبة في أي خطوة.

---

## الجزء 1: احصل على مفتاح Google Gemini API

1. افتح متصفح واذهب إلى: **aistudio.google.com**
2. سجل دخول بحساب Google (جيميل) عادي
3. أول مرة تدخل، وافق على الشروط (Continue)
4. دور زر **"Get API key"** (يسار الشاشة عادة)
5. اضغط **"Create API key"**
6. لو طلب منك يختار مشروع Google Cloud، اختر **"Create a new project"** (بدون بطاقة)
7. اضغط **"Create Key"**
8. **انسخ المفتاح** واحفظه بمكان آمن

---

## الجزء 2: أنشئ حساب GitHub وارفع المشروع

1. اذهب إلى: **github.com** → **"Sign up"** (حساب مجاني)
2. اضغط أيقونة **"+"** أعلى يمين الصفحة → **"New repository"**
3. اكتب اسم: `english-academy` → اضغط **"Create repository"**
4. بالصفحة الجديدة اضغط رابط **"uploading an existing file"**
5. فك ضغط الملف اللي عندك بجهازك
6. افتح المجلد المفكوك، حدد **كل الملفات جواه** (مو المجلد نفسه)
7. اسحبها وأفلتها على صفحة GitHub
8. اضغط **"Commit changes"** بالأسفل

---

## الجزء 3: انشره على Vercel

1. اذهب إلى: **vercel.com** → **"Sign Up"** → **"Continue with GitHub"** → **"Authorize Vercel"**
2. اضغط **"Add New..."** → **"Project"**
3. دور الـrepo (`english-academy`) واضغط **"Import"** جنبه
4. **قبل** الضغط على أي شي، افتح قسم **"Environment Variables"**:
   - Key: `GEMINI_API_KEY`
   - Value: المفتاح من الجزء 1
   - اضغط **"Add"**
5. اضغط **"Deploy"** وانتظر دقيقتين

---

## لو عندك مشروع منشور مسبقاً بمفتاح Anthropic القديم

لو سبق نشرت المشروع وضفت `ANTHROPIC_API_KEY`، بدّلها كذا:
1. روح لمشروعك بـVercel → **Settings** → **Environment Variables**
2. احذف `ANTHROPIC_API_KEY` (زر Remove/×)
3. أضف وحدة جديدة: Key = `GEMINI_API_KEY`، Value = مفتاح Gemini
4. احفظ، وارفع الملفات المحدثة (الجزء 2) على نفس الـrepo بـGitHub (استبدل الملفات القديمة)
5. روح لتبويب **"Deployments"** بـVercel → اضغط النقاط الثلاث (⋯) على آخر نسخة → **"Redeploy"**

---

## الجزء 4: افتح موقعك

اضغط الرابط اللي يعطيك Vercel (شكله `english-academy-xxxx.vercel.app`) — يفتح من أي متصفح، أي جهاز، بدون أي حدود استخدام تقلقك.

## هيكلة المشروع
- `src/App.jsx` — التطبيق كامل
- `api/chat.js` — يتصل بـGoogle Gemini بأمان (المفتاح ما يظهر أبداً بالمتصفح)
- `.env.example` — نموذج للتجربة المحلية قبل النشر
