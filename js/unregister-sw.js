/**
 * 서비스 워커 등록 해제 스크립트
 * 기존에 등록된 서비스 워커를 제거합니다
 */

(function() {
    'use strict';

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function(registrations) {
            if (registrations.length === 0) {
                console.log('✅ 등록된 서비스 워커가 없습니다.');
                return;
            }

            console.log(`🔍 ${registrations.length}개의 서비스 워커를 찾았습니다.`);

            registrations.forEach(function(registration) {
                registration.unregister().then(function(success) {
                    if (success) {
                        console.log('✅ 서비스 워커 등록 해제 성공:', registration.scope);
                    } else {
                        console.log('⚠️ 서비스 워커 등록 해제 실패:', registration.scope);
                    }
                });
            });

            // 캐시도 모두 삭제
            if ('caches' in window) {
                caches.keys().then(function(cacheNames) {
                    return Promise.all(
                        cacheNames.map(function(cacheName) {
                            console.log('🗑️ 캐시 삭제:', cacheName);
                            return caches.delete(cacheName);
                        })
                    );
                }).then(function() {
                    console.log('✅ 모든 서비스 워커 캐시 삭제 완료');
                });
            }
        });
    }
})();
