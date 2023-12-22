const { ipcRenderer } = require('electron')
let errorMsg = document.getElementById('errorMsg');
let logoutBtn = document.getElementById('logoutBtn');
let darkModeToggle = document.getElementById('darkModeToggle');
let darkMode = false

if (logoutBtn) {
  logoutBtn.addEventListener('click', function(){
    ipcRenderer.send('account-logout')
  })
}

if (darkModeToggle) {
  ipcRenderer.send('get-dark-mode')  
  darkModeToggle.addEventListener('click', function(){
    if (darkMode) {
      darkMode = false
      document.querySelector('html').setAttribute('data-bs-theme', '')      
      ipcRenderer.send('change-dark-mode', darkMode)
    } else {
      darkMode = true
      document.querySelector('html').setAttribute('data-bs-theme', 'dark')      
      ipcRenderer.send('change-dark-mode', darkMode)
    }
  })
}

ipcRenderer.on('recieve-dark-mode', (event, arg) => {
  if (arg) {
    darkMode = true
    document.querySelector('html').setAttribute('data-bs-theme', 'dark')
  } else {
    darkMode = false
    document.querySelector('html').setAttribute('data-bs-theme', '')
  }
})

ipcRenderer.on('notification-system', (event, arg) => {
  if (document.getElementById('cermsLogo')) {
    document.getElementById('cermsLogo').style.display = 'none'
  }
  let theDiv = document.createElement('div')
  theDiv.className = 'alert alert-' + arg[0] + ' alert-dismissible'
  theDiv.innerHTML = arg[1] + ' <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>'
  theDiv.setAttribute('role', 'alert')
  errorMsg.appendChild(theDiv)
  setTimeout(() => {
    theDiv.remove()
    console.log(errorMsg.innerHTML);
    if (!errorMsg.innerHTML.includes('div') && document.getElementById('cermsLogo')) {
      document.getElementById('cermsLogo').style.display = ''      
    }
  }, 5000);
}) 
