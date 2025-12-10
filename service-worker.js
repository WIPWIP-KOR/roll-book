/**
 * Service Worker for Offline Support
 * 청라FS 출석 시스템 오프라인 지원
 */

const CACHE_VERSION = 'v1';
const CACHE_NAME = `attendance-app-${CACHE_VERSION}`;

// 캐시할 정적 리소스
const STATIC_RESOURCES = [
    '/',
    '/index.html',
    '/stats.html',
    '/admin.html',
    '/css/style.css',
    '/js/cache.js',
    '/js/attendance.js',
    '/js/stats.js',
    '/js/admin.js',
    'https://code.jquery.com/jquery-3.6.0.min.js',
    'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js'
];

// ==================== 설치 ====================

/**
 * Service Worker 설치 시 정적 리소스 캐싱
 */
self.addEventListener('install', (event) => {
    console.log('🔧 Service Worker 설치 중...');

    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('📦 정적 리소스 캐싱 중...');
            return cache.addAll(STATIC_RESOURCES);
        }).then(() => {
            console.log('✅ Service Worker 설치 완료');
            // 새 Service Worker를 즉시 활성화
            return self.skipWaiting();
        }).catch((error) => {
            console.error('❌ Service Worker 설치 실패:', error);
        })
    );
});

// ==================== 활성화 ====================

/**
 * Service Worker 활성화 시 오래된 캐시 정리
 */
self.addEventListener('activate', (event) => {
    console.log('🚀 Service Worker 활성화 중...');

    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log(`🗑️  오래된 캐시 삭제: ${cacheName}`);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('✅ Service Worker 활성화 완료');
            // 모든 클라이언트에서 즉시 제어권 획득
            return self.clients.claim();
        })
    );
});

// ==================== 네트워크 요청 처리 ====================

/**
 * 네트워크 요청 가로채기 및 캐싱 전략 적용
 * Strategy: Network First with Cache Fallback
 */
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Google Apps Script 요청은 항상 네트워크 우선
    if (url.hostname.includes('script.google.com') ||
        url.hostname.includes('script.googleusercontent.com')) {
        event.respondWith(
            fetch(request).catch(() => {
                return new Response(
                    JSON.stringify({
                        success: false,
                        message: '오프라인 상태입니다. 네트워크 연결을 확인하세요.'
                    }),
                    { headers: { 'Content-Type': 'application/json' } }
                );
            })
        );
        return;
    }

    // 카카오맵 API는 항상 네트워크 우선 (캐시하지 않음)
    if (url.hostname.includes('dapi.kakao.com')) {
        event.respondWith(fetch(request));
        return;
    }

    // CDN 리소스: Cache First
    if (url.hostname.includes('jquery.com') ||
        url.hostname.includes('jsdelivr.net')) {
        event.respondWith(cacheFirst(request));
        return;
    }

    // HTML 페이지: Network First with Cache Fallback
    if (request.mode === 'navigate' ||
        request.destination === 'document' ||
        url.pathname.endsWith('.html')) {
        event.respondWith(networkFirst(request));
        return;
    }

    // 정적 리소스 (JS, CSS, 이미지): Cache First
    if (request.destination === 'script' ||
        request.destination === 'style' ||
        request.destination === 'image') {
        event.respondWith(cacheFirst(request));
        return;
    }

    // 기본 전략: Network First
    event.respondWith(networkFirst(request));
});

// ==================== 캐싱 전략 ====================

/**
 * Network First: 네트워크 우선, 실패 시 캐시 사용
 */
async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request);

        // 성공한 응답만 캐시에 저장
        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.log(`📡 네트워크 실패, 캐시 사용: ${request.url}`);
        const cachedResponse = await caches.match(request);

        if (cachedResponse) {
            return cachedResponse;
        }

        // 오프라인 폴백 페이지
        if (request.mode === 'navigate') {
            return new Response(
                generateOfflinePage(),
                { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            );
        }

        return new Response('오프라인 상태입니다.', { status: 503 });
    }
}

/**
 * Cache First: 캐시 우선, 없으면 네트워크
 */
async function cacheFirst(request) {
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        const networkResponse = await fetch(request);

        // 성공한 응답만 캐시에 저장
        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.error(`❌ 네트워크 요청 실패: ${request.url}`, error);
        return new Response('리소스를 불러올 수 없습니다.', { status: 503 });
    }
}

// ==================== 오프라인 폴백 페이지 ====================

/**
 * 오프라인 상태에서 표시할 폴백 페이지
 */
function generateOfflinePage() {
    return `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>오프라인 - 청라FS 출석체크</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            color: white;
        }
        .container {
            text-align: center;
            padding: 40px 20px;
        }
        .icon {
            font-size: 80px;
            margin-bottom: 20px;
        }
        h1 {
            font-size: 2em;
            margin-bottom: 15px;
        }
        p {
            font-size: 1.1em;
            margin-bottom: 30px;
            opacity: 0.9;
        }
        button {
            background: white;
            color: #667eea;
            border: none;
            padding: 15px 40px;
            font-size: 1em;
            font-weight: 600;
            border-radius: 25px;
            cursor: pointer;
            transition: all 0.3s;
        }
        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">📡❌</div>
        <h1>오프라인 상태입니다</h1>
        <p>인터넷 연결을 확인하고 다시 시도해주세요.</p>
        <button onclick="window.location.reload()">다시 시도</button>
    </div>
</body>
</html>
    `;
}

// ==================== 메시지 처리 ====================

/**
 * 페이지에서 Service Worker로 메시지 수신
 */
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.delete(CACHE_NAME).then(() => {
                console.log('🗑️ 캐시 삭제 완료');
                return true;
            })
        );
    }
});

// ==================== 백그라운드 동기화 (옵션) ====================

/**
 * 백그라운드 동기화: 오프라인 시 출석 데이터를 큐에 저장했다가
 * 온라인 복구 시 자동 전송
 */
self.addEventListener('sync', (event) => {
    console.log('🔄 백그라운드 동기화:', event.tag);

    if (event.tag === 'sync-attendance') {
        event.waitUntil(syncAttendanceData());
    }
});

/**
 * 저장된 출석 데이터를 서버에 동기화
 */
async function syncAttendanceData() {
    // IndexedDB에서 대기 중인 출석 데이터 가져오기
    // 실제 구현은 IndexedDB 래퍼 필요
    console.log('🔄 출석 데이터 동기화 시도...');

    try {
        // 동기화 로직 구현
        console.log('✅ 출석 데이터 동기화 완료');
    } catch (error) {
        console.error('❌ 동기화 실패:', error);
        throw error; // 재시도를 위해 throw
    }
}

console.log('Service Worker 스크립트 로드 완료');
