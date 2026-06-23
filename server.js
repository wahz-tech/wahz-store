const express = require('express');
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const prisma = new PrismaClient();
const app = express();

// if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

app.use(express.json());
app.use('/uploads', express.static('uploads'));

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

    // هنا اسم المستخدم وكلمة السر بتوعك
    if (user === 'yousef_wahz' && pass === 'yoyomyom12') {
        next();
    } else {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
        return res.status(401).send('بيانات الدخول غير صحيحة!');
    }
};

// مسارات العميل (مفتوحة للجميع بدون باسوورد)
app.use(express.static('.', { index: false })); // منع فتح index.html تلقائياً للكل
app.get('/shop', (req, res) => res.sendFile(__dirname + '/shop.html'));

// مسارات الإدارة (محمية ومؤمنة بالكامل بـ adminAuth)
app.get('/', adminAuth, (req, res) => res.sendFile(__dirname + '/index.html'));
app.get('/admin-orders', adminAuth, (req, res) => res.sendFile(__dirname + '/orders.html'));
app.get('/products', async (req, res) => {
    try {
        const products = await prisma.product.findMany({ orderBy: { createdAt: 'desc' } });
        res.json(products);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/add', adminAuth, upload.single('image'), async (req, res) => {
    try {
        const { name, price, description, stock, category } = req.body;
        const imageUrl = req.file ? '/uploads/' + req.file.filename : null;
        const newProduct = await prisma.product.create({
            data: { name, price: parseFloat(price), description, category, imageUrl, stock: parseInt(stock) }
        });
        res.json(newProduct);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/update/:id', adminAuth, upload.single('image'), async (req, res) => {
    try {
        const { name, price, description, stock, category } = req.body;
        const updateData = { name, price: parseFloat(price), description, category, stock: parseInt(stock) };
        if (req.file) updateData.imageUrl = '/uploads/' + req.file.filename;

        await prisma.product.update({ where: { id: req.params.id }, data: updateData });
        res.send('تم التعديل بنجاح');
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/delete/:id', adminAuth, async (req, res) => {
    try {
        await prisma.product.delete({ where: { id: req.params.id } });
        res.send('تم الحذف');
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/orders', adminAuth, async (req, res) => {
    try {
        const orders = await prisma.order.findMany({ orderBy: { createdAt: 'desc' } });
        res.json(orders);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/orders/:id/status', adminAuth, async (req, res) => {
    try {
        const { status } = req.body;
        await prisma.order.update({ where: { id: req.params.id }, data: { status } });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// إتمام الطلب للعميل (مفتوح طبعاً عشان يعرف يشتري)
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

app.listen(3000, () => console.log('🚀 السيستم المؤمن بالكامل شغال على: http://localhost:3000'));