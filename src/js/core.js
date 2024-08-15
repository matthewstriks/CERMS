const { ipcRenderer } = require('electron')
let darkMode = false
let fileName = location.href.split("/").slice(-1)

const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

// ADD PAGES TO NAV BAR HERE
let navBarPages = Array(
  Array('Home', 'home.html'),
  Array('Members', 'members.html'),
  Array('Quick Sale', 'order.html', 'quickSaleBtn'), // TODO: Make this quick sale function
  Array('Register', 'register.html'),
  Array('History', 'history.html'),
  Array('Analytics', 'analytics.html'),
  Array('Messages', 'messages.html')
)
// TO OPTIONS DROPDOWN
let navBarPagesOptions = Array(
  Array('Account', 'account.html'),
  Array('Products', 'products.html'),
  Array('Support', 'support.html')
)

function openMembership() {
  let memID = document.getElementById('lastCreatedID').innerHTML
  ipcRenderer.send('open-membership', memID)
}

function getTimestampString(date, time) {
  if (!date) {
    date = Date.now()
  }
  let theTimestamp = new Date(Math.floor(date));
  let theMonth = theTimestamp.getMonth() + 1;
  let theDate = theTimestamp.getDate();
  let theFullYear = theTimestamp.getFullYear();
  let theHours = theTimestamp.getHours();
  let theMins = theTimestamp.getMinutes();
  let theSecs = theTimestamp.getSeconds();
  let ampm = 'AM';

  if (theHours === 0) {
    theHours = 12;
  } else if (theHours > 12) {
    theHours -= 12;
    ampm = 'PM';
  } else if (theHours === 12) {
    ampm = 'PM';
  }

  // Add leading zeros to minutes and seconds if needed
  theMins = theMins < 10 ? '0' + theMins : theMins;
  theSecs = theSecs < 10 ? '0' + theSecs : theSecs;

  let theStringTime = theMonth + '/' + theDate + '/' + theFullYear;

  if (time) {
    theStringTime = theStringTime + ' ' + theHours + ':' + theMins + ':' + theSecs + ' ' + ampm;
  }
  return theStringTime;
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
  document.getElementById('errorMsg').appendChild(theDiv)

  document.getElementById('closeNotification' + theNotificationID).addEventListener('click', function () {
    ipcRenderer.send('notification-system-remove-id', theNotificationID)
  })

  if (theNotSecs) {
    setTimeout(() => {
      document.querySelector('[notificationID="' + theNotificationID + '"]').remove();          
    }, theNotSecs * 1000);
  }
}


if (fileName[0] != 'login.html' && fileName[0] != 'index.html' && fileName[0] != 'access.html') {
  // Create NavBar for every page (except above)
  let navBarBr = document.createElement('br')
  document.body.prepend(navBarBr)

  let navBarContainer = document.createElement('div')
  navBarContainer.classList = 'container'
  navBarContainer.id = 'navBarContainer'
  document.body.append(navBarContainer)

  let navBarContainerHR = document.createElement('hr')
  navBarContainer.appendChild(navBarContainerHR)

  let navBarNav = document.createElement('nav')
  navBarNav.classList = 'navbar navbar-expand-lg bg-body-tertiary'

  let navBarDiv = document.createElement('div')
  navBarDiv.classList = 'container-fluid'

  let navBarDivMain = document.createElement('a')
  navBarDivMain.classList = 'navbar-brand'
  navBarDivMain.href = 'home.html'
  navBarDivMain.innerHTML = 'CERMS'

  let navBarDivHomeBtn = document.createElement('button')
  navBarDivHomeBtn.classList = 'navbar-toggler'
  navBarDivHomeBtn.type = 'button'
  navBarDivHomeBtn.setAttribute('data-bs-toggle', 'collapse')
  navBarDivHomeBtn.setAttribute('data-bs-target', 'navBarSupportedContent')
  navBarDivHomeBtn.setAttribute('aria-controls', 'navBarSupportedContent')
  navBarDivHomeBtn.setAttribute('aria-expanded', 'false')
  navBarDivHomeBtn.setAttribute('aria-label', 'Toggle navigation')

  let navBarDivHomeBtnSpan = document.createElement('span')
  navBarDivHomeBtnSpan.classList = 'navbar-toggler-icon'
  navBarDivHomeBtn.appendChild(navBarDivHomeBtnSpan)

  let navBarDivBtnListDiv = document.createElement('div')
  navBarDivBtnListDiv.classList = 'collapse navbar-collapse'
  navBarDivBtnListDiv.id = 'navbarSupportedContent'

  let navBarBtnList = document.createElement('ul')
  navBarBtnList.classList = 'navbar-nav me-auto mb-2 mb-lg-0'
  navBarDivBtnListDiv.appendChild(navBarBtnList)

  navBarPages.forEach(page => {
    let navBarBtnListList = document.createElement('li')
    navBarBtnListList.classList = 'nav-item'
    navBarBtnList.appendChild(navBarBtnListList)

    let navBarBtnListBtn = document.createElement('a')
    if (fileName[0] == page[1]) {
      navBarBtnListBtn.classList = 'nav-link active'
      navBarBtnListBtn.setAttribute('aria-current', 'page')
    } else {
      navBarBtnListBtn.classList = 'nav-link'
    }
    navBarBtnListBtn.innerHTML = page[0]
    if (page[2]) {
      navBarBtnListBtn.href = "#"
      navBarBtnListBtn.id = page[2]
    } else {
      navBarBtnListBtn.href = page[1]
    }
    navBarBtnListList.appendChild(navBarBtnListBtn)
  });

  let navBarBtnListEnd = document.createElement('ul')
  navBarBtnListEnd.classList = 'nav justify-content-end'
  navBarDivBtnListDiv.appendChild(navBarBtnListEnd)

  let navBarBtnListEndList = document.createElement('li')
  navBarBtnListEndList.classList = 'nav-item'
  navBarBtnListEnd.appendChild(navBarBtnListEndList)

  let navBarBtnListEndListDiv = document.createElement('div')
  navBarBtnListEndListDiv.classList = 'dropdown'
  navBarBtnListEndList.appendChild(navBarBtnListEndListDiv)

  let navBarBtnListEndListBtn = document.createElement('button')
  navBarBtnListEndListBtn.classList = 'btn btn-primary dropdown-toggle'
  navBarBtnListEndListBtn.type = 'button'
  navBarBtnListEndListBtn.id = 'dropdownMenuButton1'
  navBarBtnListEndListBtn.setAttribute('data-bs-toggle', 'dropdown')
  navBarBtnListEndListBtn.setAttribute('aria-expanded', 'false')
  navBarBtnListEndListBtn.innerHTML = 'Options'
  navBarBtnListEndListDiv.appendChild(navBarBtnListEndListBtn)

  let navBarBtnListEndListDropdownList = document.createElement('ul')
  navBarBtnListEndListDropdownList.classList = 'dropdown-menu'
  navBarBtnListEndListDropdownList.setAttribute('aria-labbelledby', 'dropdownMenuButton1')
  navBarBtnListEndListDiv.appendChild(navBarBtnListEndListDropdownList)

  let navBarBtnListEndListDropdownListDiv = document.createElement('div')
  navBarBtnListEndListDropdownListDiv.classList = 'container'
  navBarBtnListEndListDropdownList.appendChild(navBarBtnListEndListDropdownListDiv)

  let navBarPagesOptionsDiv = document.createElement('div')
  navBarPagesOptionsDiv.classList = 'btn-group-vertical'
  navBarBtnListEndListDropdownListDiv.appendChild(navBarPagesOptionsDiv)

  navBarPagesOptions.forEach(page => {
    let navBarPagesOptionsBtn = document.createElement('a')
    navBarPagesOptionsBtn.classList = 'btn btn-primary'
    navBarPagesOptionsBtn.innerHTML = page[0]
    if (page[2]) {
      navBarPagesOptionsBtn.id = page[2]
    } else {
      navBarPagesOptionsBtn.href = page[1]
    }
    navBarPagesOptionsDiv.appendChild(navBarPagesOptionsBtn)
  });

  let navBarPagesOptionsDLM = document.createElement('a')
  navBarPagesOptionsDLM.classList = 'btn btn-primary'
  navBarPagesOptionsDLM.innerHTML = "<i class='fa-solid fa-moon'></i >"
  navBarPagesOptionsDLM.id = 'darkModeToggle'
  navBarPagesOptionsDLM.setAttribute('role', 'button')
  navBarPagesOptionsDiv.appendChild(navBarPagesOptionsDLM)

  let navBarBtnListEndListDropdownListHr = document.createElement('hr')
  navBarBtnListEndListDropdownListDiv.appendChild(navBarBtnListEndListDropdownListHr)

  let navBarBtnListEndListDropdownListLogoutBtn = document.createElement('button')
  navBarBtnListEndListDropdownListLogoutBtn.classList = 'btn btn-danger'
  navBarBtnListEndListDropdownListLogoutBtn.type = 'button'
  navBarBtnListEndListDropdownListLogoutBtn.id = 'logoutBtn'
  navBarBtnListEndListDropdownListLogoutBtn.innerHTML = "Logout"
  navBarBtnListEndListDropdownListLogoutBtn.addEventListener('click', function () {
    ipcRenderer.send('logout')
  })

  navBarBtnListEndListDropdownListDiv.appendChild(navBarBtnListEndListDropdownListLogoutBtn)

  navBarDiv.appendChild(navBarDivMain)
  navBarDiv.appendChild(navBarDivHomeBtn)
  navBarDiv.appendChild(navBarDivBtnListDiv)
  navBarNav.appendChild(navBarDiv)
  navBarContainer.appendChild(navBarNav)

  let navBarContainerHR2 = document.createElement('hr')
  navBarContainer.appendChild(navBarContainerHR2)

  let errorMsgDiv = document.createElement('div')
  errorMsgDiv.classList = 'container'
  document.body.append(errorMsgDiv)

  let errorMsg = document.createElement('div')
  errorMsg.setAttribute('role', 'alert')
  errorMsg.id = 'errorMsg'
  errorMsgDiv.appendChild(errorMsg)

  let darkModeToggle = document.getElementById('darkModeToggle');
  if (darkModeToggle) {
    ipcRenderer.send('get-dark-mode')
    darkModeToggle.addEventListener('click', function () {
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

  let quickSaleBtn = document.getElementById('quickSaleBtn')
  if (quickSaleBtn) {
    quickSaleBtn.addEventListener('click', function () {
      ipcRenderer.send('quick-sale')
    })
  }
  ipcRenderer.send('gather-notifications')    
  let logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      ipcRenderer.send('account-logout')
    })
  }

}
