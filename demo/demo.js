// Local demo: choose a garment category from the selector. All pose tracking runs in the browser.
const PRODUCTS = {
  tshirt: { id: 'TS001', name: 'Classic Black T-Shirt', category: 'tshirt', image: 'products/black-tshirt.svg', price: '₹999' },
  shirt: { id: 'SH001', name: 'Classic Shirt', category: 'shirt', image: 'products/shirt.svg', price: '₹1,299' },
  pant: { id: 'PT001', name: 'Casual Pants', category: 'pant', image: 'products/pants.svg', price: '₹1,499' },
  saree: { id: 'SR001', name: 'Traditional Saree', category: 'saree', image: 'products/saree.svg', price: '₹2,499' },
  dress: { id: 'DR001', name: 'Everyday Dress', category: 'dress', image: 'products/dress.svg', price: '₹1,799' },
  kurti: { id: 'KU001', name: 'Classic Kurti', category: 'kurti', image: 'products/kurti.svg', price: '₹899' },
};
const params = new URLSearchParams(location.search);
const selected = PRODUCTS[params.get('category')] ? params.get('category') : 'tshirt';
const product = PRODUCTS[selected];
const selector = document.querySelector('#garment-category');
selector.value = selected;
selector.addEventListener('change', () => { location.search = `?category=${encodeURIComponent(selector.value)}`; });
document.querySelector('#product-image').src = product.image;
document.querySelector('#product-image').alt = product.name;
document.querySelector('#product-name').textContent = product.name;
document.querySelector('#product-price').textContent = product.price;
document.querySelector('#product-description').textContent = `Preview this ${product.name.toLowerCase()} live in your browser. Camera frames stay on your device.`;
VirtualTryOn.init({
  license: params.get('license') || 'VT-DEMO-0001',
  product: { id: product.id, name: product.name, category: product.category, garmentImage: new URL(product.image, location.href).href },
  trigger: '#virtual-try-on-btn',
});
