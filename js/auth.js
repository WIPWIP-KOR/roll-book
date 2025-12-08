// js/auth.js (수정된 최종 버전)

// ⚠️ Project B의 배포 URL로 변경하세요! (액세스 권한: 모든 사용자)
const ADMIN_GAS_URL = 'https://script.google.com/macros/s/AKfycbx7nFQIab3dkiIbNuxWkj1ik2aey96pyDF_tdazMjPH5ToDEiyTOPB1flgXoUzcNvQ9/exec'; 

document.getElementById('authBtn').addEventListener('click', function() {
    const messageEl = document.getElementById('message');
    messageEl.textContent = '인증 확인 중...';
    
    // 버튼 비활성화
    this.disabled = true;

    // Project B의 Code.gs에 checkAuth 액션을 요청합니다.
    fetch(`${ADMIN_GAS_URL}?action=checkAuth`)
        .then(response => {
            if (!response.ok) {
                // HTTP 오류 (400, 500 등) 발생 시
                throw new Error('GAS 통신 오류가 발생했습니다.');
            }
            return response.json(); 
        })
        .then(data => {
            if (data.success) {
                // ✅ 관리자 인증 성공: 성공 시에만 admin.html로 이동
                messageEl.style.color = 'green';
                messageEl.textContent = `인증 성공! 관리자 (${data.email})로 확인되었습니다. 페이지를 이동합니다.`;
                setTimeout(() => {
                    // admin.html이 정적으로 호스팅되었다고 가정하고 이동
                    window.location.href = 'admin.html'; 
                }, 1000);
            } else {
                // ❌ GAS에서 'success: false'를 리턴한 경우 (이메일 불일치)
                messageEl.style.color = 'red';
                messageEl.textContent = `❌ 접근 거부: 현재 계정 (${data.email})은 관리자 권한이 없습니다.`;
            }
            document.getElementById('authBtn').disabled = false;
        })
        .catch(error => {
            // 통신 오류, Google 로그인 필요, JSON 파싱 오류 등이 발생한 경우
            messageEl.style.color = 'red';
            messageEl.textContent = '인증 과정에 문제가 발생했습니다. Google 계정 로그인 상태를 확인해주세요.';
            console.error('인증 요청 에러:', error);
            document.getElementById('authBtn').disabled = false;
        });
});