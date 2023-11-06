const { ipcRenderer } = require('electron')
let printBtn = document.getElementById('printBtn')
let emailBtn = document.getElementById('emailBtn')
let pandeBtn = document.getElementById('pandeBtn')
let closeBtn = document.getElementById('closeBtn')
let inputEmail = document.getElementById('inputEmail')
let submitBtn = document.getElementById('submitBtn')
let pandeConfirmed = false

let errorMsg = document.getElementById('errorMsg');
ipcRenderer.on('notification-system', (event, arg) => {
    errorMsg.className = 'alert alert-' + arg[0]
    errorMsg.innerHTML = arg[1]
}) 

printBtn.addEventListener('click', function(){
    ipcRenderer.send('reciept-choice-print')
})

emailBtn.addEventListener('click', function(){
    pandeConfirmed = false
    inputEmail.style.display = ''
    submitBtn.style.display = ''

    printBtn.style.display = 'none'
    emailBtn.style.display = 'none'
    pandeBtn.style.display = 'none'
})

pandeBtn.addEventListener('click', function(){
    inputEmail.style.display = ''
    submitBtn.style.display = ''
    pandeConfirmed = true
    printBtn.style.display = 'none'
    emailBtn.style.display = 'none'
    pandeBtn.style.display = 'none'
})

closeBtn.addEventListener('click', function(){
    ipcRenderer.send('reciept-choice-close')
})

if (inputEmail) {
    inputEmail.style.display = 'none'
    submitBtn.style.display = 'none'
}

submitBtn.addEventListener('click', function(){
    if (pandeConfirmed) {
        ipcRenderer.send('reciept-choice-pande', inputEmail.value)        
    }else{
        ipcRenderer.send('reciept-choice-email', inputEmail.value)
    }
})
