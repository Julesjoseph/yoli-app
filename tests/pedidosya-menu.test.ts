import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanMenuName, menuImageUrl, parsePedidosYaMenu } from '../src/lib/pedidosya-menu.ts';

const ld = {
  '@context': 'https://schema.org',
  '@type': 'Restaurant',
  hasMenu: {
    '@type': 'Menu',
    hasMenuSection: [
      { '@type': 'MenuSection', name: 'Desayuno &cena', hasMenuItem: [
        { '@type': 'MenuItem', name: 'Mangu de platano', description: 'Con salami', image: 'https://pedidosya.dhmedia.io/image/pedidosya/products/a.jpeg?quality=90', offers: { '@type': 'Offer', price: 200 } },
        { '@type': 'MenuItem', name: 'Yuca hervida 1 huevos fritos,', offers: { price: 245 } },
      ] },
      { '@type': 'MenuSection', name: 'Bebidas', hasMenuItem: [
        { '@type': 'MenuItem', name: 'Coca Cola', image: 'https://pedidosya.dhmedia.io/image/pedidosya/products/c.jpeg', offers: { price: 55 } },
        { '@type': 'MenuItem', name: 'Mangu de platano', offers: { price: 1 } },
      ] },
    ],
  },
};

test('menú PedidosYa: lee secciones, precios y fotos', () => {
  const html = `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body></body></html>`;
  const { items, error } = parsePedidosYaMenu(html);
  assert.equal(error, undefined);
  assert.equal(items.length, 3);
  assert.deepEqual(items[0], {
    section: 'Desayuno &cena', name: 'Mangu de platano', description: 'Con salami', price: 200,
    image: 'https://pedidosya.dhmedia.io/image/pedidosya/products/a.jpeg?quality=90',
  });
  assert.equal(items[1].name, 'Yuca hervida 1 huevos fritos');
  assert.equal(items[1].image, null);
  assert.equal(items[2].section, 'Bebidas');
  assert.match(parsePedidosYaMenu('<html><body>nada</body></html>').error ?? '', /Página web completa/);
  assert.equal(cleanMenuName('  Tostada de  Jamon y queso '), 'Tostada de Jamon y queso');
  assert.equal(menuImageUrl('https://pedidosya.dhmedia.io/image/x.jpeg?quality=90'), 'https://pedidosya.dhmedia.io/image/x.jpeg?quality=85&width=600');
});
