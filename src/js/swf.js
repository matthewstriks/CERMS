const { ipcRenderer } = require('electron')
let sigImageData = document.getElementById('sigImageData')
let finalBtn = document.getElementById("finalBtn")
ipcRenderer.send('uploadSignature')

let theProductID;
let firebaseConfig

function uploadSignature(base64Data){
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
