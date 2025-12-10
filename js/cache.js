/**
 * 캐싱 유틸리티 모듈
 * localStorage와 IndexedDB를 활용한 고성능 캐싱 시스템
 */

const CacheManager = (function() {
    'use strict';

    // ==================== 설정 ====================

    const DEFAULT_TTL = 5 * 60 * 1000; // 5분
    const CACHE_VERSION = 'v1';

    // 캐시 키 정의
    const CACHE_KEYS = {
        MEMBERS: 'members',
        TODAY_ATTENDANCE: 'today_attendance',
        LOCATION: 'location',
        STATS: 'stats', // year를 suffix로 사용
        AVAILABLE_YEARS: 'available_years'
    };

    // TTL 설정 (밀리초)
    const TTL_CONFIG = {
        [CACHE_KEYS.MEMBERS]: 10 * 60 * 1000,          // 10분
        [CACHE_KEYS.TODAY_ATTENDANCE]: 2 * 60 * 1000,  // 2분
        [CACHE_KEYS.LOCATION]: 60 * 60 * 1000,         // 1시간
        [CACHE_KEYS.STATS]: 30 * 60 * 1000,            // 30분
        [CACHE_KEYS.AVAILABLE_YEARS]: 60 * 60 * 1000   // 1시간
    };

    // ==================== localStorage 캐싱 ====================

    /**
     * 캐시 키 생성 (버전 포함)
     */
    function getCacheKey(key, suffix = '') {
        return `${CACHE_VERSION}_${key}${suffix ? '_' + suffix : ''}`;
    }

    /**
     * localStorage에 데이터 저장 (TTL 포함)
     */
    function set(key, data, customTTL = null) {
        try {
            const ttl = customTTL || TTL_CONFIG[key] || DEFAULT_TTL;
            const cacheData = {
                data: data,
                timestamp: Date.now(),
                ttl: ttl
            };

            const cacheKey = getCacheKey(key);
            localStorage.setItem(cacheKey, JSON.stringify(cacheData));

            console.log(`✅ 캐시 저장: ${cacheKey} (TTL: ${ttl / 1000}초)`);
            return true;
        } catch (error) {
            console.error(`❌ 캐시 저장 실패 (${key}):`, error);
            // localStorage 용량 초과 시 오래된 캐시 정리
            if (error.name === 'QuotaExceededError') {
                clearExpired();
                // 재시도
                try {
                    localStorage.setItem(getCacheKey(key), JSON.stringify(cacheData));
                    return true;
                } catch (retryError) {
                    console.error('❌ 재시도 실패:', retryError);
                    return false;
                }
            }
            return false;
        }
    }

    /**
     * localStorage에서 데이터 가져오기
     */
    function get(key) {
        try {
            const cacheKey = getCacheKey(key);
            const cached = localStorage.getItem(cacheKey);

            if (!cached) {
                console.log(`ℹ️ 캐시 없음: ${cacheKey}`);
                return null;
            }

            const cacheData = JSON.parse(cached);
            const age = Date.now() - cacheData.timestamp;

            // TTL 확인
            if (age > cacheData.ttl) {
                console.log(`⏰ 캐시 만료: ${cacheKey} (경과: ${Math.floor(age / 1000)}초)`);
                localStorage.removeItem(cacheKey);
                return null;
            }

            console.log(`✅ 캐시 히트: ${cacheKey} (남은 시간: ${Math.floor((cacheData.ttl - age) / 1000)}초)`);
            return cacheData.data;
        } catch (error) {
            console.error(`❌ 캐시 읽기 실패 (${key}):`, error);
            return null;
        }
    }

    /**
     * 특정 캐시 삭제
     */
    function remove(key) {
        try {
            const cacheKey = getCacheKey(key);
            localStorage.removeItem(cacheKey);
            console.log(`🗑️ 캐시 삭제: ${cacheKey}`);
            return true;
        } catch (error) {
            console.error(`❌ 캐시 삭제 실패 (${key}):`, error);
            return false;
        }
    }

    /**
     * 만료된 캐시 정리
     */
    function clearExpired() {
        try {
            let removedCount = 0;
            const keys = Object.keys(localStorage);

            keys.forEach(key => {
                if (key.startsWith(CACHE_VERSION + '_')) {
                    try {
                        const cached = localStorage.getItem(key);
                        if (cached) {
                            const cacheData = JSON.parse(cached);
                            const age = Date.now() - cacheData.timestamp;

                            if (age > cacheData.ttl) {
                                localStorage.removeItem(key);
                                removedCount++;
                            }
                        }
                    } catch (e) {
                        // 파싱 실패 시 제거
                        localStorage.removeItem(key);
                        removedCount++;
                    }
                }
            });

            console.log(`🧹 만료된 캐시 정리 완료: ${removedCount}개 제거`);
            return removedCount;
        } catch (error) {
            console.error('❌ 캐시 정리 실패:', error);
            return 0;
        }
    }

    /**
     * 모든 캐시 삭제
     */
    function clearAll() {
        try {
            const keys = Object.keys(localStorage);
            let removedCount = 0;

            keys.forEach(key => {
                if (key.startsWith(CACHE_VERSION + '_')) {
                    localStorage.removeItem(key);
                    removedCount++;
                }
            });

            console.log(`🗑️ 전체 캐시 삭제 완료: ${removedCount}개 제거`);
            return removedCount;
        } catch (error) {
            console.error('❌ 전체 캐시 삭제 실패:', error);
            return 0;
        }
    }

    /**
     * 캐시 통계 출력
     */
    function getStats() {
        try {
            const keys = Object.keys(localStorage);
            const cacheKeys = keys.filter(key => key.startsWith(CACHE_VERSION + '_'));

            const stats = {
                total: cacheKeys.length,
                valid: 0,
                expired: 0,
                totalSize: 0
            };

            cacheKeys.forEach(key => {
                try {
                    const cached = localStorage.getItem(key);
                    stats.totalSize += cached ? cached.length : 0;

                    if (cached) {
                        const cacheData = JSON.parse(cached);
                        const age = Date.now() - cacheData.timestamp;

                        if (age <= cacheData.ttl) {
                            stats.valid++;
                        } else {
                            stats.expired++;
                        }
                    }
                } catch (e) {
                    stats.expired++;
                }
            });

            console.log('📊 캐시 통계:', stats);
            return stats;
        } catch (error) {
            console.error('❌ 캐시 통계 조회 실패:', error);
            return null;
        }
    }

    // ==================== IndexedDB 캐싱 (대용량 데이터용) ====================

    let db = null;
    const DB_NAME = 'AttendanceDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'cache';

    /**
     * IndexedDB 초기화
     */
    function initIndexedDB() {
        return new Promise((resolve, reject) => {
            if (db) {
                resolve(db);
                return;
            }

            if (!window.indexedDB) {
                console.warn('⚠️ IndexedDB가 지원되지 않는 브라우저입니다.');
                reject(new Error('IndexedDB not supported'));
                return;
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('❌ IndexedDB 열기 실패:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                db = request.result;
                console.log('✅ IndexedDB 초기화 완료');
                resolve(db);
            };

            request.onupgradeneeded = (event) => {
                db = event.target.result;

                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
                    objectStore.createIndex('timestamp', 'timestamp', { unique: false });
                    console.log('✅ IndexedDB 스토어 생성 완료');
                }
            };
        });
    }

    /**
     * IndexedDB에 데이터 저장
     */
    async function setIndexedDB(key, data, customTTL = null) {
        try {
            const database = await initIndexedDB();
            const ttl = customTTL || TTL_CONFIG[key] || DEFAULT_TTL;

            const transaction = database.transaction([STORE_NAME], 'readwrite');
            const objectStore = transaction.objectStore(STORE_NAME);

            const cacheData = {
                key: getCacheKey(key),
                data: data,
                timestamp: Date.now(),
                ttl: ttl
            };

            const request = objectStore.put(cacheData);

            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    console.log(`✅ IndexedDB 저장: ${key} (TTL: ${ttl / 1000}초)`);
                    resolve(true);
                };

                request.onerror = () => {
                    console.error(`❌ IndexedDB 저장 실패 (${key}):`, request.error);
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error(`❌ IndexedDB 저장 오류 (${key}):`, error);
            return false;
        }
    }

    /**
     * IndexedDB에서 데이터 가져오기
     */
    async function getIndexedDB(key) {
        try {
            const database = await initIndexedDB();
            const transaction = database.transaction([STORE_NAME], 'readonly');
            const objectStore = transaction.objectStore(STORE_NAME);

            const request = objectStore.get(getCacheKey(key));

            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const cacheData = request.result;

                    if (!cacheData) {
                        console.log(`ℹ️ IndexedDB 캐시 없음: ${key}`);
                        resolve(null);
                        return;
                    }

                    const age = Date.now() - cacheData.timestamp;

                    // TTL 확인
                    if (age > cacheData.ttl) {
                        console.log(`⏰ IndexedDB 캐시 만료: ${key} (경과: ${Math.floor(age / 1000)}초)`);
                        removeIndexedDB(key); // 비동기로 삭제
                        resolve(null);
                        return;
                    }

                    console.log(`✅ IndexedDB 캐시 히트: ${key} (남은 시간: ${Math.floor((cacheData.ttl - age) / 1000)}초)`);
                    resolve(cacheData.data);
                };

                request.onerror = () => {
                    console.error(`❌ IndexedDB 읽기 실패 (${key}):`, request.error);
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error(`❌ IndexedDB 읽기 오류 (${key}):`, error);
            return null;
        }
    }

    /**
     * IndexedDB에서 캐시 삭제
     */
    async function removeIndexedDB(key) {
        try {
            const database = await initIndexedDB();
            const transaction = database.transaction([STORE_NAME], 'readwrite');
            const objectStore = transaction.objectStore(STORE_NAME);

            const request = objectStore.delete(getCacheKey(key));

            return new Promise((resolve) => {
                request.onsuccess = () => {
                    console.log(`🗑️ IndexedDB 캐시 삭제: ${key}`);
                    resolve(true);
                };

                request.onerror = () => {
                    console.error(`❌ IndexedDB 삭제 실패 (${key}):`, request.error);
                    resolve(false);
                };
            });
        } catch (error) {
            console.error(`❌ IndexedDB 삭제 오류 (${key}):`, error);
            return false;
        }
    }

    // ==================== 공개 API ====================

    return {
        // localStorage 캐싱
        set: set,
        get: get,
        remove: remove,
        clearExpired: clearExpired,
        clearAll: clearAll,
        getStats: getStats,

        // IndexedDB 캐싱 (대용량)
        setLarge: setIndexedDB,
        getLarge: getIndexedDB,
        removeLarge: removeIndexedDB,

        // 캐시 키
        KEYS: CACHE_KEYS
    };
})();

// 페이지 로드 시 만료된 캐시 자동 정리
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        CacheManager.clearExpired();
    });
} else {
    CacheManager.clearExpired();
}
