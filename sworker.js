const CACHE_NAME = 'gadget-go-v1';

const CRITICAL_URLS = [
  './',
  './index.html',
  './db.js',
  './manifest.webmanifest'
];

const SECONDARY_URLS = [
  "./inventario2.html",
  "./carrito.html",
  "./producto.html",
  "./nosotros.html",
  "./politicas-devolución.html",
  "./img/Logo-GadgetGo-512x512-v2.png",
  "./img/banner1.png",
  "./img/banner2.png",
  "./img/banner3.png",
  './icons/icon-app-192.png',
  './icons/icon-app-512.png'
];

const CDN_URLS = [
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css",
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css",
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"
];

// INSTALACIÓN
self.addEventListener('install', (event) => {
  console.log('SW: Instalando...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        console.log('Cacheando archivos críticos...');
        
        // 1. Cachear archivos críticos
        try {
          await cache.addAll(CRITICAL_URLS);
          console.log('Archivos críticos cacheados');
        } catch (error) {
          console.error('Error en archivos críticos:', error);
          // Intentar uno por uno
          for (const url of CRITICAL_URLS) {
            try {
              const response = await fetch(url);
              await cache.put(url, response);
              console.log(`${url}`);
            } catch (err) {
              console.error(`No se pudo cachear: ${url}`, err);
            }
          }
        }

        // 2. Cachear archivos secundarios (pueden fallar)
        console.log('Cacheando archivos secundarios...');
        for (const url of SECONDARY_URLS) {
          try {
            const response = await fetch(url);
            if (response.ok) {
              await cache.put(url, response);
              console.log(`${url}`);
            }
          } catch (error) {
            console.warn(`No disponible: ${url}`);
          }
        }

        // 3. Cachear CDNs (opcionales)
        console.log('Cacheando CDNs...');
        for (const url of CDN_URLS) {
          try {
            const response = await fetch(url, { mode: 'cors' });
            if (response.ok) {
              await cache.put(url, response);
              console.log(`CDN: ${url.substring(0, 50)}...`);
            }
          } catch (error) {
            console.warn(`CDN no disponible: ${url.substring(0, 50)}...`);
          }
        }

        console.log('SW instalado correctamente');
      })
      .catch(error => {
        console.error('Error en instalación:', error);
      })
  );
  
  // Activar inmediatamente
  self.skipWaiting();
});

// ACTIVACIÓN
self.addEventListener('activate', (event) => {
  console.log('SW: Activando...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Eliminando caché antigua:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  
  // Tomar control de todas las páginas inmediatamente
  return self.clients.claim();
});

// INTERCEPTAR FETCH
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // LISTA DE APIs QUE NO SE DEBEN INTERCEPTAR
  const skipAPIs = [
    'firestore.googleapis.com',
    'firebaseio.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'www.googleapis.com',
    'apis.google.com',
    'accounts.google.com',
    'content-firestore.googleapis.com',
    'firebase.googleapis.com',
    'firebaseinstallations.googleapis.com',
    'fcmtoken.googleapis.com',
    'cloudinary.com',
    'res.cloudinary.com',
    'oauth2.googleapis.com',
    'imasdk.googleapis.com',
    'firebasestorage.googleapis.com',
    'gstatic.com'
  ];

  // NO INTERCEPTAR APIs EXTERNAS
  const shouldSkip = skipAPIs.some(api => url.includes(api));
  
  if (shouldSkip) {
    return;
  }

  // ESTRATEGIA HÍBRIDA: CACHE FIRST PARA RECURSOS ESTÁTICOS
  const isCDN = CDN_URLS.some(cdn => url.includes(cdn.split('?')[0]));
  const isLocalStatic = url.includes('.png') || url.includes('.jpg') || url.includes('.css') || url.includes('.js') ||
    url.includes('bootstrap') || url.includes('font-awesome');

  if (isCDN || isLocalStatic) {
    // CACHE FIRST para recursos estáticos
    event.respondWith(
      caches.match(event.request)
        .then((cached) => {
          if (cached) {
            return cached;
          }
          // Si no está en caché, intentar fetch
          return fetch(event.request)
            .then((response) => {
              if (response && response.ok && event.request.method === 'GET') {
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(event.request, responseClone);
                });
              }
              return response;
            })
            .catch(() => {
              // Fallback para imágenes
              if (event.request.destination === 'image') {
                return new Response(
                  '<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg"><rect fill="#e5e7eb" width="200" height="200"/><text fill="#9ca3af" font-size="16" x="50%" y="50%" text-anchor="middle" dominant-baseline="middle">Sin imagen</text></svg>',
                  { headers: { 'Content-Type': 'image/svg+xml' } }
                );
              }
              return new Response('Recurso no disponible', { status: 503 });
            });
        })
    );
    return;
  }

  // NETWORK FIRST para documentos HTML y páginas dinámicas
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cachear respuestas exitosas
        if (response && response.ok && event.request.method === 'GET') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Si falla, buscar en caché
        return caches.match(event.request)
          .then((cached) => {
            if (cached) {
              console.log('📦 Desde caché:', event.request.url);
              return cached;
            }

            // Fallback para documentos HTML
            if (event.request.destination === 'document' || 
                event.request.headers.get('accept')?.includes('text/html')) {
              return caches.match('./index.html')
                .then(indexPage => {
                  if (indexPage) {
                    return indexPage;
                  }
                  return new Response(
                    '<html><body><h1>Offline</h1><p>No hay conexión</p></body></html>',
                    { headers: { 'Content-Type': 'text/html' } }
                  );
                });
            }

            // Fallback genérico
            return new Response('Recurso no disponible offline', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
      })
  );
});

// MANEJO DE MENSAJES
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Escuchar mensajes para sincronización de pedidos offline
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SYNC_PEDIDOS') {
    event.waitUntil(syncOfflinePedidos());
  }
});

// Función para sincronizar pedidos offline
async function syncOfflinePedidos() {
  try {
    const cache = await caches.open(OFFLINE_PEDIDOS);
    const requests = await cache.keys();
    
    for (const request of requests) {
      const response = await cache.match(request);
      const pedido = await response.json();
      
      // Intentar enviar el pedido a Firestore
      try {
        const result = await fetch('https://firestore.googleapis.com/v1/projects/primer-proyecto-7b2f4/databases/(default)/documents/pedidos', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(pedido)
        });
        
        if (result.ok) {
          // Eliminar del cache offline si se envió correctamente
          await cache.delete(request);
          console.log('✅ Pedido sincronizado:', pedido);
        }
      } catch (error) {
        console.log('❌ Error sincronizando pedido:', error);
      }
    }
  } catch (error) {
    console.error('Error en syncOfflinePedidos:', error);
  }
}

// Background Sync (si está disponible)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pedidos') {
    event.waitUntil(syncOfflinePedidos());
  }
});

console.log('Service Worker listo');
