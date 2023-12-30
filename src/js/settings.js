let displayDiv = document.getElementById('displayDiv')
let editDiv = document.getElementById('editDiv')
let displayName = document.getElementById('displayName')
let displayNameEdit = document.getElementById('displayNameEdit')
let roleTxt = document.getElementById('roleTxt')
let emailTxt = document.getElementById('emailTxt')
let editEmail = document.getElementById('editEmail')
let passwordResetBtn = document.getElementById('passwordResetBtn')
let editAccountBtn = document.getElementById('editAccountBtn')
let saveAccountBtn = document.getElementById('saveAccountBtn')
let cancelBtn = document.getElementById('cancelBtn')

if (displayDiv) {
    editDiv.style.display = 'none'
}

editAccountBtn.addEventListener('click', function(){
    editDiv.style.display = ''
    displayDiv.style.display = 'none'
})

saveAccountBtn.addEventListener('click', function(){

})

cancelBtn.addEventListener('click', function(){
    editDiv.style.display = 'none'
    displayDiv.style.display = ''
})

ipcRenderer.send('request-account')

ipcRenderer.on('recieve-account2', (event, arg) => {
    console.log(arg);
    displayName.innerHTML = arg[0].displayName
    displayNameEdit.value = arg[0].displayName
    if (arg[0].rank == '1') {
        roleTxt.innerHTML = "Manager"        
    } else {
        roleTxt.innerHTML = "Employee"        
    }
    emailTxt.innerHTML = arg[0].email
    editEmail.value = arg[0].email
})