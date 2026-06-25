const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const path = require('path');

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// إعدادات Cloudinary لرفع الصور
cloudinary.config({ 
    cloud_name: 'dngcxt4jk', 
    api_key: '769915154855871',
    api_secret: 'tWRcIMQUg6DcJKMjqteQMPog3Kc' 
});

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

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

// حماية لوحة التحكم بـ Basic Auth
const adminAuth = (req, res, next) => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [user, pass] = Buffer.from(b64auth, 'base64').toString().split(':');

    if (user === 'yousef_wahz' && pass === 'yoyomyom12') {
        return next(); 
    } 
    
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
    return res.status(401).send('بيانات الدخول غير صحيحة!');
};

// --- مسارات الصفحات الثابتة (تعديل متوافق مع بيئة Vercel) ---
app.get('/', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'index.html'));
});

app.get('/admin-orders', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'admin-orders.html'));
});

app.get('/shop', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'shop.html'));
});

// --- APIs المنتجات ---
app.get('/products', async (req, res) => {
    try {
        const products = await prisma.product.findMany({ orderBy: { createdAt: 'desc' } });
        res.status(200).json(products);
    } catch (err) { 
        res.status(500).json({ error: "فشل في جلب المنتجات", details: err.message }); 
    }
});

app.post('/add', adminAuth, upload.single('image'), async (req, res) => {
    try {
        const { name, price, description, stock, category } = req.body;
        let imageUrl = null;

        if (req.file) {
            imageUrl = await uploadImageToCloud(req.file.buffer);
        }

        const newProduct = await prisma.product.create({
            data: { 
                name, 
                price: parseFloat(price) || 0, 
                description: description || '', 
                category, 
                imageUrl, 
                stock: parseInt(stock) || 0 
            }
        });
        res.status(201).json({ success: true, product: newProduct });
    } catch (err) { 
        res.status(500).json({ error: "فشل إضافة المنتج", details: err.message }); 
    }
});

app.put('/update/:id', adminAuth, upload.single('image'), async (req, res) => {
    try {
        const { name, price, description, stock, category } = req.body;
        const productId = isNaN(req.params.id) ? req.params.id : parseInt(req.params.id);

        const updateData = { 
            name, 
            price: parseFloat(price) || 0, 
            description: description || '', 
            category, 
            stock: parseInt(stock) || 0 
        };
        
        if (req.file) {
            updateData.imageUrl = await uploadImageToCloud(req.file.buffer);
        }

        await prisma.product.update({ where: { id: productId }, data: updateData });
        res.status(200).json({ success: true, message: 'تم التعديل بنجاح' });
    } catch (err) { 
        res.status(500).json({ error: "فشل التعديل", details: err.message }); 
    }
});

app.delete('/delete/:id', adminAuth, async (req, res) => {
    try {
        const productId = isNaN(req.params.id) ? req.params.id : parseInt(req.params.id);
        await prisma.product.delete({ where: { id: productId } });
        res.status(200).json({ success: true, message: 'تم الحذف بنجاح' });
    } catch (err) { 
        res.status(500).json({ error: "فشل الحذف", details: err.message }); 
    }
});

// --- APIs الطلبات مع معالجة ذكية ومقاومة للأخطاء ---
app.post('/checkout', async (req, res) => {
    try {
        const { customer, phone, address, cart } = req.body;
        
        if (!cart || !Array.isArray(cart) || cart.length === 0) {
            return res.status(400).json({ error: "سلة المشتريات فارغة" });
        }

        let total = 0;
        
        for (let item of cart) {
            // حل ذكي: قراءة الكمية سواء كانت باسم quantity أو qty وسواء كانت نص أو رقم
            const quantity = parseInt(item.quantity || item.qty || 1);
            const itemPrice = parseFloat(item.price || 0);
            total += (itemPrice * quantity);
            
            // تحويل الـ ID لرقم لو كان ينفع عشان يتوافق مع الـ ID اللي في الداتا بيز
            const itemId = isNaN(item.id) ? item.id : parseInt(item.id);

            // جلب المنتج للتأكد من المخزن الحالي
            const product = await prisma.product.findUnique({ where: { id: itemId } });
            
            if (product) {
                // بنطرح يدوي ونحدث القيمة النهائية عشان نتجنب الـ decrement undefined تماماً
                const newStock = Math.max(0, product.stock - quantity);
                await prisma.product.update({
                    where: { id: itemId },
                    data: { stock: newStock }
                });
            }
        }

        // إنشاء الأوردر بنجاح
        const newOrder = await prisma.order.create({ 
            data: { 
                customer: customer || 'عميل مجهول', 
                phone: phone || '', 
                address: address || '', 
                total: parseFloat(total), 
                items: JSON.stringify(cart), 
                status: 'pending' 
            } 
        });

        res.status(201).json({ success: true, order: newOrder });
    } catch (err) { 
        res.status(500).json({ error: "فشل إتمام الشراء: " + err.message }); 
    }
});

app.get('/api/orders', adminAuth, async (req, res) => {
    try {
        const orders = await prisma.order.findMany({ orderBy: { createdAt: 'desc' } });
        res.status(200).json(orders);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/orders/:id/status', adminAuth, async (req, res) => {
    try {
        const orderId = isNaN(req.params.id) ? req.params.id : parseInt(req.params.id);
        await prisma.order.update({ where: { id: orderId }, data: { status: req.body.status } });
        res.status(200).json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
}

module.exports = app;

module.exports.config = { api: { bodyParser: false } };