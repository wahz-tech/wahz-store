// =======================================================================
// 1. استدعاء المكتبات (Dependencies)
// =======================================================================
const express = require('express');
const cors = require('cors'); // مهم جداً عشان المتصفح ميعملش بلوك للطلبات
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const path = require('path');

// =======================================================================
// 2. التهيئة (Initialization)
// =======================================================================
const app = express();
const prisma = new PrismaClient();

// إعدادات CORS وقراءة الـ JSON
app.use(cors());
app.use(express.json());

// =======================================================================
// 3. إعدادات Cloudinary و Multer للصور
// =======================================================================
cloudinary.config({ 
    cloud_name: 'dngcxt4jk', 
    api_key: '769915154855871',
    api_secret: 'tWRcIMQUg6DcJKMjqteQMPog3Kc' 
});

// استخدام الذاكرة المؤقتة لاستلام الملفات (ممتاز جداً لـ Vercel)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// ===> دالة مساعدة (Helper Function) لرفع الصور لسيرفر Cloudinary <===
const uploadImageToCloud = (fileBuffer) => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder: 'wahz_store_products' },
            (error, result) => {
                if (error) reject(error);
                else resolve(result.secure_url);
            }
        );
        stream.end(fileBuffer);
    });
};

// =======================================================================
// 4. ميديليويرة الحماية للإدارة (Admin Authentication)
// =======================================================================
const adminAuth = (req, res, next) => {
    // التأكد إن الهيدر موجود ومكتوب صح عشان السيرفر ميقعش
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [user, pass] = Buffer.from(b64auth, 'base64').toString().split(':');

    if (user === 'yousef_wahz' && pass === 'yoyomyom12') {
        return next(); // البيانات صح، كمل طلبك
    } 
    
    // البيانات غلط، اطلب منه تسجيل الدخول
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
    return res.status(401).send('بيانات الدخول غير صحيحة! برجاء المحاولة مرة أخرى.');
};

// =======================================================================
// 5. مسارات الصفحات (HTML Routes) - [تم التعديل لتتوافق مع Vercel]
// =======================================================================
app.use(express.static(process.cwd(), { index: false })); 

// صفحات العميل
app.get('/shop', (req, res) => res.sendFile(path.join(process.cwd(), 'shop.html')));

// صفحات الإدارة (محمية)
app.get('/', adminAuth, (req, res) => res.sendFile(path.join(process.cwd(), 'index.html')));
app.get('/admin-orders', adminAuth, (req, res) => res.sendFile(path.join(process.cwd(), 'orders.html')));

// =======================================================================
// 6. مسارات المنتجات (Products APIs)
// =======================================================================

// جلب جميع المنتجات للعملاء
app.get('/products', async (req, res) => {
    try {
        const products = await prisma.product.findMany({ orderBy: { createdAt: 'desc' } });
        res.status(200).json(products);
    } catch (err) { 
        res.status(500).json({ error: "فشل في جلب المنتجات", details: err.message }); 
    }
});

// إضافة منتج جديد (مدير فقط)
app.post('/add', adminAuth, upload.single('image'), async (req, res) => {
    try {
        const { name, price, description, stock, category } = req.body;
        let imageUrl = null;

        // رفع الصورة لو موجودة باستخدام الدالة المساعدة
        if (req.file) {
            imageUrl = await uploadImageToCloud(req.file.buffer);
        }

        const newProduct = await prisma.product.create({
            data: { 
                name, 
                price: parseFloat(price), 
                description, 
                category, 
                imageUrl, 
                stock: parseInt(stock) || 0 
            }
        });
        
        res.status(201).json({ success: true, product: newProduct });
    } catch (err) { 
        res.status(500).json({ error: "فشل في إضافة المنتج", details: err.message }); 
    }
});

// تعديل منتج (مدير فقط)
app.put('/update/:id', adminAuth, upload.single('image'), async (req, res) => {
    try {
        const { name, price, description, stock, category } = req.body;
        const updateData = { 
            name, 
            price: parseFloat(price), 
            description, 
            category, 
            stock: parseInt(stock) 
        };
        
        // لو رفع صورة جديدة، ارفعها وحدث الرابط
        if (req.file) {
            updateData.imageUrl = await uploadImageToCloud(req.file.buffer);
        }

        await prisma.product.update({ 
            where: { id: parseInt(req.params.id) }, 
            data: updateData 
        });
        
        res.status(200).json({ success: true, message: 'تم التعديل بنجاح' });
    } catch (err) { 
        res.status(500).json({ error: "فشل في تعديل المنتج", details: err.message }); 
    }
});

// حذف منتج (مدير فقط)
app.delete('/delete/:id', adminAuth, async (req, res) => {
    try {
        await prisma.product.delete({ where: { id: parseInt(req.params.id) } });
        res.status(200).json({ success: true, message: 'تم الحذف بنجاح' });
    } catch (err) { 
        res.status(500).json({ error: "فشل في حذف المنتج", details: err.message }); 
    }
});

// =======================================================================
// 7. مسارات الطلبات (Orders APIs)
// =======================================================================

// جلب الطلبات للإدارة (مدير فقط)
app.get('/api/orders', adminAuth, async (req, res) => {
    try {
        const orders = await prisma.order.findMany({ orderBy: { createdAt: 'desc' } });
        res.status(200).json(orders);
    } catch (err) { 
        res.status(500).json({ error: "فشل في جلب الطلبات", details: err.message }); 
    }
});

// تحديث حالة الطلب (مدير فقط)
app.put('/api/orders/:id/status', adminAuth, async (req, res) => {
    try {
        const { status } = req.body;
        await prisma.order.update({ 
            where: { id: parseInt(req.params.id) }, 
            data: { status } 
        });
        res.status(200).json({ success: true, message: 'تم تحديث حالة الطلب' });
    } catch (err) { 
        res.status(500).json({ error: "فشل في تحديث الطلب", details: err.message }); 
    }
});

// إتمام الطلب للعميل (نظام الخصم من المخزون)
app.post('/checkout', async (req, res) => {
    try {
        const { customer, phone, address, cart } = req.body;
        let total = 0;

        // حساب الإجمالي وخصم المخزون
        for (let item of cart) {
            total += (item.price * item.quantity);
            
            await prisma.product.update({
                where: { id: parseInt(item.id) },
                data: { stock: { decrement: item.quantity } }
            });
        }

        // إنشاء الطلب الجديد
        const newOrder = await prisma.order.create({
            data: { 
                customer, 
                phone, 
                address, 
                total, 
                items: JSON.stringify(cart),
                status: 'pending' // افتراضياً الطلب بيكون معلق
            }
        });
        
        res.status(201).json({ success: true, order: newOrder });
    } catch (err) { 
        res.status(500).json({ error: "فشل في إتمام الطلب", details: err.message }); 
    }
});

// =======================================================================
// 8. تشغيل السيرفر وتصديره (تم التعديل لتتوافق مع Vercel)
// =======================================================================

// إذا كنا على الجهاز الشخصي، شغل البورت 3000
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`
        =========================================
        🚀 Wahz Store Backend is UP & RUNNING!
        🌐 Link: http://localhost:${PORT}
        =========================================
        `);
    });
}

// السطر السحري: تصدير التطبيق عشان Vercel يقدر يشغله كـ Serverless
module.exports = app;