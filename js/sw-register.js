/**
 * Service Worker 등록 스크립트
 * 모든 HTML 파일에서 로드됩니다
 */

(function() {
    'use strict';

    // Service Worker 지원 확인
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            registerServiceWorker();
        });
    } else {
        console.warn('⚠️ 이 브라우저는 Service Worker를 지원하지 않습니다.');
    }

    /**
     * Service Worker 등록
     */
    async function registerServiceWorker() {
        try {
            const registration = await navigator.serviceWorker.register('/service-worker.js', {
                scope: '/'
            });

            console.log('✅ Service Worker 등록 성공:', registration.scope);

            // 업데이트 확인
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                console.log('🆕 새로운 Service Worker 발견');

                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('🔄 새 버전 사용 가능. 페이지를 새로고침하세요.');

                        // 사용자에게 알림 (옵션)
                        showUpdateNotification();
                    }
                });
            });

            // Service Worker 업데이트 주기적 확인 (1시간마다)
            setInterval(() => {
                registration.update();
            }, 60 * 60 * 1000);

        } catch (error) {
            console.error('❌ Service Worker 등록 실패:', error);
        }
    }

    /**
     * 업데이트 알림 표시
     */
    function showUpdateNotification() {
        // 기존 알림 제거
        const existing = document.getElementById('sw-update-notification');
        if (existing) {
            existing.remove();
        }

        // 알림 생성
        const notification = document.createElement('div');
        notification.id = 'sw-update-notification';
        notification.innerHTML = `
            <div style="
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: #333;
                color: white;
                padding: 15px 25px;
                border-radius: 8px;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
                z-index: 10000;
                display: flex;
                align-items: center;
                gap: 15px;
                animation: slideUp 0.3s ease-out;
            ">
                <span>🆕 새 버전이 있습니다!</span>
                <button onclick="window.location.reload()" style="
                    background: #667eea;
                    color: white;
                    border: none;
                    padding: 8px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-weight: 600;
                ">새로고침</button>
                <button onclick="this.parentElement.parentElement.remove()" style="
                    background: transparent;
                    color: white;
                    border: 1px solid white;
                    padding: 8px 15px;
                    border-radius: 4px;
                    cursor: pointer;
                ">나중에</button>
            </div>
            <style>
                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateX(-50%) translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(-50%) translateY(0);
                    }
                }
            </style>
        `;

        document.body.appendChild(notification);

        // 10초 후 자동 제거
        setTimeout(() => {
            notification.remove();
        }, 10000);
    }

    // 온라인/오프라인 상태 모니터링
    window.addEventListener('online', () => {
        console.log('✅ 온라인 상태로 전환');
        showConnectionStatus('온라인 상태입니다', 'success');
    });

    window.addEventListener('offline', () => {
        console.log('📡 오프라인 상태로 전환');
        showConnectionStatus('오프라인 상태입니다. 일부 기능이 제한될 수 있습니다.', 'warning');
    });

    /**
     * 연결 상태 알림 표시
     */
    function showConnectionStatus(message, type) {
        const existing = document.getElementById('connection-status');
        if (existing) {
            existing.remove();
        }

        const bgColor = type === 'success' ? '#4caf50' : '#ff9800';

        const status = document.createElement('div');
        status.id = 'connection-status';
        status.innerHTML = `
            <div style="
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: ${bgColor};
                color: white;
                padding: 12px 25px;
                border-radius: 8px;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
                z-index: 10000;
                animation: fadeInOut 3s ease-in-out;
            ">
                ${message}
            </div>
            <style>
                @keyframes fadeInOut {
                    0%, 100% { opacity: 0; }
                    10%, 90% { opacity: 1; }
                }
            </style>
        `;

        document.body.appendChild(status);

        setTimeout(() => {
            status.remove();
        }, 3000);
    }
})();
