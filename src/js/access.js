const { ipcRenderer } = require('electron')
let inputAccess = document.getElementById('inputAccess');
let accessForm = document.getElementById('accessForm');
let accessBtn = document.getElementById('accessBtn');

let errorMsg = document.getElementById('errorMsg');
ipcRenderer.on('notification-system', (event, arg) => {
    errorMsg.className = 'alert alert-' + arg[0]
    errorMsg.innerHTML = arg[1]
})

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