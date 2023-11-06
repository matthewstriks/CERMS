const { ipcRenderer } = require('electron')
let inputEMail = document.getElementById('inputEMail');
let inputPassword = document.getElementById('inputPassword');
let loginForm = document.getElementById('loginForm');
let resetPassword = document.getElementById('resetPassword');

let errorMsg = document.getElementById('errorMsg');
ipcRenderer.on('notification-system', (event, arg) => {
  errorMsg.className = 'alert alert-' + arg[0]
  errorMsg.innerHTML = arg[1]
}) 

if (loginForm) {
  ipcRenderer.send('account-auto-login')
  loginForm.addEventListener('submit', function(){
  })  
}

function loginFormWasSubmitted(){
  ipcRenderer.send('account-login', Array(inputEMail.value, inputPassword.value))
}

if(resetPassword){
  resetPassword.addEventListener('click', function(){
    if (inputEMail.value == "") {
      let theError = 'Please put in your email!'
      errorMsg.className = 'alert alert-danger'
      errorMsg.innerHTML = theError;
    }else{
      ipcRenderer.send('account-change-password', inputEMail.value)
    }
  })
}

if(inputEMail){
  inputEMail.focus()
}