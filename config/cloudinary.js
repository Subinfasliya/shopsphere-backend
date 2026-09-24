const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const uploadProductImage = (buffer) => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream(
    { folder: 'shopsphere/products', resource_type: 'image' },
    (error, result) => (error ? reject(error) : resolve(result))
  );
  stream.end(buffer);
});

const deleteProductImage = (publicId) => cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });

module.exports = { uploadProductImage, deleteProductImage };