const { ipcRenderer } = require('electron')
let errorMsg = document.getElementById('errorMsg');
let logoutBtn = document.getElementById('logoutBtn');

if (logoutBtn) {
  logoutBtn.addEventListener('click', function(){
    ipcRenderer.send('account-logout')
  })
}

ipcRenderer.on('notification-system', (event, arg) => {
    let theDiv = document.createElement('div')
    theDiv.className = 'alert alert-' + arg[0] + ' alert-dismissible'
    theDiv.innerHTML = arg[1] + ' <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>'
    theDiv.setAttribute('role', 'alert')
    errorMsg.appendChild(theDiv)
    setTimeout(() => {
        theDiv.remove()
    }, 5000);
}) 
