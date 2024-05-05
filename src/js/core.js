const { ipcRenderer } = require('electron')
let errorMsg = document.getElementById('errorMsg');
let logoutBtn = document.getElementById('logoutBtn');
let quickSaleBtn = document.getElementById('quickSaleBtn')
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

if (quickSaleBtn) {
  quickSaleBtn.addEventListener('click', function () {
    ipcRenderer.send('quick-sale')
  })
}

if (errorMsg) {
  setTimeout(() => {
    ipcRenderer.send('gather-notifications')    
  }, 1);
}

function openMembership() {
  let memID = document.getElementById('lastCreatedID').innerHTML
  ipcRenderer.send('open-membership', memID)
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

//  theClient.send('notification-system', Array(notificationType, notificationMsg, theNotSecs, theNotificationID))

ipcRenderer.on('notification-system', (event, arg) => {
  notificationSystem(arg[0], arg[1], arg[2], arg[3])
}) 

ipcRenderer.on('notification-system-remove', (event, arg) => {
  document.querySelector('[notificationID="' + arg + '"]').remove();
})

function notificationSystem(notificationType, notificationMsg, theNotSecs, theNotificationID) {
  if (document.getElementById('cermsLogo')) {
    document.getElementById('cermsLogo').style.display = 'none'
  }
  let theDiv = document.createElement('div')
  theDiv.className = 'alert alert-' + notificationType + ' alert-dismissible'
  theDiv.innerHTML = notificationMsg + ' <button id="closeNotification' + theNotificationID + '" notificationIDBtn=' + theNotificationID + ' type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>'
  theDiv.setAttribute('role', 'alert')
  theDiv.setAttribute('notificationID', theNotificationID)
  errorMsg.appendChild(theDiv)

  document.getElementById('closeNotification' + theNotificationID).addEventListener('click', function () {
    ipcRenderer.send('notification-system-remove-id', theNotificationID)
  })

  if (theNotSecs) {
    setTimeout(() => {
      document.querySelector('[notificationID="' + theNotificationID + '"]').remove();          
    }, theNotSecs);
  }
}
