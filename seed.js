require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDB = require('./config/dbConnection');
const User = require('./models/User');
const Product = require('./models/Product');

const products = [
  { name:'Wireless Headphones', description:'Comfortable over-ear wireless headphones with deep bass, adaptive sound and long battery life.', price:2499, category:'electronics', image:'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1200&q=85', stock:25, brand:'SoundMax', ratings:4.5, numReviews:42 },
  { name:'Smart Watch', description:'Fitness-focused smartwatch with notifications, activity tracking and multiple sport modes.', price:3999, category:'electronics', image:'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&q=85', stock:18, brand:'TimeTech', ratings:4.2, numReviews:31 },
  { name:'Running Shoes', description:'Lightweight running shoes designed for daily training and comfortable road running.', price:2899, category:'fashion', image:'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=85', stock:30, brand:'Stride', ratings:4.7, numReviews:64 },
  { name:'Everyday Backpack', description:'Water-resistant backpack with laptop sleeve and organised storage for everyday carry.', price:1599, category:'bags', image:'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=1200&q=85', stock:40, brand:'UrbanPack', ratings:4.4, numReviews:27 },
  { name:'Ceramic Coffee Mug Set', description:'Minimal ceramic coffee mug set suitable for home and office use.', price:799, category:'home', image:'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=1200&q=85', stock:50, brand:'HomeCraft', ratings:4.3, numReviews:19 },
  { name:'Mechanical Keyboard', description:'Compact mechanical keyboard with tactile switches, RGB lighting and USB-C connectivity.', price:4499, category:'electronics', image:'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=1200&q=85', stock:12, brand:'KeyForge', ratings:4.6, numReviews:53 },
  { name:'Minimal Desk Lamp', description:'Adjustable LED desk lamp with warm and cool light modes for focused work.', price:1899, category:'home', image:'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1200&q=85', stock:22, brand:'Luma', ratings:4.4, numReviews:18 },
  { name:'Premium Sunglasses', description:'Classic UV-protection sunglasses with lightweight frame and everyday styling.', price:1299, category:'fashion', image:'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=1200&q=85', stock:35, brand:'Aero', ratings:4.5, numReviews:38 },
];

async function run(){
 await connectDB();
 const email=String(process.env.SEED_ADMIN_EMAIL).trim().toLowerCase();
 const password=String(process.env.SEED_ADMIN_PASSWORD);
 if(password.length<12) throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters');
 await User.findOneAndUpdate({email},{name:process.env.SEED_ADMIN_NAME||'ShopSphere Admin',email,password:await bcrypt.hash(password,12),role:'admin',isActive:true},{upsert:true,returnDocument:'after',setDefaultsOnInsert:true});
 for(const product of products){await Product.updateOne({name:product.name,brand:product.brand},{$set:product}, {upsert:true});}
 console.log('Seed complete'); console.log(`Admin email: ${email}`); console.log('Admin password: [from SEED_ADMIN_PASSWORD]');
 await mongoose.connection.close();
}
run().catch(async e=>{console.error('Seed failed:',e.message);try{await mongoose.connection.close()}catch{}process.exit(1)});
