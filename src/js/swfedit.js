const { ipcRenderer } = require('electron')
let editDiv = document.getElementById('editDiv')
let viewDiv = document.getElementById('viewDiv')
let theSignature = document.getElementById('theSignature')
let finalBtn = document.getElementById("finalBtn")

let theProductID;
let firebaseConfig

if (editDiv) {
    editDiv.style.display = ''
}

function uploadSignature(base64Data) {
    console.log(base64Data);
    ipcRenderer.send('uploadSignatureBase64', base64Data)
    console.log('hello');
}

if (finalBtn) {
    finalBtn.addEventListener("click", function () {
        setTimeout(() => {
        }, 1000);
    });
}

ipcRenderer.on('uploadSignature-return', (event, arg) => {
    firebaseConfig = arg[0]
    firebase.initializeApp(firebaseConfig);

    document.getElementById('pTxt').innerHTML = 'Upload signature for member ID: ' + arg[1]

    theProductID = arg[1]
})

ipcRenderer.send('esign-opened')

ipcRenderer.on('esign-edit', (event, arg) => {
    console.log('Ran');
    console.log(arg);
    editDiv.style.display = 'none'
    viewDiv.style.display = ''
    theSignature.src = arg[1]
})
