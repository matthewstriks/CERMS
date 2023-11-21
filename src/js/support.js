const { ipcRenderer } = require('electron')

let githubLink = document.getElementById('githubLink')


let errorMsg = document.getElementById('errorMsg');
let logoutBtn = document.getElementById('logoutBtn');

if (githubLink) {
  githubLink.addEventListener('click', function(){
    ipcRenderer.send('github-link')
  })
}

ipcRenderer.on('notification-system', (event, arg) => {
  errorMsg.className = 'alert alert-' + arg[0]
  errorMsg.innerHTML = arg[1]
}) 

if (logoutBtn) {
  logoutBtn.addEventListener('click', function(){
    ipcRenderer.send('account-logout')
  })
}
