ipcRenderer.send('uploadSignature')

let theProductID;
let firebaseConfig

document.getElementById("button2").addEventListener("click", function () {
    setTimeout(() => {
        var storage = firebase.storage().ref('/member-signatures/' + theProductID + '.png');
        // Base64 formatted string
        const message2 = '5b6p5Y+344GX44G+44GX44Gf77yB44GK44KB44Gn44Go44GG77yB';
        uploadString(storage, sigImageData.value, 'base64').then((snapshot) => {
            console.log(snapshot);
            console.log('Uploaded a base64 string!');
        });
        
    }, 1000);
    if (files.length != 0) {
        for (let i = 0; i < files.length; i++) {
            var upload = storage.put(files[i]);

            upload.on(
                "state_changed",
                function progress(snapshot) {
                    var percentage = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    document.getElementById("progress").innerHTML = percentage + '%';
                    document.getElementById("progress").setAttribute('style', "width: " + percentage + "%;");
                    document.getElementById("progress").setAttribute('aria-valuenow', percentage);
                    //                    document.getElementById("progress").value = percentage;
                },

                function error() {
                    alert("error uploading file");
                },

                function complete() {
                    document.getElementById(
                        "uploading"
                    ).innerHTML += `${files[i].name} uploaded <br />`;
                    getFileUrl('/member-files/' + theProductID + '-' + files[i].name)
                }
            );
        }
    } else {
        alert("No file chosen");
    }
});

function getFileUrl(filename) {
    var storage = firebase.storage().ref(filename);

    storage
        .getDownloadURL()
        .then(function (url) {
            ipcRenderer.send('uploadProductFile-complete', Array(theProductID, url, fileName.value, filename))
        })
        .catch(function (error) {
            console.log("error encountered");
        });
}

ipcRenderer.on('uploadSignature-return', (event, arg) => {
    firebaseConfig = arg[0]
    firebase.initializeApp(firebaseConfig);

    document.getElementById('pTxt').innerHTML = 'Upload signature for member ID: ' + arg[1]

    theProductID = arg[1]
})
