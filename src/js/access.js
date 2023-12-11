let inputAccess = document.getElementById('inputAccess');
let accessForm = document.getElementById('accessForm');
let accessBtn = document.getElementById('accessBtn');

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