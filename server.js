const express = require('express');
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const path = require('path');

const prisma = new PrismaClient();
const app = express();

// --- إعدادات ربط Cloudinary لتخزين الصور ---
// (استبدل الحروف المقابلة ببياناتك الحقيقية اللي هتظهرلك بعد الضغط على View API Keys)
cloudinary.config({ 
  cloud_name: 'dngcxt4jk', 
  api_key: '769915154855871'
  api_secret: 'tWRcIMQUg6DcJKMjqteQMPog3Kc' 
});

// إعداد الذاكرة المؤقتة لاستلام الملفات بسلاسة على Vercel
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(express.json());

// -------- ميديليويرة الحماية الصارمة للإدارة --------
const adminAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
        return res.status(401).send('برجاء تسجيل الدخول أولاً لدخول لوحة تحكم Wahz Store');
    }

    const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
    const user = auth[0];
    const pass = auth[1];

    if (user === 'yousef_wahz' && pass === 'yoyomyom12') {
        next();
    } else {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
        return res.status(401).send('بيانات الدخول غير صحيحة!');
    }
};

// مسارات العميل (مفتوحة للجميع)
app.use(express.static('.', { index: false })); 
app.get('/shop', (req, res) => res.sendFile(__dirname + '/shop.html'));

// مسارات الإدارة (محمية بالكامل)
app.get('/', adminAuth, (req, res) => res.sendFile(__dirname + '/index.html'));
app.get('/admin-orders', adminAuth, (req, res) => res.sendFile(__dirname + '/orders.html'));

// جلب المنتجات
app.get('/products', async (req, res) => {
    try {
        const products = await prisma.product.findMany({ orderBy: { createdAt: 'desc' } });
        res.json(products);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// إضافة منتج جديد ورفع صورته مباشرة لـ Cloudinary
app.post('/add', adminAuth, upload.single('image'), async (req, res) => {
    try {
        const { name, price, description, stock, category } = req.body;
        let imageUrl = null;

        if (req.file) {
            // رفع الملف مباشرة من الذاكرة إلى السحاب
            const uploadResult = await new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    { folder: 'wahz_store_products' },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    }
                );
                stream.end(req.file.buffer);
            });
            imageUrl = uploadResult.secure_url; // رابط الصورة الدائم أونلاين!
        }

        const newProduct = await prisma.product.create({
            data: { name, price: parseFloat(price), description, category, imageUrl, stock: parseInt(stock) }
        });
        res.json(newProduct);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// تعديل منتج
app.put('/update/:id', adminAuth, upload.single('image'), async (req, res) => {
    try {
        const { name, price, description, stock, category } = req.body;
        const updateData = { name, price: parseFloat(price), description, category, stock: parseInt(stock) };
        
        if (req.file) {
            const uploadResult = await new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    { folder: 'wahz_store_products' },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    }
                );
                stream.end(req.file.buffer);
            });
            updateData.imageUrl = uploadResult.secure_url;
        }

        await prisma.product.update({ where: { id: req.params.id }, data: updateData });
        res.send('تم التعديل بنجاح');
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// حذف منتج
app.delete('/delete/:id', adminAuth, async (req, res) => {
    try {
        await prisma.product.delete({ where: { id: req.params.id } });
        res.send('تم الحذف');
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// جلب الطلبات
app.get('/api/orders', adminAuth, async (req, res) => {
    try {
        const orders = await prisma.order.findMany({ orderBy: { createdAt: 'desc' } });
        res.json(orders);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// تحديث حالة الطلب
app.put('/api/orders/:id/status', adminAuth, async (req, res) => {
    try {
        const { status } = req.body;
        await prisma.order.update({ where: { id: req.params.id }, data: { status } });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// إتمام الطلب للعميل
app.post('/checkout', async (req, res) => {
    try {
        const { customer, phone, address, cart } = req.body;
        let total = 0;
        for (let item of cart) {
            total += (item.price * item.quantity);
            await prisma.product.update({
                where: { id: item.id },
                data: { stock: { decrement: item.quantity } }
            });
        }
        const newOrder = await prisma.order.create({
            data: { customer, phone, address, total, items: JSON.stringify(cart) }
        });
        res.json({ success: true, order: newOrder });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = app;
app.listen(3000, () => console.log('🚀 Wahz Store شغال وجاهز على السيرفر!'));