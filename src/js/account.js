const { ipcRenderer } = require('electron')
let logoutBtn = document.getElementById('logoutBtn');
let systemName = document.getElementById('systemName');
let displayName = document.getElementById('displayName');
let rankInfo = document.getElementById('rankInfo');
let updateBtn = document.getElementById('updateBtn');
let changePasswordBtn = document.getElementById('changePasswordBtn');
let editAccountBtnSubmitPassReset = document.getElementById('editAccountBtnSubmitPassReset');
let editAccountBtnDeleteUser = document.getElementById('editAccountBtnDeleteUser');

let createAccountForm = document.getElementById('createAccountForm');
let newAccountBtn = document.getElementById('newAccountBtn');
let newAccountDiv = document.getElementById('newAccountDiv');
let emailInput = document.getElementById('emailInput')
let displayNameInput = document.getElementById('displayNameInput')
let rankInput = document.getElementById('rankInput')
let saveDir = document.getElementById('saveDir')
let editSaveDir = document.getElementById('editSaveDir')
let editModalDirs = document.getElementById('editModalDirs')
let invWarnEMail = document.getElementById('invWarnEMail')
let editRenewTime = document.getElementById('editRenewTime')
let editRenewTimeBtn = document.getElementById('editRenewTimeBtn')
let editInvWarnEMail = document.getElementById('editInvWarnEMail')
let connectQuickBooksBtn = document.getElementById('connectQuickBooksBtn')
let connectQuickBooksDiv = document.getElementById('connectQuickBooksDiv')
let connectQuickBooksInput = document.getElementById('connectQuickBooksInput')
let quickBooksTestBtn = document.getElementById('quickBooksTestBtn')
let editRecieptTxt = document.getElementById('editRecieptTxt')
let editRegisterRecieptTxt = document.getElementById('editRegisterRecieptTxt')
let editRecieptTxtBtn = document.getElementById('editRecieptTxtBtn')
let editRegisterRecieptTxtBtn = document.getElementById('editRegisterRecieptTxtBtn')

let editAccountBtn = document.getElementById('editAccountBtn')
let editAccountForm = document.getElementById('editAccountForm')
let editAccountDiv = document.getElementById('editAccountDiv')
let employeeInput = document.getElementById('employeeInput')
let changeDisplayNameInput = document.getElementById('changeDisplayNameInput')
let changeRankInput = document.getElementById('changeRankInput')
let permissionViewProductsPage = document.getElementById('permissionViewProductsPage')
let permissionEditCategory = document.getElementById('permissionEditCategory')
let permissionEditProducts = document.getElementById('permissionEditProducts')
let permissionEditCoreProducts = document.getElementById('permissionEditCoreProducts')
let permissionEditDiscounts = document.getElementById('permissionEditDiscounts')
let permissionWaiveProducts = document.getElementById('permissionWaiveProducts')
let permissionEditSystemSettings = document.getElementById('permissionEditSystemSettings')
let permissionEditRegisters = document.getElementById('permissionEditRegisters')

let usersArray = Array();

let errorMsg = document.getElementById('errorMsg');
ipcRenderer.on('notification-system', (event, arg) => {
  window.scrollTo(0, 0);
  errorMsg.className = 'alert alert-' + arg[0]
  errorMsg.innerHTML = arg[1]
}) 

if (logoutBtn) {
  logoutBtn.addEventListener('click', function(){
    ipcRenderer.send('account-logout')
  })
}

if (updateBtn) {
  updateBtn.addEventListener('click', function(){
    ipcRenderer.send('request-update')
  })
}

if (document.getElementById('quickSaleBtn')) {
  document.getElementById('quickSaleBtn').addEventListener('click', function () {
    ipcRenderer.send('quick-sale')
  })
}

if (connectQuickBooksBtn) {
  let connectBtnClicked = false
  connectQuickBooksDiv.style.display = 'none'
  connectQuickBooksBtn.addEventListener('click', function () {
    if (connectBtnClicked) {
      connectBtnClicked = false
      connectQuickBooksDiv.style.display = 'none'
      ipcRenderer.send('quickbooks-login', connectQuickBooksInput.value)
    } else {
      connectBtnClicked = true
      connectQuickBooksDiv.style.display = ''
      ipcRenderer.send('quickbooks-connect')
    }
  })
}

if (quickBooksTestBtn) {
  quickBooksTestBtn.addEventListener('click', function () {
    ipcRenderer.send('quickbooks-test')
  })
}

if (changePasswordBtn) {
  changePasswordBtn.addEventListener('click', function(){
    ipcRenderer.send('account-change-password')
  })
}

if (editAccountBtnSubmitPassReset) {
  editAccountBtnSubmitPassReset.style.display = 'none';
  editAccountBtnSubmitPassReset.addEventListener('click', function(){
    ipcRenderer.send('account-change-password', Array(employeeInput.value))
  })
}

if (editAccountBtnDeleteUser) {
  editAccountBtnDeleteUser.style.display = 'none';
  editAccountBtnDeleteUser.addEventListener('click', function(){
    ipcRenderer.send('account-delete-user', Array(employeeInput.value))
  })
}

if (editSaveDir) {
  editSaveDir.addEventListener('click', function(){
    ipcRenderer.send('edit-save-dir')
  })
}

if (editInvWarnEMail) {
  editInvWarnEMail.addEventListener('click', function(){
    ipcRenderer.send('edit-invWarn', invWarnEMail.value)
  })
}

if (editRenewTimeBtn) {
  editRenewTimeBtn.addEventListener('click', function(){
    ipcRenderer.send('edit-renew-time', editRenewTime.value)
  })
}

if (editRecieptTxtBtn) {
  editRecieptTxtBtn.addEventListener('click', function(){
    ipcRenderer.send('edit-reciept', editRecieptTxt.value)
  })
}

if (editRegisterRecieptTxtBtn) {
  editRegisterRecieptTxtBtn.addEventListener('click', function(){
    ipcRenderer.send('edit-register-reciept', editRegisterRecieptTxt.value)
  })
}

if (newAccountBtn) {
  newAccountBtn.style.display = "none";
  newAccountDiv.style.display = "none";
  newAccountBtn.addEventListener('click', function(){
    newAccountDiv.style.display = "block";
    emailInput.focus();
  })
}

if (editAccountBtn) {
  editAccountBtn.style.display = "none";
  editAccountDiv.style.display = "none";
  editAccountBtn.addEventListener('click', function(){
    editAccountDiv.style.display = "block";
    ipcRenderer.send('request-users')
    employeeInput.focus();
  })
}

function formWasSubmitted(){
  ipcRenderer.send('account-create', Array(emailInput.value, displayNameInput.value, rankInput.value))
}

function formWasSubmitted2(){
  //RANK
  ipcRenderer.send('account-edit', Array(employeeInput.value, changeDisplayNameInput.value, changeRankInput.value, permissionViewProductsPage.checked, permissionEditCategory.checked, permissionEditProducts.checked, permissionEditDiscounts.checked, permissionWaiveProducts.checked, permissionEditCoreProducts.checked, permissionEditSystemSettings.checked, permissionEditRegisters.checked))
}

ipcRenderer.send('request-account')
ipcRenderer.on('recieve-account', (event, arg) => {
  if (arg[3]) {
    connectQuickBooksBtn.disabled = true
    connectQuickBooksBtn.innerHTML = 'Connected!'
  } else {
    connectQuickBooksBtn.innerHTML = 'Connect'
    connectQuickBooksBtn.disabled = false
  }

  invWarnEMail.value = arg[2].invWarnEMail
  editRenewTime.value = arg[2].renewTime
  systemName.innerHTML = arg[2].businessName;
  displayName.innerHTML = 'Display Name: ' + arg[0];
  if (arg[1] == 1) {
    rankInfo.innerHTML = 'Rank: Manager';
    newAccountBtn.style.display = "block";
    editAccountBtn.style.display = "block";
  }else if (arg[1] == 0) {
    rankInfo.innerHTML = 'Rank: Employee';
  }else {
    rankInfo.innerHTML = 'Rank: Unknown';
  }
  editRecieptTxt.value = arg[2].reciept
  editRegisterRecieptTxt.value = arg[2].registerReciept

  if (!arg[2] || !Array.isArray(arg[2])) {
    saveDir.innerHTML = 'Report save directory: ' + arg[2].fileSaveSystemDir
  } else {
    arg[2].fileSaveSystem.forEach(theDir => {
      var opt = document.createElement('li');
      var opt2 = document.createElement('br')
      opt.setAttribute("theDir", theDir)
      opt.innerHTML = '<button class="btn btn-danger">' + theDir + '</button>';
      opt.addEventListener('click', function () {
        ipcRenderer.send('remove-dir', opt.getAttribute('theDir'))
        opt.style.display = 'none'
        opt2.style.display = 'none'
      })
      editModalDirs.appendChild(opt);
      editModalDirs.appendChild(opt2);
    });
  }
})

ipcRenderer.on('recieve-users', (event, arg) => {
  usersArray.push(arg)
  var nOpt = document.createElement('option');
  nOpt.value = arg[0];
  nOpt.innerHTML = arg[1].displayName;
  employeeInput.appendChild(nOpt);
 })


if (employeeInput) {
  employeeInput.addEventListener('change', function(){
    //RANK
    usersArray.forEach(function (value, i) {
      if (employeeInput.value) {
        editAccountBtnSubmitPassReset.style.display = '';
        editAccountBtnDeleteUser.style.display = '';
      }else{
        editAccountBtnSubmitPassReset.style.display = 'none';
        editAccountBtnDeleteUser.style.display = 'none';
      }
      if (employeeInput.value == value[0]) {
        changeDisplayNameInput.value = value[1].displayName
        changeRankInput.value = value[1].rank
        permissionViewProductsPage.checked = value[1].permissionViewProductsPage
        permissionEditCategory.checked = value[1].permissionEditCategory
        permissionEditProducts.checked = value[1].permissionEditProducts
        permissionEditDiscounts.checked = value[1].permissionEditDiscounts
        permissionWaiveProducts.checked = value[1].permissionWaiveProducts
        permissionEditCoreProducts.checked = value[1].permissionEditCoreProducts
        permissionEditSystemSettings.checked = value[1].permissionEditSystemSettings
        permissionEditRegisters.checked = value[1].permissionEditRegisters
      }else if (!employeeInput.value) {
        changeDisplayNameInput.value = ""
        changeRankInput.value = ""
        permissionViewProductsPage.checked = false
        permissionEditCategory.checked = false
        permissionEditProducts.checked = false
        permissionEditDiscounts.checked = false
        permissionWaiveProducts.checked = false
        permissionEditCoreProducts.checked = false
        permissionEditSystemSettings.checked = false
        permissionEditRegisters.checked = false
      }{

      }
    });
  })
}

ipcRenderer.on('quickbooks-test-test', (event, arg) => {

})

ipcRenderer.on('account-edit-success', (event, arg) => {
  var i, L = employeeInput.options.length - 1;
  for(i = L; i >= 0; i--) {
     employeeInput.remove(i);
  }
  var nOpt = document.createElement('option');
  nOpt.value = "";
  nOpt.innerHTML = "---";
  employeeInput.appendChild(nOpt);
  changeDisplayNameInput.value = "";
  changeRankInput.value = "";
  editAccountForm.reset()
  editAccountDiv.style.display = "none";
})