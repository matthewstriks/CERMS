let inputEMail = document.getElementById('inputEMail');
let inputPassword = document.getElementById('inputPassword');
let loginForm = document.getElementById('loginForm');
let resetPassword = document.getElementById('resetPassword');

if (loginForm) {
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