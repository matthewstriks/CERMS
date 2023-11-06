const { ipcRenderer } = require('electron')
let logoutBtn = document.getElementById('logoutBtn');

let errorMsg = document.getElementById('errorMsg');
ipcRenderer.on('notification-system', (event, arg) => {
  errorMsg.className = 'alert alert-' + arg[0]
  errorMsg.innerHTML = arg[1]
}) 

if (logoutBtn) {
  logoutBtn.addEventListener('click', function(){
    ipcRenderer.send('account-logout')
  })
}
