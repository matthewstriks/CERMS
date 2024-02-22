const { ipcRenderer } = require('electron')
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js';
let finalBtn = document.getElementById("finalBtn")
let btnControls = document.getElementById("btnControls")
let waiver = document.getElementById("waiver")
let signature = document.getElementById("signature")
ipcRenderer.send('uploadSignature')

let firebaseConfig;
let myStorage
let theProductID;
let theSystemAccess;

async function uploadSignature(){
    btnControls.style.display = "none"
    const element = document.getElementById('theBody');
    var opt = {
        margin: .5,
        filename: theProductID + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    let theFile = await html2pdf().set(opt).from(element).output('blob')
    console.log(theFile);

    const myPdfRef = ref(myStorage, '/member-signature-pdfs/' + theSystemAccess + '/' + theProductID + '.pdf');
    const upload = await uploadBytes(myPdfRef, theFile);
    getDownloadURL(myPdfRef)
        .then(async (url) => {
            ipcRenderer.send('uploadSignatureComplete', url)
        })

    waiver.style.display = 'none'
    signature.style.display = 'none'
}

document.getElementById('button2').addEventListener('click', function(){
    document.getElementById('button2').disabled = true
    setTimeout(() => {
        uploadSignature()        
    }, 1000);
})

if (finalBtn) {
    finalBtn.addEventListener("click", function () {
        setTimeout(() => {
        }, 1000);
    });        
}

ipcRenderer.on('uploadSignature-return', (event, arg) => {
    firebaseConfig = arg[0]
    const myApp = initializeApp(firebaseConfig);
    myStorage = getStorage(myApp);
    theProductID = arg[3]
    theSystemAccess = arg[5]

    let datetime = new Date().toLocaleString();
    waiver.innerHTML = arg[1] + '<br><hr><br><b>Member Name:</b> ' + arg[2] + '<br><br><b>Member ID:</b> ' + arg[3] + ' (' + arg[4] + ')<br><br><b>Timestamp:</b> ' + datetime + '<br><br>'
    theProductID = arg[3]
})
