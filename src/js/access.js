let inputAccess = document.getElementById('inputAccess');
let accessForm = document.getElementById('accessForm');
let accessBtn = document.getElementById('accessBtn');
let supportBtn = document.getElementById('supportBtn');

if (accessForm) {
    accessForm.addEventListener('submit', function () {
    })
}

function accessSubmitted() {
    ipcRenderer.send('account-access', inputAccess.value)
}

if (inputAccess) {
    inputAccess.focus()
}

if (supportBtn) {
    supportBtn.addEventListener('click', function () {
        ipcRenderer.send('support-btn')
    })
}